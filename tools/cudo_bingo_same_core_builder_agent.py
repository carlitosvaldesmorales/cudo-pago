#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT=Path(__file__).resolve().parents[1]
MATCH=ROOT/"preview-v8/eventos/index.html"
CORE=ROOT/"preview-v8/eventos/event-core.js"
BINGO=ROOT/"preview-v8/eventos/bingo.html"
DATA=ROOT/"preview-v8/data/bingo-full-day-qa.json"
TEST=ROOT/"preview-v8/tools/certify_bingo_same_core_roundtrip.py"

CORE_JS=r'''(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const product=(state,id)=>(state.products||[]).find(p=>p.product_id===id);
const purchaseTotal=state=>(state.purchases||[]).reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);
const salesRevenue=state=>(state.sales||[]).reduce((n,s)=>n+Number(s.qty||0)*Number(s.unit_price||0),0);
const ticketRevenue=state=>(state.tickets||[]).reduce((n,t)=>n+Number(t.qty||0)*Number(t.unit_price||0),0);
const income=state=>salesRevenue(state)+ticketRevenue(state)+(state.other_income||[]).reduce((n,x)=>n+Number(x.amount||0),0);
const payable=state=>(state.purchases||[]).filter(p=>p.payment==='PENDING').reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);
const cashIn=state=>(state.sales||[]).filter(s=>s.method==='CASH').reduce((n,s)=>n+Number(s.qty||0)*Number(s.unit_price||0),0)+(state.tickets||[]).filter(t=>t.method==='CASH').reduce((n,t)=>n+Number(t.qty||0)*Number(t.unit_price||0),0)+(state.other_income||[]).filter(x=>x.method==='CASH').reduce((n,x)=>n+Number(x.amount||0),0);
const cashOut=state=>(state.purchases||[]).filter(p=>p.payment==='CASH').reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);
function purchase(state,{product_id,qty,unit_cost,supplier,payment,created_at}){
 const p=product(state,product_id); qty=Number(qty); unit_cost=Number(unit_cost);
 if(!p||qty<=0||unit_cost<0)throw new Error('INVALID_PURCHASE');
 p.stock=Number(p.stock||0)+qty;p.unit_cost=unit_cost;
 state.purchases=state.purchases||[];
 state.purchases.push({purchase_id:'PUR-'+Date.now(),product_id,qty,unit_cost,supplier:supplier||'Proveedor QA',payment:payment||'PENDING',created_at});
 return p;
}
function sale(state,{product_id,qty,unit_price,method,created_at}){
 const p=product(state,product_id);qty=Number(qty);unit_price=Number(unit_price);
 if(!p||qty<=0||unit_price<0)throw new Error('INVALID_SALE');
 if(Number(p.stock||0)<qty)throw new Error('INSUFFICIENT_STOCK');
 p.stock-=qty;p.sell_price=unit_price;
 state.sales=state.sales||[];
 state.sales.push({sale_id:'SALE-'+Date.now(),product_id,qty,unit_price,method:method||'CASH',created_at});
 return p;
}
function ticket(state,{qty,unit_price,method,created_at}){
 qty=Number(qty);unit_price=Number(unit_price);if(qty<=0||unit_price<0)throw new Error('INVALID_TICKET');
 state.tickets=state.tickets||[];state.tickets.push({ticket_id:'TICKET-'+Date.now(),qty,unit_price,method:method||'CASH',created_at});
}
function closeEvent(state,at){state.closed_at=at;state.event.status='CLOSED'}
function save(key,state){localStorage.setItem(key,JSON.stringify(state))}
function load(key,seed){const raw=localStorage.getItem(key);if(!raw)return clone(seed);try{return JSON.parse(raw)}catch(e){return clone(seed)}}
root.CudoEventCore={clone,money,product,purchaseTotal,salesRevenue,ticketRevenue,income,payable,cashIn,cashOut,purchase,sale,ticket,closeEvent,save,load};
})(window);
'''

