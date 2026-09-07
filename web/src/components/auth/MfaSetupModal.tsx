import React, { useState } from 'react';
import {
  ShieldCheck,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  X,
  Smartphone,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';

export const MfaSetupModal: React.FC = () => {
  const { isMfaEnrollmentOpen, closeMfaEnrollment, enrollMfa, currentUser } = useERP();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [secret] = useState<string>('JBSWY3DPEHPK3PXP');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedRecovery, setCopiedRecovery] = useState<boolean>(false);
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recoveryCodes] = useState<string[]>([
    'REC1-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC2-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC3-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC4-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC5-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC6-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC7-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    'REC8-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
  ]);

  if (!isMfaEnrollmentOpen) return null;

  const handleCopyKey = () => {
    navigator.clipboard?.writeText(secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyRecovery = () => {
    navigator.clipboard?.writeText(recoveryCodes.join('\n'));
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = enrollMfa(currentUser.id, secret, verificationCode, recoveryCodes);
    if (!res.ok) {
      setErrorMsg(res.error || 'Failed to verify authenticator code');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      data-testid="mfa-setup-modal"
    >
      <div className="relative w-full max-w-lg overflow-hidden bg-[var(--md-sys-color-surface-container)] rounded-2xl shadow-2xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 bg-[var(--md-sys-color-surface-container-high)]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                <span>Admin Demo PIN Setup</span>
                <Badge variant="blue" size="sm">SERP-268</Badge>
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                Demo environment — multi-factor authentication is not enabled. This simulates a PIN challenge.
              </p>
            </div>
          </div>
          <button
            onClick={closeMfaEnrollment}
            className="p-1.5 rounded-lg text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] dark:hover:text-slate-200 hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="grid grid-cols-3 border-b border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-xs font-semibold">
          <button
            onClick={() => setStep(1)}
            className={`py-2.5 text-center border-b-2 transition-all ${
              step === 1
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-transparent text-[var(--md-sys-color-outline)]'
            }`}
          >
            1. Authenticator App
          </button>
          <button
            onClick={() => setStep(2)}
            className={`py-2.5 text-center border-b-2 transition-all ${
              step === 2
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-transparent text-[var(--md-sys-color-outline)]'
            }`}
          >
            2. Recovery Codes
          </button>
          <button
            onClick={() => setStep(3)}
            className={`py-2.5 text-center border-b-2 transition-all ${
              step === 3
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-transparent text-[var(--md-sys-color-outline)]'
            }`}
          >
            3. Verify Token
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Step 1: Link Authenticator Application</p>
                <p className="opacity-90">
                  Open Google Authenticator, Authy, or 1Password and enter the secret setup key below.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  <span className="font-medium">Secret Setup Key (Base32)</span>
                  <span className="text-[11px] font-mono">Time-based (TOTP 30s)</span>
                </div>
                <div className="flex items-center justify-between gap-3 p-2.5 bg-[var(--md-sys-color-surface-container)] rounded-lg border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
                  <code className="font-mono text-sm font-bold tracking-wider text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] select-all">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-700 text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] transition-all"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
                >
                  Continue to Recovery Codes →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Step 2: Save Emergency Recovery Codes</span>
                </div>
                <p className="opacity-90">
                  If you lose your device, these 8 single-use recovery codes are your only way to recover administrator access. Store them securely in your password manager or STARQ SECRETS vault.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] space-y-3">
                <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)]">
                  <span className="font-medium">8 Single-Use Recovery Keys</span>
                  <button
                    type="button"
                    onClick={handleCopyRecovery}
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    {copiedRecovery ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRecovery ? 'Copied to Clipboard' : 'Copy All Keys'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 p-2 bg-[var(--md-sys-color-surface-container)] rounded-lg border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] font-mono text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                  {recoveryCodes.map((code, idx) => (
                    <div key={idx} className="p-1.5 rounded bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/50 text-center border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-xs font-semibold hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
                >
                  Confirm & Verify Code →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Step 3: Enter 6-Digit Authenticator Code</p>
                <p className="opacity-90">
                  Enter the 6-digit code currently generated in your authenticator application to complete enrollment.
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
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  placeholder="e.g. 123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 text-center tracking-widest font-mono text-xl font-bold rounded-xl border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  data-testid="mfa-verification-input"
                />
                <p className="text-[11px] text-[var(--md-sys-color-outline)] dark:text-[var(--md-sys-color-on-surface-variant)] text-center">
                  Tip: In simulation mode, code <strong>123456</strong> is valid.
                </p>
              </div>

              <div className="flex justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3 py-2 rounded-xl text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] text-xs font-semibold hover:bg-[var(--md-sys-color-surface-container-high)] dark:hover:bg-slate-800 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={verificationCode.length !== 6}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all"
                  data-testid="mfa-enroll-submit-button"
                >
                  Activate Demo PIN
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
