import { describe, it, expect } from 'vitest';
import {
  evaluateCustomerCredit,
  generateDunningNotice,
  CustomerCreditProfile,
} from './creditDunning';

describe('SERP-315: Customer Credit Limit & Automated Dunning Engine', () => {
  const sampleProfile: CustomerCreditProfile = {
    customerId: 'cust-101',
    customerName: 'Dhivehi Marine Transport',
    creditLimit: 50000,
    enforcementMode: 'HARD_BLOCK',
    currentArBalance: 35000,
    pendingOrderBalance: 5000,
  };

  it('approves orders within the available credit limit', () => {
    // Current exposure: 40,000 / Limit: 50,000. New order: 8,000 (Projected: 48,000)
    const res = evaluateCustomerCredit(sampleProfile, 8000);
    expect(res.isApproved).toBe(true);
    expect(res.isHardBlocked).toBe(false);
    expect(res.excessAmount).toBe(0);
    expect(res.availableCredit).toBe(2000);
  });

  it('hard-blocks orders exceeding credit limit when HARD_BLOCK is configured', () => {
    // Current: 40,000. New order: 15,000 (Projected: 55,000 / Limit: 50,000)
    const res = evaluateCustomerCredit(sampleProfile, 15000);
    expect(res.isApproved).toBe(false);
    expect(res.isHardBlocked).toBe(true);
    expect(res.excessAmount).toBe(5000);
    expect(res.warningMessage).toContain('Credit limit of MVR 50,000 exceeded by MVR 5,000');
  });

  it('generates Tier 1 Friendly Reminder for 1–30 days overdue invoices', () => {
    const notice = generateDunningNotice({
      customer: { id: 'cust-101', name: 'Dhivehi Marine Transport' },
      invoices: [
        { id: 'inv-01', invoiceNumber: 'INV-100', dueDate: '2026-08-10', amount: 12000, amountPaid: 0 },
      ],
      currentDate: '2026-08-28', // 18 days overdue
    });

    expect(notice).toBeDefined();
    expect(notice?.tier).toBe('TIER_1_FRIENDLY');
    expect(notice?.totalOverdueAmount).toBe(12000);
    expect(notice?.subjectDhivehi).toContain('ފައިސާ ދެއްކުމުގެ ހަނދާންކޮށްދިނުން');
  });

  it('escalates to Tier 3 Final Statutory Legal Notice when overdue exceeds 60 days', () => {
    const notice = generateDunningNotice({
      customer: { id: 'cust-101', name: 'Dhivehi Marine Transport' },
      invoices: [
        { id: 'inv-02', invoiceNumber: 'INV-090', dueDate: '2026-06-01', amount: 45000, amountPaid: 0 },
      ],
      currentDate: '2026-08-28', // 88 days overdue
    });

    expect(notice).toBeDefined();
    expect(notice?.tier).toBe('TIER_3_FINAL_LEGAL');
    expect(notice?.tierLabelDhivehi).toBe('އެންމެ ފަހުގެ ޤާނޫނީ އިންޒާރު');
    expect(notice?.bodyEnglish).toContain('FINAL STATUTORY DEMAND');
  });
});
