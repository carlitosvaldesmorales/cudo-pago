#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "preview-v8/data/match-full-day-qa.json"
CORE = ROOT / "preview-v8/eventos/event-core.js"
HTML = ROOT / "preview-v8/eventos/index.html"
TEST = ROOT / "preview-v8/tools/certify_match_full_day_roundtrip.py"

PATTERNS = [
    {
        "capability_tag": "VENUE_AND_FIELD",
        "human_label": "Encargado/a de cancha y recinto",
        "activation_conditions": ["playing_surface_required", "venue_required"],
        "phase": "ANTES",
        "human_gate": "NONE",
        "post_tasks": [{"work_id": "CANCHA", "title": "Revisión final de cancha"}],
    },
    {
        "capability_tag": "FOOD_SERVICE",
        "human_label": "Encargado/a de cocina",
        "activation_conditions": ["food_preparation", "food_service"],
        "phase": "ANTES_Y_DURANTE",
        "human_gate": "NONE",
        "post_tasks": [],
    },
    {
        "capability_tag": "CONCESSIONS",
        "human_label": "Encargado/a de bar o punto de venta",
        "activation_conditions": ["beverage_service", "sales_or_cash_handling"],
        "phase": "DURANTE",
        "human_gate": "NONE",
        "post_tasks": [],
    },
    {
        "capability_tag": "CLEANING_AND_SANITATION",
        "human_label": "Encargado/a de aseo",
        "activation_conditions": ["cleaning_required", "teardown_required"],
        "phase": "DESPUES",
        "human_gate": "NONE",
        "post_tasks": [{"work_id": "ASEO", "title": "Aseo de camarines y entorno"}],
    },
    {
        "capability_tag": "SETUP_AND_LOGISTICS",
        "human_label": "Encargado/a de montaje y logística",
        "activation_conditions": ["setup_required", "equipment_required"],
        "phase": "ANTES",
        "human_gate": "NONE",
        "post_tasks": [],
    },
    {
        "capability_tag": "ACCESS_AND_RECEPTION",
        "human_label": "Encargado/a de acceso y recepción",
        "activation_conditions": ["public_access", "ticketing_or_access_control"],
        "phase": "DURANTE",
        "human_gate": "NONE",
        "post_tasks": [],
    },
    {
        "capability_tag": "COMMUNICATIONS",
        "human_label": "Encargado/a de comunicaciones",
        "activation_conditions": ["communications_required"],
        "phase": "DURANTE",
        "human_gate": "NONE",
        "post_tasks": [],
    },
    {
        "capability_tag": "SPORTS_OPERATION",
        "human_label": "Encargado/a de operación deportiva",
        "activation_conditions": ["sports_operation_required"],
        "phase": "DURANTE",
        "human_gate": "NONE",
        "post_tasks": [{"work_id": "LAVADO", "title": "Lavado de indumentaria"}],
    },
    {
        "capability_tag": "FINANCIAL_CONTROL",
        "human_label": "Encargado/a de caja y control",
        "activation_conditions": ["sales_or_cash_handling"],
        "phase": "DURANTE_Y_CIERRE",
        "human_gate": "FINANCIAL_TRANSACTION",
        "post_tasks": [],
    },
]

CORE_BLOCK = r'''
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
'''

