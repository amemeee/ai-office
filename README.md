# ai-office

A locally hosted AI agent workspace shown as a retro isometric office. Each character is an AI agent powered by **your own Ollama model**. Everything runs on your PC: no cloud APIs, no Docker, no accounts.

- Four agents with their own desks, chat, instructions and task queue: **Dex** (Developer, and the boss), **Paige** (Documents), **Milo** (Email) and **Otto** (Automation).
- **Statuses are real.** An agent shows *Working* only while a real Ollama request is running. Nothing is faked.
- Works as an office dashboard even when Ollama is offline.
- Three floors to explore: a rooftop (garden, pool, basketball court), the office, and a basement car park.

> **Built and tested on this PC:** Windows 11 Home, Intel Core i5-12400, 16 GB RAM, integrated Intel graphics (no dedicated GPU), Node 22, Ollama with `qwen2.5-coder:3b`.
> That is a modest machine, so the app is built to stay light: the office is drawn on a small canvas at about 30 fps, there is no database server, and the only AI load is the one local model. It uses only Node, Express and SQLite, so it should run on other systems too, but only Windows has been tested.

---

## 1. Requirements

| What | Version |
|---|---|
| Node.js | 22.13 or newer (uses the built-in `node:sqlite`) |
| Ollama | any recent version, running locally |
| A model | `qwen2.5-coder:3b` by default (any chat model works) |

Install the model once:

```powershell
ollama pull qwen2.5-coder:3b
```

## 2. Install and run

```powershell
git clone <your-repo-url> ai-office
cd ai-office
npm install
npm start
```

Open **http://localhost:3000**.

- `npm run dev` restarts the server when you edit files.
- Ollama must be running (`ollama serve`, or the Ollama desktop app). If it isn't, the top bar says *Ollama offline* and the office still works.
- The database is created on first run in `data/ai-office.db`.

### Optional settings

