# {{name}}

A 2D game made with [Usnea](https://github.com/DeepShawn/usnea). You move a box with the arrow
keys and collect a target that jumps to a random place.

## Run

```
npm install
npm run dev
```

Open the printed address. Edit any file and the page reloads.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with page reload |
| `npm test` | Replay cases in `tests/` (and Vitest files, if any) |
| `npm run check` | Runs the game headless for 120 steps and prints the result |
| `npm run shot` | Saves `shot.png`, a screenshot (needs `npm i -D playwright` and `npx playwright install chromium`) |
| `npm run typecheck` | TypeScript check |

## Layout

- `components/` data, `systems/` logic, `scenes/` and `prefabs/` JSON, `tests/` replay cases
- `usnea.json` project settings (size, background, step rate, seed)

If you change the game on purpose and `npm test` reports a new hash, accept it with
`npx usnea test --update`.

AI coding agents: read `AGENTS.md` first.
