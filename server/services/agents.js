'use strict';
/**
 * Agent runtime. This is the single source of truth for what every agent is
 * doing. Statuses are derived from real activity only:
 *   working           – an Ollama request (chat or task) is in flight
 *   paused            – the user paused the agent
 *   error             – the last request failed (cleared when new work starts)
 *   waiting_approval  – finished tasks are waiting for the user's decision
 *   idle              – none of the above
 */
const db = require('../database/db');
const config = require('../config');
const ollama = require('./ollama');
const bus = require('./bus');

const BOSS_ID = 'developer'; // Dex runs the team
const runtime = new Map(); // agentId -> { busy, paused, lastError }

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rt = (id) => {
  if (!runtime.has(id)) runtime.set(id, { busy: null, paused: false, lastError: null });
  return runtime.get(id);
};

function getRow(id) {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!row) throw httpError(404, 'Agent not found');
  return row;
}

function snapshot(row) {
  const s = rt(row.id);
  const counts = db.prepare(`SELECT
      SUM(status = 'queued') AS queued,
      SUM(status = 'awaiting_approval') AS awaiting
    FROM tasks WHERE agent_id = ?`).get(row.id);
  const queued = counts.queued || 0;
  const awaiting = counts.awaiting || 0;

  let status = 'idle';
  if (s.busy) status = 'working';
  else if (s.paused) status = 'paused';
  else if (s.lastError) status = 'error';
  else if (awaiting > 0) status = 'waiting_approval';

  return {
    id: row.id, name: row.name, role: row.role, department: row.department,
    description: row.description, system_prompt: row.system_prompt,
    model: row.model, effective_model: row.model || config.defaultModel,
    requires_approval: !!row.requires_approval,
    status, boss: row.id === BOSS_ID,
    current_task: s.busy ? s.busy.title : null,
    busy_kind: s.busy ? s.busy.kind : null,
    paused: s.paused,
    last_error: s.lastError,
    queued, awaiting,
  };
}

const list = () => db.prepare('SELECT * FROM agents ORDER BY sort, name').all().map(snapshot);
const get = (id) => snapshot(getRow(id));
const emitState = () => bus.emit('state', list());

function emitTask(id) {
  bus.emit('task', db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  emitState();
}

// ---- busy bookkeeping ---------------------------------------------------

function begin(agentId, info) {
  const s = rt(agentId);
  if (s.busy) throw httpError(409, `${getRow(agentId).name} is busy: ${s.busy.title}`);
  const controller = new AbortController();
  s.busy = { ...info, controller, reason: null };
  s.lastError = null;
  emitState();
  return controller;
}

function end(agentId) {
  rt(agentId).busy = null;
  emitState();
  setImmediate(() => pump(agentId));
}

// ---- configuration --------------------------------------------------------

function update(id, { system_prompt, model }) {
  getRow(id);
  if (system_prompt !== undefined) {
    const p = String(system_prompt).trim();
    if (!p || p.length > 8000) throw httpError(400, 'System prompt must be 1–8000 characters.');
    db.prepare('UPDATE agents SET system_prompt = ? WHERE id = ?').run(p, id);
  }
  if (model !== undefined) {
    const m = model === null ? '' : String(model).trim();
    if (m.length > 100) throw httpError(400, 'Model name too long.');
    db.prepare('UPDATE agents SET model = ? WHERE id = ?').run(m || null, id);
  }
  emitState();
  return get(id);
}

// ---- chat ---------------------------------------------------------------

function preflight(id) {
  const row = getRow(id);
  const s = rt(id);
  if (s.paused) throw httpError(409, `${row.name} is paused. Resume the agent to chat.`);
  if (s.busy) throw httpError(409, `${row.name} is busy: ${s.busy.title}`);
}

const getMessages = (id) => {
  getRow(id);
  return db.prepare('SELECT id, role, content, created_at FROM messages WHERE agent_id = ? ORDER BY id').all(id);
};

function clearMessages(id) {
  getRow(id);
  db.prepare('DELETE FROM messages WHERE agent_id = ?').run(id);
}

async function chat(id, text, { onToken, signal }) {
  preflight(id);
  const row = getRow(id);
  const controller = begin(id, { kind: 'chat', title: `Chat: ${clip(text, 50)}` });
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  const history = db.prepare(
    'SELECT role, content FROM messages WHERE agent_id = ? ORDER BY id DESC LIMIT ?',
  ).all(id, config.historyLimit).reverse();
  db.prepare('INSERT INTO messages (agent_id, role, content) VALUES (?,?,?)').run(id, 'user', text);

  const messages = [
    { role: 'system', content: row.system_prompt },
    ...history,
    { role: 'user', content: text },
  ];
  let out = '';
  try {
    await ollama.chatStream({
      model: row.model || config.defaultModel, messages, signal: controller.signal,
      onToken: (t) => { out += t; onToken(t); },
    });
    if (out) db.prepare('INSERT INTO messages (agent_id, role, content) VALUES (?,?,?)').run(id, 'assistant', out);
    return { stopped: false };
  } catch (e) {
    if (controller.signal.aborted) {
      if (out) db.prepare('INSERT INTO messages (agent_id, role, content) VALUES (?,?,?)').run(id, 'assistant', out);
      return { stopped: true };
    }
    rt(id).lastError = e.message;
    throw e;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
    end(id);
  }
}

/**
 * One-off generation for the meeting service. The agent is genuinely busy
 * (status "working") while it runs; nothing is written to its chat history.
 */
async function ask(id, { title, prompt, signal, onToken }) {
  preflight(id);
  const row = getRow(id);
  const controller = begin(id, { kind: 'meeting', title });
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  let out = '';
  try {
    await ollama.chatStream({
      model: row.model || config.defaultModel, signal: controller.signal,
      messages: [{ role: 'system', content: row.system_prompt }, { role: 'user', content: prompt }],
      onToken: (t) => { out += t; onToken?.(out); },
    });
    return { text: out, stopped: false };
  } catch (e) {
    if (controller.signal.aborted) return { text: out, stopped: true };
    rt(id).lastError = e.message;
    throw e;
  } finally {
    signal?.removeEventListener('abort', onExternalAbort);
    end(id);
  }
}

// ---- tasks --------------------------------------------------------------

const getTask = (taskId) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!t) throw httpError(404, 'Task not found');
  return t;
};

