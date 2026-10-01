import { apiFetch, j, jVoid, BASE } from "./client";
import type { ClassroomStatus, ClassroomSyncResult } from "./types";

export const getClassroomStatus = () =>
  apiFetch(`${BASE}/classroom/status`).then(j<ClassroomStatus>);

export const getClassroomAuthorizeUrl = () =>
  apiFetch(`${BASE}/classroom/authorize`).then(j<{ authorize_url: string }>);

export const syncClassroom = () =>
  apiFetch(`${BASE}/classroom/sync`, { method: "POST" }).then(j<ClassroomSyncResult>);

export const disconnectClassroom = () =>
  apiFetch(`${BASE}/classroom/connection`, { method: "DELETE" }).then(jVoid);
