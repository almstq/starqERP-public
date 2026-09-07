import React from 'react';

export interface StateLayerProps {
  color?: string;
  className?: string;
}

export const StateLayer: React.FC<StateLayerProps> = ({ color, className = '' }) => {
  return (
    <span
      className={`absolute inset-0 pointer-events-none rounded-[inherit] transition-opacity duration-150 opacity-0 group-hover:opacity-[var(--md-sys-state-hover-opacity)] group-focus-visible:opacity-[var(--md-sys-state-focus-opacity)] group-active:opacity-[var(--md-sys-state-pressed-opacity)] ${className}`}
      style={{
        backgroundColor: color || 'currentColor',
      }}
      aria-hidden="true"
    />
  );
};