CERT = r'''#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4178/preview-v8/eventos/"
OUT = Path("evidence/cudo-match-full-day-builder/roundtrip.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

def caps(page):
    return set(page.locator("[data-workstream]").evaluate_all(
        "(els)=>els.map(e=>e.getAttribute('data-workstream'))"
    ))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 1100})
    page.goto(BASE, wait_until="networkidle")
    page.click("#resetQa")

    initial_caps = caps(page)
    expected_initial = {
        "VENUE_AND_FIELD","FOOD_SERVICE","CONCESSIONS","CLEANING_AND_SANITATION",
        "SETUP_AND_LOGISTICS","ACCESS_AND_RECEPTION","SPORTS_OPERATION","FINANCIAL_CONTROL"
    }
    initial_roles_text = page.locator("#responsibilities").inner_text()
    no_people_invented = "Sin persona asignada" in initial_roles_text and "Encargado estadio QA" not in initial_roles_text
    all_unassigned = page.locator("#responsibilities [data-assignment='UNASSIGNED']").count() == len(initial_caps)
    broadcast_absent = "COMMUNICATIONS" not in initial_caps

    # Falsify condition removal: a visiting match with optional operational branches off
    # must keep sports operation but remove non-applicable venue/commerce/access work.
    page.select_option("#location", "VISIT")
    for selector in ["#venueRequired","#foodSalesEnabled","#barSalesEnabled","#ticketingEnabled","#broadcastEnabled"]:
        if page.locator(selector).is_checked():
            page.uncheck(selector)
    page.click("#saveEvent")
    visit_caps = caps(page)
    visit_only_sport = visit_caps == {"SPORTS_OPERATION"}
    post_work_removed_when_not_applicable = page.locator("[data-work]").count() == 1 and "Lavado de indumentaria" in page.locator("#postWork").inner_text()

    # Restore the same synthetic local event and continue the existing dynamic sales roundtrip.
    page.select_option("#location", "LOCAL")
    for selector in ["#venueRequired","#foodSalesEnabled","#barSalesEnabled","#ticketingEnabled"]:
        if not page.locator(selector).is_checked():
            page.check(selector)
    page.click("#saveEvent")
    restored_caps = caps(page)
    workstream_derivation_restored = expected_initial.issubset(restored_caps) and "COMMUNICATIONS" not in restored_caps

    no_fixed_menu = "Todavía no se decidió qué vender" in page.locator("#offeringList").inner_text()
    no_inventory = "El inventario aparecerá" in page.locator("#stockRows").inner_text()

    page.fill("#offeringName", "Completo italiano QA")
    page.select_option("#offeringMode", "PREPARED")
    page.fill("#offeringPrice", "2500")
    page.click("#addOffering")
    prepared_id = "OFFER-COMPLETO_ITALIANO_QA"

    recipe = [
        ("Pan", "1", "unidad"),
        ("Vienesa", "1", "unidad"),
        ("Tomate", "1", "porcion"),
        ("Palta", "1", "porcion"),
        ("Mayonesa", "1", "porcion"),
    ]
    for name, qty, unit in recipe:
        page.select_option("#recipeOffering", prepared_id)
        page.fill("#ingredientName", name)
        page.fill("#ingredientQty", qty)
        page.select_option("#ingredientUnit", unit)
        page.click("#addIngredient")

    page.fill("#offeringName", "Bebida lata QA")
    page.select_option("#offeringMode", "DIRECT_RESALE")
    page.fill("#offeringPrice", "1500")
    page.click("#addOffering")
    resale_id = "OFFER-BEBIDA_LATA_QA"

    purchases = [
        ("INV-PAN", 10, 300),
        ("INV-VIENESA", 10, 400),
        ("INV-TOMATE", 10, 120),
        ("INV-PALTA", 10, 250),
        ("INV-MAYONESA", 10, 80),
        ("INV-BEBIDA_LATA_QA", 12, 700),
    ]
    for item_id, qty, cost in purchases:
        page.select_option("#purchaseItem", item_id)
        page.fill("#purchaseQty", str(qty))
        page.fill("#purchaseCost", str(cost))
        page.select_option("#purchasePayment", "PENDING")
        page.click("#registerPurchase")

    recipe_before = {
        item_id: float(page.locator(f"#stock-{item_id}").inner_text().replace(",", "."))
        for item_id in ["INV-PAN","INV-VIENESA","INV-TOMATE","INV-PALTA","INV-MAYONESA"]
    }
    beverage_before = float(page.locator("#stock-INV-BEBIDA_LATA_QA").inner_text().replace(",", "."))
    payable_before_sale = page.locator("#metricPayable").inner_text()

    page.select_option("#saleOffering", prepared_id)
    page.fill("#saleQty", "2")
    page.fill("#salePrice", "2500")
    page.select_option("#saleMethod", "CASH")
    page.click("#registerSale")
    recipe_after = {
        item_id: float(page.locator(f"#stock-{item_id}").inner_text().replace(",", "."))
        for item_id in recipe_before
    }

    page.select_option("#saleOffering", resale_id)
    page.fill("#saleQty", "5")
    page.fill("#salePrice", "1500")
    page.click("#registerSale")
    beverage_after = float(page.locator("#stock-INV-BEBIDA_LATA_QA").inner_text().replace(",", "."))
    income_after_sales = page.locator("#metricIncome").inner_text()

    page.reload(wait_until="networkidle")
    persisted_caps = caps(page)
    persisted_offerings = page.locator("[data-offering]").count()
    persisted_pan = float(page.locator("#stock-INV-PAN").inner_text().replace(",", "."))
    persisted_beverage = float(page.locator("#stock-INV-BEBIDA_LATA_QA").inner_text().replace(",", "."))

    page.select_option("#resultSeries", "Primera")
    page.fill("#homeGoals", "2")
    page.fill("#awayGoals", "1")
    page.click("#registerResult")
    result_visible = "Primera · CUDO 2 - 1" in page.locator("#resultList").inner_text()

    while page.locator("[data-work]").count() > 0:
        page.locator("[data-work]").first.click()
    page.click("#closeEvent")
    closed_visible = page.locator("#eventStatus").inner_text() == "CERRADA"
    pending_post = page.locator("#closePending").inner_text()

    checks = {
        "event_conditions_derive_expected_workstreams": expected_initial.issubset(initial_caps),
        "broadcast_false_does_not_derive_communications": broadcast_absent,
        "every_workstream_has_one_unassigned_accountable_role": all_unassigned,
        "no_synthetic_person_is_invented": no_people_invented,
        "removing_conditions_deactivates_non_applicable_workstreams": visit_only_sport,
        "post_event_work_is_derived_from_applicable_workstreams": post_work_removed_when_not_applicable,
        "restoring_conditions_restores_workstreams": workstream_derivation_restored,
        "workstream_projection_survives_reload": expected_initial.issubset(persisted_caps),
        "starts_without_fixed_menu": no_fixed_menu,
        "starts_without_fake_inventory": no_inventory,
        "prepared_offering_created_dynamically": persisted_offerings == 2,
        "recipe_consumes_all_ingredients": all(recipe_after[k] == recipe_before[k] - 2 for k in recipe_before),
        "direct_resale_consumes_units": beverage_after == beverage_before - 5,
        "purchases_create_payable": payable_before_sale != "$0",
        "sales_create_income": ("12.500" in income_after_sales or "12,500" in income_after_sales),
        "reload_preserves_dynamic_recipe_state": persisted_pan == recipe_after["INV-PAN"],
        "reload_preserves_resale_state": persisted_beverage == beverage_after,
        "sport_result_visible_same_event": result_visible,
        "post_event_work_completed": pending_post == "0",
        "event_closure_visible": closed_visible,
    }
    report = {
        "schema_version": "CUDO_MATCH_FULL_DAY_ROUNDTRIP_CERT_V3",
        "production_write": False,
        "base_url": BASE,
        "model": "EVENT_DERIVED_WORKSTREAMS_PLUS_DYNAMIC_OFFERINGS",
        "initial_workstreams": sorted(initial_caps),
        "visit_workstreams": sorted(visit_caps),
        "restored_workstreams": sorted(restored_caps),
        "checks": checks,
        "pass": all(checks.values()),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
    if not report["pass"]:
        raise SystemExit(2)
'''

