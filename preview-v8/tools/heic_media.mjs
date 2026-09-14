const HEIC_MIMES = new Set(['image/heic','image/heif','image/heic-sequence','image/heif-sequence']);
const HEIF_BRANDS = new Set(['heic','heix','hevc','hevx','heim','heis','mif1','msf1']);

export function normalizeMime(value='') {
  return String(value ?? '').split(';')[0].trim().toLowerCase();
}

export function isHeicMime(value='') {
  return HEIC_MIMES.has(normalizeMime(value));
}

export function looksLikeHeif(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (bytes.length < 12 || bytes.subarray(4,8).toString('ascii') !== 'ftyp') return false;
  const brand = bytes.subarray(8,12).toString('ascii');
  return HEIF_BRANDS.has(brand);
}

export function looksLikeJpeg(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function convertHeicBufferToJpeg(buffer,{quality=0.92}={}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
  if (!looksLikeHeif(input)) throw new Error('HEIC/HEIF no coincide con una firma ftyp admitida');

  let convert;
  try {
    const module = await import('heic-convert');
    convert = module.default ?? module;
  } catch {
    throw new Error('convertidor HEIC no disponible en el runner');
  }

  let output;
  try {
    output = Buffer.from(await convert({buffer:input,format:'JPEG',quality}));
  } catch {
    throw new Error('falló la conversión HEIC/HEIF a JPEG');
  }

  if (!looksLikeJpeg(output)) throw new Error('la conversión HEIC/HEIF no produjo un JPEG válido');
  return output;
}
