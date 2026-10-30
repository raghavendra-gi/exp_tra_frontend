// Convert a File/Blob to a base64 data URL
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Compress an image file (returns a Blob). PDFs pass through unchanged.
export async function compressImage(file, maxDim = 1600, quality = 0.8) {
  if (!file.type || !file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    // Use the compressed version only if it's actually smaller
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // If compression fails, use the original
  }
}

// Generate a unique ID for a file
export function newFileId() {
  return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}