SEED={
 "schema_version":"CUDO_BINGO_FULL_DAY_QA_V1","mock":True,"production_write":False,
 "event":{"event_id":"QA-BINGO-001","kind":"BINGO","display_name":"Bingo CUDO · Jornada QA","date":"2026-10-10","venue":"Sede / recinto CUDO","status":"SCHEDULED","conditions":{"permit_required":True,"kitchen_enabled":True,"sales_enabled":True}},
 "permit":{"required":True,"confirmed":False,"reference":""},
 "responsibilities":[{"role":"Coordinación general","person":"Dirigencia QA"},{"role":"Cocina","person":"Equipo cocina QA"},{"role":"Caja","person":"Tesorería QA"},{"role":"Ventas","person":"Colaboradores QA"}],
 "products":[{"product_id":"BEBIDA","name":"Bebidas","stock":16,"unit_cost":730,"sell_price":1500},{"product_id":"COMPLETO","name":"Insumos completos","stock":20,"unit_cost":900,"sell_price":2500}],
 "purchases":[],"sales":[],"tickets":[],"other_income":[],"prizes":[],
 "opening_cash":15000,
 "post_event_work":[{"work_id":"ASEO","title":"Aseo del recinto","state":"PENDING"},{"work_id":"CAJA","title":"Revisión final de caja","state":"PENDING"}],
 "closed_at":None
}

