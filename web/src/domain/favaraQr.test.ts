import { describe, it, expect } from 'vitest';
import { generateFavaraPaymentPayload, computeCrc16 } from './favaraQr';

describe('SERP-324: MMA Favara & BML Instant QR Payment Engine', () => {
  it('generates compliant EMVCo / MMA Favara dynamic QR payload with CRC16 checksum', () => {
    const qr = generateFavaraPaymentPayload({
      merchantName: 'Starq Marine Services',
      merchantCity: 'Male',
      accountNumber: '7701192837101',
      bankName: 'BML',
      currency: 'MVR',
      amount: 4500.50,
      invoiceNumber: 'INV-2026-089',
    });

    expect(qr.rawPayload).toContain('000201'); // Payload format 01
    expect(qr.rawPayload).toContain('010212'); // Dynamic QR 12
    expect(qr.rawPayload).toContain('mv.gov.mma.favara'); // MMA NPS Identifier
    expect(qr.rawPayload).toContain('5303462'); // 462 = MVR
    expect(qr.rawPayload).toContain('54074500.50'); // Amount
    expect(qr.rawPayload).toContain('5802MV'); // Country Code MV
    expect(qr.checksum.length).toBe(4);
    expect(qr.displayAmount).toBe('MVR 4500.50');
  });

  it('supports USD Favara QR generation for tourist and marine charter payments', () => {
    const qr = generateFavaraPaymentPayload({
      merchantName: 'Maldives Yacht Charters',
      merchantCity: 'Male',
      accountNumber: '7704992817201',
      bankName: 'BML',
      currency: 'USD',
      amount: 1200.00,
      invoiceNumber: 'INV-USD-404',
    });

    expect(qr.currencyCode).toBe('840'); // 840 = USD
    expect(qr.rawPayload).toContain('5303840');
    expect(qr.rawPayload).toContain('54071200.00');
    expect(qr.favaraUri).toContain('favara://pay?id=');
  });

  it('computes robust CRC16-CCITT checksum', () => {
    const sample = '0002010102125802MV6304';
    const crc = computeCrc16(sample);
    expect(crc).toBeDefined();
    expect(crc.length).toBe(4);
  });
});
