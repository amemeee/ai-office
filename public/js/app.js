import { api, streamChat } from './api.js';
import { Office } from './office.js';

// ---------- helpers ----------------------------------------------------------
const $ = (s) => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => c != null && el.append(c));
  return el;
};

const STATUS = {
  idle: 'Idle', working: 'Working', waiting_approval: 'Waiting for approval', error: 'Error', paused: 'Paused',
};
const TASK_STATUS = {
  queued: 'Queued', running: 'Running', awaiting_approval: 'Needs approval', approved: 'Approved',
  rejected: 'Rejected', done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
};
const fmtTime = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function toast(msg, kind = 'error') {
  const el = h('div', { class: `toast ${kind}`, text: msg });
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5000);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

/** Minimal, safe markdown: fenced code, inline code, bold. Builds DOM nodes (no innerHTML). */
function renderText(text) {
  const root = h('div', { class: 'md' });
  const parts = text.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf('\n');
      const lang = nl >= 0 ? part.slice(0, nl).trim() : '';
      const code = nl >= 0 ? part.slice(nl + 1) : part;
      const pre = h('pre', {}, h('code', { text: code.replace(/\n$/, '') }));
      const copy = h('button', { class: 'copy', type: 'button', text: lang ? `${lang} · copy` : 'copy',
        onclick: () => navigator.clipboard?.writeText(code).then(() => { copy.textContent = 'copied'; setTimeout(() => { copy.textContent = lang ? `${lang} · copy` : 'copy'; }, 1200); }) });
      root.append(h('div', { class: 'codeblock' }, copy, pre));
    } else if (part) {
      part.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).forEach((seg) => {
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) root.append(h('code', { text: seg.slice(1, -1) }));
        else if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) root.append(h('strong', { text: seg.slice(2, -2) }));
        else root.append(document.createTextNode(seg));
      });
    }
  });
  return root;
}

// ---------- state ----------------------------------------------------------------
const S = {
  agents: new Map(), tasks: new Map(), msgs: new Map(), chat: new Map(),
  health: null, integrations: [], selected: null, tab: 'chat',
};
const chatState = (id) => { if (!S.chat.has(id)) S.chat.set(id, { streaming: false, pending: '', error: null, ctl: null }); return S.chat.get(id); };

const office = new Office($('#stage'), { onSelect: (id) => selectAgent(id, 'chat') });

// ---------- top bar -----------------------------------------------------------------
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }, 1000);
$('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function renderChips() {
  const working = [...S.agents.values()].filter((a) => a.status === 'working').length;
  const act = $('#chip-activity');
  act.querySelector('span').textContent = `${working} working`;
  act.querySelector('i').className = working ? 'busy' : 'ok';
  const hl = S.health?.ollama;
  const chip = $('#chip-ollama');
  if (!hl) return;
  chip.querySelector('i').className = hl.online ? 'ok' : 'bad';
  chip.querySelector('span').textContent = hl.online ? `Ollama online · ${hl.defaultModel}` : 'Ollama offline';
  $('#offline').hidden = hl.online;
  if (hl.online && !hl.models.includes(hl.defaultModel)) {
    chip.querySelector('i').className = 'warn';
    chip.querySelector('span').textContent = `Model missing: ${hl.defaultModel}`;
  }
}

// ---------- roster (left) ---------------------------------------------------------
function renderRoster() {
  const list = $('#roster-list');
  list.replaceChildren(...[...S.agents.values()].map((a) => h('li', {},
    h('button', { class: `agent-row${S.selected === a.id ? ' active' : ''}`, type: 'button', onclick: () => selectAgent(a.id, 'chat') },
      h('span', { class: 'dept', text: a.department }),
      h('span', { class: 'who' }, h('i', { class: `dot s-${a.status}` }), h('b', { text: a.name }), h('span', { text: ` · ${a.role}` })),
      h('span', { class: 'sub', text: a.current_task ? a.current_task : STATUS[a.status] + (a.queued ? ` · ${a.queued} queued` : '') }),
    ))));
  $('#integrations').replaceChildren(...S.integrations.map((i) => h('li', { title: i.description },
    h('i', { class: `dot ${i.status === 'connected' ? 's-idle' : 's-paused'}` }), h('span', { text: ` ${i.name}` }), h('em', { text: i.status === 'connected' ? 'on' : 'planned' }))));
}

// ---------- right panel -----------------------------------------------------------------
const P = {}; // refs to current panel nodes

function selectAgent(id, tab = S.tab) {
  S.selected = id; S.tab = tab;
  office.select(id);
  renderRoster();
  buildPanel();
  if (window.matchMedia('(max-width: 1000px)').matches) $('#panel').scrollIntoView({ behavior: 'smooth' });
}

