export interface ClassroomStatus {
  enabled: boolean;
  connected: boolean;
  last_sync_at: string | null;
  reason: string | null;
}

export interface ClassroomSyncResult {
  classes_synced: number;
  assignments_synced: number;
  assignments_skipped: number;
}
