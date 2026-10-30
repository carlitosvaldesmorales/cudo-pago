#!/usr/bin/env python3
"""QA-only Teamsster event-RSVP audit transaction overlay.

Pin Teamsster source and lockfile BEFORE applying. Never alter vendor production
or execute on shared CUDO/MINSAL/ARKĒ runtimes. We preserve vendor DB ownership.
"""
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: audit_overlay.py <event-admin.ts> <database-auth.test.ts>")
source = Path(sys.argv[1]).resolve(strict=True)
test = Path(sys.argv[2]).resolve(strict=True)
if source.name != "event-admin.ts" or test.name != "database-auth.test.ts":
    raise SystemExit("CUDO_R3_BAD_VENDOR_TARGET")
text = source.read_text(encoding="utf-8")
start = text.find("export async function upsertEventRsvp(\n")
end = text.find("export async function deleteEventRsvp(", start)
if start < 0 or end <= start or text[start:end].count(".onConflictDoUpdate(") != 1:
    raise SystemExit("CUDO_R3_RSVP_VENDOR_SIGNATURE_CHANGED")
replacement = """export async function upsertEventRsvp(
  input: UpsertEventRsvpInput,
): Promise<void> {
  const { eventId, leagueId, teamId, userId, status, note } = input;
  await db.transaction(async (tx) => {
    await tx
      .insert(teamEventRsvps)
      .values({
        eventId,
        leagueId,
        teamId,
        userId,
        status,
        note: note?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [teamEventRsvps.eventId, teamEventRsvps.userId],
        set: {
          note: note?.trim() || null,
          status,
          updatedAt: new Date(),
        },
      });
    await tx.insert(auditLogs).values({
      action: "team_event.rsvp",
      actorUserId: userId,
      entityId: eventId,
      entityType: "team_event",
      leagueId,
      metadata: { teamId, status },
    });
  });
}

"""
source.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
tests = test.read_text(encoding="utf-8")
needle = '      "team_event.create",\n    ]);'
if tests.count(needle) != 1:
    raise SystemExit("CUDO_R3_AUDIT_EXPECTATION_SIGNATURE_CHANGED")
tests = tests.replace(needle, '      "team_event.create",\n      "team_event.rsvp",\n    ]);')
test.write_text(tests, encoding="utf-8")
print("CUDO_R3_VENDOR_RSVP_ATOMIC_AUDIT_OVERLAY_APPLIED")
