import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Wrench,
  Users,
  Receipt,
  Boxes,
  ArrowRight,
  Sparkles,
  Car,
  X,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';

export const GlobalSearchModal: React.FC = () => {
  const {
    isGlobalSearchOpen,
    setIsGlobalSearchOpen,
    jobs,
    customers,
    invoices,
    inventory,
    setSelectedJobId,
    setSelectedCustomerId,
    setSelectedInvoiceId,
    formatMVR,
  } = useERP();

  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsGlobalSearchOpen]);

  useEffect(() => {
    if (isGlobalSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isGlobalSearchOpen]);

  if (!isGlobalSearchOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredJobs = q
    ? jobs.filter(
        (j) =>
          j.jobId.toLowerCase().includes(q) ||
          j.customerName.toLowerCase().includes(q) ||
          j.vehicle.plateNumber.toLowerCase().includes(q) ||
          j.vehicle.model.toLowerCase().includes(q) ||
          j.serviceType.toLowerCase().includes(q),
      )
    : jobs.slice(0, 3);

  const filteredCustomers = q
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.island.toLowerCase().includes(q) ||
          c.vehicles.some(
            (v) => v.plateNumber.toLowerCase().includes(q) || v.model.toLowerCase().includes(q),
          ),
      )
    : customers.slice(0, 3);

  const filteredInvoices = q
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          (inv.linkedJobNumber && inv.linkedJobNumber.toLowerCase().includes(q)),
      )
    : invoices.slice(0, 2);

  const filteredInventory = q
    ? inventory.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q),
      )
    : inventory.slice(0, 2);

  const totalResults =
    filteredJobs.length + filteredCustomers.length + filteredInvoices.length + filteredInventory.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 p-4">
      {/* Scrim Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => setIsGlobalSearchOpen(false)}
        aria-hidden="true"
      />

      {/* Material 3 Search Dialog Surface */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search across workspace"
        className="relative w-full max-w-2xl rounded-[var(--md-sys-shape-corner-extra-large)] border shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          borderColor: 'var(--md-sys-color-outline-variant)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {/* Search Header Bar */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
        >
          <Search
            size={18}
            className="shrink-0 text-[var(--md-sys-color-primary)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work orders, customers, vehicle plate #, invoices, inventory..."
            aria-label="Search work orders, customers, invoices, inventory"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] text-[var(--md-sys-color-on-surface)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer"
              aria-label="Clear query"
            >
              <X size={15} />
            </button>
          )}
          <kbd
            className="text-[10px] font-mono px-2 py-0.5 rounded border shrink-0"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-highest)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              color: 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4 text-xs">
          {totalResults === 0 && query && (
            <div className="text-center py-10 space-y-2">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                No matching records found
              </p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                No work orders, customers, invoices or stock items match "{query}".
              </p>
            </div>
          )}

          {/* Work Orders */}
          {filteredJobs.length > 0 && (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                <Wrench size={14} />
                <span>Work Orders ({filteredJobs.length})</span>
              </div>
              <div className="space-y-1">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedJobId(job.id);
                      setIsGlobalSearchOpen(false);
                      navigate(`/jobs/${job.id}`);
                    }}
                    className="p-2.5 rounded-[var(--md-sys-shape-corner-medium)] border cursor-pointer flex items-center justify-between transition-colors group"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0"
                        style={{
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        {job.jobId.slice(-3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                            {job.jobId}
                          </span>
                          <span className="text-[var(--md-sys-color-on-surface-variant)] truncate">
                            • {job.customerName}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5 truncate mt-0.5">
                          <Car size={12} className="shrink-0" />
                          <span>
                            {job.vehicle.plateNumber} ({job.vehicle.make} {job.vehicle.model}) — {job.serviceType}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          job.status === 'Completed'
                            ? 'positive'
                            : job.status === 'In Progress'
                            ? 'info'
                            : 'warning'
                        }
                        size="sm"
                      >
                        {job.status}
                      </Badge>
                      <ArrowRight
                        size={15}
                        className="text-[var(--md-sys-color-on-surface-variant)] group-hover:text-[var(--md-sys-color-primary)] group-hover:translate-x-0.5 transition-all"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customers */}
          {filteredCustomers.length > 0 && (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                <Users size={14} />
                <span>Customers & Fleets ({filteredCustomers.length})</span>
              </div>
              <div className="space-y-1">
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setIsGlobalSearchOpen(false);
                      navigate(`/customers/${c.id}`);
                    }}
                    className="p-2.5 rounded-[var(--md-sys-shape-corner-medium)] border cursor-pointer flex items-center justify-between transition-colors group"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div>
                      <div className="font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                        <span>{c.name}</span>
                        <Badge size="sm">{c.type}</Badge>
                      </div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                        {c.phone} • {c.island} • {c.vehicles.length} vehicle(s)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(c.totalInvoiced, false)}
                      </div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        Total Invoiced
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoices */}
          {filteredInvoices.length > 0 && (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                <Receipt size={14} />
                <span>Invoices ({filteredInvoices.length})</span>
              </div>
              <div className="space-y-1">
                {filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvoiceId(inv.id);
                      setIsGlobalSearchOpen(false);
                      navigate(`/invoices/${inv.id}`);
                    }}
                    className="p-2.5 rounded-[var(--md-sys-shape-corner-medium)] border cursor-pointer flex items-center justify-between transition-colors group"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div>
                      <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-[var(--md-sys-color-on-surface-variant)] ml-2">
                        ({inv.customerName})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(inv.totalAmount)}
                      </span>
                      <Badge
                        variant={
                          inv.status === 'Paid'
                            ? 'positive'
                            : inv.status === 'Overdue'
                            ? 'destructive'
                            : 'warning'
                        }
                        size="sm"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory */}
          {filteredInventory.length > 0 && (
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--md-sys-color-primary)' }}
              >
                <Boxes size={14} />
                <span>Inventory & Paint Materials ({filteredInventory.length})</span>
              </div>
              <div className="space-y-1">
                {filteredInventory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setIsGlobalSearchOpen(false);
                      navigate('/inventory');
                    }}
                    className="p-2.5 rounded-[var(--md-sys-shape-corner-medium)] border cursor-pointer flex items-center justify-between transition-colors"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div>
                      <div className="font-bold text-[var(--md-sys-color-on-surface)]">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-mono">
                        {item.sku} • {item.locationInShop}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[var(--md-sys-color-on-surface)]">
                        {item.quantityOnHand} {item.unit}
                      </span>
                      <Badge
                        variant={item.stockStatus === 'Low Stock' ? 'destructive' : 'positive'}
                        size="sm"
                        className="ml-2"
                      >
                        {item.stockStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-3 border-t text-[11px] flex items-center justify-between"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
            color: 'var(--md-sys-color-on-surface-variant)',
          }}
        >
          <span>Quick jump with click or enter</span>
          <span
            className="flex items-center gap-1 font-medium"
            style={{ color: 'var(--md-sys-color-primary)' }}
          >
            <Sparkles size={13} />
            <span>starqERP Global Index</span>
          </span>
        </div>
      </div>
    </div>
  );
};
