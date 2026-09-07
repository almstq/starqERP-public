import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsolidatedReportingView } from '../components/reports/ConsolidatedReportingView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-010: Multi-Branch Consolidated Reporting Interface', () => {
  it('renders multi-branch segmented financial matrix and consolidated totals', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <ConsolidatedReportingView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Multi-Branch Consolidated Financial Reporting')).toBeDefined();
    expect(screen.getByText('Consolidated External Revenue')).toBeDefined();
    expect(screen.getByText('Inter-Company Eliminations')).toBeDefined();
    expect(screen.getByText('Consolidated Gross Profit')).toBeDefined();
    expect(screen.getByText('Consolidated Net Income')).toBeDefined();
    expect(screen.getByText('Corporate Head Office (Male)')).toBeDefined();
    expect(screen.getByText('Thilafushi Heavy Marine Yard')).toBeDefined();
  });

  it('handles CSV export download trigger', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <ConsolidatedReportingView />
        </ERPProvider>
      </AuthProvider>
    );

    const exportBtn = screen.getByText('Export Consolidated CSV');
    expect(exportBtn).toBeDefined();
    fireEvent.click(exportBtn);
  });
});
