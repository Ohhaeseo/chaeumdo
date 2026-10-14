import { districts, mostRecentTripForRegion, provinces, type Region, type Trip } from "./data";
import boundaries from "./map/boundaries.json";

const points: Record<string, [number, number]> = {
  "11": [202, 145], "26": [408, 455], "27": [360, 354], "28": [138, 168],
  "29": [180, 442], "30": [236, 300], "31": [431, 395], "36": [225, 265],
  "41": [220, 190], "42": [320, 125], "43": [280, 238], "44": [175, 285],
  "45": [210, 362], "46": [180, 485], "47": [380, 281], "48": [320, 425], "50": [150, 650],
};

const appProvinceId = (boundaryId: string) => boundaryId === "51" ? "42" : boundaryId;

export default function KoreaMap({ trips, onProvince }: { trips: Trip[]; onProvince: (region: Region) => void }) {
  const byId = new Map(provinces.map(region => [region.id, region]));
  const provinceTrip = (provinceId: string) => mostRecentTripForRegion(trips, provinceId);
  return <svg className="korea-svg" viewBox="5 0 540 710" role="img" aria-label="대한민국 시·도 여행 지도">
    <defs>{provinces.filter(region => provinceTrip(region.id)).map(region => <clipPath id={`pin-${region.id}`} key={region.id}><circle cx={points[region.id][0]} cy={points[region.id][1]} r="35" /></clipPath>)}</defs>
    {Object.entries(boundaries.provinces).map(([id, path]) => {
      const region = byId.get(appProvinceId(id));
      if (!region) return null;
      const visited = Boolean(provinceTrip(region.id));
      return <path key={region.id} d={path} fill={visited ? "#E5E5E2" : region.recommended ? "#F7F7F5" : "#FFFFFF"} fillRule="evenodd" stroke="#696973" strokeWidth="1.4" className="province-path" role="button" tabIndex={0} aria-label={`${region.name}, ${visited ? "방문" : region.recommended ? "추천 여행지" : "미방문"}, 시·군·구 보기`} onClick={() => onProvince(region)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onProvince(region); } }} />;
    })}
    <g pointerEvents="none">{boundaries.districts.map(district => <path key={district.id} d={district.path} fill="none" stroke="#E5E5E2" strokeWidth="0.8" />)}</g>
    {provinces.map(region => {
      const trip = provinceTrip(region.id);
      const [x, y] = points[region.id];
      return trip ? <g key={region.id} role="button" tabIndex={0} className="photo-marker" aria-label={`${region.name} 여행사진, 시·군·구 보기`} onClick={() => onProvince(region)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onProvince(region); } }}><circle cx={x} cy={y} r="39" fill="#FFFFFF" /><image href={trip.photoUrl} x={x - 35} y={y - 35} width="70" height="70" preserveAspectRatio="xMidYMid slice" clipPath={`url(#pin-${region.id})`} /><rect x={x - 35} y={y + 28} width="70" height="20" rx="10" fill="#111111" /><text x={x} y={y + 42} textAnchor="middle" fill="#FFFFFF" fontSize="12">{region.name}</text></g> : <text key={region.id} x={x} y={y} textAnchor="middle" className="map-label" pointerEvents="none">{region.name}</text>;
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
  const shapes = boundaries.districts.filter(item => appProvinceId(item.province) === province.id);
  const shapeBounds = shapes.map(item => pathBounds(item.path));
  const minX = Math.min(...shapeBounds.map(item => item.x));
  const minY = Math.min(...shapeBounds.map(item => item.y));
  const maxX = Math.max(...shapeBounds.map(item => item.x + item.width));
  const maxY = Math.max(...shapeBounds.map(item => item.y + item.height));
  const padding = Math.max(maxX - minX, maxY - minY) * (province.id === "11" ? .045 : .09);
  const byId = new Map(districts.map(region => [region.id, region]));
  const tripByDistrict = new Map(shapes.map(shape => [shape.id, mostRecentTripForRegion(trips, shape.id)]));
  const labelSize = Math.max(.65, (maxX - minX) / (province.id === "11" ? 40 : 38));
  const boundaryProvinceId = province.id === "42" ? "51" : province.id;
  const provincePath = boundaries.provinces[boundaryProvinceId as keyof typeof boundaries.provinces];
  const labelPoint = (shapeId: string, bounds: Bounds): [number, number] => province.id === "11" && seoulLabelPoints[shapeId]
    ? seoulLabelPoints[shapeId]
    : [bounds.cx, bounds.cy];

  return <svg className="district-svg" viewBox={`${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`} role="img" aria-label={`${province.fullName} 시·군·구 여행 지도`}>
    <defs>
      <filter id={`map-shadow-${province.id}`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy=".35" stdDeviation=".55" floodColor="#596058" floodOpacity=".22" />
      </filter>
      <clipPath id={`province-clip-${province.id}`}><path d={provincePath} /></clipPath>
      {shapes.map((shape, index) => {
        const trip = tripByDistrict.get(shape.id);
        if (!trip) return null;
        const [x, y] = labelPoint(shape.id, shapeBounds[index]);
        return <clipPath id={`district-pin-${shape.id}`} key={shape.id}><circle cx={x} cy={y} r={labelSize * 1.25} /></clipPath>;
      })}
    </defs>
    <path className="province-silhouette" d={provincePath} filter={`url(#map-shadow-${province.id})`} />
    {shapes.map((shape, index) => {
      const region = byId.get(shape.id)!;
      const trip = tripByDistrict.get(region.id);
      const bounds = shapeBounds[index];
      const [labelX, labelY] = labelPoint(shape.id, bounds);
      const hitRadius = Math.max(labelSize * 1.7, Math.min(bounds.width, bounds.height) * .42);
      return <g key={region.id} className="district-region" role="button" tabIndex={0} aria-label={`${region.name}, ${trip ? "방문" : "미방문"}`} onClick={() => onDistrict(region)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onDistrict(region); } }}>
        <title>{region.name} · {trip ? "방문" : "미방문"}</title>
        <path d={shape.path} fill={trip ? "#D9D9D4" : "#FFFFFF"} stroke="none" />
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
    {shapes.map((shape, index) => {
      const region = byId.get(shape.id)!;
      const trip = tripByDistrict.get(region.id);
      const bounds = shapeBounds[index];
      const [labelX, labelY] = labelPoint(shape.id, bounds);
      const labelWidth = labelSize * (region.name.length * .72 + .8);
      return <g key={`marker-${region.id}`} className="district-marker" pointerEvents="none">
        {trip
          ? <><circle cx={labelX} cy={labelY} r={labelSize * 1.45} fill="#FFFFFF" /><image href={trip.photoUrl} x={labelX - labelSize * 1.25} y={labelY - labelSize * 1.25} width={labelSize * 2.5} height={labelSize * 2.5} preserveAspectRatio="xMidYMid slice" clipPath={`url(#district-pin-${region.id})`} /></>
          : <><rect className="district-label-bg" x={labelX - labelWidth / 2} y={labelY - labelSize * .73} width={labelWidth} height={labelSize * 1.46} rx={labelSize * .55} /><text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} className="district-label">{region.name}</text></>}
      </g>;
    })}
  </svg>;
}
