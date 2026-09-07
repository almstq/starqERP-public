import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Surface, Button, Badge, DataTable, ColumnDef } from '../ui';
import { Supplier } from '../../types/erp';

export const SuppliersView: React.FC = () => {
  const navigate = useNavigate();
  const { suppliers, formatMVR } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(suppliers.map((s) => s.category)))];

  const filtered = suppliers.filter((s) => {
    const matchesSearch =
      searchQuery === '' ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.phone.includes(searchQuery) ||
      s.islandOrCountry.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'All' || s.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const columns: ColumnDef<Supplier>[] = [
    {
      key: 'name',
      header: 'Vendor / Supplier',
      render: (s) => (
        <div>
          <div className="font-bold text-[var(--md-sys-color-on-surface)]">{s.name}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.email}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (s) => <Badge variant="neutral" size="sm">{s.category}</Badge>,
    },
    {
      key: 'contactPerson',
      header: 'Contact Person',
      render: (s) => <span className="font-semibold text-xs text-[var(--md-sys-color-on-surface)]">{s.contactPerson}</span>,
    },
    {
      key: 'phone',
      header: 'Phone & Location',
      render: (s) => (
        <div className="text-xs">
          <div className="font-mono text-[var(--md-sys-color-on-surface)]">{s.phone}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.islandOrCountry}</div>
        </div>
      ),
    },
    {
      key: 'leadTimeDays',
      header: 'Lead Time',
      render: (s) => <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{s.leadTimeDays}d lead time</span>,
    },
    {
      key: 'outstandingPayable',
      header: 'Outstanding Balance',
      align: 'right',
      render: (s) => (
        <span
          className={`font-mono font-bold mono-num ${
            s.outstandingPayable > 0
              ? 'text-[var(--md-sys-color-error)]'
              : 'text-[var(--md-sys-color-primary)]'
          }`}
        >
          {s.outstandingPayable > 0 ? formatMVR(s.outstandingPayable) : 'Settled'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
              Approved Suppliers & Vendors
            </h1>
            <Badge variant="info" size="sm">
              {suppliers.length} Registered
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Direct vendors for automotive basecoats, primers, clearcoats, wrap films, and garage consumables
          </p>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <Surface variant="outlined" padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="text-[var(--md-sys-color-on-surface-variant)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by vendor, contact, phone, location..."
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs border outline-none focus:border-[var(--md-sys-color-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-small)',
            }}
            className="h-8 px-2.5 text-xs border outline-none cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </Surface>

      {/* Suppliers Table */}
      <DataTable
        data={filtered}
        columns={columns}
        keyExtractor={(s) => s.id}
        onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
        emptyMessage="No suppliers found matching filter criteria."
      />
    </div>
  );
};
