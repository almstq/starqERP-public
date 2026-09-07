import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Info,
  Terminal,
  Cpu,
  Mail,
  Scale
} from 'lucide-react';
import { STARQ_ERP_CANONICAL_METADATA, getFormattedProductVersion } from '../../../../contracts/commands';
import { Button, Surface, Badge } from '../ui';
import { StarqERPBrand, StarqCorporateBrand } from '../brand/StarqLogo';
import { useTheme } from '../../context/ThemeContext';
import { AboutInfoCard, AboutSpecItem } from './about/AboutPrimitives';
import { AboutLegalDialog } from './about/AboutLegalDialog';

export const AboutTab: React.FC = () => {
  const { themeMode, resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'privacy' | 'terms' | 'licenses' | null>(null);

  const meta = STARQ_ERP_CANONICAL_METADATA;
  const buildSha = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';
  const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
  const environment = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE || 'development';

  const getSystemInfo = () => {
    return JSON.stringify(
      {
        product: meta.productName,
        version: getFormattedProductVersion(meta),
        semver: meta.version,
        releaseTrack: meta.releaseTrack,
        build: buildSha,
        buildTime,
        environment,
        embeddedAi: meta.embeddedAiName,
        frontend: {
          react: '19',
          reactDom: '19',
          router: '7',
          vite: '6',
          typescript: '5.8',
          tailwind: '4',
          designSystem: 'Starq UI — Material 3 Expressive',
          themeAuthority: 'web/src/theme.css and currently rendered runtime',
          uiArchitecture: 'Starq-owned M3 primitives · product-local composition',
          interactionStandard: 'Accessibility-first · keyboard/focus managed · shadcn-quality polish',
          icons: 'Lucide React',
          charts: 'Recharts',
          forms: 'native/local-domain state',
          tables: 'Starq Table/DataTable + direct HTML tables',
          packageManager: 'npm',
          importAlias: '@/* → src/*',
          headlessRuntime: 'none required',
          shadcnRuntime: 'not mandatory',
          registry: 'none',
          publicationModel: 'private ERP canonical; public ERP derived only',
        },
        company: meta.companyName,
        jurisdiction: meta.legalJurisdiction,
        contact: meta.contactEmail,
        themeMode,
        resolvedTheme,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        timestamp: new Date().toISOString(),
      },
      null,
      2
    );
  };

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(getSystemInfo());
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-8 max-w-4xl">
      {/* Product Masthead */}
      <Surface variant="filled" level={1} padding="lg" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--md-sys-color-outline-variant)] pb-6">
          <div className="space-y-3 min-w-0">
            <StarqERPBrand size="lg" />
            <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed max-w-xl">
              Commercial operating system & multi-tenant enterprise resource platform engineered for
              Maldivian SMEs across diverse operational industries.
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
            <Badge variant="accent" size="md">
              {getFormattedProductVersion(meta)}
            </Badge>
            <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
              Build: {buildSha} · {environment}
            </span>
          </div>
        </div>

        {/* Core Attributes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <AboutInfoCard icon={<Scale size={15} />} title="Corporate Entity & Platform Builder" spacing="space-y-2.5">
            <StarqCorporateBrand
              variant="compact"
              size="md"
              legalSuffix
              subtitle="Platform Builder · Republic of Maldives"
            />
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Built and maintained by Starq Technologies Pvt Ltd under the Maldivian legal jurisdiction.
            </p>
          </AboutInfoCard>

          <AboutInfoCard icon={<Sparkles size={15} />} title="Embedded AI Capability" spacing="space-y-1.5">
            <div className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
              {meta.embeddedAiName}
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Context-aware Maldivian tax & operational assistant built natively into starqERP.
            </p>
          </AboutInfoCard>
        </div>
      </Surface>

      {/* Product Particulars & Metadata */}
      <Surface variant="filled" level={1} padding="md" className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] pb-2.5">
          <Info size={14} className="text-[var(--md-sys-color-primary)]" />
          <span>Product Specifications</span>
        </h3>

        <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs">
          <AboutSpecItem label="Canonical Product Name" value={meta.productName} />
          <AboutSpecItem label="Design System" value="Starq UI — Material 3 Expressive" />
          <AboutSpecItem label="Frontend Stack" value="React 19 · TypeScript 5.8 · Vite 6 · Tailwind CSS 4" />
          <AboutSpecItem label="UI Architecture" value="Starq-owned M3 primitives · product-local composition" />
          <AboutSpecItem label="Interaction Standard" value="Accessibility-first · keyboard/focus managed · shadcn-quality polish" />
          <AboutSpecItem label="Base Ledger Currency" value={`${meta.baseCurrency} (Maldivian Rufiyaa)`} />
          <AboutSpecItem label="Jurisdiction" value={meta.legalJurisdiction} />
          <AboutSpecItem
            label="Technical Support"
            value={
              <span className="flex items-center gap-1">
                <Mail size={12} className="text-[var(--md-sys-color-primary)]" />
                <a href={`mailto:${meta.contactEmail}`} className="hover:underline">{meta.contactEmail}</a>
              </span>
            }
          />
          <AboutSpecItem label="Tax Compliance Baseline" value="MIRA Tax Framework (Configurable GST / DEC-073; requires statutory verification)" />
        </dl>
      </Surface>

      {/* Diagnostics Section (Zero sensitive secrets) */}
      <Surface variant="filled" level={1} padding="md" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-[var(--md-sys-color-primary)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
              Client Runtime Diagnostics
            </h3>
          </div>

          <Button
            variant="tonal"
            size="xs"
            onClick={handleCopyDiagnostics}
            icon={copied ? <Check size={13} /> : <Copy size={13} />}
          >
            <span>{copied ? 'System Info Copied' : 'Copy System Information'}</span>
          </Button>
        </div>

        <div
          className="p-3 rounded-[var(--md-sys-shape-corner-small)] font-mono text-[11px] leading-relaxed overflow-x-auto select-all"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          <div><strong>Product:</strong> {meta.productName} v{meta.version} ({meta.releaseTrack})</div>
          <div><strong>AI Subsystem:</strong> {meta.embeddedAiName} Native Proxy</div>
          <div><strong>Active Theme:</strong> {themeMode} (resolved: {resolvedTheme})</div>
          <div><strong>Environment:</strong> {(import.meta as unknown as { env?: { MODE?: string } }).env?.MODE || 'production'}</div>
          <div><strong>Operating Jurisdiction:</strong> {meta.legalJurisdiction}</div>
        </div>
      </Surface>

      {/* Legal & Compliance Footing */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
        <div>
          © {new Date().getFullYear()} {meta.companyName}. All rights reserved.
        </div>

        <div className="flex items-center gap-4 font-medium">
          <button
            type="button"
            onClick={() => setActiveDialog('privacy')}
            className="hover:text-[var(--md-sys-color-on-surface)] transition-colors underline-offset-2 hover:underline"
          >
            Privacy Notice
          </button>
          <button
            type="button"
            onClick={() => setActiveDialog('terms')}
            className="hover:text-[var(--md-sys-color-on-surface)] transition-colors underline-offset-2 hover:underline"
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setActiveDialog('licenses')}
            className="hover:text-[var(--md-sys-color-on-surface)] transition-colors underline-offset-2 hover:underline"
          >
            Open Source Licences
          </button>
        </div>
      </div>

      {/* Modal Information Surfaces */}
      <AboutLegalDialog
        open={activeDialog !== null}
        onClose={() => setActiveDialog(null)}
        title={
          (activeDialog === 'privacy' && 'Privacy Summary') ||
          (activeDialog === 'terms' && 'Service Terms Summary') ||
          (activeDialog === 'licenses' && 'Open Source Software Attributions') ||
          ''
        }
      >
        {activeDialog === 'privacy' && (
          <>
            <p>
              starqERP enforces strict multi-tenant isolation via database Row-Level Security (RLS) policies and tenant-bound session authorization. Operational ledgers, customer records, and financial transactions are scoped strictly to the authenticated organization.
            </p>
            <p>
              starqAI operates strictly within the active tenant session boundary: conversational prompts and business context are processed for operational assistance and are not shared across organizations.
            </p>
          </>
        )}

        {activeDialog === 'terms' && (
          <>
            <p>
              Licensed by Starq Technologies Pvt Ltd for enterprise operation under the Maldivian legal jurisdiction. MIRA tax calculation rules provide a configurable baseline in accordance with the Goods and Services Tax Act (Law No. 10/2011) and require statutory accounting verification for live filings.
            </p>
            <p>
              Organizations maintain full provenance, auditability, and legal ownership of all transactional data created within the platform.
            </p>
          </>
        )}

        {activeDialog === 'licenses' && (
          <>
            <p>
              starqERP incorporates open source software including React, Vite, Lucide Icons, and Material Color Utilities under the MIT and Apache 2.0 licenses.
            </p>
            <p>
              Full attribution manifests and third-party license notices are preserved in the repository root compliance directory.
            </p>
          </>
        )}
      </AboutLegalDialog>
    </div>
  );
};
