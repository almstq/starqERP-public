import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayrollManagementView } from '../components/payroll/PayrollManagementView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-011: Maldives HR & Statutory Payroll Interface', () => {
  it('renders payroll dashboard, summary KPI cards, and staff payslip breakdown', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <PayrollManagementView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('HR & Maldives Statutory Payroll')).toBeDefined();
    expect(screen.getByText('Total Gross Payroll')).toBeDefined();
    expect(screen.getByText('MRPS Pension (14% Total)')).toBeDefined();
    expect(screen.getByText('Ahmed Hassan')).toBeDefined();
    expect(screen.getByText('Ramesh Kumar')).toBeDefined();
    expect(screen.getByText('Post Payroll Accrual to GL')).toBeDefined();
  });

  it('updates payroll calculations when toggling Ramadan Month allowance', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <PayrollManagementView />
        </ERPProvider>
      </AuthProvider>
    );

    const ramadanCheckbox = screen.getByLabelText('Ramadan Month (MVR 3,000 Allowance)');
    fireEvent.click(ramadanCheckbox);

    // Ramadan column should now be present in table headers
    expect(screen.getByText('Ramadan')).toBeDefined();
  });

  it('posts payroll accrual journal to general ledger upon button click', () => {
    window.alert = vi.fn();
    render(
      <AuthProvider>
        <ERPProvider>
          <PayrollManagementView />
        </ERPProvider>
      </AuthProvider>
    );

    const postBtn = screen.getByText('Post Payroll Accrual to GL');
    fireEvent.click(postBtn);

    expect(screen.getByText('Posted to GL ✓')).toBeDefined();
    expect(window.alert).toHaveBeenCalled();
  });
});
