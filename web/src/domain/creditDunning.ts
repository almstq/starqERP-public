export type CreditEnforcementMode = 'HARD_BLOCK' | 'SOFT_WARNING' | 'UNLIMITED';

export interface CustomerCreditProfile {
  customerId: string;
  customerName: string;
  creditLimit: number;
  enforcementMode: CreditEnforcementMode;
  currentArBalance: number;
  pendingOrderBalance: number;
}

export interface CreditEvaluationResult {
  isApproved: boolean;
  isHardBlocked: boolean;
  creditLimit: number;
  currentExposure: number;
  newInvoiceAmount: number;
  projectedExposure: number;
  availableCredit: number;
  excessAmount: number;
  warningMessage?: string;
}

export type DunningTier = 'TIER_1_FRIENDLY' | 'TIER_2_FORMAL_DEMAND' | 'TIER_3_FINAL_LEGAL';

export interface DunningNotice {
  noticeId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  tier: DunningTier;
  tierLabel: string;
  tierLabelDhivehi: string;
  overdueInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    dueDate: string;
    daysOverdue: number;
    amountDue: number;
  }>;
  totalOverdueAmount: number;
  generatedDate: string;
  subjectEnglish: string;
  subjectDhivehi: string;
  bodyEnglish: string;
  bodyDhivehi: string;
}

/**
 * Evaluates whether a new invoice can be issued within the customer's credit limit.
 */
export function evaluateCustomerCredit(
  profile: CustomerCreditProfile,
  newInvoiceAmount: number
): CreditEvaluationResult {
  const currentExposure = round2(profile.currentArBalance + profile.pendingOrderBalance);
  const projectedExposure = round2(currentExposure + newInvoiceAmount);
  const availableCredit = round2(Math.max(0, profile.creditLimit - currentExposure));

  if (profile.enforcementMode === 'UNLIMITED') {
    return {
      isApproved: true,
      isHardBlocked: false,
      creditLimit: profile.creditLimit,
      currentExposure,
      newInvoiceAmount,
      projectedExposure,
      availableCredit: Infinity,
      excessAmount: 0,
    };
  }

  const excessAmount = round2(Math.max(0, projectedExposure - profile.creditLimit));
  const exceeds = excessAmount > 0;

  if (!exceeds) {
    return {
      isApproved: true,
      isHardBlocked: false,
      creditLimit: profile.creditLimit,
      currentExposure,
      newInvoiceAmount,
      projectedExposure,
      availableCredit: round2(profile.creditLimit - projectedExposure),
      excessAmount: 0,
    };
  }

  const isHard = profile.enforcementMode === 'HARD_BLOCK';
  const warningMessage = `Credit limit of MVR ${profile.creditLimit.toLocaleString()} exceeded by MVR ${excessAmount.toLocaleString()} (Total exposure: MVR ${projectedExposure.toLocaleString()}).`;

  return {
    isApproved: !isHard,
    isHardBlocked: isHard,
    creditLimit: profile.creditLimit,
    currentExposure,
    newInvoiceAmount,
    projectedExposure,
    availableCredit: 0,
    excessAmount,
    warningMessage,
  };
}

/**
 * Generates automated 3-tier Dunning Notices for overdue customer accounts.
 */
