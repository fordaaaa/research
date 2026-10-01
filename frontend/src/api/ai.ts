import { apiFetch, j, jVoid, getToken, BASE } from "./client";
import type { AIProvider, AISettings, ChatMessage, ChatResponse, ChatSession } from "./types";

export const getAISettings = () => apiFetch(`${BASE}/settings/ai`).then(j<AISettings>);

export const saveAISettings = (apiKey: string, model: string, provider: AIProvider) =>
  apiFetch(`${BASE}/settings/ai`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model, provider }),
  }).then(j<AISettings>);

export const clearAISettings = () =>
  apiFetch(`${BASE}/settings/ai`, { method: "DELETE" }).then(jVoid);

export const askNotebook = (notebookId: string, message: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatResponse>);

export const listChatSessions = (notebookId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions`).then(j<ChatSession[]>);

export const createChatSession = (notebookId: string, title?: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  }).then(j<ChatSession>);

export const getChatSession = (notebookId: string, sessionId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}`).then(j<ChatSession>);

export const deleteChatSession = (notebookId: string, sessionId: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}`, { method: "DELETE" }).then(jVoid);

export const listChatMessages = (notebookId: string, sessionId: string, limit?: number, before?: string) => {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  if (before) params.set("before", before);
  const query = params.toString();
  return apiFetch(
    `${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}/messages${query ? `?${query}` : ""}`
  ).then(j<ChatMessage[]>);
};

export const sendChatMessage = (notebookId: string, sessionId: string, message: string) =>
  apiFetch(`${BASE}/notebooks/${notebookId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatMessage>);

export const getHostedAIStatus = () => {
  // Logged-out boot has no bearer token: skip the fetch (mirrors the api.me
  // gate) instead of firing an authed request that 401s as console noise.
  if (!getToken()) return Promise.resolve({ enabled: false, allowance_remaining: null });
  return apiFetch(`${BASE}/ai/hosted/status`).then(j<{ enabled: boolean; allowance_remaining: number | null }>);
};

export const sendHostedChatMessage = (notebookId: string, sessionId: string, message: string) =>
  apiFetch(`${BASE}/ai/hosted/notebooks/${notebookId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).then(j<ChatMessage>);
