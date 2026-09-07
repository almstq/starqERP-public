import { createClient } from "npm:@supabase/supabase-js@2";
/**
 * The command contract is the single source of truth for authorization.
 * This boundary IMPORTS its decisions rather than restating them — a second
 * copy of the rules is exactly how the seat vocabulary drifted three ways.
 *
 * `_shared/commands.ts` is generated from `contracts/commands.ts` by
 * `scripts/sync-contract.mjs`, because Supabase bundles only what lives under
 * `supabase/functions/`. Never edit the generated copy.
 */
import {
  audienceIsValid,
  authorizeCommand,
  fromLegacyBody,
  SEATS,
  type AudiencePolicy,
  type Principal,
  type SeatCode,
} from "../_shared/commands.ts";
import { logRequest, severityFor } from "../_shared/observability.ts";
import { resolveInvoiceFinanceDecision, type InvoiceTaxLineResult } from "../_shared/invoiceFinance.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SESSION_SECRET = Deno.env.get("STARQBOOKS_SESSION_SECRET") ?? "";
// SERP-301 alert relay: an unattended poller has no human session cookie, so
// it cannot pass the `!session` gate below by design. It authenticates with
// a distinct shared secret instead, scoped to exactly one read-only route.
const ALERT_RELAY_SECRET = Deno.env.get("STARQBOOKS_ALERT_RELAY_SECRET") ?? "";
// GOOGLE_CLIENT_IDS (a combined allowlist across both platforms) was audit
// critical #5 and has been replaced by AUDIENCE_POLICIES, which maps exactly one
// audience to each client kind. Do not reintroduce a flat list of client ids.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "https://web-dhivashi.vercel.app",
  "https://web-eight-psi-92.vercel.app",
  "https://erp.starq.mv",
  "https://starq.mv",
];

const envOrigins = (Deno.env.get("STARQBOOKS_ALLOWED_ORIGINS") ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);

const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]);

// SERP-299: Fail-closed production check.
// Unless explicitly running in 'development', 'test', or 'local', we treat the environment as production.
const rawEnv = ((Deno.env.get("STARQ_ENV") || Deno.env.get("ENVIRONMENT")) ?? "").trim().toLowerCase();
const IS_PROD = rawEnv !== "development" && rawEnv !== "test" && rawEnv !== "local";
const ALLOW_PREVIEW_ORIGINS = Deno.env.get("STARQBOOKS_ALLOW_PREVIEW_ORIGINS") === "true";

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // SERP-299 / Founder ruling #1475: no wildcard production origin on credentialed routes.
  // Wildcard preview patterns are strictly confined to development/staging environments
  // or when explicitly opted in via STARQBOOKS_ALLOW_PREVIEW_ORIGINS.
  if (ALLOW_PREVIEW_ORIGINS || !IS_PROD) {
    if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) return true;
  }
  return false;
}
const COOKIE_NAME = "sb_ops";
const MAX_BODY_BYTES = 16_384;
const SESSION_SECONDS = 8 * 60 * 60;
/**
 * Seats this boundary may write.
 *
 * WIDENED TO THE FULL TWELVE, 22 Aug 2026 — step 2 of 3, now that step 1 is done.
 * Migration 202608210009 seeded quartermaster, receiver, stores and ledger_poster into
 * `public.seats` and was applied and verified against the live database on 22 August, so
 * the foreign key from `membership_seats.seat_code` can now accept all twelve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SET IS AN INTERSECTION FILTER, NOT A GRANT. It is easy to read it the other way.
 * ─────────────────────────────────────────────────────────────────────────────
 * establishPerson and refreshSessionAuthority compute:
 *
 *     memberSeats.map((r) => r.seat_code).filter((seat) => ALLOWED_SEATS.has(seat))
 *
 * so a seat has to be in the person's public.membership_seats AND in this set. Widening the set
 * gives nobody a seat they were not already granted in the database — it stops seats they
 * WERE granted from being silently discarded at sign-in.
 *
 * What the eight-seat version was actually doing, which is worse than "vocabulary drift":
 *
 * Named by SEAT, not by person — the people are real and this file is publishable (DEC-012).
 *
 *   storekeeper  allowlist [quartermaster, stores]        → both filtered out → seats.length 0
 *                                                         → throw no_active_seat.
 *                                                         THAT PERSON CANNOT SIGN IN AT ALL.
 *   MD           allowlist [managing_director, receiver,  → loses `receiver`, so they cannot take
 *                qc_signer, technician, counter]            a GRN once the matrix requires it
 *   director     allowlist [director, financial_          → loses `ledger_poster`
 *                controller, payer, ledger_poster,
 *                counter]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDER OF REPAIR — unchanged, and the reason it is not negotiable is now concrete
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. seed the four missing seats into public.seats   — DONE 22 Aug (202608210009)
 *   2. widen this constant to the contract's SEATS     — THIS CHANGE
 *   3. wire the matrix into api_garage_command         — 202608220011, written, NOT applied
 *
 * Step 3 before step 2 is the hard outage the original note warned about, and here is the
 * exact mechanism: 202608220011 makes PURCHASE/receive require the `receiver` seat. In tenant one
 * exactly ONE person holds `receiver`. With this constant still at eight, `receiver` is filtered
 * out of their session, so they hold no seat that can receive and the garage cannot book a delivery.
 *
 * So this constant must be DEPLOYED before 202608220011 is APPLIED. They are two different
 * systems with two different release paths, and nothing enforces the order but this note and
 * the test in tests/contract/.
 */
const DB_SEEDED_SEATS: readonly SeatCode[] = [...SEATS];
const ALLOWED_SEATS = new Set<string>(DB_SEEDED_SEATS);

/**
 * Every database call this boundary makes is bounded in time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — found 22 Aug 2026 while gating the Edge deploy
 * ─────────────────────────────────────────────────────────────────────────────
 * The deploy makes `refreshSessionAuthority` run on EVERY authenticated request,
 * so a database round-trip moved onto the hot path of a system whose users are
 * two people on shop wifi.
 *
 * AG traced the failure behaviour and got it right as far as it went: when the
 * RPC returns an error, `refreshSessionAuthority` returns null, the request 401s,
 * and the Flutter client drops cleanly to the login screen. Fails closed, does
 * not fail open, does not 500.
 *
 * But that trace answered "what happens on ERROR" and the question was "what
 * happens on TIMEOUT". Those were not the same thing here, because there was no
 * timeout to speak of:
 *
 *   - supabase-js issues its requests through `fetch`, which in Deno has no
 *     default timeout.
 *   - No AbortSignal was passed to the client. The only AbortController in this
 *     file guards the Google tokeninfo call at 5s.
 *
 * So a hung connection did not produce an error. It produced a WAIT — the
 * invocation sat there until the platform's wall clock killed it. From the shop
 * floor that is not "blips to the login screen", it is "the app is frozen".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE VALUE IS GENEROUS
 * ─────────────────────────────────────────────────────────────────────────────
 * A rejected session does not merely fail — it EVICTS the cookie (`Max-Age=0`),
 * so a spurious timeout does not degrade the session, it destroys it and forces
 * a full Google re-login. That asymmetry is the reason this is 10 seconds and
 * not 2: the cost of firing early is much higher than the cost of firing late.
 * A healthy RPC here returns in tens of milliseconds, so 10s only ever catches
 * a genuine hang.
 *
 * OPEN QUESTION, deliberately not answered in this change: whether a transient
 * database blip should destroy a session at all. The cookie is HMAC-signed and
 * independently authentic; being unable to CONFIRM authority right now is not
 * the same as the session being forged, and the current code treats them
 * identically. Changing that is a security-posture decision for the founder,
 * not a bug fix to slip into a timeout patch.
 */
const DB_TIMEOUT_MS = 10_000;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input: string | URL | Request, init?: RequestInit) => {
      // Respect a caller-supplied signal if one ever appears, rather than
      // silently overriding it.
      if (init?.signal) return fetch(input, init);
      return fetch(input, { ...init, signal: AbortSignal.timeout(DB_TIMEOUT_MS) });
    },
  },
});
const encoder = new TextEncoder();
const anonymousWindows = new Map<string, { count: number; resetAt: number }>();

