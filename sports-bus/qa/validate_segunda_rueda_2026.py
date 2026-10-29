#!/usr/bin/env python3
"""QA determinista de reversa de localias ANFA 2026. No escribe D1 remota.

Usa el snapshot historico de Git unicamente como fixture sintetico de prueba,
no como autoridad ni sustituto del inventario productivo D1.
"""
from collections import Counter
from pathlib import Path
import json
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "preview-v8/data/championship-fixture.json"
MIGRATION = ROOT / "sports-bus/migrations/20261029_segunda_rueda_2026.sql"
DATA = json.loads(SOURCE.read_text())
SQL = MIGRATION.read_text()


def build(skip_match=False, skip_bye=False):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
      CREATE TABLE matches(
        match_id TEXT PRIMARY KEY, competition_id TEXT, season_id TEXT,
        round_label TEXT, kickoff_at TEXT, home_id TEXT, home_name TEXT,
        away_id TEXT, away_name TEXT, status TEXT, home_score INTEGER,
        away_score INTEGER, validation_status TEXT, source_event_id TEXT,
        updated_at TEXT, group_id TEXT, round_no INTEGER,
        source_label TEXT, source_ref TEXT
      );
      CREATE TABLE byes(
        bye_id TEXT PRIMARY KEY, competition_id TEXT, season_id TEXT,
        group_id TEXT, round_no INTEGER, team_id TEXT, source_label TEXT,
        created_at TEXT
      );
      CREATE TABLE match_series_results(
        match_id TEXT, series_code TEXT, home_score INTEGER, away_score INTEGER,
        validation_status TEXT, PRIMARY KEY(match_id,series_code)
      );
    """)
    originals = DATA["matches"][:-1] if skip_match else DATA["matches"]
    for m in originals:
        mm = re.fullmatch(r"([AB])-F([1-5])-M(\d+)", m["match_id"])
        assert mm, m["match_id"]
        group, round_num = mm.group(1), int(mm.group(2))
        db.execute("""INSERT INTO matches
           (match_id,competition_id,season_id,round_label,
            home_id,home_name,away_id,away_name,status,
            validation_status,updated_at,group_id,round_no)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (m["match_id"],"ANFA-CHEPICA-2026","2026",m["round_label"],
             m["home_id"],m["home_name"],m["away_id"],m["away_name"],
             "SCHEDULED","PENDING","2026-09-01",group,round_num))
    initial_byes = DATA["byes"][:-1] if skip_bye else DATA["byes"]
    for b in initial_byes:
        db.execute("""INSERT INTO byes
          (bye_id,competition_id,season_id,group_id,round_no,team_id,created_at)
          VALUES (?,?,?,?,?,?,?)""",
          (f'{b["group_id"]}-F{b["round_no"]}-{b["team_id"]}',
           "ANFA-CHEPICA-2026","2026",b["group_id"],
           b["round_no"],b["team_id"],"2026-09-01"))
    db.execute("""INSERT INTO match_series_results
        VALUES ('A-F1-M1','TERCERA',2,1,'VERIFIED')""")
    db.commit()
    return db


db = build()
before = {r["match_id"]: dict(r) for r in
    db.execute("SELECT * FROM matches WHERE round_no<=5")}
history = db.execute("SELECT * FROM match_series_results").fetchall()
for iteration in range(2):
    db.executescript(SQL)
    matches = [dict(r) for r in db.execute("SELECT * FROM matches")]
    byes = [dict(r) for r in db.execute("SELECT * FROM byes")]
    assert len(matches) == 50, (iteration, len(matches))
    assert len(byes) == 10
    assert sum(m["round_no"]>5 for m in matches) == 25
    assert Counter(m["group_id"] for m in matches) == {"A":30,"B":20}
    indexed = {r["match_id"]: r for r in matches}
    for match_id, original in before.items():
        assert indexed[match_id] == original, f"Alterado historico: {match_id}"
        second_id = re.sub(r"-F([1-5])-M", lambda mt: "-F"+str(int(mt[1])+5)+"-M", match_id)
        back = indexed[second_id]
        assert back["group_id"] == original["group_id"]
        assert back["round_no"] == original["round_no"] + 5
        assert back["home_id"] == original["away_id"]
        assert back["away_id"] == original["home_id"]
        assert back["home_name"] == original["away_name"]
        assert back["away_name"] == original["home_name"]
        assert back["kickoff_at"] == {6:"2026-11-01",7:"2026-11-08",8:"2026-11-15",9:"2026-11-22",10:"2026-11-29"}[back["round_no"]]
        assert back["home_score"] is None and back["away_score"] is None
        assert back["status"]=="SCHEDULED" and back["validation_status"]=="PENDING"
    assert [tuple(r) for r in db.execute("SELECT * FROM match_series_results")]==[tuple(r) for r in history]
    first_byes = {(r["group_id"],r["round_no"],r["team_id"]) for r in byes if r["round_no"]<=5}
    second_byes = {(r["group_id"],r["round_no"]-5,r["team_id"]) for r in byes if r["round_no"]>5}
    assert first_byes==second_byes and len(first_byes)==5

for skip_match,skip_bye in [(True,False),(False,True)]:
    invalid=build(skip_match,skip_bye)
    invalid.executescript(SQL)
    assert invalid.execute("SELECT COUNT(*) FROM matches WHERE round_no>5").fetchone()[0]==0
    assert invalid.execute("SELECT COUNT(*) FROM byes WHERE round_no>5").fetchone()[0]==0

print("PASS: 25 reencuentros invertidos, 5 descansos repetidos, 50 partidos, historial intacto, doble ejecucion idempotente y fail-closed ante inventario incompleto")
