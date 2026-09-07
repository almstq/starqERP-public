import { describe, it, expect } from 'vitest';
import {
  calculateContrastRatio,
  validateAccessibilityStandard,
} from '../../../contracts/commands';

describe('SERP-035: Accessibility and Inclusive Interaction Baseline', () => {
  it('calculates accurate relative luminance and contrast ratio (WCAG 2.1)', () => {
    // Pure black on pure white (21:1)
    const ratioMax = calculateContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(Math.round(ratioMax)).toBe(21);

    // Starq dark slate foreground (oklch 21% ~ rgb(15,23,42)) on white background
    const starqTextRatio = calculateContrastRatio({ r: 15, g: 23, b: 42 }, { r: 255, g: 255, b: 255 });
    expect(starqTextRatio).toBeGreaterThan(10.0); // Far exceeds 4.5:1 WCAG AA
  });

  it('validates interactive controls satisfy touch target (>=44px), focus states, and aria labels', () => {
    const validButton = {
      elementId: 'action-record-payment',
      role: 'button',
      hasAriaLabel: true,
      hasKeyboardFocusRing: true,
      minTouchTargetPx: 44,
      fgColor: { r: 15, g: 23, b: 42 },
      bgColor: { r: 245, g: 158, b: 11 }, // Amber accent button
      isLargeText: false,
    };

    const result = validateAccessibilityStandard(validButton);
    expect(result.compliant).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('detects violations for missing labels, insufficient contrast, missing focus ring, or tiny touch targets', () => {
    const invalidButton = {
      elementId: 'btn-unlabeled-icon',
      hasAriaLabel: false,
      hasKeyboardFocusRing: false,
      minTouchTargetPx: 20, // Failed (<44px)
      fgColor: { r: 210, g: 210, b: 210 }, // Low contrast
      bgColor: { r: 255, g: 255, b: 255 },
    };

    const result = validateAccessibilityStandard(invalidButton);
    expect(result.compliant).toBe(false);
    expect(result.errors.length).toBe(4);
    expect(result.errors.some((e) => e.includes('Contrast ratio'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Touch target'))).toBe(true);
    expect(result.errors.some((e) => e.includes('missing accessible name'))).toBe(true);
    expect(result.errors.some((e) => e.includes('missing visible focus ring'))).toBe(true);
  });
});
