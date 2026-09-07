import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BilingualInvoicePrintView } from '../components/invoices/BilingualInvoicePrintView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-323: Bilingual Dhivehi (Thaana) & English Invoice Print Interface', () => {
  it('renders official Bilingual Tax Invoice with Thaana terms and Favara QR box', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <BilingualInvoicePrintView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Document Language:')).toBeDefined();
    expect(screen.getByText(/TAX INVOICE/)).toBeDefined();
    expect(screen.getByText(/ޓެކްސް އިންވޮއިސް/)).toBeDefined();
    expect(screen.getAllByText(/ޖީ\.އެސް\.ޓީ/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ފަވަރަ \/ ބީ\.އެމް\.އެލް/)).toBeDefined();
    expect(screen.getByTestId('favara-qr-not-configured')).toBeDefined();
    expect(screen.queryByAltText('Favara Instant Pay QR')).toBeNull();
  });

  it('switches between Bilingual, Dhivehi Only, and English Only view modes', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <BilingualInvoicePrintView />
        </ERPProvider>
      </AuthProvider>
    );

    const dhivehiBtn = screen.getByText('ދިވެހި (Thaana)');
    fireEvent.click(dhivehiBtn);

    expect(screen.getByText('ޓެކްސް އިންވޮއިސް')).toBeDefined();

    const englishBtn = screen.getByText('English');
    fireEvent.click(englishBtn);

    expect(screen.getByText('TAX INVOICE')).toBeDefined();
  });
});
