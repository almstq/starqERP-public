import React, { useEffect, useId, useRef } from 'react';
import { Badge } from '../../ui';

/**
 * Pilot-local accessible dialog for the Settings -> About legal surface only.
 * Not exported from `components/ui`; must not be imported outside `settings/about`.
 * Pattern-matched against `components/common/Modal.tsx` (role/aria-modal/Escape/body-lock)
 * without modifying that shared file. Adds deterministic initial focus, a Tab/Shift+Tab
 * focus trap, and focus restoration to the invoking control on close.
 */

export interface AboutLegalDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const AboutLegalDialog: React.FC<AboutLegalDialogProps> = ({ open, title, onClose, children }) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => dialogRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !active || !dialogRef.current.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !active || !dialogRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg p-6 rounded-[var(--md-sys-shape-corner-large)] shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 focus:outline-none"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          color: 'var(--md-sys-color-on-surface)',
          border: '1px solid var(--md-sys-color-outline-variant)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] pb-3">
          <h4 id={titleId} className="text-sm font-bold capitalize">
            {title}
          </h4>
          <Badge variant="neutral" size="sm">Legal Notice</Badge>
        </div>

        <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed space-y-2 max-h-72 overflow-y-auto pr-1">
          {children}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 px-2.5 text-[11px] gap-1.5 rounded-[var(--md-sys-shape-corner-full)] cursor-pointer select-none transition-all duration-150 active:scale-[0.98]"
            style={{
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
              fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
