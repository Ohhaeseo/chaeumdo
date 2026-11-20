import { useState } from "react";
import { X } from "lucide-react";
import { api, deleteLocalRegionCover, saveLocalRegionCover, type Region, type RegionCover, type Trip } from "./data";
import { ProvincePhotoPreview } from "./KoreaMap";
import { preparePhoto, prepareThumbnail, uploadPhoto } from "./photo";

// Picks the photo that fills a 시·도 on the national map. Removing it returns the map to the latest trip's photo.
export default function ProvinceCoverSheet({
  province,
  cover,
  latestTrip,
  mode,
  onClose,
  onChanged,
}: {
  province: Region;
  cover?: RegionCover;
  latestTrip?: Trip;
  mode: "demo" | "server";
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photo = cover?.photoUrl ?? latestTrip?.photoUrl;
  const source = cover ? "직접 고른 사진" : latestTrip ? "최근 여행 사진" : "아직 사진이 없어요";

  async function run(change: () => Promise<void>, failed: string) {
    setBusy(true);
    setError("");
    try {
      await change();
      await onChanged();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : failed);
      setBusy(false);
    }
  }
  const choose = (file: File) =>
    run(async () => {
      if (mode === "demo") {
        const prepared = await preparePhoto(file);
        await saveLocalRegionCover(province.id, prepared, await prepareThumbnail(prepared));
      } else {
        const photoId = await uploadPhoto(file);
        await api(`/region-covers/${province.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId }),
        });
      }
    }, "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  const reset = () =>
    run(async () => {
      if (mode === "demo") await deleteLocalRegionCover(province.id);
      else await api(`/region-covers/${province.id}`, { method: "DELETE" });
    }, "사진을 되돌리지 못했어요. 잠시 후 다시 시도해 주세요.");

  return (
    <div className="sheet-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="region-sheet cover-sheet"
        role="dialog"
        aria-label={`${province.name} 지도 사진`}
        onClick={event => event.stopPropagation()}
      >
        <div className="sheet-header">
          <h2>{province.name} 지도 사진</h2>
          <button aria-label="닫기" disabled={busy} onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="cover-note">전국 지도의 {province.fullName} 자리를 채우는 사진이에요.</p>
        <div className="cover-preview">
          <ProvincePhotoPreview province={province} photo={photo} />
          <span className="cover-source">{source}</span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label className={busy ? "solid-button cover-pick busy" : "solid-button cover-pick"}>
          {busy ? "저장하는 중..." : photo ? "다른 사진으로 바꾸기" : "사진 선택"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            hidden
            disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void choose(file);
            }}
          />
        </label>
        {cover && (
          <button className="cover-reset" disabled={busy} onClick={() => void reset()}>
            {latestTrip ? "최근 여행 사진으로 되돌리기" : "사진 지우기"}
          </button>
        )}
      </div>
    </div>
  );
}
