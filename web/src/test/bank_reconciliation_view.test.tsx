import { accountClassForCode } from '../domain/accounts';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BankReconciliationView } from '../components/accounts/BankReconciliationView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { JournalEntry } from '../domain/journals';

const mockJournals: JournalEntry[] = [
  {
    id: 'je-test-01',
    entryNumber: 'JE-RCT-001',
    date: '2026-08-05',
    source: 'PAYMENT',
    reference: 'BML-TXN-99120',
    narration: 'Client Settlement',
    lines: [
      { id: 'l1', accountCode: '1010', accountId: 'acc-1010', accountClass: accountClassForCode('1010'), accountName: 'BML MVR', debit: 25000, credit: 0, narration: 'Bank Inflow' },
      { id: 'l2', accountCode: '1100', accountId: 'acc-1100', accountClass: accountClassForCode('1100'), accountName: 'Accounts Receivable', debit: 0, credit: 25000, narration: 'AR Clearing' },
    ],
    totalDebit: 25000,
    totalCredit: 25000,
    isBalanced: true,
    postedBy: 'Test',
    postedAt: '2026-08-05T10:00:00.000Z',
    tenantId: 'tenant-test',
    status: 'POSTED',
  },
];

describe('SERP-296: Bank Reconciliation Interface', () => {
  it('renders bank account selector, KPIs, and sample CSV loader', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <BankReconciliationView journals={mockJournals} />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Bank & Cash Ledger Reconciliation')).toBeDefined();
    expect(screen.getByText('Upload Bank Statement CSV')).toBeDefined();
    expect(screen.getByText('Load Sample BML Statement')).toBeDefined();
  });

  it('loads sample statement, renders transactions, and auto-matches candidate payments', () => {
    const mockCandidates = [
      {
        id: 'cand-01',
        type: 'payment_receipt' as const,
        date: '2026-08-05',
        reference: 'BML-TXN-99120',
        narration: 'Client Settlement',
        amount: 25000,
        isDebit: false,
        reconciled: false,
      },
    ];

    render(
      <AuthProvider>
        <ERPProvider>
          <BankReconciliationView journals={mockJournals} candidateTransactions={mockCandidates} />
        </ERPProvider>
      </AuthProvider>
    );

    const loadSampleBtn = screen.getByText('Load Sample BML Statement');
    fireEvent.click(loadSampleBtn);

    // Assert table rendered
    expect(screen.getByText('BML Transfer IN - Client Settlement')).toBeDefined();
    expect(screen.getByText('Monthly Account Fee')).toBeDefined();

    // Click Auto-Match
    const autoMatchBtn = screen.getByText('Auto-Match High Confidence');
    fireEvent.click(autoMatchBtn);

    // Auto-matched status badge should appear
    expect(screen.getByText('Auto-Matched')).toBeDefined();
  });

  it('opens adjustment modal and creates balanced journal for bank charges', () => {
    const onAddJournalMock = vi.fn();

    render(
      <AuthProvider>
        <ERPProvider>
          <BankReconciliationView journals={mockJournals} onAddAdjustmentJournal={onAddJournalMock} />
        </ERPProvider>
      </AuthProvider>
    );

    const loadSampleBtn = screen.getByText('Load Sample BML Statement');
    fireEvent.click(loadSampleBtn);

    // Locate fee row and click Book Adj
    const bookAdjButtons = screen.getAllByText('Book Adj');
    expect(bookAdjButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookAdjButtons[0]);

    // Modal should be open
    expect(screen.getByText('Book Bank Adjustment Journal')).toBeDefined();

    // Post Adjustment
    const postBtn = screen.getByText('Post Balanced Journal');
    fireEvent.click(postBtn);

    expect(onAddJournalMock).toHaveBeenCalled();
    const createdJe: JournalEntry = onAddJournalMock.mock.calls[0][0];
    expect(createdJe.isBalanced).toBe(true);
    expect(createdJe.tenantId).toBe('tenant-starq');
    expect(createdJe.tenantId).not.toBe('tenant-club-ignition');
  });
});