Copy `.env.example` to `.env` and change what you need. Every value is optional.

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Address to listen on. Keep it local. |
| `PORT` | `3000` | Web port |
| `OLLAMA_URL` | `http://localhost:11434` | Where Ollama runs |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | Default model (each agent can override it) |
| `OLLAMA_KEEP_ALIVE` | `5m` | How long Ollama keeps the model in memory |
| `OLLAMA_NUM_CTX` | `4096` | Context window |
| `DB_PATH` | `data/ai-office.db` | SQLite file |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASS` | empty | Read-only inbox for Milo (see below) |

---

## 3. How to use it

### The screen

- **Top bar:** logo, how many agents are working, Ollama and SQLite status, the B&W/Colour button, and the clock.
- **Left panel:** the four agents with their live status and current task.
- **Centre:** the isometric office. Floor switcher at the top-left, zoom button at the bottom-right.
- **Right panel:** details for the selected agent (Chat, Team, Tasks, Profile and, for Milo, Inbox).

### Talk to an agent

1. Click a character in the office, or a name in the left list. The camera zooms to them.
2. **Chat** tab: type a message and press Enter. The reply streams in live. Use **Stop** to cancel, **Pause** to hold the agent.
3. **Esc** or the "Whole office" button zooms back out.

### Give an agent a task

1. Open the **Tasks** tab, describe the task and submit.
2. Tasks queue per agent. The character walks to their desk and types while the task really runs.
3. **Email and Automation** results wait for your decision: **Approve** or **Reject**. Approving only marks the result approved. Nothing is sent or executed.
4. The task history is stored in SQLite and stays after a restart.

### Change an agent

**Profile** tab: pick the model for that agent and edit its system instructions. Saved in SQLite.

### Statuses

| Status | Means |
|---|---|
| Idle | Nothing running. The character wanders and fidgets (coffee, stretching, thinking...). |
| Working | A real Ollama request is in progress. The character sits at the desk and the screen lights up. |
| Waiting for approval | A finished task needs your decision. The character stands with a raised hand. |
| Error | The last request failed (for example Ollama went offline). |
| Paused | You paused the agent. |

### Read your inbox (Milo)

Milo's **Inbox** tab shows your latest 10 emails, **read-only**: nothing is marked read, moved, deleted or sent. Add to `.env` and restart:

```
IMAP_HOST=imap.gmail.com
IMAP_USER=you@example.com
IMAP_PASS=your-app-password
```

Gmail and Outlook need IMAP turned on and an **app password**, not your normal password. Credentials stay on the server and are never sent to the browser. From the tab you can **Summarise**, **Draft reply** or **Triage inbox**. These become tasks for Milo, and drafts wait for your approval. Sending email is not implemented: copy the draft into your mail client.

### Let Dex run the team

Dex is the boss. Open his **Team** tab, or just tell him in chat: *"check your team"* or *"hold a meeting"*.

- **Check on staff:** Dex walks to each person's desk and reviews the real data about them (status, current task, queue, recent tasks), then writes review notes.
- **Hold meeting:** everyone walks to the meeting room on the east side and sits at the table. Each agent gives a short update from their own real data, then Dex writes minutes with action items. Busy or paused agents are not interrupted; they are reported as unavailable.
- **Stop** cancels it. Meetings and minutes are saved and listed under *Earlier*.

### Explore the floors

Use the switcher at the top-left of the office:

- **Rooftop:** garden, swimming pool and a basketball half-court. Lamps and pool glow turn on at dusk and night, following your real clock.
- **Ground floor:** the four departments, the corridor and the meeting room.
- **B1 Parking:** a garage with car bays, a motorcycle zone and EV charging.

In the garage, each agent owns a vehicle: Dex's Supra, Paige's car, Otto's van and Milo's motorcycle. A vehicle **drives out while its owner is really working** and drives back to a random free bay afterwards. A few visitor cars come and go as background traffic only (decorative).

**Click a vehicle** to zoom to it and open its card: what it is, whether it is parked, driving or out, which bay, and the owner's live status. Turn the preview with ◀ ▶ (or the arrow keys). Dex's Supra has nine views (four diagonals, front, rear, both sides and top); other vehicles have four.

### Look

- **B&W / Colour** button (top bar) switches the office picture between black-and-white and colour. The website itself is always black, grey and white.

---

## 4. Customise

### Your own character art

Characters are drawn with 2D art when files exist, and fall back to pixel characters otherwise. Put one transparent PNG per pose in `public/assets/chars/`, named `<name>-<pose>.png`, where `<name>` is `dex`, `paige`, `milo` or `otto`:

`stand`, `walk1`, `walk2`, `sit`, `alert`, `drink`, `hold`, `stretch`, `think`, `watch`, `yawn`.

Generated sheets on a solid green (#00FF00) background can be cut automatically (needs Python 3 with `pillow`, `numpy` and `scipy`):

```powershell
pip install pillow numpy scipy
python tools/slice-sheet.py public/assets/dex-basic-poses.jfif dex 160
python tools/slice-sheet.py public/assets/dex-idle-poses.jfif dex 156 drink,hold,stretch,think,watch,yawn 3
```

For vehicles: `tools/slice-vehicle.py` (3/4 views) and `tools/slice-flat.py` (side, front, rear, top). Results go in `public/assets/vehicles/`.

### Add or change agents

Agents live in the `agents` table (seeded in `server/database/seed.js`) and need a desk in `public/js/scene.js` (`STATIONS`, `ROOMS`). The boss is set by `BOSS_ID` in `server/services/agents.js`.

### Connect more tools

`server/services/integrations.js` lists PDF extraction, email sending and n8n workflows as planned. Implement `run()` there and the UI shows the real status.

---

## 5. How it works

```
server/   Express API, SQLite (node:sqlite), Ollama client, agent runtime, meetings
public/   Plain HTML/CSS/JS. The office is drawn procedurally on a low-resolution canvas
data/     ai-office.db (created on first run, git-ignored)
tools/    Optional scripts that cut generated art sheets
```

- `server/services/agents.js` is the single source of truth for status. It derives it from real activity: a busy request, a pause, an error or a task waiting for approval.
- The browser gets live updates over Server-Sent Events. Characters are a state machine driven by those real statuses.
- Chat streams from Ollama's `POST /api/chat`.
- Only three npm dependencies: `express`, `imapflow` and `mailparser`.

### Safety

- The server listens on `127.0.0.1` only, checks the Host header (DNS-rebinding guard) and blocks cross-origin writes.
- Email content is passed to the model as untrusted data.
- Email is read-only and nothing is sent automatically. Every Email/Automation result needs your approval.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| *Ollama offline* in the top bar | Start Ollama (`ollama serve`). Check `OLLAMA_URL`. |
| *Model missing* | `ollama pull qwen2.5-coder:3b`, or choose another model in the agent's Profile tab. |
| Page looks old after an update | Hard refresh with Ctrl+F5. |
| `EADDRINUSE` on start | Another copy is running on that port. Stop it or change `PORT`. |
| Inbox says *not connected* | Add `IMAP_*` to `.env` (use an app password) and restart. |
| `node:sqlite` errors | Update Node to 22.13 or newer. |
| Slow replies | Use a smaller model, or lower `OLLAMA_NUM_CTX`. |

Stop the server with Ctrl+C. On Windows, if it was started in the background:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
