export interface OperableBook {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  archetype_id: string;
}

export interface OperableOrganisation {
  id: string;
  slug: string;
  name: string;
  books?: OperableBook[];
}

export function getApiBaseUrl(): string {
  const custom = import.meta.env.VITE_API_URL;
  // An explicitly empty string means "same origin, no prefix" (relies on a
  // platform rewrite of /api/* to the backend) -- distinct from "unset",
  // which falls through to the direct cross-origin Supabase URL below.
  if (custom !== undefined) return custom.replace(/\/+$/, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.includes('localhost') && !supabaseUrl.includes('127.0.0.1')) {
    return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/starq-api`;
  }
  return '';
}

export interface UserSession {
  person_id: string;
  person_uuid?: string;
  name: string;
  email?: string;
  seats: string[];
  acting_as: string;
  seat_label: string;
  csrf: string;
  allowed_entities: string[];
  organisations?: OperableOrganisation[];
  current_organisation_id?: string | null;
  current_book_id?: string | null;
  platform_entitlement?: {
    operator_role: string;
    mfa_verified: boolean;
  } | null;
  application?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'info_requested';
    name: string;
    legal_name: string;
    created_at: string;
    rejection_reason?: string | null;
    info_request_note?: string | null;
    provisioned_organisation_id?: string | null;
  } | null;
}

export interface AuthState {
  session: UserSession | null;
  isLoading: boolean;
  error: string | null;
}

export async function fetchCurrentUser(): Promise<UserSession | null> {
  try {
    const base = getApiBaseUrl();
    const response = await fetch(`${base}/api/me`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.ok ? (data.user as UserSession) : null;
  } catch {
    return null;
  }
}

export async function loginWithGoogle(credential: string): Promise<UserSession> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-starq-client-kind': 'web',
    },
    body: JSON.stringify({ credential }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'login_failed');
  }

  return data.user as UserSession;
}

export async function logout(csrf: string): Promise<void> {
  const base = getApiBaseUrl();
  await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({ csrf }),
  });
}

export async function switchSeat(seat: string, csrf: string): Promise<UserSession> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/auth/seat`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({ seat, csrf }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'switch_seat_failed');
  }

  return data.user as UserSession;
}

export async function switchContext(
  params: { organisation_id?: string; book_id?: string },
  csrf: string
): Promise<UserSession> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/api/auth/context`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-csrf-token': csrf,
    },
    body: JSON.stringify({ ...params, csrf }),
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? 'switch_context_failed');
  }

  return data.user as UserSession;
}
