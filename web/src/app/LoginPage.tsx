import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { loginWithGoogle } from '../services/auth';
import { StarqBrandLockup, StarqCorporateBrand } from '../components/brand/StarqLogo';
import { ThemeSelector } from '../components/ui/ThemeSelector';
import { getFormattedProductVersion } from '../../../contracts/commands';
import {
  ShieldCheck,
  Building2,
  Lock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID || '901212915429-l7i347so1avnr0dnaq50hfi91fm0d0o4.apps.googleusercontent.com'
).trim();

function sanitizeErrorMessage(code: string): string {
  switch (code) {
    case 'not_allowlisted':
      return 'Your account is not allowlisted for this starqERP tenant. Please contact your organization administrator to request access.';
    case 'identity_audience_rejected':
      return 'Authentication audience mismatch. The client application configuration does not match the server policy.';
    case 'invalid_google_token':
      return 'The Google identity token was invalid or has expired. Please sign in again.';
    case 'no_active_seat':
      return 'Your account exists but has no active seats assigned. Please contact your administrator.';
    case 'identity_binding_conflict':
      return 'Account binding conflict detected. Please sign in using your originally linked Google account.';
    case 'organisation_not_found':
      return 'Your assigned organization was not found or is currently inactive.';
    case 'network_error':
    case 'Failed to fetch':
      return 'Unable to reach the starqERP authentication service. Please check your internet connection and try again.';
    default:
      return code.startsWith('error:') ? code.slice(6).trim() : code || 'Sign in failed. Please try again.';
  }
}

