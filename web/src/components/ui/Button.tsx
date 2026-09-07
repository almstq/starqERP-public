import React from 'react';
import { Loader2 } from 'lucide-react';
import { useRipple } from './Ripple';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'destructive' | 'primary' | 'secondary' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'filled',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className = '',
  style,
  onPointerDown: userOnPointerDown,
  ...props
}) => {
  const { onPointerDown, rippleElement } = useRipple<HTMLButtonElement>();

  const sizeClasses = {
    xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-[var(--md-sys-shape-corner-full)]',
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--md-sys-shape-corner-full)]',
    md: 'h-9 px-4 text-xs font-medium gap-2 rounded-[var(--md-sys-shape-corner-full)] min-h-[36px]',
    lg: 'h-11 px-6 text-sm font-medium gap-2.5 rounded-[var(--md-sys-shape-corner-full)] min-h-[44px]',
  }[size];

  // Material 3 semantic variant styling
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'filled':
      case 'primary':
        return {
          backgroundColor: 'var(--md-sys-color-primary)',
          color: 'var(--md-sys-color-on-primary)',
          border: '1px solid transparent',
          fontWeight: 600,
        };
      case 'tonal':
      case 'secondary':
        return {
          backgroundColor: 'var(--md-sys-color-secondary-container)',
          color: 'var(--md-sys-color-on-secondary-container)',
          border: '1px solid transparent',
          fontWeight: 500,
        };
      case 'elevated':
        return {
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
          color: 'var(--md-sys-color-primary)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          boxShadow: 'var(--md-sys-elevation-1)',
          fontWeight: 600,
        };
      case 'outlined':
        return {
          backgroundColor: 'transparent',
          color: 'var(--md-sys-color-primary)',
          border: '1px solid var(--md-sys-color-outline)',
          fontWeight: 500,
        };
      case 'text':
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--md-sys-color-primary)',
          border: '1px solid transparent',
          fontWeight: 500,
        };
      case 'destructive':
        return {
          backgroundColor: 'var(--md-sys-color-error)',
          color: 'var(--md-sys-color-on-error)',
          border: '1px solid transparent',
          fontWeight: 600,
        };
      default:
        return {
          backgroundColor: 'var(--md-sys-color-primary)',
          color: 'var(--md-sys-color-on-primary)',
        };
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      onPointerDown(e);
    }
    if (userOnPointerDown) {
      userOnPointerDown(e);
    }
  };

  return (
    <button
      disabled={disabled || loading}
      onPointerDown={handlePointerDown}
      style={{ ...getVariantStyles(), ...style }}
      className={`group relative overflow-hidden inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${sizeClasses} ${className}`}
      {...props}
    >
      {/* State Layer Overlay */}
      <span
        className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-focus-visible:opacity-[var(--md-sys-state-focus-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
        aria-hidden="true"
      />

      {/* Ripple Element */}
      {rippleElement}

      <span className="relative z-10 flex items-center gap-2">
        {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : icon}
        {children}
      </span>
    </button>
  );
};
