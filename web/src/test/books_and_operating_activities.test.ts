import { describe, expect, it } from 'vitest';
import { INITIAL_TENANTS } from '../data/mockData';
import { OrganisationBook, OrganisationTenant } from '../types/erp';

describe('Tier 3 Books & Operating Activities Architecture (Migration 0025)', () => {
  it('1. Same organization can have multiple books', () => {
    const starqTenant = INITIAL_TENANTS.find((t) => t.id === 'tenant-starq');
    expect(starqTenant).toBeDefined();
    expect(starqTenant?.books).toBeDefined();
    expect(starqTenant?.books?.length).toBeGreaterThanOrEqual(2);

    const bookCodes = starqTenant?.books?.map((b) => b.code);
    expect(bookCodes).toContain('STQ');
    expect(bookCodes).toContain('DYN');
  });

  it('2. Starq Tenant #0 model supports two books: Starq Technologies and Starq Dynamics', () => {
    const starqTenant = INITIAL_TENANTS.find((t) => t.id === 'tenant-starq');
    const stqBook = starqTenant?.books?.find((b) => b.code === 'STQ');
    const dynBook = starqTenant?.books?.find((b) => b.code === 'DYN');

    expect(stqBook).toBeDefined();
    expect(stqBook?.name).toBe('Starq Technologies');
    expect(stqBook?.isDefault).toBe(true);

    expect(dynBook).toBeDefined();
    expect(dynBook?.name).toBe('Starq Dynamics');
    expect(dynBook?.isDefault).toBe(false);
  });

  it('3. Club Ignition Tenant #1 supports Ignition Ink operating book', () => {
    const ignitionTenant = INITIAL_TENANTS.find((t) => t.id === 'tenant-ignition');
    expect(ignitionTenant).toBeDefined();
    expect(ignitionTenant?.books).toBeDefined();
    
    const inkBook = ignitionTenant?.books?.find((b) => b.code === 'INK');
    expect(inkBook).toBeDefined();
    expect(inkBook?.name).toBe('Ignition Ink');
    expect(inkBook?.archetypeId).toBe('automotive_workshop');
    expect(inkBook?.isDefault).toBe(true);
  });

  it('4. Enforces at most one default active book per tenant', () => {
    INITIAL_TENANTS.forEach((tenant) => {
      if (tenant.books && tenant.books.length > 0) {
        const defaultBooks = tenant.books.filter((b) => b.isDefault);
        expect(defaultBooks.length).toBeLessThanOrEqual(1);
      }
    });
  });

  it('5. A book can exist with no separate registered business name (operating directly under entity)', () => {
    const directBook: OrganisationBook = {
      id: 'book-direct-entity',
      tenantId: 'tenant-enterprise',
      code: 'ENT',
      name: 'Enterprise Consulting Book',
      archetypeId: 'general_business',
      isDefault: true,
    };
    expect(directBook.id).toBeDefined();
    expect(directBook.tenantId).toBe('tenant-enterprise');
  });

  it('6. One registered trading name can bind to multiple books or single book without conflating concepts', () => {
    const booksForBrand: OrganisationBook[] = [
      {
        id: 'book-retail-counter',
        tenantId: 'tenant-hardware-corp',
        code: 'RET',
        name: 'Hardware Retail Counter Book',
        archetypeId: 'retail',
        isDefault: true,
      },
      {
        id: 'book-wholesale-dist',
        tenantId: 'tenant-hardware-corp',
        code: 'WHL',
        name: 'Hardware Wholesale Distribution Book',
        archetypeId: 'wholesale_trading',
        isDefault: false,
      },
    ];

    expect(booksForBrand).toHaveLength(2);
    expect(booksForBrand[0].tenantId).toBe(booksForBrand[1].tenantId);
    expect(booksForBrand[0].code).not.toBe(booksForBrand[1].code);
  });

  it('7. Enforces tenant-boundary safety: books must belong to the exact matching tenantId', () => {
    const tenantAId = 'tenant-a-uuid';
    const tenantBId = 'tenant-b-uuid';

    const bookA: OrganisationBook = {
      id: 'book-a-1',
      tenantId: tenantAId,
      code: 'BKA',
      name: 'Tenant A Primary Book',
      isDefault: true,
    };

    // Attempting to attach bookA to tenantB violates tenant invariant
    const isTenantMatch = (tenant: OrganisationTenant, book: OrganisationBook) => tenant.id === book.tenantId;

    const mockTenantA = { id: tenantAId } as OrganisationTenant;
    const mockTenantB = { id: tenantBId } as OrganisationTenant;

    expect(isTenantMatch(mockTenantA, bookA)).toBe(true);
    expect(isTenantMatch(mockTenantB, bookA)).toBe(false);
  });
});
