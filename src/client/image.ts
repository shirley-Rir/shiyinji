const TARGET_BYTES = 700 * 1024;
const MAX_DIMENSION = 1280;

export async function prepareContextImage(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("IMAGE_PROCESSING_UNAVAILABLE");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, "image/webp", quality);
      if (blob.size <= TARGET_BYTES) break;
      scale *= 0.78;
      quality = Math.max(0.58, quality - 0.08);
    }

    if (!blob) throw new Error("IMAGE_PROCESSING_FAILED");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "context";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_PROCESSING_FAILED")), type, quality);
  });
}
