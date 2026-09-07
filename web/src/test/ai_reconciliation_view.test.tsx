import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiReconciliationView } from '../components/banking/AiReconciliationView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-016: AI-Assisted Reconciliation & OCR Interface', () => {
  it('renders OCR sandbox and AI match suggestions with confidence scores', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <AiReconciliationView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('AI-Assisted Reconciliation & OCR Extraction')).toBeDefined();
    expect(screen.getByText('Smart Receipt / BML Slip OCR Parser')).toBeDefined();
    expect(screen.getByText('AI Multi-Factor Match Suggestions')).toBeDefined();
    expect(screen.getByText('DEMO-INVOICE-01')).toBeDefined();
    expect(screen.getByText('DEMO-BILL-02')).toBeDefined();
  });

  it('extracts OCR fields when clicking Extract Data', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <AiReconciliationView />
        </ERPProvider>
      </AuthProvider>
    );

    const extractBtn = screen.getByText('Extract Data');
    fireEvent.click(extractBtn);

    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(2);
  });

  it('handles accepting AI match suggestion', () => {
    window.alert = vi.fn();
    render(
      <AuthProvider>
        <ERPProvider>
          <AiReconciliationView />
        </ERPProvider>
      </AuthProvider>
    );

    const acceptBtns = screen.getAllByText('Accept & Auto-Reconcile');
    fireEvent.click(acceptBtns[0]);

    expect(screen.getByText('Reconciliation Proposal Created ✓')).toBeDefined();
    expect(window.alert).toHaveBeenCalled();
  });
});
