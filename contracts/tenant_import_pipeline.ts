/**
 * STARQ ERP — Multi-Tenant Organisation Spine & Tenant Import Pack Pipeline
 * Task: M1-ORGS-001 (Blueprint Phase 2 / CORE-001 / CORE-002)
 *
 * Provides structured validation, transformation, and provision rehearsal
 * for new SME tenant onboarding packs, using Club Ignition as canonical Test Pack #1
 * and Starq Technologies as Equal Rollout Tenant #2 (Parent Company).
 */

import {
  TaxRegistrationRecord,
  BankAccountRecord,
  RoleCode,
} from './commands.ts';

export interface TenantImportPack {
  readonly version: '1.0';
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly legalName: string;
  readonly industry: 'Automotive & Body Repair' | 'Software & Engineering Services' | 'Marine & Boatyard' | 'Medical Clinic & Diagnostics' | 'General SME';
  readonly currency: string;
  readonly taxRegistration: TaxRegistrationRecord;
  readonly bankAccounts: readonly BankAccountRecord[];
  readonly workflowStages: readonly {
    readonly stageKey: string;
    readonly displayName: string;
    readonly stageOrder: number;
    readonly isMandatory: boolean;
    readonly requiredRole?: string;
  }[];
  readonly roles: readonly {
    readonly roleCode: RoleCode;
    readonly roleName: string;
    readonly permissions: readonly string[];
  }[];
  readonly customers: readonly {
    readonly customerId: string;
    readonly name: string;
    readonly phone: string;
    readonly email?: string;
    readonly island: string;
    readonly vehicles?: readonly {
      readonly plateNumber: string;
      readonly make: string;
      readonly model: string;
      readonly year: number;
    }[];
  }[];
  readonly inventoryCatalog: readonly {
    readonly sku: string;
    readonly name: string;
    readonly category: string;
    readonly unitCost: number;
    readonly sellingPrice: number;
    readonly initialQuantity: number;
  }[];
  readonly openingBalances: readonly {
    readonly accountCode: string;
    readonly accountName: string;
    readonly debit: number;
    readonly credit: number;
  }[];
}

export interface ImportValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly tenantId: string;
  readonly summary: {
    readonly stageCount: number;
    readonly roleCount: number;
    readonly customerCount: number;
    readonly inventoryCount: number;
    readonly accountsCount: number;
  };
}

