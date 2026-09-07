import {
  CommandName,
  ScmStep,
  STARQ_ERP_CANONICAL_METADATA,
} from '../../../contracts/commands';
import { getApiBaseUrl } from './auth';

export function getClientVersionHeaders(): Record<string, string> {
  const commit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';
  return {
    'x-client-version': STARQ_ERP_CANONICAL_METADATA.version,
    'x-client-release-track': STARQ_ERP_CANONICAL_METADATA.releaseTrack || 'stable',
    'x-client-commit': commit,
  };
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken(): string {
  if (csrfToken) return csrfToken;
  const match = document.cookie.match(/sb_ops_csrf=([^;]+)/);
  return match?.[1] ?? '';
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export interface ApiCommandParams<T> {
  command: CommandName;
  step?: ScmStep;
  payload: T;
}

export interface ApiResponse<T> {
  ok: boolean;
  state?: string;
  error?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(`API error ${status}: ${code}`);
    this.name = 'ApiError';
  }
}

export async function dispatchCommand<TReq = Record<string, unknown>, TRes = unknown>(
  params: ApiCommandParams<TReq>,
): Promise<TRes & { ok: boolean }> {
  const base = getApiBaseUrl();
  const idempotencyKey = generateIdempotencyKey();

  const body: Record<string, unknown> = {
    ...params.payload as Record<string, unknown>,
    type: params.command,
  };
  if (params.step) {
    body.scm_step = params.step;
  }

  const response = await fetch(`${base}/api/ops/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': idempotencyKey,
      'x-csrf-token': getCsrfToken(),
      ...getClientVersionHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? 'request_failed',
      data?.request_id,
    );
  }

  return data as TRes & { ok: boolean };
}

export async function apiGet<T>(path: string): Promise<T> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      ...getClientVersionHeaders(),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data?.error ?? 'request_failed');
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-csrf-token': getCsrfToken(),
      'x-idempotency-key': generateIdempotencyKey(),
      ...getClientVersionHeaders(),
    },
    body: JSON.stringify({ ...payload, csrf: getCsrfToken() }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'request_failed', data?.request_id);
  }

  return data as T;
}

export interface PlatformTenantRecord {
  organisation_id: string;
  slug: string;
  legal_name: string;
  organisation_status: 'active' | 'suspended' | 'closed';
  archetype_id: string;
  plan_code: string;
  subscription_status: string;
  provisioning_status: string;
  active_seats: number;
  schema_version: string;
  books: { id: string; code: string; name: string; is_default: boolean }[];
}

export interface ProvisionPlatformTenantPayload {
  slug: string;
  legal_name: string;
  archetype_id: string;
  book_code: string;
  book_name: string;
  owner_email: string;
  owner_name: string;
  plan_code?: string;
}

export async function getPlatformTenants(): Promise<{ ok: boolean; tenants: PlatformTenantRecord[] }> {
  return apiGet<{ ok: boolean; tenants: PlatformTenantRecord[] }>('/api/platform/tenants');
}

export async function provisionPlatformTenant(
  payload: ProvisionPlatformTenantPayload,
): Promise<{ ok: boolean; result: { organisation_id: string; book_id: string; owner_invitation_id: string; status: string } }> {
  return apiPost('/api/platform/tenants/provision', payload as unknown as Record<string, unknown>);
}

export async function setPlatformTenantStatus(
  organisationId: string,
  action: 'suspend' | 'reactivate',
  reason: string,
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  return apiPost(`/api/platform/tenants/${organisationId}/status`, { action, reason });
}

export interface OrganisationApplicationPayload {
  name: string;
  legal_name?: string;
  archetype_id: string;
  primary_book_name?: string;
  primary_book_code?: string;
  island: string;
  atoll: string;
  phone?: string;
}

export interface PlatformApplicationRecord {
  id: string;
  applicant_person_id: string;
  applicant_email: string;
  applicant_name: string;
  name: string;
  legal_name: string;
  archetype_id: string;
  primary_book_name: string;
  primary_book_code: string;
  island: string;
  atoll: string;
  phone?: string;
  status: 'pending' | 'approved' | 'rejected' | 'info_requested';
  notes?: string;
  rejection_reason?: string;
  info_request_note?: string;
  provisioned_organisation_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export async function submitOrganisationApplication(
  payload: OrganisationApplicationPayload
): Promise<{ ok: boolean; application: PlatformApplicationRecord; user?: any }> {
  return apiPost<{ ok: boolean; application: PlatformApplicationRecord; user?: any }>(
    '/api/onboarding/apply',
    payload as unknown as Record<string, unknown>
  );
}

export async function getApplicantApplication(): Promise<{ ok: boolean; application: PlatformApplicationRecord | null }> {
  return apiGet<{ ok: boolean; application: PlatformApplicationRecord | null }>('/api/onboarding/application');
}

export async function getPlatformApplications(): Promise<{ ok: boolean; applications: PlatformApplicationRecord[] }> {
  return apiGet<{ ok: boolean; applications: PlatformApplicationRecord[] }>('/api/platform/applications');
}

export async function approvePlatformApplication(
  applicationId: string
): Promise<{ ok: boolean; result: any }> {
  return apiPost<{ ok: boolean; result: any }>(
    `/api/platform/applications/${applicationId}/approve`,
    {}
  );
}

export async function rejectPlatformApplication(
  applicationId: string,
  reason: string
): Promise<{ ok: boolean; status: string }> {
  return apiPost<{ ok: boolean; status: string }>(
    `/api/platform/applications/${applicationId}/reject`,
    { reason }
  );
}

export async function requestInfoPlatformApplication(
  applicationId: string,
  note: string
): Promise<{ ok: boolean; status: string }> {
  return apiPost<{ ok: boolean; status: string }>(
    `/api/platform/applications/${applicationId}/request-info`,
    { note }
  );
}

export interface StaffInvitationRecord {
  id: string;
  organisation_id: string;
  email: string;
  name: string;
  role_id: string;
  job_title?: string;
  phone?: string;
  book_ids: string[];
  location_ids: string[];
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | 'cancelled';
  invited_by?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  persons?: {
    display_label?: string;
  };
}

export interface CreateStaffInvitationPayload {
  email: string;
  name: string;
  role_id: string;
  job_title?: string;
  phone?: string;
  book_ids?: string[];
  location_ids?: string[];
}

export async function getTenantInvitations(): Promise<{ ok: boolean; invitations: StaffInvitationRecord[] }> {
  return apiGet<{ ok: boolean; invitations: StaffInvitationRecord[] }>('/api/tenant/invitations');
}

export async function createTenantInvitation(
  payload: CreateStaffInvitationPayload
): Promise<{ ok: boolean; invitation: StaffInvitationRecord }> {
  return apiPost<{ ok: boolean; invitation: StaffInvitationRecord }>(
    '/api/tenant/invitations',
    payload as unknown as Record<string, unknown>
  );
}

export async function resendTenantInvitation(
  invitationId: string
): Promise<{ ok: boolean; invitation: StaffInvitationRecord }> {
  return apiPost<{ ok: boolean; invitation: StaffInvitationRecord }>(
    `/api/tenant/invitations/${invitationId}/resend`,
    {}
  );
}

export async function revokeTenantInvitation(
  invitationId: string
): Promise<{ ok: boolean; status: string }> {
  return apiPost<{ ok: boolean; status: string }>(
    `/api/tenant/invitations/${invitationId}/revoke`,
    {}
  );
}
