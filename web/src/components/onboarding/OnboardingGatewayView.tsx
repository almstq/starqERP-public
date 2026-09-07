import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/apiGateway';
import { StarqLogomark } from '../brand/StarqLogo';
import { Badge } from '../common/Badge';
import { getFormattedProductVersion } from '../../../../contracts/commands';
import { Building2, Sparkles, ShieldCheck, ArrowRight, LogOut, Info, Mail } from 'lucide-react';

const ARCHETYPES = [
  { id: 'automotive_workshop', name: 'Automotive & Workshop', desc: 'Job cards, bay scheduling, parts counter, paint formulas' },
  { id: 'marine_service', name: 'Marine & Boatyard', desc: 'Vessel slipway intake, dock refits, marine engine overhaul' },
  { id: 'wholesale_trading', name: 'Retail & Wholesale Trading', desc: 'SKU catalog, multi-warehouse, BML POS, supplier POs' },
  { id: 'construction_contracting', name: 'Construction & Engineering', desc: 'Project-based contracts, site costing, subcontractors' },
  { id: 'retail', name: 'Retail', desc: 'Counter sales, stock management, receipts' },
  { id: 'general_business', name: 'Professional Services / General', desc: 'Consulting, project billing, contracts, multi-book ledgers' },
];

export const OnboardingGatewayView: React.FC = () => {
  const { submitOrganisationApplication, switchActiveContext } = useERP();
  const { session, logout } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isPlatformOperator = Boolean(session?.platform_entitlement);

  const applicantName = session?.name || 'Authenticated Applicant';
  const applicantEmail = session?.email || 'applicant@example.com';

  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    primaryBookName: '',
    primaryBookCode: '',
    archetypeId: 'automotive_workshop',
    island: "Male'",
    atoll: 'Kaafu Atoll',
    phone: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || isSubmitting) return;

    const chosenArchetype = ARCHETYPES.find((a) => a.id === formData.archetypeId);
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await submitOrganisationApplication({
        name: formData.name.trim(),
        legalName: formData.legalName.trim() || `${formData.name.trim()} Pvt Ltd`,
        primaryBookName: formData.primaryBookName.trim() || formData.name.trim(),
        primaryBookCode: (formData.primaryBookCode.trim() || formData.name.slice(0, 3)).toUpperCase(),
        archetypeId: formData.archetypeId,
        archetypeName: chosenArchetype?.name || 'General Business',
        island: formData.island,
        atoll: formData.atoll,
        applicantName,
        applicantEmail,
        phone: formData.phone,
      });
      // The context will update pendingApplications & session, transitioning to PendingApprovalView automatically
    } catch (err) {
      const code = err instanceof ApiError ? err.code : err instanceof Error ? err.message : 'unknown_error';
      const requestId = err instanceof ApiError ? err.requestId : undefined;
      setSubmitError(
        `Submission failed (${code}).${requestId ? ` Reference: ${requestId}.` : ''} The application was not recorded.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
          className="w-full max-w-2xl rounded-2xl border shadow-lg p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                <Building2 size={18} />
              </div>
              <Badge variant="accent" size="sm">New Organisation Intake</Badge>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
              Register Your Organisation
            </h1>
            <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1">
              Your account currently has no active organisations. Submit your business profile to request an isolated workspace provisioned by Starq HQ.
            </p>
          </div>

          {submitError && (
            <div
              className="p-3.5 rounded-xl border text-xs font-medium mb-5"
              style={{
                backgroundColor: 'var(--md-sys-color-error-container)',
                color: 'var(--md-sys-color-on-error-container)',
                borderColor: 'var(--md-sys-color-error)',
              }}
            >
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Business Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Operating Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Alstarq Marine Workshop"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Legal Entity Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Alstarq Maldives Pvt Ltd"
                  value={formData.legalName}
                  onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>
            </div>

            {/* Archetype Selector */}
            <div>
              <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">
                Industry Archetype & Workflows *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {ARCHETYPES.map((arch) => (
                  <div
                    key={arch.id}
                    onClick={() => setFormData({ ...formData, archetypeId: arch.id })}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      formData.archetypeId === arch.id
                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/20'
                        : 'border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                    }`}
                  >
                    <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)]">
                      {arch.name}
                    </div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5 line-clamp-2">
                      {arch.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Operating Book & Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Primary Book / Facility Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Main Workshop or Harbor Site"
                  value={formData.primaryBookName}
                  onChange={(e) => setFormData({ ...formData, primaryBookName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Book Code (2-8 chars)
                </label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="e.g., HQ, MAIN, SLIP"
                  value={formData.primaryBookCode}
                  onChange={(e) => setFormData({ ...formData, primaryBookCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs uppercase mono-num"
                />
              </div>
            </div>

            {/* Location & Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Island *
                </label>
                <input
                  type="text"
                  required
                  value={formData.island}
                  onChange={(e) => setFormData({ ...formData, island: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Atoll *
                </label>
                <input
                  type="text"
                  required
                  value={formData.atoll}
                  onChange={(e) => setFormData({ ...formData, atoll: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>

              <div>
                <label htmlFor="onboarding-phone-input" className="block font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  id="onboarding-phone-input"
                  type="tel"
                  placeholder="+960 7990000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] text-xs"
                />
              </div>
            </div>

            {/* Applicant Attribution */}
            <div
              className="p-3 rounded-lg border flex items-center justify-between text-[11px]"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-low)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="flex items-center gap-2 text-[var(--md-sys-color-on-surface-variant)]">
                <Mail size={13} />
                <span>Applicant Identity:</span>
              </div>
              <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{applicantEmail}</span>
            </div>

            {/* Privacy Notice */}
            <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed pt-1">
              Starq Technologies collects your organization details solely to provision and administer your tenant preview in accordance with our data protection principles.
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                Need assistance?{' '}
                <a
                  href="mailto:support@starq.tech"
                  className="text-[var(--md-sys-color-primary)] hover:underline font-medium"
                >
                  Contact support@starq.tech
                </a>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !formData.name.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-all text-[var(--md-sys-color-on-primary)] bg-[var(--md-sys-color-primary)] hover:opacity-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>Submit for Starq HQ Approval</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </form>
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
        <span>Organisation Onboarding Gate</span>
      </footer>
    </div>
  );
};
