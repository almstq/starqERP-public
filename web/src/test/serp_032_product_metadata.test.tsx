import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  STARQ_ERP_CANONICAL_METADATA,
  getFormattedProductVersion,
  validateProductIdentityMetadata,
} from '../../../contracts/commands';
import { AboutTab } from '../components/settings/AboutTab';
import { LoginPage } from '../app/LoginPage';
import { AppShell } from '../app/AppShell';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

describe('SERP-032 / Enterprise SaaS Versioning SSOT', () => {
  it('verifies canonical product metadata enforces starqERP, starqAI, 0.2.0, beta', () => {
    expect(STARQ_ERP_CANONICAL_METADATA.productName).toBe('starqERP');
    expect(STARQ_ERP_CANONICAL_METADATA.embeddedAiName).toBe('starqAI');
    expect(STARQ_ERP_CANONICAL_METADATA.companyName).toBe('Starq Technologies Pvt Ltd');
    expect(STARQ_ERP_CANONICAL_METADATA.version).toBe('0.2.0');
    expect(STARQ_ERP_CANONICAL_METADATA.releaseTrack).toBe('beta');
    expect(STARQ_ERP_CANONICAL_METADATA.baseCurrency).toBe('MVR');

    const formatted = getFormattedProductVersion();
    expect(formatted).toBe('v0.2.0-beta');

    const validation = validateProductIdentityMetadata(STARQ_ERP_CANONICAL_METADATA);
    expect(validation.valid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('rejects stale starqBooks branding or non-canonical AI branding', () => {
    const staleBranding = {
      productName: 'starqBooks',
      embeddedAiName: 'StarqAI',
      companyName: 'Starq Tech Pvt Ltd',
      baseCurrency: 'MVR',
      version: '0.2.0',
    };

    const validation = validateProductIdentityMetadata(staleBranding);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('starqERP'))).toBe(true);
    expect(validation.errors.some((e) => e.includes('starqAI'))).toBe(true);
  });

  it('proves AboutTab renders canonical v0.2.0-beta badge and rejects hardcoded v1.0 drift', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AboutTab />
        </ThemeProvider>
      </MemoryRouter>
    );

    // Formatted version should be present
    expect(screen.getByText('v0.2.0-beta')).toBeDefined();
    // Build metadata indicator should be present
    expect(screen.getByText(/Build:/i)).toBeDefined();
    // Stale v1.0 should not exist
    expect(screen.queryByText(/starqERP v1\.0/i)).toBeNull();
  });

  it('proves LoginPage renders canonical version and clean pre-auth product copy', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <LoginPage />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Derived version with commit ref
    expect(screen.getByText(/starqERP v0\.2\.0-beta.*\([a-zA-Z0-9_-]+\).*• Maldives/i)).toBeDefined();

    // Neutral product capability copy
    expect(screen.getByText(/Maldives-Ready Finance/i)).toBeDefined();
    expect(screen.getByText(/Operations & Workflows/i)).toBeDefined();

    // No automotive leakage on pre-auth page
    expect(screen.queryByText(/Workshop Shop-Floor/i)).toBeNull();
    expect(screen.queryByText(/paint technician tracking/i)).toBeNull();
    expect(screen.queryByText(/automated 8% GGST calculation/i)).toBeNull();
    expect(screen.queryByText(/starqERP v1\.0/i)).toBeNull();
  });

  it('proves AppShell footer renders canonical derived version', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Desktop and mobile footers derive canonical version with commit ref
    const matches = screen.getAllByText(/starqERP v0\.2\.0-beta.*\([a-zA-Z0-9_-]+\)/i);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/starqERP v1\.0/i)).toBeNull();
  });
});

