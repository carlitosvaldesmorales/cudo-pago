(function(root){
'use strict';

const clone=x=>JSON.parse(JSON.stringify(x));
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const slug=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,42)||'ITEM';
const arrays=state=>{
  state.inventory_items=state.inventory_items||[];
  state.offerings=state.offerings||[];
  state.purchases=state.purchases||[];
  state.sales=state.sales||[];
  state.tickets=state.tickets||[];
  state.other_income=state.other_income||[];
  return state;
};
const inventoryItem=(state,id)=>(arrays(state).inventory_items||[]).find(x=>x.item_id===id);
const offering=(state,id)=>(arrays(state).offerings||[]).find(x=>x.offering_id===id);
const product=inventoryItem;

function uniqueId(prefix,name,list,key){
  const base=prefix+'-'+slug(name), used=new Set((list||[]).map(x=>x[key]));
  if(!used.has(base))return base;
  let n=2;while(used.has(base+'-'+n))n++;
  return base+'-'+n;
}

function ensureInventoryItem(state,{name,unit='unidad',opening_stock=0,unit_cost=0}){
  arrays(state);
  const normalized=slug(name);
  let item=state.inventory_items.find(x=>slug(x.name)===normalized&&String(x.unit||'unidad')===String(unit||'unidad'));
  if(item)return item;
  item={
    item_id:uniqueId('INV',name,state.inventory_items,'item_id'),
    name:String(name||'Insumo').trim(),
    unit:String(unit||'unidad').trim()||'unidad',
    stock:Number(opening_stock||0),
    unit_cost:Number(unit_cost||0)
  };
  state.inventory_items.push(item);
  return item;
}

function addOffering(state,{name,mode='PREPARED',sell_price=0}){
  arrays(state);
  const clean=String(name||'').trim();
  if(!clean)throw new Error('INVALID_OFFERING_NAME');
  const allowed=['PREPARED','DIRECT_RESALE','READY_MADE','BUNDLE'];
  if(!allowed.includes(mode))throw new Error('INVALID_OFFERING_MODE');
  const o={
    offering_id:uniqueId('OFFER',clean,state.offerings,'offering_id'),
    name:clean,
    mode,
    sell_price:Number(sell_price||0),
    components:[]
  };
  if(mode==='DIRECT_RESALE'||mode==='READY_MADE'){
    const item=ensureInventoryItem(state,{name:clean,unit:'unidad'});
    o.components.push({kind:'INVENTORY',item_id:item.item_id,qty_per_sale:1});
  }
  state.offerings.push(o);
  return o;
}

function addRecipeComponent(state,{offering_id,item_name,item_id,qty_per_sale,unit='unidad'}){
  arrays(state);
  const o=offering(state,offering_id);
  if(!o||!['PREPARED','READY_MADE'].includes(o.mode))throw new Error('INVALID_RECIPE_TARGET');
  const qty=Number(qty_per_sale);
  if(!(qty>0))throw new Error('INVALID_COMPONENT_QTY');
  const item=item_id?inventoryItem(state,item_id):ensureInventoryItem(state,{name:item_name,unit});
  if(!item)throw new Error('INVALID_INVENTORY_ITEM');
  const existing=o.components.find(c=>c.kind==='INVENTORY'&&c.item_id===item.item_id);
  if(existing)existing.qty_per_sale=qty;
  else o.components.push({kind:'INVENTORY',item_id:item.item_id,qty_per_sale:qty});
  return {offering:o,item};
}

function addBundleComponent(state,{offering_id,component_offering_id,qty_per_sale=1}){
  arrays(state);
  const o=offering(state,offering_id), child=offering(state,component_offering_id), qty=Number(qty_per_sale);
  if(!o||o.mode!=='BUNDLE'||!child||o.offering_id===child.offering_id||!(qty>0))throw new Error('INVALID_BUNDLE_COMPONENT');
  const existing=o.components.find(c=>c.kind==='OFFERING'&&c.offering_id===child.offering_id);
  if(existing)existing.qty_per_sale=qty;
  else o.components.push({kind:'OFFERING',offering_id:child.offering_id,qty_per_sale:qty});
  return o;
}

function componentNeeds(state,offering_id,qty=1,stack=[]){
  arrays(state);
  const o=offering(state,offering_id);
  if(!o)throw new Error('INVALID_OFFERING');
  if(stack.includes(offering_id))throw new Error('BUNDLE_CYCLE');
  const needs=new Map();
  const add=(item_id,amount)=>needs.set(item_id,(needs.get(item_id)||0)+amount);
  for(const c of o.components||[]){
    const per=Number(c.qty_per_sale||0);
    if(!(per>0))continue;
    if(c.kind==='INVENTORY')add(c.item_id,per*qty);
    else if(c.kind==='OFFERING'){
      for(const [id,amount] of componentNeeds(state,c.offering_id,per*qty,[...stack,offering_id]))add(id,amount);
    }
  }
  return needs;
}

function maxSellable(state,offering_id){
  const o=offering(state,offering_id);
  if(!o)return 0;
  const needs=componentNeeds(state,offering_id,1);
  if(needs.size===0)return 0;
  let max=Infinity;
  for(const [id,need] of needs){
    const item=inventoryItem(state,id);
    if(!item||need<=0)return 0;
    max=Math.min(max,Math.floor((Number(item.stock||0)+1e-9)/need));
  }
  return Number.isFinite(max)?Math.max(0,max):0;
}

function consumeOffering(state,offering_id,qty){
  const amount=Number(qty);
  if(!(amount>0))throw new Error('INVALID_SALE_QTY');
  const needs=componentNeeds(state,offering_id,amount);
  if(needs.size===0)throw new Error('OFFERING_WITHOUT_COMPONENTS');
  for(const [id,need] of needs){
    const item=inventoryItem(state,id);
    if(!item||Number(item.stock||0)+1e-9<need)throw new Error('INSUFFICIENT_STOCK');
  }
  for(const [id,need] of needs)inventoryItem(state,id).stock=Number(inventoryItem(state,id).stock||0)-need;
  return needs;
}

const purchaseTotal=state=>(arrays(state).purchases||[]).reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);
const salesRevenue=state=>(arrays(state).sales||[]).reduce((n,s)=>n+Number(s.qty||0)*Number(s.unit_price||0),0);
const ticketRevenue=state=>(arrays(state).tickets||[]).reduce((n,t)=>n+Number(t.qty||0)*Number(t.unit_price||0),0);
const income=state=>salesRevenue(state)+ticketRevenue(state)+(arrays(state).other_income||[]).reduce((n,x)=>n+Number(x.amount||0),0);
const payable=state=>(arrays(state).purchases||[]).filter(p=>p.payment==='PENDING').reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);
const cashIn=state=>(arrays(state).sales||[]).filter(s=>s.method==='CASH').reduce((n,s)=>n+Number(s.qty||0)*Number(s.unit_price||0),0)+(state.tickets||[]).filter(t=>t.method==='CASH').reduce((n,t)=>n+Number(t.qty||0)*Number(t.unit_price||0),0)+(state.other_income||[]).filter(x=>x.method==='CASH').reduce((n,x)=>n+Number(x.amount||0),0);
const cashOut=state=>(arrays(state).purchases||[]).filter(p=>p.payment==='CASH').reduce((n,p)=>n+Number(p.qty||0)*Number(p.unit_cost||0),0);

