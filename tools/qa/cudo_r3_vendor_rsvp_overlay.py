#!/usr/bin/env python3
"""CUDO MVP-R3 QA overlay: extend pinned Teamsster's REAL auth/Postgres integration test.

Does not modify upstream, does not install an alternative vendor engine,
does not touch CUDO/ARKĒ data or credentials.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: cudo_r3_vendor_rsvp_overlay.py <vendor integration test path>")
path = Path(sys.argv[1]).resolve(strict=True)
if path.name != "database-auth.test.ts" or path.parent.name != "integration":
    raise SystemExit("CUDO_R3_WRONG_VENDOR_TEST_TARGET")
text = path.read_text(encoding="utf-8")
needle = "    await createTeamEventForUser(userId, event);\n"
if text.count(needle) != 1:
    raise SystemExit("CUDO_R3_UPSTREAM_TEST_SIGNATURE_MISMATCH")
replacement = """    const { eventId } = await createTeamEventForUser(userId, event);
    // CUDO-R3 QA overlay: use actual authenticated Teamsster application methods.
    const { upsertEventRsvpForUser, getEventRsvpSummaryForUser } =
      await import("@/lib/rsvp");
    await upsertEventRsvpForUser(userId, {
      eventId, leagueId, teamId, status: "YES",
    });
    const rsvp = await getEventRsvpSummaryForUser(
      userId, eventId, leagueId, teamId
    );
    expect(rsvp.userRsvp?.status).toBe("YES");
    const dbRsvp = await reader?.query(
      "SELECT status FROM team_event_rsvps WHERE event_id = $1", [eventId]
    );
    expect(dbRsvp?.rows).toEqual([{status: "YES"}]);
    // No claim that RSVP audit events exist: separate gap until source proof.
"""
path.write_text(text.replace(needle, replacement), encoding="utf-8")
print("CUDO_R3_VENDOR_AUTHENTICATED_RSVP_TEST_OVERLAY_APPLIED")
