import { Fragment, type KeyboardEvent } from "react";
import { districts, mostRecentTripForRegion, provinces, type Region, type Trip } from "./data";
import { useMapBoundaries } from "./mapData";
import { needsPhotoPin, shapeMetrics } from "./mapShape.mjs";

const points: Record<string, [number, number]> = {
  "11": [202, 145], "26": [408, 455], "27": [360, 354], "28": [138, 168],
  "29": [180, 442], "30": [236, 300], "31": [431, 395], "36": [225, 265],
  "41": [220, 190], "42": [320, 125], "43": [280, 238], "44": [175, 285],
  "45": [210, 362], "46": [180, 485], "47": [380, 281], "48": [320, 425], "50": [150, 650],
};
// National photo pin: white ring radius and photo radius. The name sits inside the photo,
// so a pin covers no more than its circle and leaves neighbouring labels readable.
const PIN_RADIUS = 33;
const PIN_PHOTO_RADIUS = 30;

const appProvinceId = (boundaryId: string) => boundaryId === "51" ? "42" : boundaryId;

// Boundaries do not change while the app runs, so each path is measured once.
const measured = new Map<string, ReturnType<typeof shapeMetrics>>();
function metrics(path: string) {
  let value = measured.get(path);
  if (!value) measured.set(path, value = shapeMetrics(path));
  return value;
}

function pressable(action: () => void) {
  return {
    role: "button", tabIndex: 0, onClick: action,
    onKeyDown: (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); } },
  };
}

function MapLoadState({ error, retry }: { error: string; retry: () => void }) {
  if (error) return <div className="map-load-state map-load-error" role="alert"><p>{error}</p><button onClick={retry}>다시 불러오기</button></div>;
  return <div className="map-load-state" role="status" aria-live="polite"><span className="map-loading-mark" /><p>지도를 불러오고 있어요.</p></div>;
}

