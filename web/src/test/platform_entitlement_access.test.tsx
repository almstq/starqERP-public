import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import * as authService from '../services/auth';

describe('SERP-298 — Strict Platform Entitlement & Access Isolation', () => {
  it('blocks a tenant super_admin / managing_director without platform_entitlement from seeing Starq HQ', async () => {
    const tenantAdminSession: authService.UserSession = {
      person_id: 'user-tenant-superadmin',
      name: 'Ahmed Tenant Super Admin',
      seats: ['managing_director', 'super_admin'],
      acting_as: 'managing_director',
      seat_label: 'Managing Director & Super Admin',
      csrf: 'csrf-token-123',
      allowed_entities: ['tenant-starq'],
      platform_entitlement: null, // No platform entitlement
    };

    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(tenantAdminSession);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Open organization switcher dropdown
    const switcherBtn = await screen.findByRole('button', { name: /Organization switcher/i });
    await act(async () => {
      switcherBtn.click();
    });

    // Invariant: Starq Platform / Starq HQ option must NOT be rendered
    expect(screen.queryByText(/Starq Platform/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform Operator Console/i)).not.toBeInTheDocument();
  });

  it('allows an operator identity with explicit platform_entitlement to access Starq HQ', async () => {
    const platformOperatorSession: authService.UserSession = {
      person_id: 'user-platform-operator',
      name: 'Ali Mushthaq (Platform Operator)',
      seats: ['managing_director'],
      acting_as: 'managing_director',
      seat_label: 'SaaS Platform Superadmin',
      csrf: 'csrf-token-456',
      allowed_entities: ['tenant-starq', 'tenant-ignition'],
      platform_entitlement: {
        operator_role: 'superadmin',
        mfa_verified: true,
      },
    };

    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(platformOperatorSession);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>
            <ERPProvider>
              <AppShell />
            </ERPProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    // Open organization switcher dropdown
    const switcherBtn = await screen.findByRole('button', { name: /Organization switcher/i });
    await act(async () => {
      switcherBtn.click();
    });

    // Starq Platform operator section must be present
    expect(screen.getByText(/Starq Platform/i)).toBeInTheDocument();
    const starqHqBtn = screen.getByRole('menuitem', { name: /Starq HQ/i });
    expect(starqHqBtn).toBeInTheDocument();

    // Switch to Starq HQ
    await act(async () => {
      starqHqBtn.click();
    });

    // Main navigation and header must switch to Starq HQ SaaS control plane
    expect(screen.getByRole('heading', { name: /Platform Operator Console/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Business Intake/i })).toBeInTheDocument();
  });
});
