import type { IndustryType, PermissionModule, WorkflowStage } from '../types/erp';

export type ArchetypeId =
  | 'general_business'
  | 'software_services'
  | 'professional_services'
  | 'automotive_workshop'
  | 'marine_service'
  | 'medical_clinic'
  | 'wholesale_trading'
  | 'construction_contracting'
  | 'retail';

export interface ArchetypeTerminology {
  customer: string;
  customers: string;
  order: string;
  orders: string;
  primaryAsset: string;
  primaryAssetLabel: string;
  facility: string;
  worker: string;
  workers: string;
  inventory: string;
  purchasing: string;
  activeOrdersHeader: string;
  activeOrdersSubtitle: string;
  showVehicleFields: boolean;
}

export interface ArchetypeDefinition {
  id: ArchetypeId;
  name: string;
  industry: IndustryType;
  terminology: ArchetypeTerminology;
  enabledModules: PermissionModule[];
  inventoryDefaults: {
    unit: string;
    reorderLevel: number;
  };
  documentDefaults: {
    salesDocumentLabel: string;
    orderDocumentLabel: string;
  };
  workflow: Omit<WorkflowStage, 'id' | 'tenantId'>[];
  rolePresets: Array<{
    id: string;
    name: string;
    description: string;
    color: 'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate';
    isSystemAdmin?: boolean;
    jobTitle?: string;
  }>;
}

const coreModules: PermissionModule[] = [
  'dashboard', 'invoices', 'payments', 'expenses', 'inventory',
  'purchasing', 'suppliers', 'reports', 'audit', 'roles', 'users', 'settings',
];

