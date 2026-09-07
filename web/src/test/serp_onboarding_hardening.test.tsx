import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterOrganisationModal } from '../components/onboarding/RegisterOrganisationModal';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

describe('Onboarding Hardening Slice (SERP Onboarding Hardening)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders phone input with optional label, privacy notice, and subtle support link', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <ERPProvider>
              <RegisterOrganisationModal isOpen={true} onClose={() => {}} />
            </ERPProvider>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // 1. Phone input has 'Phone Number (Optional)' label and is not marked required
    const phoneInput = screen.getByLabelText('Phone Number (Optional)') as HTMLInputElement;
    expect(phoneInput).toBeDefined();
    expect(phoneInput.required).toBe(false);

    // 2. Plain-language privacy notice directly above submit
    expect(
      screen.getByText(
        'Starq Technologies collects your organization details solely to provision and administer your tenant preview in accordance with our data protection principles.'
      )
    ).toBeDefined();

    // 3. Subtle, accessible support link below form
    const supportLink = screen.getByRole('link', { name: /Contact support@starq\.tech/i });
    expect(supportLink).toBeDefined();
    expect(supportLink.getAttribute('href')).toBe('mailto:support@starq.tech');
    expect(screen.getByText(/Need assistance\?/i)).toBeDefined();
  });

  it('allows submitting application with empty phone string', async () => {
    let submittedPayload: any = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/onboarding/apply')) {
          submittedPayload = JSON.parse((init?.body as string) || '{}');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              application: {
                id: 'app-test-empty-phone',
                name: submittedPayload.name,
                legal_name: submittedPayload.legal_name,
                archetype_id: submittedPayload.archetype_id,
                primary_book_name: submittedPayload.primary_book_name,
                primary_book_code: submittedPayload.primary_book_code,
                island: submittedPayload.island,
                atoll: submittedPayload.atoll,
                phone: submittedPayload.phone,
                status: 'pending',
                created_at: new Date().toISOString(),
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      })
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <ERPProvider>
              <RegisterOrganisationModal isOpen={true} onClose={() => {}} />
            </ERPProvider>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Fill only required name, leaving phone empty
    const nameInput = screen.getByPlaceholderText(/e\.g\. Alif Marine & Speedboat Yard/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Horizon Marine Services' } });
    });

    const submitBtn = screen.getByRole('button', { name: /Submit for Superadmin Approval/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Application Submitted')).toBeDefined();
    });

    expect(submittedPayload).not.toBeNull();
    expect(submittedPayload.name).toBe('Horizon Marine Services');
    // Phone was submitted as empty string or undefined without blocking
    expect(!submittedPayload.phone || submittedPayload.phone === '').toBe(true);
  });

  it('displays error and maintains accessible support route when server killswitch is active (503)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/onboarding/apply')) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ 'x-request-id': 'req-killswitch-503' }),
            json: async () => ({
              ok: false,
              error: 'onboarding_disabled',
              message: 'Organisation registration is temporarily paused for scheduled maintenance.',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      })
    );

    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeProvider>
            <ERPProvider>
              <RegisterOrganisationModal isOpen={true} onClose={() => {}} />
            </ERPProvider>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    const nameInput = screen.getByPlaceholderText(/e\.g\. Alif Marine & Speedboat Yard/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Maintenance Test Corp' } });
    });

    const submitBtn = screen.getByRole('button', { name: /Submit for Superadmin Approval/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('onboarding_disabled');
    });

    // Support route remains accessible
    const supportLink = screen.getByRole('link', { name: /Contact support@starq\.tech/i });
    expect(supportLink).toBeDefined();
    expect(supportLink.getAttribute('href')).toBe('mailto:support@starq.tech');
  });
});