type Json = Record<string, unknown>;
type OperableOrganisation = {
  id: string;
  slug: string;
  name: string;
  books?: {
    id: string;
    code: string;
    name: string;
    is_default: boolean;
    archetype_id: string;
  }[];
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function verifyHmac(value: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(value));
  } catch {
    return false;
  }
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signSession(session: Session): Promise<string> {
  const payload = base64Url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${await hmac(payload)}`;
}

async function readSession(req: Request, diag?: { reason?: string }): Promise<Session | null> {
  const raw = (req.headers.get("cookie") ?? "").split(";")
    .map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!raw) { if (diag) diag.reason = "no_cookie"; return null; }
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra || !await verifyHmac(payload, signature)) {
    if (diag) diag.reason = "bad_signature";
    return null;
  }
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) {
      if (diag) diag.reason = "expired";
      return null;
    }
    // SERP-401-F3: allow organisation_id to be absent for applicant sessions (zero orgs).
    // Tenant sessions still require a valid UUID; applicant sessions have organisation_id: null
    // and are distinguished downstream by the null value itself.
    if (session.organisation_id && !uuid(session.organisation_id)) {
      if (diag) diag.reason = "bad_org_uuid";
      return null;
    }
    if (!session.person_uuid) {
      if (diag) diag.reason = "no_person_uuid";
      return null;
    }
    // Tenant sessions must carry a seat; applicant sessions (organisation_id null) may have acting_as="" by design.
    if (session.organisation_id && !session.acting_as) {
      if (diag) diag.reason = "tenant_session_missing_seat";
      return null;
    }
    return session;
  } catch {
    if (diag) diag.reason = "payload_parse_error";
    return null;
  }
}

async function refreshSessionAuthority(session: Session, diag?: { reason?: string }): Promise<Session | null> {
  // SERP-401-F3 / SERP-404: applicants with zero organisations initially have no organisation_id.
  // When an application is approved (or staff invite accepted), memberships are provisioned.
  // We check whether the person is active, query latest application state & operator entitlement,
  // and if active memberships now exist, transition the session to the newly provisioned tenant.
  if (!session.organisation_id) {
    const { data: person, error: personError } = await db
      .from("persons")
      .select("id, status")
      .eq("id", session.person_uuid)
      .eq("status", "active")
      .maybeSingle();
    if (personError) {
      if (diag) diag.reason = `applicant_persons_lookup_error:${personError.message}`;
      return null;
    }
    if (!person) {
      if (diag) diag.reason = "applicant_person_not_found_or_inactive";
      return null;
    }

    // Refresh application status
    let application = session.application ?? null;
    try {
      const appLookup = await db.schema("platform").from("tenant_applications")
        .select("id, status, name, legal_name, created_at, rejection_reason, info_request_note, provisioned_organisation_id")
        .eq("applicant_person_id", session.person_uuid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (appLookup.data) {
        application = {
          id: appLookup.data.id,
          status: appLookup.data.status,
          name: appLookup.data.name,
          legal_name: appLookup.data.legal_name,
          created_at: appLookup.data.created_at,
          rejection_reason: appLookup.data.rejection_reason,
          info_request_note: appLookup.data.info_request_note,
          provisioned_organisation_id: appLookup.data.provisioned_organisation_id,
        };
      }
    } catch (err) {
      console.error("platform.tenant_applications lookup failed during refresh:", err instanceof Error ? err.message : err);
    }

    // Refresh platform entitlement
    let platformEntitlement = session.platform_entitlement ?? null;
    try {
      const operatorLookup = await db.schema("platform").from("operator_principals")
        .select("operator_role, active, mfa_required")
        .eq("person_id", session.person_uuid)
        .eq("active", true)
        .maybeSingle();
      if (operatorLookup.data) {
        platformEntitlement = {
          operator_role: operatorLookup.data.operator_role,
          mfa_verified: session.platform_entitlement?.mfa_verified ?? false,
        };
      } else {
        platformEntitlement = null;
      }
    } catch (err) {
      console.error("platform.operator_principals lookup failed during refresh:", err instanceof Error ? err.message : err);
    }

    // Check if memberships exist now (application approved or staff invite accepted)
    const membershipsRes = await db.from("memberships").select("id, organisation_id, role_id, organisations(id, slug, legal_name, status)")
      .eq("person_id", session.person_uuid)
      .eq("status", "active");
    const memberRows = [...(membershipsRes.data ?? [])];

    if (memberRows.length === 0) {
      return { ...session, seats: [], application, platform_entitlement: platformEntitlement };
    }

    // Provisioned! Resolve organizations and books
    const resolvedOrgs: NonNullable<Session["organisations"]> = [];
    const activeOrgIds = new Set<string>();
    for (const m of memberRows) {
      if (m.organisation_id) activeOrgIds.add(m.organisation_id as string);
    }

    for (const oId of activeOrgIds) {
      const orgRes = await db.from("organisations").select("id, slug, legal_name, status")
        .eq("id", oId).eq("status", "active").maybeSingle();
      if (orgRes.data) {
        const membership = memberRows.find((row) => row.organisation_id === oId);
        const bookMemberships = membership
          ? await db.from("book_memberships").select("book_id")
            .eq("organisation_id", oId).eq("membership_id", membership.id)
          : { data: [] as { book_id: string }[] };
        const allowedBookIds = (bookMemberships.data ?? []).map((row) => row.book_id);
        const booksRes = allowedBookIds.length > 0
          ? await db.from("books").select("id, code, name, is_default, archetype_id, status")
            .eq("organisation_id", oId).in("id", allowedBookIds).eq("status", "active")
            .order("is_default", { ascending: false })
          : { data: [] as { id: string; code: string; name: string; is_default: boolean; archetype_id: string }[] };

        resolvedOrgs.push({
          id: orgRes.data.id,
          slug: orgRes.data.slug,
          name: orgRes.data.legal_name,
          books: (booksRes.data ?? []).map((b) => ({
            id: b.id,
            code: b.code,
            name: b.name,
            is_default: b.is_default,
            archetype_id: b.archetype_id,
          })),
        });
      }
    }

    const primaryOrgId = resolvedOrgs[0]?.id ?? null;
    let defaultBookId: string | null = null;
    if (primaryOrgId) {
      const allowedBooks = resolvedOrgs.find((o) => o.id === primaryOrgId)?.books ?? [];
      defaultBookId = allowedBooks.find((b) => b.is_default)?.id ?? allowedBooks[0]?.id ?? null;
    }

    // Resolve seats for primary org
    let seats: string[] = [];
    const activeMember = memberRows.find((m) => m.organisation_id === primaryOrgId);
    if (activeMember?.id) {
      const { data: memberSeats } = await db.from("membership_seats")
        .select("seat_code")
        .eq("membership_id", activeMember.id)
        .is("revoked_at", null);
      if (memberSeats && memberSeats.length > 0) {
        seats = [...new Set(memberSeats.map((r) => r.seat_code).filter((s) => ALLOWED_SEATS.has(s)))];
      }
    }
    const preferred = seats[0] ?? "";

    return {
      ...session,
      organisation_id: primaryOrgId,
      book_id: defaultBookId,
      seats,
      acting_as: preferred,
      allowed_entities: resolvedOrgs.map((o) => o.slug),
      organisations: resolvedOrgs,
      platform_entitlement: platformEntitlement,
      application,
    };
  }

  const { data, error } = await db.rpc("api_session_authority", {
    target_org: session.organisation_id,
    target_person: session.person_uuid,
    target_seat: session.acting_as,
  });
  if (error) {
    if (diag) diag.reason = `api_session_authority_rpc_error:${error.message}`;
    return null;
  }
  if (!data || typeof data !== "object") {
    if (diag) diag.reason = "api_session_authority_empty_response";
    return null;
  }
  const authority = data as { active?: unknown; seats?: unknown };
  const seats = Array.isArray(authority.seats)
    ? authority.seats.filter((seat): seat is string => typeof seat === "string")
    : [];
  if (authority.active !== true) {
    if (diag) diag.reason = "api_session_authority_inactive";
    return null;
  }
  if (!seats.includes(session.acting_as)) {
    if (diag) diag.reason = "seat_not_in_authority_seats";
    return null;
  }
  return { ...session, seats };
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, x-csrf-token, x-idempotency-key, x-starq-client-kind",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "vary": "Origin",
  };
  if (origin && isOriginAllowed(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function json(status: number, body: Json, origin: string | null, extra: HeadersInit = {}): Response {
  const headers = new Headers(corsHeaders(origin));
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function cookie(value: string, maxAge = SESSION_SECONDS): string {
  /**
   * SameSite=None, and it is not a downgrade made casually.
   *
   * The web client is served from a DIFFERENT SITE to this API — localhost:8080 or a
   * Vercel domain, against <ref>.supabase.co. Every authenticated call is therefore a
   * cross-site request, and a `SameSite=Strict` cookie is never sent on one. The result
   * was a session that authenticated perfectly and then evaporated: login succeeded and
   * set the cookie, the very next request arrived without it, refreshSessionAuthority saw
   * no session, returned 401, and the client bounced to the login screen about a second
   * after reaching the app. The database was correct the whole time — 22 Aug 2026.
   *
   * WHAT STILL PROTECTS THIS, because SameSite is not the only lock on the door:
   *   · a CSRF token is required on every state-changing route (seat switch, ops event,
   *     logout) and is compared against the value held in the signed session
   *   · CORS is an explicit origin allowlist, so a hostile page cannot read a response
   *     even if it manages to provoke one
   *   · the cookie stays HttpOnly and Secure, so script cannot read it and it never
   *     travels in clear
   *   · every request re-checks authority against the database, so a stolen session
   *     stops working the moment the seat is revoked
   *
   * Android is unaffected: it stores the cookie itself and sends it as an explicit header,
   * where SameSite has no meaning.
   *
   * KNOWN LIMIT, worth planning for rather than discovering: this is a third-party cookie
   * from the browser's point of view, and Chrome is phasing those out. The durable fix is
   * to stop using a cookie on web and carry the session in an Authorization header. That
   * is a real change to both sides and should be done deliberately, not folded into a
   * one-line unblock at midnight.
   */
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;
}

function routePath(url: string): string {
  const path = new URL(url).pathname;
  const marker = "/starq-api";
  const at = path.indexOf(marker);
  return at >= 0 ? path.slice(at + marker.length) || "/" : path;
}

function sourceKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "unknown").split(",")[0].trim();
}

function anonymousRateAllowed(key: string): boolean {
  const now = Date.now();
  const current = anonymousWindows.get(key);
  if (!current || current.resetAt <= now) {
    anonymousWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  current.count += 1;
  return current.count <= 20;
}

async function securityEvent(
  req: Request,
  eventType: string,
  outcome: "accepted" | "rejected" | "blocked" | "error",
  session: Session | null,
  metadata: Json = {},
  /**
   * SERP-301 — the request id, so this row and the id the caller was handed can
   * actually be joined. Until now a `request_id` was minted per request and
   * returned in error bodies but NEVER reached this table: the operator had
   * rows with no request id, the user had a request id with no row, and support
   * had a correlation id that correlated nothing. Optional so the existing call
   * sites keep compiling; every one of them now passes it.
   */
  requestId?: string,
): Promise<void> {
  try {
    const sourceHash = await hash(sourceKey(req));
    await db.from("security_events").insert({
      organisation_id: session?.organisation_id ?? null,
      principal_kind: session ? "human" : "anonymous",
      principal_ref: session?.person_key ?? null,
      event_type: eventType,
      outcome,
      source_hash: sourceHash,
      request_id: requestId && uuid(requestId) ? requestId : null,
      metadata: requestId ? { ...(metadata as Record<string, unknown>), request_id: requestId } : metadata,
    });
  } catch (err) {
    // The API response must never disclose credentials or database detail --
    // this stays a silent no-op from the caller's perspective. But a broken
    // audit log with zero visibility is exactly the blind spot that let
    // tonight's incident go undiagnosed for hours; console.error only reaches
    // Supabase's own function logs, never any client response.
    console.error(`securityEvent insert failed for event_type=${eventType}:`, err instanceof Error ? err.message : err);
  }
}

// Plain `===` on secrets leaks timing information proportional to the
// matching prefix length. This walks the full length of both operands
// regardless of where they first differ.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

async function readJson(req: Request): Promise<Json> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const text = await req.text();
  if (encoder.encode(text).length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const value = text ? JSON.parse(text) : {};
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid_json_object");
  return value as Json;
}

/**
 * AUDIT CRITICAL #5 — platform audience isolation.
 *
 * One audience per client kind, never a list. The previous code accepted any
 * `aud` present in a combined allowlist, so a web request could present an
 * Android-audience token and be accepted; `x-starq-client-kind` was read but
 * did not select anything.
 *
 * An absent or unknown client kind is refused rather than defaulted —
 * defaulting is how the hole existed in the first place.
 */
const AUDIENCE_POLICIES: readonly AudiencePolicy[] = [
  { clientKind: "web", audience: Deno.env.get("STARQBOOKS_GOOGLE_CLIENT_ID") ?? "" },
  { clientKind: "android", audience: Deno.env.get("STARQBOOKS_GOOGLE_ANDROID_CLIENT_ID") ?? "" },
].filter((p) => p.audience) as readonly AudiencePolicy[];

async function verifyGoogleToken(
  credential: string,
  clientKind: string | null,
): Promise<{ sub: string; email: string; name: string }> {
  if (!credential || credential.length > 4096 || AUDIENCE_POLICIES.length === 0) throw new Error("identity_configuration_error");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const endpoint = new URL("https://oauth2.googleapis.com/tokeninfo");
    endpoint.searchParams.set("id_token", credential);
    const response = await fetch(endpoint, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error("invalid_google_token");
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 16_384) throw new Error("identity_response_too_large");
    const claims = await response.json() as Record<string, string>;
    // The declared platform selects exactly ONE acceptable audience. A token
    // valid for the other platform is refused even though it is otherwise good.
    if (!audienceIsValid(clientKind, claims.aud, AUDIENCE_POLICIES).ok) {
      throw new Error("identity_audience_rejected");
    }
    if (claims.email_verified !== "true" || !claims.sub || !claims.email) {
      throw new Error("identity_claims_rejected");
    }
    return { sub: claims.sub, email: claims.email.toLowerCase(), name: claims.name ?? claims.email };
  } finally {
    clearTimeout(timer);
  }
}

interface Session {
  person_uuid: string;
  person_key: string;
  display_label: string;
  email: string;
  organisation_id: string | null;
  book_id: string | null;
  seats: string[];
  acting_as: string;
  csrf: string;
  exp: number;
  allowed_entities?: string[];
  organisations?: OperableOrganisation[];
  platform_entitlement?: {
    operator_role: "platform_support" | "platform_admin";
    mfa_verified: boolean;
  } | null;
  application?: {
    id: string;
    status: "pending" | "approved" | "rejected" | "info_requested";
    name: string;
    legal_name: string;
    created_at: string;
    rejection_reason?: string | null;
    info_request_note?: string | null;
    provisioned_organisation_id?: string | null;
  } | null;
}

async function establishPerson(claims: { sub: string; email: string; name: string }): Promise<Session> {
  const normalizedEmail = claims.email.trim().toLowerCase();

  // 1. Identity lookup or creation in public.persons
  let personUuid: string;
  let personKey: string;
  let displayLabel: string;

  const existingBySub = await db.from("persons").select("id, person_key, display_label, status, verified_email")
    .eq("external_subject", claims.sub).maybeSingle();

  if (existingBySub.data) {
    personUuid = existingBySub.data.id as string;
    personKey = existingBySub.data.person_key;
    displayLabel = existingBySub.data.display_label ?? claims.name;
    if (existingBySub.data.verified_email !== normalizedEmail) {
      const identityUpdate = await db.from("persons").update({ verified_email: normalizedEmail })
        .eq("id", personUuid)
        .eq("external_subject", claims.sub);
      if (identityUpdate.error) throw new Error("identity_email_binding_failed");
    }
  } else {
    // Lookup by verified email for pre-seeded pilot staff or invited users
    const existingByEmail = await db.from("persons").select("id, person_key, display_label, status, external_subject")
      .eq("verified_email", normalizedEmail).maybeSingle();

    if (existingByEmail.data) {
      if (existingByEmail.data.external_subject && existingByEmail.data.external_subject !== claims.sub) {
        throw new Error("identity_binding_conflict");
      }
      const identityUpdate = await db.from("persons").update({
        external_subject: claims.sub,
        status: "active",
      }).eq("id", existingByEmail.data.id);
      if (identityUpdate.error) throw new Error("identity_write_failed");
      personUuid = existingByEmail.data.id as string;
      personKey = existingByEmail.data.person_key;
      displayLabel = existingByEmail.data.display_label ?? claims.name;
    } else {
      // New person signing in with verified Google account
      const newKey = `user-${normalizedEmail.split("@")[0].replace(/[^a-z0-9_-]/gi, "").toLowerCase() || crypto.randomUUID().slice(0, 8)}`;
      const personWrite = await db.from("persons").insert({
        person_key: newKey,
        external_subject: claims.sub,
        verified_email: normalizedEmail,
        display_label: claims.name,
        status: "active",
      }).select("id, person_key").single();
      if (personWrite.error) throw new Error("identity_write_failed");
      personUuid = personWrite.data.id as string;
      personKey = personWrite.data.person_key as string;
      displayLabel = claims.name;
    }
  }

  // 2. Platform operator entitlement resolution (platform.operator_principals)
  let platformEntitlement: Session["platform_entitlement"] = null;
  try {
    const operatorLookup = await db.schema("platform").from("operator_principals")
      .select("operator_role, active, mfa_required")
      .eq("person_id", personUuid)
      .eq("active", true)
      .maybeSingle();

    if (operatorLookup.data) {
      platformEntitlement = {
        operator_role: operatorLookup.data.operator_role,
        mfa_verified: false,
      };
    }
  } catch (err) {
    // Platform schema isolation: absence of platform entitlement must not
    // block ordinary login. But a real query/permission error here silently
    // meant a real operator could lose their entitlement with zero trail.
    console.error("platform.operator_principals lookup failed during login:", err instanceof Error ? err.message : err);
  }

  // 2b. Auto-accept pending staff invitations for this verified Google email (SERP-286)
  try {
    const pendingInvites = await db.from("invitations")
      .select("id, organisation_id, role_id, email")
      .eq("status", "pending")
      .ilike("email", normalizedEmail)
      .gt("expires_at", new Date().toISOString());

    if (pendingInvites.data && pendingInvites.data.length > 0) {
      for (const invite of pendingInvites.data) {
        await db.rpc("accept_staff_invitation", {
          p_invitation_id: invite.id,
          p_authenticated_person_id: personUuid,
        });
      }
    }
  } catch (err) {
    // Non-blocking: a login must not fail because invitation acceptance did.
    // But silently means a real staff invite could fail to attach with no trail.
    console.error("staff invitation auto-accept failed during login:", err instanceof Error ? err.message : err);
  }

  // 3. Resolve organizations and memberships dynamically from database
  const membershipsRes = await db.from("memberships").select("id, organisation_id, role_id, organisations(id, slug, legal_name, status)")
    .eq("person_id", personUuid)
    .eq("status", "active");

  const memberRows = [...(membershipsRes.data ?? [])];
  const orgId: string | null = memberRows[0]?.organisation_id as string ?? null;

  // Resolve seats dynamically from membership_seats
  let seats: string[] = [];
  if (orgId) {
    const activeMember = memberRows.find((m) => m.organisation_id === orgId);
    if (activeMember?.id) {
      const { data: memberSeats } = await db.from("membership_seats")
        .select("seat_code")
        .eq("membership_id", activeMember.id)
        .is("revoked_at", null);
      if (memberSeats && memberSeats.length > 0) {
        seats = [...new Set(memberSeats.map((r) => r.seat_code).filter((s) => ALLOWED_SEATS.has(s)))];
      }
    }
  }

  // Resolve all organizations with their books
  const resolvedOrgs: NonNullable<Session["organisations"]> = [];
  const activeOrgIds = new Set<string>();
  if (orgId) activeOrgIds.add(orgId);
  for (const m of memberRows) {
    if (m.organisation_id) activeOrgIds.add(m.organisation_id as string);
  }

  for (const oId of activeOrgIds) {
    const orgRes = await db.from("organisations").select("id, slug, legal_name, status")
      .eq("id", oId).eq("status", "active").maybeSingle();
    if (orgRes.data) {
      const membership = memberRows.find((row) => row.organisation_id === oId);
      const bookMemberships = membership
        ? await db.from("book_memberships").select("book_id")
          .eq("organisation_id", oId).eq("membership_id", membership.id)
        : { data: [] as { book_id: string }[] };
      const allowedBookIds = (bookMemberships.data ?? []).map((row) => row.book_id);
      const booksRes = allowedBookIds.length > 0
        ? await db.from("books").select("id, code, name, is_default, archetype_id, status")
          .eq("organisation_id", oId).in("id", allowedBookIds).eq("status", "active")
          .order("is_default", { ascending: false })
        : { data: [] as { id: string; code: string; name: string; is_default: boolean; archetype_id: string }[] };

      resolvedOrgs.push({
        id: orgRes.data.id,
        slug: orgRes.data.slug,
        name: orgRes.data.legal_name,
        books: (booksRes.data ?? []).map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          is_default: b.is_default,
          archetype_id: b.archetype_id,
        })),
      });
    }
  }

  // Resolve default active book
  let defaultBookId: string | null = null;
  if (orgId) {
    const allowedBooks = resolvedOrgs.find((organisation) => organisation.id === orgId)?.books ?? [];
    defaultBookId = allowedBooks.find((book) => book.is_default)?.id ?? allowedBooks[0]?.id ?? null;
  }

  // 4. Resolve applicant's pending/latest business application
  let application: Session["application"] = null;
  try {
    const appLookup = await db.schema("platform").from("tenant_applications")
      .select("id, status, name, legal_name, created_at, rejection_reason, info_request_note, provisioned_organisation_id")
      .eq("applicant_person_id", personUuid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appLookup.data) {
      application = {
        id: appLookup.data.id,
        status: appLookup.data.status,
        name: appLookup.data.name,
        legal_name: appLookup.data.legal_name,
        created_at: appLookup.data.created_at,
        rejection_reason: appLookup.data.rejection_reason,
        info_request_note: appLookup.data.info_request_note,
        provisioned_organisation_id: appLookup.data.provisioned_organisation_id,
      };
    }
  } catch (err) {
    // Platform schema isolation: absence of an application must not block
    // login. But a real query error here silently means a real applicant's
    // pending/rejected application state goes missing from their session
    // with zero trail -- directly adjacent to tonight's apply-flow incident.
    console.error("platform.tenant_applications lookup failed during login:", err instanceof Error ? err.message : err);
  }

  const preferred = seats[0] ?? "";

  return {
    person_uuid: personUuid,
    person_key: personKey!,
    display_label: displayLabel,
    email: normalizedEmail,
    organisation_id: orgId ?? resolvedOrgs[0]?.id ?? null,
    book_id: defaultBookId,
    seats,
    acting_as: preferred,
    csrf: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    allowed_entities: resolvedOrgs.map((o) => o.slug),
    organisations: resolvedOrgs,
    platform_entitlement: platformEntitlement,
    application,
  };
}

function userDto(session: Session): Json {
  return {
    person_id: session.person_key,
    person_uuid: session.person_uuid,
    name: session.display_label,
    email: session.email,
    seats: session.seats,
    acting_as: session.acting_as,
    seat_label: session.acting_as.replaceAll("_", " "),
    csrf: session.csrf,
    allowed_entities: session.allowed_entities ?? [],
    organisations: session.organisations ?? [],
    current_organisation_id: session.organisation_id,
    current_book_id: session.book_id ?? null,
    platform_entitlement: session.platform_entitlement ?? null,
    application: session.application ?? null,
  };
}

function csrfValid(req: Request, body: Json, session: Session): boolean {
  const header = req.headers.get("x-csrf-token") ?? "";
  const payload = typeof body.csrf === "string" ? body.csrf : "";
  return (header || payload) === session.csrf;
}

function uuid(value: string | null): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * SERP-301 — what the request actually did, for the log line.
 *
 * The wrapper below cannot read the outcome out of a Response without consuming
 * its body, so the handler records it here as it goes. `outcome` stays "ok"
 * unless something refuses.
 */
interface Observed {
  outcome: string;
  personUuid: string | null;
  organisationId: string | null;
}

async function handleRequest(req: Request, requestId: string, observed: Observed): Promise<Response> {
  const origin = req.headers.get("origin");
  const path = routePath(req.url);

  /**
   * Refuse, RECORD, and return — in that order, in one place.
   *
   * Before SERP-301 this boundary returned `csrf_mismatch` from THIRTEEN
   * separate places and none of them recorded anything. Nor did origin_denied,
   * seat_not_granted, organisation_access_denied or book_access_denied. The
   * system had a security_events table, a securityEvent() helper, and the
   * highest-signal events it can possibly observe — a rejected CSRF token,
   * somebody reaching for an organisation they do not belong to — were dropped
   * at the point of observation. Built, never wired: the signature defect of
   * this codebase.
   *
   * It is a helper rather than thirteen added lines because thirteen added
   * lines become fourteen silent returns the next time somebody adds a route.
   */
  const deny = async (
    status: number,
    code: string,
    session: Session | null = null,
    metadata: Json = {},
  ): Promise<Response> => {
    observed.outcome = code;
    await securityEvent(req, `api.${code}`, status === 429 ? "blocked" : "rejected", session,
      { ...(metadata as Record<string, unknown>), path } as Json, requestId);
    return json(status, { ok: false, error: code, request_id: requestId }, origin);
  };
  if (origin && !isOriginAllowed(origin)) return await deny(403, "origin_denied", null, { origin });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!anonymousRateAllowed(sourceKey(req))) {
    observed.outcome = "rate_limited";
    await securityEvent(req, "api.rate_limit", "blocked", null, { path } as Json, requestId);
    return json(429, { ok: false, error: "rate_limited", request_id: requestId }, origin, { "retry-after": "60" });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_KEY || SESSION_SECRET.length < 32) throw new Error("server_configuration_error");
    if (req.method === "GET" && (path === "/" || path === "/health" || path === "/api/meta")) {
      const readiness = await db.from("organisations").select("id", { count: "exact", head: true })
        .eq("status", "active");
      if (readiness.error || (readiness.count ?? 0) < 1) throw new Error("database_not_ready");
      return json(200, { ok: true, service: "starqERP", api_version: "0.2.0", database: "ready" }, origin);
    }

    if (req.method === "POST" && path === "/api/auth/google") {
      const body = await readJson(req);
      // The client declares its platform in a header; the header selects which
      // single Google audience is acceptable. It is not advisory.
      const claims = await verifyGoogleToken(
        String(body.credential ?? ""),
        req.headers.get("x-starq-client-kind"),
      );
      const session = await establishPerson(claims);
      const signed = await signSession(session);
      await securityEvent(req, "auth.google", "accepted", session);
      return json(200, { ok: true, user: userDto(session) }, origin, { "set-cookie": cookie(signed) });
    }

    // SERP-301 alert relay — deliberately dispatched BEFORE the session gate
    // below. This route is polled by an unattended process with no human
    // session cookie; placing it after `if (!session) return 401` would
    // reject every call unconditionally, which is exactly the mistake this
    // comment exists to stop a future edit from reintroducing.
    if (req.method === "GET" && path === "/admin/security-events/recent") {
      const providedSecret = req.headers.get("x-starq-relay-secret") ?? "";
      if (!ALERT_RELAY_SECRET || !timingSafeEqual(providedSecret, ALERT_RELAY_SECRET)) {
        return await deny(401, "relay_unauthenticated");
      }
      const sinceParam = new URL(req.url).searchParams.get("since");
      const since = sinceParam && !Number.isNaN(Date.parse(sinceParam))
        ? sinceParam
        : new Date(Date.now() - 15 * 60_000).toISOString();
      const recent = await db.from("security_events")
        .select("id, organisation_id, principal_kind, event_type, outcome, request_id, metadata, occurred_at")
        .neq("outcome", "accepted")
        .gt("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (recent.error) throw new Error("database_not_ready");
      return json(200, { ok: true, since, events: recent.data ?? [] }, origin);
    }

    const diag: { reason?: string } = {};
    const signedSession = await readSession(req, diag);
    const session = signedSession ? await refreshSessionAuthority(signedSession, diag) : null;
    // SERP-301 — person_uuid and organisation_id on every subsequent log line.
    // The person UUID, never an email or a name: an operational log is not a
    // place to accumulate a directory of the client's staff.
    if (session) {
      observed.personUuid = session.person_uuid;
      observed.organisationId = session.organisation_id ?? null;
    }
    if (!session) {
      observed.outcome = "unauthenticated";
      await securityEvent(req, "auth.session", "rejected", null, { path, reason: diag.reason ?? "unknown" }, requestId);
      return json(401, { ok: false, error: "unauthenticated", request_id: requestId }, origin, {
        "set-cookie": cookie("", 0),
      });
    }

    if (req.method === "GET" && path === "/api/me") {
      if (session.organisation_id) {
        try {
          const operatorLookup = await db.schema("platform").from("operator_principals")
            .select("operator_role, active, mfa_required")
            .eq("person_id", session.person_uuid)
            .eq("active", true)
            .maybeSingle();
          if (operatorLookup.data) {
            session.platform_entitlement = {
              operator_role: operatorLookup.data.operator_role,
              mfa_verified: session.platform_entitlement?.mfa_verified ?? false,
            };
          } else {
            session.platform_entitlement = null;
          }
        } catch (err) {
          console.error("platform.operator_principals lookup failed during /api/me:", err instanceof Error ? err.message : err);
        }

        try {
          const appLookup = await db.schema("platform").from("tenant_applications")
            .select("id, status, name, legal_name, created_at, rejection_reason, info_request_note, provisioned_organisation_id")
            .eq("applicant_person_id", session.person_uuid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (appLookup.data) {
            session.application = {
              id: appLookup.data.id,
              status: appLookup.data.status,
              name: appLookup.data.name,
              legal_name: appLookup.data.legal_name,
              created_at: appLookup.data.created_at,
              rejection_reason: appLookup.data.rejection_reason,
              info_request_note: appLookup.data.info_request_note,
              provisioned_organisation_id: appLookup.data.provisioned_organisation_id,
            };
          }
        } catch (err) {
          console.error("platform.tenant_applications lookup failed during /api/me:", err instanceof Error ? err.message : err);
        }
      }

      const signed = await signSession(session);
      return json(200, { ok: true, user: userDto(session) }, origin, {
        "set-cookie": cookie(signed),
      });
    }

    if (req.method === "POST" && path === "/api/auth/logout") {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
      await securityEvent(req, "auth.logout", "accepted", session);
      return json(200, { ok: true }, origin, { "set-cookie": cookie("", 0) });
    }

    if (req.method === "POST" && path === "/api/auth/seat") {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
      const seat = String(body.seat ?? "");
      if (!session.seats.includes(seat)) return await deny(403, "seat_not_granted", session);
      const updated: Session = { ...session, acting_as: seat, csrf: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
      await securityEvent(req, "auth.seat", "accepted", updated, { seat });
      return json(200, { ok: true, user: userDto(updated) }, origin, { "set-cookie": cookie(await signSession(updated)) });
    }

    if (req.method === "POST" && (path === "/api/auth/context" || path === "/api/auth/switch-context")) {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
      const targetOrgId = String(body.organisation_id ?? session.organisation_id);
      const targetBookId = body.book_id ? String(body.book_id) : session.book_id;

      const orgCheck = await db.from("organisations").select("id, slug, legal_name").eq("id", targetOrgId).eq("status", "active").maybeSingle();
      if (!orgCheck.data) return await deny(403, "organisation_access_denied", session);

      const membershipCheck = await db.from("memberships").select("id")
        .eq("organisation_id", targetOrgId)
        .eq("person_id", session.person_uuid)
        .eq("status", "active")
        .maybeSingle();
      if (!membershipCheck.data) return await deny(403, "organisation_access_denied", session);
      const membershipId = membershipCheck.data.id;

      if (!targetBookId) return await deny(403, "book_access_denied", session);
      const bookMembershipCheck = await db.from("book_memberships").select("id")
        .eq("organisation_id", targetOrgId)
        .eq("membership_id", membershipId)
        .eq("book_id", targetBookId)
        .maybeSingle();
      if (!bookMembershipCheck.data) return await deny(403, "book_access_denied", session);

      const updated: Session = {
        ...session,
        organisation_id: targetOrgId,
        book_id: targetBookId,
        csrf: crypto.randomUUID(),
        exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      };
      await securityEvent(req, "auth.switch_context", "accepted", updated, { target_org: targetOrgId, target_book: targetBookId });
      return json(200, { ok: true, user: userDto(updated) }, origin, { "set-cookie": cookie(await signSession(updated)) });
    }

    // =========================================================================
    // Onboarding & Business Registration Application Routes (Applicant Scope)
    // =========================================================================
    if (req.method === "POST" && path === "/api/onboarding/apply") {
      const killSwitch = Deno.env.get("ONBOARDING_APPLICATIONS_DISABLED") === "true";
      if (killSwitch) {
        return json(503, { ok: false, error: "onboarding_disabled", message: "Organisation registration is temporarily paused for scheduled maintenance." }, origin);
      }

      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

      const name = String(body.name ?? "").trim();
      if (!name) return json(400, { ok: false, error: "business_name_required" }, origin);

      const legalName = String(body.legal_name ?? "").trim() || `${name} Pvt Ltd`;
      const archetypeId = String(body.archetype_id ?? "general_business");
      const primaryBookName = String(body.primary_book_name ?? name).trim();
      let rawBookCode = String(body.primary_book_code ?? name.slice(0, 3)).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (rawBookCode.length < 2) rawBookCode = (rawBookCode + "MAIN").slice(0, 4);
      if (rawBookCode.length > 8) rawBookCode = rawBookCode.slice(0, 8);
      const primaryBookCode = rawBookCode;
      const island = String(body.island ?? "Male'").trim();
      const atoll = String(body.atoll ?? "Kaafu Atoll").trim();
      const phone = body.phone ? String(body.phone).trim() || null : null;
      const applicantName = session.display_label || session.email?.split("@")[0] || "Applicant";

      const { data: appData, error: appError } = await db.schema("platform").from("tenant_applications").insert({
        applicant_person_id: session.person_uuid,
        applicant_email: session.email,
        applicant_name: applicantName,
        name,
        legal_name: legalName,
        archetype_id: archetypeId,
        primary_book_name: primaryBookName,
        primary_book_code: primaryBookCode,
        island,
        atoll,
        phone,
        status: "pending",
      }).select("id, status, name, legal_name, created_at").single();

      if (appError || !appData) {
        // The real Postgres error (constraint violation, RLS denial, etc.) is
        // threaded into the thrown message so it reaches security_events.internal_code
        // via the outer catch-all -- console.error alone only reached the Edge
        // Function's own runtime logs, which nothing on the bus could pull without
        // dashboard access. The client still only ever sees "request_failed":
        // the outer catch-all's publicCode allowlist collapses any code not in its
        // small safe set, so this detail never reaches the caller.
        console.error("tenant_applications insert failed:", appError?.message ?? "no data returned", appError?.code ?? "");
        const detail = appError ? `${appError.code ?? "no_code"}: ${appError.message}` : "no_data_returned";
        throw new Error(`application_submission_failed: ${detail}`);
      }

      const updatedSession: Session = {
        ...session,
        application: {
          id: appData.id,
          status: appData.status,
          name: appData.name,
          legal_name: appData.legal_name,
          created_at: appData.created_at,
        },
      };

      await securityEvent(req, "onboarding.apply", "accepted", session, { application_id: appData.id, name });
      return json(200, { ok: true, application: appData, user: userDto(updatedSession) }, origin, {
        "set-cookie": cookie(await signSession(updatedSession)),
      });
    }

    if (req.method === "GET" && path === "/api/onboarding/application") {
      const { data, error } = await db.schema("platform").from("tenant_applications")
        .select("*")
        .eq("applicant_person_id", session.person_uuid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error("application_query_failed");
      return json(200, { ok: true, application: data ?? null }, origin);
    }

    // =========================================================================
    // Starq HQ Platform Control Plane Routes (Platform Entitlement Required)
    // =========================================================================
    if (path.startsWith("/api/platform/")) {
      if (!session.platform_entitlement) {
        await securityEvent(req, "platform.access", "rejected", session, { path, reason: "platform_entitlement_required" });
        return await deny(403, "platform_entitlement_required", session);
      }

      if (req.method === "GET" && path === "/api/platform/tenants") {
        const { data, error } = await db.schema("platform").rpc("list_tenants", {
          p_actor: session.person_uuid,
        });
        if (error) throw new Error(error.message || "platform_tenants_query_failed");
        return json(200, { ok: true, tenants: data ?? [] }, origin);
      }

      if (req.method === "POST" && path === "/api/platform/tenants/provision") {
        if (session.platform_entitlement.operator_role !== "platform_admin") {
          return await deny(403, "platform_admin_required", session);
        }
        const body = await readJson(req);
        if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
        const requestKey = req.headers.get("x-idempotency-key");
        if (!uuid(requestKey)) return json(400, { ok: false, error: "valid_idempotency_key_required" }, origin);
        const { csrf: _csrf, ...command } = body;
        const { data, error } = await db.schema("platform").rpc("provision_tenant", {
          p_actor: session.person_uuid,
          p_request_key: requestKey,
          p_command: command,
        });
        if (error) throw new Error(error.message || "tenant_provisioning_failed");
        return json(200, { ok: true, result: data }, origin);
      }

      if (req.method === "POST" && path.match(/^\/api\/platform\/tenants\/[^\/]+\/status$/)) {
        if (session.platform_entitlement.operator_role !== "platform_admin") {
          return await deny(403, "platform_admin_required", session);
        }
        const body = await readJson(req);
        if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
        const organisationId = path.split("/")[4];
        const requestKey = req.headers.get("x-idempotency-key");
        if (!uuid(organisationId)) return json(400, { ok: false, error: "invalid_organisation_id" }, origin);
        if (!uuid(requestKey)) return json(400, { ok: false, error: "valid_idempotency_key_required" }, origin);
        const action = String(body.action ?? "");
        if (action !== "suspend" && action !== "reactivate") return json(400, { ok: false, error: "invalid_tenant_action" }, origin);
        const { data, error } = await db.schema("platform").rpc("set_tenant_status", {
          p_actor: session.person_uuid,
          p_target_org: organisationId,
          p_request_key: requestKey,
          p_action: action,
          p_reason: String(body.reason ?? "").trim() || null,
        });
        if (error) throw new Error(error.message || "tenant_status_change_failed");
        return json(200, { ok: true, result: data }, origin);
      }

      if (req.method === "GET" && path === "/api/platform/applications") {
        const { data, error } = await db.schema("platform").from("tenant_applications")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw new Error("platform_applications_query_failed");
        return json(200, { ok: true, applications: data ?? [] }, origin);
      }

      if (req.method === "POST" && path.match(/^\/api\/platform\/applications\/[^\/]+\/approve$/)) {
        const body = await readJson(req);
        if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

        const appId = path.split("/")[4];
        if (!uuid(appId)) return json(400, { ok: false, error: "invalid_application_id" }, origin);

        const { data: provResult, error: provError } = await db.schema("platform").rpc("provision_approved_application", {
          p_application_id: appId,
          p_reviewer_person_id: session.person_uuid,
        });

        if (provError || !provResult) {
          console.error("platform.provision_approved_application failed:", provError?.message, provError?.code);
          await securityEvent(req, "platform.provision", "rejected", session, { application_id: appId, error: provError?.message });
          const detail = provError ? `${provError.code ?? "no_code"}: ${provError.message}` : "no_data_returned";
          throw new Error(`provisioning_failed: ${detail}`);
        }

        await securityEvent(req, "platform.provision", "accepted", session, { application_id: appId, result: provResult });
        return json(200, { ok: true, result: provResult }, origin);
      }

      if (req.method === "POST" && path.match(/^\/api\/platform\/applications\/[^\/]+\/reject$/)) {
        const body = await readJson(req);
        if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

        const appId = path.split("/")[4];
        if (!uuid(appId)) return json(400, { ok: false, error: "invalid_application_id" }, origin);

        const reason = String(body.reason ?? "Application declined during platform review.").trim();
        const { error } = await db.schema("platform").from("tenant_applications")
          .update({
            status: "rejected",
            rejection_reason: reason,
            reviewed_by: session.person_uuid,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", appId);

        if (error) throw new Error("application_rejection_failed");
        await securityEvent(req, "platform.application_reject", "accepted", session, { application_id: appId, reason });
        return json(200, { ok: true, status: "rejected" }, origin);
      }

      if (req.method === "POST" && path.match(/^\/api\/platform\/applications\/[^\/]+\/request-info$/)) {
        const body = await readJson(req);
        if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

        const appId = path.split("/")[4];
        if (!uuid(appId)) return json(400, { ok: false, error: "invalid_application_id" }, origin);

        const note = String(body.note ?? "Additional business information required.").trim();
        const { error } = await db.schema("platform").from("tenant_applications")
          .update({
            status: "info_requested",
            info_request_note: note,
            reviewed_by: session.person_uuid,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", appId);

        if (error) throw new Error("application_info_request_failed");
        await securityEvent(req, "platform.application_request_info", "accepted", session, { application_id: appId, note });
        return json(200, { ok: true, status: "info_requested" }, origin);
      }
    }

    // Every /api/ops/* route is tenant-scoped and queries by session.organisation_id.
    // A zero-org applicant session reaching any of them previously fell straight
    // into a raw Postgres "invalid input syntax for type uuid: null" (22P02) --
    // .eq(col, null) sends the literal string "null", not IS NULL -- instead of
    // the clean 403 these routes were always supposed to require.
    if (path.startsWith("/api/ops/") && !session.organisation_id) {
      return json(403, { ok: false, error: "organisation_context_required", request_id: requestId }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/pulse") {
      const { data, error } = await db.rpc("api_garage_pulse", {
        target_org: session.organisation_id, target_person: session.person_uuid, target_seat: session.acting_as,
      });
      if (error) throw new Error("pulse_query_failed");
      return json(200, data as Json, origin);
    }

    if (req.method === "GET" && path === "/api/ops/purchases") {
      const { data, error } = await db.rpc("api_garage_purchases", {
        target_org: session.organisation_id, target_person: session.person_uuid, target_seat: session.acting_as,
      });
      if (error) throw new Error("purchase_query_failed");
      return json(200, data as Json, origin);
    }

    if (req.method === "GET" && path === "/api/ops/job") {
      const jobId = new URL(req.url).searchParams.get("id");
      const byId = uuid(jobId);
      let query = db.from("garage_jobs").select("*").eq("organisation_id", session.organisation_id);
      query = byId ? query.eq("id", jobId!) : query.eq("job_no", jobId ?? "");
      const job = await query.maybeSingle();
      if (job.error || !job.data) return json(404, { ok: false, error: "job_not_found" }, origin);
      const events = await db.from("job_events").select("*")
        .eq("organisation_id", session.organisation_id).eq("job_id", job.data.id).order("occurred_at");
      if (events.error) throw new Error("job_event_query_failed");
      return json(200, { ok: true, job: job.data, events: events.data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/customers") {
      const { data, error } = await db.from("contacts").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("kind", "customer")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw new Error("customers_query_failed");
      return json(200, { ok: true, customers: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/suppliers") {
      const { data, error } = await db.from("contacts").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("kind", "supplier")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw new Error("suppliers_query_failed");
      return json(200, { ok: true, suppliers: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/invoices") {
      const { data, error } = await db.from("commercial_documents").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .eq("document_type", "sales_invoice")
        .order("created_at", { ascending: false });
      if (error) throw new Error("invoices_query_failed");
      return json(200, { ok: true, invoices: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/expenses") {
      const { data, error } = await db.from("commercial_documents").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .eq("document_type", "direct_expense")
        .order("created_at", { ascending: false });
      if (error) throw new Error("expenses_query_failed");
      return json(200, { ok: true, expenses: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/payments") {
      const { data, error } = await db.from("commercial_documents").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .in("document_type", ["receipt", "payment"])
        .order("created_at", { ascending: false });
      if (error) throw new Error("payments_query_failed");
      return json(200, { ok: true, payments: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/purchase-orders") {
      const { data, error } = await db.from("commercial_documents").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .eq("document_type", "purchase_order")
        .order("created_at", { ascending: false });
      if (error) throw new Error("purchase_orders_query_failed");
      return json(200, { ok: true, purchaseOrders: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/inventory") {
      const { data: items, error: itemsError } = await db.from("products").select("*, inventory_items(*)")
        .eq("organisation_id", session.organisation_id);
      if (itemsError) throw new Error("inventory_query_failed");
      const { data: movements, error: movError } = await db.from("stock_movements").select("*")
        .eq("organisation_id", session.organisation_id)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (movError) throw new Error("stock_movements_query_failed");
      return json(200, { ok: true, items: items ?? [], movements: movements ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/jobs") {
      const { data, error } = await db.from("garage_jobs").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .order("opened_at", { ascending: false });
      if (error) throw new Error("jobs_query_failed");
      return json(200, { ok: true, jobs: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/audit") {
      const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? "50"), 200);
      const { data, error } = await db.from("audit_events").select("*")
        .eq("organisation_id", session.organisation_id)
        .eq("book_id", session.book_id)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error("audit_query_failed");
      return json(200, { ok: true, events: data ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/workflows") {
      const { data: templates, error: tmplError } = await db.from("workflow_templates").select("*, workflow_stages(*)")
        .eq("organisation_id", session.organisation_id)
        .eq("active", true);
      if (tmplError) throw new Error("workflows_query_failed");
      return json(200, { ok: true, templates: templates ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/roles") {
      const { data: rolesData, error: rolesError } = await db.from("roles").select("*, role_permissions(*)")
        .eq("organisation_id", session.organisation_id)
        .eq("active", true);
      if (rolesError) throw new Error("roles_query_failed");
      return json(200, { ok: true, roles: rolesData ?? [] }, origin);
    }

    if (req.method === "GET" && path === "/api/ops/members") {
      const { data, error } = await db.from("memberships").select("*, persons(*)")
        .eq("organisation_id", session.organisation_id)
        .in("status", ["active", "pending", "suspended"])
        .order("created_at", { ascending: false });
      if (error) throw new Error("members_query_failed");
      return json(200, { ok: true, members: data ?? [] }, origin);
    }

    // =========================================================================
    // Staff Invitation & Authorization Lifecycle Routes (SERP-286)
    // =========================================================================
    const invitationRoute = path === "/api/tenant/invitations"
      || /^\/api\/tenant\/invitations\/[^/]+\/(resend|revoke)$/.test(path);
    if (invitationRoute && !session.seats.includes("managing_director")) {
      return await deny(403, "invitation_admin_required", session);
    }

    if (req.method === "GET" && path === "/api/tenant/invitations") {
      const { data, error } = await db.from("invitations")
        .select("*, persons:invited_by(display_label)")
        .eq("organisation_id", session.organisation_id)
        .order("created_at", { ascending: false });
      if (error) throw new Error("invitations_query_failed");
      return json(200, { ok: true, invitations: data ?? [] }, origin);
    }

    if (req.method === "POST" && path === "/api/tenant/invitations") {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

      const email = String(body.email ?? "").trim().toLowerCase();
      const name = String(body.name ?? "").trim();
      const roleId = String(body.role_id ?? "").trim();
      const jobTitle = body.job_title ? String(body.job_title).trim() : null;
      const phone = body.phone ? String(body.phone).trim() : null;
      const bookIds = Array.isArray(body.book_ids) ? [...new Set(body.book_ids.map(String))] : [];
      const locationIds = Array.isArray(body.location_ids) ? [...new Set(body.location_ids.map(String))] : [];

      if (!email || !name) return json(400, { ok: false, error: "email_and_name_required" }, origin);
      if (!uuid(roleId)) return json(400, { ok: false, error: "valid_role_required" }, origin);
      if (bookIds.some((id) => !uuid(id)) || locationIds.some((id) => !uuid(id))) {
        return json(400, { ok: false, error: "invalid_invitation_scope" }, origin);
      }

      const roleCheck = await db.from("roles").select("id")
        .eq("id", roleId)
        .eq("organisation_id", session.organisation_id)
        .eq("active", true)
        .maybeSingle();
      if (!roleCheck.data) return json(400, { ok: false, error: "valid_role_required" }, origin);

      if (bookIds.length > 0) {
        const bookScope = await db.from("books").select("id")
          .eq("organisation_id", session.organisation_id)
          .eq("status", "active")
          .in("id", bookIds);
        if (bookScope.error || (bookScope.data ?? []).length !== bookIds.length) {
          return json(400, { ok: false, error: "invalid_invitation_book_scope" }, origin);
        }
      }

      if (locationIds.length > 0) {
        const locationScope = await db.from("locations").select("id")
          .eq("organisation_id", session.organisation_id)
          .eq("active", true)
          .in("id", locationIds);
        if (locationScope.error || (locationScope.data ?? []).length !== locationIds.length) {
          return json(400, { ok: false, error: "invalid_invitation_location_scope" }, origin);
        }
      }

      // Duplicate check in pending invitations
      const existingInvite = await db.from("invitations").select("id")
        .eq("organisation_id", session.organisation_id)
        .ilike("email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvite.data) return json(400, { ok: false, error: "invitation_already_pending" }, origin);

      const { data: invData, error: invError } = await db.from("invitations").insert({
        organisation_id: session.organisation_id,
        email,
        name,
        role_id: roleId,
        job_title: jobTitle,
        phone,
        book_ids: bookIds,
        location_ids: locationIds,
        invited_by: session.person_uuid,
        status: "pending",
      }).select("*").single();

      if (invError || !invData) throw new Error("invitation_creation_failed");
      await securityEvent(req, "invitation.created", "accepted", session, { invitation_id: invData.id, email, role: roleId });
      return json(200, { ok: true, invitation: invData }, origin);
    }

    if (req.method === "POST" && path.match(/^\/api\/tenant\/invitations\/[^\/]+\/resend$/)) {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

      const invId = path.split("/")[4];
      const { data: updated, error } = await db.from("invitations")
        .update({
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invId)
        .eq("organisation_id", session.organisation_id)
        .select("*")
        .single();

      if (error || !updated) return json(404, { ok: false, error: "invitation_not_found" }, origin);
      await securityEvent(req, "invitation.resent", "accepted", session, { invitation_id: invId });
      return json(200, { ok: true, invitation: updated }, origin);
    }

    if (req.method === "POST" && path.match(/^\/api\/tenant\/invitations\/[^\/]+\/revoke$/)) {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);

      const invId = path.split("/")[4];
      const { error } = await db.from("invitations")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invId)
        .eq("organisation_id", session.organisation_id);

      if (error) return json(404, { ok: false, error: "invitation_not_found" }, origin);
      await securityEvent(req, "invitation.revoked", "accepted", session, { invitation_id: invId });
      return json(200, { ok: true, status: "revoked" }, origin);
    }

    if (req.method === "POST" && path === "/api/ops/event") {
      const body = await readJson(req);
      if (!csrfValid(req, body, session)) return await deny(400, "csrf_mismatch", session);
      if (!session.organisation_id) return json(403, { ok: false, error: "organisation_context_required" }, origin);
      const commandKey = req.headers.get("x-idempotency-key");
      if (!uuid(commandKey)) return json(428, { ok: false, error: "valid_idempotency_key_required" }, origin);

      /**
       * AUTHORIZE AT THE BOUNDARY, BEFORE THE RPC.
       *
       * Independent review, 21 Aug 2026 (DP): "The contract is correct. The runtime does not
       * use it." Importing `audienceIsValid` and `seatWriteIsSafe` while delegating the actual
       * authorization to `api_garage_command` left the decision in the RPC's old matrix — the
       * `target_seat` fallback, no segregation of duties, an eight-seat vocabulary. A second
       * copy of the rules is the whole failure mode, and that was a second copy.
       *
       * The RPC keeps its own check. Two independent refusals is defence in depth; what is not
       * acceptable is two independent DECISIONS, so the contract is now the one that decides and
       * the RPC's copy becomes redundant rather than authoritative. It is removed in a later
       * slice, once nothing depends on it.
       */
      const intent = fromLegacyBody(body);
      if (!intent) {
        await securityEvent(req, "garage.command", "rejected", session, { code: "unknown_command" });
        return json(400, { ok: false, error: "unknown_command", request_id: requestId }, origin);
      }
      const principal: Principal = {
        personId: session.person_uuid,
        organisationId: session.organisation_id,
        actingSeat: session.acting_as as SeatCode,
        heldSeats: session.seats as SeatCode[],
        seatVerifiedAt: new Date().toISOString(),
      };
      const verdict = authorizeCommand(principal, intent);
      if (!verdict.ok) {
        await securityEvent(req, "garage.command", "rejected", session, { code: verdict.error });
        return json(403, { ok: false, error: verdict.error, request_id: requestId }, origin);
      }

      let commandForRpc = body;
      if (intent.command === "INVOICE") {
        const rawTaxMode = body.tax_mode;
        const taxMode = rawTaxMode === "inclusive" || rawTaxMode === "exclusive" ||
          rawTaxMode === "zero_rated" || rawTaxMode === "exempt"
          ? rawTaxMode
          : "exclusive";
        const taxType = typeof body.tax_type === "string" && body.tax_type.trim()
          ? body.tax_type.trim()
          : "gst_general";
        const supplyDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
          ? body.date
          : new Date().toISOString().slice(0, 10);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const decision = await resolveInvoiceFinanceDecision(
          {
            items: rawItems.map((raw) => {
              const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
              return { quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) };
            }),
            taxMode,
            snapshotDate: supplyDate,
          },
          async (lineAmount) => {
            const { data, error } = await db.rpc("calculate_line_tax", {
              target_org: session.organisation_id,
              target_tax_type: taxType,
              supply_date: supplyDate,
              tax_mode: taxMode,
              line_amount: lineAmount,
            });
            if (error) throw new Error("authoritative_tax_calculation_failed");
            const row = Array.isArray(data) ? data[0] : data;
            return (row ?? null) as InvoiceTaxLineResult | null;
          },
        );

        if (decision.status === "HOLD" || !decision.value) {
          observed.outcome = "blocked";
          await securityEvent(req, "finance.invoice", "blocked", session, {
            code: "finance_hold",
            reason: decision.reason,
            provenance: decision.provenance,
          }, requestId);
          return json(422, {
            ok: false,
            error: "finance_hold",
            reason: decision.reason,
            decision,
            request_id: requestId,
          }, origin);
        }

        commandForRpc = {
          ...body,
          subtotal: decision.value.subtotal,
          gst_amount: decision.value.gstAmount,
          total_amount: decision.value.totalAmount,
          gst_rate: decision.value.gstRate,
          tax_mode: decision.value.taxMode,
          finance_decision: decision,
        };
      }

      const { data, error } = await db.rpc("api_garage_command", {
        target_org: session.organisation_id,
        target_person: session.person_uuid,
        target_seat: session.acting_as,
        command_key: commandKey,
        command: commandForRpc,
        request_identifier: requestId,
      });
      if (error) {
        await securityEvent(req, "garage.command", "rejected", session, { code: error.code ?? "database_rejection" });
        return json(400, { ok: false, error: "command_rejected", request_id: requestId }, origin);
      }
      await securityEvent(req, "garage.command", "accepted", session, { idempotency_key: commandKey });
      return json(200, data as Json, origin);
    }

    return json(404, { ok: false, error: "route_not_found", request_id: requestId }, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "internal_error";
    const publicCode = new Set([
      "payload_too_large", "invalid_json_object", "invalid_google_token",
      "identity_claims_rejected", "not_allowlisted", "organisation_not_found",
      "no_active_seat", "identity_binding_conflict",
    ]).has(code) ? code : "request_failed";
    /**
     * The SANITIZED code goes to the caller. The TRUE code goes to the log.
     *
     * Until 22 Aug 2026 this line recorded `publicCode` — the already-collapsed
     * value — so every failure outside the small public allowlist was stored as
     * `request_failed` and the real reason was destroyed at the only point that
     * could have kept it. Debugging a live sign-in failure that night meant
     * reading source and guessing, because the audit table faithfully recorded
     * five identical rows saying nothing.
     *
     * A server-side security log exists precisely to hold what the response must
     * not. Withholding detail from an unauthenticated caller is correct;
     * withholding it from ourselves was not a security measure, it was a blind
     * spot wearing one as a costume.
     *
     * `internal_code` is bounded because an arbitrary driver message can be long
     * and can carry schema detail. This table is internal and append-only, so
     * that detail is acceptable here and nowhere else — it must never reach the
     * response body.
     */
    await securityEvent(req, "api.error", publicCode === "request_failed" ? "error" : "rejected", null, {
      code: publicCode,
      internal_code: code.slice(0, 300),
      path,
    }, requestId);
    observed.outcome = publicCode;
    return json(publicCode === "payload_too_large" ? 413 : 400, { ok: false, error: publicCode, request_id: requestId }, origin);
  }
}

/**
 * SERP-301 — one structured log line per request, whatever happens.
 *
 * WRAPPED RATHER THAN THREADED. The handler has some sixty return sites; adding
 * a log call to each is sixty chances to miss one, and the one that gets missed
 * is always the failure path nobody exercised. Wrapping means a response cannot
 * leave this function unobserved — including one thrown from outside the
 * handler's own try, which previously would have produced a bare 500 with no
 * record anywhere.
 */
Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const observed: Observed = { outcome: "ok", personUuid: null, organisationId: null };
  const path = routePath(req.url);

  let response: Response;
  try {
    response = await handleRequest(req, requestId, observed);
  } catch (error) {
    // The handler has its own try/catch; this is the net under it. A logging
    // wrapper that can itself 500 unobserved would be worse than no wrapper.
    observed.outcome = "unhandled_exception";
    logRequest({
      request_id: requestId,
      person_uuid: observed.personUuid,
      organisation_id: observed.organisationId,
      method: req.method,
      path,
      status: 500,
      outcome: "unhandled_exception",
      latency_ms: Date.now() - startedAt,
      severity: "error",
      detail: { kind: error instanceof Error ? error.name : "unknown" },
    });
    return json(500, { ok: false, error: "request_failed", request_id: requestId }, req.headers.get("origin"));
  }

  logRequest({
    request_id: requestId,
    person_uuid: observed.personUuid,
    organisation_id: observed.organisationId,
    method: req.method,
    path,
    status: response.status,
    outcome: observed.outcome,
    latency_ms: Date.now() - startedAt,
    severity: severityFor(observed.outcome, response.status),
  });
  return response;
});
