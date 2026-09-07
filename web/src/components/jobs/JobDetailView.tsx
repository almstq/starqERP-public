import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Wrench,
  Car,
  FileText,
  Plus,
  ArrowRight,
  TrendingUp,
  Package,
  Layers,
  ChevronRight,
  Phone,
  Printer,
  CheckCircle2,
  User,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { JobStatus } from '../../types/erp';
import { WorkflowStepRail } from './WorkflowStepRail';
import {
  Button,
  Input,
  Select,
  Surface,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  ActionGroup,
  type BadgeVariant,
} from '../ui';

export const JobDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    jobs,
    formatMVR,
    updateJobStatus,
    addMaterialToJob,
    inventory,
    workflowStages,
    customers,
    generateJobInvoice,
    currentArchetype,
    currentTerms,
  } = useERP();

  const isAutomotive = currentArchetype?.terminology?.showVehicleFields ?? false;

  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState(inventory[0]?.id || '');
  const [materialQty, setMaterialQty] = useState(1);

  const job = jobs.find((j) => j.id === id || j.jobId.toLowerCase() === id?.toLowerCase());

  if (!job) {
    return (
      <div className="space-y-6 w-full min-w-0">
        <Button variant="text" size="sm" onClick={() => navigate('/jobs')} icon={<ArrowLeft size={16} />}>
          <span>Back to Jobs</span>
        </Button>
        <Surface variant="elevated" padding="lg" className="text-center py-16">
          <Wrench size={40} className="mx-auto mb-3" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />
          <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface)]">Work Order Not Found</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1.5">
            No job record matching ID "{id}" was found.
          </p>
          <Button variant="filled" size="md" onClick={() => navigate('/jobs')} className="mt-6">
            View All Jobs
          </Button>
        </Surface>
      </div>
    );
  }

  const customer = customers.find((c) => c.id === job.customerId);
  const currentStageIndex = workflowStages.findIndex(
    (s) => s.name.toLowerCase() === job.status.toLowerCase()
  );
  const nextStage = workflowStages[currentStageIndex + 1];

  const handleAddMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventoryId || materialQty <= 0) return;
    addMaterialToJob(job.id, selectedInventoryId, Number(materialQty));
    setIsAddMaterialOpen(false);
    setMaterialQty(1);
  };

  const handleCreateInvoice = () => {
    generateJobInvoice(job.id);
    navigate('/invoices');
  };

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    const lower = status.toLowerCase();
    if (lower.includes('ready') || lower.includes('complete') || lower.includes('invoiced')) return 'positive';
    if (lower.includes('progress') || lower.includes('diag') || lower.includes('parts')) return 'warning';
    if (lower.includes('void') || lower.includes('cancel')) return 'destructive';
    return 'info';
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* Top Header & Navigation Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Button
            variant="tonal"
            size="xs"
            onClick={() => navigate('/jobs')}
            aria-label="Back to Jobs"
            className="h-8 w-8 sm:h-9 sm:w-9 p-0 shrink-0"
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold mono-num tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
                {job.jobId}
              </h1>
              <Badge variant={job.priority === 'Urgent' ? 'destructive' : 'neutral'} size="sm">
                {job.priority}
              </Badge>
              <Badge variant={getStatusBadgeVariant(job.status)} size="sm">
                {job.status}
              </Badge>
            </div>
            <p className="text-xs mt-0.5 text-[var(--md-sys-color-on-surface-variant)] truncate">
              {job.serviceType} • {currentTerms.facility}: {job.location || job.bayNumber || currentTerms.facility}
            </p>
          </div>
        </div>

        <ActionGroup align="right" className="shrink-0">
          {nextStage && (
            <Button
              variant="filled"
              size="sm"
              onClick={() => updateJobStatus(job.id, nextStage.name as JobStatus)}
              icon={<ArrowRight size={14} />}
            >
              <span>Move to {nextStage.name}</span>
            </Button>
          )}
          {!job.linkedInvoiceId && (
            <Button
              variant="tonal"
              size="sm"
              onClick={handleCreateInvoice}
              icon={<FileText size={14} />}
            >
              <span>Invoice</span>
            </Button>
          )}
          <Button
            variant="text"
            size="sm"
            onClick={() => window.print()}
            aria-label="Print Job Sheet"
            className="h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <Printer size={16} />
          </Button>
        </ActionGroup>
      </div>

      {/* Main Grid: Job Details Left, Profitability & Payments Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start w-full min-w-0">
        {/* Left Column (7 cols): Job Details, Asset, Materials */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-5 min-w-0">
          {/* Customer & Vehicle Info */}
          <Surface variant="filled" level={1} padding="md" className="space-y-4">
            <div
              className="flex items-center justify-between pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Car size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                  Customer & Vehicle Details
                </h2>
              </div>
              {customer && (
                <Link
                  to={`/customers/${customer.id}`}
                  className="text-xs font-semibold flex items-center gap-0.5 hover:underline shrink-0"
                  style={{ color: 'var(--md-sys-color-primary)' }}
                >
                  <span>Profile</span>
                  <ChevronRight size={12} />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 text-xs min-w-0">
              <div className="space-y-1 min-w-0">
                <span className="block text-[11px] font-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                  Customer Name
                </span>
                <span className="font-semibold text-sm block text-[var(--md-sys-color-on-surface)] truncate">{job.customerName}</span>
                <span className="flex items-center gap-1 mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
                  <Phone size={12} className="shrink-0" />
                  <span>{job.customerPhone}</span>
                </span>
              </div>

              {isAutomotive ? (
                job.vehicle && (
                  <div className="space-y-1 min-w-0">
                    <span className="block text-[11px] font-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      Vehicle / Vessel Asset
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="mono-num font-bold text-sm truncate" style={{ color: 'var(--md-sys-color-primary)' }}>
                        {job.vehicle.plateNumber}
                      </span>
                      <span className="font-medium text-[var(--md-sys-color-on-surface)] truncate">
                        {job.vehicle.make} {job.vehicle.model}
                      </span>
                    </div>
                    <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                      Color: {job.vehicle.color} {job.vehicle.year ? `• ${job.vehicle.year}` : ''}
                    </span>
                  </div>
                )
              ) : (
                <div className="space-y-1 min-w-0">
                  <span className="block text-[11px] font-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                    {currentTerms.primaryAsset} / Reference
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="mono-num font-bold text-sm truncate" style={{ color: 'var(--md-sys-color-primary)' }}>
                      {job.projectRef || job.serviceType || 'Standard Engagement'}
                    </span>
                  </div>
                  <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                    {currentTerms.facility}: {job.location || job.bayNumber || currentTerms.facility}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 min-w-0" style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
              <span className="block text-[11px] font-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                {isAutomotive ? 'Requested Scope of Work' : 'Scope of Work & Deliverables'}
              </span>
              <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface)]">{job.requestedWork}</p>
              {job.specialInstructions && (
                <div
                  className="mt-2.5 p-3 rounded-[var(--md-sys-shape-corner-small)] text-xs min-w-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span className="font-semibold block text-[11px] text-[var(--md-sys-color-on-surface)]">
                    Special Instructions:
                  </span>
                  <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{job.specialInstructions}</span>
                </div>
              )}
            </div>
          </Surface>

          {/* 13-Step Workflow Journey Rail with Seat Signpost */}
          <div className="w-full min-w-0 overflow-x-auto">
            <WorkflowStepRail
              currentStatus={job.status}
              onAdvance={(next) => updateJobStatus(job.id, next as JobStatus)}
            />
          </div>

          {/* Pipeline Stage Progression Grid */}
          <Surface variant="filled" level={1} padding="md" className="space-y-4">
            <div
              className="flex items-center justify-between pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Layers size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                  Pipeline Stage Progression
                </h2>
              </div>
              <span className="text-xs shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                {currentStageIndex + 1} of {workflowStages.length}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
              {workflowStages.map((stage, idx) => {
                const isCurrent = stage.name.toLowerCase() === job.status.toLowerCase();
                const isPast = currentStageIndex > idx;
                return (
                  <button
                    key={stage.id}
                    onClick={() => updateJobStatus(job.id, stage.name as JobStatus)}
                    className="p-2.5 rounded-[var(--md-sys-shape-corner-small)] text-left transition-all cursor-pointer min-w-0"
                    style={{
                      backgroundColor: isCurrent
                        ? 'var(--md-sys-color-secondary-container)'
                        : 'var(--md-sys-color-surface-container-low)',
                      border: isCurrent
                        ? '1px solid var(--md-sys-color-primary)'
                        : '1px solid var(--md-sys-color-outline-variant)',
                      color: isCurrent
                        ? 'var(--md-sys-color-on-secondary-container)'
                        : 'var(--md-sys-color-on-surface)',
                    }}
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <span className="mono-num text-[10px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {stage.code}
                      </span>
                      {isPast && <CheckCircle2 size={12} style={{ color: 'var(--positive)' }} />}
                      {isCurrent && (
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                        />
                      )}
                    </div>
                    <div className="font-semibold text-xs mt-1 truncate">
                      {stage.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </Surface>

          {/* Materials Used in Job */}
          <Surface variant="filled" level={1} padding="md" className="space-y-4">
            <div
              className="flex items-center justify-between pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <Package size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                  Materials Used
                </h2>
              </div>
              <Button
                variant="tonal"
                size="xs"
                onClick={() => setIsAddMaterialOpen(!isAddMaterialOpen)}
                icon={<Plus size={12} />}
              >
                <span>Add Item</span>
              </Button>
            </div>

            {isAddMaterialOpen && (
              <form
                onSubmit={handleAddMaterial}
                className="p-3.5 rounded-[var(--md-sys-shape-corner-small)] space-y-3 min-w-0"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                  Log Material Usage
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs min-w-0">
                  <div className="sm:col-span-2 min-w-0">
                    <Select
                      label="Item"
                      value={selectedInventoryId}
                      onChange={(e) => setSelectedInventoryId(e.target.value)}
                    >
                      {inventory.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name} ({inv.quantityOnHand} in stock)
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Input
                      label="Qty"
                      type="number"
                      min="1"
                      value={materialQty}
                      onChange={(e) => setMaterialQty(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="text" size="xs" onClick={() => setIsAddMaterialOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="filled" size="xs" type="submit">
                    Confirm
                  </Button>
                </div>
              </form>
            )}

            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Item</TableHead>
                  <TableHead alignRight>Qty</TableHead>
                  <TableHead alignRight className="hidden sm:table-cell">Unit Cost</TableHead>
                  <TableHead alignRight>Total</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {job.materialsUsed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                      No materials logged yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  job.materialsUsed.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-semibold text-[var(--md-sys-color-on-surface)]">{m.itemName}</TableCell>
                      <TableCell isNumeric>
                        {m.quantity} {m.unit}
                      </TableCell>
                      <TableCell isNumeric className="hidden sm:table-cell">{formatMVR(m.unitCost)}</TableCell>
                      <TableCell isNumeric className="font-bold text-[var(--md-sys-color-on-surface)]">
                        {formatMVR(m.totalCost)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>
        </div>

        {/* Right Column (5 cols): Financials, Staff & Commercial Invoices */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-5 min-w-0">
          {/* Job Profitability & Financials */}
          <Surface variant="filled" level={1} padding="md" className="space-y-4 min-w-0">
            <div
              className="flex items-center gap-2 pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <TrendingUp size={17} style={{ color: 'var(--positive)' }} className="shrink-0" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                Job Financials & Margin
              </h2>
            </div>

            <div className="space-y-2.5 text-xs min-w-0">
              <div className="flex items-center justify-between min-w-0">
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Quoted Price:</span>
                <span className="mono-num font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                  {formatMVR(job.quotedAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between min-w-0">
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Deposit Paid:</span>
                <span className="mono-num font-semibold" style={{ color: 'var(--positive)' }}>
                  {formatMVR(job.depositPaid)}
                </span>
              </div>
              <div className="flex items-center justify-between min-w-0">
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Balance Due:</span>
                <span
                  className="mono-num font-bold"
                  style={{ color: job.balanceDue > 0 ? 'var(--warning)' : 'var(--positive)' }}
                >
                  {formatMVR(job.balanceDue)}
                </span>
              </div>

              <div className="my-2" style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }} />

              <div className="p-3.5 rounded-[var(--md-sys-shape-corner-small)] flex items-center justify-between min-w-0"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="min-w-0">
                  <span className="block text-[10px] uppercase font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                    Est. Profit
                  </span>
                  <span className="mono-num font-bold text-sm sm:text-base" style={{ color: 'var(--positive)' }}>
                    {formatMVR(job.actualProfit)}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[10px] uppercase font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                    Target Margin
                  </span>
                  <span className="mono-num font-bold text-xs sm:text-sm" style={{ color: 'var(--positive)' }}>
                    {job.targetMarginPercentage}%
                  </span>
                </div>
              </div>
            </div>
          </Surface>

          {/* Assigned Staff */}
          <Surface variant="filled" level={1} padding="md" className="space-y-3 min-w-0">
            <div
              className="flex items-center gap-2 pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <User size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                Assigned Staff
              </h2>
            </div>
            <div className="space-y-2 min-w-0">
              {job.assignedStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between text-xs p-2.5 rounded-[var(--md-sys-shape-corner-small)] min-w-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)] truncate">{staff.name}</span>
                  <Badge variant="neutral" size="sm">
                    {staff.role}
                  </Badge>
                </div>
              ))}
            </div>
          </Surface>

          {/* Commercial Document */}
          <Surface variant="filled" level={1} padding="md" className="space-y-3 min-w-0">
            <div
              className="flex items-center justify-between pb-3 min-w-0"
              style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-2 min-w-0 truncate">
                <FileText size={17} style={{ color: 'var(--md-sys-color-primary)' }} className="shrink-0" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface)] truncate">
                  Commercial Document
                </h2>
              </div>
            </div>

            {job.linkedInvoiceId ? (
              <div className="space-y-2 text-xs min-w-0">
                <div className="flex items-center justify-between min-w-0">
                  <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Invoice:</span>
                  <Link
                    to={`/invoices/${job.linkedInvoiceId}`}
                    className="mono-num font-bold hover:underline"
                    style={{ color: 'var(--md-sys-color-primary)' }}
                  >
                    {job.linkedInvoiceId} →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-2.5 min-w-0">
                <p style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>No invoice generated yet.</p>
                <Button
                  variant="filled"
                  size="sm"
                  onClick={handleCreateInvoice}
                  icon={<FileText size={14} />}
                  className="w-full"
                >
                  <span>Generate Invoice</span>
                </Button>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
};
