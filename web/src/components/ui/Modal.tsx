import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
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
    sm: '400px',
    md: '520px',
    lg: '640px',
    xl: '800px',
    '2xl': '960px',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Material 3 Scrim Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Material 3 Dialog Surface */}
      <div
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          borderRadius: 'var(--md-sys-shape-corner-extra-large)',
          color: 'var(--md-sys-color-on-surface)',
          boxShadow: 'var(--md-sys-elevation-3)',
          maxWidth: `min(calc(100vw - 1.5rem), ${maxWidthValues})`,
          maxHeight: 'min(90dvh, 800px)',
        }}
        className="relative w-full overflow-hidden z-10 flex flex-col min-w-0 m3-dialog-enter"
      >
        {/* Header (Sticky / Accessible) */}
        <div
          className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 min-w-0"
          style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
        >
          <div className="min-w-0 pr-2">
            <h3 id="dialog-title" className="text-sm sm:text-base font-semibold text-[var(--md-sys-color-on-surface)] truncate">
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
            aria-label="Close dialog"
            className="p-1.5 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] shrink-0"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Body (Owns vertical scrolling) */}
        <div className="px-5 sm:px-6 py-4 overflow-y-auto flex-1 text-xs text-[var(--md-sys-color-on-surface-variant)] space-y-4 min-w-0">
          {children}
        </div>

        {/* Action Bar / Footer (Accessible) */}
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
  );
};

export const Dialog = Modal;
