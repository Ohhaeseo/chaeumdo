"""Build the Jeju 읍·면·동 boundary layer drawn on the Jeju district map.

Input: HangJeongDong_ver20260401.geojson from https://github.com/vuski/admdongkor
(행정동 경계: 통계청 SGIS 공공누리 제1유형, 가공 vuski/admdongkor, CC BY 4.0 — keep the attribution).
The 2026-04-01 snapshot is the closest to the 2026-03-25 행정동 codes the app uses
(see generate-neighborhoods.py). The projection matches generate-map.py so the layer
lines up with the bundled district paths.

usage: python scripts/generate-jeju-neighborhoods.py <HangJeongDong_ver20260401.geojson>
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEIGHBORHOODS = ROOT / "frontend" / "src" / "map" / "neighborhoods.json"
OUTPUT = ROOT / "frontend" / "public" / "data" / "map" / "jeju-neighborhoods.json"
JEJU = "50"
# Finer than generate-map.py's 0.22: urban 동 in 제주시·서귀포시 are only a few map units wide.
THRESHOLD = 0.03


def xy(pair):
    lon, lat = pair
    return ((lon - 125.0) * 100, (38.7 - lat) * 125)


def simplify(points, threshold=THRESHOLD):
    if len(points) < 4:
        return points

    def distance(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == dy == 0:
            return ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) ** 0.5
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        return ((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2) ** 0.5

    result = [points[0]]

    def walk(first, last):
        far, index = 0, None
        for i in range(first + 1, last):
            d = distance(points[i], points[first], points[last])
            if d > far:
                far, index = d, i
        if index is not None and far > threshold:
            walk(first, index)
            result.append(points[index])
            walk(index, last)

    walk(0, len(points) - 1)
    result.append(points[-1])
    return result


def path(geometry):
    bits = []
    for ring in rings(geometry):
        points = simplify([xy(p) for p in ring])
        if len(points) < 4:
            continue
        bits.append("M" + " ".join(f"{x:.2f},{y:.2f}" for x, y in points) + "Z")
    return "".join(bits)


def rings(geometry):
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    for polygon in polys:
        yield from polygon


def district_border(features):
    """The 제주시/서귀포시 line: edges shared by 동 of different districts, chained into polylines.

    The source is topologically clean (neighbours share identical vertices), so a shared edge
    is found by its two endpoints. Drawing this instead of the bundled district outline keeps
    the border on the same coastline as the 읍·면·동 layer.
    """
    owners = defaultdict(set)
    for feature in features:
        for ring in rings(feature["geometry"]):
            points = [(round(x, 7), round(y, 7)) for x, y in ring]
            for a, b in zip(points, points[1:]):
                if a != b:
                    owners[frozenset((a, b))].add(feature["properties"]["sgg"])
    adjacent = defaultdict(set)
    for edge, districts in owners.items():
        if len(districts) > 1:
            a, b = tuple(edge)
            adjacent[a].add(b)
            adjacent[b].add(a)
    seen = set()
    lines = []
    for start in [v for v in adjacent if len(adjacent[v]) != 2] + list(adjacent):
        for following in list(adjacent[start]):
            if frozenset((start, following)) in seen:
                continue
            seen.add(frozenset((start, following)))
            line, previous, current = [start, following], start, following
            while len(adjacent[current]) == 2:
                after = next(v for v in adjacent[current] if v != previous)
                if frozenset((current, after)) in seen:
                    break
                seen.add(frozenset((current, after)))
                line.append(after)
                previous, current = current, after
            lines.append(line)
    return "".join("M" + " ".join(f"{x:.2f},{y:.2f}" for x, y in simplify([xy(p) for p in line])) for line in lines)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/generate-jeju-neighborhoods.py <HangJeongDong_ver20260401.geojson>")
    sys.setrecursionlimit(10000)
    expected = {item["id"]: item for item in json.loads(NEIGHBORHOODS.read_text(encoding="utf-8")) if item["parentId"].startswith(JEJU)}
    features = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["features"]
    features = [feature for feature in features if feature["properties"]["sido"] == JEJU]
    found = {}
    for feature in features:
        properties = feature["properties"]
        found[properties["adm_cd2"]] = {
            "id": properties["adm_cd2"],
            "name": properties["adm_nm"].split()[-1],
            "district": properties["sgg"],
            "path": path(feature["geometry"]),
        }
    missing = sorted(set(expected) - set(found))
    extra = sorted(set(found) - set(expected))
    if missing or extra:
        raise SystemExit(f"Jeju 읍·면·동 codes differ from neighborhoods.json: missing={missing} extra={extra}")
    for code, item in found.items():
        if item["name"] != expected[code]["name"] or item["district"] != expected[code]["parentId"]:
            raise SystemExit(f"{code}: boundary {item['name']}/{item['district']} vs app {expected[code]['name']}/{expected[code]['parentId']}")
        if not item["path"]:
            raise SystemExit(f"{code}: no ring survived simplification")
    output = {
        "source": "통계청 SGIS 행정동 경계(공공누리 제1유형), 가공 vuski/admdongkor ver20260401 (CC BY 4.0)",
        "districtBorder": district_border(features),
        "neighborhoods": sorted(found.values(), key=lambda item: item["id"]),
    }
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes, {len(found)} 읍·면·동)")


if __name__ == "__main__":
    main()
