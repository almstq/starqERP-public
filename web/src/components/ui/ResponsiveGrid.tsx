import React from 'react';

export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4 | 6 | 12 | 'auto';
  gap?: 'sm' | 'md' | 'lg';
  minItemWidth?: string;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns = 'auto',
  gap = 'md',
  minItemWidth = '240px',
  className = '',
  style,
  ...props
}) => {
  const gapClasses = {
    sm: 'gap-2.5 sm:gap-3',
    md: 'gap-3 sm:gap-4 lg:gap-5',
    lg: 'gap-4 sm:gap-5 lg:gap-6',
  }[gap];

  // Intrinsic auto-fit pattern when columns === 'auto'
  if (columns === 'auto') {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minItemWidth}), 1fr))`,
          ...style,
        }}
        className={`w-full min-w-0 ${gapClasses} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Explicit columns with minmax(0, 1fr) tracks to prevent track blowout from long children
  const getExplicitTemplate = (cols: number): string => {
    switch (cols) {
      case 1:
        return 'minmax(0, 1fr)';
      case 2:
        return 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))';
      case 3:
        return 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))';
      case 4:
        return 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))';
      case 6:
        return 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))';
      case 12:
        return 'repeat(12, minmax(0, 1fr))';
      default:
        return `repeat(${cols}, minmax(0, 1fr))`;
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: getExplicitTemplate(columns),
        ...style,
      }}
      className={`w-full min-w-0 ${gapClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
