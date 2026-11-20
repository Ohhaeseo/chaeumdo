import { useEffect, useMemo, useState } from "react";
import { MapPin, Trash2, UserRound } from "lucide-react";
import { api, deleteLocal, mostRecentTripForRegion, provinceIdForRegion, regionById, setUnauthorizedHandler, type Region, type Trip } from "./data";
import AuthView, { type Account, type AuthScreen } from "./AuthView";
import { RegionSearchSheet, TripDeleteDialog } from "./dialogs";
import ProvinceCoverSheet from "./ProvinceCoverSheet";
import MapScreen from "./screens/MapScreen";
import MyScreen from "./screens/MyScreen";
import ProvinceScreen from "./screens/ProvinceScreen";
import RegionScreen from "./screens/RegionScreen";
import TripDetailScreen from "./screens/TripDetailScreen";
import TravelForm from "./TravelForm";
import { travelStats } from "./travelStats";
import { Attribution, SplashView } from "./ui";
import { useTravelData, type Mode } from "./useTravelData";
import "./styles.css";

type Screen = "map" | "districts" | "my" | "region" | "detail" | "form" | "complete";

export default function MobileApp() {
  const [mode, setMode] = useState<Mode>(() => localStorage.getItem("chaeummdo-mode") === "demo" ? "demo" : "server");
  const { trips, covers, loading, setLoading, error, reload, clear } = useTravelData(mode);
  const [account, setAccount] = useState<Account | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [booting, setBooting] = useState(true);
  // Navigation: the screen plus the 시·도, region and trip it shows.
  const [screen, setScreen] = useState<Screen>("map");
  const [province, setProvince] = useState<Region | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [editing, setEditing] = useState(false);
  // Overlays.
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  const [tripDeleteOpen, setTripDeleteOpen] = useState(false);

  const stats = useMemo(() => travelStats(trips), [trips]);
  const coverByRegion = useMemo(() => new Map(covers.map(cover => [cover.regionId, cover])), [covers]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [screen, region?.id, trip?.id]);

  function signedOut() {
    setAccount(null);
    clear();
    setAuthScreen("login");
    setScreen("map");
    setMenuOpen(false);
  }
  useEffect(() => {
    if (mode !== "server") return;
    setUnauthorizedHandler(signedOut);
    return () => setUnauthorizedHandler(null);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem("chaeummdo-mode", mode);
    if (mode === "server") {
      setLoading(true);
      api<Account>("/auth/me").then(setAccount).then(() => reload())
        .catch(() => { setAccount(null); setLoading(false); })
        .finally(() => setBooting(false));
    } else {
      setAccount(null);
      void reload().finally(() => setBooting(false));
    }
  }, [mode]);

  function openProvince(next: Region) {
    setProvince(next);
    setRegion(null);
    setTrip(null);
    setSearchOpen(false);
    setScreen("districts");
  }
  function openRegion(next: Region) {
    setProvince(regionById.get(provinceIdForRegion(next.id)) || null);
    setRegion(next);
    setTrip(null);
    setSearchOpen(false);
    setScreen("region");
  }
  function openTrip(next: Trip) {
    setTrip(next);
    setScreen("detail");
  }
  function goMap() {
    setProvince(null);
    setRegion(null);
    setTrip(null);
    setScreen("map");
    setMenuOpen(false);
  }
  function openForm(edit = false) {
    // Adding from a 시·도 map starts the form in that 시·도.
    if (!edit && screen === "districts" && province) setRegion(province);
    setEditing(edit);
    setScreen("form");
    setMenuOpen(false);
  }
  function back() {
    if (screen === "detail") setScreen("region");
    else if (screen === "region" && region?.level === "neighborhood") {
      setRegion(regionById.get(region.parentId || "") || null);
      setScreen("region");
    } else if (screen === "region" && province) setScreen("districts");
    else if (screen === "districts") goMap();
    else if (screen === "form" && editing) setScreen("detail");
    else if (screen === "form") setScreen(region && region.level !== "province" ? "region" : province ? "districts" : "map");
    else goMap();
  }
  const toggleMenu = () => setMenuOpen(open => !open);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    signedOut();
  }
  async function deleteAccount(password: string) {
    await api("/auth/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    signedOut();
  }
  async function deleteTrip() {
    if (!trip) return;
    if (mode === "demo") await deleteLocal(trip.id);
    else await api(`/trips/${trip.id}`, { method: "DELETE" });
    setTripDeleteOpen(false);
    setTrip(null);
    await reload();
    setScreen("region");
  }

  if (booting) return <SplashView />;
  if (mode === "server" && !account) return <div className="page-canvas"><div className="phone auth-phone">
    <AuthView screen={authScreen} setScreen={setAuthScreen} loading={loading} onDemo={() => setMode("demo")}
      onAuthenticated={async next => { setAccount(next); setAuthScreen("login"); setScreen("map"); await reload(); }}
      recoveryCode={recoveryCode} setRecoveryCode={setRecoveryCode} />
    <Attribution />
  </div></div>;

  return <div className="page-canvas"><div className="phone">
    <div className="app-content">
      {screen === "map" && <MapScreen trips={trips} covers={coverByRegion} error={error} onRetry={() => void reload()}
        onSearch={() => setSearchOpen(true)} onMenu={toggleMenu} onProvince={openProvince} onAdd={() => openForm()} />}
      {screen === "districts" && province && <ProvinceScreen province={province} trips={trips} covers={coverByRegion} stats={stats}
        onBack={back} onMenu={toggleMenu} onRegion={openRegion} onCover={() => setCoverOpen(true)} onAdd={() => openForm()} />}
      {screen === "region" && region && <RegionScreen region={region} trips={trips} stats={stats}
        onBack={back} onMenu={toggleMenu} onAdd={() => openForm()} onRegion={openRegion} onTrip={openTrip} />}
      {screen === "detail" && region && trip && <TripDetailScreen trip={trip} region={region}
        onBack={back} onMenu={toggleMenu} onEdit={() => openForm(true)} />}
      {screen === "form" && <TravelForm region={region} trip={editing ? trip : null} mode={mode} onBack={back} onSaved={async saved => {
        setProvince(regionById.get(provinceIdForRegion(saved.id)) || null);
        setRegion(saved);
        setTrip(null);
        await reload();
        setScreen("complete");
      }} />}
      {screen === "complete" && <div className="complete-view">
        <div className="complete-mark"><MapPin size={54} strokeWidth={1} /></div>
        <h1>{region?.fullName} 여행 기록 완료 !</h1>
        <button className="solid-button" onClick={() => province ? setScreen("districts") : goMap()}>지도에서 보기</button>
      </div>}
      {screen === "my" && <MyScreen displayName={account?.displayName} tripCount={trips.length} stats={stats} mode={mode}
        onMenu={toggleMenu} onProvince={openProvince} onLogout={() => void logout()} onAccountMode={() => setMode("server")} onDeleteAccount={deleteAccount} />}
      {menuOpen && <div className="more-menu">
        <button onClick={() => openForm(screen === "detail")}>{screen === "detail" ? "기록 수정" : "여행기록 추가"}</button>
        {screen === "detail" && trip && <button className="danger" onClick={() => { setTripDeleteOpen(true); setMenuOpen(false); }}><Trash2 size={14} /> 기록 삭제</button>}
        <button onClick={() => { setSearchOpen(true); setMenuOpen(false); }}>지역 목록 보기</button>
        <button onClick={() => { setMode(mode === "demo" ? "server" : "demo"); setMenuOpen(false); }}>{mode === "demo" ? "계정으로 로그인" : "기기 체험 모드"}</button>
      </div>}
    </div>
    {(screen === "map" || screen === "my") && <nav className="mobile-tabs" aria-label="주요 메뉴">
      <button className={screen === "map" ? "current" : ""} onClick={goMap}><MapPin size={19} fill="currentColor" /><span>지도</span></button>
      <button className={screen === "my" ? "current" : ""} onClick={() => { setMenuOpen(false); setScreen("my"); }}><UserRound size={19} fill="currentColor" /><span>나</span></button>
    </nav>}
    {searchOpen && <RegionSearchSheet query={query} onQuery={setQuery} stats={stats} onClose={() => setSearchOpen(false)}
      onPick={picked => picked.level === "province" ? openProvince(picked) : openRegion(picked)} />}
    {coverOpen && province && <ProvinceCoverSheet province={province} cover={coverByRegion.get(province.id)} latestTrip={mostRecentTripForRegion(trips, province.id)}
      mode={mode} onClose={() => setCoverOpen(false)} onChanged={reload} />}
    {tripDeleteOpen && trip && region && <TripDeleteDialog trip={trip} region={region} onClose={() => setTripDeleteOpen(false)} onDelete={deleteTrip} />}
    <Attribution />
  </div></div>;
}
