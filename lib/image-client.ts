// Browser-only: downscale a photo before sending it to the server (keeps uploads small and fast).
export async function imageToBase64(file: File, maxSide = 1568, quality = 0.85): Promise<{ data: string; type: "image/jpeg"; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", quality);
  return { data: url.split(",")[1], type: "image/jpeg", preview: url };
}
