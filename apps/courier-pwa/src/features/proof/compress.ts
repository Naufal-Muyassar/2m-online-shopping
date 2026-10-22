const MAX_BYTES = 300 * 1024;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal memproses foto."))), "image/jpeg", quality);
  });
}

// Re-encodes as JPEG (the presigned URL signs image/jpeg), shrinking until <= 300 KB.
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Foto tidak dapat dibaca. Coba ambil foto lagi.");
  }

  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= MAX_BYTES) return blob;
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Foto terlalu besar. Coba ambil foto lagi.");
}
