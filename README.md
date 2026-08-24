# Realtime Editor

Real-time collaborative editing built on [Yjs](https://yjs.dev): a **plain-text editor** (CodeMirror 6) and a **rich-text block editor** ([Editor.js](https://editorjs.io)) that multiple people can edit at the same time, with live cursors, presence and typing indicators.

- Plain text merges **character by character** — two people can type in the same sentence.
- Rich text is shared **block by block** through a purpose-built Editor.js ⇄ Yjs binding — people editing different blocks never conflict.
- Documents live on a small WebSocket server (the official `@y/websocket-server` backend) and can be persisted to disk with LevelDB.
- Offline edits are kept locally and merged when the connection returns (Yjs CRDT).

## Quick start

Requires **Node.js 18+**.

```bash
git clone https://github.com/onexdata/realtime-editor.js.git
cd realtime-editor.js
npm install        # installs the server and the UI (npm workspaces)
npm run dev        # starts the WebSocket server (:1234) and the Vite dev server (:5173)
```

Open <http://localhost:5173> in **two browser windows**, open the same document ID in both, and type.

> Tip: a document is also addressable by URL, e.g. `http://localhost:5173/?doc=team-notes&mode=rich`. The **Copy link** button in the editor produces one.

## Project layout

```
realtime-editor.js/
├── package.json              # npm workspaces root: dev / build / start / test
├── server/
│   ├── server.js             # Yjs WebSocket server + health endpoint + persistence
│   └── test/server.test.mjs  # end-to-end server tests (node --test)
└── ui/
    ├── src/
    │   ├── App.vue                      # document selection ⇄ editor, URL state
    │   ├── components/
    │   │   ├── DocumentSelector.vue     # pick editor type + document id
    │   │   ├── PlainTextEditor.vue      # CodeMirror 6 + y-codemirror.next
    │   │   ├── RichTextEditor.vue       # Editor.js + the Yjs binding below
    │   │   └── PresenceBar.vue          # connection status, peers, your name
    │   ├── composables/useCollab.js     # Y.Doc + y-websocket provider + awareness
    │   └── lib/
    │       ├── editorjs-binding.js      # Editor.js ⇄ Y.Array<Y.Map> block binding
    │       ├── reconcile.js             # pure list-diff planner used by the binding
    │       ├── config.js                # WebSocket URL + document id rules
    │       └── user.js                  # stable per-browser identity (name, colour)
    └── vite.config.js
```

## Scripts (run from the repo root)

| Command           | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Server with auto-reload **and** Vite dev server, side by side        |
| `npm run build`   | Production build of the UI into `ui/dist/`                          |
| `npm run preview` | Serve the production build locally                                   |
| `npm start`       | Start only the WebSocket server (for production)                     |
| `npm test`        | UI unit tests (Vitest); `npm test --workspace=server` runs the server's end-to-end tests |

## Configuration

### Server

All optional — set them in the environment (see `server/.env.example`).

| Variable       | Default   | Meaning                                                                                   |
| -------------- | --------- | ----------------------------------------------------------------------------------------- |
| `PORT`         | `1234`    | Port to listen on                                                                          |
| `HOST`         | `0.0.0.0` | Interface to bind                                                                          |
| `YPERSISTENCE` | *(unset)* | Directory for LevelDB persistence. When set, documents survive server restarts. When unset, documents live in memory for the lifetime of the process. |
| `GC`           | `true`    | Set to `false` to disable Yjs garbage collection (keeps full history)                      |

```bash
YPERSISTENCE=./data PORT=8080 npm start
```

`GET /health` returns JSON with document and connection counts — handy for load balancers and uptime checks.

### UI

Create `ui/.env` (see `ui/.env.example`) to point the UI at a deployed server:

```bash
VITE_WS_URL=wss://collab.example.com
```

Without it the UI connects to `ws://<current hostname>:1234`, which is right for local development.

## Deploying

1. Build the UI: `npm run build` → static files in `ui/dist/`. Serve them from any static host or CDN.
2. Run the server somewhere with Node 18+: `YPERSISTENCE=/var/lib/realtime-editor npm start` (put it behind a TLS-terminating proxy so clients can use `wss://`).
3. Set `VITE_WS_URL` to the public WebSocket URL **before** building the UI.

**Authentication** is intentionally not built in — anyone who knows a document id can open it. The place to add it is the `server.on('upgrade', …)` handler in `server/server.js`: check a cookie or token there and `socket.destroy()` to reject.

## How the collaboration works

### Plain text

`PlainTextEditor.vue` uses [`y-codemirror.next`](https://github.com/yjs/y-codemirror.next), the official CodeMirror 6 binding. The document is a `Y.Text`; every keystroke becomes a tiny CRDT operation, so concurrent edits anywhere in the text merge correctly. Remote carets and selections are rendered from Yjs awareness, and undo/redo (`Ctrl/⌘ Z`) is a `Y.UndoManager` that only reverts your own changes.

### Rich text (Editor.js)

Editor.js has no official Yjs binding, so this project ships one (`ui/src/lib/editorjs-binding.js`). The shared structure is a `Y.Array` of `Y.Map`s, each mirroring an Editor.js block `{ id, type, data }` — the same ids Editor.js uses, so the same block has the same id on every client.

- **Local → shared:** Editor.js's batched `onChange` reports which blocks changed; only those are serialised and written. Inserts, deletes and reorders are turned into a minimal op sequence by `reconcile.js`.
- **Shared → local:** remote changes are applied surgically with the Editor.js Blocks API (`insert`/`update`/`delete`/`move`) — the document is never re-rendered wholesale, and the caret is restored if the block you are typing in was updated.
- Both directions are **idempotent** and run through one queue, so a remote change that makes Editor.js fire `onChange` is recognised as already synced and does not echo.
- Editor.js's auto-inserted empty paragraph is never shared until it has content, so new documents don't accumulate blank blocks.

**Granularity is the block.** People editing different blocks never conflict. If two people edit the *same* block within the same instant, the last write wins for that block only. Character-level merging inside a block would need a Yjs-native editor (for that, use the plain-text mode, or a ProseMirror/TipTap-based editor with `y-prosemirror`).

### Presence

Yjs awareness carries each client's `{ user, typing, block }`. The presence bar shows who is connected and typing; the rich editor adds a badge next to the block each peer is editing; CodeMirror shows remote carets/selections. Your display name and colour are generated once per browser and stored in `localStorage` — click your name to change it.

## Development notes

- `@y/websocket-server` is pinned to **0.1.1**: later 0.1.x releases moved to the Yjs v14 pre-release and currently mix two incompatible Yjs cores, which breaks sync (`store.getClock is not a function`). Bump it only once the Yjs 14 stack is stable end-to-end.
- In dev builds `window.__collab` exposes `{ ydoc, provider, awareness }` for poking at the live document from the browser console.
- `ui/src/lib/reconcile.js` is pure and covered by Vitest (including randomised convergence tests); the server has end-to-end tests that spawn the real process and use the real y-websocket client.

## License

[MIT](LICENSE)
