export type NavigationTab =
  | 'dashboard'
  | 'customers'
  | 'jobs'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'inventory'
  | 'purchasing'
  | 'suppliers'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'setup';

export type CustomerType = 'Individual' | 'Corporate' | 'Fleet' | 'VIP';

export interface Vehicle {
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  color: string;
  type: 'Car' | 'Motorcycle' | 'Speedboat/Jetski' | 'Van/Truck';
}

export type CustomerLifecycleStage = 'Lead' | 'Active' | 'VIP' | 'Inactive' | 'Blocked';

export interface Customer {
  id: string;
  tenantId?: string;
  name: string;
  phone: string;
  email: string;
  type: CustomerType;
  lifecycleStage?: CustomerLifecycleStage;
  consentGiven?: boolean;
  consentTimestamp?: string;
  consentChannel?: 'Phone' | 'Email' | 'In-Person' | 'Web';
  island: string;
  vehicles: Vehicle[];
  activeJobsCount: number;
  totalInvoiced: number;
  outstandingBalance: number;
  lastPaymentDate?: string;
  logoUrl?: string;
  tags?: string[];
  notes: string;
  createdAt: string;
}

export type JobStatus =
  | 'Draft'
  | 'Awaiting Approval'
  | 'In Progress'
  | 'Waiting for Material'
  | 'Completed'
  | 'Invoiced'
  | 'Paid'
  | string; // Support configurable stages

export type ServiceType =
  | 'Full Body Repaint'
  | 'Vinyl Wrap Installation'
  | 'Ceramic & Detailing'
  | 'Panel Repaint'
  | 'PPF Protection Film'
  | 'Caliper & Wheel Custom'
  | 'Paint Correction'
  | 'Custom Paint'
  | 'Hull Overhaul & Antifouling'
  | 'Engine Diagnostics'
  | 'General Medical Consultation'
  | 'Specialist Diagnostic'
  | string;

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
}

export interface MaterialUsageItem {
  id: string;
  inventoryId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  addedAt: string;
}

export interface JobOrder {
  id: string;
  jobId: string; // e.g. IGN-0234
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicle: Vehicle;
  serviceType: ServiceType;
  requestedWork: string;
  specialInstructions?: string;
  quotedAmount: number;
  depositPaid: number;
  balanceDue: number;
  assignedStaff: StaffMember[];
  status: JobStatus;
  priority: 'Normal' | 'High' | 'Urgent';
  startDate: string;
  expectedCompletionDate: string;
  completedDate?: string;
  materialsUsed: MaterialUsageItem[];
  estimatedMaterialCost: number;
  actualMaterialCost: number;
  laborCostEstimate: number;
  targetMarginPercentage: number;
  actualProfit: number;
  linkedInvoiceId?: string;
  bayNumber: string;
  projectRef?: string;
  location?: string;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  category: 'Labor/Service' | 'Material/Part' | 'Custom Fabrication' | 'Consumables' | string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerIsland: string;
  linkedJobId?: string;
  linkedJobNumber?: string;
  date: string;
  dueDate: string;
  items: InvoiceLineItem[];
  subtotal: number;
  gstRate: number; // e.g., 8%
  gstAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  notes?: string;
  bankDetails: string;
  /**
   * Settlement allocations recorded against this invoice (SERP-294).
   * Optional: every consumer already guards with `(invoice.payments || [])`,
   * and invoices created before settlement allocation existed have none.
   */
  payments?: InvoicePaymentAllocation[];
  /**
   * Allocation state derived from `payments` (SERP-294). Distinct from `status`:
   * `status` is the invoice lifecycle (Draft/Sent/Overdue/Cancelled...), while
   * this is purely how much of it has been settled. src/lib/settlement.ts sets
   * both, and they are deliberately not the same vocabulary.
   */
  paymentStatus?: 'Unpaid' | 'Partial' | 'Paid';
}

/** One payment allocated against an invoice. See src/lib/settlement.ts. */
export interface InvoicePaymentAllocation {
  id: string;
  amount: number;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentDate?: string;
  /** Free text: settlement sources include 'Credit Note' and 'Customer Advance', which are not PaymentMethod values. */
  paymentMethod?: string;
  reference?: string;
  customerName?: string;
  recordedBy?: string;
}

export type PaymentMethod =
  | 'BML Bank Transfer'
  | 'BML Transfer'
  | 'MIB Transfer'
  | 'Cash'
  | 'POS Card'
  | 'Cheque';

export type PaymentStatus = 'Verified' | 'Pending Reconciliation' | 'Flagged';

export interface Payment {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  referenceNumber: string;
  bankAccount?: string;
  status: PaymentStatus;
  notes?: string;
}

