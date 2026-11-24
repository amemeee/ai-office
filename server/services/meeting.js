'use strict';
/**
 * Boss features. Dex (the boss) can
 *   - "round":   review each staff member in turn (visiting their desk), or
 *   - "meeting": call everyone together; each staff member reports, Dex writes minutes.
 * Every line in the transcript is a real model response and every agent is
 * genuinely busy while it is produced. Staff that are busy or paused are
 * reported from the real runtime data instead of being interrupted.
 */
const db = require('../database/db');
const agents = require('./agents');
const bus = require('./bus');

let current = null;      // the meeting in progress, or the most recent one
let controller = null;

const err = (status, message) => Object.assign(new Error(message), { status });
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const stoppedError = () => Object.assign(new Error('Stopped'), { stopped: true });

const publicState = () => current && ({
  id: current.id, kind: current.kind, topic: current.topic, status: current.status,
  speaker: current.speaker, visiting: current.visiting, participants: current.participants,
  transcript: current.transcript, minutes: current.minutes, error: current.error,
});
const emit = () => bus.emit('meeting', publicState());
const get = () => publicState();
const active = () => !!current && current.status === 'running';

function history(limit = 10) {
  return db.prepare('SELECT id, kind, topic, status, minutes, created_at, finished_at FROM meetings ORDER BY id DESC LIMIT ?').all(limit);
}
function getMeeting(id) {
  const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!m) throw err(404, 'Meeting not found');
  return { ...m, transcript: JSON.parse(m.transcript) };
}

/** What the runtime really knows about an agent. */
function facts(a) {
  const recent = agents.listTasks(a.id, 3).map((t) => `#${t.id} "${clip(t.title, 50)}" – ${t.status}`);
  const lines = [
    `${a.name} (${a.role}) status: ${a.status.replace('_', ' ')}.`,
    a.current_task ? `Currently doing: ${a.current_task}.` : 'Currently doing nothing.',
    `Queued tasks: ${a.queued}. Waiting for approval: ${a.awaiting}.`,
    a.last_error ? `Last error: ${clip(a.last_error, 120)}` : '',
    recent.length ? `Recent tasks: ${recent.join('; ')}.` : 'No tasks yet.',
  ];
  return lines.filter(Boolean).join('\n');
}

function persist() {
  const finished = current.status === 'running' ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE meetings SET status=?, transcript=?, minutes=?, error=?, finished_at=? WHERE id=?')
    .run(current.status, JSON.stringify(current.transcript), current.minutes, current.error, finished, current.id);
}

/** Runs one model call, streaming into `entry.text` (throttled UI updates). */
async function speak(agentId, title, prompt, entry) {
  let last = 0;
  const r = await agents.ask(agentId, {
    title, prompt, signal: controller.signal,
    onToken: (text) => { entry.text = text; const n = Date.now(); if (n - last > 200) { last = n; emit(); } },
  });
  entry.text = r.text.trim();
  if (r.stopped) throw stoppedError();
}

async function run(kind, topic) {
  const staff = agents.list().filter((a) => !a.boss);
  const boss = agents.get(agents.BOSS_ID);
  try {
    for (const a of staff) {
      if (controller.signal.aborted) throw stoppedError();
      const snap = agents.get(a.id);
      const f = facts(snap);
      const entry = { agent: kind === 'round' ? boss.id : a.id, about: a.id, text: '' };
      current.transcript.push(entry);

      if (kind === 'round') {
        // The boss walks to this person's desk and reviews the real data about them.
        current.visiting = a.id; current.speaker = boss.id; emit();
        await speak(boss.id, `Reviewing ${a.name}`,
          `You are the boss checking on your team member. Using ONLY these facts, give a 2-sentence assessment of ${a.name}'s workload and anything that needs attention. Do not invent details.\n\nFACTS:\n${f}`, entry);
      } else if (snap.status === 'working' || snap.status === 'paused') {
        // Busy or paused staff are not interrupted: report from real data.
        entry.text = `(${a.name} could not join the discussion: ${snap.status === 'paused' ? 'paused' : `busy with "${snap.current_task}"`}.)`;
        current.speaker = a.id; emit();
      } else {
        current.speaker = a.id; emit();
        await speak(a.id, `Meeting: ${clip(topic, 40)}`,
          `You are in a team meeting called by your boss ${boss.name}. Topic: ${topic}\nGive a short status update in at most 3 sentences, using ONLY these facts about your own work. Do not invent details.\n\nFACTS:\n${f}`, entry);
      }
      persist(); emit();
    }

    // The boss closes with the minutes.
    current.visiting = null; current.speaker = boss.id; emit();
    const notes = current.transcript.map((e) => `- ${agents.get(e.about).name}: ${e.text}`).join('\n');
    const minutesEntry = { text: '' };
    await speak(boss.id, 'Writing minutes',
      `You are ${boss.name}, the boss. Write brief ${kind === 'round' ? 'review notes' : 'meeting minutes'} on "${topic}" from these notes. Format: a one-line summary, then "Action items:" as a short bullet list naming who does what. Use ONLY the notes. Under 120 words.\n\nNOTES:\n${notes}`, minutesEntry);
    current.minutes = minutesEntry.text;
    current.status = 'done';
  } catch (e) {
    current.status = e.stopped ? 'cancelled' : 'failed';
    if (!e.stopped) current.error = e.message;
  } finally {
    current.speaker = null; current.visiting = null;
    persist(); emit();
    controller = null;
  }
}

function start(kind, topic) {
  if (!['meeting', 'round'].includes(kind)) throw err(400, 'Unknown meeting type.');
  if (active()) throw err(409, 'A meeting is already in progress.');
  const boss = agents.get(agents.BOSS_ID);
  if (boss.status === 'working') throw err(409, `${boss.name} is busy: ${boss.current_task}`);
  if (boss.status === 'paused') throw err(409, `${boss.name} is paused. Resume the agent first.`);
  const t = String(topic || '').trim().slice(0, 200) || (kind === 'round' ? 'Staff check' : 'Team status meeting');
  const info = db.prepare('INSERT INTO meetings (kind, topic, status) VALUES (?,?,?)').run(kind, t, 'running');
  current = {
    id: Number(info.lastInsertRowid), kind, topic: t, status: 'running', speaker: null, visiting: null,
    participants: agents.list().map((a) => a.id), transcript: [], minutes: null, error: null,
  };
  controller = new AbortController();
  emit();
  run(kind, t); // runs in the background; progress is pushed over SSE
  return publicState();
}

function stop() {
  if (!active()) throw err(409, 'No meeting is in progress.');
  controller?.abort();
  return publicState();
}

module.exports = { start, stop, get, active, history, getMeeting };
