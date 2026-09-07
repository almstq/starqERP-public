import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import { ERPProvider, useERP } from '../context/ERPContext';
import { BankReconciliationView } from '../components/accounts/BankReconciliationView';
import { CreatePOModal } from '../components/purchasing/CreatePOModal';
import { JournalEntry } from '../domain/journals';

describe('Slice A — Bank Reconciliation Scoping & Neutral PO Defaults', () => {
  it('verifies CreatePOModal initializes with neutral notes and no hardcoded Ignition Ink delivery address', () => {
    const TestConsumer: React.FC = () => {
      const { setIsCreatePOOpen } = useERP();
      React.useEffect(() => {
        setIsCreatePOOpen(true);
      }, [setIsCreatePOOpen]);
      return <CreatePOModal />;
    };

    render(
      <AuthProvider>
        <ERPProvider>
          <TestConsumer />
        </ERPProvider>
      </AuthProvider>
    );

    // Modal title exists
    expect(screen.getByText('Issue Purchase Order')).toBeDefined();

    // Notes input must be empty by default (NOT 'Deliver to Ignition Ink Garage Phase 2 Gate 1.')
    const notesInput = screen.getByLabelText('Delivery Instructions & Notes') as HTMLInputElement;
    expect(notesInput.value).toBe('');
    expect(notesInput.value).not.toContain('Ignition Ink');
    expect(notesInput.value).not.toContain('Garage Phase 2');

    // Default item must NOT hardcode 'Nippon Paint Auto Basecoat'
    const itemInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    const itemDescriptions = itemInputs.map((i) => i.value);
    expect(itemDescriptions).not.toContain('Nippon Paint Auto Basecoat');
  });

  it('proves BankReconciliationView dynamically stamps active tenantId on posted adjustment journals', () => {
    const onAddJournalMock = vi.fn();

    const mockJournals: JournalEntry[] = [
      {
        id: 'je-1',
        entryNumber: 'JE-001',
        date: '2026-08-10',
        source: 'MANUAL',
        reference: 'REF-1',
        narration: 'Opening balance',
        lines: [
          {
            id: 'l-1',
            accountCode: '1010',
            accountId: 'acc-1010',
            accountClass: 'ASSET',
            accountName: 'Bank',
            debit: 10000,
            credit: 0,
            narration: 'Debit',
          },
          {
            id: 'l-2',
            accountCode: '3000',
            accountId: 'acc-3000',
            accountClass: 'EQUITY',
            accountName: 'Equity',
            debit: 0,
            credit: 10000,
            narration: 'Credit',
          },
        ],
        totalDebit: 10000,
        totalCredit: 10000,
        isBalanced: true,
        postedBy: 'user-1',
        postedAt: '2026-08-10T10:00:00Z',
        tenantId: 'tenant-starq',
        status: 'POSTED',
      },
    ];

    render(
      <AuthProvider>
        <ERPProvider>
          <BankReconciliationView journals={mockJournals} onAddAdjustmentJournal={onAddJournalMock} />
        </ERPProvider>
      </AuthProvider>
    );

    // Load sample statement
    fireEvent.click(screen.getByText('Load Sample BML Statement'));

    // Click Book Adj on the fee line
    const bookAdjButtons = screen.getAllByText('Book Adj');
    expect(bookAdjButtons.length).toBeGreaterThan(0);
    fireEvent.click(bookAdjButtons[0]);

    // Modal opens
    expect(screen.getByText('Book Bank Adjustment Journal')).toBeDefined();

    // Post Adjustment
    fireEvent.click(screen.getByText('Post Balanced Journal'));

    expect(onAddJournalMock).toHaveBeenCalled();
    const createdJe: JournalEntry = onAddJournalMock.mock.calls[0][0];

    // Must be balanced and stamped with active tenant-starq, NEVER tenant-club-ignition
    expect(createdJe.isBalanced).toBe(true);
    expect(createdJe.tenantId).toBe('tenant-starq');
    expect(createdJe.tenantId).not.toBe('tenant-club-ignition');
  });
});
