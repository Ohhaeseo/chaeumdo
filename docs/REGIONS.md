# 행정구역 데이터 갱신 절차

행정동은 해마다 신설·분리·통합되고, 시·군·구도 개편됩니다. 지역 코드는 여행 기록이 직접 가리키는 열쇠라서, 갱신할 때 가장 중요한 것은 **이미 저장된 기록이 가리키는 코드를 잃지 않는 것**입니다.

## 지금 기준

| 층 | 원본 | 기준일 |
|---|---|---|
| 시·도 17·시·군·구 250 경계 | [KnellBalm/kr-admin-geojson](https://github.com/KnellBalm/kr-admin-geojson) (국가공간정보포털·V-World) | 2023-07-29 경계 |
| 읍·면·동 3,627 코드·이름 | 행정안전부 「행정기관(행정동) 및 관할구역(법정동) 변경내역」 | 2026-03-25 시행본 |
| 제주 읍·면·동 43 경계 | [vuski/admdongkor](https://github.com/vuski/admdongkor) `ver20260401` (통계청 SGIS) | 2026-04-01 |

번들 경계가 2026년 7월 행정구역 개편 이전 기준이라, 읍·면·동도 같은 시점의 3월 자료를 쓰고 있습니다. 이 때문에 다음을 정규화합니다(`scripts/generate-neighborhoods.py`의 `legacy_district_id`).

- 전북특별자치도의 새 코드 `52xxx`는 경계의 `45xxx`로 바꿉니다.
- 부천시 일반구 3곳(`4119x`)과 화성시 일반구 4곳(`4159x`)은 시 하나의 경계(`41190`, `41590`)에 묶습니다.
- 강원특별자치도는 경계 원본 코드 `51`을 앱 내부 코드 `42`로 씁니다(`KoreaMap`·`data.ts`의 `appProvinceId`).

## 데이터가 있는 곳

| 파일 | 내용 | 만드는 스크립트 |
|---|---|---|
| `frontend/public/data/map/boundaries.json` | 시·도·시·군·구 SVG 경로 | `scripts/generate-map.py` |
| `frontend/src/map/districts.json` | 시·군·구 코드·이름 | `scripts/generate-map.py` |
| `frontend/src/map/neighborhoods.json` | 읍·면·동 코드·이름·상위 코드 | `scripts/generate-neighborhoods.py` |
| `frontend/public/data/map/jeju-neighborhoods.json` | 제주 읍·면·동 경로 | `scripts/generate-jeju-neighborhoods.py` |
| `backend/.../db/migration/V1, V4, V7` | 서버 `region` 테이블(시·도, 시·군·구, 읍·면·동) | V4는 `scripts/generate-region-migration.py`, V7은 `generate-neighborhoods.py` |

개수를 확인하는 곳도 함께 고쳐야 합니다.

| 위치 | 확인하는 개수 |
|---|---|
| `frontend/src/mapData.ts` | 17·250·제주 43 |
| `frontend/tests/map-data.test.mjs` | 250 |
| `scripts/generate-map.py` | 17·250 |
| `scripts/smoke-api.mjs` | 지역 3,894개와 PASS 문구 |
| README·SYSTEM·MAP 문서의 숫자 | 문서에 적힌 개수 |

원본 파일은 `tmp/`에 받아 두고 Git에는 넣지 않습니다.

## 지켜야 할 것

1. **이미 적용된 Flyway 파일(V1~V최신)은 고치지 않습니다.** Flyway는 적용한 파일의 체크섬을 기억하므로, 고치면 운영 서버가 시작하지 못합니다. 바뀐 내용은 항상 새 번호의 마이그레이션으로 냅니다. `generate-neighborhoods.py`가 V7을 다시 쓰도록 되어 있으니, 갱신 때는 출력 경로를 새 파일로 바꾸고 차이분만 남깁니다.
2. **기록이 가리키는 코드를 지우지 않습니다.** `trip.region_id`, `trip_region.region_id`, `region_cover.region_id`가 `region`을 외래 키로 가리킵니다. 통합·분리·폐지된 코드는 먼저 기록을 새 코드로 옮긴 뒤에만 지울 수 있습니다.
3. **체험 모드 기록은 서버 마이그레이션이 닿지 않습니다.** 사용자의 브라우저(IndexedDB)에 옛 코드 그대로 남습니다. 앱은 지역을 프론트 JSON으로 찾으므로, 옛 코드를 새 코드로 바꾸는 표를 프론트에도 두어 읽을 때 바꿔야 합니다(`data.ts`의 `regionIdsForTrip` 근처). 이 표가 없으면 그 기록의 지역 이름과 지도 표시가 사라집니다.
4. 경계와 읍·면·동 코드의 기준일을 맞춥니다. 경계만 새로 받으면 읍·면·동의 상위 코드가 경계에 없어 스크립트가 멈춥니다. 이 동작은 의도된 것입니다.

## 순서

1. **원본 받기**: 행정안전부 행정동 엑셀(`KIKcd_H.xlsx`), 필요하면 새 경계 GeoJSON, 제주 경계를 `tmp/`에 받습니다.
2. **바뀐 코드 표 만들기**: 이전 판과 새 판을 코드로 비교해 신설, 폐지, 이름 변경, 통합·분리(옛 코드 → 새 코드)로 나눕니다. 운영 DB에서 영향받는 기록 수도 셉니다.
   ```sql
   SELECT region_id, count(*) FROM trip_region WHERE region_id IN (...옛 코드...) GROUP BY 1;
   ```
3. **새 마이그레이션 쓰기**(`V<다음 번호>__regions_<기준일>.sql`), 한 트랜잭션 안에서 아래 순서로 처리합니다.
   1. 신설 지역을 `INSERT`
   2. 이름이 바뀐 지역을 `UPDATE region SET name=…`
   3. 통합·분리된 코드를 쓰는 기록을 `UPDATE trip_region`, `UPDATE trip`, (시·도면) `UPDATE region_cover`로 새 코드에 옮김. 한 기록에 같은 새 코드가 두 번 생기면 `trip_region` 기본 키에 걸리므로 중복을 먼저 지움
   4. 더는 아무도 가리키지 않는 폐지 코드를 `DELETE`
4. **프론트 데이터 재생성**: `python scripts/generate-neighborhoods.py tmp/…/KIKcd_H.xlsx`로 JSON을 다시 만들고, 경계가 바뀌었으면 `generate-map.py`와 `generate-jeju-neighborhoods.py`도 다시 실행합니다. 정규화 규칙(`legacy_district_id`)도 새 기준에 맞게 고칩니다.
5. **체험 모드용 옛 코드 표**를 프론트에 추가합니다(지켜야 할 것 3).
6. **개수와 문서 갱신**: 위 표의 개수 검사, README "지도 데이터" 행, `docs/MAP.md` 기준일, 화면 하단 출처 문구를 고칩니다.
7. **검증**:
   - `npm test`, `npm run build`, `./mvnw test`를 돌립니다.
   - 운영 DB 사본에 새 마이그레이션을 적용해 기록 수와 지역 연결이 유지되는지 확인합니다.
   - `smoke-api.mjs`를 돌리고, 바뀐 지역의 지도와 목록을 브라우저에서 확인합니다.

## 2026년 7월 개편을 반영하려면

번들 경계가 개편 이전이라 지금은 위 정규화로 버팁니다. 개편을 반영하려면 개편 이후 시·군·구 경계(전북 `52` 코드, 부천·화성 일반구 경계 포함)와 같은 시점의 행정동 자료가 함께 필요합니다. 기존 `45xxx`, `41190`, `41590`을 가리키는 기록은 위 3단계 방식으로 새 코드로 옮깁니다.
