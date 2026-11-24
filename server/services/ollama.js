'use strict';
const config = require('../config');

class OllamaError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Lists installed models. Resolves quickly; used for the health indicator. */
async function health() {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { online: true, models: (data.models || []).map((m) => m.name), error: null };
  } catch (e) {
    return { online: false, models: [], error: e.message };
  }
}

/**
 * Streams a chat completion from Ollama (POST /api/chat).
 * Calls onToken(text) for each chunk and resolves with the full text.
 * Aborting `signal` rejects with the underlying AbortError.
 */
async function chatStream({ model, messages, signal, onToken }) {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages, stream: true,
        keep_alive: config.keepAlive,
        options: { num_ctx: config.numCtx },
      }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new OllamaError('offline', `Ollama is not reachable at ${config.ollamaUrl}. Start it (run "ollama serve") and try again.`);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    if (res.status === 404) throw new OllamaError('model', `Model "${model}" is not installed. Run: ollama pull ${model}`);
    throw new OllamaError('http', `Ollama returned an error (${res.status}). ${detail}`.trim());
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const handle = (line) => {
    if (!line.trim()) return;
    let chunk;
    try { chunk = JSON.parse(line); } catch { return; }
    if (chunk.error) throw new OllamaError('http', `Ollama error: ${chunk.error}`);
    const text = chunk.message?.content;
    if (text) { full += text; onToken?.(text); }
  };

  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer);
  return full;
}

module.exports = { health, chatStream, OllamaError };
