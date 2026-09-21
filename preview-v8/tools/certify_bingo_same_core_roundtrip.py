#!/usr/bin/env python3
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
 checks={"same_event_core":shared_core,"bingo_context":("bingo" in title.lower()),"no_sport_result_branch":sport_result_absent,"permit_branch":permit_ok,"donated_prize_visible":donated_visible,"donated_prize_no_payable":payable_after_donation==payable0,"purchase_stock":after_purchase==before+10,"purchase_payable":"7.000" in payable,"reload_persists":persisted==after_purchase,"sale_stock":after_sale==after_purchase-5,"sale_income":"7.500" in income,"post_cleanup_done":pending=="0","closure_visible":closed,"net_visible":bool(net)}
 report={"schema_version":"CUDO_BINGO_SAME_CORE_CERT_V1","production_write":False,"checks":checks,"pass":all(checks.values()),"net":net};OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False,indent=2));b.close()
 if not report["pass"]: raise SystemExit(2)
