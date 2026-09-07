import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORKSPACE_TENANT,
  mapSessionOrganisationsToTenants,
  resolveCurrentTenant,
} from '../lib/sessionTenants';
import { INITIAL_TENANTS } from '../data/mockData';

describe('SERP-401 session organisation binding', () => {
  it('maps session organisations and never invents Club Ignition / Starq from an empty session', () => {
    expect(mapSessionOrganisationsToTenants([])).toEqual([]);
    expect(mapSessionOrganisationsToTenants(undefined)).toEqual([]);

    const mapped = mapSessionOrganisationsToTenants([
      {
        id: 'org-tester-a',
        slug: 'tester-a',
        name: 'Tester A Ltd',
        books: [{ id: 'book-a', code: 'MAIN', name: 'Main', is_default: true, archetype_id: 'general_business' }],
      },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].id).toBe('org-tester-a');
    expect(mapped.some((t) => t.id === 'tenant-ignition' || t.id === 'tenant-starq')).toBe(false);
    expect(INITIAL_TENANTS.some((t) => t.id === 'tenant-ignition')).toBe(true);
  });

  it('resolves to the empty workspace sentinel when the person has zero orgs', () => {
    expect(resolveCurrentTenant([], 'anything')).toEqual(EMPTY_WORKSPACE_TENANT);
    expect(EMPTY_WORKSPACE_TENANT.name).toBe('No organisation');
  });
});
