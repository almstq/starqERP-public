import React from 'react';
import { Check } from 'lucide-react';
import { useRipple } from './Ripple';

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  count?: number | string;
  disabled?: boolean;
  className?: string;
}

export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  selected,
  onClick,
  icon,
  count,
  disabled = false,
  className = '',
}) => {
  const { onPointerDown, rippleElement } = useRipple<HTMLButtonElement>();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        backgroundColor: selected
          ? 'var(--md-sys-color-secondary-container)'
          : 'transparent',
        color: selected
          ? 'var(--md-sys-color-on-secondary-container)'
          : 'var(--md-sys-color-on-surface-variant)',
        borderColor: selected
          ? 'transparent'
          : 'var(--md-sys-color-outline-variant)',
        borderRadius: 'var(--md-sys-shape-corner-small)',
      }}
      className={`group relative overflow-hidden inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border transition-all duration-150 cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {/* State Layer */}
      <span
        className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
        aria-hidden="true"
      />

      {rippleElement}

      <span className="relative z-10 flex items-center gap-1.5 min-w-0">
        {selected ? (
          <Check size={13} className="shrink-0 animate-in fade-in zoom-in-75 duration-150" aria-hidden="true" />
        ) : (
          icon
        )}
        <span className="truncate">{label}</span>
        {count !== undefined && (
          <span
            className="text-[10px] mono-num px-1 py-0.2 rounded-full font-bold ml-0.5"
            style={{
              backgroundColor: selected
                ? 'var(--md-sys-color-on-secondary-container)'
                : 'var(--md-sys-color-surface-container-highest)',
              color: selected
                ? 'var(--md-sys-color-secondary-container)'
                : 'var(--md-sys-color-on-surface)',
            }}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
};
