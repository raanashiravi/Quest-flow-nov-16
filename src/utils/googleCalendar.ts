import { CampusMeeting } from '../types';
import { parseLocationString } from './locationParser';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

// In-memory only token state
let accessToken: string | null = null;
let tokenExpiresAt = 0;
let connectedEmail: string | null = null;
let tokenExpired = false;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let gsiLoadPromise: Promise<void> | null = null;

type AuthStateListener = () => void;
const listeners = new Set<AuthStateListener>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeGoogleAuthState(listener: AuthStateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGoogleClientId(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isGoogleCalendarConfigured(): boolean {
  return getGoogleClientId().length > 0;
}

export function getGoogleAuthState(): {
  isConnected: boolean;
  isExpired: boolean;
  email: string | null;
} {
  if (accessToken && Date.now() >= tokenExpiresAt) {
    markTokenExpired();
  }
  return {
    isConnected: Boolean(accessToken),
    isExpired: tokenExpired,
    email: connectedEmail,
  };
}

function clearExpiryTimer() {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function markTokenExpired() {
  clearExpiryTimer();
  accessToken = null;
  tokenExpiresAt = 0;
  tokenExpired = true;
  notifyListeners();
}

export function disconnectGoogleCalendar(): void {
  const tokenToRevoke = accessToken;
  clearExpiryTimer();
  accessToken = null;
  tokenExpiresAt = 0;
  connectedEmail = null;
  tokenExpired = false;
  notifyListeners();

  if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(tokenToRevoke, () => {});
    } catch {}
  }
}

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) {
    return gsiLoadPromise;
  }

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          gsiLoadPromise = null;
          reject(new Error('Could not load Google sign-in script.'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoadPromise = null;
      reject(new Error('Could not load Google sign-in script.'));
    };
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

function ensureValidToken(): string {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    markTokenExpired();
    throw new Error('Google Calendar session expired. Please reconnect.');
  }
  return accessToken;
}

async function googleApiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = ensureValidToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    markTokenExpired();
    throw new Error('Google Calendar session expired. Please reconnect.');
  }

  return response;
}

export async function connectGoogleCalendar(): Promise<{ email: string }> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Google Calendar isn't set up");
  }

  await loadGsiScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google sign-in is unavailable in this browser.');
  }

  return new Promise<{ email: string }>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_EVENTS_SCOPE,
      callback: async (resp: GoogleTokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || 'Google Calendar sign-in was cancelled.'));
          return;
        }

        clearExpiryTimer();
        accessToken = resp.access_token;
        const expiresInSec = Math.max(60, Number(resp.expires_in) || 3600);
        tokenExpiresAt = Date.now() + (expiresInSec - 15) * 1000;
        tokenExpired = false;

        expiryTimer = setTimeout(() => {
          markTokenExpired();
        }, (expiresInSec - 15) * 1000);

        const email = await resolveAccountEmail();
        connectedEmail = email;
        notifyListeners();
        resolve({ email });
      },
      error_callback: (err) => {
        reject(new Error(err?.message || 'Google Calendar sign-in failed.'));
      },
    });

    client.requestAccessToken({ prompt: '' });
  });
}

async function resolveAccountEmail(): Promise<string> {
  try {
    const resp = await googleApiFetch(
      `${CALENDAR_API_BASE}/events?maxResults=5&singleEvents=true`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (typeof data?.summary === 'string' && data.summary.includes('@')) {
        return data.summary.trim();
      }
      if (Array.isArray(data?.items)) {
        for (const item of data.items) {
          if (item?.creator?.self && typeof item.creator.email === 'string') {
            return item.creator.email;
          }
          if (item?.organizer?.self && typeof item.organizer.email === 'string') {
            return item.organizer.email;
          }
          if (Array.isArray(item?.attendees)) {
            const selfAttendee = item.attendees.find(
              (a: { self?: boolean; email?: string }) => a?.self && typeof a.email === 'string'
            );
            if (selfAttendee?.email) {
              return selfAttendee.email;
            }
          }
        }
      }
      if (typeof data?.summary === 'string' && data.summary.trim()) {
        return data.summary.trim();
      }
    }
  } catch {}
  return connectedEmail || 'Connected Google Account';
}

function formatTimeHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function buildLocationForGoogleEvent(meeting: CampusMeeting): string {
  const isOnlineOnly =
    meeting.format === 'online' ||
    meeting.isOnline ||
    !meeting.buildingCode ||
    meeting.buildingCode === 'ONLINE';

  if (isOnlineOnly) {
    return (meeting.onlineLink || meeting.rawLocation || 'Microsoft Teams').trim();
  }
  return `${meeting.buildingCode} ${meeting.roomNumber || ''}`.trim();
}

function buildGoogleEventPayload(meeting: CampusMeeting) {
  const startDate = new Date(`${meeting.date}T${meeting.startTime}:00`);
  const endDate = new Date(`${meeting.date}T${meeting.endTime}:00`);

  return {
    summary: meeting.title,
    location: buildLocationForGoogleEvent(meeting),
    description: meeting.notes || '',
    start: {
      dateTime: startDate.toISOString(),
    },
    end: {
      dateTime: endDate.toISOString(),
    },
    extendedProperties: {
      private: {
        questflow: '1',
        questflowId: meeting.id,
      },
    },
  };
}

