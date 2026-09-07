import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FavaraPaymentModal,
  resolveFavaraAccountNumber,
} from '../components/invoices/FavaraPaymentModal';
import { ERPProvider } from '../context/ERPContext';
import { AuthProvider } from '../context/AuthContext';

describe('SERP-324: MMA Favara Instant QR Payment Interface', () => {
  const sampleInvoice = {
    id: 'inv-9921',
    invoiceNumber: 'INV-2026-089',
    customerName: 'Island Express Ferry',
    totalAmount: 14500,
    currency: 'MVR' as const,
    status: 'unpaid',
  };

  const renderModal = () =>
    render(
      <AuthProvider>
        <ERPProvider>
          <FavaraPaymentModal isOpen={true} onClose={() => {}} invoice={sampleInvoice} />
        </ERPProvider>
      </AuthProvider>
    );

  /**
   * The merchant identifier is the security-critical part of this surface.
   *
   * This previously read `currentTenant.bankAccountNumber` — a property that does
   * not exist on OrganisationTenant — so it was undefined and fell through to a
   * hardcoded account number for every tenant. The old version of this test
   * asserted that hardcoded number, which meant the test PASSED BECAUSE OF THE
   * BUG and would have kept passing forever.
   *
   * These cases assert the resolver's behaviour directly, so a future fallback
   * cannot be reintroduced without a test going red.
   */
  describe('merchant account resolution (fails closed)', () => {
    it('extracts a 13-digit BML account from the stored formatted value', () => {
      expect(resolveFavaraAccountNumber('7730000189201 (BML MVR Main Account)')).toBe(
        '7730000189201'
      );
      expect(resolveFavaraAccountNumber('7701192837101')).toBe('7701192837101');
    });

    it('returns null for an unconfigured tenant rather than any fallback', () => {
      expect(resolveFavaraAccountNumber('BML MVR (Pending Configuration)')).toBeNull();
      expect(resolveFavaraAccountNumber('')).toBeNull();
      expect(resolveFavaraAccountNumber(undefined)).toBeNull();
      expect(resolveFavaraAccountNumber(null)).toBeNull();
    });

    it('rejects a value that is not a full 13-digit account number', () => {
      // Short, long-but-not-13, and digits embedded in prose must all be refused
      // rather than silently encoded into a payment code.
      expect(resolveFavaraAccountNumber('BML 12345')).toBeNull();
      expect(resolveFavaraAccountNumber('Account pending, ref 42')).toBeNull();
    });
  });

  describe('modal rendering', () => {
    it('renders the Favara modal shell and invoice amount', () => {
      renderModal();
      expect(screen.getByText('MMA Favara Instant Pay')).toBeDefined();
      expect(screen.getByTestId('favara-payment-modal')).toBeDefined();
    });

    /**
     * The seeded tenant carries 'BML MVR (Pending Configuration)', i.e. no
     * verified account. A Favara code is machine-read, so rendering one for an
     * unverified merchant would let a payer's phone silently pay the wrong
     * account. The surface must refuse instead.
     */
    it('refuses to draw a payment code when the tenant has no verified BML account', () => {
      renderModal();

      expect(screen.getByTestId('favara-account-not-configured')).toBeDefined();
      expect(screen.getByText('Bank account not configured')).toBeDefined();

      // No QR, no payload to copy, no settlement action.
      expect(screen.queryByAltText('MMA Favara QR Code')).toBeNull();
      expect(screen.queryByText('Copy EMV Payload')).toBeNull();
      expect(screen.queryByText('Simulate Settlement')).toBeNull();
    });

    it('never renders the previously hardcoded account number', () => {
      renderModal();
      // Regression guard: 7701192837101 was shown for every tenant regardless of
      // which organisation was signed in.
      expect(screen.queryByText(/7701192837101/)).toBeNull();
    });
    /**
     * PRESERVED, NOT DELETED.
     *
     * This case existed before and exercised the settlement callback. It cannot
     * run against the seeded tenant any more, because that tenant has no verified
     * BML account and the surface now correctly refuses to render the Simulate
     * Settlement action at all.
     *
     * Skipped rather than removed so the coverage gap stays visible. To restore
     * it, render with a tenant whose bmlAccount holds a real 13-digit number —
     * which needs a way to seed or override the tenant in tests that does not
     * exist yet. Tracked on SERP-324.
     */
    it.skip('handles instant payment simulation and triggers callback (needs a configured-tenant fixture)', () => {
      vi.useFakeTimers();
      const onPaymentMock = vi.fn();
      render(
        <AuthProvider>
          <ERPProvider>
            <FavaraPaymentModal
              isOpen={true}
              onClose={() => {}}
              invoice={sampleInvoice}
              onPaymentReceived={onPaymentMock}
            />
          </ERPProvider>
        </AuthProvider>
      );

      fireEvent.click(screen.getByText('Simulate Settlement'));
      vi.advanceTimersByTime(1200);
      expect(onPaymentMock).toHaveBeenCalledWith('inv-9921', 14500);
      vi.useRealTimers();
    });
  });
});
