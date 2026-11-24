'use strict';
const express = require('express');
const agents = require('../services/agents');

const router = express.Router();

router.get('/', (req, res) => res.json(agents.list()));
router.get('/:id', (req, res) => res.json(agents.get(req.params.id)));

router.patch('/:id', (req, res) => {
  const { system_prompt, model } = req.body || {};
  res.json(agents.update(req.params.id, { system_prompt, model }));
});

router.post('/:id/pause', (req, res) => res.json(agents.pause(req.params.id)));
router.post('/:id/resume', (req, res) => res.json(agents.resume(req.params.id)));
router.post('/:id/stop', (req, res) => res.json(agents.stop(req.params.id)));

router.get('/:id/messages', (req, res) => res.json(agents.getMessages(req.params.id)));
router.delete('/:id/messages', (req, res) => { agents.clearMessages(req.params.id); res.json({ ok: true }); });

router.get('/:id/tasks', (req, res) => res.json(agents.listTasks(req.params.id)));
router.post('/:id/tasks', (req, res) => {
  const { title, prompt } = req.body || {};
  res.status(201).json(agents.createTask(req.params.id, { title, prompt }));
});

// Streaming chat: newline-delimited JSON  {type:'token'|'done'|'stopped'|'error'}
router.post('/:id/chat', async (req, res, next) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 20000) return res.status(400).json({ error: 'Message is too long (max 20000 characters).' });
  try { agents.preflight(req.params.id); } catch (e) { return next(e); } // 404 / 409 before the stream starts

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); }); // browser went away
  const send = (o) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };

  try {
    const r = await agents.chat(req.params.id, message, { signal: ac.signal, onToken: (text) => send({ type: 'token', text }) });
    send({ type: r.stopped ? 'stopped' : 'done' });
  } catch (e) {
    send({ type: 'error', message: e.message });
  }
  res.end();
});

module.exports = router;
