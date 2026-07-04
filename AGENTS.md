# Repository Guidelines

## Project Structure & Module Organization

Meshova is a TypeScript procedural modeling and procedural PBR material library. Core source lives in `src/`, with domain modules such as `math/`, `random/`, `sandbox/`, `geometry/`, `texture/`, `pipeline/`, `agent/`, and `vision/`. Tests live in `test/` and follow the source module names where practical. `examples/` contains runnable modeling/material demos, `scripts/` contains local tooling such as the viewer server and screenshot utilities, `web/` contains the browser viewer and vendored Three.js files, and `doc/` contains design/reference notes. Treat `dist/` and `out/` as generated build, render, and screenshot output.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm test`: run the Vitest suite once.
- `pnpm test:watch`: run Vitest in watch mode during development.
- `pnpm typecheck`: run TypeScript with `--noEmit`.
- `pnpm build`: emit compiled files and declarations to `dist/`.
- `pnpm view`: start the local browser viewer via `scripts/serve.mjs`.
- `pnpm teddy`, `pnpm car`, `pnpm office-chair`: run representative example scripts.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Keep imports compatible with the existing style, including `.js` extensions for local TypeScript imports. Use two-space indentation, named exports, `camelCase` functions and variables, and `PascalCase` interfaces/types. Prefer immutable-by-convention APIs: return new meshes, buffers, and data objects rather than mutating inputs. Determinism is a core requirement, so seed all randomness and avoid time- or environment-dependent behavior in core logic.

For semantic deformable mesh UI, never expose raw importer/object names such as `root.0` or `component_1` as primary parameter labels. Infer and display human-readable semantic labels from part geometry, prompt/context, or AI/VLM metadata; keep the raw part name only as a stable internal key.

## Testing Guidelines

Vitest runs in Node and includes `test/**/*.test.ts`. Add focused tests next to the affected domain, for example `test/geometry.test.ts` for mesh operations or `test/random.test.ts` for seeded behavior. Use deterministic assertions and `toBeCloseTo` for floating-point math. Run `pnpm test` and `pnpm typecheck` before submitting changes that touch source.

## Commit & Pull Request Guidelines

This checkout does not include local git history, so no project-specific commit pattern can be inferred. Use concise, imperative commit messages such as `Add seeded texture tiling test` or `Fix mesh normal recomputation`. Pull requests should describe the behavior change, list tests run, link related issues, and include screenshots or generated artifact notes when viewer output changes.

## Security & Configuration Tips

Do not commit secrets, API keys, or local machine paths. Keep generated renders, logs, and screenshots under `out/`; keep compiled output under `dist/`. Prefer environment variables for agent or pipeline credentials.
