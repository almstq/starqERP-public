import { describe, it, expect } from 'vitest';
import {
  DHIVEHI_COMMERCE_DICTIONARY,
  formatDhivehiDate,
  containsThaana,
} from './dhivehiLocalization';

describe('SERP-323: Bilingual Dhivehi (Thaana) & English Print Localization', () => {
  it('provides authoritative Thaana terminology dictionary for Maldivian commerce', () => {
    expect(DHIVEHI_COMMERCE_DICTIONARY.taxInvoice).toBe('ޓެކްސް އިންވޮއިސް');
    expect(DHIVEHI_COMMERCE_DICTIONARY.subtotal).toBe('ޖުމްލަ އަގު');
    expect(DHIVEHI_COMMERCE_DICTIONARY.gst8Percent).toBe('ޖީ.އެސް.ޓީ (%8)');
    expect(DHIVEHI_COMMERCE_DICTIONARY.totalAmountDue).toBe('ދައްކަންޖެހޭ ޖުމްލަ ފައިސާ:');
  });

  it('formats dates into Dhivehi Thaana format accurately', () => {
    const formatted = formatDhivehiDate('2026-08-28');
    expect(formatted).toBe('28 އޮގަސްޓް 2026');

    const jan = formatDhivehiDate('2026-01-01');
    expect(jan).toBe('1 ޖެނުއަރީ 2026');
  });

  it('accurately detects Dhivehi Thaana Unicode characters', () => {
    expect(containsThaana('ޓެކްސް އިންވޮއިސް')).toBe(true);
    expect(containsThaana('Tax Invoice 1001')).toBe(false);
  });
});
