import React from 'react';
import { Check } from 'lucide-react';
import { useRipple } from './Ripple';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedButtonProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const SegmentedButton = <T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentedButtonProps<T>) => {
  return (
    <div
      style={{
        borderColor: 'var(--md-sys-color-outline)',
        borderRadius: 'var(--md-sys-shape-corner-full)',
      }}
      className={`inline-flex items-stretch border overflow-hidden p-0.5 min-w-0 ${className}`}
      role="radiogroup"
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <SegmentItem
            key={opt.value}
            option={opt}
            isSelected={isSelected}
            onClick={() => onChange(opt.value)}
            isFirst={idx === 0}
            isLast={idx === options.length - 1}
            size={size}
          />
        );
      })}
    </div>
  );
};

interface SegmentItemProps<T extends string> {
  option: SegmentOption<T>;
  isSelected: boolean;
  onClick: () => void;
  isFirst: boolean;
  isLast: boolean;
  size: 'sm' | 'md';
}

const SegmentItem = <T extends string>({
  option,
  isSelected,
  onClick,
  isFirst,
  isLast,
  size,
}: SegmentItemProps<T>) => {
  const { onPointerDown, rippleElement } = useRipple<HTMLButtonElement>();

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        backgroundColor: isSelected
          ? 'var(--md-sys-color-secondary-container)'
          : 'transparent',
        color: isSelected
          ? 'var(--md-sys-color-on-secondary-container)'
          : 'var(--md-sys-color-on-surface-variant)',
        borderRadius: isFirst
          ? 'var(--md-sys-shape-corner-full) 0 0 var(--md-sys-shape-corner-full)'
          : isLast
          ? '0 var(--md-sys-shape-corner-full) var(--md-sys-shape-corner-full) 0'
          : '0',
      }}
      className={`group relative overflow-hidden inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer select-none ${
        size === 'sm' ? 'h-7 text-[11px]' : 'h-8 sm:h-9'
      }`}
    >
      {/* State Layer Overlay */}
      <span
        className="absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] bg-current"
        aria-hidden="true"
      />

      {rippleElement}

      <span className="relative z-10 flex items-center gap-1.5">
        {isSelected ? (
          <Check size={13} className="animate-in fade-in zoom-in-75 duration-150" aria-hidden="true" />
        ) : (
          option.icon
        )}
        <span>{option.label}</span>
      </span>
    </button>
  );
};
