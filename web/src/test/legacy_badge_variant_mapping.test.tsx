import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../components/common/Badge';

describe('legacy Badge variant mapping', () => {
  it.each([
    ['positive', 'var(--positive-subtle)'],
    ['destructive', 'var(--md-sys-color-error-container)'],
    ['warning', 'var(--warning-subtle)'],
    ['info', 'var(--info-subtle)'],
    ['blue', 'var(--info-subtle)'],
    ['purple', 'var(--info-subtle)'],
    ['accent', 'var(--md-sys-color-primary-container)'],
    ['neutral', 'var(--md-sys-color-secondary-container)'],
  ] as const)('preserves %s mapping', (variant, expectedBackground) => {
    render(<Badge variant={variant}>Status</Badge>);

    expect(screen.getByText('Status')).toHaveStyle({ backgroundColor: expectedBackground });
  });
});
