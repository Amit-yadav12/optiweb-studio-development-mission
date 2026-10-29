import { cookies } from "next/headers";

export const SESSION_COOKIE = "ow_sid";

/**
 * Server-side read of the guest session cookie. Cookies cannot be *set* from a
 * server component, so the id is issued by the API layer (see /api/v1/session)
 * and only read here for display.
 */
export async function readGuestSession(): Promise<{ sessionId: string | null; shortCode: string | null }> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value || !/^[a-f0-9-]{16,64}$/i.test(value)) {
    return { sessionId: null, shortCode: null };
  }
  return { sessionId: value, shortCode: `${value.slice(0, 4)}…${value.slice(-4)}` };
}

export function sessionLabel(shortCode: string | null): string {
  return shortCode ? `Guest session ${shortCode}` : "Guest session — created on your first request";
}
