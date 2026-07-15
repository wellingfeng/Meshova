---
name: meshova
description: Generate deterministic procedural 3D models and procedural PBR materials with Meshova from text descriptions or local reference images. Use when the user invokes $meshova or asks Codex to create, fit, render, review, or iteratively improve a Meshova model while keeping a rerunnable script as the source artifact.
---

# Meshova

Turn text or reference images into rerunnable procedural scripts. Iterate through Meshova's sandbox, renderer, deterministic scores, and visual review. Never replace the script source with a baked-only mesh.

## Classify Input

- Treat an existing `.png`, `.jpg`, `.jpeg`, or `.webp` path as image-to-model input. Prioritize silhouette IoU and shape consistency; match material category rather than pixels.
- Treat other input as a text description.

## Run the Loop

1. Check for `dist/`. Run `pnpm build` when missing or stale.
2. Read the available DSL before writing code:

   ```bash
   node scripts/meshova.mjs ref
   ```

   Call only listed functions. End the script with `return [part(...), ...]`. Choose `part(name, mesh, [r,g,b])` for flat color, `coloredPart(name, mesh, colorFn)` for geometry-driven vertex color, or `surfacePart(name, mesh, type, params)` for physical materials such as glass, liquid, metal, or fabric.

3. For image input, normalize the reference:

   ```bash
   node scripts/meshova.mjs prep-image "<image-path>"
   ```

4. Write a restricted synchronous JS snippet to `out/meshova/<id>.js`. Use no imports, async code, `Math.random()`, or `Date.now()`. Prefer shape builders, deformers, and metaballs over disconnected primitive piles for continuous forms.
5. Run one closed-loop pass:

   ```bash
   node scripts/meshova.mjs run out/meshova/<id>.js --views persp,front,side --name <id> --title "<display-name>"
   node scripts/meshova.mjs run out/meshova/<id>.js --views front,side,persp --name <id> --title "<display-name>" --ref out/meshova/ref.png
   ```

   Read the returned JSON fields: `ok`, `error`, `stats`, `renders`, optional `score`, and `published`. Keep default publishing unless the user requests `--no-publish`.

6. Inspect every rendered PNG with image viewing tools. Use `stats` for scale and bounds. Fix script errors, proportions, silhouette, parts, colors, and materials. For image input, target silhouette IoU of at least `0.9` when feasible.
7. Iterate 2-4 passes or until the result is recognizable and stable. Reuse the same `--name` so accepted output updates in place.

## Preserve Invariants

- Keep all randomness seeded and all core output deterministic.
- Generate PBR data procedurally. Do not bake the reference photo into geometry or textures.
- Keep raw part names as internal keys; expose human-readable semantic labels.
- Use existing DSL by default. When explicitly extending it, register new functions in both `SCRIPT_API` and `SCRIPT_API_REFERENCE` in `src/agent/api.ts`.
- If Playwright Chromium is unavailable, run with `--no-render` to validate the script and clearly report the missing visual review.

## Report Results

Report the final script, render paths, viewer URL, and image score when present. Mention optional OBJ/MTL output only when generated with `--obj`. The viewer runs with `pnpm view`; open `/web/gallery.html` or `/web/index.html?model=<id>`.
