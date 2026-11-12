# catch

A tiny complete game for Usnea: move the paddle, catch the falling blocks, do not miss three.
No image files; every sprite is a solid rectangle. Score and lives are drawn with a `Text` entity.

## Run

```
pnpm --filter @usnea/example-catch dev
```

Open the printed address. Other scripts: `test` (replay cases and Vitest), `shot` (writes
`shot.png`), `typecheck`.

## Controls

- Left / Right arrow or A / D: move the paddle (hold the key).
- Mouse or touch: the paddle jumps to the pointer's x.
- Space: restart after "Game over".

## Read these first

- `components/game.ts`: all components (`Paddle`, `Block`, `Game`, `Controls`).
- `systems/input.ts`, `systems/paddle.ts`, `systems/spawn.ts`, `systems/fall.ts`: the game loop.
- `scenes/main.scene.json` and `prefabs/block.prefab.json`: the entities.
- `scenes/quick.scene.json`: one life and fast spawns, used by the browser idle test.
- `test/idle.test.ts`: proves that a finished game stops stepping and drawing.

## Tests

`pnpm --filter @usnea/example-catch test` runs `tests/smoke.case.json`, `tests/play.case.json`
(replays `tests/play.rec`) and `test/*.test.ts`. After changing game logic on purpose, regenerate the
expected hashes with `pnpm --filter @usnea/example-catch exec usnea test --update`.
The browser tests need Chromium (`npx playwright install chromium`).
