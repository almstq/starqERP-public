import React, { useId } from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  id,
  className = '',
}) => {
  const generatedId = useId();
  const switchId = id || generatedId;

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center gap-3 select-none cursor-pointer ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          id={switchId}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />

        {/* M3 Switch Track */}
        <div
          style={{
            backgroundColor: checked
              ? 'var(--md-sys-color-primary)'
              : 'var(--md-sys-color-surface-container-highest)',
            borderColor: checked
              ? 'var(--md-sys-color-primary)'
              : 'var(--md-sys-color-outline)',
          }}
          className="w-12 h-7 rounded-full border-2 transition-colors duration-200"
        />

        {/* M3 Switch Thumb */}
        <div
          style={{
            backgroundColor: checked
              ? 'var(--md-sys-color-on-primary)'
              : 'var(--md-sys-color-outline)',
            transform: checked ? 'translateX(22px)' : 'translateX(4px)',
          }}
          className={`absolute left-0 rounded-full transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
            checked ? 'w-5 h-5' : 'w-4 h-4'
          }`}
        />
      </div>

      {label && (
        <span
          className="text-xs font-medium text-[var(--md-sys-color-on-surface)]"
        >
          {label}
        </span>
      )}
    </label>
  );
};
