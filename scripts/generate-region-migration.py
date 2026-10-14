"""Generate the district seed section for the hierarchical region migration."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
features = json.loads((root / "tmp/map/districts.geojson").read_text(encoding="utf-8"))["features"]
province_ids = {"51": "42"}

header = """-- Expand the former province-only region key without losing existing trips.
ALTER TABLE trip DROP CONSTRAINT trip_region_id_fkey;
ALTER TABLE region ALTER COLUMN id TYPE VARCHAR(5);
ALTER TABLE trip ALTER COLUMN region_id TYPE VARCHAR(5);
ALTER TABLE region ADD COLUMN parent_id VARCHAR(5);
ALTER TABLE region ADD COLUMN level VARCHAR(10) NOT NULL DEFAULT 'province'
  CHECK (level IN ('province','district'));

INSERT INTO region(id,name,map_key,recommended,introduction,parent_id,level) VALUES
"""

rows = []
for feature in features:
    props = feature["properties"]
    district_id = props["SIG_CD"]
    name = props["SIG_KOR_NM"].replace("'", "''")
    parent = province_ids.get(props["CTPRVN_CD"], props["CTPRVN_CD"])
    rows.append(f"('{district_id}','{name}','sig-{district_id}',false,'','{parent}','district')")

footer = """;

ALTER TABLE region ADD CONSTRAINT region_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES region(id);
ALTER TABLE trip ADD CONSTRAINT trip_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES region(id);
CREATE INDEX region_parent_name ON region(parent_id,name);
"""

out = root / "backend/src/main/resources/db/migration/V4__district_regions.sql"
out.write_text(header + ",\n".join(rows) + footer, encoding="utf-8")
print(f"Wrote {out} with {len(rows)} districts")
