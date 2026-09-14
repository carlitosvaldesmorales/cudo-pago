import {convertHeicBufferToJpeg,isHeicMime} from './heic_media.mjs';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const nativeFetch = globalThis.fetch;
if (typeof nativeFetch !== 'function') throw new Error('fetch no disponible en el runtime Node');

globalThis.fetch = async function cudoFetchWithHeic(input,init) {
  const response = await nativeFetch(input,init);
  const mime = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!isHeicMime(mime)) return response;

  let source;
  try { source = new URL(response.url || String(input)); } catch { return response; }
  if (source.protocol !== 'https:' || source.hostname !== 'storage.tally.so' || !source.pathname.startsWith('/private/')) return response;

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
    throw new Error('medio HEIC privado excede 10 MiB');
  }

  const inputBuffer = Buffer.from(await response.arrayBuffer());
  if (inputBuffer.length === 0 || inputBuffer.length > MAX_MEDIA_BYTES) {
    throw new Error('medio HEIC privado tiene tamaño inválido');
  }

  const jpeg = await convertHeicBufferToJpeg(inputBuffer);
  if (jpeg.length === 0 || jpeg.length > MAX_MEDIA_BYTES) {
    throw new Error('JPEG convertido desde HEIC tiene tamaño inválido');
  }

  const headers = new Headers(response.headers);
  headers.set('content-type','image/jpeg');
  headers.set('content-length',String(jpeg.length));
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  return new Response(jpeg,{status:response.status,statusText:response.statusText,headers});
};

await import('./sync_google_publico.mjs');
