export interface User {
  id: string;
  email: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

/**
 * Round 21 item 8: duplicate-register arrives as a 200-generic with no
 * session (`{registered: false, detail, token: none}`). The UI reads
 * `registered`/`detail` only — never treats this as authed.
 */
export interface RegisterDuplicate {
  registered: false;
  detail: string;
}

export interface UserProgress {
  add_source: boolean;
  search: boolean;
  export: boolean;
  review: boolean;
}

export interface GoogleStatus {
  enabled: boolean;
  client_id: string | null;
}
