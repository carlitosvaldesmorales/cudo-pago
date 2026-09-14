#!/usr/bin/env python3
"""Valida sin credenciales la configuración sync de los contratos CUDO V8."""

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
    public_sheet = pipeline.get("public_sheet")
    if public_sheet is not None and not nonblank(public_sheet):
        fail(f"{filename}: pipeline.public_sheet inválido")

    print(f"OK  {filename}: module={module} sync estático válido")
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

    print("OK  CUDO V8: configuración sync pre-merge válida")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
