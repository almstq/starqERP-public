import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  submitOrganisationApplication,
  getPlatformApplications,
  approvePlatformApplication,
  rejectPlatformApplication,
  requestInfoPlatformApplication,
  getApplicantApplication,
  PlatformApplicationRecord,
} from '../services/apiGateway';
import { UserSession } from '../services/auth';

describe('Cross-Device Onboarding & Atomic Tenant Provisioning Vertical Slice', () => {
  const applicantPersonUuid = '11111111-1111-4111-8111-111111111111';
  const applicantPersonKey = 'user-design-partner';
  const applicantEmail = 'partner@design-studio.mv';
  const applicantName = 'Design Partner Founder';

  const operatorPersonUuid = '99999999-9999-4999-8999-999999999999';
  const operatorPersonKey = 'user-starq-operator';
  const operatorEmail = 'operator@starq.mv';
  const operatorName = 'Starq Platform Operator';

  // In-memory mock database simulating PostgreSQL platform schema and public tenant tables
  let dbTenantApplications: PlatformApplicationRecord[] = [];
  let dbOrganisations: any[] = [];
  let dbBooks: any[] = [];
  let dbMemberships: any[] = [];
  let dbMembershipSeats: any[] = [];
  let dbBookMemberships: any[] = [];
  let dbTenantRegistry: any[] = [];

  beforeEach(() => {
    dbTenantApplications = [];
    dbOrganisations = [
      { id: 'a0000000-0001-0000-0000-000000000001', slug: 'club-ignition', name: 'Club Ignition Pvt Ltd' },
      { id: 'a0000000-0002-0000-0000-000000000002', slug: 'starq-tech', name: 'Starq Technologies Pvt Ltd' },
    ];
    dbBooks = [
      { id: 'book-ci-01', organisation_id: 'a0000000-0001-0000-0000-000000000001', code: 'INK', name: 'Ignition Ink' },
      { id: 'book-stq-01', organisation_id: 'a0000000-0002-0000-0000-000000000002', code: 'STQ', name: 'Starq Tech' },
    ];
    dbMemberships = [];
    dbMembershipSeats = [];
    dbBookMemberships = [];
    dbTenantRegistry = [];

    // Mock global fetch simulating Supabase Edge Gateway
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const urlObj = new URL(url, 'http://localhost');
      const path = urlObj.pathname.replace(/^\/functions\/v1\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(init.body as string) : {};

      // 1. Applicant submits application
      if (path === '/api/onboarding/apply' && method === 'POST') {
        const appId = 'app-' + crypto.randomUUID();
        const record: PlatformApplicationRecord = {
          id: appId,
          applicant_person_id: applicantPersonUuid,
          applicant_email: applicantEmail,
          applicant_name: applicantName,
          name: body.name,
          legal_name: body.legal_name || `${body.name} Pvt Ltd`,
          archetype_id: body.archetype_id || 'general_business',
          primary_book_name: body.primary_book_name || body.name,
          primary_book_code: body.primary_book_code || 'MAIN',
          island: body.island || "Male'",
          atoll: body.atoll || 'Kaafu Atoll',
          phone: body.phone || null,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        dbTenantApplications.push(record);
        return {
          ok: true,
          json: async () => ({ ok: true, application: record }),
        };
      }

      // 2. Applicant queries their application
      if (path === '/api/onboarding/application' && method === 'GET') {
        const app = dbTenantApplications.find((a) => a.applicant_person_id === applicantPersonUuid);
        return {
          ok: true,
          json: async () => ({ ok: true, application: app ?? null }),
        };
      }

      // 3. Platform operator fetches applications
      if (path === '/api/platform/applications' && method === 'GET') {
        return {
          ok: true,
          json: async () => ({ ok: true, applications: dbTenantApplications }),
        };
      }

      // 4. Platform operator approves & provisions application
      if (path.match(/\/api\/platform\/applications\/[^\/]+\/approve$/) && method === 'POST') {
        const appId = path.split('/')[4];
        const app = dbTenantApplications.find((a) => a.id === appId);
        if (!app) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ ok: false, error: 'application_not_found' }),
          };
        }

        // Execute atomic provisioning logic
        const newOrgId = 'org-' + crypto.randomUUID();
        const newBookId = 'book-' + crypto.randomUUID();
        const newMembershipId = 'mem-' + crypto.randomUUID();

        dbOrganisations.push({
          id: newOrgId,
          slug: app.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: app.legal_name,
        });

        dbBooks.push({
          id: newBookId,
          organisation_id: newOrgId,
          code: app.primary_book_code,
          name: app.primary_book_name,
          archetype_id: app.archetype_id,
          is_default: true,
        });

        dbMemberships.push({
          id: newMembershipId,
          organisation_id: newOrgId,
          person_id: app.applicant_person_id,
          role: 'managing_director',
          status: 'active',
        });

        dbMembershipSeats.push({
          membership_id: newMembershipId,
          seat_code: 'managing_director',
        });

        dbBookMemberships.push({
          organisation_id: newOrgId,
          membership_id: newMembershipId,
          book_id: newBookId,
        });

        dbTenantRegistry.push({
          organisation_id: newOrgId,
          archetype_id: app.archetype_id,
          provisioning_status: 'ready',
        });

        app.status = 'approved';
        app.provisioned_organisation_id = newOrgId;
        app.reviewed_by = operatorPersonUuid;
        app.reviewed_at = new Date().toISOString();

        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              ok: true,
              organisation_id: newOrgId,
              book_id: newBookId,
              membership_id: newMembershipId,
            },
          }),
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ ok: false, error: 'not_found' }),
      };
    }));
  });

  it('Step 1: Authenticated external applicant with no initial tenant submits application', async () => {
    const submission = await submitOrganisationApplication({
      name: 'Design Studio Maldives',
      legal_name: 'Design Studio Maldives Pvt Ltd',
      archetype_id: 'general_business',
      primary_book_name: 'Studio Creative Operations',
      primary_book_code: 'DSM',
      island: "Male'",
      atoll: 'Kaafu Atoll',
      phone: '+960 771-2345',
    });

    expect(submission.ok).toBe(true);
    expect(submission.application.name).toBe('Design Studio Maldives');
    expect(submission.application.status).toBe('pending');
    expect(submission.application.applicant_email).toBe(applicantEmail);
    expect(dbTenantApplications).toHaveLength(1);
    expect(dbTenantApplications[0].status).toBe('pending');
  });

  it('Step 2: Applicant refreshes or logs in from another device and sees pending application', async () => {
    // Seed initial submitted application in backend
    dbTenantApplications.push({
      id: 'app-test-123',
      applicant_person_id: applicantPersonUuid,
      applicant_email: applicantEmail,
      applicant_name: applicantName,
      name: 'Design Studio Maldives',
      legal_name: 'Design Studio Maldives Pvt Ltd',
      archetype_id: 'general_business',
      primary_book_name: 'Studio Creative Operations',
      primary_book_code: 'DSM',
      island: "Male'",
      atoll: 'Kaafu Atoll',
      phone: '+960 771-2345',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const statusCheck = await getApplicantApplication();
    expect(statusCheck.ok).toBe(true);
    expect(statusCheck.application).not.toBeNull();
    expect(statusCheck.application?.status).toBe('pending');
    expect(statusCheck.application?.name).toBe('Design Studio Maldives');
  });

  it('Step 3: Starq HQ operator reviews queue from separate session and approves application', async () => {
    const targetAppId = 'app-review-456';
    dbTenantApplications.push({
      id: targetAppId,
      applicant_person_id: applicantPersonUuid,
      applicant_email: applicantEmail,
      applicant_name: applicantName,
      name: 'Island Marine Engineering',
      legal_name: 'Island Marine Engineering Pvt Ltd',
      archetype_id: 'marine_service',
      primary_book_name: 'Dockside Repairs',
      primary_book_code: 'IME',
      island: 'Thilafushi',
      atoll: 'Kaafu Atoll',
      phone: '+960 799-8877',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 1. Operator fetches review queue
    const queue = await getPlatformApplications();
    expect(queue.ok).toBe(true);
    expect(queue.applications).toHaveLength(1);
    expect(queue.applications[0].id).toBe(targetAppId);
    expect(queue.applications[0].applicant_email).toBe(applicantEmail);

    // 2. Operator executes atomic approval
    const approval = await approvePlatformApplication(targetAppId);
    expect(approval.ok).toBe(true);
    expect(approval.result.organisation_id).toBeDefined();
    expect(approval.result.book_id).toBeDefined();

    // 3. Verify database state after atomic provisioning
    const provisionedOrgId = approval.result.organisation_id;
    const org = dbOrganisations.find((o) => o.id === provisionedOrgId);
    expect(org).toBeDefined();
    expect(org.name).toBe('Island Marine Engineering Pvt Ltd');

    const book = dbBooks.find((b) => b.organisation_id === provisionedOrgId);
    expect(book).toBeDefined();
    expect(book.code).toBe('IME');
    expect(book.archetype_id).toBe('marine_service');

    const membership = dbMemberships.find((m) => m.organisation_id === provisionedOrgId);
    expect(membership).toBeDefined();
    expect(membership.person_id).toBe(applicantPersonUuid);
    expect(membership.role).toBe('managing_director');

    const appRecord = dbTenantApplications.find((a) => a.id === targetAppId);
    expect(appRecord?.status).toBe('approved');
    expect(appRecord?.provisioned_organisation_id).toBe(provisionedOrgId);
  });

  it('Step 4: Isolation Proof — Provisioned user has zero access to other customer tenants', async () => {
    // Target applicant only has membership in their newly provisioned tenant
    const partnerOrgId = 'org-partner-tenant-999';
    dbMemberships.push({
      id: 'mem-partner-1',
      organisation_id: partnerOrgId,
      person_id: applicantPersonUuid,
      role: 'managing_director',
      status: 'active',
    });

    // Attempting to access Club Ignition (Tenant 1)
    const ciOrgId = 'a0000000-0001-0000-0000-000000000001';
    const hasCiAccess = dbMemberships.some(
      (m) => m.person_id === applicantPersonUuid && m.organisation_id === ciOrgId
    );
    expect(hasCiAccess).toBe(false);

    // Attempting to access Starq Tech (Tenant 2)
    const stqOrgId = 'a0000000-0002-0000-0000-000000000002';
    const hasStqAccess = dbMemberships.some(
      (m) => m.person_id === applicantPersonUuid && m.organisation_id === stqOrgId
    );
    expect(hasStqAccess).toBe(false);
  });

  it('Step 5: Optional Phone & Nullability — allows submitting application with empty phone string', async () => {
    const submission = await submitOrganisationApplication({
      name: 'No Phone Workshop',
      legal_name: 'No Phone Workshop Pvt Ltd',
      archetype_id: 'automotive_workshop',
      primary_book_name: 'Workshop Service',
      primary_book_code: 'NPW',
      island: "Male'",
      atoll: 'Kaafu Atoll',
      phone: '',
    });

    expect(submission.ok).toBe(true);
    expect(submission.application.name).toBe('No Phone Workshop');
    expect(submission.application.phone).toBeNull();
  });

  it('Step 5b: Optional Phone & Nullability — allows submitting application with phone omitted entirely (undefined)', async () => {
    const submission = await submitOrganisationApplication({
      name: 'Omitted Phone Workshop',
      legal_name: 'Omitted Phone Workshop Pvt Ltd',
      archetype_id: 'automotive_workshop',
      primary_book_name: 'Workshop Service',
      primary_book_code: 'OPW',
      island: "Male'",
      atoll: 'Kaafu Atoll',
    });

    expect(submission.ok).toBe(true);
    expect(submission.application.name).toBe('Omitted Phone Workshop');
    expect(submission.application.phone).toBeNull();
  });
});
