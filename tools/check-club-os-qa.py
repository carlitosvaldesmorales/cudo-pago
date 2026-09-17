#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'qa-v8-google/admin/index.html'
FIXTURE = ROOT / 'qa-v8-google/admin/club-os-fixture.json'


def fail(message):
    raise SystemExit(message)


def main():
    if not PAGE.exists() or not FIXTURE.exists():
        fail('Club OS QA artifacts missing')

    html = PAGE.read_text(encoding='utf-8')
    data = json.loads(FIXTURE.read_text(encoding='utf-8'))

    if data.get('provenance_state') != 'SYNTHETIC':
        fail('fixture provenance must be SYNTHETIC')
    if data.get('qa_only') is not True:
        fail('fixture must be QA-only')
    if data.get('production_publication_allowed') is not False:
        fail('synthetic fixture must not allow production publication')
    if data.get('real_compliance_evidence') is not False:
        fail('synthetic fixture must not count as real compliance evidence')

    secretariat = data.get('secretariat', {})
    if secretariat.get('required_human_gate') != 'REVIEW':
        fail('secretariat scenario must require REVIEW human gate')
    if secretariat.get('external_submission_allowed') is not False:
        fail('secretariat synthetic scenario must not submit externally')
    if secretariat.get('can_count_as_real_minutes') is not False:
        fail('synthetic minutes must never count as real minutes')

    required_fragments = [
        'data-environment="QA"',
        'data-provenance="SYNTHETIC"',
        'QA · DATOS SINTÉTICOS · NO PRODUCCIÓN',
        'Generar acta sintética',
        'Gate humano obligatorio',
        'PUBLICACIÓN PRODUCTIVA: PROHIBIDA',
        'EVIDENCIA DE CUMPLIMIENTO REAL: NO',
    ]
    missing = [item for item in required_fragments if item not in html]
    if missing:
        fail(f'missing fail-closed UI fragments: {missing}')

    forbidden_fragments = [
        'Enviar postulación real',
        'Firmar automáticamente',
        'production_publication_allowed": true',
    ]
    present = [item for item in forbidden_fragments if item in html]
    if present:
        fail(f'unsafe fragments present: {present}')

    print('PASS: Club OS QA synthetic admin contract is fail-closed')


if __name__ == '__main__':
    main()
