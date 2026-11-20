import { districts, type RegionCover, type Trip } from "./data";
import { labelWidth, NATIONAL_VIEWBOX, PIN_PHOTO_RADIUS, PIN_RADIUS, provinceMapItems } from "./KoreaMap";
import { loadMapBoundaries } from "./mapData";
import type { TravelStats } from "./travelStats";

// The national map as one picture to save or share: the same fills, pins and names as on screen
// (provinceMapItems), drawn on a canvas with a title and the traveler's progress.
const WIDTH = 1080;
const SCALE = WIDTH / NATIONAL_VIEWBOX.width;
const TOP = 210;
const BOTTOM = 150;
const FONT = "SCoreDream, sans-serif";

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

// Like the map's preserveAspectRatio="xMidYMid slice": fill the box, centred, cropping what sticks out.
function drawCovering(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function pill(ctx: CanvasRenderingContext2D, name: string, x: number, top: number, height: number, baseline: number) {
  const width = labelWidth(name);
  ctx.fillStyle = "rgba(17, 17, 17, 0.78)";
  ctx.beginPath();
  ctx.roundRect(x - width / 2, top, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `500 12px ${FONT}`;
  ctx.fillText(name, x, baseline);
}

export async function renderMapImage(trips: Trip[], covers: Map<string, RegionCover>, stats: TravelStats): Promise<Blob> {
  const boundaries = await loadMapBoundaries();
  const items = provinceMapItems(boundaries, trips, covers);
  await Promise.all(["300", "400", "500"].map(weight => document.fonts.load(`${weight} 20px SCoreDream`)));
  // Full-size photos keep the picture sharp; a 320px thumbnail would blur at this size.
  const urls = [...new Set(items.flatMap(item => item.fullPhoto ?? item.photo ?? []))];
  const images = new Map(await Promise.all(urls.map(async url => [url, await loadImage(url)] as const)));
  const imageFor = (item: (typeof items)[number]) => images.get(item.fullPhoto ?? item.photo ?? "") ?? null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = TOP + NATIONAL_VIEWBOX.height * SCALE + BOTTOM;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 지도 이미지를 만들 수 없어요.");
  ctx.fillStyle = "#F7F7F5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#111111";
  ctx.font = `300 64px ${FONT}`;
  ctx.fillText("나의 채움도", WIDTH / 2, 112);
  ctx.fillStyle = "#696973";
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText(`시·군·구 ${stats.visitedDistricts.size} / ${districts.length}곳 · 전국 ${stats.nationalPercent}% 채움`, WIDTH / 2, 164);

  // From here on, coordinates are the map's own viewBox units, as in KoreaMap.
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, -NATIONAL_VIEWBOX.x * SCALE, TOP - NATIONAL_VIEWBOX.y * SCALE);
  ctx.lineJoin = "round";
  for (const item of items) {
    const shape = new Path2D(item.path);
    ctx.fillStyle = item.photo ? "#E5E5E2" : item.region.recommended ? "#F7F7F5" : "#FFFFFF";
    ctx.fill(shape, "evenodd");
    const image = imageFor(item);
    if (image) {
      ctx.save();
      ctx.clip(shape, "evenodd");
      drawCovering(ctx, image, item.shape.main.x, item.shape.main.y, item.shape.main.width, item.shape.main.height);
      ctx.restore();
    }
    ctx.strokeStyle = "#696973";
    ctx.lineWidth = 1.4;
    ctx.stroke(shape);
  }
  ctx.strokeStyle = "#E5E5E2";
  ctx.lineWidth = 0.8;
  for (const district of boundaries.districts) ctx.stroke(new Path2D(district.path));
  for (const item of items) {
    const [x, y] = item.point;
    if (!item.photo) {
      ctx.font = `500 14px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#FFFFFF";
      ctx.strokeText(item.region.name, x, y);
      ctx.fillStyle = "#696973";
      ctx.fillText(item.region.name, x, y);
    } else if (!item.pinned) pill(ctx, item.region.name, x, y - 10, 20, y + 4);
  }
  // Pins last, so a neighbour's name never covers a photo.
  for (const item of items) {
    if (!item.photo || !item.pinned) continue;
    const [x, y] = item.point;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    const image = imageFor(item);
    if (image) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, PIN_PHOTO_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      drawCovering(ctx, image, x - PIN_PHOTO_RADIUS, y - PIN_PHOTO_RADIUS, PIN_PHOTO_RADIUS * 2, PIN_PHOTO_RADIUS * 2);
      ctx.restore();
    }
    pill(ctx, item.region.name, x, y + 6, 18, y + 19);
  }
  ctx.restore();

  ctx.fillStyle = "#9A9BA0";
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText("채움도 · 여행으로 채우는 나의 지도", WIDTH / 2, canvas.height - 64);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("지도 이미지를 만들지 못했어요.");
  return blob;
}

// Opens the phone's share sheet when it can take files, otherwise saves the picture.
export async function shareOrSave(blob: Blob, share: boolean): Promise<"shared" | "saved" | "cancelled"> {
  const file = new File([blob], "chaeummdo-map.jpg", { type: blob.type });
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "나의 채움도" });
      return "shared";
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") return "cancelled";
      throw failure;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

export const canShareFiles = () => typeof navigator.canShare === "function"
  && navigator.canShare({ files: [new File([new Blob()], "x.jpg", { type: "image/jpeg" })] });
