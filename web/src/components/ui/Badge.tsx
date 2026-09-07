import React from 'react';

export type BadgeVariant = 'neutral' | 'positive' | 'warning' | 'destructive' | 'info' | 'accent';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
  style,
  ...props
}) => {
  const getChipStyles = (): { bg: string; text: string; border: string; dot: string } => {
    switch (variant) {
      case 'accent':
        return {
          bg: 'var(--md-sys-color-primary-container)',
          text: 'var(--md-sys-color-on-primary-container)',
          border: 'transparent',
          dot: 'var(--md-sys-color-primary)',
        };
      case 'positive':
        return {
          bg: 'var(--positive-subtle)',
          text: 'var(--positive)',
          border: 'transparent',
          dot: 'var(--positive)',
        };
      case 'warning':
        return {
          bg: 'var(--warning-subtle)',
          text: 'var(--warning)',
          border: 'transparent',
          dot: 'var(--warning)',
        };
      case 'destructive':
        return {
          bg: 'var(--md-sys-color-error-container)',
          text: 'var(--md-sys-color-on-error-container)',
          border: 'transparent',
          dot: 'var(--md-sys-color-error)',
        };
      case 'info':
        return {
          bg: 'var(--info-subtle)',
          text: 'var(--info)',
          border: 'transparent',
          dot: 'var(--info)',
        };
      default: // neutral
        return {
          bg: 'var(--md-sys-color-secondary-container)',
          text: 'var(--md-sys-color-on-secondary-container)',
          border: 'transparent',
          dot: 'var(--md-sys-color-on-surface-variant)',
        };
    }
  };

  const current = getChipStyles();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1 rounded-[var(--md-sys-shape-corner-extra-small)]',
    md: 'px-2.5 py-1 text-xs gap-1.5 rounded-[var(--md-sys-shape-corner-small)]',
  }[size];

  return (
    <span
      style={{
        backgroundColor: current.bg,
        color: current.text,
        border: `1px solid ${current.border}`,
        fontWeight: 600,
        ...style,
      }}
      className={`inline-flex items-center tracking-wider uppercase select-none ${sizeClasses} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: current.dot }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

export const Chip = Badge;
