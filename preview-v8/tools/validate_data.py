#!/usr/bin/env python3
"""Validador sin dependencias para las proyecciones públicas de C.U.D.O. V8."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CONTRACTS = ROOT / "contracts"
ROOT_RESOLVED = ROOT.resolve()
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def load_partidos_contract() -> tuple[dict, dict]:
    path = CONTRACTS / "partidos-v1.json"
    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError("partidos-v1.json no existe") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"partidos-v1.json inválido: {exc}") from exc

    if contract.get("contract_id") != "CUDO-PARTIDOS-V1":
        raise RuntimeError("partidos-v1.json contract_id inválido")
    if contract.get("schema_version") != "1.0":
        raise RuntimeError("partidos-v1.json schema_version inválido")

    public = contract.get("public_contract")
    if not isinstance(public, dict):
        raise RuntimeError("partidos-v1.json public_contract inválido")

    for key in ("required", "allowed", "unique", "states"):
        if not isinstance(public.get(key), list) or not public[key]:
            raise RuntimeError(f"partidos-v1.json public_contract.{key} inválido")

    spec = {
        "source": contract.get("source"),
        "required": set(public["required"]),
        "allowed": set(public["allowed"]),
        "unique": tuple(public["unique"]),
    }
    if not spec["source"]:
        raise RuntimeError("partidos-v1.json source inválido")
    if not spec["required"].issubset(spec["allowed"]):
        raise RuntimeError("partidos-v1.json required debe ser subconjunto de allowed")
    return contract, spec


def load_galeria_contract() -> tuple[dict, dict]:
    path = CONTRACTS / "galeria-v1.json"
    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError("galeria-v1.json no existe") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"galeria-v1.json inválido: {exc}") from exc

    if contract.get("contract_id") != "CUDO-GALERIA-V1":
        raise RuntimeError("galeria-v1.json contract_id inválido")
    if contract.get("schema_version") != "1.0":
        raise RuntimeError("galeria-v1.json schema_version inválido")

    public = contract.get("public_contract")
    if not isinstance(public, dict):
        raise RuntimeError("galeria-v1.json public_contract inválido")

    for key in ("required", "allowed", "unique", "image_fields"):
        if not isinstance(public.get(key), list) or not public[key]:
            raise RuntimeError(f"galeria-v1.json public_contract.{key} inválido")

    date_fields = public.get("date_fields")
    slug_fields = public.get("slug_fields")
    if not isinstance(date_fields, dict) or not date_fields:
        raise RuntimeError("galeria-v1.json public_contract.date_fields inválido")
    if not isinstance(slug_fields, dict) or not slug_fields:
        raise RuntimeError("galeria-v1.json public_contract.slug_fields inválido")

    spec = {
        "source": contract.get("source"),
        "required": set(public["required"]),
        "allowed": set(public["allowed"]),
        "unique": tuple(public["unique"]),
        "date_fields": dict(date_fields),
        "image_fields": tuple(public["image_fields"]),
        "slug_fields": dict(slug_fields),
    }
    if not spec["source"]:
        raise RuntimeError("galeria-v1.json source inválido")
    if not spec["required"].issubset(spec["allowed"]):
        raise RuntimeError("galeria-v1.json required debe ser subconjunto de allowed")

    for field, date_format in spec["date_fields"].items():
        if field not in spec["allowed"] or date_format != "YYYY-MM-DD":
            raise RuntimeError(f"galeria-v1.json regla de fecha inválida: {field}")
    for field in spec["image_fields"]:
        if field not in spec["allowed"]:
            raise RuntimeError(f"galeria-v1.json image_field no permitido: {field}")
    for field, rule in spec["slug_fields"].items():
        if field not in spec["allowed"] or not isinstance(rule, dict):
            raise RuntimeError(f"galeria-v1.json regla slug inválida: {field}")
        pattern = rule.get("pattern")
        message = rule.get("message")
        if not isinstance(pattern, str) or not pattern or not isinstance(message, str) or not message:
            raise RuntimeError(f"galeria-v1.json regla slug incompleta: {field}")
        try:
            re.compile(pattern)
        except re.error as exc:
            raise RuntimeError(f"galeria-v1.json patrón slug inválido: {field}: {exc}") from exc

    return contract, spec


def load_plantel_contract() -> tuple[dict, dict]:
    path = CONTRACTS / "plantel-v1.json"
    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError("plantel-v1.json no existe") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"plantel-v1.json inválido: {exc}") from exc

    if contract.get("contract_id") != "CUDO-PLANTEL-V1":
        raise RuntimeError("plantel-v1.json contract_id inválido")
    if contract.get("schema_version") != "1.0":
        raise RuntimeError("plantel-v1.json schema_version inválido")

    public = contract.get("public_contract")
    if not isinstance(public, dict):
        raise RuntimeError("plantel-v1.json public_contract inválido")

    for key in ("required", "allowed", "unique", "image_fields", "boolean_fields"):
        if not isinstance(public.get(key), list) or not public[key]:
            raise RuntimeError(f"plantel-v1.json public_contract.{key} inválido")

    integer_fields = public.get("integer_fields")
    enum_fields = public.get("enum_fields")
    if not isinstance(integer_fields, dict) or not integer_fields:
        raise RuntimeError("plantel-v1.json public_contract.integer_fields inválido")
    if not isinstance(enum_fields, dict) or not enum_fields:
        raise RuntimeError("plantel-v1.json public_contract.enum_fields inválido")

    spec = {
        "source": contract.get("source"),
        "required": set(public["required"]),
        "allowed": set(public["allowed"]),
        "unique": tuple(public["unique"]),
        "image_fields": tuple(public["image_fields"]),
        "integer_fields": dict(integer_fields),
        "enum_fields": dict(enum_fields),
        "boolean_fields": tuple(public["boolean_fields"]),
    }
    if not spec["source"]:
        raise RuntimeError("plantel-v1.json source inválido")
    if not spec["required"].issubset(spec["allowed"]):
        raise RuntimeError("plantel-v1.json required debe ser subconjunto de allowed")

    for field in spec["image_fields"]:
        if field not in spec["allowed"]:
            raise RuntimeError(f"plantel-v1.json image_field no permitido: {field}")
    for field, rule in spec["integer_fields"].items():
        if field not in spec["allowed"] or not isinstance(rule, dict):
            raise RuntimeError(f"plantel-v1.json regla integer inválida: {field}")
        minimum = rule.get("minimum")
        if minimum is not None and (isinstance(minimum, bool) or not isinstance(minimum, int)):
            raise RuntimeError(f"plantel-v1.json minimum inválido: {field}")
    for field, rule in spec["enum_fields"].items():
        if field not in spec["allowed"] or not isinstance(rule, dict):
            raise RuntimeError(f"plantel-v1.json regla enum inválida: {field}")
        values = rule.get("values")
        normalize = rule.get("normalize")
        if not isinstance(values, list) or not values or not all(isinstance(value, str) and value for value in values):
            raise RuntimeError(f"plantel-v1.json values enum inválidos: {field}")
        if normalize not in (None, "upper"):
            raise RuntimeError(f"plantel-v1.json normalize enum inválido: {field}")
    for field in spec["boolean_fields"]:
        if field not in spec["allowed"]:
            raise RuntimeError(f"plantel-v1.json boolean_field no permitido: {field}")

    return contract, spec


PARTIDOS_CONTRACT, PARTIDOS_SPEC = load_partidos_contract()
GALERIA_CONTRACT, GALERIA_SPEC = load_galeria_contract()
PLANTEL_CONTRACT, PLANTEL_SPEC = load_plantel_contract()

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
    "plantel.json": PLANTEL_SPEC,
    "galeria.json": GALERIA_SPEC,
    "partidos.json": PARTIDOS_SPEC,
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
    "contacto_emergencia", "documento", "ficha_medica", "ficha_médica", "autorizado",
    "autorizada", "autorizacion", "autorización", "consentimiento", "es_menor", "menor_edad",
}
MATCH_STATES = set(PARTIDOS_CONTRACT["public_contract"]["states"])
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
    if parsed.scheme and parsed.scheme != "https":
        fail(f"{where}: {key} solo admite HTTPS o ruta relativa")
    if parsed.scheme:
        query_keys = {name.lower() for name, _ in parse_qsl(parsed.query, keep_blank_values=True)}
        if parsed.hostname == "storage.tally.so" and parsed.path.startswith("/private/"):
            fail(f"{where}: {key} no puede publicar una referencia privada de Tally")
        if {"accesstoken", "signature"} & query_keys:
            fail(f"{where}: {key} no puede contener credenciales o firma privada en la URL")
        return

    if parsed.netloc or parsed.path.startswith("/"):
        fail(f"{where}: {key} debe usar una ruta relativa segura")
    try:
        target = (ROOT / parsed.path).resolve()
        target.relative_to(ROOT_RESOLVED)
    except (ValueError, OSError):
        fail(f"{where}: {key} intenta salir del árbol público V8")
    if target.suffix.lower() not in IMAGE_SUFFIXES:
        fail(f"{where}: {key} local debe apuntar a una imagen web permitida")
    if not target.is_file():
        fail(f"{where}: {key} apunta a un archivo local inexistente: {parsed.path}")


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

        image_fields = spec.get("image_fields")
        if image_fields:
            for key in image_fields:
                if key in item and item[key] not in (None, ""):
                    validate_image_ref(item[key], where, key)
        else:
            if "imagen_ref" in item and item["imagen_ref"] not in (None, ""):
                validate_image_ref(item["imagen_ref"], where)
            if "foto_ref" in item and item["foto_ref"] not in (None, ""):
                validate_image_ref(item["foto_ref"], where, "foto_ref")

        for key, date_format in spec.get("date_fields", {}).items():
            if date_format == "YYYY-MM-DD" and not DATE_RE.fullmatch(str(item[key]).strip()):
                fail(f"{where}: {key} debe usar formato YYYY-MM-DD")

        for key, rule in spec.get("slug_fields", {}).items():
            value = str(item[key]).strip()
            if not re.fullmatch(rule["pattern"], value):
                fail(f"{where}: {rule['message']}")

        for key, rule in spec.get("integer_fields", {}).items():
            if key in item:
                validate_int(item[key], where, key, minimum=rule.get("minimum"))

        for key, rule in spec.get("enum_fields", {}).items():
            if key not in item:
                continue
            value = str(item[key]).strip()
            if rule.get("normalize") == "upper":
                value = value.upper()
            if value not in rule["values"]:
                fail(f"{where}: {key} inválida: {value}")

        for key in spec.get("boolean_fields", ()):
            if key in item and not isinstance(item[key], bool):
                fail(f"{where}: {key} debe ser booleano")

        if filename == "partidos.json":
            if not DATE_RE.fullmatch(str(item["fecha"]).strip()):
                fail(f"{where}: fecha debe usar formato YYYY-MM-DD")
            if item.get("hora") not in (None, "") and not TIME_RE.fullmatch(str(item["hora"]).strip()):
                fail(f"{where}: hora debe usar formato HH:MM de 24 horas")
            state = str(item["estado_partido"]).strip().upper()
            if state not in MATCH_STATES:
                fail(f"{where}: estado_partido inválido: {state}")
            if state == "FINALIZADO" and PARTIDOS_CONTRACT["public_contract"].get("finalizado_requires_scores", True):
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
    except (RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print("OK  CUDO V8: contratos públicos válidos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
