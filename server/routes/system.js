'use strict';
const express = require('express');
const config = require('../config');
const agents = require('../services/agents');
const bus = require('../services/bus');
const ollama = require('../services/ollama');
const integrations = require('../services/integrations');

const router = express.Router();

// Cached Ollama health, refreshed in the background so the UI never blocks on it.
let healthState = { online: false, models: [], error: 'checking…' };
async function refreshHealth() {
  const next = await ollama.health();
  if (JSON.stringify(next) !== JSON.stringify(healthState)) {
    healthState = next;
    bus.emit('health', publicHealth());
  }
}
const publicHealth = () => ({ ollama: { ...healthState, url: config.ollamaUrl, defaultModel: config.defaultModel }, db: true });
refreshHealth();
setInterval(refreshHealth, 5000).unref();

router.get('/health', (req, res) => res.json(publicHealth()));
router.get('/integrations', (req, res) => res.json(integrations.list()));

// Server-Sent Events: pushes agent state, task updates and health changes.
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('state', agents.list());
  send('health', publicHealth());

  const onState = (d) => send('state', d);
  const onTask = (d) => send('task', d);
  const onHealth = (d) => send('health', d);
  bus.on('state', onState); bus.on('task', onTask); bus.on('health', onHealth);
  const beat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(beat);
    bus.off('state', onState); bus.off('task', onTask); bus.off('health', onHealth);
  });
});

module.exports = router;
