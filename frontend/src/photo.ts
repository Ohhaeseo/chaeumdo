import { fitWithin } from "./photoSize.mjs";

const MAX_EDGE = 2048;
const THUMBNAIL_EDGE = 320;
const JPEG_QUALITY = 0.9;
const THUMBNAIL_QUALITY = 0.82;
const READ_FAILED = "사진을 읽지 못했어요. 다른 JPEG·PNG 사진을 선택해 주세요.";

// Drawing through <img> applies the EXIF rotation, so phone portraits stay upright,
// and the canvas output carries no metadata such as GPS.
async function shrinkToJpeg(source: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    // onload instead of decode(): decode() can stall for large JPEGs while the page is not painting.
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    // JPEG has no alpha channel, so transparent PNG areas become white instead of black.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("encoding failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Shrinks a picked photo before it is saved.
export async function preparePhoto(file: File): Promise<File> {
  try {
    const blob = await shrinkToJpeg(file, MAX_EDGE, JPEG_QUALITY);
    return new File([blob], "photo.jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new Error(READ_FAILED);
  }
}

// The small copy that maps and record cards draw. Like the server, it is made from the prepared photo.
export async function prepareThumbnail(photo: Blob): Promise<Blob> {
  try {
    return await shrinkToJpeg(photo, THUMBNAIL_EDGE, THUMBNAIL_QUALITY);
  } catch {
    throw new Error(READ_FAILED);
  }
}
