import { MoreHorizontal, UserRound } from "lucide-react";
import { districts, regionById, type Region } from "../data";
import type { TravelStats } from "../travelStats";
import type { Mode } from "../useTravelData";

export default function MyScreen({ displayName, tripCount, stats, mode, onMenu, onProvince, onLogout, onAccountMode, onDeleteAccount }: {
  displayName?: string;
  tripCount: number;
  stats: TravelStats;
  mode: Mode;
  onMenu: () => void;
  onProvince: (region: Region) => void;
  onLogout: () => void;
  onAccountMode: () => void;
  onDeleteAccount: () => void;
}) {
  const top = stats.topDistrict;
  return <>
    <header className="topbar"><h1>나</h1><button aria-label="더보기" onClick={onMenu}><MoreHorizontal /></button></header>
    <section className="profile"><div className="avatar"><UserRound size={30} /></div><span>{displayName || "나"}</span></section>
    <div className="my-stats">
      <div><b>{stats.visitedDistricts.size}곳</b><small>시·군·구</small></div>
      <div><b>{tripCount}번</b><small>여행</small></div>
      <div><b>{stats.totalDays}일</b><small>여행</small></div>
    </div>
    <section className="national-progress-card">
      <div className="progress-heading">
        <span><small>전국 채움률</small><b>{stats.nationalPercent}%</b></span>
        <strong>{stats.visitedDistricts.size}<small> / {districts.length}곳</small></strong>
      </div>
      <div className="progress-track"><i style={{ width: `${stats.nationalPercent}%` }} /></div>
      <div className="insight-row">
        <div><small>{stats.year}년 새로 채운 곳</small><b>{stats.thisYearDistricts.size}곳</b></div>
        <div><small>가장 자주 간 곳</small><b>{top ? `${regionById.get(top[0])?.name} ${top[1]}회` : "아직 없어요"}</b></div>
      </div>
    </section>
    <section className="province-progress-section">
      <h2>시·도별 채움</h2>
      <div className="province-progress-list">
        {stats.provinceProgress.map(item => <button key={item.region.id} onClick={() => onProvince(item.region)}>
          <span><b>{item.region.name}</b><small>{item.count}/{item.total}</small></span>
          <span className="mini-progress"><i style={{ width: `${item.percent}%` }} /></span>
          <em>{item.percent}%</em>
        </button>)}
      </div>
    </section>
    <div className="account-actions">
      {mode === "server"
        ? <><button onClick={onLogout}>로그아웃</button><button className="danger" onClick={onDeleteAccount}>계정 삭제</button></>
        : <button onClick={onAccountMode}>계정으로 로그인</button>}
    </div>
  </>;
}