BINGO_HTML=r'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>C.U.D.O. · Bingo integral · QA</title><link rel="stylesheet" href="../shared/site.css"><style>
:root{--navy:#03163d;--red:#e21b2d;--paper:#f4f2ed;--ink:#172033;--muted:#657386;--line:#d5dbe4;--ok:#147a45}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,sans-serif}.wrap{width:min(1120px,calc(100% - 24px));margin:auto}.hero{background:var(--navy);color:#fff;border-bottom:6px solid var(--red);padding:26px 0}.hero h1{font-family:'Barlow Condensed',Arial Narrow,sans-serif;text-transform:uppercase;font-size:clamp(38px,7vw,60px);margin:6px 0}.hero p{max-width:850px;line-height:1.5;color:#edf1f8}.hero a{color:#fff;font-weight:900;font-size:12px}.body{padding:18px 0 50px}.qa{background:#fff8da;border-left:4px solid #c79b00;padding:12px;border-radius:0 12px 12px 0;font-size:12px;margin-bottom:14px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.tabs a{background:#fff;border:1px solid #cbd2dc;border-radius:999px;padding:9px 12px;text-decoration:none;color:var(--navy);font-weight:900;font-size:12px}.tabs a.active{background:var(--navy);color:#fff}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px}.wide{grid-column:1/-1}.card h2,.card h3{font-family:'Barlow Condensed',Arial Narrow,sans-serif;text-transform:uppercase;color:var(--navy);margin:0 0 8px}.card h2{font-size:34px}.card h3{font-size:24px}.sub{color:var(--muted);font-size:12px;line-height:1.5}.chips,.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.chip{background:var(--navy);color:#fff;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:900}.form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.field{display:flex;flex-direction:column;gap:4px}.field label{font-size:9px;font-weight:900;text-transform:uppercase;color:var(--muted)}input,select{border:1px solid #bec8d6;border-radius:10px;padding:10px;background:#fff}.btn{border:0;border-radius:10px;background:var(--navy);color:#fff;padding:10px 13px;font-weight:900;cursor:pointer}.btn.light{background:#edf1f6;color:var(--navy)}.btn.ok{background:var(--ok)}.row{padding:9px 0;border-top:1px solid #edf0f3}.row:first-child{border-top:0}.row strong{display:block}.row span{color:var(--muted);font-size:11px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.kpi{background:#f6f8fb;border-radius:10px;padding:10px}.kpi strong{display:block;font-size:20px;color:var(--navy)}.kpi small{font-size:9px;text-transform:uppercase;font-weight:900;color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #edf0f3;text-align:left}.notice{margin-top:10px;background:#eff8f2;border-left:4px solid var(--ok);padding:10px;font-size:12px}.hidden{display:none!important}.pending{font-weight:900;color:#8a6500}.good{font-weight:900;color:var(--ok)}
@media(max-width:740px){.grid,.form{grid-template-columns:1fr}.wide{grid-column:auto}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body data-cudo-bingo-same-core="qa-v1">
<header class="hero"><div class="wrap"><div class="eyebrow">C.U.D.O. · Club OS · QA</div><h1>Bingo / recaudación</h1><p>El evento es el contexto. El mismo núcleo que usa el Partido controla compras, stock, ventas, caja, obligaciones, trabajo posterior y cierre; Bingo activa además permiso y premios/donaciones.</p><a href="../admin/">← Volver a Administración</a></div></header>
<main class="wrap body"><div class="qa"><strong>QA sintética:</strong> production_write=false. Esta prueba usa el mismo <code>event-core.js</code> del Partido y persiste sólo en localStorage.</div>
<nav class="tabs"><a href="./">⚽ Partido</a><a class="active" href="./bingo.html">🎟️ Bingo / recaudación</a></nav>
<div class="grid">
<section class="card wide"><div class="eyebrow">ACTIVITY_OR_EVENT · BINGO</div><h2 id="eventName">Bingo CUDO</h2><div id="eventMeta" class="sub"></div><div id="branches" class="chips"></div></section>
<section class="card"><h3>Permiso / autorización</h3><p class="sub">La rama existe porque este evento la requiere.</p><div id="permitState" class="row"></div><div class="field"><label>Referencia</label><input id="permitRef" placeholder="Autorización / respaldo QA"></div><div class="actions"><button id="confirmPermit" class="btn">Confirmar permiso</button></div></section>
<section class="card"><h3>Personas</h3><div id="people"></div></section>
<section class="card wide"><h3>Premios y donaciones</h3><p class="sub">Un premio donado queda como recurso del evento y no crea deuda con proveedor.</p><div class="form"><div class="field"><label>Premio</label><input id="prizeName" value="Canasta familiar"></div><div class="field"><label>Origen</label><select id="prizeSource"><option value="DONATED">Donado</option><option value="PURCHASED">Comprado</option></select></div><div class="field"><label>Valor referencial</label><input id="prizeValue" type="number" value="25000"></div></div><div class="actions"><button id="registerPrize" class="btn">Registrar premio</button></div><div id="prizes"></div></section>
<section class="card wide"><h3>Cocina · compras · stock</h3><div class="form"><div class="field"><label>Producto</label><select id="purchaseProduct"></select></div><div class="field"><label>Cantidad</label><input id="purchaseQty" type="number" value="10"></div><div class="field"><label>Costo unitario</label><input id="purchaseCost" type="number" value="700"></div><div class="field"><label>Proveedor</label><input id="purchaseSupplier" value="Proveedor QA"></div><div class="field"><label>Pago</label><select id="purchasePayment"><option value="PENDING">Pendiente</option><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option></select></div></div><div class="actions"><button id="registerPurchase" class="btn">Registrar compra</button></div><table><thead><tr><th>Producto</th><th>Stock</th><th>Costo</th><th>Venta</th></tr></thead><tbody id="stockRows"></tbody></table><div id="purchaseNotice" class="notice hidden"></div></section>
<section class="card wide"><h3>Ventas del evento</h3><div class="form"><div class="field"><label>Producto</label><select id="saleProduct"></select></div><div class="field"><label>Cantidad</label><input id="saleQty" type="number" value="5"></div><div class="field"><label>Precio unitario</label><input id="salePrice" type="number" value="1500"></div><div class="field"><label>Medio</label><select id="saleMethod"><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option></select></div></div><div class="actions"><button id="registerSale" class="btn">Registrar venta</button></div><div id="saleNotice" class="notice hidden"></div></section>
<section class="card wide"><h3>Caja y obligaciones</h3><div class="kpis"><div class="kpi"><strong id="income">$0</strong><small>Ingresos</small></div><div class="kpi"><strong id="cost">$0</strong><small>Compras</small></div><div class="kpi"><strong id="payable">$0</strong><small>Proveedor pendiente</small></div><div class="kpi"><strong id="cash">$0</strong><small>Caja estimada</small></div></div><div id="finance"></div></section>
<section class="card wide"><h3>Después del Bingo</h3><div id="postWork"></div></section>
<section class="card wide"><h3>Cierre del evento</h3><div class="kpis"><div class="kpi"><strong id="closeIncome">$0</strong><small>Ingresos</small></div><div class="kpi"><strong id="closeCost">$0</strong><small>Compras</small></div><div class="kpi"><strong id="closeNet">$0</strong><small>Recurso neto</small></div><div class="kpi"><strong id="closePending">0</strong><small>Pendientes</small></div></div><div class="actions"><button id="closeEvent" class="btn ok">Conciliar y cerrar Bingo</button><button id="resetQa" class="btn light">Reiniciar QA</button></div><div id="closure" class="notice hidden"></div></section>
</div></main>
<script src="./event-core.js"></script><script>
(function(){const C=window.CudoEventCore,KEY='cudo-bingo-full-day-qa-v1',DATA='../data/bingo-full-day-qa.json';let seed,state;const $=id=>document.getElementById(id),num=id=>Number($(id).value||0),now=()=>new Date().toISOString();
function persist(){C.save(KEY,state)}function prod(id){return C.product(state,id)}function notice(id,msg){$(id).textContent=msg;$(id).classList.remove('hidden')}
function fill(id){const e=$(id),v=e.value;e.innerHTML=state.products.map(p=>'<option value="'+p.product_id+'">'+p.name+'</option>').join('');if(v&&prod(v))e.value=v}
function render(){ $('eventName').textContent=state.event.display_name;$('eventMeta').textContent=state.event.date+' · '+state.event.venue+' · '+(state.closed_at?'Cerrado':'En operación QA');$('branches').innerHTML=['EVENTO','PERSONAS','PERMISO','PREMIOS / DONACIONES','COCINA / VENTAS','COMPRAS / STOCK','CAJA','POST-EVENTO','CIERRE'].map(x=>'<span class="chip">'+x+'</span>').join('');
$('permitState').innerHTML='<strong>'+(state.permit.confirmed?'✅ Permiso confirmado':'🟡 Permiso pendiente')+'</strong><span>'+(state.permit.reference||'Sin referencia todavía')+'</span>';$('permitRef').value=state.permit.reference||'';$('people').innerHTML=state.responsibilities.map(x=>'<div class="row"><strong>'+x.role+'</strong><span>'+x.person+'</span></div>').join('');$('prizes').innerHTML=state.prizes.length?state.prizes.map(x=>'<div class="row"><strong>'+x.name+'</strong><span>'+x.source+' · '+C.money(x.value)+'</span></div>').join(''):'<p class="sub">Sin premios registrados.</p>';
fill('purchaseProduct');fill('saleProduct');$('stockRows').innerHTML=state.products.map(p=>'<tr><td>'+p.name+'</td><td id="stock-'+p.product_id+'">'+p.stock+'</td><td>'+C.money(p.unit_cost)+'</td><td>'+C.money(p.sell_price)+'</td></tr>').join('');
$('income').textContent=C.money(C.income(state));$('cost').textContent=C.money(C.purchaseTotal(state));$('payable').textContent=C.money(C.payable(state));$('cash').textContent=C.money(state.opening_cash+C.cashIn(state)-C.cashOut(state));$('finance').innerHTML=[...state.purchases.map(x=>'<div class="row"><strong>Compra · '+prod(x.product_id).name+'</strong><span>'+x.qty+' un · '+C.money(x.qty*x.unit_cost)+' · '+x.payment+'</span></div>'),...state.sales.map(x=>'<div class="row"><strong>Venta · '+prod(x.product_id).name+'</strong><span>'+x.qty+' un · '+C.money(x.qty*x.unit_price)+' · '+x.method+'</span></div>')].join('')||'<p class="sub">Sin movimientos.</p>';
$('postWork').innerHTML=state.post_event_work.map(w=>'<div class="row"><strong>'+w.title+'</strong><span class="'+(w.state==='DONE'?'good':'pending')+'">'+(w.state==='DONE'?'Listo':'Pendiente')+'</span>'+(w.state==='DONE'?'':'<button class="btn light" data-work="'+w.work_id+'">Marcar listo</button>')+'</div>').join('');document.querySelectorAll('[data-work]').forEach(b=>b.onclick=()=>{state.post_event_work.find(w=>w.work_id===b.dataset.work).state='DONE';persist();render()});
$('closeIncome').textContent=C.money(C.income(state));$('closeCost').textContent=C.money(C.purchaseTotal(state));$('closeNet').textContent=C.money(C.income(state)-C.purchaseTotal(state));$('closePending').textContent=state.post_event_work.filter(w=>w.state!=='DONE').length;if(state.closed_at){$('closure').textContent='Bingo cerrado · recurso neto '+C.money(C.income(state)-C.purchaseTotal(state));$('closure').classList.remove('hidden')}else $('closure').classList.add('hidden')}
$('confirmPermit').onclick=()=>{state.permit.confirmed=true;state.permit.reference=$('permitRef').value.trim()||'Confirmado en QA';persist();render()};
$('registerPrize').onclick=()=>{const source=$('prizeSource').value,value=num('prizeValue');state.prizes.push({prize_id:'PRIZE-'+Date.now(),name:$('prizeName').value.trim()||'Premio QA',source,value,created_at:now()});if(source==='PURCHASED')state.purchases.push({purchase_id:'PRIZEPUR-'+Date.now(),product_id:'PRIZE_INTERNAL',qty:1,unit_cost:value,supplier:'Proveedor premio QA',payment:'PENDING',created_at:now(),non_stock:true});persist();render()};
$('registerPurchase').onclick=()=>{try{C.purchase(state,{product_id:$('purchaseProduct').value,qty:num('purchaseQty'),unit_cost:num('purchaseCost'),supplier:$('purchaseSupplier').value,payment:$('purchasePayment').value,created_at:now()});persist();render();notice('purchaseNotice','Compra registrada: stock, costo y obligación actualizados.')}catch(e){notice('purchaseNotice','No se pudo registrar la compra.')}};
$('registerSale').onclick=()=>{try{C.sale(state,{product_id:$('saleProduct').value,qty:num('saleQty'),unit_price:num('salePrice'),method:$('saleMethod').value,created_at:now()});persist();render();notice('saleNotice','Venta registrada: stock e ingreso actualizados.')}catch(e){notice('saleNotice',e.message==='INSUFFICIENT_STOCK'?'Stock insuficiente.':'No se pudo registrar la venta.')}};
$('closeEvent').onclick=()=>{C.closeEvent(state,now());persist();render()};$('resetQa').onclick=()=>{localStorage.removeItem(KEY);state=C.clone(seed);persist();render()};
fetch(DATA,{cache:'no-store'}).then(r=>r.json()).then(x=>{if(x.mock!==true||x.production_write!==false)throw new Error('Seed inseguro');seed=x;state=C.load(KEY,seed);render()}).catch(e=>{document.body.innerHTML='<main class="wrap body"><h1>QA bloqueada</h1><p>'+e.message+'</p></main>'});
})();</script><script src="../shared/pwa.js"></script></body></html>'''

CERT=r'''#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(".")
OUT=ROOT/"evidence/cudo-bingo-same-core/roundtrip.json";OUT.parent.mkdir(parents=True,exist_ok=True)
match=(ROOT/"preview-v8/eventos/index.html").read_text(encoding="utf-8")
bingo=(ROOT/"preview-v8/eventos/bingo.html").read_text(encoding="utf-8")
shared_core=('./event-core.js' in match and './event-core.js' in bingo)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page(viewport={"width":1280,"height":900});page.goto("http://127.0.0.1:4178/preview-v8/eventos/bingo.html",wait_until="networkidle");page.click("#resetQa")
 title=page.locator("#eventName").inner_text();sport_result_absent=page.locator("text=Resultado deportivo").count()==0
 page.fill("#permitRef","Autorización Bingo QA");page.click("#confirmPermit");permit_ok="Permiso confirmado" in page.locator("#permitState").inner_text()
 payable0=page.locator("#payable").inner_text();page.fill("#prizeName","Canasta donada");page.select_option("#prizeSource","DONATED");page.fill("#prizeValue","25000");page.click("#registerPrize");donated_visible="Canasta donada" in page.locator("#prizes").inner_text();payable_after_donation=page.locator("#payable").inner_text()
 before=int(page.locator("#stock-BEBIDA").inner_text());page.select_option("#purchaseProduct","BEBIDA");page.fill("#purchaseQty","10");page.fill("#purchaseCost","700");page.select_option("#purchasePayment","PENDING");page.click("#registerPurchase");after_purchase=int(page.locator("#stock-BEBIDA").inner_text());payable=page.locator("#payable").inner_text()
 page.reload(wait_until="networkidle");persisted=int(page.locator("#stock-BEBIDA").inner_text())
 page.select_option("#saleProduct","BEBIDA");page.fill("#saleQty","5");page.fill("#salePrice","1500");page.click("#registerSale");after_sale=int(page.locator("#stock-BEBIDA").inner_text());income=page.locator("#income").inner_text()
 while page.locator("[data-work]").count()>0: page.locator("[data-work]").first.click()
 page.click("#closeEvent");closed="Bingo cerrado" in page.locator("#closure").inner_text();pending=page.locator("#closePending").inner_text();net=page.locator("#closeNet").inner_text()
 checks={"same_event_core":shared_core,"bingo_context":("Bingo" in title),"no_sport_result_branch":sport_result_absent,"permit_branch":permit_ok,"donated_prize_visible":donated_visible,"donated_prize_no_payable":payable_after_donation==payable0,"purchase_stock":after_purchase==before+10,"purchase_payable":"7.000" in payable,"reload_persists":persisted==after_purchase,"sale_stock":after_sale==after_purchase-5,"sale_income":"7.500" in income,"post_cleanup_done":pending=="0","closure_visible":closed,"net_visible":bool(net)}
 report={"schema_version":"CUDO_BINGO_SAME_CORE_CERT_V1","production_write":False,"checks":checks,"pass":all(checks.values()),"net":net};OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
 if not report["pass"]: raise SystemExit(2)
'''

def patch_match():
 text=MATCH.read_text(encoding="utf-8")
 if '<script src="./event-core.js"></script>' not in text:
  text=text.replace('<script>\n(function(){','<script src="./event-core.js"></script>\n<script>\n(function(){')
 old="""const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const num=id=>Number($(id).value||0);
const now=()=>new Date().toISOString();
function persist(){localStorage.setItem(STORAGE,JSON.stringify(state))}
function product(id){return state.products.find(p=>p.product_id===id)}
function purchaseTotal(){return state.purchases.reduce((n,p)=>n+p.qty*p.unit_cost,0)}
function salesRevenue(){return state.sales.reduce((n,s)=>n+s.qty*s.unit_price,0)}
function ticketRevenue(){return state.tickets.reduce((n,t)=>n+t.qty*t.unit_price,0)}
function income(){return salesRevenue()+ticketRevenue()}
function payable(){return state.purchases.filter(p=>p.payment==='PENDING').reduce((n,p)=>n+p.qty*p.unit_cost,0)}
function cashIn(){return state.sales.filter(s=>s.method==='CASH').reduce((n,s)=>n+s.qty*s.unit_price,0)+state.tickets.filter(t=>t.method==='CASH').reduce((n,t)=>n+t.qty*t.unit_price,0)}
function cashOut(){return state.purchases.filter(p=>p.payment==='CASH').reduce((n,p)=>n+p.qty*p.unit_cost,0)}"""
 new="""const C=window.CudoEventCore;
const money=C.money;
const num=id=>Number($(id).value||0);
const now=()=>new Date().toISOString();
function persist(){C.save(STORAGE,state)}
function product(id){return C.product(state,id)}
function purchaseTotal(){return C.purchaseTotal(state)}
function salesRevenue(){return C.salesRevenue(state)}
function ticketRevenue(){return C.ticketRevenue(state)}
function income(){return C.income(state)}
function payable(){return C.payable(state)}
function cashIn(){return C.cashIn(state)}
function cashOut(){return C.cashOut(state)}"""
 if old not in text: raise SystemExit("MATCH_CORE_ANCHOR_MISSING")
 text=text.replace(old,new)
 text=text.replace("""p.stock+=qty;p.unit_cost=cost;state.purchases.push({purchase_id:'PUR-'+Date.now(),product_id:id,qty,unit_cost:cost,supplier,payment,created_at:now()});persist();render();""","""C.purchase(state,{product_id:id,qty,unit_cost:cost,supplier,payment,created_at:now()});persist();render();""")
 text=text.replace("""if(p.stock<qty)return notice('saleNotice','Stock insuficiente: disponible '+p.stock+'.',true);p.stock-=qty;p.sell_price=price;state.sales.push({sale_id:'SALE-'+Date.now(),product_id:id,qty,unit_price:price,method,created_at:now()});persist();render();""","""if(p.stock<qty)return notice('saleNotice','Stock insuficiente: disponible '+p.stock+'.',true);C.sale(state,{product_id:id,qty,unit_price:price,method,created_at:now()});persist();render();""")
 text=text.replace("""state.tickets.push({ticket_id:'TICKET-'+Date.now(),qty,unit_price:price,method,created_at:now()});persist();render()""","""C.ticket(state,{qty,unit_price:price,method,created_at:now()});persist();render()""")
 text=text.replace("""$('closeEvent').onclick=()=>{state.closed_at=now();state.event.status='CLOSED';persist();render()};""","""$('closeEvent').onclick=()=>{C.closeEvent(state,now());persist();render()};""")
 text=text.replace("""<section class="card wide bingo">
  <h3>🎟️ Bingo · misma raíz, ramas distintas</h3>
  <p class="sub">La siguiente prueba de generalización reutilizará este mismo núcleo ACTIVITY_OR_EVENT con premios/donaciones, cocina, ventas, caja, permisos y cierre. No se crea un segundo motor.</p>
</section>""","""<section class="card wide bingo">
  <h3>🎟️ Bingo · misma raíz, ramas distintas</h3>
  <p class="sub">Bingo reutiliza este mismo núcleo de compras, stock, ventas, caja, obligaciones y cierre, activando permiso, premios/donaciones y limpieza en lugar del resultado deportivo.</p>
  <div class="actions"><a class="btn" href="./bingo.html">Abrir Bingo / recaudación →</a></div>
</section>""")
 MATCH.write_text(text,encoding="utf-8")

def main():
 CORE.write_text(CORE_JS,encoding="utf-8");DATA.write_text(json.dumps(SEED,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");BINGO.write_text(BINGO_HTML,encoding="utf-8");TEST.write_text(CERT,encoding="utf-8");patch_match()
 for p in [CORE,BINGO,DATA,TEST,MATCH]:
  if not p.exists() or p.stat().st_size==0: raise SystemExit("MISSING:"+str(p))
 if './event-core.js' not in MATCH.read_text(encoding="utf-8") or './event-core.js' not in BINGO.read_text(encoding="utf-8"): raise SystemExit("SHARED_CORE_NOT_REFERENCED")
 print("CUDO_BINGO_SAME_CORE_BUILDER_OK")
if __name__=="__main__": main()
