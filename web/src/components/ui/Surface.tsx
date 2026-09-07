import React from 'react';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined';
  level?: 1 | 2 | 3 | 4 | 5;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bordered?: boolean;
  container?: boolean;
}

export const Surface: React.FC<SurfaceProps> = ({
  children,
  variant = 'filled',
  level,
  padding = 'md',
  bordered,
  container = false,
  className = '',
  style,
  ...props
}) => {
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-2.5 sm:p-3',
    md: 'p-3.5 sm:p-4 md:p-5',
    lg: 'p-5 sm:p-6 md:p-8',
  }[padding];

  // Material 3 card container styling with tonal elevation
  const getCardStyles = (): React.CSSProperties => {
    if (variant === 'elevated') {
      return {
        backgroundColor: 'var(--md-sys-color-surface-container-low)',
        border: '1px solid var(--md-sys-color-outline-variant)',
        boxShadow: 'var(--md-sys-elevation-1)',
      };
    }
    if (variant === 'outlined' || bordered) {
      return {
        backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
        border: '1px solid var(--md-sys-color-outline-variant)',
      };
    }
    // filled
    const bgMap = {
      1: 'var(--md-sys-color-surface-container-low)',
      2: 'var(--md-sys-color-surface-container)',
      3: 'var(--md-sys-color-surface-container-high)',
      4: 'var(--md-sys-color-surface-container-highest)',
      5: 'var(--md-sys-color-surface-container-highest)',
    };
    return {
      backgroundColor: bgMap[level as keyof typeof bgMap] || 'var(--md-sys-color-surface-container-low)',
      border: '1px solid var(--md-sys-color-outline-variant)',
    };
  };

  return (
    <div
      style={{
        borderRadius: 'var(--md-sys-shape-corner-medium)',
        color: 'var(--md-sys-color-on-surface)',
        ...(container ? { containerType: 'inline-size' } : {}),
        ...getCardStyles(),
        ...style,
      }}
      className={`relative w-full min-w-0 ${paddingClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
