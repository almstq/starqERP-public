import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../app/AppShell';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import * as authService from '../services/auth';

describe('SERP-401 & Reference Blueprint — Hard AppShell Route-Guard Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders PendingApprovalView and BLOCKS all navigation/dashboard when user has submitted application and no orgs', async () => {
    const pendingSession: authService.UserSession = {
      person_id: 'user-buzz-pending',
      name: 'Buzz Test Applicant',
      email: 'alstarque@gmail.com',
      seats: [],
      acting_as: '',
      seat_label: 'Pending Applicant',
      csrf: 'csrf-token-123',
      allowed_entities: [],
      organisations: [],
      platform_entitlement: null,
      application: {
        id: '08ea6cea-d62b-496a-aada-55c65d2ada1a',
        status: 'pending',
        name: 'Alstarq Motors',
        legal_name: 'Alstarq Motors Pvt Ltd',
        created_at: '2026-09-04T08:00:00Z',
      },
    };

    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(pendingSession);

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

    // Wait for session to load
    await waitFor(() => {
      expect(screen.getByText(/Organisation Under Review/i)).toBeInTheDocument();
    });

    // Invariant 1: Dedicated Pending Approval view is displayed
    expect(screen.getByText(/Pending Starq HQ Review/i)).toBeInTheDocument();
    expect(screen.getByText('Alstarq Motors')).toBeInTheDocument();
    expect(screen.getByText('Alstarq Motors Pvt Ltd')).toBeInTheDocument();
    expect(screen.getByText(/08ea6cea-d62b-496a-aada-55c65d2ada1a/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check Approval Status/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Sign Out/i }).length).toBeGreaterThan(0);

    // Invariant 2: Navigation sidebar items are NEVER rendered
    expect(screen.queryByRole('link', { name: /Jobs \/ Work Orders/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invoices/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Customers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Chart of Accounts/i })).not.toBeInTheDocument();

    // Invariant 3: Operational Quick Actions / Widgets are NEVER rendered
    expect(screen.queryByRole('button', { name: /New Job Card/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Invoice/i })).not.toBeInTheDocument();
  });

  it('renders OnboardingGatewayView when user is authenticated with zero orgs and no submitted application', async () => {
    const newApplicantSession: authService.UserSession = {
      person_id: 'user-new-applicant',
      name: 'New Applicant',
      email: 'newuser@example.com',
      seats: [],
      acting_as: '',
      seat_label: 'New Applicant',
      csrf: 'csrf-token-456',
      allowed_entities: [],
      organisations: [],
      platform_entitlement: null,
      application: null,
    };

    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(newApplicantSession);

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

    // Wait for Onboarding Gateway to render
    await waitFor(() => {
      expect(screen.getByText(/Register Your Organisation/i)).toBeInTheDocument();
    });

    // Invariant 1: Dedicated full-screen onboarding intake is present
    expect(screen.getByText(/New Organisation Intake/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g., Alstarq Marine Workshop/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for Starq HQ Approval/i })).toBeInTheDocument();

    // Invariant 2: Navigation sidebar is completely blocked
    expect(screen.queryByRole('link', { name: /Jobs \/ Work Orders/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Invoices/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Customers/i })).not.toBeInTheDocument();
  });

  it('automatically defaults platform operator without tenant orgs to Starq HQ platform console', async () => {
    const operatorSession: authService.UserSession = {
      person_id: 'user-platform-operator',
      name: 'Ali Mushthaq (MD)',
      email: 'a.musthaq@gmail.com',
      seats: ['managing_director'],
      acting_as: 'managing_director',
      seat_label: 'Managing Director & Operator',
      csrf: 'csrf-token-789',
      allowed_entities: [],
      organisations: [],
      platform_entitlement: {
        operator_role: 'superadmin',
        mfa_verified: true,
      },
      application: null,
    };

    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue(operatorSession);

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

    // Platform operator should automatically land in Starq HQ console
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Platform Operator Console/i })).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Starq HQ/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /New Business Intake/i })).toBeInTheDocument();
  });
});
