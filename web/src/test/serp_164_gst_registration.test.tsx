import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { SettingsView } from '../components/settings/SettingsView';
import { ReportsView } from '../components/reports/ReportsView';

const SettingsAndReportsHarness: React.FC<{ initialTenantId?: string }> = ({ initialTenantId = 'tenant-starq' }) => {
  const { currentTenant, switchTenant } = useERP();

  React.useEffect(() => {
    if (initialTenantId && currentTenant.id !== initialTenantId) {
      switchTenant(initialTenantId);
    }
  }, [initialTenantId, currentTenant.id]);

  return (
    <div>
      <SettingsView />
      <div data-testid="reports-container">
        <ReportsView />
      </div>
    </div>
  );
};

describe('SERP-164: Explicit MIRA GST Registration Status State & Reports Reactivity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows changing gstStatus to registered in Settings and immediately reflects in Reports', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <SettingsAndReportsHarness initialTenantId="tenant-starq" />
        </ERPProvider>
      </MemoryRouter>
    );

    // Initial state for tenant-starq: Non-Registered (0% GST)
    expect(screen.getByText(/Non-Registered \(0% GST\)/i)).toBeDefined();

    // Find the GST registration status select
    const select = screen.getByDisplayValue(/Not Registered/i);
    expect(select).toBeDefined();

    // Change value to registered
    await act(async () => {
      fireEvent.change(select, { target: { value: 'registered' } });
    });

    // Enter a TIN
    const tinInput = screen.getByPlaceholderText(/Enter registered TIN, if configured/i);
    await act(async () => {
      fireEvent.change(tinInput, { target: { value: 'DEMO-TIN-TEST' } });
    });

    // Save tenant profile
    const saveBtn = screen.getByRole('button', { name: /Save Tenant Profile/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Reports should immediately reflect GST Registered status on the active financial statements tab
    expect(screen.getByText(/GST Registered/i)).toBeDefined();
  });

  it('proves entering a TIN alone without setting gstStatus to registered keeps the tenant unregistered', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <SettingsAndReportsHarness initialTenantId="tenant-starq" />
        </ERPProvider>
      </MemoryRouter>
    );

    // tenant-starq (Starq Technologies) is not_registered by default
    expect(screen.getByText(/Non-Registered \(0% GST\)/i)).toBeDefined();

    const tinInput = screen.getByPlaceholderText(/Enter registered TIN, if configured/i);
    await act(async () => {
      fireEvent.change(tinInput, { target: { value: 'DEMO-TIN-TEST' } });
    });

    // Save with status remaining not_registered
    const saveBtn = screen.getByRole('button', { name: /Save Tenant Profile/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Reports must still show Non-Registered (0% GST)
    expect(screen.getByText(/Non-Registered \(0% GST\)/i)).toBeDefined();
    expect(screen.queryByText(/GST Registered \(8%\)/i)).toBeNull();
  });
});