function buildPanel() {
  const panel = $('#panel');
  const a = S.agents.get(S.selected);
  if (!a) {
    panel.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'empty-art' }), h('p', { text: 'Nobody selected.' }), h('p', { class: 'muted', text: 'Click a character in the office, or pick an agent from the list.' })));
    return;
  }
  P.head = h('div', { class: 'head' });
  P.tabs = h('nav', { class: 'tabs', role: 'tablist' });
  P.body = h('div', { class: 'tab-body' });
  panel.replaceChildren(P.head, P.tabs, P.body);
  renderHead(); renderTabs(); renderBody(true);
  if (!S.tasks.has(a.id)) loadTasks(a.id);
}

function renderHead() {
  const a = S.agents.get(S.selected);
  if (!a || !P.head) return;
  P.head.replaceChildren(
    h('div', { class: 'who-line' },
      h('span', { class: `avatar a-${a.id}`, 'aria-hidden': 'true' }),
      h('div', { class: 'who-text' }, h('h3', { text: a.name }), h('p', { text: `${a.role} · ${a.department}` })),
      h('span', { class: `badge s-${a.status}`, text: STATUS[a.status] })),
    h('p', { class: 'now' }, h('b', { text: a.current_task ? 'Now: ' : a.status === 'error' ? 'Error: ' : 'Now: ' }),
      document.createTextNode(a.current_task || (a.status === 'error' ? a.last_error : a.status === 'waiting_approval' ? `${a.awaiting} task(s) waiting for your decision` : a.status === 'paused' ? 'Paused by you' : 'Nothing — free for a task'))),
    h('div', { class: 'controls' },
      a.paused
        ? h('button', { class: 'btn', type: 'button', onclick: guard(() => api(`/agents/${a.id}/resume`, { method: 'POST' })), text: '▶ Resume' })
        : h('button', { class: 'btn', type: 'button', onclick: guard(() => api(`/agents/${a.id}/pause`, { method: 'POST' })), text: '⏸ Pause' }),
      h('button', { class: 'btn danger', type: 'button', title: 'Abort current work and cancel queued tasks', onclick: guard(() => api(`/agents/${a.id}/stop`, { method: 'POST' })), text: '■ Stop' }),
      a.queued ? h('span', { class: 'muted', text: `${a.queued} queued` }) : null));
}

function renderTabs() {
  const a = S.agents.get(S.selected);
  const defs = [['chat', 'Chat'], ['tasks', 'Tasks'], ['profile', 'Profile']];
  P.tabs.replaceChildren(...defs.map(([k, label]) => h('button', {
    type: 'button', role: 'tab', class: S.tab === k ? 'active' : '', 'aria-selected': S.tab === k,
    onclick: () => { S.tab = k; renderTabs(); renderBody(true); },
  }, label, k === 'tasks' && a.awaiting ? h('span', { class: 'pill', text: a.awaiting }) : null)));
}

function renderBody(full) {
  if (!P.body) return;
  if (S.tab === 'chat') renderChat(full);
  else if (S.tab === 'tasks') renderTasks(full);
  else renderProfile();
}

// ---- chat -------------------------------------------------------------------------
async function loadMessages(id) {
  if (!S.msgs.has(id)) S.msgs.set(id, await api(`/agents/${id}/messages`));
}

function msgNode(role, content, extra = '') {
  return h('div', { class: `msg ${role} ${extra}` }, h('div', { class: 'who', text: role === 'user' ? 'You' : S.agents.get(S.selected)?.name }), role === 'user' ? h('div', { class: 'md', text: content }) : renderText(content));
}

function chatBlocked(a) {
  const cs = chatState(a.id);
  if (cs.streaming) return null;
  if (a.paused) return `${a.name} is paused. Resume to chat.`;
  if (a.status === 'working') return `${a.name} is busy: ${a.current_task}`;
  return null;
}

async function renderChat(full) {
  const a = S.agents.get(S.selected);
  if (!a) return;
  const id = a.id;
  if (full) {
    P.log = h('div', { class: 'log', 'aria-live': 'polite' });
    P.input = h('textarea', { rows: '2', maxlength: '20000', placeholder: `Message ${a.name}…`, onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } } });
    P.send = h('button', { class: 'btn primary', type: 'button', onclick: () => (chatState(id).streaming ? chatState(id).ctl.abort() : sendChat()) });
    P.note = h('div', { class: 'note' });
    P.body.replaceChildren(P.log, P.note, h('div', { class: 'composer' }, P.input, P.send),
      h('div', { class: 'chat-tools' }, h('button', { class: 'link', type: 'button', text: 'Clear conversation', onclick: guard(async () => { await api(`/agents/${id}/messages`, { method: 'DELETE' }); S.msgs.set(id, []); renderChat(true); }) })));
    P.log.append(h('p', { class: 'muted', text: 'Loading…' }));
    try { await loadMessages(id); } catch (e) { toast(e.message); }
    if (S.selected !== id || S.tab !== 'chat') return;
    drawLog(id);
  }
  syncComposer(a);
}