export type ExpenseCategory =
  | 'Workshop Rent (Hulhumale)'
  | 'Electricity & Spray Booth'
  | 'Consumables & Tools'
  | 'Payroll & Commissions'
  | 'Equipment Maintenance'
  | 'Shipping & Sea Freight'
  | 'Marketing & Ads'
  | 'Office & Admin'
  | string;

export interface Expense {
  id: string;
  expenseNumber: string;
  category: ExpenseCategory;
  payee: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  receiptRef?: string;
  status: 'Paid' | 'Pending Approval';
}

export type StockCategory =
  | 'Paints & Primers'
  | 'Clearcoats & Hardener'
  | 'Vinyl & PPF Wraps'
  | 'Abrasives & Sanding'
  | 'Fillers & Sealants'
  | 'Compounds & Detailing'
  | 'Masking & Prep'
  | 'Tools & PPE'
  | string;

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: StockCategory;
  quantityOnHand: number;
  unit: string;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
  supplierId: string;
  supplierName: string;
  locationInShop: string;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock';
  lastRestockedDate: string;
}

export interface StockMovement {
  id: string;
  tenantId?: string;
  itemId: string;
  itemName: string;
  type: 'Received' | 'Deducted (Job)' | 'Adjustment' | 'Waste' | 'Transfer';
  quantity: number;
  unit: string;
  unitCost?: number;
  totalValue?: number;
  date: string;
  reference: string;
  actorId?: string;
  staffName: string;
  sourceLocation?: string;
  destinationLocation?: string;
  notes?: string;
}

export interface InventoryValuationSummary {
  tenantId: string;
  totalItems: number;
  totalUnitsOnHand: number;
  totalValuationCost: number;
  totalPotentialRetailValue: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
  asOfDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  islandOrCountry: string;
  category: string;
  outstandingPayable: number;
  leadTimeDays: number;
  rating: number;
}

export type POStatus = 'Draft' | 'Sent' | 'Partially Received' | 'Received & Stocked' | 'Cancelled';

export interface POLineItem {
  id: string;
  inventoryId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  items: POLineItem[];
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  status: POStatus;
  paymentStatus: 'Unpaid' | 'Paid' | 'Partially Paid';
  notes?: string;
}

export interface CommercialDocumentProvenance {
  tenantId: string;
  documentType: 'Quote' | 'Invoice' | 'PurchaseOrder' | 'Expense' | 'CreditNote';
  documentNumber: string;
  createdBy: string;
  approvedBy?: string;
  approvalStatus: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';
  createdAt: string;
  auditLogId?: string;
}

export interface TaxWorkingPaperSummary {
  tenantId: string;
  taxPeriod: string; // e.g. "2026-Q3" or "2026-08"
  gstRegistrationStatus: 'registered' | 'not_registered' | 'pending';
  tinNumber?: string;
  applicableGstRate: number; // e.g. 0.08 or 0
  totalTaxableSales: number;
  totalOutputGst: number;
  totalTaxablePurchases: number;
  totalInputGst: number;
  netGstPayable: number;
  salesDocumentCount: number;
  purchaseDocumentCount: number;
  isReviewable: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  status: 'Draft' | 'Reviewed' | 'Filed';
}

export interface NeedsAttentionAlert {
  id: string;
  type: 'overdue_invoice' | 'low_stock' | 'supplier_due' | 'job_waiting' | 'payment_unreconciled' | 'pending_user_approval';
  title: string;
  description: string;
  amount?: number;
  urgency: 'critical' | 'warning' | 'info';
  actionLabel: string;
  targetTab: NavigationTab;
  targetId?: string;
}

export interface AIAssistantInsight {
  id: string;
  title: string;
  category: 'Cash Flow' | 'Inventory' | 'Job Margin' | 'Receivables';
  impact: string;
  description: string;
  recommendedAction: string;
  actionButtonLabel: string;
  actionPayload?: {
    actionType: 'open_po_draft' | 'view_job_margin' | 'filter_overdue' | 'reconcile_bml';
    targetId?: string;
  };
}

// Multi-tenant Organization Definitions
export type IndustryType =
  | 'Automotive & Body Repair'
  | 'Marine & Boatyard'
  | 'Medical Clinic & Diagnostics'
  | 'Retail & Wholesale Trading'
  | 'Construction & Engineering'
  | 'Software & Engineering Services'
  | 'Custom Service Workshop';

/**
 * Whether the tenant is actually registered for GST with MIRA.
 *
 * This gates every statutory surface in the client. It exists because on
 * 24 August 2026 the Reports page rendered a TIN, an 8% rate, a computed
 * "Net MIRA GST Payable" and a "Ready for June 28 Return" badge for a company
 * that is NOT GST-registered (DEC-073 §10). A tax position is a claim about the
 * business, not a layout decision — so it is driven by data that can be false,
 * never by markup that is always true.
 *
 * Registration is a threshold test, not a choice: MIRA requires registration
 * above the turnover threshold. Until `registered` is set from a verified
 * source, no GST figure, rate, TIN or filing status may be shown.
 */
