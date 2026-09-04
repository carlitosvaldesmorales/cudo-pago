#!/usr/bin/env python3
"""Validador sin dependencias para las proyecciones públicas de C.U.D.O. V7."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

SPECS = {
    "noticias.json": {
        "source": "CUDO_WEB_NOTICIAS",
        "required": {"id", "fecha", "slug", "titulo", "resumen"},
        "allowed": {"id", "fecha", "slug", "titulo", "resumen", "cuerpo", "imagen_ref"},
        "unique": ("id", "slug"),
    },
    "equipos.json": {
        "source": "CUDO_WEB_EQUIPOS",
        "required": {"id", "nombre", "categoria"},
        "allowed": {"id", "nombre", "categoria", "descripcion"},
        "unique": ("id",),
    },
    "galeria.json": {
        "source": "CUDO_WEB_GALERIA",
        "required": {"id", "fecha", "titulo", "imagen_ref"},
        "allowed": {"id", "fecha", "titulo", "descripcion", "imagen_ref"},
        "unique": ("id",),
    },
    "partidos.json": {
        "source": "CUDO_WEB_PARTIDOS",
        "required": {"id", "fecha", "local", "visita", "estado_partido"},
        "allowed": {"id", "fecha", "hora", "local", "visita", "recinto", "categoria", "competencia", "estado_partido", "goles_local", "goles_visita"},
        "unique": ("id",),
    },
}

TOP_LEVEL = {"schema_version", "generated_at", "source", "items"}
PRIVATE_KEYS = {
    "rut", "email", "correo", "telefono", "teléfono", "phone", "direccion", "dirección",
    "fecha_nacimiento", "nacimiento", "responsable", "observaciones", "fuente",
    "clasificacion", "clasificación", "privacidad", "publicar", "estado",
}
MATCH_STATES = {"PROGRAMADO", "FINALIZADO", "SUSPENDIDO", "CANCELADO"}


def fail(message: str) -> None:
    raise ValueError(message)


def nonblank(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_image_ref(value: object, where: str) -> None:
    if not isinstance(value, str) or not value.strip():
        fail(f"{where}: imagen_ref debe ser texto no vacío")
    parsed = urlparse(value.strip())
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        fail(f"{where}: protocolo de imagen no permitido: {parsed.scheme}")


def validate_score(value: object, where: str, key: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        fail(f"{where}: {key} debe ser un entero mayor o igual a 0")


def validate_file(filename: str, spec: dict) -> None:
    path = DATA / filename
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"{filename}: archivo no existe")
    except json.JSONDecodeError as exc:
        fail(f"{filename}: JSON inválido: {exc}")

    if not isinstance(doc, dict):
        fail(f"{filename}: raíz debe ser un objeto JSON")

    extra_top = set(doc) - TOP_LEVEL
    missing_top = TOP_LEVEL - set(doc)
    if extra_top:
        fail(f"{filename}: campos superiores no permitidos: {sorted(extra_top)}")
    if missing_top:
        fail(f"{filename}: faltan campos superiores: {sorted(missing_top)}")

    if doc["schema_version"] != "1.0":
        fail(f"{filename}: schema_version debe ser 1.0")
    if doc["source"] != spec["source"]:
        fail(f"{filename}: source debe ser {spec['source']}")
    if doc["generated_at"] is not None and not isinstance(doc["generated_at"], str):
        fail(f"{filename}: generated_at debe ser null o texto")
    if not isinstance(doc["items"], list):
        fail(f"{filename}: items debe ser una lista")

    seen = {key: set() for key in spec["unique"]}

    for index, item in enumerate(doc["items"], start=1):
        where = f"{filename} item #{index}"
        if not isinstance(item, dict):
            fail(f"{where}: debe ser un objeto")

        keys = set(item)
        forbidden = {key for key in keys if key.lower() in PRIVATE_KEYS}
        if forbidden:
            fail(f"{where}: contiene campos privados/internos: {sorted(forbidden)}")

        extra = keys - spec["allowed"]
        missing = spec["required"] - keys
        if extra:
            fail(f"{where}: campos públicos no permitidos: {sorted(extra)}")
        if missing:
            fail(f"{where}: faltan campos requeridos: {sorted(missing)}")

        for key in spec["required"]:
            if not nonblank(item.get(key)):
                fail(f"{where}: {key} no puede estar vacío")

        for key in spec["unique"]:
            value = str(item.get(key, "")).strip()
            if value in seen[key]:
                fail(f"{where}: {key} duplicado: {value}")
            seen[key].add(value)

        if "imagen_ref" in item and item["imagen_ref"] not in (None, ""):
            validate_image_ref(item["imagen_ref"], where)

        if filename == "partidos.json":
            state = str(item["estado_partido"]).strip().upper()
            if state not in MATCH_STATES:
                fail(f"{where}: estado_partido inválido: {state}")
            if state == "FINALIZADO":
                if "goles_local" not in item or "goles_visita" not in item:
                    fail(f"{where}: un partido FINALIZADO debe incluir ambos marcadores")
                validate_score(item["goles_local"], where, "goles_local")
                validate_score(item["goles_visita"], where, "goles_visita")
            else:
                for score_key in ("goles_local", "goles_visita"):
                    if score_key in item and item[score_key] is not None:
                        validate_score(item[score_key], where, score_key)

    print(f"OK  {filename}: {len(doc['items'])} item(s)")


def main() -> int:
    try:
        for filename, spec in SPECS.items():
            validate_file(filename, spec)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print("OK  CUDO V7: contratos públicos válidos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
