'use strict';
const path = require('path');

// Optional .env support (built into Node 20.12+, no dotenv needed).
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env file */ }

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

module.exports = {
  host: process.env.HOST || '127.0.0.1',
  port: num(process.env.PORT, 3000),
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
  defaultModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
  keepAlive: process.env.OLLAMA_KEEP_ALIVE || '5m',
  numCtx: num(process.env.OLLAMA_NUM_CTX, 4096),
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || 'data/ai-office.db'),
  historyLimit: 20,
  // Read-only inbox access. Credentials stay on the server and are never sent to the browser.
  imap: {
    host: process.env.IMAP_HOST || '',
    port: num(process.env.IMAP_PORT, 993),
    secure: process.env.IMAP_SECURE !== 'false',
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
  },
};