export function validateTenantImportPack(pack: TenantImportPack): ImportValidationResult {
  const errors: string[] = [];

  if (!pack.tenantId || pack.tenantId.trim().length === 0) {
    errors.push('tenantId is required');
  }
  if (!pack.name || pack.name.trim().length === 0) {
    errors.push('name is required');
  }
  if (!pack.slug || !/^[a-z0-9-]+$/.test(pack.slug)) {
    errors.push('slug must be lowercase alphanumeric with hyphens');
  }
  if (!pack.currency || pack.currency.length !== 3) {
    errors.push('currency must be 3-letter ISO code');
  }

  // Tax registration integrity
  if (!pack.taxRegistration) {
    errors.push('taxRegistration is required');
  } else {
    if (pack.taxRegistration.tenantId !== pack.tenantId) {
      errors.push(`taxRegistration.tenantId (${pack.taxRegistration.tenantId}) does not match pack.tenantId (${pack.tenantId})`);
    }
    if (pack.taxRegistration.registrationStatus === 'registered' && !pack.taxRegistration.tinNumber) {
      errors.push('registered tenant requires tinNumber');
    }
  }

  // Bank accounts isolation
  for (const b of pack.bankAccounts) {
    if (b.tenantId !== pack.tenantId) {
      errors.push(`bankAccount ${b.id} tenantId (${b.tenantId}) does not match pack.tenantId (${pack.tenantId})`);
    }
  }

  // Opening balance zero-variance check (Trial Balance integrity)
  const totalDebits = Math.round(pack.openingBalances.reduce((acc, b) => acc + b.debit, 0) * 100) / 100;
  const totalCredits = Math.round(pack.openingBalances.reduce((acc, b) => acc + b.credit, 0) * 100) / 100;
  if (totalDebits !== totalCredits) {
    errors.push(`opening balances do not balance: debits (${totalDebits}) != credits (${totalCredits})`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    tenantId: pack.tenantId,
    summary: {
      stageCount: pack.workflowStages.length,
      roleCount: pack.roles.length,
      customerCount: pack.customers.length,
      inventoryCount: pack.inventoryCatalog.length,
      accountsCount: pack.bankAccounts.length,
    },
  };
}

export function rehearseTenantImportPipeline(
  pack: TenantImportPack,
  targetEnvironment: {
    existingTenants: Set<string>;
    isolatedStore: Map<string, Map<string, any[]>>;
  }
): {
  success: boolean;
  provisionedTenantId: string;
  totalRecordsProvisioned: number;
  isolationVerified: boolean;
  errors: readonly string[];
} {
  const validation = validateTenantImportPack(pack);
  if (!validation.isValid) {
    return {
      success: false,
      provisionedTenantId: pack.tenantId,
      totalRecordsProvisioned: 0,
      isolationVerified: false,
      errors: validation.errors,
    };
  }

  // Ensure tenant namespace is registered
  targetEnvironment.existingTenants.add(pack.tenantId);

  let tenantStore = targetEnvironment.isolatedStore.get(pack.tenantId);
  if (!tenantStore) {
    tenantStore = new Map<string, any[]>();
    targetEnvironment.isolatedStore.set(pack.tenantId, tenantStore);
  }

  let totalRecords = 0;

  // Provision Tax Registration
  tenantStore.set('tax_registrations', [{ ...pack.taxRegistration }]);
  totalRecords += 1;

  // Provision Bank Accounts
  tenantStore.set('bank_accounts', pack.bankAccounts.map((b) => ({ ...b })));
  totalRecords += pack.bankAccounts.length;

  // Provision Workflow Stages
  tenantStore.set('workflow_stages', pack.workflowStages.map((s) => ({ ...s, tenantId: pack.tenantId })));
  totalRecords += pack.workflowStages.length;

  // Provision Roles
  tenantStore.set('roles', pack.roles.map((r) => ({ ...r, tenantId: pack.tenantId })));
  totalRecords += pack.roles.length;

  // Provision Customers
  tenantStore.set('customers', pack.customers.map((c) => ({ ...c, tenantId: pack.tenantId })));
  totalRecords += pack.customers.length;

  // Provision Inventory
  tenantStore.set('inventory', pack.inventoryCatalog.map((i) => ({ ...i, tenantId: pack.tenantId })));
  totalRecords += pack.inventoryCatalog.length;

  // Adversarial isolation verification: ensure no records leaked into another tenant's store
  let isolationVerified = true;
  for (const [tId, store] of targetEnvironment.isolatedStore.entries()) {
    if (tId !== pack.tenantId) {
      for (const [table, records] of store.entries()) {
        for (const row of records) {
          if (row.tenantId === pack.tenantId) {
            isolationVerified = false;
          }
        }
      }
    }
  }

  return {
    success: true,
    provisionedTenantId: pack.tenantId,
    totalRecordsProvisioned: totalRecords,
    isolationVerified,
    errors: [],
  };
}

/**
 * CANONICAL IMPORT TEST PACK #1: Club Ignition Garage (Automotive SBU)
 * Sourced from preserved legacy archive.
 */
export const CLUB_IGNITION_TEST_PACK_V1: TenantImportPack = {
  version: '1.0',
  tenantId: 'tenant-ignition',
  name: 'Club Ignition Garage Pvt Ltd',
  slug: 'club-ignition',
  legalName: 'Club Ignition Garage Private Limited',
  industry: 'Automotive & Body Repair',
  currency: 'MVR',
  taxRegistration: {
    tenantId: 'tenant-ignition',
    taxType: 'GGST',
    registrationStatus: 'registered',
    tinNumber: '1004829GST001',
    effectiveFrom: '2023-01-01',
    filingFrequency: 'monthly',
  },
  bankAccounts: [
    {
      id: 'bnk-ign-01',
      tenantId: 'tenant-ignition',
      accountType: 'checking',
      accountName: 'BML MVR Main Garage Operating',
      currency: 'MVR',
      bankName: 'Bank of Maldives',
      accountNumberMasked: '7730******201',
      isDefault: true,
      isActive: true,
    },
  ],
  workflowStages: [
    { stageKey: 'intake', displayName: 'Vehicle Intake & Booking', stageOrder: 1, isMandatory: true, requiredRole: 'counter' },
    { stageKey: 'estimator', displayName: 'Estimation & Parts Quote', stageOrder: 2, isMandatory: true, requiredRole: 'estimator' },
    { stageKey: 'panel_prep', displayName: 'Panel Beating & Prep', stageOrder: 3, isMandatory: false, requiredRole: 'technician' },
    { stageKey: 'spray_booth', displayName: 'Oven Spray & Clearcoat', stageOrder: 4, isMandatory: false, requiredRole: 'technician' },
    { stageKey: 'detailing', displayName: 'Polishing & Detailing', stageOrder: 5, isMandatory: false, requiredRole: 'technician' },
    { stageKey: 'qc_signoff', displayName: 'Quality Control Sign-Off', stageOrder: 6, isMandatory: true, requiredRole: 'qc_signer' },
    { stageKey: 'invoiced', displayName: 'Customer Invoicing', stageOrder: 7, isMandatory: true, requiredRole: 'counter' },
    { stageKey: 'delivery', displayName: 'Vehicle Handover & Gate Pass', stageOrder: 8, isMandatory: true, requiredRole: 'counter' },
  ],
  roles: [
    { roleCode: 'owner', roleName: 'Managing Director / Partner', permissions: ['all'] },
    { roleCode: 'financial_controller', roleName: 'Financial Controller', permissions: ['finance', 'invoices', 'expenses', 'purchases'] },
    { roleCode: 'counter', roleName: 'Counter & Service Advisor', permissions: ['jobs', 'intake', 'invoices', 'customers'] },
    { roleCode: 'technician', roleName: 'Bodyshop Specialist', permissions: ['jobs', 'materials'] },
    { roleCode: 'qc_signer', roleName: 'QC Inspector', permissions: ['jobs', 'qc'] },
  ],
  customers: [
    {
      customerId: 'cust-ign-1',
      name: 'Ahmed Rauf',
      phone: '+960 778-4321',
      email: 'rauf.ahmed@outlook.com',
      island: "Male'",
      vehicles: [{ plateNumber: 'AB1-8842', make: 'Toyota', model: 'Land Cruiser Prado TX', year: 2021 }],
    },
    {
      customerId: 'cust-ign-2',
      name: 'Ibrahim Shaan',
      phone: '+960 790-1122',
      email: 'shaan.ib@gmail.com',
      island: "Hulhumale'",
      vehicles: [{ plateNumber: 'A0B-4491', make: 'Toyota', model: 'GR Supra MK5', year: 2022 }],
    },
  ],
  inventoryCatalog: [
    { sku: 'PPG-DELTRON-5L', name: 'PPG Deltron High Gloss Clearcoat 5L', category: 'Clearcoats', unitCost: 1850, sellingPrice: 2600, initialQuantity: 12 },
    { sku: '3M-FINESSE-1L', name: '3M Perfect-It Finesse-it Polishing Compound 1L', category: 'Detailing', unitCost: 450, sellingPrice: 750, initialQuantity: 24 },
    { sku: 'MAXMEYER-EP-3L', name: 'MaxMeyer High Build Epoxy Primer 3L', category: 'Primers', unitCost: 920, sellingPrice: 1400, initialQuantity: 8 },
  ],
  openingBalances: [
    { accountCode: '1000', accountName: 'Cash & Bank', debit: 45000, credit: 0 },
    { accountCode: '1100', accountName: 'Accounts Receivable', debit: 18500, credit: 0 },
    { accountCode: '1500', accountName: 'Parts & Paint Inventory', debit: 40440, credit: 0 },
    { accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 15000 },
    { accountCode: '3000', accountName: 'Owner Equity & Retained Earnings', debit: 0, credit: 88940 },
  ],
};

/**
 * CANONICAL EQUAL ROLLOUT TENANT #2: Starq Technologies (Parent Company)
 */
export const STARQ_PARENT_TEST_PACK_V1: TenantImportPack = {
  version: '1.0',
  tenantId: 'tenant-starq',
  name: 'Starq Technologies',
  slug: 'starq-tech',
  legalName: 'Starq Technologies LLP',
  industry: 'Software & Engineering Services',
  currency: 'MVR',
  taxRegistration: {
    tenantId: 'tenant-starq',
    taxType: 'GGST',
    registrationStatus: 'not_registered',
    tinNumber: '',
    effectiveFrom: '2024-01-01',
    filingFrequency: 'monthly',
  },
  bankAccounts: [
    {
      id: 'bnk-starq-01',
      tenantId: 'tenant-starq',
      accountType: 'checking',
      accountName: 'BML MVR Corporate Main',
      currency: 'MVR',
      bankName: 'Bank of Maldives',
      accountNumberMasked: '7730******201',
      isDefault: true,
      isActive: true,
    },
  ],
  workflowStages: [
    { stageKey: 'scoping', displayName: 'Project Scoping & Discovery', stageOrder: 1, isMandatory: true, requiredRole: 'owner' },
    { stageKey: 'development', displayName: 'Software Engineering & Sprints', stageOrder: 2, isMandatory: true, requiredRole: 'technician' },
    { stageKey: 'qa_review', displayName: 'Quality Assurance & Audit', stageOrder: 3, isMandatory: true, requiredRole: 'qc_signer' },
    { stageKey: 'delivered', displayName: 'Production Deployment & Billing', stageOrder: 4, isMandatory: true, requiredRole: 'financial_controller' },
  ],
  roles: [
    { roleCode: 'owner', roleName: 'Founder / Managing Director', permissions: ['all'] },
    { roleCode: 'financial_controller', roleName: 'Finance Lead', permissions: ['finance', 'invoices', 'expenses'] },
    { roleCode: 'technician', roleName: 'Staff Engineer', permissions: ['development', 'tasks'] },
  ],
  customers: [
    {
      customerId: 'cust-starq-1',
      name: 'Hoadhaa Marine Services',
      phone: '+960 771-0022',
      email: 'contact@hoadhaa.mv',
      island: "Male'",
    },
  ],
  inventoryCatalog: [],
  openingBalances: [
    { accountCode: '1000', accountName: 'Cash & Bank', debit: 120000, credit: 0 },
    { accountCode: '1100', accountName: 'Accounts Receivable', debit: 35000, credit: 0 },
    { accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 10000 },
    { accountCode: '3000', accountName: 'Partner Capital', debit: 0, credit: 145000 },
  ],
};
