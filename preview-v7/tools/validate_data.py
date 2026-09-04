#!/usr/bin/env python3
"""Validador sin dependencias para las proyecciones públicas de C.U.D.O. V7."""

from __future__ import annotations

import json
import re
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
    "plantel.json": {
        "source": "CUDO_WEB_PLANTEL",
        "required": {"id", "nombre_deportivo", "numero", "posicion", "categoria"},
        "allowed": {"id", "nombre_deportivo", "numero", "posicion", "categoria", "foto_ref", "capitan"},
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
    "tabla.json": {
        "source": "CUDO_WEB_TABLA",
        "required": {"id", "competencia", "categoria", "posicion", "equipo", "pj", "pg", "pe", "pp", "gf", "gc", "dg", "pts"},
        "allowed": {"id", "competencia", "categoria", "posicion", "equipo", "pj", "pg", "pe", "pp", "gf", "gc", "dg", "pts"},
        "unique": ("id",),
    },
}

TOP_LEVEL = {"schema_version", "generated_at", "source", "items"}
PRIVATE_KEYS = {
    "rut", "email", "correo", "telefono", "teléfono", "phone", "direccion", "dirección",
    "fecha_nacimiento", "nacimiento", "responsable", "observaciones", "fuente",
    "clasificacion", "clasificación", "privacidad", "publicar", "estado", "apoderado",
    "contacto_emergencia", "documento", "ficha_medica", "ficha_médica",
}
MATCH_STATES = {"PROGRAMADO", "FINALIZADO", "SUSPENDIDO", "CANCELADO"}
PLAYER_POSITIONS = {"ARQUERO", "DEFENSA", "VOLANTE", "DELANTERO"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def fail(message: str) -> None:
    raise ValueError(message)


def nonblank(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_image_ref(value: object, where: str, key: str = "imagen_ref") -> None:
    if not isinstance(value, str) or not value.strip():
        fail(f"{where}: {key} debe ser texto no vacío")
    parsed = urlparse(value.strip())
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        fail(f"{where}: protocolo de imagen no permitido: {parsed.scheme}")


def validate_int(value: object, where: str, key: str, *, minimum: int | None = None) -> None:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"{where}: {key} debe ser entero")
    if minimum is not None and value < minimum:
        fail(f"{where}: {key} debe ser mayor o igual a {minimum}")


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

        integer_required = {"numero", "posicion_tabla", "posicion", "pj", "pg", "pe", "pp", "gf", "gc", "dg", "pts"}
        for key in spec["required"]:
            if key in integer_required and isinstance(item.get(key), int) and not isinstance(item.get(key), bool):
                continue
            if key in {"posicion", "pj", "pg", "pe", "pp", "gf", "gc", "dg", "pts", "numero"}:
                continue
            if not nonblank(item.get(key)):
                fail(f"{where}: {key} no puede estar vacío")

        for key in spec["unique"]:
            value = str(item.get(key, "")).strip()
            if value in seen[key]:
                fail(f"{where}: {key} duplicado: {value}")
            seen[key].add(value)

        if "imagen_ref" in item and item["imagen_ref"] not in (None, ""):
            validate_image_ref(item["imagen_ref"], where)
        if "foto_ref" in item and item["foto_ref"] not in (None, ""):
            validate_image_ref(item["foto_ref"], where, "foto_ref")

        if filename == "plantel.json":
            validate_int(item["numero"], where, "numero", minimum=1)
            position = str(item["posicion"]).strip().upper()
            if position not in PLAYER_POSITIONS:
                fail(f"{where}: posicion inválida: {position}")
            if "capitan" in item and not isinstance(item["capitan"], bool):
                fail(f"{where}: capitan debe ser booleano")

        if filename == "partidos.json":
            if not DATE_RE.fullmatch(str(item["fecha"]).strip()):
                fail(f"{where}: fecha debe usar formato YYYY-MM-DD")
            if item.get("hora") not in (None, "") and not TIME_RE.fullmatch(str(item["hora"]).strip()):
                fail(f"{where}: hora debe usar formato HH:MM de 24 horas")
            state = str(item["estado_partido"]).strip().upper()
            if state not in MATCH_STATES:
                fail(f"{where}: estado_partido inválido: {state}")
            if state == "FINALIZADO":
                if "goles_local" not in item or "goles_visita" not in item:
                    fail(f"{where}: un partido FINALIZADO debe incluir ambos marcadores")
                validate_int(item["goles_local"], where, "goles_local", minimum=0)
                validate_int(item["goles_visita"], where, "goles_visita", minimum=0)
            else:
                for score_key in ("goles_local", "goles_visita"):
                    if score_key in item and item[score_key] is not None:
                        validate_int(item[score_key], where, score_key, minimum=0)

        if filename == "tabla.json":
            validate_int(item["posicion"], where, "posicion", minimum=1)
            for key in ("pj", "pg", "pe", "pp", "gf", "gc", "pts"):
                validate_int(item[key], where, key, minimum=0)
            validate_int(item["dg"], where, "dg")
            if item["pg"] + item["pe"] + item["pp"] > item["pj"]:
                fail(f"{where}: PG+PE+PP no puede superar PJ")
            if item["dg"] != item["gf"] - item["gc"]:
                fail(f"{where}: DG debe ser igual a GF-GC")

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
