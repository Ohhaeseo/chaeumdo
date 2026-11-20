import { MoreHorizontal, Plus, Search } from "lucide-react";
import type { Region, RegionCover, Trip } from "../data";
import KoreaMap from "../KoreaMap";

export default function MapScreen({ trips, covers, error, onRetry, onSearch, onMenu, onProvince, onAdd }: {
  trips: Trip[];
  covers: Map<string, RegionCover>;
  error: string;
  onRetry: () => void;
  onSearch: () => void;
  onMenu: () => void;
  onProvince: (region: Region) => void;
  onAdd: () => void;
}) {
  return <>
    <header className="topbar">
      <h1>지도</h1>
      <div className="top-actions">
        <button aria-label="지역 검색" onClick={onSearch}><Search size={23} /></button>
        <button aria-label="더보기" onClick={onMenu}><MoreHorizontal size={24} /></button>
      </div>
    </header>
    {error && <div className="inline-error" role="alert">{error}<button onClick={onRetry}>다시 시도</button></div>}
    <div className="map-stage"><KoreaMap trips={trips} covers={covers} onProvince={onProvince} /></div>
    <p className="map-prompt" style={{ fontSize: 19, letterSpacing: "-.035em", margin: "19px 0 25px" }}>어디부터 채워볼까요...</p>
    <button className="map-add" onClick={onAdd} aria-label="여행기록 추가"><Plus size={21} /></button>
  </>;
}
