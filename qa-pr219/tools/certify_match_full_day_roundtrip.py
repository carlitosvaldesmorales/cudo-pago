#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4178/preview-v8/eventos/"
OUT = Path("evidence/cudo-match-full-day-builder/roundtrip.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(BASE, wait_until="networkidle")
    page.click("#resetQa")
    before_stock = int(page.locator("#stock-BEBIDA").inner_text())
    before_payable = page.locator("#metricPayable").inner_text()

    page.select_option("#purchaseProduct", "BEBIDA")
    page.fill("#purchaseQty", "10")
    page.fill("#purchaseCost", "700")
    page.fill("#purchaseSupplier", "Proveedor QA Cert")
    page.select_option("#purchasePayment", "PENDING")
    page.click("#registerPurchase")
    after_purchase_stock = int(page.locator("#stock-BEBIDA").inner_text())
    after_payable = page.locator("#metricPayable").inner_text()

    page.reload(wait_until="networkidle")
    persisted_stock = int(page.locator("#stock-BEBIDA").inner_text())
    persisted_payable = page.locator("#metricPayable").inner_text()

    page.select_option("#saleProduct", "BEBIDA")
    page.fill("#saleQty", "5")
    page.fill("#salePrice", "1500")
    page.select_option("#saleMethod", "CASH")
    page.click("#registerSale")
    after_sale_stock = int(page.locator("#stock-BEBIDA").inner_text())
    after_income = page.locator("#metricIncome").inner_text()

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
        "purchase_stock_increment": after_purchase_stock == before_stock + 10,
        "purchase_payable_created": "7.000" in after_payable,
        "reload_preserves_purchase_stock": persisted_stock == after_purchase_stock,
        "reload_preserves_payable": persisted_payable == after_payable,
        "sale_stock_decrement": after_sale_stock == after_purchase_stock - 5,
        "sale_income_visible": "7.500" in after_income,
        "sport_result_visible_same_event": result_visible,
        "post_event_work_completed": pending_post == "0",
        "event_closure_visible": closed_visible,
    }
    report = {
        "schema_version": "CUDO_MATCH_FULL_DAY_ROUNDTRIP_CERT_V1",
        "production_write": False,
        "base_url": BASE,
        "before_stock": before_stock,
        "before_payable": before_payable,
        "after_purchase_stock": after_purchase_stock,
        "after_payable": after_payable,
        "persisted_stock": persisted_stock,
        "after_sale_stock": after_sale_stock,
        "after_income": after_income,
        "checks": checks,
        "pass": all(checks.values()),
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
    if not report["pass"]:
        raise SystemExit(2)
