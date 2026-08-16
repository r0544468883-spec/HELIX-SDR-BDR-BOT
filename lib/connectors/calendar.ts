// Google Calendar connector — read free/busy and book meetings, so the Scheduler /
// cadence agent can actually put a meeting on the calendar (not just suggest a time).
// Same OAuth connection as Gmail (one Google grant covers both). Plain fetch.
const API = 'https://www.googleapis.com/calendar/v3';

export interface Busy {
  start: string; // ISO
  end: string;
}

/** Busy intervals on the primary calendar between timeMin/timeMax (ISO). */
export async function listBusy(accessToken: string, timeMin: string, timeMax: string): Promise<Busy[]> {
  const res = await fetch(`${API}/freeBusy`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { calendars?: { primary?: { busy?: Busy[] } } };
  return j.calendars?.primary?.busy ?? [];
}

/** Create a meeting on the primary calendar. Returns the event id + link, or null. */
export async function createEvent(
  accessToken: string,
  ev: { summary: string; description?: string; start: string; end: string; attendees?: string[] },
): Promise<{ id: string; htmlLink?: string } | null> {
  const res = await fetch(`${API}/calendars/primary/events?sendUpdates=all`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: ev.summary,
      description: ev.description,
      start: { dateTime: ev.start },
      end: { dateTime: ev.end },
      ...(ev.attendees?.length ? { attendees: ev.attendees.map((email) => ({ email })) } : {}),
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { id?: string; htmlLink?: string };
  return j.id ? { id: j.id, htmlLink: j.htmlLink } : null;
}
