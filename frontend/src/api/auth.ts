import { apiFetch, clearToken, j, BASE } from "./client";
import type { AuthResult, GoogleStatus, RegisterDuplicate, User, UserProgress } from "./types";

export function isRegisterDuplicate(value: unknown): value is RegisterDuplicate {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { registered?: unknown }).registered === false
  );
}

export const register = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(j<AuthResult | RegisterDuplicate>);

export const login = (email: string, password: string) =>
  apiFetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => {
    // Bad credentials are not an expired session; keep the auth form visible.
    if (res.status === 401) throw new Error("Incorrect email or password");
    return j<AuthResult>(res);
  });

export const logout = () =>
  apiFetch(`${BASE}/auth/logout`, { method: "POST" }).then((r) => {
    clearToken();
    if (!r.ok && r.status !== 401) throw new Error(`${r.status} ${r.statusText}`);
  });

export const me = () => apiFetch(`${BASE}/auth/me`).then(j<User>);

/**
 * Round 20 item 2: per-user persisted checklist flags. Old servers without
 * this route reject (404/405/HTML) — callers catch and fall back to local.
 */
export const getProgress = () =>
  apiFetch(`${BASE}/me/progress`).then(j<UserProgress>);

export const googleStatus = () =>
  apiFetch(`${BASE}/auth/google/status`).then(j<GoogleStatus>);

export const googleLogin = (idToken: string) =>
  apiFetch(`${BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  }).then((res) => {
    if (res.status === 401) throw new Error("Google sign-in failed");
    return j<AuthResult>(res);
  });
