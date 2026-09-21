#!/usr/bin/env python3
import json
import os
import signal
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / "ops" / "CUDO-MATCH-FULL-DAY-AGENT-TASK.yaml"
EVIDENCE = ROOT / "evidence" / "cudo-match-full-day-builder"
MODEL = "llama3.2:3b"
PORT = 4178


def run(cmd, *, check=True, timeout=None, env=None):
    cp = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        env=env,
    )
    print(cp.stdout)
    if check and cp.returncode != 0:
        raise RuntimeError("command failed rc=%s: %s\n%s" % (cp.returncode, " ".join(cmd), cp.stdout[-6000:]))
    return cp


def ollama_json(prompt, timeout=240):
    body = {
        "model": MODEL,
        "stream": False,
        "format": "json",
        "messages": [{"role": "user", "content": prompt}],
        "options": {"temperature": 0},
    }
    req = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    raw = (payload.get("message") or {}).get("content") or "{}"
    try:
        return json.loads(raw)
    except Exception:
        return {"parse_error": True, "raw": raw}


def verify_runtime():
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as response:
        tags = json.loads(response.read().decode("utf-8"))
    names = {m.get("name") for m in tags.get("models", [])}
    if MODEL not in names:
        raise RuntimeError("local model missing: %s" % MODEL)
    run(["podman", "--version"], timeout=20)


def make_plan(task_text):
    prompt = """You are the local CUDO builder agent. Read the bounded task below.
Do not expand scope. Do not propose a new backend, second engine, paid service, or direct main write.
Return ONLY JSON with keys: objective, reuse, implementation_steps, risks, stop_conditions, self_review_questions.
The candidate must make MATCH the human context and keep all actions in one CUDO Web experience.

TASK:
""" + task_text
    plan = ollama_json(prompt)
    (EVIDENCE / "builder-plan.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def build_candidate():
    run(["python3", "tools/cudo_match_full_day_builder_agent.py"], timeout=120)
    run(["python3", "tools/cudo_match_full_day_builder_agent.py", "--validate"], timeout=60)


def wait_http(url, seconds=40):
    deadline = time.time() + seconds
    last = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last = exc
        time.sleep(1)
    raise RuntimeError("http server not ready: %s" % last)


def browser_certificate():
    log = open("/tmp/cudo-match-builder-http.log", "w", encoding="utf-8")
    server = subprocess.Popen(
        ["python3", "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        wait_http("http://127.0.0.1:%s/preview-v8/eventos/" % PORT)
        run([
            "podman", "run", "--rm",
            "--network=host",
            "--security-opt", "label=disable",
            "-v", "%s:/work" % ROOT,
            "-w", "/work",
            "mcr.microsoft.com/playwright/python:v1.44.0-jammy",
            "bash", "-lc",
            "pip install --no-cache-dir 'playwright==1.44.0' >/tmp/pw-install.log && python preview-v8/tools/certify_match_full_day_roundtrip.py",
        ], timeout=900)
    finally:
        try:
            os.killpg(server.pid, signal.SIGTERM)
        except Exception:
            pass
        log.close()


def self_review(task_text):
    cert = json.loads((EVIDENCE / "roundtrip.json").read_text(encoding="utf-8"))
    prompt = """You are the builder's NON-AUTHORITATIVE self-review.
Compare the bounded task to the deterministic browser certificate.
Do not claim human acceptance. Return ONLY JSON with:
deterministic_roundtrip_ok, likely_remaining_gaps, scope_drift_detected, recommendation.
The independent ARKE human certifier remains authoritative for human acceptance.

TASK:
""" + task_text + "\nCERTIFICATE:\n" + json.dumps(cert, ensure_ascii=False, indent=2)
    review = ollama_json(prompt)
    (EVIDENCE / "builder-self-review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def persist_branch():
    branch = os.environ.get("GITHUB_REF_NAME") or "agent/match-full-club-day-roundtrip-20260921"
    run(["git", "config", "user.name", "cudo-builder-agent[bot]"], timeout=20)
    run(["git", "config", "user.email", "actions@users.noreply.github.com"], timeout=20)
    run([
        "git", "add",
        "preview-v8/eventos/index.html",
        "preview-v8/data/match-full-day-qa.json",
        "preview-v8/tools/certify_match_full_day_roundtrip.py",
        "evidence/cudo-match-full-day-builder/builder-plan.json",
        "evidence/cudo-match-full-day-builder/roundtrip.json",
        "evidence/cudo-match-full-day-builder/builder-self-review.json",
    ], timeout=20)
    diff = run(["git", "diff", "--cached", "--quiet"], check=False, timeout=20)
    if diff.returncode != 0:
        run(["git", "commit", "-m", "agent(cudo): materialize match full-day roundtrip candidate"], timeout=60)
        run(["git", "pull", "--rebase", "origin", branch], timeout=120)
        run(["git", "push", "origin", "HEAD:" + branch], timeout=120)


def open_draft_pr():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    branch = os.environ.get("GITHUB_REF_NAME")
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com")
    if not token or not repo or not branch:
        raise RuntimeError("missing GitHub Actions environment for PR creation")
    owner = repo.split("/", 1)[0]
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }
    query = urllib.parse.urlencode({"state": "open", "head": owner + ":" + branch, "base": "main"})
    req = urllib.request.Request("%s/repos/%s/pulls?%s" % (api, repo, query), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        existing = json.loads(response.read().decode("utf-8"))
    if existing:
        print("DRAFT_PR_EXISTS=%s" % existing[0]["number"])
        return existing[0]["number"]

    body = {
        "title": "CUDO: jornada integral del partido · candidato agente",
        "head": branch,
        "base": "main",
        "draft": True,
        "body": """Candidato materializado por el builder self-hosted de CUDO.

Alcance:
- Partido como contexto humano principal.
- Configuración de jornada y ramas condicionales.
- Compra → stock/costo/obligación.
- Venta → stock/ingreso/caja.
- Resultado deportivo.
- Trabajo post-partido.
- Cierre y recurso neto.
- Persistencia QA localStorage; production_write=false.

Este PR NO está autoaprobado. Requiere checks técnicos y el certificador humano-first independiente de ARKĒ antes de cualquier promoción.""",
    }
    req = urllib.request.Request(
        "%s/repos/%s/pulls" % (api, repo),
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        pr = json.loads(response.read().decode("utf-8"))
    print("DRAFT_PR_CREATED=%s" % pr["number"])
    return pr["number"]


def main():
    if os.environ.get("GITHUB_ACTOR") == "github-actions[bot]":
        print("CUDO_BUILDER_AGENT_SKIP_BOT_PUSH")
        return
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    task_text = TASK.read_text(encoding="utf-8")
    verify_runtime()
    make_plan(task_text)
    build_candidate()
    browser_certificate()
    self_review(task_text)
    persist_branch()
    open_draft_pr()
    print("CUDO_MATCH_FULL_DAY_AGENT_CONVERGED_TO_DRAFT_PR")


if __name__ == "__main__":
    main()
