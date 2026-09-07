import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountsView } from '../components/accounts/AccountsView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

const renderAccountsView = (entry = '/accounts') => {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <ERPProvider>
          <AccountsView />
        </ERPProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('SERP-291: Live Double-Entry Journal Posting UI & General Ledger Explorer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the General Ledger Explorer from its persistent deep link', () => {
    renderAccountsView('/accounts?tab=general_ledger');

    // Verify General Ledger view is visible
    expect(screen.getByText(/Total Ledger Debits/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Ledger Credits/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search voucher #, ref, account, or narration/i)).toBeInTheDocument();
  });

  it('opens Manual Journal Modal and enforces strict double-entry balance validation', async () => {
    renderAccountsView();

    // Click "New Journal"
    const newJournalBtn = screen.getByTestId('new-journal-btn');
    fireEvent.click(newJournalBtn);

    expect(screen.getByText('Post General Ledger Journal Entry')).toBeInTheDocument();
    expect(screen.getByText(/Authoritative double-entry adjustment/i)).toBeInTheDocument();

    // Fill Header
    const narrationInput = screen.getByTestId('journal-narration-input');
    fireEvent.change(narrationInput, { target: { value: 'End of Month Audit Adjustment' } });

    // Enter Unbalanced Amounts: Line 1 Debit = 5000, Line 2 Credit = 3500 (Variance = 1500)
    const line0Debit = screen.getByTestId('line-debit-0');
    const line1Credit = screen.getByTestId('line-credit-1');

    fireEvent.change(line0Debit, { target: { value: '5000' } });
    fireEvent.change(line1Credit, { target: { value: '3500' } });

    // Verify Unbalanced Alert & Post Button Disabled
    expect(screen.getByText(/Unbalanced/i)).toBeInTheDocument();
    expect(screen.getByText(/Please resolve the following before posting/i)).toBeInTheDocument();
    
    const postBtn = screen.getByTestId('post-journal-btn');
    expect(postBtn).toBeDisabled();

    // Click Auto-Balance Helper button
    const autoBalanceBtn = screen.getByTestId('auto-balance-btn');
    fireEvent.click(autoBalanceBtn);

    // Verify it is now balanced to 0.00 variance
    expect(screen.getByText(/Zero Variance Pass/i)).toBeInTheDocument();
    expect(postBtn).not.toBeDisabled();

    // Submit the Journal
    fireEvent.click(postBtn);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText('Post General Ledger Journal Entry')).not.toBeInTheDocument();
    });

  });

  it('drills down from a Chart of Accounts node into its specific General Ledger statement', () => {
    renderAccountsView();

    // Find the view ledger button on an account row
    const viewLedgerBtns = screen.getAllByTitle('View Account in General Ledger');
    expect(viewLedgerBtns.length).toBeGreaterThan(0);

    // Click on the first account ledger button (1000 Assets)
    fireEvent.click(viewLedgerBtns[0]);

    // Active Account Banner appears
    expect(screen.getByText(/General Ledger statement of all double-entry postings for account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear Account Filter/i })).toBeInTheDocument();

    // Click Clear Filter
    const clearBtn = screen.getByRole('button', { name: /Clear Account Filter/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText(/Clear Account Filter/i)).not.toBeInTheDocument();
  });
});
