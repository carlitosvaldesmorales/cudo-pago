#!/usr/bin/env python3
"""Valida que el contrato ejecutable de Partidos siga alineado con el renderer V8."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "partidos-v1.json"
RENDERER_PATH = ROOT / "shared" / "page-ux.js"


def fail(message: str) -> None:
    raise ValueError(message)


def load_contract() -> dict:
    try:
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail("no existe contracts/partidos-v1.json")
    except json.JSONDecodeError as exc:
        fail(f"contrato JSON inválido: {exc}")
    if contract.get("contract_id") != "CUDO-PARTIDOS-V1":
        fail("contract_id debe ser CUDO-PARTIDOS-V1")
    return contract


def validate_internal_contract(contract: dict) -> None:
    public = contract["public_contract"]
    mapping = contract["form_mapping"]
    expected_public = ["id", *[
        item["public"] for item in mapping
        if isinstance(item.get("public"), str) and item["public"]
    ]]
    if expected_public != public["allowed"]:
        fail(
            "form_mapping público no coincide con public_contract.allowed: "
            f"{expected_public!r} != {public['allowed']!r}"
        )

    orders = [item["order"] for item in mapping]
    if orders != list(range(1, len(mapping) + 1)):
        fail(f"form_mapping order no es consecutivo: {orders!r}")

    raws = [item["raw"] for item in mapping]
    if len(raws) != len(set(raws)):
        fail("form_mapping contiene DESTINO_RAW duplicado")

    if contract["renderer"]["group_by"] != ["fecha", "rival", "estado_partido"]:
        fail("renderer.group_by no coincide con el agrupamiento materializado V8")


def parse_category_order(renderer: str) -> list[str]:
    match = re.search(r"const order=\{([^}]+)\};", renderer)
    if not match:
        fail("renderer no contiene const order={...} de categorías")
    pairs = re.findall(r"([A-Z]+):(\d+)", match.group(1))
    if not pairs:
        fail("no fue posible leer el orden de categorías del renderer")
    return [name for name, _ in sorted(pairs, key=lambda item: int(item[1]))]


def validate_renderer(contract: dict) -> None:
    renderer = RENDERER_PATH.read_text(encoding="utf-8")
    identity = contract["renderer"]["cudo_identity"]
    expected_identity_token = f"m.local==='{identity}'?m.visita:m.local"
    if expected_identity_token not in renderer:
        fail(f"renderer no resuelve rival con cudo_identity={identity!r}")

    expected_filter_token = f"m.local==='{identity}'||m.visita==='{identity}'"
    if expected_filter_token not in renderer:
        fail(f"renderer no filtra partidos usando cudo_identity={identity!r}")

    group_token = "[m.fecha||'',opponent(m)||'',m.estado_partido||''].join('|')"
    if group_token not in renderer:
        fail("renderer ya no agrupa por fecha + rival + estado_partido")

    actual_categories = parse_category_order(renderer)
    expected_categories = contract["renderer"]["category_order"]
    if actual_categories != expected_categories:
        fail(
            f"renderer category_order={actual_categories!r} "
            f"no coincide con contrato={expected_categories!r}"
        )

    if "g.estado==='PROGRAMADO'" not in renderer:
        fail("renderer no identifica jornada PROGRAMADO para próxima fecha")
    if "g.estado==='FINALIZADO'" not in renderer:
        fail("renderer no identifica jornada FINALIZADO para última fecha")


def main() -> int:
    try:
        contract = load_contract()
        validate_internal_contract(contract)
        validate_renderer(contract)
    except (KeyError, TypeError, ValueError) as exc:
        print(f"ERROR: CUDO-PARTIDOS-V1: {exc}", file=sys.stderr)
        return 1
    print("OK  CUDO-PARTIDOS-V1: contrato, mapping y renderer alineados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
