import React, { useState } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Filter,
  DollarSign,
  Calendar,
  Building2,
  Tag,
  CreditCard,
  CheckCircle2,
  ArrowUpRight
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { PaymentMethod, Expense } from '../../types/erp';
import {
  Button,
  Input,
  Surface,
  DataTable,
  ColumnDef,
  Badge,
  ActionGroup,
  ResponsiveGrid,
} from '../ui';

export const ExpensesView: React.FC = () => {
  const { expenses, addExpense, formatMVR } = useERP();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [category, setCategory] = useState('Rent & Facilities');
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BML Transfer');
  const [receiptRef, setReceiptRef] = useState('');

  const filtered = expenses.filter((e) => {
    const matchesSearch =
      e.payee.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.receiptRef && e.receiptRef.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'All' || e.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', ...new Set(expenses.map((e) => e.category))];
  const totalExpenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payee || !amount || Number(amount) <= 0) return;
    addExpense({
      category,
      payee,
      description,
      amount: Number(amount),
      date: new Date().toISOString().split('T')[0],
      paymentMethod,
      receiptRef,
      status: 'Paid'
    });
    setIsAddOpen(false);
    setPayee('');
    setDescription('');
    setAmount('');
    setReceiptRef('');
  };

  const columns: ColumnDef<Expense>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '14%',
      hideOn: 'compact',
      render: (exp) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{exp.date}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '20%',
      render: (exp) => (
        <Badge variant="neutral" size="sm">
          {exp.category}
        </Badge>
      ),
    },
    {
      key: 'payee',
      header: 'Payee & Memo',
      width: '32%',
      render: (exp) => (
        <div className="min-w-0">
          <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">{exp.payee}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">{exp.description}</div>
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Channel / Ref',
      width: '18%',
      hideOn: 'medium',
      render: (exp) => (
        <div className="min-w-0">
          <div className="text-xs text-[var(--md-sys-color-on-surface)] truncate">{exp.paymentMethod}</div>
          {exp.receiptRef && (
            <div className="mono-num text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
              Ref: {exp.receiptRef}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      isNumeric: true,
      width: '16%',
      render: (exp) => (
        <span className="font-semibold text-xs tabular-nums text-[var(--md-sys-color-error)]">
          {formatMVR(exp.amount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              Operating Expenses
            </h1>
            <Badge variant="neutral" size="sm">
              {expenses.length} Records
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            Log and track operational overheads — shop rent, STELCO utilities, consumables, and payroll
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0">
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsAddOpen(!isAddOpen)}
            icon={<Plus size={15} />}
          >
            <span>Add Expense</span>
          </Button>
        </ActionGroup>
      </div>

      {/* KPI Cards */}
      <ResponsiveGrid columns="auto" minItemWidth="200px" gap="sm">
        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Total Operating Expenses (MTD)
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-error)] truncate">
            {formatMVR(totalExpenseAmount)}
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Highest Category
          </span>
          <div className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)] truncate">
            Rent & Facilities
          </div>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Settlement Channels
          </span>
          <div className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate mt-1">
            BML Corporate Account • Cash Petty Box
          </div>
        </Surface>
      </ResponsiveGrid>

      {/* Add Expense Form Surface */}
      {isAddOpen && (
        <Surface variant="elevated" level={2} padding="md" className="space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface)]">
              Record New Expense Payment
            </h2>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block mb-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  Expense Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    color: 'var(--md-sys-color-on-surface)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                    borderRadius: 'var(--md-sys-shape-corner-small)',
                  }}
                  className="w-full h-9 px-2.5 text-xs border outline-none cursor-pointer"
                >
                  <option value="Rent & Facilities">Rent & Facilities</option>
                  <option value="Utilities & Electricity">Utilities & Electricity (STELCO)</option>
                  <option value="Consumables & Tools">Consumables & Tools</option>
                  <option value="Staff Payroll & Advance">Staff Payroll & Advance</option>
                  <option value="Freight & Sea Cargo">Freight & Sea Cargo</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  Payee / Vendor
                </label>
                <Input
                  type="text"
                  placeholder="e.g. STELCO Maldives"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  Amount (MVR)
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="MVR amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block mb-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  Description / Bill Memo
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Spray booth electricity bill for April"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    color: 'var(--md-sys-color-on-surface)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                    borderRadius: 'var(--md-sys-shape-corner-small)',
                  }}
                  className="w-full h-9 px-2.5 text-xs border outline-none cursor-pointer"
                >
                  <option value="BML Transfer">BML Transfer</option>
                  <option value="MIB Transfer">MIB Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="POS Card">POS Card</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <Button
                variant="text"
                size="sm"
                type="button"
                onClick={() => setIsAddOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="filled" size="sm" type="submit">
                Confirm & Post Expense
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {/* Filter & Search Toolbar */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        <div className="relative flex-1 w-full md:max-w-md min-w-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by payee, memo, receipt ref…"
            icon={<Search size={14} />}
          />
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0 min-w-0">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Category:
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </Surface>

      {/* Canonical DataTable */}
      <DataTable
        data={filtered}
        columns={columns}
        keyExtractor={(exp) => exp.id}
        emptyMessage="No expense records found matching criteria."
      />
    </div>
  );
};