function drawLog(id) {
  const msgs = S.msgs.get(id) || [];
  const cs = chatState(id);
  const a = S.agents.get(id);
  const nodes = msgs.map((m) => msgNode(m.role, m.content));
  if (!nodes.length && !cs.streaming) nodes.push(h('div', { class: 'welcome' }, h('p', { text: `${a.name} · ${a.role}` }), h('p', { class: 'muted', text: a.description })));
  if (cs.streaming) {
    P.stream = msgNode('assistant', cs.pending, 'streaming');
    if (!cs.pending) P.stream.append(h('div', { class: 'typing' }, h('i'), h('i'), h('i'), h('span', { text: ' generating…' })));
    nodes.push(P.stream);
  }
  if (cs.error) nodes.push(h('div', { class: 'msg error', text: cs.error }));
  P.log.replaceChildren(...nodes);
  P.log.scrollTop = P.log.scrollHeight;
}

function syncComposer(a) {
  if (!P.input || S.tab !== 'chat') return;
  const cs = chatState(a.id);
  const why = chatBlocked(a);
  P.input.disabled = !!why || cs.streaming;
  P.send.textContent = cs.streaming ? '■ Stop' : 'Send';
  P.send.disabled = !!why;
  P.send.classList.toggle('danger', cs.streaming);
  P.note.textContent = why || (S.health && !S.health.ollama.online ? 'Ollama is offline — replies will fail until it is running.' : '');
}

async function sendChat() {
  const a = S.agents.get(S.selected);
  const text = P.input.value.trim();
  if (!a || !text) return;
  const id = a.id, cs = chatState(id);
  if (cs.streaming) return;
  P.input.value = '';
  await loadMessages(id).catch(() => S.msgs.set(id, []));
  S.msgs.get(id).push({ role: 'user', content: text });
  Object.assign(cs, { streaming: true, pending: '', error: null, ctl: new AbortController() });
  drawLog(id); syncComposer(a);
  try {
    const r = await streamChat(id, text, {
      signal: cs.ctl.signal,
      onToken: (t) => {
        cs.pending += t;
        if (S.selected === id && S.tab === 'chat' && P.stream?.isConnected) {
          P.stream.querySelector('.typing')?.remove();
          P.stream.querySelector('.md').replaceWith(renderText(cs.pending));
          P.log.scrollTop = P.log.scrollHeight;
        }
      },
    });
    if (cs.pending) S.msgs.get(id).push({ role: 'assistant', content: cs.pending + (r === 'stopped' ? '\n\n_(stopped)_' : '') });
  } catch (e) {
    if (e.name === 'AbortError') { if (cs.pending) S.msgs.get(id).push({ role: 'assistant', content: cs.pending }); } else {
      if (cs.pending) S.msgs.get(id).push({ role: 'assistant', content: cs.pending });
      cs.error = e.message;
    }
  } finally {
    Object.assign(cs, { streaming: false, pending: '', ctl: null });
    if (S.selected === id && S.tab === 'chat') { drawLog(id); syncComposer(S.agents.get(id)); }
  }
}

// ---- tasks ------------------------------------------------------------------------
async function loadTasks(id) {
  try { S.tasks.set(id, await api(`/agents/${id}/tasks`)); } catch (e) { toast(e.message); return; }
  if (S.selected === id && S.tab === 'tasks') renderTasks(false);
}

function approvalNote(a) {
  const integ = S.integrations.find((i) => i.agent === a.id);
  if (integ && integ.status !== 'connected') return `Approving only marks the result as approved. ${integ.name} is not connected yet, so nothing is sent or executed.`;
  return 'Approving marks the result as approved.';
}

function renderTasks(full) {
  const a = S.agents.get(S.selected);
  if (!a) return;
  if (full || !P.taskList) {
    P.taskList = h('div', { class: 'task-list' });
    const title = h('input', { type: 'text', maxlength: '120', placeholder: 'Task title (optional)' });
    const prompt = h('textarea', { rows: '3', maxlength: '20000', placeholder: `What should ${a.name} do?` });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: 'Assign task' });
    const form = h('form', { class: 'task-form', onsubmit: guard(async (e) => {
      e.preventDefault();
      if (!prompt.value.trim()) return;
      submit.disabled = true;
      try { await api(`/agents/${a.id}/tasks`, { method: 'POST', body: { title: title.value, prompt: prompt.value } }); title.value = ''; prompt.value = ''; } finally { submit.disabled = false; }
    }) }, title, prompt, h('div', { class: 'row' }, submit,
      h('span', { class: 'muted', text: a.requires_approval ? 'Results wait for your approval.' : 'Runs when the agent is free.' })));
    P.body.replaceChildren(form, h('h4', { text: 'Task history' }), P.taskList);
  }
  const tasks = S.tasks.get(a.id);
  if (!tasks) { P.taskList.replaceChildren(h('p', { class: 'muted', text: 'Loading…' })); return; }
  if (!tasks.length) { P.taskList.replaceChildren(h('p', { class: 'muted', text: 'No tasks yet. Assign one above.' })); return; }
  const open = new Set([...P.taskList.querySelectorAll('details[open]')].map((d) => d.dataset.id));
  P.taskList.replaceChildren(...tasks.map((t) => taskCard(a, t, open)));
}

