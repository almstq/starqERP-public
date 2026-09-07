import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountsView } from '../components/accounts/AccountsView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

const renderAccountsView = (entry = '/accounts?tab=periods') => {
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

describe('SERP-295: Accounting Period Lock & Year-End Close UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the persistent Period Lock destination and displays 12 fiscal periods', () => {
    renderAccountsView();

    expect(screen.getByTestId('period-management-view')).toBeInTheDocument();
    expect(screen.getByText('Open Accounting Periods')).toBeInTheDocument();
    expect(screen.getByText('Locked Closed Months')).toBeInTheDocument();
    expect(screen.getByText('January 2026')).toBeInTheDocument();
    expect(screen.getByText('December 2026')).toBeInTheDocument();
    expect(screen.getByTestId('open-year-end-modal-btn')).toBeInTheDocument();
  });

  it('locks a period and unlocks via audited workflow', async () => {
    renderAccountsView();

    // Lock March 2026
    const lockMarchBtn = screen.getByTestId('lock-btn-period-2026-03');
    fireEvent.click(lockMarchBtn);

    // Verify status updated to LOCKED and unlock button appears
    const unlockMarchBtn = screen.getByTestId('unlock-btn-period-2026-03');
    expect(unlockMarchBtn).toBeInTheDocument();

    // Click Unlock
    fireEvent.click(unlockMarchBtn);

    expect(screen.getByTestId('unlock-period-modal')).toBeInTheDocument();
    expect(screen.getByText('Audited Period Unlock Workflow')).toBeInTheDocument();

    // Fill audit reason
    const textarea = screen.getByPlaceholderText(/e.g. Auditor requested adjustment/i);
    fireEvent.change(textarea, { target: { value: 'Auditor requested adjustment of depreciation voucher.' } });

    // Submit unlock
    const authorizeBtn = screen.getByRole('button', { name: /Authorize & Unlock Period/i });
    fireEvent.click(authorizeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('unlock-period-modal')).not.toBeInTheDocument();
    });

    // March 2026 should be OPEN again
    expect(screen.getByTestId('lock-btn-period-2026-03')).toBeInTheDocument();
  });

  it('opens Year-End Close Wizard and displays roll-forward preview', () => {
    renderAccountsView();

    const yearEndBtn = screen.getByTestId('open-year-end-modal-btn');
    fireEvent.click(yearEndBtn);

    expect(screen.getByTestId('year-end-closing-modal')).toBeInTheDocument();
    expect(screen.getByText(/Fiscal Year-End Closing Wizard/i)).toBeInTheDocument();
    expect(screen.getByText(/Double-Entry Year-End Closing Mechanism/i)).toBeInTheDocument();
  });
});
