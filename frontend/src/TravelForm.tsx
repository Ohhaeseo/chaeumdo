import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, LoaderCircle, MapPin, Plus, Search, X } from "lucide-react";
import { api, districts, neighborhoods, provinceIdForRegion, provinces, regionById, regionIdsForTrip, saveLocal, type PlaceLocation, type Region, type Trip } from "./data";
import { inclusiveDays } from "./dates.mjs";
import { searchPlaces, type PlaceSearchResult } from "./placeSearch";
import { preparePhoto, prepareThumbnail } from "./photo";

type PlacePhoto = File | string | null;
type PlaceRow = { name: string; photo: PlacePhoto; location: PlaceLocation | null };

function dayDate(start: string, offset: number) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function PlacePhotoPicker({ value, day, index, onChange }: {
  value: PlacePhoto;
  day: number;
  index: number;
  onChange: (value: PlacePhoto) => void;
}) {
  const [preview, setPreview] = useState(typeof value === "string" ? value : "");
  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(value || "");
  }, [value]);
  return <span className="place-photo-picker">
    <label title={preview ? "장소 사진 바꾸기" : "장소 사진 추가"}>
      <input type="file" accept="image/jpeg,image/png" aria-label={`DAY ${day} 장소 ${index} 사진`}
        onChange={event => { onChange(event.target.files?.[0] || null); event.target.value = ""; }} />
      {preview ? <img src={preview} alt="" /> : <ImagePlus size={17} />}
    </label>
    {value && <button type="button" aria-label={`DAY ${day} 장소 ${index} 사진 삭제`} onClick={() => onChange(null)}><X size={10} /></button>}
  </span>;
}

function PlaceSearchPicker({ value, location, day, index, onNameChange, onSelect }: {
  value: string;
  location: PlaceLocation | null;
  day: number;
  index: number;
  onNameChange: (value: string) => void;
  onSelect: (result: PlaceSearchResult) => void;
}) {
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function search() {
    if (value.trim().length < 2) {
      setMessage("두 글자 이상 입력해 주세요.");
      setOpen(true);
      return;
    }
    setBusy(true); setMessage(""); setOpen(true);
    try {
      const found = await searchPlaces(value);
      setResults(found);
      if (!found.length) setMessage("검색 결과가 없어요. 장소명은 그대로 저장할 수 있어요.");
    } catch (failure) {
      setResults([]);
      setMessage(failure instanceof Error ? failure.message : "장소를 검색하지 못했어요.");
    } finally { setBusy(false); }
  }
  return <div className="place-search-field">
    <div className="place-input-row">
      <input aria-label={`DAY ${day} 장소 ${index}`} value={value} maxLength={200} placeholder="방문 장소"
        onChange={event => { onNameChange(event.target.value); setOpen(false); }} />
      <button className={location ? "place-search-button selected" : "place-search-button"} type="button" aria-label={`DAY ${day} 장소 ${index} 검색`} onClick={() => void search()} disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{location ? "핀 변경" : "검색"}
      </button>
    </div>
    {location && <p className="selected-place-address"><MapPin size={11} fill="currentColor" />{location.address || "지도 위치 저장됨"}</p>}
    {open && <div className="place-search-results" role="listbox" aria-label={`DAY ${day} 장소 ${index} 검색 결과`}>
      {busy && <p>장소를 찾고 있어요…</p>}
      {!busy && message && <p>{message}</p>}
      {!busy && results.map((result, resultIndex) => <button type="button" role="option" key={`${result.location.sourceId}-${resultIndex}`} onClick={() => { onSelect(result); setOpen(false); }}>
        <b>{result.name}</b><small>{result.location.address}</small>
      </button>)}
      {!busy && <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">검색: Photon · © OpenStreetMap contributors</a>}
    </div>}
  </div>;
}

async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", await preparePhoto(file));
  return (await api<{ id: string }>("/photos", { method: "POST", body: form })).id;
}

