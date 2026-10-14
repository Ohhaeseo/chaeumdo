"""Build lightweight SVG paths from attributed V-World-derived GeoJSON.

Input: https://github.com/KnellBalm/kr-admin-geojson (CTPRVN and SIG).
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "tmp/map"
out = root / "frontend/src/map/boundaries.json"

def xy(pair):
    lon, lat = pair
    return ((lon - 125.0) * 100, (38.7 - lat) * 125)

def simplify(points, threshold=0.22):
    if len(points) < 4: return points
    def distance(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        if dx == dy == 0: return ((p[0]-a[0])**2+(p[1]-a[1])**2)**0.5
        t = max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
        return ((p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2)**0.5
    result = [points[0]]
    def walk(first, last):
        far, index = 0, None
        for i in range(first+1,last):
            d = distance(points[i],points[first],points[last])
            if d > far: far,index = d,i
        if index is not None and far > threshold:
            walk(first,index);result.append(points[index]);walk(index,last)
    walk(0,len(points)-1)
    result.append(points[-1])
    return result

def path(geometry):
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    bits = []
    for polygon in polys:
        for ring in polygon:
            points = simplify([xy(p) for p in ring])
            if len(points) < 4: continue
            bits.append("M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in points)+"Z")
    return "".join(bits)

def load(name):
    return json.loads((source / name).read_text(encoding="utf-8"))["features"]

provinces = {f["properties"]["CTPRVN_CD"]:path(f["geometry"]) for f in load("provinces.geojson")}
districts = [{"id":f["properties"]["SIG_CD"],"name":f["properties"]["SIG_KOR_NM"],"province":f["properties"]["CTPRVN_CD"],"path":path(f["geometry"])} for f in load("districts.geojson")]
assert len(provinces)==17 and len(districts)==250
out.write_text(json.dumps({"provinces":provinces,"districts":districts},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
print(f"Wrote {out} ({out.stat().st_size:,} bytes)")