function taskCard(a, t, open) {
  const body = [];
  body.push(h('div', { class: 'label', text: 'Request' }), h('pre', { class: 'plain', text: t.prompt }));
  if (t.result) body.push(h('div', { class: 'label', text: t.status === 'awaiting_approval' ? 'Result — awaiting your decision' : 'Result' }), renderText(t.result),
    h('button', { class: 'link', type: 'button', text: 'Copy result', onclick: () => navigator.clipboard?.writeText(t.result) }));
  if (t.error) body.push(h('div', { class: 'msg error', text: t.error }));
  if (t.status === 'awaiting_approval') body.push(h('p', { class: 'muted', text: approvalNote(a) }),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', text: '✓ Approve', onclick: guard(() => api(`/tasks/${t.id}/approve`, { method: 'POST' })) }),
      h('button', { class: 'btn danger', type: 'button', text: '✕ Reject', onclick: guard(() => api(`/tasks/${t.id}/reject`, { method: 'POST' })) })));
  const d = h('details', { class: `task st-${t.status}`, 'data-id': t.id }, h('summary', {},
    h('span', { class: 'task-title', text: t.title }), h('span', { class: `badge t-${t.status}`, text: TASK_STATUS[t.status] }), h('span', { class: 'when', text: fmtTime(t.created_at) })), ...body);
  if (open.has(String(t.id)) || t.status === 'awaiting_approval') d.open = true;
  return d;
}

// ---- profile -----------------------------------------------------------------------
function renderProfile() {
  const a = S.agents.get(S.selected);
  const models = new Set([a.effective_model, ...(S.health?.ollama.models || [])]);
  const sel = h('select', {}, h('option', { value: '', text: `Default (${S.health?.ollama.defaultModel || 'configured model'})` }),
    ...[...models].map((m) => h('option', { value: m, text: m, selected: a.model === m })));
  const prompt = h('textarea', { rows: '10', maxlength: '8000', spellcheck: 'false' }); prompt.value = a.system_prompt;
  P.body.replaceChildren(
    h('p', { text: a.description }),
    h('label', { class: 'field' }, h('span', { text: 'Model' }), sel),
    h('label', { class: 'field' }, h('span', { text: 'System instructions' }), prompt),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: guard(async () => {
      await api(`/agents/${a.id}`, { method: 'PATCH', body: { system_prompt: prompt.value, model: sel.value || null } });
      toast('Saved', 'ok');
    }) }), h('span', { class: 'muted', text: 'Applies to the next message or task.' })));
}

// ---------- live updates ---------------------------------------------------------------
function onState(list) {
  const prevStatus = S.agents.get(S.selected)?.status;
  S.agents = new Map(list.map((a) => [a.id, a]));
  office.setAgents(list);
  renderChips(); renderRoster();
  const a = S.agents.get(S.selected);
  if (a && P.head) {
    renderHead(); renderTabs();
    if (S.tab === 'chat') syncComposer(a);
    if (a.status !== prevStatus && S.tab === 'tasks') loadTasks(a.id);
  }
}

function onTask(t) {
  const list = S.tasks.get(t.agent_id);
  if (list) {
    const i = list.findIndex((x) => x.id === t.id);
    if (i >= 0) list[i] = t; else list.unshift(t);
  }
  if (S.selected === t.agent_id && S.tab === 'tasks') renderTasks(false);
}

function connect() {
  const es = new EventSource('/api/events');
  es.addEventListener('state', (e) => onState(JSON.parse(e.data)));
  es.addEventListener('task', (e) => onTask(JSON.parse(e.data)));
  es.addEventListener('health', (e) => { S.health = JSON.parse(e.data); renderChips(); if (S.selected && S.tab === 'chat') syncComposer(S.agents.get(S.selected)); });
  es.onerror = () => { $('#chip-db').querySelector('i').className = 'bad'; };
  es.onopen = () => { $('#chip-db').querySelector('i').className = 'ok'; if (S.selected) loadTasks(S.selected); };
}

(async function init() {
  buildPanel();
  try { S.integrations = await api('/integrations'); } catch { /* optional */ }
  connect();
})();