export default function TravelForm({ region, trip, mode, onBack, onSaved }: {
  region: Region | null;
  trip: Trip | null;
  mode: "demo" | "server";
  onBack: () => void;
  onSaved: (region: Region) => Promise<void>;
}) {
  const initialRegion = regionById.get(trip?.regionId || region?.id || "");
  const [regionIds, setRegionIds] = useState<string[]>(() => trip
    ? regionIdsForTrip(trip)
    : initialRegion && initialRegion.level !== "province" ? [initialRegion.id] : []);
  const initialDistrictId = initialRegion?.level === "neighborhood" ? initialRegion.parentId || "" : initialRegion?.level === "district" ? initialRegion.id : "";
  const [districtId, setDistrictId] = useState(initialDistrictId);
  const [neighborhoodId, setNeighborhoodId] = useState(initialRegion?.level === "neighborhood" ? initialRegion.id : "");
  const [provinceId, setProvinceId] = useState(initialRegion ? provinceIdForRegion(initialRegion.id) : "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(trip?.photoUrl || "");
  const [start, setStart] = useState(trip?.startDate || "");
  const [end, setEnd] = useState(trip?.endDate || "");
  const [companions, setCompanions] = useState<string[]>(() => trip?.companion.split(",").map(value => value.trim()).filter(Boolean) || []);
  const [places, setPlaces] = useState<string[][]>(trip?.days || []);
  const [placePhotos, setPlacePhotos] = useState<PlacePhoto[][]>(() => trip?.placePhotoUrls?.map(day => [...day]) || []);
  const [placeLocations, setPlaceLocations] = useState<(PlaceLocation | null)[][]>(() => trip?.placeLocations?.map(day => [...day]) || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const companionInputs = useRef<Array<HTMLInputElement | null>>([]);
  const focusAdded = useRef(false);
  const count = inclusiveDays(start, end);
  const selectedRegions = regionIds.map(id => regionById.get(id)).filter((item): item is Region => Boolean(item));
  const pendingRegionId = neighborhoodId || districtId || provinceId;
  const pendingRegionAlreadySelected = Boolean(pendingRegionId && regionIds.includes(pendingRegionId));

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (focusAdded.current) {
      companionInputs.current[companions.length - 1]?.focus();
      focusAdded.current = false;
    }
  }, [companions.length]);

  function updatePlace(day: number, index: number, value: string) {
    setPlaces(previous => {
      const next = previous.map(row => [...row]);
      next[day] ??= [];
      next[day][index] = value;
      return next;
    });
    setPlaceLocations(previous => {
      const next = previous.map(row => [...row]);
      next[day] ??= [];
      next[day][index] = null;
      return next;
    });
  }
  function selectPlace(day: number, index: number, result: PlaceSearchResult) {
    setPlaces(previous => {
      const next = previous.map(row => [...row]); next[day] ??= []; next[day][index] = result.name; return next;
    });
    setPlaceLocations(previous => {
      const next = previous.map(row => [...row]); next[day] ??= []; next[day][index] = result.location; return next;
    });
  }
  function updatePlacePhoto(day: number, index: number, value: PlacePhoto) {
    setPlacePhotos(previous => {
      const next = previous.map(row => [...row]);
      next[day] ??= [];
      next[day][index] = value;
      return next;
    });
  }
  function addPlace(day: number) {
    setPlaces(previous => {
      const next = previous.map(row => [...row]);
      next[day] ??= [];
      next[day].push("");
      return next;
    });
    setPlacePhotos(previous => {
      const next = previous.map(row => [...row]);
      next[day] ??= [];
      next[day].push(null);
      return next;
    });
    setPlaceLocations(previous => {
      const next = previous.map(row => [...row]); next[day] ??= []; next[day].push(null); return next;
    });
  }
  function removePlace(day: number, index: number) {
    setPlaces(previous => {
      const next = previous.map(row => [...row]);
      next[day].splice(index, 1);
      return next;
    });
    setPlacePhotos(previous => {
      const next = previous.map(row => [...row]);
      if (next[day]) next[day].splice(index, 1);
      return next;
    });
    setPlaceLocations(previous => {
      const next = previous.map(row => [...row]); if (next[day]) next[day].splice(index, 1); return next;
    });
  }
  function addRegion() {
    const nextRegionId = pendingRegionId;
    if (!nextRegionId) return;
    if (regionIds.includes(nextRegionId)) {
      setError("이미 추가한 지역이에요.");
      return;
    }
    if (regionIds.length >= 10) {
      setError("한 여행에는 지역을 최대 10곳까지 연결할 수 있어요.");
      return;
    }
    setRegionIds(previous => [...previous, nextRegionId]);
    setProvinceId("");
    setDistrictId("");
    setNeighborhoodId("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!regionIds.length || (!file && !trip) || count < 1 || count > 366) {
      setError("여행 지역, 대표 사진, 여행 날짜를 확인해 주세요.");
      return;
    }
    const companion = companions.map(name => name.trim().replaceAll(",", "")).filter(Boolean).join(",");
    if (companion.length > 200) {
      setError("동행자 이름은 합쳐서 200자 이하여야 해요.");
      return;
    }
    if (Array.from({ length: count }, (_, day) => (places[day] || []).some((name, index) =>
      !name.trim() && placePhotos[day]?.[index])).some(Boolean)) {
      setError("사진을 넣은 장소의 이름을 입력해 주세요.");
      return;
    }
    const rows: PlaceRow[][] = Array.from({ length: count }, (_, day) =>
      (places[day] || []).map((name, index) => ({ name: name.trim(), photo: placePhotos[day]?.[index] || null, location: placeLocations[day]?.[index] || null }))
        .filter(row => row.name.length > 0));
    if (rows.some(day => day.length > 50 || day.some(row => row.name.length > 200))) {
      setError("하루 장소는 50개, 이름은 200자 이하여야 해요.");
      return;
    }
    const selectedFiles = [file, ...rows.flat().map(row => row.photo)].filter((photo): photo is File => photo instanceof File);
    if (selectedFiles.some(photo => !["image/jpeg", "image/png"].includes(photo.type) || photo.size > 15 * 1024 * 1024)) {
      setError("사진은 각각 15MB 이하 JPEG 또는 PNG로 선택해 주세요.");
      return;
    }
    const days = rows.map(day => day.map(row => row.name));
    const nextPlaceLocations = rows.map(day => day.map(row => row.location));
    const next = { id: trip?.id || requestId.current, regionId: regionIds[0], regionIds, startDate: start, endDate: end, companion, days, placeLocations: nextPlaceLocations };
    setBusy(true);
    try {
      if (mode === "demo") {
        const cover = file ? await preparePhoto(file) : await (await fetch(trip!.photoUrl)).blob();
        // A record saved before thumbnails has one URL for both, so it gets its thumbnail now.
        const thumbnail = !file && trip!.thumbnailUrl !== trip!.photoUrl
          ? await (await fetch(trip!.thumbnailUrl)).blob()
          : await prepareThumbnail(cover);
        // Kept place photos come back as URLs and may have moved, so their thumbnails are found by URL.
        const savedThumbnails = new Map<string, string>();
        trip?.placePhotoUrls?.forEach((day, i) => day.forEach((url, j) => {
          const thumbnailUrl = trip.placePhotoThumbnailUrls?.[i]?.[j];
          if (url && thumbnailUrl && thumbnailUrl !== url) savedThumbnails.set(url, thumbnailUrl);
        }));
        // One photo at a time keeps decoding memory low on phones.
        const photos: (Blob | null)[][] = [];
        const thumbnails: (Blob | null)[][] = [];
        for (const day of rows) {
          const photoDay: (Blob | null)[] = [];
          const thumbnailDay: (Blob | null)[] = [];
          for (const row of day) {
            const placePhoto = row.photo instanceof File ? await preparePhoto(row.photo)
              : typeof row.photo === "string" ? await (await fetch(row.photo)).blob() : null;
            const savedThumbnail = typeof row.photo === "string" ? savedThumbnails.get(row.photo) : undefined;
            photoDay.push(placePhoto);
            thumbnailDay.push(!placePhoto ? null : savedThumbnail ? await (await fetch(savedThumbnail)).blob() : await prepareThumbnail(placePhoto));
          }
          photos.push(photoDay);
          thumbnails.push(thumbnailDay);
        }
        await saveLocal(next, cover, thumbnail, photos, thumbnails);
      } else {
        const photoId = file ? await uploadPhoto(file) : undefined;
        const placePhotoIds: (string | null)[][] = [];
        for (const day of rows) {
          const photoDay: (string | null)[] = [];
          for (const row of day) {
            if (row.photo instanceof File) photoDay.push(await uploadPhoto(row.photo));
            else if (typeof row.photo === "string") photoDay.push(row.photo.split("/").at(-1) || null);
            else photoDay.push(null);
          }
          placePhotoIds.push(photoDay);
        }
        await api(trip ? `/trips/${trip.id}` : "/trips", {
          method: trip ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, requestId: requestId.current, photoId, placePhotoIds, placeLocations: nextPlaceLocations }),
        });
      }
      await onSaved(regionById.get(regionIds[0])!);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="inner-header"><button aria-label="뒤로" onClick={onBack}><ArrowLeft size={22} strokeWidth={1.3} /></button><h1>{selectedRegions.length > 1 ? `여행 지역 ${selectedRegions.length}곳` : selectedRegions[0]?.fullName || "지역 선택"}</h1><span /></header>
    <form className="travel-form" onSubmit={submit}>
      <section className="trip-region-section">
        <div className="trip-region-heading"><h2>여행 지역</h2><small>여행한 순서대로 추가해 주세요.</small></div>
        {selectedRegions.length > 0 && <ol className="selected-region-list">{selectedRegions.map((item, index) => <li key={item.id}><span>{index + 1}</span><b>{item.fullName}</b><button type="button" aria-label={`${item.fullName} 삭제`} onClick={() => setRegionIds(previous => previous.filter(id => id !== item.id))}><X size={14} /></button></li>)}</ol>}
      </section>
      <div className="region-selects">
        <label className="region-select-label">시·도<select aria-label="시·도" value={provinceId} onChange={event => { setProvinceId(event.target.value); setDistrictId(""); setNeighborhoodId(""); setError(""); }}><option value="">시·도를 선택해 주세요</option>{provinces.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
        <label className="region-select-label">시·군·구<select aria-label="시·군·구" value={districtId} disabled={!provinceId} onChange={event => { setDistrictId(event.target.value); setNeighborhoodId(""); setError(""); }}><option value="">시·군·구 전체</option>{districts.filter(item => item.parentId === provinceId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="region-select-label neighborhood-select">읍·면·동<select aria-label="읍·면·동" value={neighborhoodId} disabled={!districtId} onChange={event => { setNeighborhoodId(event.target.value); setError(""); }}><option value="">읍·면·동 전체</option>{neighborhoods.filter(item => item.parentId === districtId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <button className="add-region-button" type="button" disabled={!pendingRegionId || regionIds.length >= 10} onClick={addRegion}><Plus size={15} /> {pendingRegionAlreadySelected ? "이미 추가된 지역" : "선택한 지역 추가"}</button>
      <label className={`cover-picker ${preview ? "has-photo" : ""}`} title="대표 사진 추가 또는 변경">
        <input aria-label="대표 사진" type="file" accept="image/jpeg,image/png" required={!trip}
          onChange={event => setFile(event.target.files?.[0] || null)} />
        {preview ? <img src={preview} alt="대표 사진 미리보기" /> : <><Plus size={28} strokeWidth={1} /><span className="cover-hint">대표 사진 추가</span></>}
      </label>
      <section className="form-section"><h2>동행자</h2><div className="companion-list"><button className="round-plus" type="button" aria-label="동행자 추가" onClick={() => { focusAdded.current = true; setCompanions(previous => [...previous, ""]); }}><Plus size={17} /></button>{companions.map((name, index) => <div className="companion-entry" key={index}><input ref={element => { companionInputs.current[index] = element; }} aria-label={`동행자 ${index + 1} 이름`} placeholder="동행자 이름" maxLength={40} value={name} onChange={event => setCompanions(previous => previous.map((value, i) => i === index ? event.target.value : value))} /><button type="button" aria-label={`동행자 ${index + 1} 삭제`} onClick={() => setCompanions(previous => previous.filter((_, i) => i !== index))}><X size={14} /></button></div>)}</div></section>
      <section className="form-section"><h2>여행 기록</h2><div className="form-dates"><input aria-label="시작일" type="date" required value={start} onChange={event => setStart(event.target.value)} /><span>~</span><input aria-label="종료일" type="date" required min={start} value={end} onChange={event => setEnd(event.target.value)} /></div>{count > 0 && count <= 366 && <p className="trip-duration">{count === 1 ? "당일치기" : `${count - 1}박 ${count}일`}</p>}{count > 0 && count <= 366 && Array.from({ length: count }, (_, day) => <div className="form-day" key={day}><h3>DAY {day + 1} <small>{dayDate(start, day)}</small></h3>{(places[day] || []).map((name, index) => <div className="form-place" key={index}><MapPin className="form-place-pin" size={16} fill="currentColor" /><PlaceSearchPicker value={name} location={placeLocations[day]?.[index] || null} day={day + 1} index={index + 1} onNameChange={value => updatePlace(day, index, value)} onSelect={result => selectPlace(day, index, result)} /><PlacePhotoPicker value={placePhotos[day]?.[index] || null} day={day + 1} index={index + 1} onChange={value => updatePlacePhoto(day, index, value)} /><button type="button" aria-label="장소 삭제" onClick={() => removePlace(day, index)}><X size={14} /></button></div>)}<button className="add-place" type="button" onClick={() => addPlace(day)}><Plus size={16} /> 방문장소 추가</button></div>)}</section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="solid-button save-button" disabled={busy}>{busy ? "저장 중..." : "저장"}</button>
    </form>
  </>;
}
