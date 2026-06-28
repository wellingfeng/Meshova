# Open Character Assets For Testing

## Conclusion

Use MakeHuman Community CC0 assets as Meshova's temporary humanoid test base.

Reason: MakeHuman's asset files include a production-oriented humanoid base mesh
and sparse target deltas. This matches Meshova CharacterKit's required shape:

```text
fixed topology base mesh + sparse vertex delta targets + optional rig/clothes
```

## Chosen Source

- Source: <https://github.com/makehumancommunity/makehuman>
- Copied files: `assets/third_party/makehuman/`
- License file: `assets/third_party/makehuman/LICENSE.ASSETS.md`
- License: CC0 1.0 Universal

Copied subset:

- `makehuman/data/3dobjs/base.obj`
- selected `makehuman/data/targets/**/*.target` files for macro shape, height,
  weight, muscle, proportions, torso, head, hands, feet, arms, and legs.

Boundary: no MakeHuman application code is copied. Only asset files.

## Why This Fits Meshova

MakeHuman `.target` files are already sparse morph deltas:

```text
vertexIndex dx dy dz
```

That maps directly to CharacterKit morph targets. This is much closer to
Character Creator/MetaHuman architecture than primitive assembly.

## Sources To Avoid For Core Tests

- MetaHuman: useful architecture reference, not usable as Meshova source assets.
- Mixamo: useful for animation testing, not safe to redistribute as library data.
- Sketchfab character uploads: often CC-BY or unclear third-party IP; poor fit for
  reusable base topology.
- GPL/AGPL character generators: avoid copying code or GPL-bound assets into
  Meshova core.

## Current Test Flow

```bash
pnpm makehuman-base
pnpm shot out/makehuman-female-test.json front,persp
```

Generated outputs live under `out/` and are not source assets.

The viewer also has `MakeHuman CC0实时Morph`, which loads `base.obj` plus the
selected `.target` files directly. Its sliders rebuild the body mesh from sparse
vertex deltas, so parameter edits change the actual topology positions rather
than only reusing static JSON.