export default function KoreaMap({ trips, onProvince }: { trips: Trip[]; onProvince: (region: Region) => void }) {
  const { boundaries, error, retry } = useMapBoundaries();
  if (!boundaries) return <MapLoadState error={error} retry={retry} />;
  const byId = new Map(provinces.map(region => [region.id, region]));
  const items = Object.entries(boundaries.provinces).flatMap(([id, path]) => {
    const region = byId.get(appProvinceId(id));
    if (!region) return [];
    const shape = metrics(path);
    const trip = mostRecentTripForRegion(trips, region.id);
    return [{ region, path, shape, trip, pinned: Boolean(trip) && needsPhotoPin(shape.area, PIN_RADIUS * 2) }];
  });
  return <svg className="korea-svg" viewBox="5 0 540 710" role="img" aria-label="대한민국 시·도 여행 지도">
    <defs>{items.map(({ region, path, trip, pinned }) => trip && <Fragment key={region.id}>
      <clipPath id={`province-photo-${region.id}`}><path d={path} clipRule="evenodd" /></clipPath>
      {pinned && <clipPath id={`pin-${region.id}`}><circle cx={points[region.id][0]} cy={points[region.id][1]} r={PIN_PHOTO_RADIUS} /></clipPath>}
    </Fragment>)}</defs>
    {items.map(({ region, path, shape, trip }) => <g key={region.id} className="province-region" {...pressable(() => onProvince(region))} aria-label={`${region.name}, ${trip ? "방문" : region.recommended ? "추천 여행지" : "미방문"}, 시·군·구 보기`}>
      <path d={path} fill={trip ? "#E5E5E2" : region.recommended ? "#F7F7F5" : "#FFFFFF"} fillRule="evenodd" stroke="#696973" strokeWidth="1.4" className="province-path" />
      {trip && <>
        <image href={trip.thumbnailUrl} x={shape.main.x} y={shape.main.y} width={shape.main.width} height={shape.main.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#province-photo-${region.id})`} className="region-photo" />
        {/* The photo covers the inner half of the border, so the border is drawn again on top. */}
        <path d={path} fill="none" stroke="#696973" strokeWidth="1.4" />
      </>}
    </g>)}
    <g pointerEvents="none">{boundaries.districts.map(district => <path key={district.id} d={district.path} fill="none" stroke="#E5E5E2" strokeWidth="0.8" />)}</g>
    {items.map(({ region, trip, pinned }) => {
      const [x, y] = points[region.id];
      if (!trip) return <text key={region.id} x={x} y={y} textAnchor="middle" className="map-label" pointerEvents="none">{region.name}</text>;
      if (pinned) return null;
      const labelWidth = region.name.length * 12 + 16;
      return <g key={region.id} className="map-photo-label" pointerEvents="none"><rect x={x - labelWidth / 2} y={y - 10} width={labelWidth} height="20" rx="10" /><text x={x} y={y + 4} textAnchor="middle">{region.name}</text></g>;
    })}
    {/* Pins go last so a neighbour's label never covers a photo. The province shape stays the one tab stop. */}
    {items.map(({ region, trip, pinned }) => {
      if (!trip || !pinned) return null;
      const [x, y] = points[region.id];
      const labelWidth = region.name.length * 12 + 16;
      return <g key={region.id} className="photo-marker" aria-hidden="true" onClick={() => onProvince(region)}>
        <circle cx={x} cy={y} r={PIN_RADIUS} fill="#FFFFFF" />
        <image href={trip.thumbnailUrl} x={x - PIN_PHOTO_RADIUS} y={y - PIN_PHOTO_RADIUS} width={PIN_PHOTO_RADIUS * 2} height={PIN_PHOTO_RADIUS * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#pin-${region.id})`} />
        <g className="map-photo-label"><rect x={x - labelWidth / 2} y={y + 6} width={labelWidth} height="18" rx="9" /><text x={x} y={y + 19} textAnchor="middle">{region.name}</text></g>
      </g>;
    })}
  </svg>;
}

type Bounds = { x: number; y: number; width: number; height: number; cx: number; cy: number };
function pathBounds(path: string): Bounds {
  const values = (path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const seoulLabelPoints: Record<string, [number, number]> = {
  "11110": [198.0, 137.5], "11140": [199.2, 142.0], "11170": [198.4, 146.5],
  "11200": [203.6, 143.4], "11215": [208.3, 143.8], "11230": [204.7, 139.2],
  "11260": [209.2, 137.4], "11290": [201.5, 135.5], "11305": [200.0, 131.4],
  "11320": [202.8, 127.8], "11350": [207.0, 130.1], "11380": [191.6, 134.8],
  "11410": [193.8, 138.8], "11440": [190.1, 141.7], "11470": [185.6, 146.2],
  "11500": [181.7, 141.3], "11530": [185.2, 150.5], "11545": [189.8, 154.8],
  "11560": [190.5, 147.1], "11590": [194.1, 150.0], "11620": [194.1, 154.0],
  "11650": [202.6, 153.1], "11680": [206.7, 149.8], "11710": [211.2, 149.1],
  "11740": [214.4, 143.5],
};

const seoulRiverPath = "M176.6 138.9 C181.8 139.6 185.9 143.1 190.3 144.5 C194.2 145.8 197.0 147.2 201.2 147.0 C205.8 146.8 209.6 145.1 213.0 143.8 C215.1 143.0 217.1 141.8 219.0 140.4";

export function DistrictMap({ province, trips, onDistrict }: { province: Region; trips: Trip[]; onDistrict: (region: Region) => void }) {
  const { boundaries, error, retry } = useMapBoundaries();
  if (!boundaries) return <MapLoadState error={error} retry={retry} />;
  const shapes = boundaries.districts.filter(item => appProvinceId(item.province) === province.id);
  const shapeBounds = shapes.map(item => pathBounds(item.path));
  const minX = Math.min(...shapeBounds.map(item => item.x));
  const minY = Math.min(...shapeBounds.map(item => item.y));
  const maxX = Math.max(...shapeBounds.map(item => item.x + item.width));
  const maxY = Math.max(...shapeBounds.map(item => item.y + item.height));
  const padding = Math.max(maxX - minX, maxY - minY) * (province.id === "11" ? .045 : .09);
  const byId = new Map(districts.map(region => [region.id, region]));
  const labelSize = Math.max(.65, (maxX - minX) / (province.id === "11" ? 40 : 38));
  const boundaryProvinceId = province.id === "42" ? "51" : province.id;
  const provincePath = boundaries.provinces[boundaryProvinceId as keyof typeof boundaries.provinces];
  const labelPoint = (shapeId: string, bounds: Bounds): [number, number] => province.id === "11" && seoulLabelPoints[shapeId]
    ? seoulLabelPoints[shapeId]
    : [bounds.cx, bounds.cy];
  const items = shapes.map((shape, index) => {
    const bounds = shapeBounds[index];
    const metric = metrics(shape.path);
    const trip = mostRecentTripForRegion(trips, shape.id);
    return { shape, region: byId.get(shape.id)!, bounds, metric, trip, label: labelPoint(shape.id, bounds), pinned: Boolean(trip) && needsPhotoPin(metric.area, labelSize * 1.45 * 2) };
  });

  return <svg className="district-svg" viewBox={`${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`} role="img" aria-label={`${province.fullName} 시·군·구 여행 지도`}>
    <defs>
      <filter id={`map-shadow-${province.id}`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy=".35" stdDeviation=".55" floodColor="#596058" floodOpacity=".22" />
      </filter>
      <clipPath id={`province-clip-${province.id}`}><path d={provincePath} /></clipPath>
      {items.map(({ shape, trip, pinned, label: [x, y] }) => trip && <Fragment key={shape.id}>
        <clipPath id={`district-photo-${shape.id}`}><path d={shape.path} /></clipPath>
        {pinned && <clipPath id={`district-pin-${shape.id}`}><circle cx={x} cy={y} r={labelSize * 1.25} /></clipPath>}
      </Fragment>)}
    </defs>
    <path className="province-silhouette" d={provincePath} filter={`url(#map-shadow-${province.id})`} />
    {items.map(({ shape, region, bounds, metric, trip, label: [labelX, labelY] }) => {
      const hitRadius = Math.max(labelSize * 1.7, Math.min(bounds.width, bounds.height) * .42);
      return <g key={region.id} className="district-region" {...pressable(() => onDistrict(region))} aria-label={`${region.name}, ${trip ? "방문" : "미방문"}`}>
        <title>{region.name} · {trip ? "방문" : "미방문"}</title>
        <path d={shape.path} fill={trip ? "#D9D9D4" : "#FFFFFF"} stroke="none" />
        {trip && <image href={trip.thumbnailUrl} x={metric.main.x} y={metric.main.y} width={metric.main.width} height={metric.main.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#district-photo-${shape.id})`} className="region-photo" />}
        <circle className="district-hit" cx={labelX} cy={labelY} r={hitRadius} />
      </g>;
    })}
    <g className="district-boundaries" pointerEvents="none" clipPath={`url(#province-clip-${province.id})`}>
      {shapes.map(shape => <path key={shape.id} d={shape.path} />)}
    </g>
    {province.id === "11" && <g className="seoul-river" pointerEvents="none" clipPath={`url(#province-clip-${province.id})`} aria-label="한강">
      <title>한강</title>
      <path className="seoul-river-bank" d={seoulRiverPath} />
      <path className="seoul-river-water" d={seoulRiverPath} />
    </g>}
    <path className="province-outline" d={provincePath} pointerEvents="none" />
    {items.map(({ region, trip, pinned, label: [labelX, labelY] }) => {
      const labelWidth = labelSize * (region.name.length * .72 + .8);
      const label = <><rect className={trip ? "district-label-bg visited" : "district-label-bg"} x={labelX - labelWidth / 2} y={labelY - labelSize * .73} width={labelWidth} height={labelSize * 1.46} rx={labelSize * .55} /><text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} className={trip ? "district-label visited" : "district-label"}>{region.name}</text></>;
      return <g key={`marker-${region.id}`} className="district-marker" pointerEvents="none">
        {pinned && trip
          ? <><circle cx={labelX} cy={labelY} r={labelSize * 1.45} fill="#FFFFFF" /><image href={trip.thumbnailUrl} x={labelX - labelSize * 1.25} y={labelY - labelSize * 1.25} width={labelSize * 2.5} height={labelSize * 2.5} preserveAspectRatio="xMidYMid slice" clipPath={`url(#district-pin-${region.id})`} /></>
          : label}
      </g>;
    })}
  </svg>;
}