def build_seed():
    seed = json.loads(DATA.read_text(encoding="utf-8"))
    if seed.get("schema_version") != "CUDO_MATCH_FULL_DAY_QA_V2":
        raise RuntimeError("unexpected match seed schema")
    seed["workstream_patterns"] = PATTERNS
    seed["assignments"] = {}
    seed["responsibilities"] = []
    seed["post_event_work"] = []
    DATA.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def build_core():
    text = CORE.read_text(encoding="utf-8")
    if "function eventSignals(state)" not in text:
        marker = "root.CudoEventCore={"
        if marker not in text:
            raise RuntimeError("event-core export marker missing")
        text = text.replace(marker, CORE_BLOCK + "\n" + marker, 1)
    export_old = "closeEvent,save,load"
    export_new = "closeEvent,eventSignals,deriveWorkstreams,reconcileEventWork,save,load"
    if export_new not in text:
        if export_old not in text:
            raise RuntimeError("event-core export list changed")
        text = text.replace(export_old, export_new, 1)
    CORE.write_text(text, encoding="utf-8")

def build_html():
    text = HTML.read_text(encoding="utf-8")
    old_heading = '''<section class="card" id="peopleCard">
  <h3>Personas y responsabilidades</h3>
  <div id="responsibilities" class="timeline"></div>
</section>'''
    new_heading = '''<section class="card wide" id="peopleCard">
  <h3>Trabajo que activa esta jornada</h3>
  <p class="sub">CUDO deriva estos frentes desde las condiciones del partido. Primero aparece el rol que hace falta; una persona se asigna sólo cuando existe un dato real.</p>
  <div id="responsibilities" class="timeline"></div>
</section>'''
    if old_heading in text:
        text = text.replace(old_heading, new_heading, 1)
    elif "Trabajo que activa esta jornada" not in text:
        raise RuntimeError("people projection block changed")

    render_old = "function render(){\n C.arrays(state);"
    render_new = "function render(){\n C.arrays(state);\n C.reconcileEventWork(state);"
    if render_new not in text:
        if render_old not in text:
            raise RuntimeError("render marker changed")
        text = text.replace(render_old, render_new, 1)

    resp_old = "$('responsibilities').innerHTML=state.responsibilities.map(r=>'<div class=\"row\"><strong>'+r.role+'</strong><span>'+r.person+'</span></div>').join('');"
    resp_new = "$('responsibilities').innerHTML=state.responsibilities.map(r=>'<div class=\"row\" data-workstream=\"'+r.capability_tag+'\" data-assignment=\"'+r.assignment_state+'\"><strong>'+r.role+'</strong><span>'+r.phase+' · '+(r.person||'Sin persona asignada')+(r.assignment_state==='UNASSIGNED'?' · GAP de asignación':'')+'</span></div>').join('');"
    if resp_new not in text:
        if resp_old not in text:
            raise RuntimeError("responsibility projection marker changed")
        text = text.replace(resp_old, resp_new, 1)

    HTML.write_text(text, encoding="utf-8")

