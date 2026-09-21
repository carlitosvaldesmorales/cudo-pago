import fs from 'node:fs';
import path from 'node:path';

const root='preview-v8';
const fail=message=>{throw new Error(message)};
const text=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

const manifest=JSON.parse(text('manifest.webmanifest'));
const expected={
  id:'/preview-v8/',
  start_url:'/preview-v8/',
  scope:'/preview-v8/',
  display:'standalone',
  theme_color:'#03163d',
  background_color:'#03163d'
};
for(const [key,value] of Object.entries(expected)) if(manifest[key]!==value) fail(`manifest ${key}: ${manifest[key]} != ${value}`);
if(!manifest.name||!manifest.short_name) fail('manifest sin name/short_name');
if(manifest.prefer_related_applications!==false) fail('prefer_related_applications debe ser false');

const requiredIcons=new Map([
  ['/preview-v8/icons/icon-192.png','192x192'],
  ['/preview-v8/icons/icon-512.png','512x512']
]);
for(const [src,size] of requiredIcons){
  const icon=(manifest.icons||[]).find(item=>item.src===src&&item.sizes===size&&item.type==='image/png');
  if(!icon) fail(`manifest sin icono ${size}`);
}

const pngSize=file=>{
  const b=fs.readFileSync(path.join(root,file));
  if(b.length<24||b.toString('hex',0,8)!=='89504e470d0a1a0a') fail(`${file} no es PNG válido`);
  return [b.readUInt32BE(16),b.readUInt32BE(20)];
};
for(const [file,w,h] of [
  ['icons/icon-192.png',192,192],
  ['icons/icon-512.png',512,512],
  ['icons/apple-touch-icon.png',180,180]
]){
  if(!exists(file)) fail(`falta ${file}`);
  const [actualW,actualH]=pngSize(file);
  if(actualW!==w||actualH!==h) fail(`${file}: ${actualW}x${actualH}, esperado ${w}x${h}`);
}

for(const [file,prefix] of [['index.html',''],['admin/index.html','../']]){
  const html=text(file);
  const manifestHref=prefix+'manifest.webmanifest';
  const appleHref=prefix+'icons/apple-touch-icon.png';
  const pwaSrc=prefix+'shared/pwa.js';
  if(!html.includes(`rel="manifest" href="${manifestHref}"`)) fail(`${file}: sin manifest`);
  if(!html.includes(`rel="apple-touch-icon" href="${appleHref}"`)) fail(`${file}: sin apple-touch-icon`);
  if(!html.includes(`src="${pwaSrc}"`)) fail(`${file}: sin pwa.js`);
}

const publicViews=['club/index.html','noticias/index.html','partidos/index.html','equipos/index.html','galeria/index.html'];
for(const file of publicViews){
  const html=text(file);
  if(!html.includes('src="../shared/site.js"')) fail(`${file}: sin site.js transversal`);
}

const site=text('shared/site.js');
if(!site.includes("document.write('<script src=\"'+base+'pwa.js\"")) fail('site.js no carga la capa PWA transversal');

const pwa=text('shared/pwa.js');
if(!pwa.includes("version:'2.0'")) fail('pwa.js no declara shell móvil v2');
if(!pwa.includes("register('/preview-v8/sw.js',{scope:state.scope})")) fail('registro SW fuera del scope canónico');
if(!pwa.includes("beforeinstallprompt")) fail('pwa.js sin flujo de instalación explícito');
if(!pwa.includes("'(display-mode: standalone)'")) fail('pwa.js sin detección standalone');
if(!pwa.includes("data-cudo-pwa-shell")) fail('pwa.js sin shell visible de app');
if(!pwa.includes("href('admin/')")) fail('pwa.js sin acceso móvil a Administración');
if(!pwa.includes("href('partidos/')")) fail('pwa.js sin acceso móvil a Partidos');
if(!pwa.includes("INSTALAR")) fail('pwa.js sin CTA de instalación');

const sw=text('sw.js');
if(!sw.includes("const SCOPE='/preview-v8/'")) fail('SW sin scope canónico');
if(!sw.includes("url.pathname.startsWith(`${SCOPE}data/`)")) fail('SW no excluye data/ del cache');
if(!sw.includes("caches.match(OFFLINE_URL)")) fail('SW sin fallback offline explícito');
const precache=sw.slice(sw.indexOf('const PRECACHE=['),sw.indexOf('];',sw.indexOf('const PRECACHE=['))+2);
if(precache.includes('data/')) fail('PRECACHE no puede incluir datos públicos');

console.log(JSON.stringify({
  ok:true,
  mode:'CUDO_MOBILE_PWA_APP_SHELL_V2',
  scope:manifest.scope,
  start_url:manifest.start_url,
  public_views_with_app_layer:publicViews,
  install_ux:'EXPLICIT',
  standalone_navigation:['Inicio','Partidos','Noticias','Administrar'],
  icons:[...requiredIcons.values(),'180x180 apple-touch-icon'],
  data_cache_policy:'ONLINE_FIRST_NO_PUBLIC_DATA_PRECACHE'
},null,2));
