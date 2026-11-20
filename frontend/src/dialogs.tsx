import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { regions, type Region, type Trip } from "./data";
import { dateRange } from "./dates.mjs";
import type { TravelStats } from "./travelStats";

export function DeleteAccountDialog({ onClose, onDelete }: { onClose: () => void; onDelete: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="sheet-backdrop" onClick={onClose}>
    <form className="delete-dialog" onClick={event => event.stopPropagation()} onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      try {
        await onDelete(password);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "비밀번호를 확인해 주세요.");
        setBusy(false);
      }
    }}>
      <h2>계정을 삭제할까요?</h2>
      <p>계정, 여행 기록과 사진이 삭제됩니다. 되돌릴 수 없어요.</p>
      <input type="password" aria-label="비밀번호 확인" placeholder="비밀번호 확인" required value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <div>
        <button type="button" onClick={onClose}>취소</button>
        <button className="solid-button" disabled={busy}>계정 삭제</button>
      </div>
    </form>
  </div>;
}

// Changing or removing the recovery email needs the password, like the server checks.
export function EmailDialog({ current, onClose, onSave }: { current?: string | null; onClose: () => void; onSave: (email: string | null, password: string) => Promise<void> }) {
  const [email, setEmail] = useState(current || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (next: string | null) => {
    setBusy(true);
    setError("");
    try {
      await onSave(next, password);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "이메일을 저장하지 못했어요.");
      setBusy(false);
    }
  };
  return <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
    <form className="delete-dialog email-dialog" onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void save(email.trim() || null); }}>
      <h2>복구용 이메일</h2>
      <p>비밀번호와 복구 코드를 모두 잊었을 때 이 주소로 재설정 링크를 보내 드려요.</p>
      <input type="email" aria-label="이메일" placeholder="이메일" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
      <input type="password" aria-label="비밀번호 확인" placeholder="비밀번호 확인" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        <button className="solid-button" disabled={busy}>{busy ? "저장 중..." : "저장"}</button>
      </div>
      {current && <button type="button" className="email-remove" disabled={busy || !password} onClick={() => void save(null)}>이메일 지우기</button>}
    </form>
  </div>;
}

export function TripDeleteDialog({ trip, region, onClose, onDelete }: { trip: Trip; region: Region; onClose: () => void; onDelete: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
    <form className="delete-dialog trip-delete-dialog" role="alertdialog" aria-labelledby="trip-delete-title" onClick={event => event.stopPropagation()} onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setError("");
      try {
        await onDelete();
      } catch {
        setError("기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setBusy(false);
      }
    }}>
      <div className="delete-icon"><Trash2 size={22} /></div>
      <h2 id="trip-delete-title">여행 기록을 삭제할까요?</h2>
      <p className="trip-delete-summary">{region.fullName}<br />{dateRange(trip.startDate, trip.endDate)}</p>
      <p>이 기록의 대표 사진과 장소 사진도 더 이상 사용되지 않으면 함께 삭제됩니다. 되돌릴 수 없어요.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        <button className="solid-button danger-confirm" disabled={busy}>{busy ? "삭제 중..." : "기록 삭제"}</button>
      </div>
    </form>
  </div>;
}

function regionStatus(region: Region, stats: TravelStats) {
  if (region.level === "province") return stats.visitedProvinces.has(region.id) ? "방문" : "시·군·구 보기";
  if (region.level === "district") return stats.visitedDistricts.has(region.id) ? "방문" : "읍·면·동 보기";
  return stats.visitedNeighborhoods.has(region.id) ? "방문" : "미방문";
}

export function RegionSearchSheet({ query, onQuery, stats, onClose, onPick }: {
  query: string;
  onQuery: (query: string) => void;
  stats: TravelStats;
  onClose: () => void;
  onPick: (region: Region) => void;
}) {
  const found = regions.filter(region => region.name.includes(query) || region.fullName.includes(query)).slice(0, 80);
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="region-sheet" onClick={event => event.stopPropagation()} role="dialog" aria-label="지역 검색">
      <div className="sheet-header"><h2>지역 찾기</h2><button aria-label="닫기" onClick={onClose}><X /></button></div>
      <input autoFocus placeholder="시·도, 시·군·구, 읍·면·동 검색" value={query} onChange={event => onQuery(event.target.value)} />
      <div className="sheet-list">
        {found.map(region => <button key={region.id} onClick={() => onPick(region)}>{region.fullName}<span>{regionStatus(region, stats)}</span></button>)}
      </div>
    </div>
  </div>;
}