export const LoginPage: React.FC = () => {
  const { login, session } = useAuth();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);
  const [buttonWidth, setButtonWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(320, Math.max(240, window.innerWidth - 64)) : 300,
  );
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  // Dynamically calculate Google button width based on container
  useEffect(() => {
    const handleResize = () => {
      const width = typeof window !== 'undefined' ? window.innerWidth : 360;
      const target = Math.min(320, Math.max(240, width - 48));
      setButtonWidth(target);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // If already authenticated, redirect to root workspace
  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  // Handle Google Identity Services credential response
  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential) {
        setError('No identity credential received from Google.');
        return;
      }

      setIsLoggingIn(true);
      setError(null);

      try {
        const user = await loginWithGoogle(response.credential);
        login(user);
        navigate('/', { replace: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        setError(sanitizeErrorMessage(message));
      } finally {
        setIsLoggingIn(false);
      }
    },
    [login, navigate],
  );

  // Check for Google Identity Services script availability
  useEffect(() => {
    if (window.google?.accounts?.id) {
      setGisLoaded(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.id) {
        setGisLoaded(true);
        clearInterval(checkInterval);
      }
    }, 150);

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
    }, 4000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize and render Google Sign-In button whenever GIS, theme, or width changes
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !gisLoaded || !buttonContainerRef.current || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear previous container content before rendering
      buttonContainerRef.current.innerHTML = '';

      window.google.accounts.id.renderButton(buttonContainerRef.current, {
        theme: resolvedTheme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        type: 'standard',
        text: 'continue_with',
        shape: 'rectangular',
        width: buttonWidth,
        logo_alignment: 'left',
      });
    } catch (renderError) {
      console.error('[starqERP] Failed to render Google Sign-In button:', renderError);
    }
  }, [GOOGLE_CLIENT_ID, gisLoaded, resolvedTheme, buttonWidth, handleCredentialResponse]);

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between overflow-x-hidden"
      style={{
        backgroundColor: 'var(--md-sys-color-surface)',
        color: 'var(--md-sys-color-on-surface)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ── Top Bar / Header ── */}
      <header className="w-full px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/40 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <StarqBrandLockup size="sm" />
          <span
            className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 rounded-full font-medium shrink-0 border border-[var(--md-sys-color-outline-variant)]/60"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
            <span className="hidden xs:inline">Production </span>
            <span>Auth Gate</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span
            className="hidden sm:inline-block text-xs"
            style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
          >
            Appearance
          </span>
          <ThemeSelector />
        </div>
      </header>

      {/* ── Main Content Responsive Surface ── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-12 flex items-center justify-center">
        <div
          className="w-full grid grid-cols-1 lg:grid-cols-12 rounded-[var(--md-sys-shape-corner-extra-large)] border border-[var(--md-sys-color-outline-variant)] shadow-xl overflow-hidden"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
          }}
        >
          {/* Primary Sign-In Pane */}
          <div
            className="order-1 lg:order-2 col-span-1 lg:col-span-5 flex flex-col justify-center p-6 sm:p-8 lg:p-12 relative border-b lg:border-b-0 lg:border-l border-[var(--md-sys-color-outline-variant)]/60"
            style={{
              backgroundColor: 'var(--md-sys-color-surface)',
            }}
          >
            <div className="w-full max-w-sm mx-auto space-y-5 sm:space-y-6">
              {/* Brand Lockup & Title */}
              <div className="space-y-2 sm:space-y-3 text-center sm:text-left">
                <div className="flex justify-center sm:justify-start">
                  <StarqBrandLockup size="lg" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
                    Sign in to your workspace
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    Continue with your verified Google account to access your organization workspace.
                  </p>
                </div>
              </div>

              {/* Error Notification Banner */}
              {error && (
                <div
                  role="alert"
                  className="p-3 sm:p-3.5 rounded-[var(--md-sys-shape-corner-medium)] flex items-start gap-2.5 sm:gap-3 text-xs leading-relaxed border animate-in fade-in duration-200"
                  style={{
                    backgroundColor: 'var(--md-sys-color-error-container)',
                    color: 'var(--md-sys-color-on-error-container)',
                    borderColor: 'var(--md-sys-color-error)',
                  }}
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold mb-0.5">Authentication Issue</p>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {/* Primary Action: Continue with Google */}
              <div className="pt-2 space-y-4">
                {GOOGLE_CLIENT_ID ? (
                  <div className="flex flex-col items-center justify-center min-h-[48px] w-full">
                    <div
                      ref={buttonContainerRef}
                      className={`flex justify-center w-full overflow-hidden transition-opacity duration-200 ${
                        isLoggingIn ? 'opacity-40 pointer-events-none' : 'opacity-100'
                      }`}
                    />

                    {!gisLoaded && !isLoggingIn && (
                      <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)] py-2">
                        <div
                          className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                          aria-hidden="true"
                        />
                        <span className="text-[11px]">Connecting Google Identity Services...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="p-3.5 rounded-[var(--md-sys-shape-corner-medium)] text-xs border"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-high)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                      color: 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <div className="flex items-center gap-2 font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
                      <Lock size={14} />
                      <span>Google OAuth Configuration Required</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Set <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">VITE_GOOGLE_CLIENT_ID</code> in <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">web/.env.local</code> to enable Google Sign-In.
                    </p>
                  </div>
                )}

                {isLoggingIn && (
                  <div className="flex items-center justify-center gap-2 text-xs font-medium text-[var(--md-sys-color-primary)] pt-1">
                    <div
                      className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                      aria-hidden="true"
                    />
                    <span>Validating credentials with starqERP gateway...</span>
                  </div>
                )}
              </div>

              {/* Security Protocol Notice */}
              <div
                className="p-3 rounded-[var(--md-sys-shape-corner-medium)] text-[11px] leading-relaxed border space-y-1"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[var(--md-sys-color-on-surface)]">
                  <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                  <span>Enterprise Zero-Trust Access</span>
                </div>
                <p className="text-[10px]">
                  All access is verified against authorized seat mappings. Single Sign-On sessions are signed with cryptographic tokens and isolated by tenant boundary.
                </p>
              </div>
            </div>
          </div>

          {/* Left / Desktop Brand Context Panel */}
          <div
            className="order-2 lg:order-1 col-span-1 lg:col-span-7 p-6 sm:p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
            }}
          >
            <div className="space-y-6 sm:space-y-8 relative z-10">
              <div>
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3 border border-[var(--md-sys-color-outline-variant)]"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  <Sparkles size={12} />
                  <span>Maldives SME Operating System</span>
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] leading-tight">
                  One Operational Record for Your Enterprise
                </h1>
                <p className="text-xs sm:text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2 sm:mt-3 leading-relaxed max-w-lg">
                  Unified customers, job work orders, MIRA GST statutory compliance, warehouse inventory, and ledger settlement in a single multi-tenant workspace.
                </p>
              </div>

              {/* Value Proposition Pills */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {[
                  {
                    title: 'Maldives-Ready Finance',
                    desc: 'Configurable invoicing, accounting and tax foundations for Maldivian businesses.',
                    icon: Building2,
                  },
                  {
                    title: 'Operations & Workflows',
                    desc: 'Configurable work, service and operational workflows across different business types.',
                    icon: ShieldCheck,
                  },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-[var(--md-sys-shape-corner-medium)] border space-y-1.5"
                      style={{
                        backgroundColor: 'var(--md-sys-color-surface)',
                        borderColor: 'var(--md-sys-color-outline-variant)',
                      }}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs text-[var(--md-sys-color-on-surface)]">
                        <Icon size={15} className="text-[var(--md-sys-color-primary)]" />
                        <span>{item.title}</span>
                      </div>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Tenant Verification Badge */}
            <div className="pt-6 sm:pt-8 border-t border-[var(--md-sys-color-outline-variant)]/50 mt-6 relative z-10 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              <StarqCorporateBrand
                variant="compact"
                size="sm"
              />
              <span
                className="mono-num text-[10px] font-mono"
                title={typeof __BUILD_TIME__ !== 'undefined' ? `Built: ${__BUILD_TIME__}` : undefined}
              >
                starqERP {getFormattedProductVersion()} ({typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev'}) • Maldives
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full px-3 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--md-sys-color-outline-variant)]/40 text-[11px] text-[var(--md-sys-color-on-surface-variant)] shrink-0">
        <div className="flex items-center gap-2">
          <StarqCorporateBrand
            variant="inline"
            size="xs"
            prefixText={`© ${new Date().getFullYear()}`}
            legalSuffix
          />
          <span className="hidden sm:inline">&bull;</span>
          <span className="hidden sm:inline">Republic of Maldives</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/docs/PRIVACY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-[var(--md-sys-color-on-surface)]"
          >
            Privacy
          </a>
          <a
            href="/docs/TERMS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-[var(--md-sys-color-on-surface)]"
          >
            Terms
          </a>
          <a
            href="/docs/SUPPORT.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-[var(--md-sys-color-on-surface)]"
          >
            Support
          </a>
        </div>
      </footer>
    </div>
  );
};
