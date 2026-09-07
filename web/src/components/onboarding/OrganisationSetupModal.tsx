import React, { useState } from 'react';
import {
  Building2,
  Globe,
  Receipt,
  Landmark,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Flame,
  Ship,
  Activity,
  Boxes,
  HelpCircle,
  AlertTriangle,
  Lock,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { IndustryType } from '../../types/erp';
import type { ArchetypeId } from '../../domain/archetypes';
import { Badge } from '../common/Badge';

interface OrganisationSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrganisationSetupModal: React.FC<OrganisationSetupModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { createTenant } = useERP();
  const [step, setStep] = useState<number>(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Client-settable form state
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [industry, setIndustry] = useState<IndustryType>('Automotive & Body Repair');
  const [currency, setCurrency] = useState<'MVR' | 'USD'>('MVR');
  const [tinNumber, setTinNumber] = useState('');
  const [gstRate, setGstRate] = useState<number>(8);
  const [financialYearStart] = useState('01-01');
  const [financialYearEnd] = useState('12-31');
  const [phone, setPhone] = useState('+960 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [island, setIsland] = useState("Male'");
  const [atoll, setAtoll] = useState('Kaafu Atoll');
  const [bmlAccount, setBmlAccount] = useState('');
  const [mibAccount, setMibAccount] = useState('');
  const [jobPrefix, setJobPrefix] = useState('JOB-');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');

  const archetypeIdForIndustry = (value: IndustryType): ArchetypeId => {
    if (value === 'Automotive & Body Repair') return 'automotive_workshop';
    if (value === 'Marine & Boatyard') return 'marine_service';
    if (value === 'Retail & Wholesale Trading') return 'wholesale_trading';
    if (value === 'Construction & Engineering') return 'construction_contracting';
    return 'general_business';
  };

  if (!isOpen) return null;

  const handleSelectIndustry = (type: IndustryType) => {
    setIndustry(type);
    if (!name) {
      if (type === 'Automotive & Body Repair') {
        setName('Velocity Motors & Spray Garage');
        setJobPrefix('VM-JOB-');
        setInvoicePrefix('VM-INV-');
      } else if (type === 'Marine & Boatyard') {
        setName('BlueWave Marine Slipway');
        setJobPrefix('BW-SLIP-');
        setInvoicePrefix('BW-INV-');
      } else if (type === 'Medical Clinic & Diagnostics') {
        setName('Apex Polyclinic & Care');
        setJobPrefix('APEX-MED-');
        setInvoicePrefix('APEX-INV-');
      } else if (type === 'Retail & Wholesale Trading') {
        setName('Islanders Hardware & Mart');
        setJobPrefix('ORD-');
        setInvoicePrefix('INV-');
      }
    }
  };

  const handleNextStep = () => {
    setValidationError(null);
    if (step === 1) {
      if (!name.trim()) {
        setValidationError('Organization display name is required to proceed.');
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const handleCompleteSetup = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Organization display name is required.');
      setStep(1);
      return;
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const symbol = currency === 'MVR' ? 'Rf' : '$';

    // Invariant: Never invent values for blank fields (DEC-073 §10 / SERP-276).
    // A blank TIN field means "not_registered", recorded with empty tinNumber.
    // A blank bank account remains empty without synthesized account numbers.
    const cleanTin = tinNumber.trim();
    const cleanBml = bmlAccount.trim();
    const cleanMib = mibAccount.trim();

    createTenant({
      name: name.trim(),
      slug,
      archetypeId: archetypeIdForIndustry(industry),
      legalName: legalName.trim() || `${name.trim()} Pvt Ltd`,
      industry,
      currency,
      currencySymbol: symbol,
      tinNumber: cleanTin,
      gstStatus: cleanTin ? 'registered' : 'not_registered',
      gstRate,
      financialYearStart,
      financialYearEnd,
      phone: phone.trim() !== '+960' ? phone.trim() : '',
      email: email.trim(),
      address: address.trim(),
      island: island || "Male'",
      atoll: atoll || 'Kaafu Atoll',
      bmlAccount: cleanBml ? (cleanBml.includes('(') ? cleanBml : `${cleanBml} (BML)`) : '',
      mibAccount: cleanMib ? (cleanMib.includes('(') ? cleanMib : `${cleanMib} (MIB)`) : undefined,
      themeColor:
        industry === 'Medical Clinic & Diagnostics'
          ? '#059669'
          : industry === 'Marine & Boatyard'
          ? '#0284c7'
          : '#2563eb',
    });

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      data-testid="organisation-setup-modal"
    >
      <div className="relative w-full max-w-3xl my-8 rounded-3xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] shadow-2xl overflow-hidden transition-all">
        {/* Top Gradient Banner */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 sm:px-8 py-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-[var(--md-sys-color-surface-container-high)]/10 hover:bg-[var(--md-sys-color-surface-container-high)]/20 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[var(--md-sys-color-surface-container-high)]/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)]/20 text-white uppercase tracking-wider">
                  Self-Service Onboarding Wizard
                </span>
                <Badge variant="blue" size="sm">SERP-276</Badge>
                <span className="text-xs text-blue-100 ml-auto">Step {step} of 3</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5 text-white">
                Configure New Maldivian Organisation
              </h2>
            </div>
          </div>

          {/* Progress step indicators */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <div className={`h-1.5 rounded-full transition-all ${step >= 1 ? 'bg-[var(--md-sys-color-surface-container-high)]' : 'bg-[var(--md-sys-color-surface-container-high)]/30'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-[var(--md-sys-color-surface-container-high)]' : 'bg-[var(--md-sys-color-surface-container-high)]/30'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 3 ? 'bg-[var(--md-sys-color-surface-container-high)]' : 'bg-[var(--md-sys-color-surface-container-high)]/30'}`} />
          </div>
        </div>

        {/* Validation error banner */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span data-testid="wizard-validation-error">{validationError}</span>
          </div>
        )}

        {/* Modal Form Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                  <span>Step 1: Business Activity & Organization Identity</span>
                  <Badge variant="blue" size="sm">Client Configurable</Badge>
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5">
                  Select your SME industry archetype. StarqERP will automatically seed tailored workflow stages, document numbering, and operational accounts.
                </p>
              </div>

              {/* Industry Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'Automotive & Body Repair',
                    title: 'Automotive & Body Repair',
                    desc: 'Work orders, paint booth cycles, vehicle plates, spray materials, body prep.',
                    icon: Flame,
                  },
                  {
                    id: 'Marine & Boatyard',
                    title: 'Marine & Speedboat Yard',
                    desc: 'Slipway hauling, hull antifouling, fiberglass layup, marine outboards.',
                    icon: Ship,
                  },
                  {
                    id: 'Medical Clinic & Diagnostics',
                    title: 'Medical Clinic & Diagnostics',
                    desc: 'Patient vitals triage, physician consults, lab diagnostics, pharmacy billing.',
                    icon: Activity,
                  },
                  {
                    id: 'Retail & Wholesale Trading',
                    title: 'Retail & Wholesale Trading',
                    desc: 'POS transactions, multi-store stock, purchase orders, vendor payables.',
                    icon: Boxes,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = industry === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectIndustry(item.id as IndustryType)}
                      data-testid={`industry-card-${item.id}`}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 dark:border-blue-500 shadow-xs'
                          : 'border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline-variant)] dark:hover:border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]/50 bg-[var(--md-sys-color-surface-container)]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-[var(--md-sys-color-surface-container-highest)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                            {item.title}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] pl-10">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Business Name Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Organization Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Velocity Motors & Spray Garage"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="input-org-name"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Registered Legal Entity Name
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="e.g. Velocity Motors Maldives Pvt Ltd"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="input-org-legal-name"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                  <span>Step 2: Tax Registration & Document Numbering</span>
                  <Badge variant="blue" size="sm">Client Configurable</Badge>
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5">
                  Configure Maldives Inland Revenue Authority (MIRA) GST registration and document sequence prefixes.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    MIRA GST TIN Registration Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value)}
                    placeholder="Leave blank if not registered"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-blue-600 dark:text-blue-400 font-mono font-bold focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="input-tin-number"
                  />
                  <span className="text-[10px] text-[var(--md-sys-color-outline)] mt-1 block">
                    {tinNumber.trim()
                      ? '✓ Registered MIRA TIN will be printed on formal tax invoices'
                      : 'Unregistered tenants issue non-GST commercial bills (zero invented placeholders).'}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Applicable GST Rate (%)
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="select-gst-rate"
                  >
                    <option value={8}>8% Standard General GST (GGST)</option>
                    <option value={16}>16% Tourism Sector GST (TGST)</option>
                    <option value={0}>0% Zero-rated / Medical Exempt</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Job / Work Order Prefix
                  </label>
                  <input
                    type="text"
                    value={jobPrefix}
                    onChange={(e) => setJobPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g. JOB-, CI-JOB-"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] font-mono focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="input-job-prefix"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Sales Invoice Prefix
                  </label>
                  <input
                    type="text"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                    placeholder="e.g. INV-, CI-INV-"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] font-mono focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="input-invoice-prefix"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Operating Base Currency
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrency('MVR')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        currency === 'MVR'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]'
                      }`}
                      data-testid="btn-currency-mvr"
                    >
                      MVR (Maldivian Rufiyaa - Rf)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                        currency === 'USD'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]'
                      }`}
                      data-testid="btn-currency-usd"
                    >
                      USD ($ United States Dollar)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                  <span>Step 3: Location, Banking & Statutory Invariants</span>
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] mt-0.5">
                  Confirm island branch, banking settlement accounts, and review non-negotiable statutory governance boundaries.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Registered Island / City
                  </label>
                  <select
                    value={island}
                    onChange={(e) => setIsland(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 text-xs"
                    data-testid="select-island"
                  >
                    <option value="Male'">Male' (Capital)</option>
                    <option value="Hulhumale'">Hulhumale' (Phase 1 / Phase 2)</option>
                    <option value="Thilafushi">Thilafushi Industrial Island</option>
                    <option value="Villimale'">Villimale'</option>
                    <option value="Addu City">Addu City (Hithadhoo / Feydhoo)</option>
                    <option value="Fuvahmulah City">Fuvahmulah City</option>
                    <option value="Kulhudhuffushi City">Kulhudhuffushi City</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Contact Phone & Accounts Email
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+960 778-0000"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 font-mono text-xs"
                      data-testid="input-phone"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@sme.mv"
                      className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 text-xs"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                    Bank of Maldives (BML) Settlement Account (Optional)
                  </label>
                  <input
                    type="text"
                    value={bmlAccount}
                    onChange={(e) => setBmlAccount(e.target.value)}
                    placeholder="e.g. 7730000189201 (Leave empty if none)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/80 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)] focus:outline-hidden focus:border-blue-500 font-mono text-xs"
                    data-testid="input-bml-account"
                  />
                </div>
              </div>

              {/* Product-Fixed Governance Invariants (DEC-073 §10 / Vision §19) */}
              <div className="p-4 rounded-2xl bg-[var(--md-sys-color-surface-container-low)] bg-[var(--md-sys-color-surface-container-high)]/60 border border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)] space-y-2.5" data-testid="governance-invariants-box">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface)]">
                    <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Product-Fixed Governance Invariants (Immutable)</span>
                  </div>
                  <Badge variant="positive" size="sm">Non-Editable Guarantees</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)] dark:text-[var(--md-sys-color-outline)] pt-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Single source of financial truth (DEC-068/A2)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Segregation of Duties (Award vs Pay)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Tenant-isolated Row-Level Security</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Append-only immutable audit ledger</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--md-sys-color-outline-variant)] dark:border-[var(--md-sys-color-outline-variant)]">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  setStep((s) => s - 1);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--md-sys-color-surface-container-high)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] text-[var(--md-sys-color-on-surface-variant)] text-xs font-semibold hover:bg-[var(--md-sys-color-surface-container-highest)] dark:hover:bg-slate-700 transition-colors"
                data-testid="wizard-back-button"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                data-testid="wizard-next-button"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCompleteSetup}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all"
                data-testid="wizard-submit-button"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Launch StarqERP Workspace</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
