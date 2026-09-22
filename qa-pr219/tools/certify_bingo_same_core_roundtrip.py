#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(".")
OUT=ROOT/"evidence/cudo-bingo-same-core/roundtrip.json"
OUT.parent.mkdir(parents=True,exist_ok=True)
match=(ROOT/"preview-v8/eventos/index.html").read_text(encoding="utf-8")
bingo=(ROOT/"preview-v8/eventos/bingo.html").read_text(encoding="utf-8")
shared_core=("./event-core.js" in match and "./event-core.js" in bingo)

with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    page=b.new_page(viewport={"width":1280,"height":1000})
    page.goto("http://127.0.0.1:4178/preview-v8/eventos/bingo.html",wait_until="networkidle")
    page.click("#resetQa")

    title=page.locator("#eventName").inner_text()
    sport_result_absent=page.locator("text=Resultado deportivo").count()==0
    no_fixed_menu="Aún no se decidió qué vender" in page.locator("#offeringList").inner_text()

    page.fill("#permitRef","Autorización Bingo QA")
    page.click("#confirmPermit")
    permit_ok="Permiso confirmado" in page.locator("#permitState").inner_text()

    payable0=page.locator("#payable").inner_text()
    page.fill("#prizeName","Canasta donada")
    page.select_option("#prizeSource","DONATED")
    page.fill("#prizeValue","25000")
    page.click("#registerPrize")
    donated_visible="Canasta donada" in page.locator("#prizes").inner_text()
    payable_after_donation=page.locator("#payable").inner_text()

    page.fill("#offeringName","Papas fritas QA")
    page.select_option("#offeringMode","PREPARED")
    page.fill("#offeringPrice","2000")
    page.click("#addOffering")
    prepared_id="OFFER-PAPAS_FRITAS_QA"

    for name,qty,unit in [("Papas","1","porcion"),("Aceite","0.1","litro")]:
        page.select_option("#recipeOffering",prepared_id)
        page.fill("#ingredientName",name)
        page.fill("#ingredientQty",qty)
        page.select_option("#ingredientUnit",unit)
        page.click("#addIngredient")

    page.fill("#offeringName","Bebida lata Bingo")
    page.select_option("#offeringMode","DIRECT_RESALE")
    page.fill("#offeringPrice","1500")
    page.click("#addOffering")
    resale_id="OFFER-BEBIDA_LATA_BINGO"

    for item_id,qty,cost in [
        ("INV-PAPAS",20,500),
        ("INV-ACEITE",2,2000),
        ("INV-BEBIDA_LATA_BINGO",16,700),
    ]:
        page.select_option("#purchaseItem",item_id)
        page.fill("#purchaseQty",str(qty))
        page.fill("#purchaseCost",str(cost))
        page.select_option("#purchasePayment","PENDING")
        page.click("#registerPurchase")

    papas_before=float(page.locator("#stock-INV-PAPAS").inner_text().replace(",","."))
    aceite_before=float(page.locator("#stock-INV-ACEITE").inner_text().replace(",","."))
    bev_before=float(page.locator("#stock-INV-BEBIDA_LATA_BINGO").inner_text().replace(",","."))

    page.select_option("#saleOffering",prepared_id)
    page.fill("#saleQty","3")
    page.fill("#salePrice","2000")
    page.click("#registerSale")
    papas_after=float(page.locator("#stock-INV-PAPAS").inner_text().replace(",","."))
    aceite_after=float(page.locator("#stock-INV-ACEITE").inner_text().replace(",","."))

    page.select_option("#saleOffering",resale_id)
    page.fill("#saleQty","5")
    page.fill("#salePrice","1500")
    page.click("#registerSale")
    bev_after=float(page.locator("#stock-INV-BEBIDA_LATA_BINGO").inner_text().replace(",","."))
    income=page.locator("#income").inner_text()
    payable=page.locator("#payable").inner_text()

    page.reload(wait_until="networkidle")
    persisted_offerings=page.locator("#offeringList .row").count()
    persisted_bev=float(page.locator("#stock-INV-BEBIDA_LATA_BINGO").inner_text().replace(",","."))

    while page.locator("[data-work]").count()>0:
        page.locator("[data-work]").first.click()
    page.click("#closeEvent")
    closed="Bingo cerrado" in page.locator("#closure").inner_text()
    pending=page.locator("#closePending").inner_text()
    net=page.locator("#closeNet").inner_text()

    checks={
        "same_event_core":shared_core,
        "bingo_context":"bingo" in title.lower(),
        "no_sport_result_branch":sport_result_absent,
        "starts_without_fixed_menu":no_fixed_menu,
        "permit_branch":permit_ok,
        "donated_prize_visible":donated_visible,
        "donated_prize_no_payable":payable_after_donation==payable0,
        "prepared_item_consumes_recipe":papas_after==papas_before-3 and abs(aceite_after-(aceite_before-0.3))<0.0001,
        "direct_resale_consumes_units":bev_after==bev_before-5,
        "purchase_payable_created":payable!="$0",
        "sales_income_visible":("13.500" in income or "13,500" in income),
        "reload_persists_dynamic_state":persisted_offerings==2 and persisted_bev==bev_after,
        "post_cleanup_done":pending=="0",
        "closure_visible":closed,
        "net_visible":bool(net),
    }
    report={
        "schema_version":"CUDO_BINGO_SAME_CORE_CERT_V2",
        "production_write":False,
        "model":"DYNAMIC_OFFERINGS_RECIPE_AND_RESALE",
        "checks":checks,
        "pass":all(checks.values()),
        "net":net,
    }
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    b.close()
    if not report["pass"]:
        raise SystemExit(2)
