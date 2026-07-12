import json
import os
import unreal


ASSETS = [
    "/Game/Defect/PCG/Graph/Biomes/PCG_BiomeRiver",
]


def simple_value(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [simple_value(item) for item in value]
    return str(value)


def inspect_object(obj, property_names):
    result = {"class": obj.get_class().get_name(), "path": obj.get_path_name()}
    for name in property_names:
        try:
            result[name] = simple_value(obj.get_editor_property(name))
        except Exception:
            pass
    return result


def inspect_graph(graph):
    result = inspect_object(graph, ["description", "user_parameters"])
    nodes = []
    settings_attributes = {}
    for node in graph.get_editor_property("nodes"):
        item = inspect_object(node, ["position_x", "position_y", "node_title", "node_comment", "enabled"])
        settings = None
        for name in ("settings_interface", "settings"):
            try:
                settings = node.get_editor_property(name)
                if settings:
                    break
            except Exception:
                pass
        if settings:
            class_name = settings.get_class().get_name()
            if class_name not in settings_attributes:
                settings_attributes[class_name] = [
                    name for name in dir(settings)
                    if not name.startswith("_")
                ]
            item["settings"] = inspect_object(settings, [
                "density_function", "density_mode", "density_min", "density_max",
                "looseness", "point_extents", "seed", "attribute_name",
                "filter_on_tags", "filtered_tags", "excluded_tags",
                "target_actor", "target_attribute", "source_attribute",
                "operation", "input_source", "output_target", "property_name",
                "bounds_modifier", "rotation_min", "rotation_max",
                "scale_min", "scale_max", "translation_min", "translation_max",
                "surface_sampler_settings", "points_per_squared_meter",
                "mesh_selector_type", "mesh_selector_parameters",
                "blueprint_element_type", "subgraph", "actor_selector",
                "spline_mode", "mode", "dimension", "fill", "num_samples",
            ])
        for pin_group in ("input_pins", "output_pins"):
            try:
                pin_items = []
                for pin in node.get_editor_property(pin_group):
                    pin_item = inspect_object(pin, ["label", "properties"])
                    try:
                        pin_item["edges"] = [
                            inspect_object(edge, ["input_pin", "output_pin"])
                            for edge in pin.get_editor_property("edges")
                        ]
                    except Exception:
                        pass
                    pin_items.append(pin_item)
                item[pin_group] = pin_items
            except Exception:
                pass
        nodes.append(item)
    result["nodes"] = nodes
    result["settings_attributes"] = settings_attributes
    return result


def inspect_data_table(table):
    result = inspect_object(table, ["row_struct"])
    try:
        result["row_names"] = simple_value(
            unreal.DataTableFunctionLibrary.get_data_table_row_names(table)
        )
    except Exception:
        result["row_names"] = []
    return result


def main():
    report = {}
    for path in ASSETS:
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if not asset:
            report[path] = {"error": "asset not loaded"}
            continue
        class_name = asset.get_class().get_name()
        if class_name == "PCGGraph":
            report[path] = inspect_graph(asset)
        elif class_name == "DataTable":
            report[path] = inspect_data_table(asset)
        else:
            report[path] = inspect_object(asset, ["pcg_component", "biome", "data_table"])

    output = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "out", "ue-pcg-river.json"))
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    unreal.log("Meshova PCG report: " + output)


main()
