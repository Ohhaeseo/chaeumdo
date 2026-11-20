import { ChevronRight, ImagePlus } from "lucide-react";
import { mostRecentTripForRegion, neighborhoods, regionContains, regionIdsForTrip, type Region, type Trip } from "../data";
import { dateRange, inclusiveDays, stayLabel } from "../dates.mjs";
import { withObjectParticle } from "../korean.mjs";
import type { TravelStats } from "../travelStats";
import { Header } from "../ui";

// A 시·군·구, 읍·면·동 or whole-시·도 record list, newest first, with the latest trip's photo on top.
export default function RegionScreen({ region, trips, stats, onBack, onMenu, onAdd, onRegion, onTrip }: {
  region: Region;
  trips: Trip[];
  stats: TravelStats;
  onBack: () => void;
  onMenu: () => void;
  onAdd: () => void;
  onRegion: (region: Region) => void;
  onTrip: (trip: Trip) => void;
}) {
  const regionTrips = trips.filter(trip => regionIdsForTrip(trip).some(id => regionContains(region.id, id))).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const heroTrip = mostRecentTripForRegion(trips, region.id);
  const children = region.level === "district" ? neighborhoods.filter(item => item.parentId === region.id) : [];
  return <>
    <Header back={onBack} menu={onMenu} />
    <section className="region-hero">
      <div className="hero-photo">{heroTrip ? <img src={heroTrip.photoUrl} alt={`${region.name} 최근 여행 대표 사진`} /> : <ImagePlus size={40} strokeWidth={1} />}</div>
      <h1>{region.fullName}</h1>
      <p>{regionTrips.length ? `${regionTrips.length}번의 여행기록` : region.recommended ? "다음 여행지로 어때요?" : "아직 남긴 여행기록이 없어요"}</p>
      <button className="solid-button" onClick={onAdd}>여행기록 추가</button>
    </section>
    {children.length > 0 && <section className="neighborhood-section">
      <div className="neighborhood-heading">
        <h2>읍·면·동</h2>
        <small>{children.filter(item => stats.visitedNeighborhoods.has(item.id)).length} / {children.length}곳</small>
      </div>
      <div className="neighborhood-list">
        {children.map(item => <button className={stats.visitedNeighborhoods.has(item.id) ? "visited" : ""} key={item.id} onClick={() => onRegion(item)}>
          <span>{item.name}</span><small>{stats.visitedNeighborhoods.has(item.id) ? "방문" : "미방문"}</small>
        </button>)}
      </div>
    </section>}
    <div className="section-rule" />
    <div className="record-list">
      <h2 className="record-list-title">{region.level === "district" ? "이 지역의 전체 기록" : "여행 기록"}</h2>
      {regionTrips.map(trip => <button className="record-card" key={trip.id} onClick={() => onTrip(trip)}>
        <img src={trip.thumbnailUrl} alt="" />
        <span><small>{dateRange(trip.startDate, trip.endDate)}</small><b>{stayLabel(inclusiveDays(trip.startDate, trip.endDate))}</b></span>
        <ChevronRight size={20} />
      </button>)}
      {!regionTrips.length && <p className="empty-note">첫 사진으로 {withObjectParticle(region.name)} 채워보세요.</p>}
    </div>
  </>;
}
