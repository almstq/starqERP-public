import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useRipple, StateLayer } from './index';

export interface ThemeSelectorProps {
  className?: string;
  align?: 'left' | 'right';
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  className = '',
  align = 'right',
}) => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { onPointerDown: handleRipplePointerDown, rippleElement } = useRipple();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const options = [
    {
      value: 'system' as const,
      label: 'System',
      description: 'Sync with device appearance',
      icon: Laptop,
      accessibleLabel: 'Theme: System',
    },
    {
      value: 'light' as const,
      label: 'Light',
      description: 'Crisp neutral white & gray',
      icon: Sun,
      accessibleLabel: 'Theme: Light',
    },
    {
      value: 'dark' as const,
      label: 'Dark',
      description: 'Deep slate & charcoal night',
      icon: Moon,
      accessibleLabel: 'Theme: Dark',
    },
  ];

  const currentOption = options.find((o) => o.value === themeMode) || options[0];
  const CurrentIcon = currentOption.icon;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      {/* Trigger Button reflecting the selected mode */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onPointerDown={handleRipplePointerDown}
        className="group relative overflow-hidden p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-[var(--md-sys-shape-corner-full)] transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] active:scale-[0.97]"
        style={{
          backgroundColor: isOpen
            ? 'var(--md-sys-color-surface-container-highest)'
            : 'transparent',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}
        aria-label={currentOption.accessibleLabel}
        title={currentOption.accessibleLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <StateLayer />
        <CurrentIcon size={17} strokeWidth={2} aria-hidden="true" className="relative z-10" />

        {rippleElement}
      </button>

      {/* Material 3 Popover Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 w-64 p-1.5 rounded-[var(--md-sys-shape-corner-medium)] border border-[var(--md-sys-color-outline-variant)] shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100`}
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)] mb-1">
            Appearance
          </div>

          <div className="space-y-0.5">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = themeMode === opt.value;

              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setThemeMode(opt.value);
                    setIsOpen(false);
                  }}
                  className={`group relative overflow-hidden w-full flex items-center justify-between px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] text-left transition-all ${
                    isSelected ? 'font-semibold' : 'hover:bg-[var(--md-sys-color-surface-container-highest)]'
                  }`}
                  style={
                    isSelected
                      ? {
                          backgroundColor: 'var(--md-sys-color-secondary-container)',
                          color: 'var(--md-sys-color-on-secondary-container)',
                        }
                      : {
                          color: 'var(--md-sys-color-on-surface)',
                        }
                  }
                  aria-label={opt.accessibleLabel}
                >
                  <StateLayer />
                  <div className="flex items-center gap-2.5 min-w-0 relative z-10">
                    <div
                      className="p-1 rounded-[var(--md-sys-shape-corner-small)] shrink-0"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--md-sys-color-primary)'
                          : 'var(--md-sys-color-surface-container)',
                        color: isSelected
                          ? 'var(--md-sys-color-on-primary)'
                          : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      <Icon size={14} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs truncate">{opt.label}</div>
                      <div
                        className="text-[10px] truncate"
                        style={{
                          color: isSelected
                            ? 'var(--md-sys-color-on-secondary-container)'
                            : 'var(--md-sys-color-on-surface-variant)',
                          opacity: 0.85,
                        }}
                      >
                        {opt.description}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      className="relative z-10 shrink-0 text-[var(--md-sys-color-primary)]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-3 pt-2 pb-1 border-t border-[var(--md-sys-color-outline-variant)] mt-1 flex items-center justify-between text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
            <span>Currently active:</span>
            <span className="font-semibold uppercase tracking-wider text-[var(--md-sys-color-primary)]">
              {resolvedTheme} mode
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
