import type { OrganisationTenant } from '../types/erp';
import type { OperableOrganisation } from '../services/auth';

/** Workspace shell when the signed-in person has zero organisations. Not a real tenant. */
export const EMPTY_WORKSPACE_TENANT: OrganisationTenant = {
  id: '',
  name: 'No organisation',
  slug: '',
  legalName: '',
  industry: 'Custom Service Workshop',
  currency: 'MVR',
  currencySymbol: 'Rf',
  tinNumber: '',
  gstStatus: 'not_registered',
  gstRate: 8,
  financialYearStart: '01-01',
  financialYearEnd: '12-31',
  phone: '',
  email: '',
  address: '',
  island: '',
  atoll: '',
  bmlAccount: '',
  themeColor: '#0f766e',
  createdAt: '',
  books: [],
};

export function mapSessionOrganisationsToTenants(
  organisations: OperableOrganisation[] | undefined
): OrganisationTenant[] {
  return (organisations ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    legalName: org.name,
    industry: 'Custom Service Workshop',
    currency: 'MVR',
    currencySymbol: 'Rf',
    tinNumber: '',
    gstStatus: 'not_registered',
    gstRate: 8,
    financialYearStart: '01-01',
    financialYearEnd: '12-31',
    phone: '',
    email: '',
    address: '',
    island: '',
    atoll: '',
    bmlAccount: '',
    themeColor: '#0f766e',
    createdAt: '',
    books: (org.books ?? []).map((book) => ({
      id: book.id,
      tenantId: org.id,
      code: book.code,
      name: book.name,
      archetypeId: book.archetype_id as OrganisationTenant['archetypeId'],
      isDefault: book.is_default,
    })),
  }));
}

export function resolveCurrentTenant(
  tenants: OrganisationTenant[],
  currentTenantId: string
): OrganisationTenant {
  return tenants.find((t) => t.id === currentTenantId) || tenants[0] || EMPTY_WORKSPACE_TENANT;
}
