import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RegionCover, Trip } from "./data";
import { canShareFiles, renderMapImage, shareOrSave } from "./mapImage";
import type { TravelStats } from "./travelStats";

export default function ShareMapSheet({ trips, covers, stats, onClose }: {
  trips: Trip[];
  covers: Map<string, RegionCover>;
  stats: TravelStats;
  onClose: () => void;
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let url = "";
    let active = true;
    renderMapImage(trips, covers, stats).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url });
    }).catch(failure => active && setError(failure instanceof Error ? failure.message : "지도 이미지를 만들지 못했어요."));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  const send = async (share: boolean) => {
    if (!image) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await shareOrSave(image.blob, share);
      if (result === "saved") setNotice("이미지를 저장했어요.");
    } catch {
      setNotice("공유하지 못했어요. 이미지 저장을 이용해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  return <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
    <div className="region-sheet share-sheet" role="dialog" aria-label="지도 이미지" onClick={event => event.stopPropagation()}>
      <div className="sheet-header"><h2>지도 이미지</h2><button aria-label="닫기" disabled={busy} onClick={onClose}><X /></button></div>
      <div className="share-preview">
        {image ? <img src={image.url} alt="내가 채운 전국 지도 이미지" /> : error ? <p role="alert">{error}</p> : <p role="status">지도를 그리고 있어요…</p>}
      </div>
      {notice && <p className="share-notice" role="status">{notice}</p>}
      <div className="share-actions">
        {canShareFiles() && <button className="solid-button" disabled={!image || busy} onClick={() => void send(true)}>공유하기</button>}
        <button className={canShareFiles() ? "cover-reset" : "solid-button"} disabled={!image || busy} onClick={() => void send(false)}>이미지 저장</button>
      </div>
    </div>
  </div>;
}
