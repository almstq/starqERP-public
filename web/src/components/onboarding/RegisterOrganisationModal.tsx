import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../services/apiGateway';
import { Modal } from '../common/Modal';
import { Building2, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, UserCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// IDs must match the DB check constraint in migrations 202608270024/26/27.
// Never add an archetype here without updating the migration constraint first.
const ARCHETYPES = [
  { id: 'automotive_workshop', name: 'Automotive & Workshop', desc: 'Job cards, bay scheduling, parts counter, paint formulas' },
  { id: 'marine_service', name: 'Marine & Boatyard', desc: 'Vessel slipway intake, dock refits, marine engine overhaul' },
  { id: 'wholesale_trading', name: 'Retail & Wholesale Trading', desc: 'SKU catalog, multi-warehouse, BML POS, supplier POs' },
  { id: 'construction_contracting', name: 'Construction & Engineering', desc: 'Project-based contracts, site costing, subcontractors' },
  { id: 'retail', name: 'Retail', desc: 'Counter sales, stock management, receipts' },
  { id: 'general_business', name: 'Professional Services / General', desc: 'Consulting, project billing, contracts, multi-book ledgers' },
];

export const RegisterOrganisationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { submitOrganisationApplication } = useERP();
  const { session } = useAuth();
  const [step, setStep] = useState<'form' | 'positive'>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      setStep('positive');
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

  const handleDone = () => {
    setStep('form');
    setFormData({
      name: '',
      legalName: '',
      primaryBookName: '',
      primaryBookCode: '',
      archetypeId: 'automotive_workshop',
      island: "Male'",
      atoll: 'Kaafu Atoll',
      phone: '',
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDone}
      title={step === 'form' ? 'Register New Business Organisation' : 'Application Submitted'}
    >
      {step === 'form' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className="p-3 rounded-[var(--md-sys-shape-corner-medium)] text-xs flex items-start gap-2.5"
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
            }}
          >
            <ShieldCheck size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Starq HQ Governance Pipeline</p>
              <p className="opacity-90 mt-0.5">
                New tenant registrations require verification from the Starq HQ platform operator.
                Once approved in the Superadmin console, this organisation will be provisioned into your workspace.
              </p>
            </div>
          </div>

          <div
            className="p-2.5 rounded-[var(--md-sys-shape-corner-small)] border text-xs flex flex-wrap items-center justify-between gap-1.5"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            {/* SERP-401 UI fix: min-w-0 + truncate prevents name/email from fighting the badge on narrow viewports */}
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck size={16} className="shrink-0 text-[var(--md-sys-color-primary)]" />
              <div className="min-w-0">
                <span className="font-semibold text-[var(--md-sys-color-on-surface)] truncate block">{applicantName}</span>
                <span className="text-[var(--md-sys-color-on-surface-variant)] truncate block">({applicantEmail})</span>
              </div>
            </div>
            <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
              Verified Identity
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Trading / Display Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Alif Marine & Speedboat Yard"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Legal Entity Name
              </label>
              <input
                type="text"
                placeholder="e.g. Alif Marine Engineering Pvt Ltd"
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Initial Operating Activity / Book Name
              </label>
              <input
                type="text"
                placeholder="e.g. Slipway & Boatyard Operations"
                value={formData.primaryBookName}
                onChange={(e) => setFormData({ ...formData, primaryBookName: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Book Code
              </label>
              <input
                type="text"
                maxLength={4}
                placeholder="e.g. SLIP"
                value={formData.primaryBookCode}
                onChange={(e) => setFormData({ ...formData, primaryBookCode: e.target.value.toUpperCase() })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-mono uppercase"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              Industry Operating Archetype *
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {ARCHETYPES.map((arch) => {
                const isSelected = formData.archetypeId === arch.id;
                return (
                  <label
                    key={arch.id}
                    className={`p-2 rounded-[var(--md-sys-shape-corner-small)] border cursor-pointer text-xs flex items-start gap-2 transition-all ${
                      isSelected
                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/20'
                        : 'border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="archetype"
                      checked={isSelected}
                      onChange={() => setFormData({ ...formData, archetypeId: arch.id })}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-[var(--md-sys-color-on-surface)]">{arch.name}</div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{arch.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Island / Location
              </label>
              <input
                type="text"
                value={formData.island}
                onChange={(e) => setFormData({ ...formData, island: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>

            <div>
              <label htmlFor="applicant-phone" className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                Phone Number (Optional)
              </label>
              <input
                id="applicant-phone"
                name="phone"
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full text-xs px-3 py-2 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              />
            </div>
          </div>

          {submitError && (
            <p className="text-xs font-semibold" role="alert" style={{ color: 'var(--md-sys-color-error)' }}>
              {submitError}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            Starq Technologies collects your organization details solely to provision and administer your tenant preview in accordance with our data protection principles.
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
            <button
              type="button"
              onClick={handleDone}
              className="px-4 py-2 rounded-[var(--md-sys-shape-corner-small)] text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              style={{
                backgroundColor: 'var(--md-sys-color-primary)',
                color: 'var(--md-sys-color-on-primary)',
              }}
            >
              <span>{isSubmitting ? 'Submitting…' : 'Submit for Superadmin Approval'}</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Need assistance?{' '}
              <a
                href="mailto:support@starq.tech"
                className="underline hover:text-[var(--md-sys-color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] rounded"
              >
                Contact support@starq.tech
              </a>
            </p>
          </div>
        </form>
      ) : (
        <div className="py-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
              Application Submitted to Starq HQ
            </h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-sm mx-auto mt-1">
              Your request to register <strong>{formData.name}</strong> has been received in the Starq HQ Superadmin Approvals Queue.
            </p>
          </div>
          <div className="p-3 bg-[var(--md-sys-color-surface-container)] rounded-[var(--md-sys-shape-corner-small)] text-xs text-left max-w-sm mx-auto space-y-1">
            <div className="text-[10px] uppercase font-bold text-[var(--md-sys-color-primary)]">Next Step:</div>
            <div className="text-[var(--md-sys-color-on-surface)]">
              Starq HQ must approve this application. Your session will gain an organisation only after <code>provision_approved_application</code> runs.
            </div>
          </div>
          <button
            type="button"
            onClick={handleDone}
            className="px-6 py-2 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold"
            style={{
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
            }}
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
};
