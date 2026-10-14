"""Generate app and Flyway 읍·면·동 data from the MOIS 행정동 workbook.

Source snapshot: 2026-03-25, chosen because it matches the district boundaries
currently bundled in the app (before the 2026-07 administrative reorganization).
Requires: openpyxl
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
BOUNDARIES = ROOT / "frontend" / "src" / "map" / "boundaries.json"
OUTPUT_JSON = ROOT / "frontend" / "src" / "map" / "neighborhoods.json"
OUTPUT_SQL = ROOT / "backend" / "src" / "main" / "resources" / "db" / "migration" / "V7__neighborhood_regions.sql"


def legacy_district_id(current_id: str) -> str:
    """Normalize newer district codes to the boundary snapshot's stable IDs."""
    if current_id.startswith("52"):  # 전북특별자치도: boundary snapshot uses 45xxx
        return "45" + current_id[2:]
    if current_id.startswith("4119"):  # 부천시 3개 일반구 -> bundled 부천시 polygon
        return "41190"
    if current_id.startswith("4159"):  # 화성시 4개 일반구 -> bundled 화성시 polygon
        return "41590"
    return current_id


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/generate-neighborhoods.py <KIKcd_H.xlsx>")

    workbook_path = Path(sys.argv[1])
    boundaries = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
    district_ids = {item["id"] for item in boundaries["districts"]}
    sheet = load_workbook(workbook_path, read_only=True).active
    records: list[dict[str, str]] = []

    for code, _province_name, _district_name, name, _created, deleted in sheet.iter_rows(min_row=2, values_only=True):
        if not name or deleted:
            continue
        region_id = str(code)
        parent_id = legacy_district_id(region_id[:5])
        if parent_id not in district_ids:
            raise ValueError(f"No district boundary for {region_id} {name}: {parent_id}")
        records.append({"id": region_id, "name": str(name), "parentId": parent_id})

    records.sort(key=lambda item: (item["parentId"], item["name"], item["id"]))
    OUTPUT_JSON.write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    values = ",\n".join(
        f"({sql_text(item['id'])},{sql_text(item['name'])},{sql_text('adm-' + item['id'])},false,'',{sql_text(item['parentId'])},'neighborhood')"
        for item in records
    )
    migration = f"""-- 행정안전부 행정기관(행정동) 및 관할구역 2026-03-25 시행본.
-- The bundled map predates the 2026-07 reorganization, so Jeonbuk, Bucheon and
-- Hwaseong parent codes are normalized to the matching district polygons.
ALTER TABLE trip DROP CONSTRAINT trip_region_id_fkey;
ALTER TABLE trip_region DROP CONSTRAINT trip_region_region_id_fkey;
ALTER TABLE region DROP CONSTRAINT region_parent_id_fkey;

ALTER TABLE region ALTER COLUMN id TYPE VARCHAR(10);
ALTER TABLE region ALTER COLUMN parent_id TYPE VARCHAR(10);
ALTER TABLE trip ALTER COLUMN region_id TYPE VARCHAR(10);
ALTER TABLE trip_region ALTER COLUMN region_id TYPE VARCHAR(10);

ALTER TABLE region DROP CONSTRAINT region_level_check;
ALTER TABLE region ALTER COLUMN level TYPE VARCHAR(12);
ALTER TABLE region ADD CONSTRAINT region_level_check
  CHECK (level IN ('province','district','neighborhood'));

ALTER TABLE region ADD CONSTRAINT region_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES region(id);
ALTER TABLE trip ADD CONSTRAINT trip_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES region(id);
ALTER TABLE trip_region ADD CONSTRAINT trip_region_region_id_fkey
  FOREIGN KEY (region_id) REFERENCES region(id);

INSERT INTO region(id,name,map_key,recommended,introduction,parent_id,level) VALUES
{values};
"""
    OUTPUT_SQL.write_text(migration, encoding="utf-8")
    print(f"generated {len(records)} neighborhoods")


if __name__ == "__main__":
    main()
