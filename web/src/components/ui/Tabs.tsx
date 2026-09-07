import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center gap-1 overflow-x-auto ${className}`}
      role="tablist"
      style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
    >
      {items.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            style={{
              color: isActive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
              borderBottom: isActive
                ? '3px solid var(--md-sys-color-primary)'
                : '3px solid transparent',
              fontWeight: isActive ? 600 : 500,
            }}
            className="flex items-center gap-2 px-4 py-3 text-xs transition-colors cursor-pointer select-none whitespace-nowrap hover:text-[var(--md-sys-color-on-surface)]"
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                style={{
                  backgroundColor: isActive
                    ? 'var(--md-sys-color-primary-container)'
                    : 'var(--md-sys-color-surface-container-high)',
                  color: isActive
                    ? 'var(--md-sys-color-on-primary-container)'
                    : 'var(--md-sys-color-on-surface-variant)',
                  borderRadius: 'var(--md-sys-shape-corner-full)',
                }}
                className="px-2 py-0.5 text-[10px] font-semibold mono-num"
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
