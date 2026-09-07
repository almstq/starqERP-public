import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountsView } from '../components/accounts/AccountsView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import {
  buildAccountTree,
  flattenAccountTree,
  CLASS_LABELS,
  SUBTYPE_LABELS,
  AccountRecord,
} from '../domain/accounts';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

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


describe('Chart of Accounts Domain & Hierarchy Algorithms', () => {
  it('builds a multi-level hierarchy tree accurately', () => {
    const tree = buildAccountTree(DEFAULT_CHART_OF_ACCOUNTS);
    expect(tree.length).toBe(6); // Assets (1000), Liabilities (2000), Equity (3000), Revenue (4000), COGS (5000), OPEX (6000)

    const assetRoot = tree.find((node) => node.code === '1000');
    expect(assetRoot).toBeDefined();
    expect(assetRoot?.name).toBe('Assets');
    expect(assetRoot?.children.length).toBeGreaterThan(0);

    const currentAssets = assetRoot?.children.find((node) => node.code === '1100');
    expect(currentAssets).toBeDefined();

    const cashBank = currentAssets?.children.find((node) => node.code === '1110');
    expect(cashBank).toBeDefined();

    const bmlMvr = cashBank?.children.find((node) => node.code === '1111');
    expect(bmlMvr).toBeDefined();
    expect(bmlMvr?.currency).toBe('MVR');
  });

  it('flattens hierarchy nodes based on expanded state', () => {
    const tree = buildAccountTree(DEFAULT_CHART_OF_ACCOUNTS);
    const expandedIds = new Set(['coa-1000']);
    const flat = flattenAccountTree(tree, expandedIds);

    // Should include root nodes and children of coa-1000, but not children of coa-1100
    expect(flat.some((n) => n.code === '1000')).toBe(true);
    expect(flat.some((n) => n.code === '1100')).toBe(true);
    expect(flat.some((n) => n.code === '1110')).toBe(false); // not expanded
  });
});

describe('AccountsView Component & Interactions', { timeout: 15000 }, () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the Chart of Accounts header, summary metrics, and default table rows', () => {
    renderAccountsView();

    expect(screen.getAllByText(/Chart of Accounts/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Total Accounts')).toBeInTheDocument();

    expect(screen.getAllByText(/Assets \(1000s\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Liabilities \(2000s\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Equity \(3000s\)/i).length).toBeGreaterThan(0);

    // Check table headers
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Account Name')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();

    // Check presence of root rows
    expect(screen.getByTestId('account-row-1000')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-2000')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-3000')).toBeInTheDocument();
    expect(screen.getByTestId('account-row-4000')).toBeInTheDocument();
  });

  it('renders a persistent ledger section from a deep link', () => {
    renderAccountsView('/accounts?tab=multi_currency');

    expect(screen.getByText('Multi-Currency & MMA Exchange Rates')).toBeInTheDocument();
    expect(screen.queryByTestId('account-row-1000')).not.toBeInTheDocument();
  });

  it('filters accounts by classification tab', () => {
    renderAccountsView();

    // Click on Liabilities tab
    const liabilityTab = screen.getByRole('button', { name: /Liabilities \(2000s\)/i });
    fireEvent.click(liabilityTab);

    expect(screen.getByTestId('account-row-2000')).toBeInTheDocument();
    expect(screen.queryByTestId('account-row-1000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-row-3000')).not.toBeInTheDocument();
  });

  it('searches accounts by code and account name in real time', () => {
    renderAccountsView();

    const searchInput = screen.getByPlaceholderText(/Search by code, account name, or subtype/i);
    fireEvent.change(searchInput, { target: { value: '1111' } });

    expect(screen.getByText('Bank of Maldives (BML) MVR Main')).toBeInTheDocument();
    expect(screen.queryByText('Retained Earnings')).not.toBeInTheDocument();
  });

  it('opens New Account Modal and creates a new custom sub-account', async () => {
    renderAccountsView();

    const newBtn = screen.getByTestId('add-account-btn');
    fireEvent.click(newBtn);

    expect(screen.getByTestId('new-account-form')).toBeInTheDocument();
    expect(screen.getByText('Create New Account')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. BML USD Operational Savings/i);
    const codeInput = screen.getByPlaceholderText(/e\.g\. 1116/i);

    fireEvent.change(nameInput, { target: { value: 'MIB USD Special Projects Fund' } });
    fireEvent.change(codeInput, { target: { value: '1116' } });

    const submitBtn = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('new-account-form')).not.toBeInTheDocument();
    });

    // Verify search finds newly created account
    const searchInput = screen.getByPlaceholderText(/Search by code, account name, or subtype/i);
    fireEvent.change(searchInput, { target: { value: '1116' } });
    expect(screen.getByText('MIB USD Special Projects Fund')).toBeInTheDocument();
  });

  it('prevents creating duplicate account codes with validation error message', () => {
    renderAccountsView();

    const newBtn = screen.getByTestId('add-account-btn');
    fireEvent.click(newBtn);

    const nameInput = screen.getByPlaceholderText(/e\.g\. BML USD Operational Savings/i);
    const codeInput = screen.getByPlaceholderText(/e\.g\. 1116/i);

    // Try using existing code 1111
    fireEvent.change(nameInput, { target: { value: 'Duplicate BML Account' } });
    fireEvent.change(codeInput, { target: { value: '1111' } });

    const submitBtn = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Account code "1111" is already used by/i)).toBeInTheDocument();
  });
});
