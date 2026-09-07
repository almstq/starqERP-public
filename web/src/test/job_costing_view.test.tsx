import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobCostingView } from '../components/projects/JobCostingView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-012: Projects & Job-Costing Absorption Interface', () => {
  it('renders job costing dashboard, KPI cards, and material/labor absorption breakdown', () => {
    render(
      <AuthProvider>
        <ERPProvider>
          <JobCostingView />
        </ERPProvider>
      </AuthProvider>
    );

    expect(screen.getByText('Projects & Job-Costing Absorption Ledger')).toBeDefined();
    expect(screen.getByText('Quoted Contract Price')).toBeDefined();
    expect(screen.getByText('Total Absorbed Cost (WIP)')).toBeDefined();
    expect(screen.getByText('Gross Profit Margin')).toBeDefined();
    expect(screen.getByText('Direct Materials Allocated')).toBeDefined();
    expect(screen.getByText(/Direct Labor & 15% Overhead Absorption/)).toBeDefined();
    expect(screen.getByText('Hydraulic Seals Kit')).toBeDefined();
    expect(screen.getByText('Ahmed Hassan')).toBeDefined();
  });

  it('handles job completion and COGS journal posting', () => {
    window.alert = vi.fn();
    render(
      <AuthProvider>
        <ERPProvider>
          <JobCostingView />
        </ERPProvider>
      </AuthProvider>
    );

    const completeBtn = screen.getByText('Complete Job & Post COGS to GL');
    fireEvent.click(completeBtn);

    expect(screen.getByText('COGS Capitalized ✓')).toBeDefined();
    expect(window.alert).toHaveBeenCalled();
  });
});
