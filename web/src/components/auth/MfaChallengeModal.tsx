import React, { useState } from 'react';
import {
  ShieldAlert,
  KeyRound,
  Lock,
  X,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';

export const MfaChallengeModal: React.FC = () => {
  const { isMfaChallengeOpen, closeMfaChallenge, verifyMfaChallenge, currentUser } = useERP();

  const [code, setCode] = useState<string>('');
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isMfaChallengeOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = verifyMfaChallenge(code);
    if (!res.ok) {
      setErrorMsg(res.error || 'Authentication challenge failed');
    } else {
      setCode('');
      setErrorMsg(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      data-testid="mfa-challenge-modal"
    >
      <div className="relative w-full max-w-md overflow-hidden bg-[var(--md-sys-color-surface-container)] rounded-2xl shadow-2xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 bg-[var(--md-sys-color-surface-container-high)]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                <span>Elevated Privileges Required</span>
                <Badge variant="warning" size="sm">Demo PIN</Badge>
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                Demo environment — this is a simulated PIN challenge, not real MFA.
              </p>
            </div>
          </div>
          <button
            onClick={closeMfaChallenge}
            className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] dark:hover:text-slate-200 hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] space-y-1">
            <div className="flex items-center justify-between font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
              <span>Account: {currentUser.name}</span>
              <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">{currentUser.roleName}</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
              {isRecoveryMode
                ? 'Enter one of your 8-character single-use emergency recovery codes (e.g. REC1-9921).'
                : 'Enter the 6-digit verification code from your authenticator app to authorize this action.'}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)]">
              {isRecoveryMode ? 'Emergency Recovery Key' : '6-Digit Authenticator Token'}
            </label>
            <input
              type="text"
              autoFocus
              maxLength={isRecoveryMode ? 12 : 6}
              placeholder={isRecoveryMode ? 'e.g. REC1-9921' : 'e.g. 123456'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 text-center tracking-widest font-mono text-xl font-bold rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              data-testid="mfa-challenge-input"
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setIsRecoveryMode(!isRecoveryMode);
                setCode('');
                setErrorMsg(null);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              {isRecoveryMode ? 'Use Authenticator App Token' : 'Lost Device? Use Recovery Code'}
            </button>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
            <button
              type="button"
              onClick={closeMfaChallenge}
              className="px-4 py-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-xs font-semibold hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={code.trim().length === 0}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all"
              data-testid="mfa-challenge-submit-button"
            >
              <span>Authorize Elevation</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
