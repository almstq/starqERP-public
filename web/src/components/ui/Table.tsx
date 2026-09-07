import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  compact?: boolean;
}

export const Table: React.FC<TableProps> = ({
  children,
  compact = true,
  className = '',
  style,
  ...props
}) => {
  return (
    <div
      className="w-full min-w-0 overflow-x-auto"
      style={{
        backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
        border: '1px solid var(--md-sys-color-outline-variant)',
        borderRadius: 'var(--md-sys-shape-corner-medium)',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      <table className={`w-full min-w-full text-left border-collapse text-xs ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => {
  return (
    <thead
      style={{
        backgroundColor: 'var(--md-sys-color-surface-container)',
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        color: 'var(--md-sys-color-on-surface-variant)',
        ...style,
      }}
      className={`text-[10px] font-semibold uppercase tracking-wider ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  style,
  ...props
}) => {
  return (
    <tbody
      style={{
        backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
        color: 'var(--md-sys-color-on-surface)',
        ...style,
      }}
      className={`divide-y divide-[var(--md-sys-color-outline-variant)] ${className}`}
      {...props}
    >
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <tr
      className={`transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] cursor-default ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement> & { alignRight?: boolean }> = ({
  children,
  alignRight = false,
  className = '',
  ...props
}) => {
  return (
    <th className={`px-3.5 sm:px-4 py-2.5 font-medium whitespace-nowrap ${alignRight ? 'text-right' : 'text-left'} ${className}`} {...props}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement> & { alignRight?: boolean; isNumeric?: boolean }> = ({
  children,
  alignRight = false,
  isNumeric = false,
  className = '',
  ...props
}) => {
  return (
    <td className={`px-3.5 sm:px-4 py-2.5 ${alignRight || isNumeric ? 'text-right' : 'text-left'} ${isNumeric ? 'mono-num whitespace-nowrap' : ''} ${className}`} {...props}>
      {children}
    </td>
  );
};