def build_test():
    TEST.write_text(CERT, encoding="utf-8")

def validate():
    seed = json.loads(DATA.read_text(encoding="utf-8"))
    core = CORE.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")
    test = TEST.read_text(encoding="utf-8")
    required_caps = {p["capability_tag"] for p in PATTERNS}
    actual_caps = {p["capability_tag"] for p in seed.get("workstream_patterns") or []}
    assert required_caps == actual_caps
    assert seed.get("responsibilities") == []
    assert seed.get("post_event_work") == []
    assert seed.get("inventory_items") == []
    assert seed.get("offerings") == []
    for token in ["function eventSignals(state)", "function deriveWorkstreams(state)", "function reconcileEventWork(state)"]:
        assert token in core, token
    for token in ["Trabajo que activa esta jornada", "data-workstream", "Sin persona asignada", "C.reconcileEventWork(state)"]:
        assert token in html, token
    for token in ["event_conditions_derive_expected_workstreams", "no_synthetic_person_is_invented", "starts_without_fixed_menu"]:
        assert token in test, token
    print(json.dumps({
        "ok": True,
        "model": "EVENT_DERIVED_WORKSTREAMS_PLUS_DYNAMIC_OFFERINGS",
        "patterns": sorted(required_caps),
        "production_write": False,
    }, ensure_ascii=False))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    if args.validate:
        validate()
        return
    build_seed()
    build_core()
    build_html()
    build_test()
    validate()

if __name__ == "__main__":
    main()
