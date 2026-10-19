import { Fragment, type KeyboardEvent } from "react";
import { districts, mostRecentTripForRegion, provinces, regionById, regionContains, regionIdsForTrip, type Region, type Trip } from "./data";
import { useJejuBoundaries, useMapBoundaries, type JejuBoundaries } from "./mapData";
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

type DistrictMapProps = { province: Region; trips: Trip[]; onDistrict: (region: Region) => void };

// Jeju has only two 시·군·구, so its map is drawn from the 읍·면·동 layer instead. Separate components keep
// each map's hooks stable when the user moves between provinces.
export function DistrictMap(props: DistrictMapProps) {
  return props.province.id === "50" ? <JejuDistrictMap {...props} /> : <ProvinceDistrictMap {...props} />;
}

function ProvinceDistrictMap({ province, trips, onDistrict }: DistrictMapProps) {
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

// 추자도 lies about 45 km north of the main island. Drawn to scale it would shrink Jeju to a strip
// at the bottom of the stage, so it gets an inset in the north-west corner, as printed maps of Jeju do.
const CHUJA = "추자면";

function JejuDistrictMap(props: DistrictMapProps) {
  const { jeju, error } = useJejuBoundaries();
  // Without the 읍·면·동 file the two-district map still works, so it stands in rather than an error.
  if (!jeju) return error ? <ProvinceDistrictMap {...props} /> : <MapLoadState error="" retry={() => undefined} />;
  return <JejuNeighborhoodMap jeju={jeju} {...props} />;
}

function JejuNeighborhoodMap({ jeju, trips, onDistrict }: DistrictMapProps & { jeju: JejuBoundaries }) {
  const items = jeju.neighborhoods.map(shape => {
    const own = mostRecentTripForRegion(trips, shape.id);
    // A trip saved for all of 제주시 or 서귀포시 (or a legacy 제주 record) covers every 읍·면·동 under it, without a photo of its own.
    const covered = !own && trips.some(trip => regionIdsForTrip(trip).some(id => id !== shape.id && regionContains(id, shape.id)));
    const metric = metrics(shape.path);
    const center: [number, number] = [metric.main.x + metric.main.width / 2, metric.main.y + metric.main.height / 2];
    return { shape, region: regionById.get(shape.id)!, bounds: pathBounds(shape.path), metric, center, own, covered };
  });
  const land = items.filter(item => item.shape.name !== CHUJA);
  const chuja = items.find(item => item.shape.name === CHUJA)!;
  const minX = Math.min(...land.map(item => item.bounds.x));
  const minY = Math.min(...land.map(item => item.bounds.y));
  const maxX = Math.max(...land.map(item => item.bounds.x + item.bounds.width));
  const maxY = Math.max(...land.map(item => item.bounds.y + item.bounds.height));
  const width = maxX - minX;
  const unit = width / 38;
  const pad = width * .04;
  const box = width * .19;
  const insetX = minX;
  const insetY = minY - box - unit;
  const insetScale = box * .76 / Math.max(chuja.bounds.width, chuja.bounds.height);
  const insetShift = [insetX + box / 2 - (chuja.bounds.x + chuja.bounds.width / 2) * insetScale, insetY + box / 2 - (chuja.bounds.y + chuja.bounds.height / 2) * insetScale];
  const landPath = land.map(item => item.shape.path).join("");
  const pinRadius = unit * 1.1;
  const pinned = (item: typeof items[number]) => item === chuja || needsPhotoPin(item.metric.area, pinRadius * 2.6);
  const pinAt = (item: typeof items[number]): [number, number] => item === chuja ? [insetX + box / 2, insetY + box / 2] : item.center;
  // 동 are a few pixels wide on a phone, so only 읍·면 carry names; the city names sit over their 동 clusters.
  const cities = ["50110", "50130"].map(id => {
    const dongs = land.filter(item => item.shape.district === id && item.shape.name.endsWith("동"));
    const left = Math.min(...dongs.map(item => item.bounds.x)), right = Math.max(...dongs.map(item => item.bounds.x + item.bounds.width));
    const top = Math.min(...dongs.map(item => item.bounds.y)), bottom = Math.max(...dongs.map(item => item.bounds.y + item.bounds.height));
    return { region: regionById.get(id)!, x: (left + right) / 2, y: (top + bottom) / 2 };
  });
  const label = (key: string, name: string, [x, y]: [number, number], size: number, visited: boolean) => {
    const labelWidth = size * (name.length * .72 + .8);
    return <g key={key} className="district-marker" pointerEvents="none">
      <rect className={visited ? "district-label-bg visited" : "district-label-bg"} x={x - labelWidth / 2} y={y - size * .73} width={labelWidth} height={size * 1.46} rx={size * .55} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} className={visited ? "district-label visited" : "district-label"}>{name}</text>
    </g>;
  };
  const region = (item: typeof items[number]) => {
    const visited = Boolean(item.own || item.covered);
    return <g key={item.shape.id} className="district-region" {...pressable(() => onDistrict(item.region))} aria-label={`${item.shape.name}, ${visited ? "방문" : "미방문"}`}>
      <title>{item.shape.name} · {visited ? "방문" : "미방문"}</title>
      <path d={item.shape.path} fill={item.own ? "#D9D9D4" : item.covered ? "#E5E5E2" : "#FFFFFF"} />
      {item.own && item !== chuja && <image href={item.own.thumbnailUrl} x={item.metric.main.x} y={item.metric.main.y} width={item.metric.main.width} height={item.metric.main.height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#jeju-photo-${item.shape.id})`} className="region-photo" />}
    </g>;
  };

  return <svg className="district-svg" viewBox={`${minX - pad} ${insetY - pad} ${width + pad * 2} ${maxY - insetY + pad * 2}`} role="img" aria-label="제주특별자치도 읍·면·동 여행 지도">
    <defs>
      <filter id="map-shadow-jeju" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy=".35" stdDeviation=".55" floodColor="#596058" floodOpacity=".22" />
      </filter>
      {land.map(item => item.own && <clipPath key={item.shape.id} id={`jeju-photo-${item.shape.id}`}><path d={item.shape.path} /></clipPath>)}
      {items.map(item => item.own && pinned(item) && <clipPath key={item.shape.id} id={`jeju-pin-${item.shape.id}`}><circle cx={pinAt(item)[0]} cy={pinAt(item)[1]} r={pinRadius} /></clipPath>)}
    </defs>
    <path className="province-silhouette" d={landPath} filter="url(#map-shadow-jeju)" />
    {/* Stroked under the fills: shared edges are covered by both neighbours, so only the coastline shows. */}
    <path className="jeju-coast" d={landPath} />
    {land.map(region)}
    <g className="jeju-dong-boundaries" pointerEvents="none">{land.map(item => <path key={item.shape.id} d={item.shape.path} />)}</g>
    <path className="jeju-district-border" d={jeju.districtBorder} pointerEvents="none" />
    <g className="jeju-inset">
      <rect className="jeju-inset-frame" x={insetX} y={insetY} width={box} height={box} rx={unit * .8} />
      <g transform={`translate(${insetShift[0]} ${insetShift[1]}) scale(${insetScale})`}>
        {region(chuja)}
        <path className="province-outline" d={chuja.shape.path} pointerEvents="none" />
      </g>
    </g>
    {cities.map(city => label(`city-${city.region.id}`, city.region.name, [city.x, city.y], unit * 1.05, false))}
    {land.filter(item => /[읍면]$/.test(item.shape.name) && !(item.own && pinned(item))).map(item => label(item.shape.id, item.shape.name, item.center, unit * .82, Boolean(item.own)))}
    {chuja.own ? null : label(chuja.shape.id, chuja.shape.name, [insetX + box / 2, insetY + box - unit * .9], unit * .82, false)}
    {items.filter(item => item.own && pinned(item)).map(item => {
      const [x, y] = pinAt(item);
      return <g key={`pin-${item.shape.id}`} className="district-marker" pointerEvents="none">
        <circle cx={x} cy={y} r={pinRadius * 1.16} fill="#FFFFFF" />
        <image href={item.own!.thumbnailUrl} x={x - pinRadius} y={y - pinRadius} width={pinRadius * 2} height={pinRadius * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#jeju-pin-${item.shape.id})`} />
      </g>;
    })}
  </svg>;
}
