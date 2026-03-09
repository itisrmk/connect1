import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectionCredentials,
  type PaginationParams,
  type PaginatedResult,
  type CalendarEvent,
  type CreateCalendarEvent,
} from "connect1";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarConnector extends BaseConnector {
  config: ConnectorConfig = {
    id: "google-calendar",
    name: "Google Calendar",
    domains: ["calendar"],
    authType: "oauth2",
    baseUrl: CALENDAR_API,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      defaultScopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
    },
    description: "Google Calendar integration",
  };

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    const res = await fetch(`${CALENDAR_API}/users/me/calendarList?maxResults=1`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    return res.ok;
  }

  async listEvents(
    credentials: ConnectionCredentials,
    params?: PaginationParams & { calendarId?: string; timeMin?: string; timeMax?: string }
  ): Promise<PaginatedResult<CalendarEvent>> {
    const calendarId = params?.calendarId ?? "primary";
    const query = new URLSearchParams({
      maxResults: String(params?.limit ?? 20),
      singleEvents: "true",
      orderBy: "startTime",
    });

    if (params?.cursor) query.set("pageToken", params.cursor);
    if (params?.timeMin) query.set("timeMin", params.timeMin);
    if (params?.timeMax) query.set("timeMax", params.timeMax);

    // Default to upcoming events
    if (!params?.timeMin) {
      query.set("timeMin", new Date().toISOString());
    }

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );

    if (!res.ok) throw new Error(`Calendar list failed: ${res.status}`);
    const data = (await res.json()) as GCalEventList;

    const events: CalendarEvent[] = (data.items ?? []).map((e) =>
      this.normalizeEvent(e)
    );

    return {
      data: events,
      nextCursor: data.nextPageToken,
      hasMore: !!data.nextPageToken,
    };
  }

  async getEvent(
    credentials: ConnectionCredentials,
    eventId: string,
    calendarId = "primary"
  ): Promise<CalendarEvent> {
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );

    if (!res.ok) throw new Error(`Calendar get failed: ${res.status}`);
    const data = (await res.json()) as GCalEvent;
    return this.normalizeEvent(data);
  }

  async createEvent(
    credentials: ConnectionCredentials,
    event: CreateCalendarEvent,
    calendarId = "primary"
  ): Promise<string> {
    const body: Record<string, unknown> = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.isAllDay
        ? { date: event.startTime.split("T")[0] }
        : { dateTime: event.startTime },
      end: event.isAllDay
        ? { date: event.endTime.split("T")[0] }
        : { dateTime: event.endTime },
    };

    if (event.attendees?.length) {
      body.attendees = event.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
      }));
    }

    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Calendar create failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private normalizeEvent(e: GCalEvent): CalendarEvent {
    const startTime = e.start?.dateTime ?? e.start?.date ?? "";
    const endTime = e.end?.dateTime ?? e.end?.date ?? "";
    const isAllDay = !e.start?.dateTime;

    return {
      id: e.id,
      provider: "google-calendar",
      title: e.summary ?? "Untitled",
      description: e.description,
      location: e.location,
      startTime: isAllDay ? `${startTime}T00:00:00Z` : startTime,
      endTime: isAllDay ? `${endTime}T00:00:00Z` : endTime,
      isAllDay,
      attendees: e.attendees?.map((a) => ({
        email: a.email,
        name: a.displayName,
        status: mapAttendeeStatus(a.responseStatus),
      })),
      organizer: e.organizer
        ? { email: e.organizer.email, name: e.organizer.displayName }
        : undefined,
      meetingUrl: e.hangoutLink ?? e.conferenceData?.entryPoints?.[0]?.uri,
      calendarId: e.calendarId,
      status: mapEventStatus(e.status),
      createdAt: e.created,
      updatedAt: e.updated,
      raw: e as unknown as Record<string, unknown>,
    };
  }
}

function mapAttendeeStatus(
  s?: string
): "accepted" | "declined" | "tentative" | "pending" {
  switch (s) {
    case "accepted": return "accepted";
    case "declined": return "declined";
    case "tentative": return "tentative";
    default: return "pending";
  }
}

function mapEventStatus(
  s?: string
): "confirmed" | "tentative" | "cancelled" {
  switch (s) {
    case "confirmed": return "confirmed";
    case "tentative": return "tentative";
    case "cancelled": return "cancelled";
    default: return "confirmed";
  }
}

// --- Google Calendar API types ---

type GCalDateTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

type GCalAttendee = {
  email: string;
  displayName?: string;
  responseStatus?: string;
};

type GCalEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GCalDateTime;
  end?: GCalDateTime;
  attendees?: GCalAttendee[];
  organizer?: { email: string; displayName?: string };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { uri: string }[] };
  calendarId?: string;
  status?: string;
  created?: string;
  updated?: string;
};

type GCalEventList = {
  items?: GCalEvent[];
  nextPageToken?: string;
};

export default GoogleCalendarConnector;
