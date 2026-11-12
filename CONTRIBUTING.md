# Contributing to Usnea

Thanks for your interest. Usnea is at v0.0: the packages are empty skeletons, so the commands below currently have little to run. The plan is in [docs/PLAN.md](docs/PLAN.md) (Chinese).

## Setup

Requires Node >= 22 and pnpm.

```
pnpm install
pnpm check       # lint and format (Biome)
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm check`, `pnpm typecheck` and `pnpm test` before opening a pull request. CI runs the same checks and they must pass before merging.

## Proposals

For any significant change (new core API, new package, new platform, change of direction), open a proposal in GitHub Discussions first and wait for feedback before writing code. Small fixes can go straight to a pull request.

## Commits and pull requests

- Keep changes small. Do one thing per commit and per pull request.
- Include tests. Prefer writing the test or example first.
- Sign off every commit with the Developer Certificate of Origin (DCO): use `git commit -s`, which adds a `Signed-off-by: Your Name <you@example.com>` line. There is no CLA.
- If your change affects a public API, add a changeset with `pnpm changeset`.

## Code rules

- Every source file starts with `// SPDX-License-Identifier: Apache-2.0`.
- Core, plugins and game code must not call browser APIs (`window`, `document`, and so on) directly. Go through the platform layer. CI will check this.
- Dependencies must use a permissive license: MIT, Apache-2.0, BSD, ISC, Zlib or similar. GPL, AGPL and other copyleft dependencies are not accepted in the core or official plugins.
- Code is licensed Apache-2.0; documentation and example assets are CC BY 4.0. Example assets must be your own work or CC0.

## AI-generated code

AI-assisted contributions are welcome. State in the pull request description which parts were AI-generated. They go through the same review, lint, type check, tests, license checks and CI as any other code, and you are responsible for understanding what you submit.

## 中文摘要

- 环境：Node >= 22、pnpm；常用命令 `pnpm install`、`pnpm check`、`pnpm typecheck`、`pnpm test`、`pnpm build`。各包目前是空骨架，命令几乎没有可运行的内容。
- 重大改动先在 GitHub Discussions 发提案，再动手。
- 提交要小，一次只做一件事，附带测试；使用 DCO，用 `git commit -s` 添加 `Signed-off-by`，不设 CLA。
- 涉及 API 变更的 PR 需要用 `pnpm changeset` 添加 changeset。
- 每个源文件头部加 `// SPDX-License-Identifier: Apache-2.0`。
- 核心、插件、游戏代码不得直接调用 `window`、`document` 等浏览器接口，一律经过平台层。
- 依赖只接受 MIT、Apache-2.0、BSD、ISC、Zlib 等宽松协议。
- AI 生成的代码需要在 PR 中标注，并经过同样的审查和 CI。
