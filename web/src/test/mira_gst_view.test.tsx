import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiraGst201View } from '../components/tax/MiraGst201View';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-297: MIRA GST-201 Tax Return Interface', () => {
  it('renders official MIRA 201 return header, TIN, and 13-box tax computation', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <MiraGst201View />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('MIRA GST-201 Tax Return')).toBeDefined();
    expect(screen.getByText(/Part A: Tax on Supplies/)).toBeDefined();
    expect(screen.getByText(/Part B: Input Tax on Purchases/)).toBeDefined();
    expect(screen.getByText(/Net GST Payable/)).toBeDefined();
    expect(screen.getByText('MIRAconnect CSV')).toBeDefined();
  });

  it('toggles granular taxable supply and purchase audit trail tables', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <MiraGst201View />
        </ERPProvider>
      </AuthProvider>
    );

    const suppliesBtn = screen.getByText(/Taxable Supplies Audit Trail/);
    fireEvent.click(suppliesBtn);

    expect(screen.getByText('Invoice #')).toBeDefined();
    expect(screen.getByText('GST (8%)')).toBeDefined();

    const purchasesBtn = screen.getByText(/Taxable Purchases Audit Trail/);
    fireEvent.click(purchasesBtn);

    expect(screen.getByText('Supplier / Vendor')).toBeDefined();
    expect(screen.getByText('Input Tax (8%)')).toBeDefined();
  });
});