export type GstRegistrationStatus = 'not_registered' | 'registered';

export interface OrganisationTenant {
  id: string;
  name: string;
  slug: string;
  /** Shared configuration identity; never a code fork or security boundary. */
  archetypeId?: import('../domain/archetypes').ArchetypeId;
  legalName: string;
  industry: IndustryType;
  currency: 'MVR' | 'USD';
  currencySymbol: string;
  /** MIRA TIN. Empty until registration is verified — never a placeholder. */
  tinNumber: string;
  gstStatus: GstRegistrationStatus;
  /** General GST is 8%. Tourism GST is 17% from 1 July 2025 (DEC-073). */
  gstRate: number;
  financialYearStart: string; // e.g. "01-01" (Jan 1)
  financialYearEnd: string; // e.g. "12-31" (Dec 31)
  phone: string;
  email: string;
  address: string;
  island: string;
  atoll: string;
  bmlAccount: string;
  mibAccount?: string;
  logoIcon?: string;
  logoUrl?: string;
  themeColor: string;
  createdAt: string;
  books?: OrganisationBook[];
  outlets?: Outlet[];
  enabledModules?: PermissionModule[];
}

export interface OrganisationBook {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  archetypeId?: import('../domain/archetypes').ArchetypeId;
  isDefault?: boolean;
}

export interface Outlet {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  tradingBrand: string;
  island: string;
  address?: string;
  phone?: string;
  isPrimary?: boolean;
}

export interface ModuleEntitlement {
  tenantId: string;
  modules: PermissionModule[];
  maxOutlets: number;
  maxUsers: number;
}


// Configurable Workflow Stages
export interface WorkflowStage {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description: string;
  color: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'slate' | 'indigo' | 'cyan';
  order: number;
  allowedRoleIds: string[]; // Who can transition jobs into this stage
  slaHours?: number; // Target turnaround in hours
  requiresNotes?: boolean;
  requiresChecklist?: boolean;
  checklistItems?: string[];
  isInitial?: boolean;
  isCompletedStage?: boolean;
  isBillingStage?: boolean;
}

// User & Role-Based Access Control (RBAC)
export type PermissionModule =
  | 'dashboard'
  | 'customers'
  | 'jobs'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'inventory'
  | 'purchasing'
  | 'suppliers'
  | 'reports'
  | 'audit'
  | 'workflows'
  | 'roles'
  | 'users'
  | 'settings';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage';

export interface UserRole {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  color: 'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate';
  isSystemAdmin: boolean; // Has full capabilities regardless of module overrides
  permissions: {
    [module in PermissionModule]?: PermissionAction[];
  };
}

export type UserStatus = 'Active' | 'Pending Approval' | 'Suspended';

export interface AppUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  roleId: string;
  roleName: string;
  status: UserStatus;
  invitedAt: string;
  authorizedBy?: string;
  authorizedAt?: string;
  lastActiveAt: string;
  jobTitle?: string;
  mfaEnabled?: boolean;
  mfaRequired?: boolean;
  mfaEnrolledAt?: string;
  mfaSecret?: string;
  recoveryCodes?: string[];
}

// Activity / Audit Log Entry (The Owner's Evidence)
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  userRole: string;
  userEmail: string;
  action:
    | 'CREATED'
    | 'UPDATED'
    | 'DELETED'
    | 'STATUS_CHANGED'
    | 'STAGE_TRANSITIONED'
    | 'PAYMENT_RECORDED'
    | 'USER_AUTHORIZED'
    | 'USER_INVITED'
    | 'STAFF_INVITED'
    | 'INVITATION_RESENT'
    | 'INVITATION_REVOKED'
    | 'USER_SUSPENDED'
    | 'ROLE_UPDATED'
    | 'WORKFLOW_MODIFIED'
    | 'ORG_CONFIG_SAVED'
    | 'STOCK_ADJUSTED'
    | 'INVOICE_ISSUED';
  module: PermissionModule;
  entityType: string; // 'JobOrder', 'Invoice', 'Payment', 'User', 'Role', 'WorkflowStage', 'InventoryItem'
  entityId: string;
  entityName: string;
  summary: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  ipAddress: string;
  location: string;
  timestamp: string;
  /**
   * Free-form context, mirroring the `metadata` jsonb column on
   * public.audit_events. AuditLogView renders it behind a presence guard.
   */
  metadata?: Record<string, unknown>;
}

// Aliases for component convenience
export type InventoryCategory = StockCategory | string;
export type InvoiceItem = InvoiceLineItem | {
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};
export type PurchaseOrderItem = POLineItem | {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
};
