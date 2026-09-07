import React, { useState } from 'react';
import {
  Package,
  Search,
  Plus,
  Filter,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingDown,
  DollarSign,
  Truck,
  RotateCcw
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { NewItemModal } from './NewItemModal';
import { InventoryItem } from '../../types/erp';
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

export const InventoryView: React.FC = () => {
  const {
    inventory,
    lowStockItemsCount,
    formatMVR,
    setActiveTab,
    setIsCreatePOOpen
  } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'All' | 'Low' | 'Healthy'>('All');
  const [selectedItemForAdjust, setSelectedItemForAdjust] = useState<InventoryItem | null>(null);
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);

  const totalInventoryValue = inventory.reduce(
    (sum, item) => sum + item.quantityOnHand * item.unitCost,
    0
  );

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.locationInShop.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const isLow = item.quantityOnHand <= item.reorderLevel;
    const matchesStock =
      stockStatusFilter === 'All' ||
      (stockStatusFilter === 'Low' && isLow) ||
      (stockStatusFilter === 'Healthy' && !isLow);

    return matchesSearch && matchesCategory && matchesStock;
  });

  const columns: ColumnDef<InventoryItem>[] = [
    {
      key: 'name',
      header: 'SKU & Description',
      width: '26%',
      render: (item) => (
        <div className="min-w-0">
          <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
            {item.name}
          </div>
          <div
            className="text-[11px] mono-num truncate font-semibold mt-0.5"
            style={{ color: 'var(--md-sys-color-primary)' }}
            title={item.sku}
          >
            {item.sku}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category & Location',
      width: '18%',
      hideOn: 'compact',
      render: (item) => (
        <div className="min-w-0">
          <div className="font-medium text-xs text-[var(--md-sys-color-on-surface)] truncate">{item.category}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">{item.locationInShop}</div>
        </div>
      ),
    },
    {
      key: 'quantityOnHand',
      header: 'In Stock',
      align: 'right',
      isNumeric: true,
      width: '14%',
      render: (item) => {
        const isLow = item.quantityOnHand <= item.reorderLevel;
        return (
          <div className="flex items-center justify-end gap-1.5 min-w-0">
            {isLow && <AlertTriangle size={13} style={{ color: 'var(--md-sys-color-error)' }} />}
            <span
              className="tabular-nums font-semibold text-xs"
              style={{ color: isLow ? 'var(--md-sys-color-error)' : 'inherit' }}
            >
              {item.quantityOnHand} {item.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: 'reorderLevel',
      header: 'Min',
      align: 'right',
      isNumeric: true,
      width: '10%',
      hideOn: 'medium',
      render: (item) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
          {item.reorderLevel} {item.unit}
        </span>
      ),
    },
    {
      key: 'unitCost',
      header: 'Unit Cost',
      align: 'right',
      isNumeric: true,
      width: '12%',
      hideOn: 'compact',
      render: (item) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface)] tabular-nums">
          {formatMVR(item.unitCost)}
        </span>
      ),
    },
    {
      key: 'totalValuation',
      header: 'Total Value',
      align: 'right',
      isNumeric: true,
      width: '14%',
      render: (item) => (
        <span className="font-semibold text-xs tabular-nums text-[var(--md-sys-color-on-surface)]">
          {formatMVR(item.quantityOnHand * item.unitCost)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '14%',
      render: (item) => {
        const isLow = item.quantityOnHand <= item.reorderLevel;
        return (
          <ActionGroup align="right">
            <Button
              variant="tonal"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItemForAdjust(item);
              }}
            >
              Adjust
            </Button>
            {isLow && (
              <Button
                variant="filled"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreatePOOpen(true);
                }}
              >
                Reorder
              </Button>
            )}
          </ActionGroup>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              Materials & Paint Inventory
            </h1>
            <Badge variant="neutral" size="sm">
              {inventory.length} Active SKUs
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            Automotive basecoats, 2K clearcoats, vinyl wrap rolls, and detailing supplies
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0">
          <Button
            variant="tonal"
            size="sm"
            onClick={() => setIsCreatePOOpen(true)}
            icon={<Truck size={15} />}
          >
            <span>New PO</span>
          </Button>
          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsNewItemOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>Add Item</span>
          </Button>
        </ActionGroup>
      </div>

      {/* KPI Cards */}
      <ResponsiveGrid columns="auto" minItemWidth="200px" gap="sm">
        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            Total Stock Valuation
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {formatMVR(totalInventoryValue, false)}
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate">
            Asset value across all bays
          </span>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium truncate" style={{ color: 'var(--md-sys-color-error)' }}>
            Low Stock Warnings
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums truncate" style={{ color: 'var(--md-sys-color-error)' }}>
            {lowStockItemsCount} SKUs below threshold
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate">
            Requires supplier replenishment
          </span>
        </Surface>

        <Surface variant="filled" level={1} padding="sm" container className="space-y-1 min-w-0">
          <span className="block text-xs font-medium truncate text-[var(--md-sys-color-on-surface-variant)]">
            Stock Availability Rate
          </span>
          <div className="text-base sm:text-lg font-bold tabular-nums truncate text-[var(--md-sys-color-on-surface)]">
            {inventory.length > 0
              ? `${Math.round(((inventory.length - lowStockItemsCount) / inventory.length) * 100)}% Available`
              : '0 Active SKUs'}
          </div>
          <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] block truncate">
            {inventory.length > 0 ? `${inventory.length - lowStockItemsCount} of ${inventory.length} SKUs in optimal stock` : 'Catalog empty — click Add Item'}
          </span>
        </Surface>
      </ResponsiveGrid>

      {/* Filter & Search Bar */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        <div className="relative flex-1 w-full md:max-w-md min-w-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SKU name, code, supplier, bay location…"
            icon={<Search size={14} />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer max-w-[150px] truncate"
            >
              <option value="All">All Categories</option>
              <option value="Paints & Primers">Paints & Primers</option>
              <option value="Clearcoats & Hardeners">Clearcoats & Hardeners</option>
              <option value="Vinyl & PPF Film">Vinyl & PPF Film</option>
              <option value="Detailing & Ceramics">Detailing & Ceramics</option>
              <option value="Abrasives & Sandpaper">Abrasives & Sandpaper</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Status:</span>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value as any)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer"
            >
              <option value="All">All Items</option>
              <option value="Low">Low Stock</option>
              <option value="Healthy">Healthy</option>
            </select>
          </div>
        </div>
      </Surface>

      {/* Canonical DataTable */}
      <DataTable
        data={filteredInventory}
        columns={columns}
        keyExtractor={(item) => item.id}
        emptyMessage="No inventory items matching filter criteria."
      />

      <StockAdjustmentModal
        item={selectedItemForAdjust}
        onClose={() => setSelectedItemForAdjust(null)}
      />
      <NewItemModal
        isOpen={isNewItemOpen}
        onClose={() => setIsNewItemOpen(false)}
      />
    </div>
  );
};
