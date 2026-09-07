import React, { useState, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  icon,
  trailingIcon,
  className = '',
  id,
  style,
  value,
  defaultValue,
  onFocus,
  onBlur,
  onChange,
  placeholder,
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(
    Boolean(value !== undefined ? value : defaultValue)
  );

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setHasValue(Boolean(e.target.value));
    if (onBlur) onBlur(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasValue(Boolean(e.target.value));
    if (onChange) onChange(e);
  };

  const isFloating = isFocused || hasValue || Boolean(placeholder);

  return (
    <div className="relative w-full min-w-0">
      <div className="relative flex items-center">
        {icon && (
          <div
            className="absolute left-3.5 pointer-events-none transition-colors duration-150 z-10"
            style={{
              color: isFocused
                ? 'var(--md-sys-color-primary)'
                : 'var(--md-sys-color-on-surface-variant)',
            }}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          placeholder={label ? (isFocused ? placeholder : '') : placeholder}
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            color: 'var(--md-sys-color-on-surface)',
            borderColor: error
              ? 'var(--md-sys-color-error)'
              : isFocused
              ? 'var(--md-sys-color-primary)'
              : 'var(--md-sys-color-outline-variant)',
            borderWidth: isFocused ? '1.5px' : '1px',
            borderRadius: 'var(--md-sys-shape-corner-small)',
            ...style,
          }}
          className={`w-full h-9 sm:h-10 text-xs border outline-none transition-all duration-150 placeholder:text-[var(--md-sys-color-on-surface-variant)] ${
            icon ? 'pl-9' : 'pl-3'
          } ${trailingIcon ? 'pr-9' : 'pr-3'} ${
            isFocused ? 'ring-1 ring-[var(--md-sys-color-primary)]' : ''
          } ${className}`}
          {...props}
        />

        {trailingIcon && (
          <div
            className="absolute right-3 pointer-events-none transition-colors duration-150 z-10"
            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            aria-hidden="true"
          >
            {trailingIcon}
          </div>
        )}

        {/* M3 Floating Label */}
        {label && (
          <label
            htmlFor={inputId}
            style={{
              color: error
                ? 'var(--md-sys-color-error)'
                : isFocused
                ? 'var(--md-sys-color-primary)'
                : 'var(--md-sys-color-on-surface-variant)',
              backgroundColor: isFloating
                ? 'var(--md-sys-color-surface-container-high)'
                : 'transparent',
            }}
            className={`pointer-events-none absolute transition-all duration-150 px-1 rounded-xs font-medium z-10 ${
              icon && !isFloating ? 'left-9' : 'left-3'
            } ${
              isFloating
                ? '-top-2 text-[10px] leading-none'
                : 'top-1/2 -translate-y-1/2 text-xs'
            }`}
          >
            {label}
          </label>
        )}
      </div>

      {/* Supporting / Error Text */}
      {error ? (
        <p
          className="mt-1 text-[11px] font-medium leading-none"
          style={{ color: 'var(--md-sys-color-error)' }}
          role="alert"
        >
          {error}
        </p>
      ) : helperText ? (
        <p
          className="mt-1 text-[11px] leading-none"
          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
        >
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';