export function generateDunningNotice(params: {
  customer: { id: string; name: string; email?: string; phone?: string };
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    dueDate: string;
    amount: number;
    amountPaid?: number;
    status?: string;
  }>;
  currentDate?: string;
}): DunningNotice | null {
  const { customer, invoices, currentDate = '2026-08-28' } = params;

  const overdueList: Array<{
    invoiceId: string;
    invoiceNumber: string;
    dueDate: string;
    daysOverdue: number;
    amountDue: number;
  }> = [];

  let maxDaysOverdue = 0;
  let totalOverdue = 0;

  const todayMs = new Date(currentDate).getTime();

  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.status === 'cancelled') continue;
    const dueMs = new Date(inv.dueDate).getTime();
    if (dueMs < todayMs) {
      const days = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
      const bal = round2(inv.amount - (inv.amountPaid || 0));
      if (bal > 0) {
        overdueList.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          dueDate: inv.dueDate,
          daysOverdue: days,
          amountDue: bal,
        });
        totalOverdue += bal;
        if (days > maxDaysOverdue) maxDaysOverdue = days;
      }
    }
  }

  if (overdueList.length === 0) return null;

  let tier: DunningTier = 'TIER_1_FRIENDLY';
  let tierLabel = 'Tier 1: Friendly Payment Reminder';
  let tierLabelDhivehi = 'ފުރަތަމަ ހަނދާންކޮށްދިނުން (އާދައިގެ)';
  let subjectEng = `Payment Reminder: Overdue Invoices on Account - ${customer.name}`;
  let subjectDh = `ފައިސާ ދެއްކުމުގެ ހަނދާންކޮށްދިނުން: ${customer.name}`;
  let bodyEng = `We kindly remind you that payment for the attached invoices is past due. Please settle MVR ${totalOverdue.toLocaleString()} at your earliest convenience via MMA Favara or BML transfer.`;
  let bodyDh = `ތިރީގައިވާ އިންވޮއިސްތަކަށް ދައްކަންޖެހޭ ފައިސާގެ މުއްދަތު ހަމަވެފައިވާތީ، ޖުމްލަ ${totalOverdue.toLocaleString()} ރުފިޔާ ވީއެންމެ އަވަހަކަށް ދައްކަވައިދެއްވުން އެދެމެވެ.`;

  if (maxDaysOverdue > 60) {
    tier = 'TIER_3_FINAL_LEGAL';
    tierLabel = 'Tier 3: Final Statutory Legal Notice';
    tierLabelDhivehi = 'އެންމެ ފަހުގެ ޤާނޫނީ އިންޒާރު';
    subjectEng = `FINAL LEGAL NOTICE: Urgent Settlement Required - ${customer.name}`;
    subjectDh = `އެންމެ ފަހުގެ ޤާނޫނީ އިންޒާރު: ފައިސާ ދެއްކުން - ${customer.name}`;
    bodyEng = `This is a FINAL STATUTORY DEMAND for outstanding balance of MVR ${totalOverdue.toLocaleString()} (${maxDaysOverdue} days overdue). Immediate settlement is required within 48 hours to prevent credit suspension and legal recovery.`;
    bodyDh = `މިއީ ${maxDaysOverdue} ދުވަސް ވެފައިވާ ${totalOverdue.toLocaleString()} ރުފިޔާ ހޯދުމަށް ފޮނުވާ އެންމެ ފަހުގެ ޤާނޫނީ ނޯޓިހެވެ. 48 ގަޑިއިރުގެ ތެރޭގައި ފައިސާ ނުދައްކަވައިފިނަމަ ޝަރީޢަތަށް މައްސަލަ ހުށަހެޅޭނެއެވެ.`;
  } else if (maxDaysOverdue > 30) {
    tier = 'TIER_2_FORMAL_DEMAND';
    tierLabel = 'Tier 2: Formal Demand Notice';
    tierLabelDhivehi = 'ދެވަނަ ނޯޓިސް (ސީރިއަސް އިންޒާރު)';
    subjectEng = `URGENT: Overdue Account Balance - ${customer.name}`;
    subjectDh = `މުހިންމު: މުއްދަތު ހަމަވެފައިވާ ފައިސާ ދެއްކުން - ${customer.name}`;
    bodyEng = `Your account is now ${maxDaysOverdue} days past due with an outstanding balance of MVR ${totalOverdue.toLocaleString()}. Please arrange immediate settlement to prevent credit hold.`;
    bodyDh = `ތިޔަ ފަރާތުގެ އެކައުންޓަށް ${maxDaysOverdue} ދުވަސް ވެފައިވާތީ، ވީއެންމެ އަވަހަކަށް ފައިސާ ދައްކަވައިދެއްވުން އެދެމެވެ.`;
  }

  return {
    noticeId: `DUN-${customer.id}-${Date.now().toString().slice(-6)}`,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    tier,
    tierLabel,
    tierLabelDhivehi,
    overdueInvoices: overdueList,
    totalOverdueAmount: round2(totalOverdue),
    generatedDate: currentDate,
    subjectEnglish: subjectEng,
    subjectDhivehi: subjectDh,
    bodyEnglish: bodyEng,
    bodyDhivehi: bodyDh,
  };
}

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
