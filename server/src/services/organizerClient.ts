import axios from "axios";

/**
 * Thin pass-through to the organizer API.
 * Change the path strings in routes/organizer.ts tonight — not this client —
 * unless the auth scheme is unusual.
 */
export async function fetchOrganizer(path: string): Promise<unknown> {
  const base = process.env.ORGANIZER_API_URL?.trim();
  if (!base) {
    const error = new Error(
      "ORGANIZER_API_URL is empty. Set server/.env or stay on Demo Data.",
    );
    (error as Error & { status?: number }).status = 503;
    throw error;
  }

  const headers: Record<string, string> = {};
  const apiKey =
    process.env.ORGANIZER_API_KEY?.trim() ||
    process.env.ONESHEET_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error(
      "ORGANIZER_API_KEY / ONESHEET_API_KEY is empty on the server. Add it in Vercel → Settings → Environment Variables, then Redeploy.",
    );
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  const headerName =
    process.env.ORGANIZER_API_KEY_HEADER?.trim() ||
    process.env.ORGANIZER_AUTH_HEADER?.trim() ||
    "X-API-Key";
  const prefix =
    process.env.ORGANIZER_API_KEY_PREFIX ??
    (process.env.ORGANIZER_AUTH_SCHEME !== undefined
      ? process.env.ORGANIZER_AUTH_SCHEME.trim()
        ? `${process.env.ORGANIZER_AUTH_SCHEME.trim()} `
        : ""
      : "");
  headers[headerName] = `${prefix}${apiKey}`;

  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await axios.get(url, { headers, timeout: 15000 });
  return response.data;
}
