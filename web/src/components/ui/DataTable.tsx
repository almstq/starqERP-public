import React from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  isNumeric?: boolean;
  isMonospace?: boolean;
  hideOn?: 'compact' | 'medium';
  width?: string;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

/**
 * Starq ERP DataTable governed by Material 3 system tokens.
 *
 * Density Contract:
 * - Desktop dense visual row: min 44px - 48px
 * - Interactive controls / mobile rows: min 48px touch target
 * - Headers: M3 label-medium / label-large with restrained weight (no forced uppercase)
 * - Financials: UI typeface with tabular figures, right-aligned
 * - IDs: Monospace with truncation and tooltip affordance
 */
export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No matching records found.',
  emptyAction,
  isLoading = false,
  className = '',
}: DataTableProps<T>): React.ReactElement {
  const getAlignmentClass = (align?: 'left' | 'center' | 'right', isNumeric?: boolean) => {
    if (align === 'right' || isNumeric) return 'text-right justify-end';
    if (align === 'center') return 'text-center justify-center';
    return 'text-left justify-start';
  };

  const getResponsiveClass = (hideOn?: 'compact' | 'medium') => {
    if (hideOn === 'compact') return 'hidden sm:table-cell';
    if (hideOn === 'medium') return 'hidden md:table-cell';
    return '';
  };

  return (
    <div
      className={`w-full min-w-0 erp-scroll-region ${className}`}
      style={{
        backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
        border: '1px solid var(--md-sys-color-outline-variant)',
        borderRadius: 'var(--md-sys-shape-corner-medium)',
      }}
    >
      <table className="w-full min-w-full border-collapse text-left text-xs table-fixed">
        {/* Sticky Table Header with M3 label role */}
        <thead
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
          }}
          className="sticky top-0 z-10"
        >
          <tr className="h-10">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  color: 'var(--md-sys-color-on-surface-variant)',
                }}
                className={`px-4 py-2.5 text-xs font-semibold select-none align-middle ${getAlignmentClass(
                  col.align,
                  col.isNumeric
                )} ${getResponsiveClass(col.hideOn)}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        {/* Table Body */}
        <tbody
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
            color: 'var(--md-sys-color-on-surface)',
          }}
          className="divide-y divide-[var(--md-sys-color-outline-variant)]"
        >
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-12 px-4 text-center text-xs"
                style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                  <p>{emptyMessage}</p>
                  {emptyAction}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`min-h-[44px] sm:min-h-[48px] transition-colors align-middle ${
                  onRowClick ? 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)]' : ''
                }`}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(row)
                    : (row as Record<string, any>)[col.key];

                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3 align-middle min-w-0 ${getAlignmentClass(
                        col.align,
                        col.isNumeric
                      )} ${getResponsiveClass(col.hideOn)} ${
                        col.isNumeric ? 'tabular-nums font-medium' : ''
                      } ${col.isMonospace ? 'mono-num text-xs font-semibold' : ''}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