const stage = (
  name: string,
  code: string,
  order: number,
  description: string,
  isInitial = false,
  isCompletedStage = false,
): Omit<WorkflowStage, 'id' | 'tenantId'> => ({
  name,
  code,
  order,
  description,
  color: order % 3 === 0 ? 'emerald' : order % 2 === 0 ? 'amber' : 'blue',
  allowedRoleIds: [],
  isInitial,
  isCompletedStage,
});

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDefinition> = {
  general_business: {
    id: 'general_business',
    name: 'General Commercial ERP',
    industry: 'Custom Service Workshop',
    terminology: {
      customer: 'Customer',
      customers: 'Customers',
      order: 'Work Order',
      orders: 'Work Orders',
      primaryAsset: 'Item / Ref',
      primaryAssetLabel: 'Item / Order Ref',
      facility: 'Location',
      worker: 'Team Member',
      workers: 'Staff',
      inventory: 'Products & Inventory',
      purchasing: 'Purchasing & Bills',
      activeOrdersHeader: 'Active Orders & Work In Progress',
      activeOrdersSubtitle: 'Live status for customer deliverables and project orders',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs'],
    inventoryDefaults: { unit: 'unit', reorderLevel: 5 },
    documentDefaults: { salesDocumentLabel: 'Tax Invoice', orderDocumentLabel: 'Work Order' },
    workflow: [
      stage('Order Received', 'RECEIVED', 1, 'Customer order or work request received.', true),
      stage('In Progress', 'IN_PROGRESS', 2, 'Work is currently being fulfilled.'),
      stage('Review & QC', 'REVIEW', 3, 'Deliverable is reviewed and verified.'),
      stage('Fulfilled', 'FULFILLED', 4, 'Order fulfilled and handed over.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Operations Manager', description: 'Supervises service operations, reviews stock, manages schedules, and staff.', color: 'blue', jobTitle: 'Operations Manager' },
      { id: 'role-accountant', name: 'Financial Controller / Accountant', description: 'Manages Tax Invoices, BML bank slips, MIRA GST reporting, and vendor payouts.', color: 'emerald', jobTitle: 'Finance Officer' },
      { id: 'role-sales', name: 'Sales & Customer Officer', description: 'Handles client proposals, contract orders, invoices, and payment receipts.', color: 'rose', jobTitle: 'Sales Officer' },
      { id: 'role-member', name: 'Team Member', description: 'General task execution and deliverable fulfillment.', color: 'slate', jobTitle: 'Associate' },
    ],
  },

  software_services: {
    id: 'software_services',
    name: 'Software & Engineering Services',
    industry: 'Software & Engineering Services',
    terminology: {
      customer: 'Client',
      customers: 'Clients',
      order: 'Project',
      orders: 'Projects & Deliverables',
      primaryAsset: 'Milestone / Module',
      primaryAssetLabel: 'Project Code / Milestone',
      facility: 'Office / Unit',
      worker: 'Engineer / Specialist',
      workers: 'Engineering & Delivery',
      inventory: 'Services & Subscriptions',
      purchasing: 'Procurement & Vendor Subscriptions',
      activeOrdersHeader: 'Active Projects & Client Deliverables',
      activeOrdersSubtitle: 'Live status for engineering milestones and technical engagements',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs', 'workflows'],
    inventoryDefaults: { unit: 'license', reorderLevel: 0 },
    documentDefaults: { salesDocumentLabel: 'Service Invoice', orderDocumentLabel: 'Project Order' },
    workflow: [
      stage('Scoping & Intake', 'SCOPING', 1, 'Client requirements analyzed and scoped.', true),
      stage('Development / Delivery', 'DELIVERY', 2, 'Active engineering and milestone execution.'),
      stage('UAT & Verification', 'UAT', 3, 'Client acceptance and quality verification.'),
      stage('Completed / Deployed', 'DEPLOYED', 4, 'Project signed off and deployed.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Delivery / Product Manager', description: 'Supervises sprint deliverables, client accounts, and resource allocation.', color: 'blue', jobTitle: 'Product Manager' },
      { id: 'role-accountant', name: 'Finance & Billing Specialist', description: 'Manages client billing, retainer invoicing, and financial compliance.', color: 'emerald', jobTitle: 'Finance Specialist' },
      { id: 'role-lead-tech', name: 'Lead Engineer / Consultant', description: 'Owns architecture, code delivery, and technical milestones.', color: 'amber', jobTitle: 'Lead Engineer' },
      { id: 'role-member', name: 'Associate Engineer', description: 'Engineering and client task delivery.', color: 'slate', jobTitle: 'Software Engineer' },
    ],
  },

  professional_services: {
    id: 'professional_services',
    name: 'Professional Services & Consulting',
    industry: 'Software & Engineering Services',
    terminology: {
      customer: 'Client',
      customers: 'Clients',
      order: 'Engagement',
      orders: 'Client Engagements',
      primaryAsset: 'Milestone / Retainer',
      primaryAssetLabel: 'Engagement Ref / Account',
      facility: 'Consulting Suite',
      worker: 'Consultant / Advisor',
      workers: 'Consultants & Associates',
      inventory: 'Services & Retainers',
      purchasing: 'Vendor Bills & Requisitions',
      activeOrdersHeader: 'Active Engagements & Retainers',
      activeOrdersSubtitle: 'Live status for professional advisory milestones and deliverables',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs', 'workflows'],
    inventoryDefaults: { unit: 'retainer', reorderLevel: 0 },
    documentDefaults: { salesDocumentLabel: 'Professional Fee Invoice', orderDocumentLabel: 'Engagement Letter' },
    workflow: [
      stage('Client Intake & Scope', 'INTAKE', 1, 'Engagement agreement scoped and executed.', true),
      stage('Advisory Execution', 'EXECUTION', 2, 'Professional advisory work in progress.'),
      stage('Partner Review & QC', 'REVIEW', 3, 'Partner inspection and deliverable review.'),
      stage('Deliverable Signoff', 'SIGNOFF', 4, 'Deliverable signed off and closed.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Partner / Super Admin', description: 'Full administrative authority within this professional firm.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Partner' },
      { id: 'role-manager', name: 'Engagement Director', description: 'Supervises consulting engagements and client deliverables.', color: 'blue', jobTitle: 'Engagement Director' },
      { id: 'role-accountant', name: 'Practice Financial Controller', description: 'Manages billing, time accounting, and client payouts.', color: 'emerald', jobTitle: 'Financial Controller' },
      { id: 'role-member', name: 'Senior Associate', description: 'Consulting execution and advisory deliverable production.', color: 'slate', jobTitle: 'Consultant' },
    ],
  },

  automotive_workshop: {
    id: 'automotive_workshop',
    name: 'Automotive & Workshop',
    industry: 'Automotive & Body Repair',
    terminology: {
      customer: 'Customer',
      customers: 'Customers',
      order: 'Job Card',
      orders: 'Job Cards & Bay Work',
      primaryAsset: 'Vehicle',
      primaryAssetLabel: 'Vehicle Plate #',
      facility: 'Bay / Workshop',
      worker: 'Technician',
      workers: 'Technicians & Specialists',
      inventory: 'Paints & Auto Materials',
      purchasing: 'Auto Parts Purchasing',
      activeOrdersHeader: 'Active Work Orders & Floor Bays',
      activeOrdersSubtitle: 'Live floor progress for service and repair packages',
      showVehicleFields: true,
    },
    enabledModules: [...coreModules, 'customers', 'jobs', 'workflows'],
    inventoryDefaults: { unit: 'each', reorderLevel: 5 },
    documentDefaults: { salesDocumentLabel: 'Tax Invoice', orderDocumentLabel: 'Job Card' },
    workflow: [
      stage('Vehicle Intake', 'INTAKE', 1, 'Vehicle received and inspected in bay.', true),
      stage('Prep & Repair', 'PREP', 2, 'Mechanical repair, panel beating, or surface prep.'),
      stage('Paint / Wrap / Assembly', 'EXECUTION', 3, 'Booth spraying, vinyl application, or part install.'),
      stage('Quality Check', 'QC', 4, 'Final inspection and detailing.'),
      stage('Handover Complete', 'COMPLETE', 5, 'Vehicle ready for customer pickup.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Workshop / Operations Manager', description: 'Supervises shop floor, approves estimates, assigns jobs, and manages stock.', color: 'blue', jobTitle: 'Workshop Manager' },
      { id: 'role-accountant', name: 'Financial Controller / Accountant', description: 'Manages Tax Invoices, BML bank slip reconciliation, and MIRA GST reporting.', color: 'emerald', jobTitle: 'Accountant' },
      { id: 'role-lead-tech', name: 'Lead Technician / Spray Specialist', description: 'Logs job progress, records paint usage, and executes vehicle repairs.', color: 'amber', jobTitle: 'Lead Technician' },
      { id: 'role-sales', name: 'Service Advisor / Front Desk', description: 'Intakes customer vehicles, books job estimates, and collects deposits.', color: 'rose', jobTitle: 'Service Advisor' },
    ],
  },

  marine_service: {
    id: 'marine_service',
    name: 'Marine & Boatyard',
    industry: 'Marine & Boatyard',
    terminology: {
      customer: 'Vessel Owner / Client',
      customers: 'Vessel Owners',
      order: 'Service Order',
      orders: 'Slipway & Yard Orders',
      primaryAsset: 'Vessel',
      primaryAssetLabel: 'Vessel Reg # / Name',
      facility: 'Slipway / Dock',
      worker: 'Marine Engineer',
      workers: 'Marine Engineers & Riggers',
      inventory: 'Marine Spares & Composites',
      purchasing: 'Marine Procurement',
      activeOrdersHeader: 'Active Slipway & Yard Orders',
      activeOrdersSubtitle: 'Live progress for vessel overhauls, antifouling, and marine engines',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs', 'workflows'],
    inventoryDefaults: { unit: 'each', reorderLevel: 5 },
    documentDefaults: { salesDocumentLabel: 'Service Invoice', orderDocumentLabel: 'Service Order' },
    workflow: [
      stage('Slipway Haul-Out & Survey', 'HAUL_OUT', 1, 'Vessel hauled onto slipway cradle, underwater hull inspected.', true),
      stage('Hull Prep & Antifouling', 'HULL_PREP', 2, 'High-pressure wash, barnacle scraping, primer coat and antifouling application.'),
      stage('Engine & Mechanical Overhaul', 'ENGINE_OVERHAUL', 3, 'Inboard/Outboard servicing, shaft alignment, propeller balancing.'),
      stage('Sea Trial & Diagnostics', 'SEA_TRIAL', 4, 'Vessel launched for full throttle RPM test, bilge & cooling verification.'),
      stage('Launch Clearance & Handover', 'LAUNCH_SETTLED', 5, 'Harbor master departure clearance, port fee settled, client signoff.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Yard & Slipway Master', description: 'Manages dock berths, vessel movement, and engineering teams.', color: 'blue', jobTitle: 'Yard Master' },
      { id: 'role-accountant', name: 'Marine Finance Officer', description: 'Manages invoices, bunkering expenses, and supplier accounts.', color: 'emerald', jobTitle: 'Finance Officer' },
      { id: 'role-lead-tech', name: 'Chief Marine Engineer', description: 'Oversees inboard/outboard engine repairs and electrical systems.', color: 'amber', jobTitle: 'Chief Engineer' },
    ],
  },

  medical_clinic: {
    id: 'medical_clinic',
    name: 'Medical Clinic & Diagnostics',
    industry: 'Medical Clinic & Diagnostics',
    terminology: {
      customer: 'Patient',
      customers: 'Patients',
      order: 'Consultation / Procedure',
      orders: 'Consultations & Procedures',
      primaryAsset: 'Patient File',
      primaryAssetLabel: 'Patient National ID / Passport',
      facility: 'Clinic Room / Lab',
      worker: 'Practitioner',
      workers: 'Doctors & Clinical Staff',
      inventory: 'Pharmaceuticals & Consumables',
      purchasing: 'Medical Supply Procurement',
      activeOrdersHeader: 'Active Patients & Clinical Procedures',
      activeOrdersSubtitle: 'Live status for patient consultations and diagnostic appointments',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs'],
    inventoryDefaults: { unit: 'box', reorderLevel: 10 },
    documentDefaults: { salesDocumentLabel: 'Medical Bill / Invoice', orderDocumentLabel: 'Clinical Order' },
    workflow: [
      stage('Patient Triage & Registration', 'TRIAGE', 1, 'Vitals logged, national ID/Passport verified, primary symptom triage.', true),
      stage('Doctor Consultation', 'CONSULT', 2, 'Physician physical examination, prescription notes and diagnosis entry.'),
      stage('Diagnostic Lab / X-Ray', 'LAB_WORK', 3, 'Blood draw, specimen analysis, ultrasound/radiology scans.'),
      stage('Pharmacy & Treatment', 'PHARMACY', 4, 'Prescriptions dispensed, injections administered, care instruction.'),
      stage('Patient Discharged & Settled', 'DISCHARGED', 5, 'Aasandha/Allied insurance claimed, co-pay settled, follow-up scheduled.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Medical Director / Super Admin', description: 'Full administrative authority within this healthcare organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Medical Director' },
      { id: 'role-manager', name: 'Clinic Operations Manager', description: 'Manages appointments, duty rosters, and pharmacy stock.', color: 'blue', jobTitle: 'Operations Manager' },
      { id: 'role-accountant', name: 'Billing & Aasandha Officer', description: 'Manages patient billing, insurance claims, and financial reporting.', color: 'emerald', jobTitle: 'Billing Officer' },
      { id: 'role-lead-tech', name: 'Consulting Physician / Specialist', description: 'Conducts clinical consultations and prescribes treatments.', color: 'amber', jobTitle: 'Physician' },
    ],
  },

  wholesale_trading: {
    id: 'wholesale_trading',
    name: 'Wholesale & Trading',
    industry: 'Retail & Wholesale Trading',
    terminology: {
      customer: 'Account / Buyer',
      customers: 'Wholesale Accounts',
      order: 'Sales Order',
      orders: 'Sales Orders',
      primaryAsset: 'SKU / Batch',
      primaryAssetLabel: 'Item SKU / Batch #',
      facility: 'Warehouse / Depot',
      worker: 'Logistics Officer',
      workers: 'Warehouse & Logistics Staff',
      inventory: 'Wholesale Inventory',
      purchasing: 'Container Import Orders',
      activeOrdersHeader: 'Active Sales Orders & Shipments',
      activeOrdersSubtitle: 'Live status for bulk fulfillment and island dispatch',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'workflows'],
    inventoryDefaults: { unit: 'case', reorderLevel: 20 },
    documentDefaults: { salesDocumentLabel: 'Tax Invoice', orderDocumentLabel: 'Sales Order' },
    workflow: [
      stage('Order Received', 'ORDERED', 1, 'Wholesale order accepted.', true),
      stage('Picking & Packing', 'PICKING', 2, 'Stock picked and palletized in warehouse.'),
      stage('Boat / Island Dispatch', 'DISPATCH', 3, 'Cargo transferred to vessel or courier.'),
      stage('Delivered', 'DELIVERED', 4, 'Delivery accepted by buyer.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Warehouse / Supply Chain Manager', description: 'Manages inventory batches, reorder schedules, and dispatch logistics.', color: 'blue', jobTitle: 'Supply Chain Manager' },
      { id: 'role-accountant', name: 'Credit & Accounts Receivable Officer', description: 'Enforces buyer credit limits and reconciles payments.', color: 'emerald', jobTitle: 'Accountant' },
    ],
  },

  construction_contracting: {
    id: 'construction_contracting',
    name: 'Construction & Contracting',
    industry: 'Construction & Engineering',
    terminology: {
      customer: 'Client / Employer',
      customers: 'Clients',
      order: 'Project Contract',
      orders: 'Projects & Contracts',
      primaryAsset: 'Project Site',
      primaryAssetLabel: 'Site Plot # / Island',
      facility: 'Site Office',
      worker: 'Site Engineer',
      workers: 'Site Engineers & Supervisors',
      inventory: 'Construction Materials',
      purchasing: 'Material Requisitions & Bills',
      activeOrdersHeader: 'Active Construction Sites & Milestones',
      activeOrdersSubtitle: 'Live status for contracted milestones, material usage, and certifications',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers', 'jobs', 'workflows'],
    inventoryDefaults: { unit: 'lot', reorderLevel: 2 },
    documentDefaults: { salesDocumentLabel: 'Progress Invoice', orderDocumentLabel: 'Contract' },
    workflow: [
      stage('Tender & Mobilisation', 'MOBILISED', 1, 'Site mobilized and resources allocated.', true),
      stage('Civil & Structural Work', 'STRUCTURAL', 2, 'Foundation, framing, and masonry execution.'),
      stage('Finishing & MEP', 'FINISHING', 3, 'Electrical, plumbing, and interior works.'),
      stage('Handover & Practical Completion', 'HANDOVER', 4, 'Client signoff and handover certificate.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Managing Director' },
      { id: 'role-manager', name: 'Project Director', description: 'Oversees site engineers, project milestones, and contract variations.', color: 'blue', jobTitle: 'Project Director' },
      { id: 'role-accountant', name: 'Quantity Surveyor / Billing Specialist', description: 'Certifies progress claims and manages subcontractor payments.', color: 'emerald', jobTitle: 'Quantity Surveyor' },
    ],
  },

  retail: {
    id: 'retail',
    name: 'Retail & POS Commerce',
    industry: 'Retail & Wholesale Trading',
    terminology: {
      customer: 'Customer',
      customers: 'Customers',
      order: 'POS Sale',
      orders: 'Sales & Receipts',
      primaryAsset: 'Barcode / Product',
      primaryAssetLabel: 'Product Barcode / SKU',
      facility: 'POS Counter / Store',
      worker: 'Sales Associate',
      workers: 'Cashiers & Store Staff',
      inventory: 'Store Merchandise',
      purchasing: 'Store Restock Orders',
      activeOrdersHeader: 'Live POS Registers & Orders',
      activeOrdersSubtitle: 'Active checkout transactions and register operations',
      showVehicleFields: false,
    },
    enabledModules: [...coreModules, 'customers'],
    inventoryDefaults: { unit: 'piece', reorderLevel: 10 },
    documentDefaults: { salesDocumentLabel: 'POS Receipt', orderDocumentLabel: 'Sale Order' },
    workflow: [
      stage('Sale Opened', 'OPEN', 1, 'POS register transaction started.', true),
      stage('Settled & Fulfilled', 'COMPLETED', 2, 'Payment settled and items bagged.', false, true),
    ],
    rolePresets: [
      { id: 'role-superadmin', name: 'Managing Director / Super Admin', description: 'Full administrative authority within this organization.', color: 'purple', isSystemAdmin: true, jobTitle: 'Store Owner' },
      { id: 'role-manager', name: 'Store Manager', description: 'Manages daily register reconciliations, cash floats, and floor stock.', color: 'blue', jobTitle: 'Store Manager' },
      { id: 'role-sales', name: 'Cashier / Sales Associate', description: 'Processes counter sales, barcode scans, and BML QR payments.', color: 'rose', jobTitle: 'Cashier' },
    ],
  },
};

export function getArchetype(id?: string): ArchetypeDefinition {
  if (!id) return ARCHETYPES.general_business;
  if (id in ARCHETYPES) {
    return ARCHETYPES[id as ArchetypeId];
  }
  const normalized = id.toLowerCase();
  if (normalized.includes('clinic') || normalized.includes('medical') || normalized.includes('health')) {
    return ARCHETYPES.medical_clinic;
  }
  if (normalized.includes('marine') || normalized.includes('boatyard') || normalized.includes('vessel')) {
    return ARCHETYPES.marine_service;
  }
  if (normalized.includes('automotive') || normalized.includes('garage') || normalized.includes('auto') || normalized.includes('repair')) {
    return ARCHETYPES.automotive_workshop;
  }
  if (normalized.includes('software') || normalized.includes('tech') || normalized.includes('engineering')) {
    return ARCHETYPES.software_services;
  }
  if (normalized.includes('consult') || normalized.includes('professional') || normalized.includes('legal')) {
    return ARCHETYPES.professional_services;
  }
  if (normalized.includes('wholesale') || normalized.includes('distribution') || normalized.includes('trading')) {
    return ARCHETYPES.wholesale_trading;
  }
  if (normalized.includes('construct') || normalized.includes('contract')) {
    return ARCHETYPES.construction_contracting;
  }
  if (normalized.includes('retail') || normalized.includes('pos') || normalized.includes('store') || normalized.includes('shop')) {
    return ARCHETYPES.retail;
  }
  return ARCHETYPES.general_business;
}

export function getArchetypeTerms(archetypeId?: string): ArchetypeTerminology {
  return getArchetype(archetypeId).terminology;
}

export function provisionArchetypeDefaults(archetypeId: ArchetypeId, tenantId: string) {
  const definition = getArchetype(archetypeId);
  return {
    archetypeId,
    tenantId,
    enabledModules: [...definition.enabledModules],
    workflow: definition.workflow.map((item, index) => ({ ...item, id: `${tenantId}-stage-${index + 1}`, tenantId })),
    inventoryDefaults: { ...definition.inventoryDefaults },
    documentDefaults: { ...definition.documentDefaults },
  };
}
