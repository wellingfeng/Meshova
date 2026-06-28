# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Meshova is a web procedural-modeling + procedural-PBR-material library driven by AI-written scripts. The defining idea is a **closed self-iteration loop**: an LLM writes a restricted-JS script → the sandbox runs it → the result is rendered to a screenshot → the score/image is fed back → the LLM revises. The output is always a re-runnable *script*, never a baked mesh dump.

## Commands

```bash
pnpm install
pnpm test                       # vitest run (all tests)
pnpm test:watch                 # vitest watch mode
pnpm vitest run test/math.test.ts          # single test file
pnpm vitest run -t "computeNormals"        # single test by name pattern
pnpm typecheck                  # tsc --noEmit
pnpm build                      # emit dist/ (tsc -p tsconfig.build.json)
pnpm view                       # live viewer at localhost:5173 (zero-dep static server)
```

Examples and the headless loop run through `tsx` (no build needed):

```bash
pnpm teddy | pnpm car | pnpm office-chair   # build example models, write to out/
pnpm shot [modelId] [views] [material] [channels]   # headless screenshot capture
pnpm agent                      # P4 agent-loop end-to-end demo (uses MockLlmClient, no API key)
pnpm image2model                # image->model demo
```

`pnpm shot` and `pnpm agent` require the build (`dist/`) and a Playwright Chromium install; the screenshot scripts re-point Playwright's headless-shell path to the full Chromium build for WebGPU/ANGLE rendering.

## Hard invariants

- **Determinism is non-negotiable.** Same seed → same result, every run. Screenshot tests and AI reproduction depend on it. Never introduce `Math.random()`, `Date.now()` in generation paths, or unordered iteration that affects output. Use the seeded PRNG (`makeRng`, xoshiro128**) and seeded noise (`makeNoise`).
- **Meshes are immutable by convention.** Builder functions return new meshes and never mutate inputs. This keeps the script DSL side-effect-free. After moving vertices, call `recomputeNormals` / `computeNormals`.
- **ESM with explicit `.js` extensions in imports**, even from `.ts` source (e.g. `import { vec3 } from "../math/vec3.js"`). `moduleResolution: "Bundler"`, `target/module: ES2022/ESNext`. TS is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — array indexing yields `T | undefined` (hence the `!` assertions throughout) and optional props can't be assigned `undefined` directly (build the object conditionally instead).

## Architecture

Everything funnels through `src/index.ts`, which re-exports every module's barrel (`index.ts`). The "shared kernel" (deterministic RNG/noise, sandbox, screenshot loop, AI orchestration) is reused by both geometry and texture.

Module map (`src/<module>/index.ts` is the barrel for each):

- **`math/`** — immutable `vec2`/`vec3`/`mat4`/`quat`/scalar helpers. Many scalar/vec functions mirror Houdini VEX semantics (see `test/vex-parity*.test.ts` for the parity contract).
- **`random/`** — seeded PRNG (`makeRng`, `.fork()` for independent streams) + Perlin noise (`noise2`/`noise3`) and fbm (`fbm2`/`fbm3`).
- **`sandbox/`** — `runScript()` runs an AI script string via `new Function` with host globals shadowed to `undefined` (see `FORBIDDEN_GLOBALS`) plus a `LoopGuard` (op budget + wall-clock timeout). **This is hardening, not true isolation** — the documented upgrade is a Worker/VM boundary. Do not run untrusted code with secrets in-process.
- **`geometry/`** — the P1 core. `Mesh` is an indexed triangle mesh (positions/normals/uvs/flat index list, CCW front-facing). Primitives, transforms, ops (subdivide/extrude/displace), CSG boolean, Catmull-Clark, curves/sweep, scatter, fields, and a Houdini-style middle layer (`Ramp`, `PointCloud`, `InstancePlan`, `copyToPoints`). `export.ts` produces OBJ+MTL and the `ViewerModel` JSON (`meshova-model@1`) the web viewer consumes.
- **`texture/`** — procedural PBR. `pbr.ts` is the metal/rough base; `surface.ts` adds `SurfaceMaterial` (transmission/ior/clearcoat/sheen/iridescence) mapping 1:1 onto three.js `MeshPhysicalMaterial`, so glass/liquid/metal/fabric render honestly. Patterns, filters, tiling, PNG export, presets.
- **`agent/`** — the closed loop. `llm.ts` defines the tiny provider-agnostic `LlmClient` interface (`MockLlmClient` for tests, `makeOpenAICompatibleClient` as a reference adapter — no SDK/key in core). `api.ts` is the **curated DSL surface** (`SCRIPT_API`) spread into the sandbox scope plus `SCRIPT_API_REFERENCE`, the signature list injected into the system prompt — keep these in sync. `runner.ts` runs a script and normalizes the return into `NamedPart[]` + a stats summary. `loop.ts` is text/headless iteration; `image-loop.ts` adds reference-photo scoring.
- **`vision/`** — image-target pipeline. Decode PNG → silhouette mask → score a render against a reference. `loss.ts` weights **silhouette IoU at 0.8, color at 0.2** by design (shape is the priority); material is a separate classifier, never pixel-matched. Photos are never baked into geometry.
- **`pipeline/`** — the two stable public entry points: `textToModel` and `imageToModel`, thin wrappers over the agent loops so integrators don't wire sandboxing/feedback themselves.
- **`models/`** — hand-written reference models (e.g. `sports-car`).

### The DSL contract

AI scripts are plain JS snippets (no imports, no async) that call only `SCRIPT_API` functions and end with `return [ part(...), ... ]`. Three part builders: `part(name, mesh, [r,g,b])` (flat color), `coloredPart(name, mesh, colorFn)` (per-vertex color from a geometry field), `surfacePart(name, mesh, type, params)` (matched physical material — glass/liquid/metal/etc., generated *with* the model so material and shape stay aligned). When you add a geometry/texture function intended for AI use, register it in `src/agent/api.ts` `SCRIPT_API` **and** describe it in `SCRIPT_API_REFERENCE`.

### Web viewer (`web/`)

Plain ESM modules, no bundler, served from repo root by `scripts/serve.mjs`. `procmodels.js` holds `PROC_MODELS` (the registry the dropdown and `loadModelById` use); `viewer.js` exposes the `window.__meshova` hooks (`loadModelById`, `loadParts`, `setView`, `setMaterial`, `setDebugView`, `setAutorot`, `settle`) that the headless screenshot scripts drive. `materials.js` bakes presets/surfaces into three.js textures. three.js is vendored under `web/vendor/`. Models render from `ViewerModel` JSON; `out/` holds generated models and screenshots (gitignored).

## Reference

`doc/` contains study notes (Houdini procedural modeling, Substance Designer nodes, the dev plan, the function reference). Blender/Houdini are read-only algorithm references — code is self-rewritten from public knowledge, never copied (MIT, not GPL).
