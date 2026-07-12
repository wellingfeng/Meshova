from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
MODEL_IDS = [
    "cream-sofa-quilted",
    "blend-ref-modern-sofa",
    "blend-ref-armchair",
    "blend-ref-ottoman",
    "blend-ref-dining-table",
    "blend-ref-dining-chair",
    "blend-ref-coffee-table",
    "blend-ref-cabinet",
    "blend-ref-refrigerator",
    "blend-ref-washing-machine",
    "blend-ref-desktop-monitor",
    "blend-ref-wall-air-conditioner",
    "blend-ref-keyboard",
    "blend-ref-pendant-lamp",
    "blend-ref-wine-bottle",
    "blend-ref-chinese-ornament",
    "blend-ref-indoor-plant",
    "blend-ref-canopy-tree",
    "blend-ref-dracaena",
    "blend-ref-broadleaf-stand",
    "blend-ref-curtain",
    "blend-ref-venetian-blind",
    "blend-ref-european-door",
    "blend-ref-table-lamp",
    "blend-ref-floor-lamp",
    "blend-ref-sculptural-chandelier",
    "blend-ref-copier",
    "blend-ref-service-kiosk",
    "blend-ref-massage-chair",
    "blend-ref-wine-cabinet",
    "blend-ref-side-table",
    "blend-ref-book-row",
    "blend-ref-bar-accessories",
    "blend-ref-tv-wall",
]


def load_reference_module():
    filepath = ROOT / "scripts" / "blend-reference.py"
    spec = importlib.util.spec_from_file_location("meshova_blend_reference", filepath)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filepath}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    reference = load_reference_module()
    separator = sys.argv.index("--") if "--" in sys.argv else -1
    requested_ids = sys.argv[separator + 1:] if separator >= 0 else []
    for model_id in requested_ids or MODEL_IDS:
        source = ROOT / "out" / f"{model_id}.obj"
        out_dir = ROOT / "out" / "blend-candidates" / model_id
        out_dir.mkdir(parents=True, exist_ok=True)
        reference.replace_scene_with_obj(str(source))
        scene = bpy.context.scene
        evaluated = reference.evaluated_scene_info()
        lower, upper = reference.bounds_from_corners(evaluated["corners"])
        camera, lights = reference.setup_render(scene, 512)
        reference.render_bounds(out_dir, lower, upper, camera, lights)
        print(f"MESHOVA_CANDIDATE {model_id}")


if __name__ == "__main__":
    main()
