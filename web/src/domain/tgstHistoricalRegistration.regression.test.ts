import { expect, it } from 'vitest';
import { calculateMiraTgstReturn } from './miraTgst';

it.each([false, true, undefined])('preserves historical amounts and HOLD with current flag %s', (isGstRegistered) => {
  // Synthetic recorded amounts, not a determination of statutory liability.
  const result = calculateMiraTgstReturn({
    invoices: [{ id: 'historical', issueDate: '2025-06-10', subtotal: 1000,
      taxAmount: 160, isTourismSector: true, status: 'paid' }],
    expenses: [], periodYear: 2025, periodMonth: 6,
    tin: '', legalEntityName: 'Synthetic tenant', isGstRegistered,
  });
  // Missing historical evidence should HOLD filing, not erase source amounts.
  expect(result.totalTourismTaxableSuppliesMvr).toBe(1000);
  expect(result.totalTgstOutputTaxMvr).toBe(160);
  expect(result.filingReadiness).toMatchObject({ status: 'HOLD', value: null });
});
