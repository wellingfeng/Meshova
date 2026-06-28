# MakeHuman CC0 Test Assets

Source: <https://github.com/makehumancommunity/makehuman>

Files in this directory were copied from the MakeHuman Community repository for
Meshova character pipeline tests only.

- `base.obj`: `makehuman/data/3dobjs/base.obj`
- `targets/*.target`: selected macro, body, torso, head, hand, foot, arm, and
  leg sparse morph deltas used by the live viewer.
- `LICENSE.ASSETS.md`: MakeHuman asset license, CC0 1.0 Universal.

Important boundary: only CC0 asset files are copied here. MakeHuman code is not
copied or linked.

Use:

```bash
pnpm makehuman-base
```

This creates viewer-ready JSON/OBJ outputs under `out/`.

The browser viewer also exposes a live `MakeHuman CC0实时Morph` entry. It loads
`base.obj` plus `.target` files directly and rebuilds the mesh when sliders
change.