function purchase(state,{item_id,product_id,qty,unit_cost,supplier,payment,created_at}){
  arrays(state);
  const id=item_id||product_id, item=inventoryItem(state,id);qty=Number(qty);unit_cost=Number(unit_cost);
  if(!item||!(qty>0)||unit_cost<0)throw new Error('INVALID_PURCHASE');
  item.stock=Number(item.stock||0)+qty;item.unit_cost=unit_cost;
  state.purchases.push({purchase_id:'PUR-'+Date.now(),item_id:id,qty,unit_cost,supplier:supplier||'Proveedor QA',payment:payment||'PENDING',created_at});
  return item;
}

function sale(state,{offering_id,product_id,qty,unit_price,method,created_at}){
  arrays(state);
  const id=offering_id||product_id, o=offering(state,id);qty=Number(qty);
  if(!o||!(qty>0))throw new Error('INVALID_SALE');
  unit_price=unit_price===undefined||unit_price===null?Number(o.sell_price||0):Number(unit_price);
  if(unit_price<0)throw new Error('INVALID_SALE');
  consumeOffering(state,id,qty);
  o.sell_price=unit_price;
  state.sales.push({sale_id:'SALE-'+Date.now(),offering_id:id,qty,unit_price,method:method||'CASH',created_at});
  return o;
}

function ticket(state,{qty,unit_price,method,created_at}){
  arrays(state);qty=Number(qty);unit_price=Number(unit_price);
  if(!(qty>0)||unit_price<0)throw new Error('INVALID_TICKET');
  state.tickets.push({ticket_id:'TICKET-'+Date.now(),qty,unit_price,method:method||'CASH',created_at});
}

