'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
require('./database/db'); // initialises schema + seed data
const agents = require('./services/agents');

const app = express();
app.disable('x-powered-by');

// Local-only hardening: reject foreign Host headers (DNS rebinding) and
// cross-origin writes (another website poking the local API).
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
app.use('/api', (req, res, next) => {
  if (!LOCAL_HOST.test(req.headers.host || '')) return res.status(403).json({ error: 'Forbidden host.' });
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch { /* invalid */ }
    if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api', require('./routes/system'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

app.listen(config.port, config.host, () => {
  console.log(`\n  ai-office is running → http://${config.host === '127.0.0.1' ? 'localhost' : config.host}:${config.port}`);
  console.log(`  Ollama: ${config.ollamaUrl}  |  default model: ${config.defaultModel}\n`);
  agents.resumeQueues();
});
