"""Extract deterministic metadata and reference views from the open .blend file.

Run through Blender:
  blender -b model.blend --python scripts/blend-reference.py -- --out out/ref
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from pathlib import Path

import bpy
from mathutils import Vector


RENDERABLE_TYPES = {"MESH", "CURVE", "SURFACE", "FONT", "META", "VOLUME"}
VIEWS = {
    "front": Vector((0.0, -1.0, 0.0)),
    "right": Vector((1.0, 0.0, 0.0)),
    "back": Vector((0.0, 1.0, 0.0)),
    "top": Vector((0.0, 0.0, 1.0)),
    "perspective": Vector((1.25, -1.55, 1.05)),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", type=int, default=640)
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument("--asset-views", action="store_true")
    parser.add_argument("--asset-limit", type=int, default=0)
    parser.add_argument("--asset-pattern", default="")
    parser.add_argument("--components", action="store_true")
    parser.add_argument("--component-limit", type=int, default=128)
    parser.add_argument("--import-obj")
    argv = []
    if "--" in __import__("sys").argv:
        argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(argv)


def rounded_vec(value: Vector) -> list[float]:
    return [round(float(axis), 6) for axis in value]


def object_bounds(obj: bpy.types.Object) -> list[Vector]:
    if obj.type not in RENDERABLE_TYPES or obj.hide_render:
        return []
    try:
        return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    except (AttributeError, RuntimeError, TypeError):
        return []


def get_scene_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [corner for obj in objects for corner in object_bounds(obj)]
    return bounds_from_corners(corners)


def bounds_from_corners(corners: list[Vector]) -> tuple[Vector, Vector]:
    if not corners:
        return Vector((-0.5, -0.5, -0.5)), Vector((0.5, 0.5, 0.5))
    return (
        Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3))),
        Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3))),
    )


def evaluated_scene_info() -> dict:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    all_corners = []
    bounds_by_owner: dict[str, list[Vector]] = {}
    mesh_count = 0
    vertex_count = 0
    polygon_count = 0
    renderable_count = 0
    for instance in depsgraph.object_instances:
        obj = instance.object
        if obj.type not in RENDERABLE_TYPES:
            continue
        try:
            corners = [instance.matrix_world @ Vector(corner) for corner in obj.bound_box]
        except (AttributeError, RuntimeError, TypeError):
            continue
        all_corners.extend(corners)
        owner = instance.parent.name if instance.is_instance and instance.parent else obj.name
        bounds_by_owner.setdefault(owner, []).extend(corners)
        renderable_count += 1
        if obj.type == "MESH" and obj.data is not None:
            mesh_count += 1
            vertex_count += len(obj.data.vertices)
            polygon_count += len(obj.data.polygons)
    return {
        "corners": all_corners,
        "boundsByOwner": bounds_by_owner,
        "renderableCount": renderable_count,
        "meshCount": mesh_count,
        "vertexCount": vertex_count,
        "polygonCount": polygon_count,
    }


def mesh_stats(obj: bpy.types.Object) -> tuple[int, int]:
    if obj.type != "MESH" or obj.data is None:
        return 0, 0
    return len(obj.data.vertices), len(obj.data.polygons)


def collection_path(obj: bpy.types.Object) -> list[str]:
    return sorted(collection.name for collection in obj.users_collection)


def connected_components(obj: bpy.types.Object, limit: int) -> list[dict]:
    if obj.type != "MESH" or obj.data is None:
        return []
    mesh = obj.data
    parents = list(range(len(mesh.vertices)))
    ranks = [0] * len(mesh.vertices)

    def find(vertex: int) -> int:
        while parents[vertex] != vertex:
            parents[vertex] = parents[parents[vertex]]
            vertex = parents[vertex]
        return vertex

    def union(left: int, right: int) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root == right_root:
            return
        if ranks[left_root] < ranks[right_root]:
            left_root, right_root = right_root, left_root
        parents[right_root] = left_root
        if ranks[left_root] == ranks[right_root]:
            ranks[left_root] += 1

    for polygon in mesh.polygons:
        vertices = polygon.vertices
        if len(vertices) < 2:
            continue
        first = vertices[0]
        for vertex in vertices[1:]:
            union(first, vertex)

    component_vertices: dict[int, list[int]] = {}
    for vertex in range(len(mesh.vertices)):
        component_vertices.setdefault(find(vertex), []).append(vertex)

    component_polygons: dict[int, list[bpy.types.MeshPolygon]] = {}
    for polygon in mesh.polygons:
        if polygon.vertices:
            component_polygons.setdefault(find(polygon.vertices[0]), []).append(polygon)

    components = []
    for root, vertices in component_vertices.items():
        polygons = component_polygons.get(root, [])
        if not polygons:
            continue
        points = [obj.matrix_world @ mesh.vertices[index].co for index in vertices]
        lower, upper = bounds_from_corners(points)
        material_counts: dict[str, int] = {}
        for polygon in polygons:
            if polygon.material_index < len(obj.material_slots):
                material = obj.material_slots[polygon.material_index].material
                name = material.name if material else "unassigned"
            else:
                name = "unassigned"
            material_counts[name] = material_counts.get(name, 0) + 1
        components.append({
            "vertices": len(vertices),
            "polygons": len(polygons),
            "bounds": {"min": rounded_vec(lower), "max": rounded_vec(upper)},
            "dimensions": rounded_vec(upper - lower),
            "center": rounded_vec((lower + upper) * 0.5),
            "materials": [
                {"name": name, "polygons": count}
                for name, count in sorted(material_counts.items(), key=lambda item: (-item[1], item[0].casefold()))
            ],
        })
    components.sort(key=lambda component: (-component["polygons"], -component["vertices"]))
    return components[:limit] if limit > 0 else components


def inventory(objects: list[bpy.types.Object], lower: Vector, upper: Vector, evaluated: dict, include_components: bool, component_limit: int) -> dict:
    entries = []
    for obj in sorted(objects, key=lambda item: item.name.casefold()):
        corners = object_bounds(obj) or evaluated["boundsByOwner"].get(obj.name, [])
        vertices, polygons = mesh_stats(obj)
        entry = {
            "name": obj.name,
            "type": obj.type,
            "collections": collection_path(obj),
            "parent": obj.parent.name if obj.parent else None,
            "location": rounded_vec(obj.matrix_world.translation),
            "dimensions": rounded_vec(obj.dimensions),
            "vertices": vertices,
            "polygons": polygons,
            "materials": [slot.material.name for slot in obj.material_slots if slot.material],
            "instanceCollection": obj.instance_collection.name if obj.instance_collection else None,
        }
        if corners:
            entry["bounds"] = {
                "min": rounded_vec(Vector(tuple(min(c[axis] for c in corners) for axis in range(3)))),
                "max": rounded_vec(Vector(tuple(max(c[axis] for c in corners) for axis in range(3)))),
            }
        if include_components:
            entry["components"] = connected_components(obj, component_limit)
        entries.append(entry)

    collections = []
    for collection in sorted(bpy.data.collections, key=lambda item: item.name.casefold()):
        members = [obj for obj in collection.all_objects if obj in objects]
        if not members:
            continue
        cmin, cmax = get_scene_bounds(members)
        collections.append({
            "name": collection.name,
            "parent": next(
                (candidate.name for candidate in bpy.data.collections if collection.name in candidate.children),
                None,
            ),
            "objectCount": len(members),
            "bounds": {"min": rounded_vec(cmin), "max": rounded_vec(cmax)},
        })

    return {
        "source": bpy.data.filepath,
        "blenderVersion": bpy.app.version_string,
        "scene": bpy.context.scene.name,
        "objectCount": len(objects),
        "renderableCount": evaluated["renderableCount"],
        "meshCount": evaluated["meshCount"],
        "vertexCount": evaluated["vertexCount"],
        "polygonCount": evaluated["polygonCount"],
        "materialCount": len(bpy.data.materials),
        "bounds": {"min": rounded_vec(lower), "max": rounded_vec(upper)},
        "collections": collections,
        "objects": entries,
    }


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def projected_extent(size: Vector, direction: Vector) -> float:
    direction = direction.normalized()
    up = Vector((0.0, 0.0, 1.0))
    if abs(direction.dot(up)) > 0.98:
        up = Vector((0.0, 1.0, 0.0))
    right = direction.cross(up).normalized()
    camera_up = right.cross(direction).normalized()
    half = size * 0.5
    corners = [
        Vector((x * half.x, y * half.y, z * half.z))
        for x in (-1.0, 1.0)
        for y in (-1.0, 1.0)
        for z in (-1.0, 1.0)
    ]
    horizontal = max(abs(corner.dot(right)) for corner in corners) * 2.0
    vertical = max(abs(corner.dot(camera_up)) for corner in corners) * 2.0
    return max(horizontal, vertical)


def make_material() -> bpy.types.Material:
    material = bpy.data.materials.new("Meshova Reference Clay")
    material.diffuse_color = (0.58, 0.67, 0.74, 1.0)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    principled = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = (0.36, 0.52, 0.63, 1.0)
    principled.inputs["Roughness"].default_value = 0.7
    principled.inputs["Metallic"].default_value = 0.0
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def add_area_light(scene: bpy.types.Scene, name: str, location: Vector, energy: float, size: float, target: Vector) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    point_camera(light, target)
    return light


def setup_render(scene: bpy.types.Scene, size: int) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = ""
    scene.render.use_file_extension = True
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    def enable_layer_collection(layer_collection: bpy.types.LayerCollection) -> None:
        layer_collection.exclude = False
        layer_collection.hide_viewport = False
        layer_collection.holdout = False
        layer_collection.indirect_only = False
        for child in layer_collection.children:
            enable_layer_collection(child)

    for view_layer in scene.view_layers:
        view_layer.use = True
        enable_layer_collection(view_layer.layer_collection)

    for collection in bpy.data.collections:
        collection.hide_render = False
        collection.hide_viewport = False
    for obj in bpy.data.objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.hide_render = False

    world = bpy.data.worlds.new("Meshova Reference World")
    world.use_nodes = True
    world.node_tree.nodes.clear()
    background = world.node_tree.nodes.new("ShaderNodeBackground")
    output = world.node_tree.nodes.new("ShaderNodeOutputWorld")
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    background.inputs["Color"].default_value = (0.025, 0.032, 0.04, 1.0)
    background.inputs["Strength"].default_value = 0.38
    scene.world = world

    for obj in scene.objects:
        if obj.type in {"LIGHT", "CAMERA"}:
            obj.hide_render = True

    camera_data = bpy.data.cameras.new("Meshova Reference Camera")
    camera_data.type = "ORTHO"
    camera_data.lens = 52.0
    camera_data.dof.use_dof = False
    camera = bpy.data.objects.new("Meshova Reference Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.hide_render = False
    scene.camera = camera

    lights = [
        add_area_light(scene, "Meshova Key", Vector((0.0, 0.0, 0.0)), 170.0, 1.0, Vector((0.0, 0.0, 0.0))),
        add_area_light(scene, "Meshova Fill", Vector((0.0, 0.0, 0.0)), 70.0, 1.0, Vector((0.0, 0.0, 0.0))),
        add_area_light(scene, "Meshova Rim", Vector((0.0, 0.0, 0.0)), 110.0, 1.0, Vector((0.0, 0.0, 0.0))),
    ]

    clay = make_material()
    for view_layer in scene.view_layers:
        view_layer.material_override = clay
    return camera, lights


def place_lights(lights: list[bpy.types.Object], center: Vector, radius: float) -> None:
    offsets = [Vector((-1.2, -1.5, 1.8)), Vector((1.6, -0.4, 0.8)), Vector((0.2, 1.5, 1.4))]
    light_radius = max(radius, 0.5)
    for light, offset in zip(lights, offsets):
        light.location = center + offset * light_radius
        light.data.size = light_radius
        point_camera(light, center)


def render_bounds(out_dir: Path, lower: Vector, upper: Vector, camera: bpy.types.Object, lights: list[bpy.types.Object]) -> dict:
    scene = bpy.context.scene
    center = (lower + upper) * 0.5
    dimensions = upper - lower
    radius = max(dimensions.length * 0.5, 0.5)
    place_lights(lights, center, radius)
    results = {}

    for name, raw_direction in VIEWS.items():
        direction = raw_direction.normalized()
        camera.location = center + direction * radius * 3.0
        point_camera(camera, center)
        camera.data.ortho_scale = max(projected_extent(dimensions, direction) * 1.14, 0.1)
        scene.render.filepath = str(out_dir / f"{name}.png")
        bpy.context.view_layer.update()
        status = bpy.ops.render.render(write_still=False, scene=scene.name)
        if "FINISHED" in status:
            bpy.data.images["Render Result"].save_render(scene.render.filepath, scene=scene)
        if "FINISHED" not in status or not Path(scene.render.filepath).exists():
            raise RuntimeError(f"render failed for {name}: status={sorted(status)}, path={scene.render.filepath}")
        results[name] = {
            "file": f"{name}.png",
            "direction": rounded_vec(direction),
            "location": rounded_vec(camera.location),
            "orthoScale": round(float(camera.data.ortho_scale), 6),
            "target": rounded_vec(center),
        }
    return results


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^\w\-\u3400-\u9fff]+", "-", value, flags=re.UNICODE).strip("-")
    return cleaned[:80] or "asset"


def replace_scene_with_obj(filepath: str) -> None:
    scene = bpy.context.scene
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.wm.obj_import(filepath=str(Path(filepath).resolve()))


def is_descendant(obj: bpy.types.Object, ancestor: bpy.types.Object) -> bool:
    parent = obj.parent
    while parent:
        if parent == ancestor:
            return True
        parent = parent.parent
    return False


def render_asset_views(out_dir: Path, objects: list[bpy.types.Object], camera: bpy.types.Object, lights: list[bpy.types.Object], limit: int, bounds_by_owner: dict[str, list[Vector]], pattern: str = "") -> list[dict]:
    renderable = [obj for obj in objects if object_bounds(obj) or bounds_by_owner.get(obj.name)]
    if pattern:
        matcher = re.compile(pattern, flags=re.UNICODE)
        renderable = [obj for obj in renderable if matcher.search(obj.name)]
    selected = renderable[:limit] if limit > 0 else renderable
    original_visibility = {obj.name: obj.hide_render for obj in renderable}
    assets = []
    for index, asset in enumerate(selected):
        for obj in objects:
            visible = obj == asset or is_descendant(obj, asset)
            obj.hide_render = not visible
            obj.hide_viewport = not visible
            obj.hide_set(not visible)
        corners = object_bounds(asset) or bounds_by_owner.get(asset.name, [])
        lower = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
        upper = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
        asset_id = f"{index + 1:03d}-{safe_name(asset.name)}"
        asset_dir = out_dir / "assets" / asset_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        print(f"MESHOVA_ASSET [{index + 1}/{len(selected)}] {asset.name}")
        assets.append({
            "id": asset_id,
            "name": asset.name,
            "bounds": {"min": rounded_vec(lower), "max": rounded_vec(upper)},
            "views": render_bounds(asset_dir, lower, upper, camera, lights),
        })
    for obj in renderable:
        obj.hide_render = original_visibility[obj.name]
    return assets


def main() -> None:
    args = parse_args()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.import_obj:
        replace_scene_with_obj(args.import_obj)
    scene = bpy.context.scene
    objects = list(scene.objects)
    evaluated = evaluated_scene_info()
    lower, upper = bounds_from_corners(evaluated["corners"])
    data = inventory(objects, lower, upper, evaluated, args.components, max(0, args.component_limit))
    data["views"] = {}
    data["assets"] = []
    if not args.no_render:
        camera, lights = setup_render(scene, max(128, args.size))
        if not args.asset_views:
            data["views"] = render_bounds(out_dir, lower, upper, camera, lights)
        if args.asset_views:
            data["assets"] = render_asset_views(out_dir, objects, camera, lights, max(0, args.asset_limit), evaluated["boundsByOwner"], args.asset_pattern)
    with (out_dir / "inventory.json").open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print("MESHOVA_REFERENCE", json.dumps({
        "out": str(out_dir),
        "objects": data["objectCount"],
        "meshes": data["meshCount"],
        "polygons": data["polygonCount"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
