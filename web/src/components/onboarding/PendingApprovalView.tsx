import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useERP } from '../../context/ERPContext';
import { StarqLogomark } from '../brand/StarqLogo';
import { Badge } from '../common/Badge';
import { getFormattedProductVersion } from '../../../../contracts/commands';
import { Clock, RefreshCw, LogOut, ShieldCheck, Building2, MapPin, Mail, User, Info, ArrowRight } from 'lucide-react';

export const PendingApprovalView: React.FC = () => {
  const { session, refreshSession, logout } = useAuth();
  const { pendingApplications, switchActiveContext, refreshApplicantApplication } = useERP();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isPlatformOperator = Boolean(session?.platform_entitlement);

  // Find the authoritative application record
  const app = session?.application || pendingApplications[0];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSession();
      if (refreshApplicantApplication) {
        await refreshApplicantApplication();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const statusLabel =
    app?.status === 'info_requested'
      ? 'Information Requested'
      : app?.status === 'approved'
        ? 'Application Approved'
        : app?.status === 'rejected'
          ? 'Application Declined'
          : 'Pending Starq HQ Review';

  const legalName = app ? ('legal_name' in app ? app.legal_name : app.legalName) : '';

  const rejectionReason =
    app && 'rejection_reason' in app
      ? app.rejection_reason
      : app && 'rejectionReason' in app
        ? (app as any).rejectionReason
        : null;

  const infoRequestNote =
    app && 'info_request_note' in app
      ? app.info_request_note
      : app && 'infoRequestNote' in app
        ? (app as any).infoRequestNote
        : null;

  const badgeVariant: 'positive' | 'info' | 'destructive' | 'warning' =
    app?.status === 'approved'
      ? 'positive'
      : app?.status === 'info_requested'
        ? 'info'
        : app?.status === 'rejected'
          ? 'destructive'
          : 'warning';

  return (
    <div
      className="min-h-screen flex flex-col w-full"
      style={{
        backgroundColor: 'var(--md-sys-color-surface)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {/* Minimal Top Brand Bar */}
      <header
        className="h-14 border-b px-4 lg:px-8 flex items-center justify-between shrink-0"
        style={{
          borderColor: 'var(--md-sys-color-outline-variant)',
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <StarqLogomark size={28} />
          <span className="font-bold text-sm tracking-tight text-[var(--md-sys-color-on-surface)]">
            Starq Technologies
          </span>
          <Badge variant="neutral" size="sm">Workspace Portal</Badge>
        </div>

        <div className="flex items-center gap-3">
          {isPlatformOperator && (
            <button
              type="button"
              onClick={() => switchActiveContext({ plane: 'platform' })}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary-container)]/30 border border-[var(--md-sys-color-primary)]/30 transition-colors"
            >
              <ShieldCheck size={14} />
              <span>Switch to Starq HQ</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)] border-l pl-3 border-[var(--md-sys-color-outline-variant)]">
            <span className="hidden md:inline font-medium text-[var(--md-sys-color-on-surface)]">
              {session?.name || session?.email}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)]/20 transition-colors"
              title="Sign Out"
            >
              <LogOut size={13} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div
          className="w-full max-w-xl rounded-2xl border shadow-lg p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          {/* Header Icon & Status */}
          <div className="text-center mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
              style={{
                backgroundColor: 'var(--md-sys-color-secondary-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                color: 'var(--md-sys-color-on-secondary-container)',
              }}
            >
              <Clock size={28} />
            </div>

            <Badge variant={badgeVariant} size="md" className="mb-2">
              {statusLabel}
            </Badge>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
              Organisation Under Review
            </h1>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1.5 max-w-md mx-auto">
              Your business application has been submitted and is currently awaiting administrator review and provisioning by Starq HQ.
            </p>
          </div>

          {/* Application Summary Box */}
          <div
            className="rounded-xl border p-4 sm:p-5 mb-6 space-y-3"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">Business Name</span>
              <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                <Building2 size={13} className="text-[var(--md-sys-color-primary)]" />
                {app?.name || 'Submitted Application'}
              </span>
            </div>

            {legalName && (
              <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">Legal Entity</span>
                <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">{legalName}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">Applicant</span>
              <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                <Mail size={13} className="text-[var(--md-sys-color-on-surface-variant)]" />
                {(app && 'applicantEmail' in app ? app.applicantEmail : undefined) || session?.email || 'Authenticated Applicant'}
              </span>
            </div>

            {app?.id && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">Reference ID</span>
                <span className="mono-num text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  {app.id}
                </span>
              </div>
            )}
          </div>

          {/* Info / Status Notice */}
          <div
            className="flex items-start gap-3 p-3.5 rounded-xl border text-xs mb-6"
            style={{
              backgroundColor:
                app?.status === 'rejected'
                  ? 'var(--md-sys-color-error-container, #fee2e2)'
                  : app?.status === 'approved'
                    ? 'var(--md-sys-color-secondary-container, #dcfce7)'
                    : 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              color:
                app?.status === 'rejected'
                  ? 'var(--md-sys-color-on-error-container, #991b1b)'
                  : app?.status === 'approved'
                    ? 'var(--md-sys-color-on-secondary-container, #166534)'
                    : 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            <Info size={16} className="text-[var(--md-sys-color-primary)] shrink-0 mt-0.5" />
            <span>
              {app?.status === 'rejected' && rejectionReason
                ? `Decline reason: ${rejectionReason}`
                : app?.status === 'info_requested' && infoRequestNote
                  ? `Information requested: ${infoRequestNote}`
                  : app?.status === 'approved'
                    ? 'Your organisation has been approved and provisioned! Entering your operational workspace...'
                    : 'In accordance with Starq governance doctrine, no account may access or operate an organisation without administrative verification. Once approved, your tenant books and operational modules will activate automatically.'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all text-[var(--md-sys-color-on-primary)] bg-[var(--md-sys-color-primary)] hover:opacity-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>
                {isRefreshing
                  ? 'Checking Status...'
                  : app?.status === 'approved'
                    ? 'Enter Workspace'
                    : 'Check Approval Status'}
              </span>
            </button>

            {isPlatformOperator ? (
              <button
                type="button"
                onClick={() => switchActiveContext({ plane: 'platform' })}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-primary)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <ShieldCheck size={14} />
                <span>Go to Starq HQ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => logout()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* System Footer */}
      <footer
        className="w-full px-4 lg:px-8 py-3 flex items-center justify-between border-t text-[11px] shrink-0"
        style={{
          borderColor: 'var(--md-sys-color-outline-variant)',
          color: 'var(--md-sys-color-on-surface-variant)',
          backgroundColor: 'var(--md-sys-color-surface-container-low)',
        }}
      >
        <span
          className="mono-num"
          title={typeof __BUILD_TIME__ !== 'undefined' ? `Built: ${__BUILD_TIME__}` : undefined}
        >
          starqERP {getFormattedProductVersion()} ({typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'})
        </span>
        <span>Secure Identity Gate</span>
      </footer>
    </div>
  );
};
