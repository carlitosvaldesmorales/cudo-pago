import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const GALERIA = path.join(ROOT, 'preview-v8', 'data', 'galeria.json');

function clean(value) {
  return String(value ?? '').trim();
}

function toPublicSlug(value, field) {
  const source = clean(value);
  if (!source) throw new Error(`${field}: identificador público vacío`);

  const slug = source
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CL')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!slug) throw new Error(`${field}: no se pudo construir un slug público inequívoco`);
  return slug;
}

function normalizeGaleriaAlbumIds() {
  const doc = JSON.parse(fs.readFileSync(GALERIA, 'utf8'));
  if (!Array.isArray(doc.items)) throw new Error('galeria.json: items debe ser una lista');

  let changed = false;
  doc.items = doc.items.map((item, index) => {
    const canonical = toPublicSlug(item.album_id, `galeria item #${index + 1}.album_id`);
    if (canonical === item.album_id) return item;
    changed = true;
    return {...item, album_id: canonical};
  });

  if (changed) fs.writeFileSync(GALERIA, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return {items: doc.items.length, changed};
}

const result = normalizeGaleriaAlbumIds();
console.log(JSON.stringify({ok:true,normalizer:'CUDO-PUBLIC-IDS-V1',galeria:result},null,2));
