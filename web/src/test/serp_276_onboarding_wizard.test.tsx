import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ERPProvider, useERP } from '../context/ERPContext';
import { OrganisationSetupModal } from '../components/onboarding/OrganisationSetupModal';

const OnboardingTestHarness: React.FC = () => {
  const { currentTenant, tenants, isSetupModalOpen, setIsSetupModalOpen } = useERP();

  return (
    <div>
      <div data-testid="current-tenant-id">{currentTenant.id}</div>
      <div data-testid="current-tenant-name">{currentTenant.name}</div>
      <div data-testid="current-tenant-industry">{currentTenant.industry}</div>
      <div data-testid="current-tenant-tin">{currentTenant.tinNumber || ''}</div>
      <div data-testid="current-tenant-gst-status">{currentTenant.gstStatus}</div>
      <div data-testid="current-tenant-bml">{currentTenant.bmlAccount || ''}</div>
      <div data-testid="tenants-count">{tenants.length}</div>

      <button onClick={() => setIsSetupModalOpen(true)} data-testid="btn-open-wizard">
        Open Onboarding Wizard
      </button>

      <OrganisationSetupModal isOpen={isSetupModalOpen} onClose={() => setIsSetupModalOpen(false)} />
    </div>
  );
};

describe('SERP-276: Standardised Tenant Onboarding Wizard & Configuration Gating', () => {
  it('refuses to proceed past Step 1 when organization display name is empty', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <OnboardingTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-open-wizard'));
    });

    expect(screen.getByTestId('organisation-setup-modal')).toBeDefined();

    // Clear name and click Continue
    const nameInput = screen.getByTestId('input-org-name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: '' } });
    });

    const nextBtn = screen.getByTestId('wizard-next-button');
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    // Validation error displayed, still on Step 1
    expect(screen.getByTestId('wizard-validation-error')).toBeDefined();
    expect(screen.getByTestId('wizard-validation-error').textContent).toContain('display name is required');
  });

  it('completes end-to-end self-service onboarding for an unregistered SME with zero invented TIN or account numbers', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <OnboardingTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    const initialTenantCount = Number(screen.getByTestId('tenants-count').textContent);

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-open-wizard'));
    });

    // Step 1: Select Marine Industry and set Name
    await act(async () => {
      fireEvent.click(screen.getByTestId('industry-card-Marine & Boatyard'));
    });

    const nameInput = screen.getByTestId('input-org-name');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Dhiggaru Marine Slipway' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-next-button'));
    });

    // Step 2: Leave TIN explicitly blank (unregistered small business)
    const tinInput = screen.getByTestId('input-tin-number');
    await act(async () => {
      fireEvent.change(tinInput, { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-next-button'));
    });

    // Step 3: Verify product-fixed governance invariants are rendered
    expect(screen.getByTestId('governance-invariants-box')).toBeDefined();
    expect(screen.getByText(/Single source of financial truth/i)).toBeDefined();
    expect(screen.getByText(/Segregation of Duties/i)).toBeDefined();

    // Complete setup
    const submitBtn = screen.getByTestId('wizard-submit-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Assert new tenant is active with exact non-invented data
    expect(Number(screen.getByTestId('tenants-count').textContent)).toBe(initialTenantCount + 1);
    expect(screen.getByTestId('current-tenant-name').textContent).toBe('Dhiggaru Marine Slipway');
    expect(screen.getByTestId('current-tenant-industry').textContent).toBe('Marine & Boatyard');
    expect(screen.getByTestId('current-tenant-tin').textContent).toBe('');
    expect(screen.getByTestId('current-tenant-gst-status').textContent).toBe('not_registered');
    expect(screen.getByTestId('current-tenant-bml').textContent).toBe('');
  });

  it('completes onboarding for registered tenant with valid MIRA TIN and bank account', async () => {
    render(
      <MemoryRouter>
        <ERPProvider>
          <OnboardingTestHarness />
        </ERPProvider>
      </MemoryRouter>
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-open-wizard'));
    });

    // Step 1: Medical Clinic
    await act(async () => {
      fireEvent.click(screen.getByTestId('industry-card-Medical Clinic & Diagnostics'));
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-org-name'), {
        target: { value: 'Alif Polyclinic & Dental' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-next-button'));
    });

    // Step 2: Set valid TIN
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-tin-number'), {
        target: { value: '1099882GST501' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-next-button'));
    });

    // Step 3: Set BML Account
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-bml-account'), {
        target: { value: '7730000998811' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('wizard-submit-button'));
    });

    expect(screen.getByTestId('current-tenant-name').textContent).toBe('Alif Polyclinic & Dental');
    expect(screen.getByTestId('current-tenant-tin').textContent).toBe('1099882GST501');
    expect(screen.getByTestId('current-tenant-gst-status').textContent).toBe('registered');
    expect(screen.getByTestId('current-tenant-bml').textContent).toContain('7730000998811');
  });
});
