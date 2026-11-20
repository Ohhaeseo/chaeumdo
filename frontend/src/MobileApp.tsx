import { useEffect, useMemo, useState } from "react";
import { MapPin, Trash2, UserRound } from "lucide-react";
import { api, deleteLocal, mostRecentTripForRegion, provinceIdForRegion, regionById, setUnauthorizedHandler, type Region, type Trip } from "./data";
import AuthView, { type Account, type LegalDocName } from "./AuthView";
import { DeleteAccountDialog, EmailDialog, RegionSearchSheet, TripDeleteDialog } from "./dialogs";
import LegalScreen from "./screens/LegalScreen";
import ResetPasswordScreen from "./screens/ResetPasswordScreen";
import { parentOf, type Nav } from "./navigation.mjs";
import ProvinceCoverSheet from "./ProvinceCoverSheet";
import MapScreen from "./screens/MapScreen";
import MyScreen from "./screens/MyScreen";
import ProvinceScreen from "./screens/ProvinceScreen";
import RegionScreen from "./screens/RegionScreen";
import TripDetailScreen from "./screens/TripDetailScreen";
import TravelForm from "./TravelForm";
import { travelStats } from "./travelStats";
import { Attribution, SplashView } from "./ui";
import { MAP, useNavigation } from "./useNavigation";
import { useTravelData, type Mode } from "./useTravelData";
import "./styles.css";

// A reset link carries its token after "#". It is read once here, before the app rewrites the address.
const resetToken = location.pathname === "/reset-password" ? new URLSearchParams(location.hash.slice(1)).get("token") : null;

