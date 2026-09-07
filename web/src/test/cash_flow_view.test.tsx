import { accountClassForCode } from '../domain/accounts';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CashFlowStatementView } from '../components/reports/CashFlowStatementView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { JournalEntry } from '../domain/journals';

const mockJournals: JournalEntry[] = [
  {
    id: 'je-01',
    entryNumber: 'JE-RCT-001',
    date: '2026-08-05',
    source: 'PAYMENT',
    reference: 'RCT-1001',
    narration: 'Customer Settlement',
    lines: [
      { id: 'l1', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 50000, credit: 0, narration: 'Bank Receipt' },
      { id: 'l2', accountCode: '1100', accountId: 'acc-1100', accountClass: accountClassForCode('1100'), accountName: 'Accounts Receivable', debit: 0, credit: 50000, narration: 'AR Clearing' },
    ],
    totalDebit: 50000,
    totalCredit: 50000,
    isBalanced: true,
    postedBy: 'System',
    postedAt: '2026-08-05T10:00:00Z',
    tenantId: 'tenant-01',
    status: 'POSTED',
  },
];

describe('SERP-317: Statement of Cash Flows Interface', () => {
  it('renders Statement of Cash Flows header, 4 KPI cards, and activity sections', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <CashFlowStatementView journals={mockJournals} />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Statement of Cash Flows (IFRS)')).toBeDefined();
    expect(screen.getByText('Operating Cash Flow')).toBeDefined();
    expect(screen.getByText('Investing Cash Flow')).toBeDefined();
    expect(screen.getByText('Financing Cash Flow')).toBeDefined();
    expect(screen.getByText('Closing Cash & Bank')).toBeDefined();
    expect(screen.getByText(/1. Cash Flows from Operating Activities/)).toBeDefined();
    expect(screen.getByText('Export CSV')).toBeDefined();
  });
});
