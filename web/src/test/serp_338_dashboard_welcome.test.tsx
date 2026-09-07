import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardView } from '../components/dashboard/DashboardView';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

describe('SERP-338: Dashboard Personalized Welcome & Authoritative Context', () => {
  it('renders personalized welcome greeting with authenticated user, tenant company, active book, and zero attention state', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <ERPProvider>
              <DashboardView />
            </ERPProvider>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Dynamic greeting based on time of day
    expect(screen.getByText(/(Good morning|Good afternoon|Good evening),/i)).toBeDefined();

    // Legal Company / Tenant and Book code
    const companyMatches = screen.getAllByText(/Starq Technologies/i);
    expect(companyMatches.length).toBeGreaterThan(0);
    expect(screen.getByText(/STQ/i)).toBeDefined();

    // Truthful zero-state attention wording
    expect(screen.getByText(/No items require your attention right now\./i)).toBeDefined();
  });
});
