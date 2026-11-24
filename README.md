# ai-office

A local, black-and-white isometric pixel-art office where each character is an AI agent backed by your own Ollama model. Everything runs on your PC; there are no cloud APIs.

## Run (Windows PowerShell)

```powershell
cd d:\GitHub\ai-office
npm install
npm start
```

Open http://localhost:3000. Requires Node 22.13+ and Ollama running (`ollama serve`) with `qwen2.5-coder:3b` pulled. The office still loads if Ollama is offline.

Optional config: copy `.env.example` to `.env` (port, Ollama URL, default model, context size).

## Using it

- Click a character (or a name in the left list) to open chat, tasks and profile.
- **Statuses are real.** Working means an Ollama request is in flight. Waiting for approval means a finished task needs your decision. Error means the last request failed. Paused and Stop are controlled by you.
- **Tasks** queue per agent. Email and Automation results wait for your approval; approving only marks them approved (nothing is sent or executed until those integrations exist).
- **Profile** tab: change an agent's model and system instructions (stored in SQLite).

## Layout

```
server/  index.js, config.js, routes/ (agents, tasks, system), services/ (agents runtime, ollama, integrations), database/ (SQLite via node:sqlite)
public/  index.html, css/style.css, js/ (office renderer, scene, characters, app UI)
data/    ai-office.db (created on first run)
```

## Next steps (Phase 4 hooks)

`server/services/integrations.js` lists PDF extraction, email (IMAP/SMTP) and n8n as `planned`. Implement `run()` there and the UI picks up the status.
