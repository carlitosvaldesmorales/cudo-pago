import {convertHeicBufferToJpeg,looksLikeHeif,looksLikeJpeg} from './heic_media.mjs';

const FIXTURE = 'https://raw.githubusercontent.com/gen2brain/heic/5cd2c8525f1d468ae77ed65b1d600248ad3e2e87/testdata/test8.heic';
const response = await fetch(FIXTURE,{redirect:'follow',signal:AbortSignal.timeout(15000)});
if (!response.ok) throw new Error(`fixture HEIC no disponible: HTTP ${response.status}`);
const input = Buffer.from(await response.arrayBuffer());
if (!looksLikeHeif(input)) throw new Error('fixture no posee firma HEIF válida');
const output = await convertHeicBufferToJpeg(input);
if (!looksLikeJpeg(output)) throw new Error('conversión no produjo JPEG válido');
if (output.length === 0) throw new Error('conversión produjo archivo vacío');
console.log(JSON.stringify({ok:true,input_bytes:input.length,output_bytes:output.length,output_mime:'image/jpeg'}));
