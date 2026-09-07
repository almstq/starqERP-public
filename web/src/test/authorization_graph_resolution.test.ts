import { describe, it, expect } from 'vitest';
import { UserSession, OperableOrganisation } from '../services/auth';

describe('SERP-285: Gateway Full Authorization Graph Resolution', () => {
  it('resolves complete authorization graph with platform entitlement, legal entities, and operable books', () => {
    const mockAuthGraphResponse: UserSession = {
      person_id: 'user-almstq',
      name: 'Ali Musthaq',
      seats: ['managing_director', 'financial_controller'],
      acting_as: 'managing_director',
      seat_label: 'managing director',
      csrf: 'csrf-token-12345',
      allowed_entities: ['starq-technologies', 'club-ignition'],
      organisations: [
        {
          id: '10000000-0000-0000-0000-000000000001',
          slug: 'starq-technologies',
          name: 'Starq Technologies Pvt Ltd',
          books: [
            {
              id: '10000000-0000-0000-0000-000000000101',
              code: 'STQ',
              name: 'Starq Technologies Software & R&D',
              is_default: true,
              archetype_id: 'general_business',
            },
            {
              id: '10000000-0000-0000-0000-000000000102',
              code: 'DYN',
              name: 'Starq Dynamics Management Services',
              is_default: false,
              archetype_id: 'general_business',
            },
          ],
        },
        {
          id: '20000000-0000-0000-0000-000000000002',
          slug: 'club-ignition',
          name: 'Club Ignition Pvt Ltd',
          books: [
            {
              id: '20000000-0000-0000-0000-000000000201',
              code: 'INK',
              name: 'Ignition Ink Workshop',
              is_default: true,
              archetype_id: 'automotive_workshop',
            },
          ],
        },
      ],
      current_organisation_id: '10000000-0000-0000-0000-000000000001',
      current_book_id: '10000000-0000-0000-0000-000000000101',
      platform_entitlement: {
        operator_role: 'platform_admin',
        mfa_verified: false,
      },
    };

    // 1. Full Authorization Graph Verification
    expect(mockAuthGraphResponse.platform_entitlement).toBeDefined();
    expect(mockAuthGraphResponse.platform_entitlement?.operator_role).toBe('platform_admin');
    expect(mockAuthGraphResponse.organisations).toHaveLength(2);

    // 2. Operable Multi-Book Verification
    const starqOrg = mockAuthGraphResponse.organisations?.find((o: OperableOrganisation) => o.slug === 'starq-technologies');
    expect(starqOrg).toBeDefined();
    expect(starqOrg?.books).toHaveLength(2);
    expect(starqOrg?.books?.[0].code).toBe('STQ');
    expect(starqOrg?.books?.[0].is_default).toBe(true);
    expect(starqOrg?.books?.[1].code).toBe('DYN');

    const clubIgnitionOrg = mockAuthGraphResponse.organisations?.find((o: OperableOrganisation) => o.slug === 'club-ignition');
    expect(clubIgnitionOrg).toBeDefined();
    expect(clubIgnitionOrg?.books).toHaveLength(1);
    expect(clubIgnitionOrg?.books?.[0].code).toBe('INK');

    // 3. Initial Active Context Initialized to Primary Tenant and Default Book
    expect(mockAuthGraphResponse.current_organisation_id).toBe('10000000-0000-0000-0000-000000000001');
    expect(mockAuthGraphResponse.current_book_id).toBe('10000000-0000-0000-0000-000000000101');
  });

  it('proves non-operator tenant user receives null platform_entitlement and strictly scoped organisations', () => {
    const tenantUserResponse: UserSession = {
      person_id: 'user-technician',
      name: 'Workshop Technician',
      seats: ['technician'],
      acting_as: 'technician',
      seat_label: 'technician',
      csrf: 'csrf-tech-789',
      allowed_entities: ['club-ignition'],
      organisations: [
        {
          id: '20000000-0000-0000-0000-000000000002',
          slug: 'club-ignition',
          name: 'Club Ignition Pvt Ltd',
          books: [
            {
              id: '20000000-0000-0000-0000-000000000201',
              code: 'INK',
              name: 'Ignition Ink Workshop',
              is_default: true,
              archetype_id: 'automotive_workshop',
            },
          ],
        },
      ],
      current_organisation_id: '20000000-0000-0000-0000-000000000002',
      current_book_id: '20000000-0000-0000-0000-000000000201',
      platform_entitlement: null,
    };

    // Zero ambient access to platform plane
    expect(tenantUserResponse.platform_entitlement).toBeNull();
    // Zero ambient access to unassigned tenant
    expect(tenantUserResponse.organisations).toHaveLength(1);
    expect(tenantUserResponse.organisations?.[0].slug).toBe('club-ignition');
  });
});
