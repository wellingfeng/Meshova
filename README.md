# Meshova

Web procedural modeling + procedural PBR material library, driven by AI-written scripts.

## 在线预览

<p>
  <a href="https://wellingfeng.github.io/Meshova/index.html">
    <strong>打开 Meshova 在线模型库</strong>
  </a>
</p>

<p>
  <a href="https://wellingfeng.github.io/Meshova/index.html">
    <img src="docs/assets/meshova-gallery.png" alt="Meshova 在线模型库截图" width="100%" />
  </a>
</p>

- **Script-first DSL** (restricted TypeScript calling the library), not node graphs — code is the AI's native language.
- **WebGPU** for compute acceleration and PBR + IBL rendering.
- **Headless screenshot loop** so an AI can write a script → render → self-evaluate the image → revise. This visual self-iteration is the core differentiator vs. black-box text-to-3D.
- **Shared kernel**: geometry and material reuse the same noise/pattern functions, sandbox, screenshot loop, and AI orchestration. Geometry ships first; material is a small increment on top.

Self-rewritten from public algorithm knowledge. MIT licensed. Blender source is used only as a read-only algorithm reference, never copied (GPL).

## Status

Implemented core stack:

| Module | What |
| --- | --- |
| `math` | immutable `vec2` / `vec3` / scalar helpers (clamp, lerp, remap, smoothstep) |
| `random` | deterministic seeded PRNG (xoshiro128**), `fork()` for independent streams |
| `random` | seeded Perlin noise (`noise2`/`noise3`) + fractal Brownian motion (`fbm2`/`fbm3`) |
| `sandbox` | restricted script execution with a loop guard (op budget + wall-clock timeout) |
| `geometry` | primitives, transforms, curves/sweep, scatter, CSG, subdivision, fields |
| `geometry` | non-destructive modifier stacks with ordered evaluation, toggles, and stage previews |
| `geometry` | Houdini-style `Ramp`, `PointCloud`, `InstancePlan`, `copyToPoints` flow |
| `texture` | procedural PBR fields, presets, PNG export, browser material baking |
| `viewer` | live procedural model editor plus headless screenshots |

Determinism is a hard requirement: same seed → same result, so screenshot tests and AI reproduction stay stable.

## Develop

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # emit dist/
pnpm view        # live viewer
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, hard invariants, and
how to update the deterministic shape-regression baseline.

## `/meshova` slash command

Claude Code users can call `/meshova` as the unified AI modeling entry. Give it
a text description or a local reference image. It writes a deterministic,
re-runnable procedural JS script, runs it in the Meshova sandbox, renders several
views, reviews the result, and iterates. The result stays procedural instead of
becoming a baked-only mesh.

```text
/meshova A cartoon corgi wearing goggles and a jetpack
/meshova refs/chair.png Preserve the armrest silhouette and use dark leather
```

The command is defined in [`.claude/commands/meshova.md`](.claude/commands/meshova.md).
Before first use, install dependencies and build `dist/`:

```bash
pnpm install
pnpm build
pnpm exec playwright install chromium
```

Its closed loop is:

```text
prompt/image -> restricted JS -> sandbox -> multi-view render -> score/review -> revise
```

Generated scripts, renders, review data, and optional OBJ/MTL files go under
`out/meshova/<id>/`. Successful runs also publish viewer data to `out/<id>.json`
and register the model in `out/models.json`. Run `pnpm view`, then open
`/web/gallery.html` or `/web/index.html?model=<id>`.

The slash command uses the same CLI backend, which is also available directly:

| Command | Purpose |
| --- | --- |
| `pnpm meshova ref` | Print the JS DSL available inside the sandbox. |
| `pnpm meshova run <script.js> --name <id>` | Execute one iteration and publish its viewer model. |
| `pnpm meshova prep-image <reference.png>` | Copy the reference PNG to the standard loop location. |
| `pnpm meshova contracts` | List built-in reconstruction contracts. |
| `pnpm meshova contract <id>` | Print one reconstruction contract. |
| `pnpm meshova sculpt <reference.png>` | Run the staged image-to-model loop through an OpenAI-compatible API. |

`run` accepts `--views`, `--material`, `--title`, `--ref`, `--obj`,
`--no-render`, and `--no-publish`. `sculpt` accepts `--name`, `--contract`,
`--hint`, `--iterations`, and `--target`; configure it with `OPENAI_API_KEY`,
and optionally `OPENAI_MODEL` or `OPENAI_ENDPOINT`.

## Example: copy-to-points flow

```ts
import { box, copyToPoints, makePointCloud, pointAttribute, storePointAttribute, vec3 } from "meshova";

let pc = makePointCloud({ points: [vec3(0, 0, 0), vec3(2, 0, 0)] });
pc = storePointAttribute(pc, "scale", (ctx) => 1 + ctx.index);

const instances = copyToPoints(pc, box(1, 1, 1), {
  scale: pointAttribute("scale"),
  alignToNormal: false,
});
```

## Example: deterministic noise

```ts
import { makeNoise, fbm2, makeRng } from "meshova";

const noise = makeNoise(7);
const height = fbm2(noise, 0.5, 0.5, { octaves: 5 });

const rng = makeRng(7);
const jitter = rng.range(-0.1, 0.1); // same seed → same value, every run
```

## Example: non-destructive modifier stack

```ts
import {
  applyModifierStack,
  bevelModifier,
  booleanModifier,
  box,
  curveDeformModifier,
  maskModifier,
  mirrorModifier,
  polyline,
  subdivisionModifier,
  vec3,
} from "meshova";

const result = applyModifierStack(box(1, 1, 1), [
  bevelModifier({ width: 0.08, segments: 2 }),
  mirrorModifier({ axes: ["x", "z"], bisect: true, clip: true }),
  subdivisionModifier({ mode: "catmull-clark", levels: 1 }),
]);
```

Modifiers that depend on other geometry use stable keys from a shared context:

```ts
const cutter = box(0.4, 2, 0.4);
const cutResult = applyModifierStack(
  box(1, 1, 1),
  [booleanModifier({ operation: "subtract", target: "cutter" })],
  { meshes: { cutter } },
);
```

Curves and face selections use the same stable-key context pattern:

```ts
const guide = polyline([vec3(0, 0, 0), vec3(0, 4, 0)]);
const deformed = applyModifierStack(
  box(4, 0.2, 0.2),
  [
    curveDeformModifier({ curve: "guide", axis: "x" }),
    maskModifier({ faceSet: "front" }),
  ],
  { curves: { guide }, faceSets: { front: [0, 1] } },
);
```

Built-ins include transform, mirror, array, bevel, solidify, subdivision,
displace, bend, twist, taper, stretch, normal, boolean, voxel remesh, clean,
lattice, cloth, surface scatter, smooth, decimate, wireframe, shrinkwrap,
weighted normal, edge split, curve deform, build, mask, screw, skin, cast,
wave, Laplacian smooth, and corrective smooth.

## License

MIT. See [LICENSE](./LICENSE).
