import React from 'react';

export interface ActionGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'left' | 'center' | 'right' | 'between';
  wrap?: boolean;
}

export const ActionGroup: React.FC<ActionGroupProps> = ({
  children,
  align = 'left',
  wrap = true,
  className = '',
  ...props
}) => {
  const justifyClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
  }[align];

  return (
    <div
      className={`flex items-center gap-2 sm:gap-2.5 min-w-0 ${wrap ? 'flex-wrap' : 'overflow-x-auto'} ${justifyClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
