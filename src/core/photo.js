const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png']);

export { MAX_PHOTO_BYTES };

export class PhotoValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PhotoValidationError';
    this.code = code;
  }
}

export async function validatePhotoFile(file) {
  const FileCtor = globalThis.File;
  if (!FileCtor || !(file instanceof FileCtor)) {
    throw new PhotoValidationError('photo-invalid-file');
  }
  if (!PHOTO_TYPES.has(file.type)) {
    throw new PhotoValidationError('photo-invalid-type');
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError('photo-invalid-size');
  }

  await decodePhotoFile(file);
  return {
    metadata: {
      id: createPhotoId(),
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0,
    },
    blob: file,
  };
}

export async function decodePhotoFile(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    bitmap?.close?.();
    return;
  }
  if (typeof globalThis.Image !== 'function' || typeof URL?.createObjectURL !== 'function') {
    throw new PhotoValidationError('photo-decode-unavailable');
  }

  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new PhotoValidationError('photo-decode-failed'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob) {
  if (!(blob instanceof Blob)) throw new TypeError('A Blob is required');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  if (typeof btoa === 'function') return btoa(binary);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('Base64 encoding is unavailable');
}

export function createPhotoId() {
  return createStableId('photo');
}

function createStableId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
