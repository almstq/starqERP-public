import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { OrganisationSetupModal } from '../components/onboarding/OrganisationSetupModal';

const TenantManagementHarness: React.FC = () => {
  const {
    tenants,
    currentTenant,
    currentUser,
    switchTenant,
    workflowStages,
    createTenant,
  } = useERP();

  const [isModalOpen, setIsModalOpen] = React.useState(false);

  return (
    <div>
      <div data-testid="active-tenant-id">{currentTenant.id}</div>
      <div data-testid="active-tenant-name">{currentTenant.name}</div>
      <div data-testid="active-tenant-industry">{currentTenant.industry}</div>
      <div data-testid="active-tenant-tin">{currentTenant.tinNumber || 'NO_TIN'}</div>
      <div data-testid="active-tenant-gst-status">{currentTenant.gstStatus}</div>
      <div data-testid="active-tenant-bank">{currentTenant.bmlAccount || 'NO_BANK'}</div>
      <div data-testid="current-user-role">{currentUser.roleName}</div>
      <div data-testid="current-user-status">{currentUser.status}</div>

      <div data-testid="workflow-stages-count">{workflowStages.length}</div>
      <ul data-testid="workflow-stages-list">
        {workflowStages.map((stage) => (
          <li key={stage.id} data-testid={`stage-${stage.code}`}>
            {stage.name} ({stage.code}) - Tenant: {stage.tenantId}
          </li>
        ))}
      </ul>

      <button onClick={() => setIsModalOpen(true)}>Open Onboarding</button>
      <button
        onClick={() => {
          createTenant({
            name: 'Apex Diagnostic Polyclinic',
            slug: 'apex-clinic',
            legalName: 'Apex Medical Pvt Ltd',
            industry: 'Medical Clinic & Diagnostics',
            currency: 'MVR',
            currencySymbol: 'Rf',
            tinNumber: '',
            gstStatus: 'not_registered',
            gstRate: 0,
            financialYearStart: '01-01',
            financialYearEnd: '12-31',
            phone: '+960 330-1122',
            email: 'admin@apexclinic.mv',
            address: 'H. Apex, Male',
            island: "Male'",
            atoll: 'Kaafu Atoll',
            bmlAccount: '7730000554433 (BML MVR Clinic)',
            themeColor: '#059669',
          });
        }}
      >
        Direct Create Clinic Tenant
      </button>

      {tenants.map((t) => (
        <button key={t.id} onClick={() => switchTenant(t.id)}>
          Switch to {t.name}
        </button>
      ))}

      <OrganisationSetupModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};

describe('SERP-275: Multi-Tenant Boundary Generalization & Dynamic Tenant Lifecycles', () => {
  it('allows onboarding a brand-new organization where founder has active administration authority (SERP-163)', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <TenantManagementHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Click direct create clinic tenant
    const createBtn = screen.getByRole('button', { name: /Direct Create Clinic Tenant/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // Active tenant should now be Apex Diagnostic Polyclinic
    expect(screen.getByTestId('active-tenant-name').textContent).toBe('Apex Diagnostic Polyclinic');
    expect(screen.getByTestId('active-tenant-industry').textContent).toBe('Medical Clinic & Diagnostics');
    expect(screen.getByTestId('active-tenant-bank').textContent).toContain('7730000554433');
    
    // Founder authority: active Super Admin / Owner, not locked out of new tenant
    expect(screen.getByTestId('current-user-status').textContent).toBe('Active');
    expect(screen.getByTestId('current-user-role').textContent).toBe('Owner & Super Administrator');

    // Industry workflow stages initialized for the clinic template (5 stages)
    const stagesCount = Number(screen.getByTestId('workflow-stages-count').textContent);
    expect(stagesCount).toBe(5);
    expect(screen.getByTestId('stage-TRIAGE')).toBeDefined();
    expect(screen.getByTestId('stage-CONSULT')).toBeDefined();
  });

  it('runs different workflow configurations for Client #1 vs Client #2 without cross-talk', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <TenantManagementHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Initial tenant is Starq (or switch to Club Ignition)
    const switchIgnitionBtn = screen.getByRole('button', { name: /Switch to Club Ignition/i });
    await act(async () => {
      fireEvent.click(switchIgnitionBtn);
    });

    expect(screen.getByTestId('active-tenant-name').textContent).toContain('Club Ignition');
    expect(screen.getByTestId('active-tenant-industry').textContent).toBe('Automotive & Body Repair');
    
    // Create new Clinic tenant
    const createBtn = screen.getByRole('button', { name: /Direct Create Clinic Tenant/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // The new clinic tenant runs clinic stages
    expect(screen.getByTestId('active-tenant-name').textContent).toBe('Apex Diagnostic Polyclinic');
    expect(screen.getByTestId('stage-CONSULT')).toBeDefined();

    // Switch back to Club Ignition
    await act(async () => {
      fireEvent.click(switchIgnitionBtn);
    });

    // Club Ignition still runs automotive garage workflow
    expect(screen.getByTestId('active-tenant-name').textContent).toContain('Club Ignition');
    expect(screen.getByTestId('active-tenant-industry').textContent).toBe('Automotive & Body Repair');
  });

  it('onboarding modal does not populate fabricated BML account or TIN fallbacks', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <TenantManagementHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    // Open setup modal
    const openBtn = screen.getByRole('button', { name: /Open Onboarding/i });
    await act(async () => {
      fireEvent.click(openBtn);
    });

    // Ensure no hardcoded dummy BML number is displayed
    expect(screen.queryByText(/7730000998811/)).toBeNull();
  });
});