export async function fetchGoogleEventsForDate(dateStr: string): Promise<CampusMeeting[]> {
  const startOfDay = new Date(`${dateStr}T00:00:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999`);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const resp = await googleApiFetch(`${CALENDAR_API_BASE}/events?${params.toString()}`);
  if (!resp.ok) {
    throw new Error('Could not load Google Calendar events.');
  }

  const data = await resp.json();

  if (
    (!connectedEmail || connectedEmail === 'Connected Google Account') &&
    typeof data?.summary === 'string' &&
    data.summary.trim()
  ) {
    connectedEmail = data.summary.trim();
    notifyListeners();
  }

  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const meetings: CampusMeeting[] = [];

  for (const item of items) {
    if (!item || !item.id || item.status === 'cancelled') continue;

    // Skip all-day events (they use start.date rather than start.dateTime)
    const startDateTimeStr = item.start?.dateTime;
    const endDateTimeStr = item.end?.dateTime;
    if (!startDateTimeStr || !endDateTimeStr) continue;

    // Skip declined events
    if (Array.isArray(item.attendees)) {
      const selfAttendee = item.attendees.find(
        (a: { self?: boolean; email?: string; responseStatus?: string }) =>
          a?.self ||
          (connectedEmail &&
            typeof a?.email === 'string' &&
            a.email.toLowerCase() === connectedEmail.toLowerCase())
      );
      if (selfAttendee?.responseStatus === 'declined') {
        continue;
      }
    }

    const startDate = new Date(startDateTimeStr);
    const endDate = new Date(endDateTimeStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

    const startLocalDate = `${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    if (startLocalDate !== dateStr) continue;

    const rawLocation =
      typeof item.location === 'string' && item.location.trim()
        ? item.location.trim()
        : typeof item.hangoutLink === 'string' && item.hangoutLink.trim()
        ? item.hangoutLink.trim()
        : '';

    const parsedLoc = parseLocationString(rawLocation);
    const privateProps = item.extendedProperties?.private || {};
    const isQuestFlowCreated = privateProps.questflow === '1';
    const questflowId =
      typeof privateProps.questflowId === 'string' && privateProps.questflowId.trim()
        ? privateProps.questflowId.trim()
        : undefined;

    const organizerEmail =
      typeof item.organizer?.displayName === 'string' && item.organizer.displayName.trim()
        ? item.organizer.displayName.trim()
        : typeof item.organizer?.email === 'string'
        ? item.organizer.email
        : undefined;

    meetings.push({
      id: questflowId || `gcal-${item.id}`,
      googleEventId: String(item.id),
      questflowCreated: isQuestFlowCreated,
      title:
        typeof item.summary === 'string' && item.summary.trim()
          ? item.summary.trim()
          : 'Untitled Meeting',
      date: dateStr,
      startTime: formatTimeHHMM(startDate),
      endTime: formatTimeHHMM(endDate),
      format: parsedLoc.isOnline ? 'online' : 'in_person',
      buildingCode: parsedLoc.buildingCode,
      roomNumber: parsedLoc.roomNumber,
      floor: parsedLoc.floor,
      rawLocation,
      isOnline: parsedLoc.isOnline,
      isUnparseableLocation: parsedLoc.isUnparseableLocation,
      organizer: organizerEmail,
      notes: typeof item.description === 'string' ? item.description : undefined,
      source: isQuestFlowCreated ? 'created' : 'imported',
    });
  }

  return meetings.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export async function createGoogleEvent(meeting: CampusMeeting): Promise<string> {
  const payload = buildGoogleEventPayload(meeting);
  const resp = await googleApiFetch(`${CALENDAR_API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error('Could not save meeting to Google Calendar.');
  }

  const data = await resp.json();
  if (!data?.id) {
    throw new Error('Google Calendar did not return an event ID.');
  }

  return String(data.id);
}

export async function updateGoogleEvent(meeting: CampusMeeting): Promise<void> {
  // Never edit events that were not created by QuestFlow
  if (!meeting.googleEventId || !meeting.questflowCreated) {
    return;
  }

  const payload = buildGoogleEventPayload(meeting);
  const resp = await googleApiFetch(
    `${CALENDAR_API_BASE}/events/${encodeURIComponent(meeting.googleEventId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    throw new Error('Could not update meeting in Google Calendar.');
  }
}

export async function deleteGoogleEvent(meeting: CampusMeeting): Promise<void> {
  // Never delete events that were not created by QuestFlow
  if (!meeting.googleEventId || !meeting.questflowCreated) {
    return;
  }

  const resp = await googleApiFetch(
    `${CALENDAR_API_BASE}/events/${encodeURIComponent(meeting.googleEventId)}`,
    {
      method: 'DELETE',
    }
  );

  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    throw new Error('Could not delete meeting from Google Calendar.');
  }
}
