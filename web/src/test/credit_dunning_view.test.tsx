import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreditDunningView } from '../components/sales/CreditDunningView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-315: Customer Credit Limit & Automated Dunning Interface', () => {
  it('renders customer credit profiles, exposure utilization, and dunning queue', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <CreditDunningView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Credit Limit Enforcement & Automated Dunning')).toBeDefined();
    expect(screen.getByText('Customer Credit Limits & Exposure')).toBeDefined();
    expect(screen.getByText('Invoice Credit Evaluator')).toBeDefined();
    expect(screen.getByText('Automated Dunning Notices Queue')).toBeDefined();
    expect(screen.getAllByText('Island Horizon Transport Pvt Ltd').length).toBeGreaterThanOrEqual(1);
  });

  it('updates evaluation when invoice amount exceeds credit limit with hard block', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <CreditDunningView />
        </ERPProvider>
      </AuthProvider>
    );

    const input = screen.getByDisplayValue('8000');
    fireEvent.change(input, { target: { value: '25000' } });

    expect(screen.getByText(/TRANSACTION HARD BLOCKED/)).toBeDefined();
  });

  it('opens and previews bilingual Dunning Notice modal', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <CreditDunningView />
        </ERPProvider>
      </AuthProvider>
    );

    const previewBtns = screen.getAllByText('Preview Notice');
    fireEvent.click(previewBtns[0]);

    expect(screen.getByText('English Subject & Demand:')).toBeDefined();
    expect(screen.getByText(/ދިވެހި ބަޔާން/)).toBeDefined();
  });
});
