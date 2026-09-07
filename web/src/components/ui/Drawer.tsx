import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthValues = {
    sm: '360px',
    md: '460px',
    lg: '600px',
    xl: '760px',
  }[width];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex">
        <div
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-low)',
            borderLeft: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: 'var(--md-sys-shape-corner-large) 0 0 var(--md-sys-shape-corner-large)',
            color: 'var(--md-sys-color-on-surface)',
            boxShadow: 'var(--md-sys-elevation-3)',
            maxWidth: `min(calc(100vw - 1rem), ${maxWidthValues})`,
            width: '100vw',
          }}
          className="flex flex-col min-w-0 h-full max-h-[100dvh]"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 min-w-0"
            style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
          >
            <div className="min-w-0 pr-2">
              <h3 id="drawer-title" className="text-sm sm:text-base font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            <Button
              variant="text"
              size="xs"
              onClick={onClose}
              aria-label="Close panel"
              className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-high)] shrink-0"
            >
              <X size={18} />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-xs text-[var(--md-sys-color-on-surface-variant)] min-w-0">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div
              className="px-5 sm:px-6 py-3.5 flex flex-wrap items-center justify-end gap-2 shrink-0 min-w-0"
              style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
