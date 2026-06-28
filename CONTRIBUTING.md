# Contributing to Meshova

Thanks for helping build Meshova. This guide covers the local workflow and the
parts that are easy to get wrong — chiefly the deterministic shape-regression
baseline.

## Setup

```bash
pnpm install
pnpm test         # vitest run (all tests)
pnpm typecheck    # tsc --noEmit
pnpm build        # emit dist/
```

## Hard invariants (read before changing generation code)

- **Determinism is non-negotiable.** Same seed -> same result, every run. No
  `Math.random()`, no `Date.now()` in generation paths, no unordered iteration
  that affects output. Use the seeded PRNG (`makeRng`) and seeded noise
  (`makeNoise`). The shape-regression baseline below depends on this.
- **Meshes are immutable by convention.** Builders return new meshes; never
  mutate inputs. After moving vertices, call `recomputeNormals`/`computeNormals`.
- **ESM with explicit `.js` extensions in imports**, even from `.ts` source.

## Shape-regression baseline (turntable signatures)

`test/turntable-regression.test.ts` is a deterministic, render-free guard
against accidental shape changes. It projects each fixture model's vertices
around a turntable, CPU-rasterizes the silhouette footprint at several
azimuths, and compares the resulting fingerprint against a committed baseline
at `test/fixtures/turntable-baseline.json`.

No browser or GPU is involved, so it runs anywhere `vitest` runs (including CI).

### When it fails

A failure means a model's silhouette moved beyond tolerance (default per-view
footprint delta `0.02`). Two cases:

1. **Unintended regression.** A change to a primitive, op, or model assembly
   shifted a shape you did not mean to touch. Fix the code — do not update the
   baseline.
2. **Intended change.** You deliberately changed geometry (improved a model,
   tuned a primitive). Re-generate the baseline and commit it alongside the
   code change, so reviewers see the shape delta in the diff.

### Updating the baseline (intended changes only)

```bash
# macOS / Linux
MESHOVA_UPDATE_BASELINE=1 pnpm vitest run test/turntable-regression.test.ts

# Windows PowerShell
$env:MESHOVA_UPDATE_BASELINE=1; pnpm vitest run test/turntable-regression.test.ts

# Windows cmd
set MESHOVA_UPDATE_BASELINE=1 && pnpm vitest run test/turntable-regression.test.ts
```

This rewrites `test/fixtures/turntable-baseline.json`. Commit it with your
change and call out the intended shape delta in the PR description. Treat a
baseline update as a reviewable event, not a routine step — an unexplained
baseline churn is a red flag in review.

### Adding a model to the baseline

Add it to `fixtureModels()` in the regression test. Library models that return
`NamedPart[]` (e.g. `buildSportsCarParts()`) go through the `partMeshes(...)`
helper. Then regenerate the baseline as above. Keep fixtures deterministic:
call builders at fixed params, never with randomized inputs.

### What the signature captures (and what it does not)

- Captures: overall proportions, footprint per view, and a `solidity` measure
  (min/max footprint ratio across views) that flags flat/billboard collapse.
- Does not capture: fine surface detail, normals, UVs, or material. It is a
  coarse *shape* fingerprint by design, tuned to catch real regressions without
  flagging sub-pixel jitter.

## Tests for new work

- New geometry/texture functions: add unit tests next to the existing suites in
  `test/`.
- Functions meant for AI scripts must be registered in `src/agent/api.ts`
  (`SCRIPT_API`) **and** described in `SCRIPT_API_REFERENCE` — keep them in sync.
- Run `pnpm typecheck` and `pnpm test` before opening a PR.

## Reference materials

`doc/` holds study notes (Houdini, Substance Designer, the dev plan, the
function reference). Blender/Houdini are **read-only algorithm references** —
code is self-rewritten from public knowledge, never copied (MIT, not GPL).