export default function MobileApp() {
  const [mode, setMode] = useState<Mode>(() => localStorage.getItem("chaeummdo-mode") === "demo" ? "demo" : "server");
  const { trips, covers, loading, setLoading, error, reload, clear } = useTravelData(mode);
  const navigation = useNavigation();
  const { nav, overlay, push, replace, back } = navigation;
  const [account, setAccount] = useState<Account | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [booting, setBooting] = useState(true);
  const [query, setQuery] = useState("");

  // The screen's 시·도, region and trip come from the URL, so they are looked up rather than kept as objects.
  const province = nav.provinceId ? regionById.get(nav.provinceId) ?? null : null;
  const region = nav.regionId ? regionById.get(nav.regionId) ?? null : null;
  const trip = nav.tripId ? trips.find(item => item.id === nav.tripId) ?? null : null;
  const stats = useMemo(() => travelStats(trips), [trips]);
  const coverByRegion = useMemo(() => new Map(covers.map(cover => [cover.regionId, cover])), [covers]);
  const ready = !booting && !loading && (mode === "demo" || account !== null);

  function signedOut() {
    setAccount(null);
    clear();
    replace(MAP);
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
  // A link or a back step can name a trip that is gone (deleted, or another account's): show the screen above it.
  useEffect(() => {
    if (ready && nav.tripId && !trip && (nav.screen === "detail" || nav.screen === "form")) replace(parentOf(nav, regionById));
  }, [ready, nav, trip]);

  function openProvince(next: Region) {
    push({ screen: "districts", provinceId: next.id });
  }
  function openRegion(next: Region) {
    push({ screen: "region", provinceId: provinceIdForRegion(next.id), regionId: next.id });
  }
  function openTrip(next: Trip) {
    push({ screen: "detail", provinceId: nav.provinceId, regionId: nav.regionId, tripId: next.id });
  }
  function openForm(edit = false) {
    if (edit) push({ ...nav, screen: "form", editing: true });
    // Adding from a 시·도 map starts the form in that 시·도; from the map or MY it starts empty.
    else push({ screen: "form", provinceId: nav.provinceId, regionId: nav.screen === "districts" ? nav.provinceId : nav.screen === "map" || nav.screen === "my" ? undefined : nav.regionId });
  }
  function openTab(next: "map" | "my") {
    if (nav.screen === next) return navigation.closeOverlay();
    // MY opens over the map, so the map tab goes back to it rather than stacking another map.
    if (next === "my") push({ screen: "my" });
    else back();
  }
  const toggleMenu = () => overlay === "menu" ? navigation.closeOverlay() : navigation.openOverlay("menu");

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
    // Close the dialog and leave the detail screen together, so back does not return to the deleted trip.
    await navigation.leave(2, parentOf(nav, regionById));
    await reload();
  }
  function switchMode() {
    navigation.closeOverlay();
    setMode(mode === "demo" ? "server" : "demo");
  }
  const openLegal = (doc: LegalDocName) => push({ screen: doc });
  async function saveEmail(email: string | null, password: string) {
    setAccount(await api<Account>("/auth/email", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
    navigation.closeOverlay();
  }
  // The reset signed this browser in to the account whose password was reset.
  async function finishReset() {
    setAccount(await api<Account>("/auth/me"));
    replace(MAP);
    if (mode === "server") await reload();
    else setMode("server");
  }

  if (booting) return <SplashView />;
  if (nav.screen === "reset-password") return <div className="page-canvas"><div className="phone auth-phone">
    <ResetPasswordScreen token={resetToken} onDone={finishReset} onCancel={() => replace(MAP)} />
    <Attribution />
  </div></div>;
  const legal = nav.screen === "privacy" || nav.screen === "terms" ? nav.screen : null;
  // Signed out, the terms open over the sign-in screens, which stay mounted so a half-filled form survives.
  if (mode === "server" && !account) return <div className="page-canvas"><div className="phone auth-phone">
    {legal && <div className="app-content"><LegalScreen doc={legal} onBack={back} /></div>}
    <div style={{ display: legal ? "none" : "contents" }}>
      <AuthView screen={navigation.authScreen} setScreen={navigation.showAuth} loading={loading} onDemo={() => setMode("demo")}
        onAuthenticated={async next => { setAccount(next); navigation.finishAuth(); await reload(); }} onLegal={openLegal}
        recoveryCode={recoveryCode} setRecoveryCode={setRecoveryCode} />
    </div>
    <Attribution />
  </div></div>;

  const screen = nav.screen;
  const doneNav: Nav = province ? { screen: "districts", provinceId: province.id } : MAP;
  return <div className="page-canvas"><div className="phone">
    <div className="app-content">
      {screen === "map" && <MapScreen trips={trips} covers={coverByRegion} error={error} onRetry={() => void reload()}
        onSearch={() => navigation.openOverlay("search")} onMenu={toggleMenu} onProvince={openProvince} onAdd={() => openForm()} />}
      {screen === "districts" && province && <ProvinceScreen province={province} trips={trips} covers={coverByRegion} stats={stats}
        onBack={back} onMenu={toggleMenu} onRegion={openRegion} onCover={() => navigation.openOverlay("cover")} onAdd={() => openForm()} />}
      {screen === "region" && region && <RegionScreen region={region} trips={trips} stats={stats}
        onBack={back} onMenu={toggleMenu} onAdd={() => openForm()} onRegion={openRegion} onTrip={openTrip} />}
      {screen === "detail" && region && trip && <TripDetailScreen trip={trip} region={region}
        onBack={back} onMenu={toggleMenu} onEdit={() => openForm(true)} />}
      {/* An edit form waits for its trip: the form reads it only once, when it opens. */}
      {screen === "form" && (!nav.editing || trip) && <TravelForm region={region} trip={nav.editing ? trip : null} mode={mode} onBack={back} onSaved={async saved => {
        await reload();
        // The completion screen takes the form's place, so back from it returns to where the form was opened.
        replace({ screen: "complete", provinceId: provinceIdForRegion(saved.id), regionId: saved.id });
      }} />}
      {screen === "complete" && <div className="complete-view">
        <div className="complete-mark"><MapPin size={54} strokeWidth={1} /></div>
        <h1>{region?.fullName} 여행 기록 완료 !</h1>
        <button className="solid-button" onClick={() => replace(doneNav)}>지도에서 보기</button>
      </div>}
      {screen === "my" && <MyScreen displayName={account?.displayName} email={account?.email} tripCount={trips.length} stats={stats} mode={mode}
        onMenu={toggleMenu} onProvince={openProvince} onLogout={() => void logout()} onAccountMode={() => setMode("server")}
        onDeleteAccount={() => navigation.openOverlay("deleteAccount")} onEmail={() => navigation.openOverlay("email")} onLegal={openLegal} />}
      {legal && <LegalScreen doc={legal} onBack={back} />}
      {overlay === "menu" && <div className="more-menu">
        <button onClick={() => openForm(screen === "detail")}>{screen === "detail" ? "기록 수정" : "여행기록 추가"}</button>
        {screen === "detail" && trip && <button className="danger" onClick={() => navigation.openOverlay("deleteTrip")}><Trash2 size={14} /> 기록 삭제</button>}
        <button onClick={() => navigation.openOverlay("search")}>지역 목록 보기</button>
        <button onClick={switchMode}>{mode === "demo" ? "계정으로 로그인" : "기기 체험 모드"}</button>
      </div>}
    </div>
    {(screen === "map" || screen === "my") && <nav className="mobile-tabs" aria-label="주요 메뉴">
      <button className={screen === "map" ? "current" : ""} onClick={() => openTab("map")}><MapPin size={19} fill="currentColor" /><span>지도</span></button>
      <button className={screen === "my" ? "current" : ""} onClick={() => openTab("my")}><UserRound size={19} fill="currentColor" /><span>나</span></button>
    </nav>}
    {overlay === "search" && <RegionSearchSheet query={query} onQuery={setQuery} stats={stats} onClose={navigation.closeOverlay}
      onPick={picked => picked.level === "province" ? openProvince(picked) : openRegion(picked)} />}
    {overlay === "cover" && province && <ProvinceCoverSheet province={province} cover={coverByRegion.get(province.id)} latestTrip={mostRecentTripForRegion(trips, province.id)}
      mode={mode} onClose={navigation.closeOverlay} onChanged={reload} />}
    {overlay === "deleteTrip" && trip && region && <TripDeleteDialog trip={trip} region={region} onClose={navigation.closeOverlay} onDelete={deleteTrip} />}
    {overlay === "deleteAccount" && <DeleteAccountDialog onClose={navigation.closeOverlay} onDelete={deleteAccount} />}
    {overlay === "email" && <EmailDialog current={account?.email} onClose={navigation.closeOverlay} onSave={saveEmail} />}
    <Attribution />
  </div></div>;
}