const listTasks = (agentId, limit = 50) => {
  if (agentId) getRow(agentId);
  return db.prepare(`SELECT * FROM tasks ${agentId ? 'WHERE agent_id = ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(agentId ? [agentId, limit] : [limit]));
};

function createTask(agentId, { title, prompt }) {
  getRow(agentId);
  const p = String(prompt || '').trim();
  const t = String(title || '').trim() || clip(p.replace(/\s+/g, ' '), 60);
  if (!p) throw httpError(400, 'Task description is required.');
  if (p.length > 20000) throw httpError(400, 'Task description is too long (max 20000 characters).');
  if (t.length > 120) throw httpError(400, 'Task title is too long (max 120 characters).');
  const info = db.prepare('INSERT INTO tasks (agent_id, title, prompt) VALUES (?,?,?)').run(agentId, t, p);
  const id = Number(info.lastInsertRowid);
  emitTask(id);
  setImmediate(() => pump(agentId));
  return getTask(id);
}

function pump(agentId) {
  const s = rt(agentId);
  if (s.busy || s.paused) return;
  const task = db.prepare("SELECT * FROM tasks WHERE agent_id = ? AND status = 'queued' ORDER BY id LIMIT 1").get(agentId);
  if (task) runTask(getRow(agentId), task);
}

async function runTask(agent, task) {
  const controller = begin(agent.id, { kind: 'task', taskId: task.id, title: task.title });
  const busy = rt(agent.id).busy;
  db.prepare("UPDATE tasks SET status='running', started_at=datetime('now'), error=NULL WHERE id=?").run(task.id);
  emitTask(task.id);

  try {
    const result = await ollama.chatStream({
      model: agent.model || config.defaultModel,
      signal: controller.signal,
      messages: [
        { role: 'system', content: agent.system_prompt },
        { role: 'user', content: `Task: ${task.title}\n\n${task.prompt}` },
      ],
    });
    if (agent.requires_approval) {
      db.prepare("UPDATE tasks SET status='awaiting_approval', result=? WHERE id=?").run(result, task.id);
    } else {
      db.prepare("UPDATE tasks SET status='done', result=?, finished_at=datetime('now') WHERE id=?").run(result, task.id);
    }
  } catch (e) {
    if (controller.signal.aborted) {
      if (busy.reason === 'pause') {
        db.prepare("UPDATE tasks SET status='queued', started_at=NULL WHERE id=?").run(task.id);
      } else {
        db.prepare("UPDATE tasks SET status='cancelled', finished_at=datetime('now') WHERE id=?").run(task.id);
      }
    } else {
      rt(agent.id).lastError = e.message;
      db.prepare("UPDATE tasks SET status='failed', error=?, finished_at=datetime('now') WHERE id=?").run(e.message, task.id);
    }
  } finally {
    runtime.get(agent.id).busy = null;
    emitTask(task.id);
    setImmediate(() => pump(agent.id));
  }
}

function decide(taskId, approve) {
  const t = getTask(taskId);
  if (t.status !== 'awaiting_approval') throw httpError(409, 'This task is not waiting for approval.');
  db.prepare("UPDATE tasks SET status=?, finished_at=datetime('now') WHERE id=?").run(approve ? 'approved' : 'rejected', taskId);
  emitTask(taskId);
  return getTask(taskId);
}

// ---- pause / resume / stop ---------------------------------------------

function pause(id) {
  getRow(id);
  const s = rt(id);
  s.paused = true;
  if (s.busy) { s.busy.reason = 'pause'; s.busy.controller.abort(); }
  emitState();
  return get(id);
}

function resume(id) {
  getRow(id);
  rt(id).paused = false;
  emitState();
  setImmediate(() => pump(id));
  return get(id);
}

/** Stop: abort the running job, cancel every queued task and clear any error. */
function stop(id) {
  getRow(id);
  const s = rt(id);
  s.lastError = null;
  const queued = db.prepare("SELECT id FROM tasks WHERE agent_id = ? AND status = 'queued'").all(id);
  db.prepare("UPDATE tasks SET status='cancelled', finished_at=datetime('now') WHERE agent_id = ? AND status = 'queued'").run(id);
  queued.forEach((t) => bus.emit('task', db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id)));
  if (s.busy) { s.busy.reason = 'stop'; s.busy.controller.abort(); }
  emitState();
  return get(id);
}

/** Called on startup so tasks that were queued before a restart continue. */
function resumeQueues() {
  db.prepare('SELECT id FROM agents').all().forEach((a) => pump(a.id));
}

module.exports = {
  BOSS_ID, ask, list, get, update, preflight, chat, getMessages, clearMessages,
  createTask, listTasks, getTask, decide, pause, resume, stop, resumeQueues,
};