function closeEvent(state,at){state.closed_at=at;state.event.status='CLOSED'}
function save(key,state){localStorage.setItem(key,JSON.stringify(state))}
function load(key,seed){
  const raw=localStorage.getItem(key);
  if(!raw)return clone(seed);
  try{
    const value=JSON.parse(raw);
    if(value.schema_version!==seed.schema_version)return clone(seed);
    arrays(value);return value;
  }catch(e){return clone(seed)}
}


function eventSignals(state){
  arrays(state);
  const event=state.event||{}, c=event.conditions||{}, local=event.location==='LOCAL';
  const commerce=!!c.food_sales_enabled||!!c.bar_sales_enabled||!!c.ticketing_enabled;
  return {
    venue_required:local&&!!c.venue_required,
    playing_surface_required:local&&!!c.venue_required,
    food_preparation:!!c.food_sales_enabled,
    food_service:!!c.food_sales_enabled,
    beverage_service:!!c.bar_sales_enabled,
    sales_or_cash_handling:commerce,
    public_access:!!c.ticketing_enabled,
    cleaning_required:local&&!!c.venue_required,
    setup_required:local&&!!c.venue_required,
    teardown_required:local&&!!c.venue_required,
    equipment_required:local&&!!c.venue_required,
    ticketing_or_access_control:!!c.ticketing_enabled,
    communications_required:!!c.broadcast_enabled,
    sports_operation_required:event.kind==='MATCH'
  };
}

function deriveWorkstreams(state){
  const signals=eventSignals(state), assignments=state.assignments||{}, patterns=state.workstream_patterns||[];
  return patterns.flatMap(pattern=>{
    const reasons=(pattern.activation_conditions||[]).filter(key=>signals[key]===true);
    if(!reasons.length)return [];
    const assignment=assignments[pattern.capability_tag]||null;
    const person=assignment&&String(assignment.person||'').trim()?String(assignment.person).trim():null;
    const assignmentState=person?'ASSIGNED':'UNASSIGNED';
    return [{
      workstream_id:(state.event?.event_id||'EVENT')+'::'+pattern.capability_tag,
      activity_id:state.event?.event_id||null,
      capability_tag:pattern.capability_tag,
      activation_reason:reasons,
      phase:pattern.phase||'DURANTE',
      state:person?'READY':'REQUIRED_UNASSIGNED',
      human_gate:pattern.human_gate||'NONE',
      accountable_role:{
        role_instance_id:(state.event?.event_id||'EVENT')+'::'+pattern.capability_tag+'::ACCOUNTABLE',
        role_kind:'ACCOUNTABLE',
        display_name:pattern.human_label,
        assignment_state:assignmentState,
        assignee:person
      },
      post_tasks:clone(pattern.post_tasks||[])
    }];
  });
}

function reconcileEventWork(state){
  arrays(state);
  const previous=new Map((state.post_event_work||[]).map(item=>[item.work_id,item]));
  const workstreams=deriveWorkstreams(state);
  state.workstreams=workstreams;
  state.responsibilities=workstreams.map(w=>({
    capability_tag:w.capability_tag,
    role:w.accountable_role.display_name,
    person:w.accountable_role.assignee,
    assignment_state:w.accountable_role.assignment_state,
    state:w.state,
    phase:w.phase,
    activation_reason:clone(w.activation_reason),
    human_gate:w.human_gate
  }));
  const next=[];
  for(const w of workstreams){
    for(const task of w.post_tasks||[]){
      const prior=previous.get(task.work_id);
      next.push({
        work_id:task.work_id,
        title:task.title,
        capability_tag:w.capability_tag,
        state:prior?.state||'PENDING',
        completed_at:prior?.completed_at||null
      });
    }
  }
  state.post_event_work=next;
  return {signals:eventSignals(state),workstreams:clone(workstreams)};
}

root.CudoEventCore={
  clone,money,slug,arrays,inventoryItem,product,offering,ensureInventoryItem,addOffering,
  addRecipeComponent,addBundleComponent,componentNeeds,maxSellable,consumeOffering,
  purchaseTotal,salesRevenue,ticketRevenue,income,payable,cashIn,cashOut,purchase,sale,ticket,
  closeEvent,eventSignals,deriveWorkstreams,reconcileEventWork,save,load
};
})(window);
