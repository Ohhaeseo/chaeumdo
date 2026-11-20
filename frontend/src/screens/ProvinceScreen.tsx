import { ChevronRight, ImagePlus, Plus } from "lucide-react";
import { districts, mostRecentTripForRegion, neighborhoods, provinceIdForRegion, regionIdsForTrip, type Region, type RegionCover, type Trip } from "../data";
import { DistrictMap, provincePhoto } from "../KoreaMap";
import type { TravelStats } from "../travelStats";
import { Header } from "../ui";

const JEJU = "50";

// A 시·도: its 시·군·구 map and list, the national map photo card, and trips saved for the whole 시·도.
export default function ProvinceScreen({ province, trips, covers, stats, onBack, onMenu, onRegion, onCover, onAdd }: {
  province: Region;
  trips: Trip[];
  covers: Map<string, RegionCover>;
  stats: TravelStats;
  onBack: () => void;
  onMenu: () => void;
  onRegion: (region: Region) => void;
  onCover: () => void;
  onAdd: () => void;
}) {
  const latestTrip = mostRecentTripForRegion(trips, province.id);
  const mapPhoto = provincePhoto(province, trips, covers);
  const children = districts.filter(item => item.parentId === province.id);
  const jejuNeighborhoods = province.id === JEJU ? neighborhoods.filter(item => provinceIdForRegion(item.id) === JEJU) : [];
  return <>
    <Header back={onBack} title={province.fullName} menu={onMenu} />
    <section className="district-map-stage"><DistrictMap province={province} trips={trips} onDistrict={onRegion} /></section>
    <div className="map-legend" aria-label="지도 범례">
      <span><i className="legend-visited" style={latestTrip ? { backgroundImage: `url("${latestTrip.thumbnailUrl}")` } : undefined} />방문</span>
      <span><i />미방문</span>
      <small>작은 지역은 아래 목록에서도 선택할 수 있어요.</small>
    </div>
    <p className="district-progress"><b>{children.filter(item => stats.visitedDistricts.has(item.id)).length}</b> / {children.length}개 시·군·구를 채웠어요</p>
    {province.id === JEJU && <>
      <p className="district-progress">읍·면·동 <b>{jejuNeighborhoods.filter(item => stats.visitedNeighborhoods.has(item.id)).length}</b> / {jejuNeighborhoods.length}곳</p>
      <p className="map-source">제주 읍·면·동 경계: 통계청 SGIS 행정동 경계(공공누리 제1유형) · 가공 vuski/admdongkor(CC BY 4.0)</p>
    </>}
    <button className="legacy-region-card cover-card" onClick={onCover}>
      <span className="cover-card-thumb">{mapPhoto ? <img src={mapPhoto} alt="" /> : <ImagePlus size={16} strokeWidth={1.4} />}</span>
      <span className="cover-card-text">
        <b>전국 지도 사진</b>
        <small>{covers.has(province.id) ? "직접 고른 사진" : latestTrip ? "최근 여행 사진" : "원하는 사진을 넣어 보세요"}</small>
      </span>
      <ChevronRight size={18} />
    </button>
    {trips.some(item => regionIdsForTrip(item).includes(province.id)) && <button className="legacy-region-card" onClick={() => onRegion(province)}>기존 {province.name} 기록 보기 <ChevronRight size={18} /></button>}
    <div className="district-list">
      {children.map(item => <button className={stats.visitedDistricts.has(item.id) ? "visited" : ""} key={item.id} onClick={() => onRegion(item)}>
        <span>{item.name}</span><small>{stats.visitedDistricts.has(item.id) ? "방문" : "미방문"}</small>
      </button>)}
    </div>
    <button className="map-add" onClick={onAdd} aria-label={`${province.name} 여행기록 추가`}><Plus size={21} /></button>
  </>;
}
