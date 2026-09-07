import React from 'react';

/**
 * Pilot-local presentational helpers for the Settings -> About surface only.
 * Not exported from `components/ui`; must not be imported outside `settings/about`.
 */

export interface AboutInfoCardProps {
  icon: React.ReactNode;
  title: string;
  spacing?: string;
  children: React.ReactNode;
}

export const AboutInfoCard: React.FC<AboutInfoCardProps> = ({ icon, title, spacing = 'space-y-2.5', children }) => (
  <div
    className={`p-4 rounded-[var(--md-sys-shape-corner-medium)] ${spacing}`}
    style={{ backgroundColor: 'var(--md-sys-color-surface-container-high)' }}
  >
    <div className="flex items-center gap-2 text-[var(--md-sys-color-primary)] font-semibold">
      {icon}
      <span>{title}</span>
    </div>
    {children}
  </div>
);

export interface AboutSpecItemProps {
  label: string;
  value: React.ReactNode;
}

export const AboutSpecItem: React.FC<AboutSpecItemProps> = ({ label, value }) => (
  <div>
    <dt className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-medium">{label}</dt>
    <dd className="font-semibold text-[var(--md-sys-color-on-surface)] mt-0.5">{value}</dd>
  </div>
);
