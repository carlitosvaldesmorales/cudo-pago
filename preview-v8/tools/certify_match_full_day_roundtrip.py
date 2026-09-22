#!/usr/bin/env python3
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
