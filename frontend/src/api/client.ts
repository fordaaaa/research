import type { DownloadedFile } from "./types";

const TOKEN_KEY = "research_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);

export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/**
 * Humanizes a Retry-After wait for display: waits of a minute or more round
 * to minutes ("5 minutes"), shorter waits stay in seconds ("45 seconds"),
 * and an absent wait reads "shortly".
 */
export function humanizeRetryWait(wait: number | null | undefined): string {
  if (wait === null || wait === undefined) return "shortly";
  if (wait >= 60) {
    const minutes = Math.round(wait / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${wait} second${wait === 1 ? "" : "s"}`;
}

/** Rate-limit signal: carries the parsed Retry-After wait, if the server sent one. */
export class RateLimitError extends Error {
  retryAfterSeconds: number | null;
  status = 429 as const;

  constructor(retryAfterSeconds: number | null, message?: string) {
    super(
      message ??
        (retryAfterSeconds !== null
          ? `Too many attempts — try again in ${humanizeRetryWait(retryAfterSeconds)}`
          : "Too many attempts — try again shortly"),
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parses a Retry-After header (delta-seconds or HTTP-date) into seconds. */
export function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) return Math.max(0, Math.round((timestamp - Date.now()) / 1000));
  return null;
}

/**
 * Round 18 item 7 (422 audit): extracts a human-readable message from an
 * error body. FastAPI validation failures carry `detail` as an array of
 * `{loc, msg, type}` objects — rendering those raw leaks pydantic `loc`
 * voice (or "[object Object]" via Error coercion). String details pass
 * through; arrays join their `msg` fields; anything else falls back.
 */
export function detailMessage(body: unknown, fallback: string): string {
  if (typeof body === "string") return body || fallback;
  if (body && typeof body === "object") {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail || fallback;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) =>
          item && typeof item === "object" ? (item as { msg?: unknown }).msg : null,
        )
        .filter((msg): msg is string => typeof msg === "string" && msg.length > 0);
      if (msgs.length > 0) return msgs.join("; ");
      return fallback;
    }
    if (detail && typeof detail === "object") {
      const msg = (detail as { msg?: unknown }).msg;
      if (typeof msg === "string" && msg) return msg;
      return fallback;
    }
  }
  return fallback;
}

/**
 * Round 18 item 7 (422 audit): search failures render a friendly line, never
 * a raw validation payload. Anything carrying pydantic `loc` voice (or the
 * "[object Object]" of a coerced detail array) collapses to the friendly
 * fallback; honest messages ("login required", rate-limit waits) pass
 * through untouched.
 */
export function friendlySearchError(err: unknown, fallback = "Search failed — try again"): string {
  const message = err instanceof Error ? err.message : fallback;
  if (!message || /\[object Object\]|\bloc\b/i.test(message)) return fallback;
  return message;
}

export async function j<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) {
    const body = await res.json().catch(() => null) as unknown;
    throw new Error(detailMessage(body, `${res.status} ${res.statusText}`));
  }
  return res.json() as Promise<T>;
}

/** 401-aware check for empty (204/200-without-body) responses. */
export async function jVoid(res: Response): Promise<void> {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) {
    const body = await res.json().catch(() => null) as unknown;
    throw new Error(detailMessage(body, `${res.status} ${res.statusText}`));
  }
}

export const BASE = "/api";

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;]+)/i);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
      if (decoded) return decoded;
    } catch {
      // fall through to the plain filename= form below
    }
  }
  const quoted =
    header.match(/filename\s*=\s*"([^"]+)"/i) ?? header.match(/filename\s*=\s*([^;]+)/i);
  const name = quoted?.[1]?.trim().replace(/^"|"$/g, "");
  return name || fallback;
}

export async function fetchDownload(path: string, fallbackFilename: string): Promise<DownloadedFile> {
  const res = await apiFetch(path);
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("research:unauthorized"));
    throw new Error("login required");
  }
  if (res.status === 429) throw new RateLimitError(parseRetryAfter(res));
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as unknown;
    throw new Error(detailMessage(body, `${res.status} ${res.statusText}`));
  }
  const blob = await res.blob();
  const filename = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackFilename);
  return { blob, filename };
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFile(path: string, fallbackFilename: string): Promise<DownloadedFile> {
  const result = await fetchDownload(path, fallbackFilename);
  saveBlob(result.blob, result.filename);
  return result;
}
