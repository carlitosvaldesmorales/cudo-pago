#!/usr/bin/env python3
"""Valida sin credenciales la configuración sync y el mapeo humano de los contratos CUDO V8."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_DIR = ROOT / "contracts"
EXPECTED_FILES = (
    "noticias-v1.json",
    "equipos-v1.json",
    "plantel-v1.json",
    "partidos-v1.json",
    "tabla-v1.json",
    "galeria-v1.json",
)


def fail(message: str) -> None:
    raise ValueError(message)


def nonblank(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def string_list(value: object, where: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(nonblank(item) for item in value):
        fail(f"{where} debe ser lista de textos no vacíos")
    if len(set(value)) != len(value):
        fail(f"{where} contiene valores duplicados")
    return list(value)


def validate_form_mapping(filename: str, contract: dict, allowed: list[str]) -> None:
    mapping = contract.get("form_mapping")
    if not isinstance(mapping, list) or not mapping:
        fail(f"{filename}: form_mapping ausente o vacío")

    orders: list[int] = []
    raws: list[str] = []
    for index, item in enumerate(mapping, start=1):
        where = f"{filename}: form_mapping[{index}]"
        if not isinstance(item, dict):
            fail(f"{where} debe ser objeto")
        order = item.get("order")
        question = item.get("question")
        raw = item.get("raw")
        required = item.get("required")
        public_field = item.get("public")

        if not isinstance(order, int) or isinstance(order, bool) or order < 1:
            fail(f"{where}.order inválido")
        if not nonblank(question):
            fail(f"{where}.question inválido")
        if not nonblank(raw):
            fail(f"{where}.raw inválido")
        if not isinstance(required, bool):
            fail(f"{where}.required debe ser booleano")
        if public_field is not False and not nonblank(public_field):
            fail(f"{where}.public debe ser false o texto no vacío")
        if isinstance(public_field, str) and public_field not in allowed:
            fail(f"{where}.public referencia campo no permitido: {public_field}")

        orders.append(order)
        raws.append(raw.strip())

    if len(set(orders)) != len(orders):
        fail(f"{filename}: form_mapping contiene order duplicado")
    if orders != sorted(orders):
        fail(f"{filename}: form_mapping debe estar ordenado por order")
    if len(set(raws)) != len(raws):
        fail(f"{filename}: form_mapping contiene raw duplicado")


def validate_derived_fields(filename: str, contract: dict, allowed: list[str]) -> None:
    derived = contract.get("derived_fields", [])
    if derived is None:
        derived = []
    if not isinstance(derived, list):
        fail(f"{filename}: derived_fields debe ser lista")
    seen: set[str] = set()
    for index, item in enumerate(derived, start=1):
        where = f"{filename}: derived_fields[{index}]"
        if not isinstance(item, dict):
            fail(f"{where} debe ser objeto")
        public_field = item.get("public")
        control = item.get("control")
        transform = item.get("transform")
        if not nonblank(public_field) or public_field not in allowed:
            fail(f"{where}.public inválido o fuera de allowed")
        if not nonblank(control):
            fail(f"{where}.control inválido")
        if not nonblank(transform):
            fail(f"{where}.transform inválido")
        if public_field in seen:
            fail(f"{filename}: derived_fields repite {public_field}")
        seen.add(public_field)


def validate_contract(filename: str) -> tuple[str, str]:
    path = CONTRACT_DIR / filename
    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"{filename}: no existe")
    except json.JSONDecodeError as exc:
        fail(f"{filename}: JSON inválido: {exc}")

    contract_id = contract.get("contract_id")
    module = contract.get("module")
    source = contract.get("source")
    public = contract.get("public_contract")
    sync = contract.get("sync")

    if not nonblank(contract_id):
        fail(f"{filename}: contract_id inválido")
    if not nonblank(module):
        fail(f"{filename}: module inválido")
    if not nonblank(source):
        fail(f"{filename}: source inválido")
    if not isinstance(public, dict):
        fail(f"{filename}: public_contract inválido")
    if not isinstance(sync, dict):
        fail(f"{filename}: sync inválido o ausente")

    allowed = public.get("allowed")
    required = public.get("required")
    if not isinstance(allowed, list) or not allowed or not all(nonblank(field) for field in allowed):
        fail(f"{filename}: public_contract.allowed inválido")
    if not isinstance(required, list) or not required or not all(nonblank(field) for field in required):
        fail(f"{filename}: public_contract.required inválido")
    if not set(required).issubset(set(allowed)):
        fail(f"{filename}: required debe ser subconjunto de allowed")

    spreadsheet_id = sync.get("spreadsheet_id")
    if not nonblank(spreadsheet_id):
        fail(f"{filename}: sync.spreadsheet_id inválido")

    date_fields = string_list(sync.get("date_fields"), f"{filename}: sync.date_fields")
    time_fields = string_list(sync.get("time_fields"), f"{filename}: sync.time_fields")
    media_multi_fields = string_list(sync.get("media_multi_fields"), f"{filename}: sync.media_multi_fields")

    for field in (*date_fields, *time_fields):
        if field not in allowed:
            fail(f"{filename}: sync referencia campo no permitido: {field}")

    image_fields = public.get("image_fields", [])
    if image_fields is None:
        image_fields = []
    if not isinstance(image_fields, list) or not all(nonblank(field) for field in image_fields):
        fail(f"{filename}: public_contract.image_fields inválido")
    if len(image_fields) > 1:
        fail(f"{filename}: sync actual admite un único image_field")
    for field in media_multi_fields:
        if field not in image_fields:
            fail(f"{filename}: media_multi_fields fuera de image_fields: {field}")

    pipeline = contract.get("pipeline", {})
    if not isinstance(pipeline, dict):
        fail(f"{filename}: pipeline inválido")
    for key in ("form_spec_sheet", "raw_sheet", "control_sheet", "public_sheet", "public_json"):
        if not nonblank(pipeline.get(key)):
            fail(f"{filename}: pipeline.{key} inválido o ausente")
    publication_gate = pipeline.get("publication_gate")
    if not isinstance(publication_gate, dict) or not publication_gate:
        fail(f"{filename}: pipeline.publication_gate inválido o ausente")
    for key, value in publication_gate.items():
        if not nonblank(key) or not nonblank(value):
            fail(f"{filename}: pipeline.publication_gate contiene clave/valor inválido")

    validate_form_mapping(filename, contract, allowed)
    validate_derived_fields(filename, contract, allowed)

    print(f"OK  {filename}: module={module} sync+mapeo estático válido")
    return module, spreadsheet_id.strip()


def main() -> int:
    try:
        modules: list[str] = []
        spreadsheet_ids: list[str] = []
        for filename in EXPECTED_FILES:
            module, spreadsheet_id = validate_contract(filename)
            modules.append(module)
            spreadsheet_ids.append(spreadsheet_id)

        if len(set(modules)) != len(modules):
            fail("módulos sync duplicados")
        if len(set(spreadsheet_ids)) != len(spreadsheet_ids):
            fail("spreadsheet_id reutilizado por más de un módulo")
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print("OK  CUDO V8: configuración sync+mapeo pre-merge válida")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
