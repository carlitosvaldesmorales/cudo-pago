(function(root){
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
