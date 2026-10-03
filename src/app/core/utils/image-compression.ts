const MAX_IMAGE_BYTES = 102_400;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function compressProfileImage(file: File): Promise<File> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image compression is unavailable in this browser.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.58, 0.46, 0.34, 0.28]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) return new File([blob], 'profile.jpg', { type: 'image/jpeg' });
  }
  throw new Error('This photo could not be compressed below 100 KB. Choose a smaller image.');
}