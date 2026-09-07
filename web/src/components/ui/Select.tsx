import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  children,
  className = '',
  id,
  style,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[11px] font-medium tracking-wide"
          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            color: 'var(--md-sys-color-on-surface)',
            borderColor: error ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-outline-variant)',
            borderRadius: 'var(--md-sys-shape-corner-small)',
            ...style,
          }}
          className={`w-full h-9 pl-3 pr-8 text-xs border outline-none appearance-none cursor-pointer transition-colors focus:border-[var(--md-sys-color-primary)] focus:ring-1 focus:ring-[var(--md-sys-color-primary)] ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container)',
                    color: 'var(--md-sys-color-on-surface)',
                  }}
                >
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 pointer-events-none"
          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
          aria-hidden="true"
        />
      </div>
      {error && (
        <p className="text-[11px] font-medium" style={{ color: 'var(--md-sys-color-error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';
