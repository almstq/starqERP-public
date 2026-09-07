import React from 'react';

export interface StarqLogomarkProps {
  size?: number;
  className?: string;
}

/**
 * Authoritative Canonical Starq Logomark SVG
 * Sourced directly from brand/v1.0/starqERP_brand_kit/logos/starq_logomark_light.svg
 */
export const StarqLogomark: React.FC<StarqLogomarkProps> = ({ size = 20, className = '' }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 18H34C41 18 46 23 46 30V34" />
      <path d="M10 32H38" />
      <path d="M10 46H30C38 46 43 42 46 36L56 54" />
    </svg>
  );
};

export interface StarqERPBrandProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTag?: boolean;
}

/**
 * Authoritative starqERP Product Brand: Blue container + "starq" + "ERP" badge
 * Use on PRODUCT surfaces (navigation mastheads, login hero, app shell).
 */
export const StarqERPBrand: React.FC<StarqERPBrandProps> = ({
  size = 'md',
  className = '',
  showTag = true,
}) => {
  const iconSizes = { sm: 16, md: 18, lg: 24 };
  const textSizes = {
    sm: 'text-sm',
    md: 'text-base font-bold',
    lg: 'text-xl font-bold',
  };
  const badgeSizes = {
    sm: 'text-[9px] px-1 py-0.2',
    md: 'text-[10px] px-1.5 py-0.5',
    lg: 'text-xs px-2 py-0.5',
  };

  return (
    <div className={`flex items-center gap-2.5 select-none min-w-0 ${className}`}>
      <div
        className="flex items-center justify-center rounded-[var(--md-sys-shape-corner-small)] shrink-0 transition-transform"
        style={{
          backgroundColor: 'var(--md-sys-color-primary)',
          color: 'var(--md-sys-color-on-primary)',
          padding: size === 'sm' ? '5px' : size === 'lg' ? '8px' : '6px',
        }}
      >
        <StarqLogomark size={iconSizes[size]} />
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`tracking-tight text-[var(--md-sys-color-on-surface)] ${textSizes[size]}`}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          starq
        </span>

        {showTag && (
          <span
            className={`font-mono font-bold uppercase rounded-[var(--md-sys-shape-corner-extra-small)] tracking-wider shrink-0 ${badgeSizes[size]}`}
            style={{
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
            }}
          >
            ERP
          </span>
        )}
      </div>
    </div>
  );
};

export const StarqBrandLockup = StarqERPBrand;

export interface StarqCorporateBrandProps {
  variant?: 'inline' | 'compact' | 'card';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  legalSuffix?: boolean; // false -> "Starq Technologies", true -> "Starq Technologies Pvt Ltd"
  legalName?: string;
  prefixText?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Authoritative Starq Technologies Corporate / Studio Brand
 * Represents the COMPANY / SOFTWARE STUDIO / BUILDER (not the product).
 * Uses the official Starq Technologies corporate logo asset (/starq-logo.png).
 */
export const StarqCorporateBrand: React.FC<StarqCorporateBrandProps> = ({
  variant = 'compact',
  size = 'sm',
  legalSuffix = false,
  legalName,
  prefixText,
  subtitle,
  className = '',
}) => {
  const displayName = legalName || (legalSuffix ? 'Starq Technologies Pvt Ltd' : 'Starq Technologies');

  if (variant === 'inline') {
    const imgHeights = { xs: '13px', sm: '15px', md: '17px', lg: '20px' };
    return (
      <span className={`inline-flex items-center gap-1.5 align-middle select-none ${className}`}>
        <img
          src="/starq-logo.png"
          alt="Starq Technologies"
          className="inline-block object-contain shrink-0"
          style={{ height: imgHeights[size], width: 'auto' }}
        />
        {prefixText && <span>{prefixText}</span>}
        <span className="font-semibold">{displayName}</span>
      </span>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`flex items-center gap-3 select-none min-w-0 ${className}`}>
        <div className="p-1 rounded-xl bg-slate-900/5 dark:bg-white/5 border border-slate-200 dark:border-slate-700/50 shrink-0 flex items-center justify-center">
          <img
            src="/starq-logo.png"
            alt="Starq Technologies"
            className="object-contain h-9 w-auto"
          />
        </div>
        <div className="min-w-0 leading-tight space-y-0.5">
          <div className="font-bold text-sm text-[var(--md-sys-color-on-surface)] truncate">
            {displayName}
          </div>
          {subtitle && (
            <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
              {subtitle}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default: 'compact'
  const imgHeights = { xs: '14px', sm: '18px', md: '22px', lg: '28px' };
  const textSizes = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm font-semibold',
    lg: 'text-base font-bold',
  };

  return (
    <div className={`flex items-center gap-2 select-none min-w-0 ${className}`}>
      <img
        src="/starq-logo.png"
        alt="Starq Technologies"
        className="object-contain shrink-0"
        style={{ height: imgHeights[size], width: 'auto' }}
      />
      <div className="min-w-0 leading-tight">
        {prefixText && <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mr-1">{prefixText}</span>}
        <span className={`font-semibold text-[var(--md-sys-color-on-surface)] truncate ${textSizes[size]}`}>
          {displayName}
        </span>
        {subtitle && (
          <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export const StarqCorporateIdentity = StarqCorporateBrand;
export const StarqCorporateBadge = StarqCorporateBrand;
