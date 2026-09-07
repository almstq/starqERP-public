import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { INITIAL_TENANTS } from '../data/mockData';

const DualTenantTestHarness: React.FC = () => {
  const { currentTenant, tenants, switchTenant } = useERP();

  return (
    <div>
      <div data-testid="current-tenant-id">{currentTenant.id}</div>
      <div data-testid="current-tenant-name">{currentTenant.name}</div>
      <div data-testid="current-tenant-slug">{currentTenant.slug}</div>
      <div data-testid="current-tenant-outlets-count">{currentTenant.outlets?.length || 0}</div>
      <div data-testid="tenants-list-count">{tenants.length}</div>

      <button
        onClick={() => switchTenant('tenant-starq')}
        data-testid="btn-switch-starq"
      >
        Switch to Starq Technologies
      </button>

      <button
        onClick={() => switchTenant('tenant-ignition')}
        data-testid="btn-switch-ignition"
      >
        Switch to Club Ignition
      </button>
    </div>
  );
};

describe('SERP-002: Dual-Tenant Organisation, Outlet & Module Spine', () => {
  it('seeds Starq Technologies and Club Ignition as equal primary ledger tenants', () => {
    const starq = INITIAL_TENANTS.find((t) => t.id === 'tenant-starq');
    const ignition = INITIAL_TENANTS.find((t) => t.id === 'tenant-ignition');

    expect(starq).toBeDefined();
    expect(starq?.name).toBe('Starq Technologies Pvt Ltd');
    expect(starq?.legalName).toBe('Starq Technologies Private Limited');
    expect(starq?.industry).toBe('Software & Engineering Services');

    expect(ignition).toBeDefined();
    expect(ignition?.name).toBe('Club Ignition Pvt Ltd');
    expect(ignition?.legalName).toBe('Club Ignition Private Limited');
    expect(ignition?.industry).toBe('Automotive & Body Repair');
  });

  it('treats Starq Dynamics and Ignition Ink as outlets/brands bound to their parent tenants', () => {
    const starq = INITIAL_TENANTS.find((t) => t.id === 'tenant-starq');
    expect(starq?.outlets).toBeDefined();
    expect(starq?.outlets?.some((o) => o.name === 'Starq Dynamics')).toBe(true);
    expect(starq?.outlets?.find((o) => o.name === 'Starq Dynamics')?.tenantId).toBe('tenant-starq');

    const ignition = INITIAL_TENANTS.find((t) => t.id === 'tenant-ignition');
    expect(ignition?.outlets).toBeDefined();
    expect(ignition?.outlets?.some((o) => o.name === 'Ignition Ink Garage')).toBe(true);
    expect(ignition?.outlets?.find((o) => o.name === 'Ignition Ink Garage')?.tenantId).toBe('tenant-ignition');
  });

  it('allows seamless switching between legal tenants and loads appropriate branding', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <DualTenantTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Switch to Starq Technologies
    await act(async () => {
      screen.getByTestId('btn-switch-starq').click();
    });

    expect(screen.getByTestId('current-tenant-id').textContent).toBe('tenant-starq');
    expect(screen.getByTestId('current-tenant-name').textContent).toBe('Starq Technologies Pvt Ltd');
    expect(screen.getByTestId('current-tenant-outlets-count').textContent).toBe('2');

    // Switch to Club Ignition
    await act(async () => {
      screen.getByTestId('btn-switch-ignition').click();
    });

    expect(screen.getByTestId('current-tenant-id').textContent).toBe('tenant-ignition');
    expect(screen.getByTestId('current-tenant-name').textContent).toBe('Club Ignition Pvt Ltd');
    expect(screen.getByTestId('current-tenant-outlets-count').textContent).toBe('1');
  });
});
