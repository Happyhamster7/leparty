const MAX_EDGE = 900;
const JPEG_QUALITY = 0.72;

/**
 * Crop to 3:4 portrait around the centre, downscale, encode JPEG.
 *
 * A raw phone photo is 3-8MB; this lands around 80-150KB, which is the
 * difference between working and not working on party wifi with forty
 * people on it. Runs in the browser, so nothing large is ever uploaded.
 */
export async function toJpegBlob(
  source: HTMLVideoElement | HTMLImageElement
): Promise<Blob> {
  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;

  const targetRatio = 3 / 4;
  let cropW = srcW;
  let cropH = Math.round(srcW / targetRatio);
  if (cropH > srcH) {
    cropH = srcH;
    cropW = Math.round(srcH * targetRatio);
  }
  const cropX = Math.round((srcW - cropW) / 2);
  const cropY = Math.round((srcH - cropH) / 2);

  const scale = Math.min(1, MAX_EDGE / Math.max(cropW, cropH));
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas context');
  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

export async function fileToJpegBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return await toJpegBlob(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
