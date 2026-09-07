import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench,
  Search,
  Plus,
  LayoutGrid,
  List,
  ChevronRight,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { JobOrder } from '../../types/erp';
import { CreateJobModal } from './CreateJobModal';
import {
  Button,
  Input,
  Select,
  Surface,
  DataTable,
  ColumnDef,
  Badge,
  ActionGroup,
  SegmentedButton,
  type BadgeVariant,
} from '../ui';

export const JobsView: React.FC = () => {
  const navigate = useNavigate();
  const {
    jobs,
    setIsCreateJobOpen,
    formatMVR,
    activeJobsCount,
    workflowStages,
    currentTerms,
  } = useERP();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedMobileStageId, setSelectedMobileStageId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.jobId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.vehicle?.plateNumber && j.vehicle.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (j.vehicle?.model && j.vehicle.model.toLowerCase().includes(searchQuery.toLowerCase())) ||
      j.serviceType.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesService = serviceFilter === 'All' || j.serviceType === serviceFilter;
    const matchesStatus = statusFilter === 'All' || j.status === statusFilter;

    return matchesSearch && matchesService && matchesStatus;
  });

  const services = ['All', ...new Set(jobs.map((j) => j.serviceType))];

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
    const lower = status.toLowerCase();
    if (lower.includes('draft')) return 'info';
    if (lower.includes('ready') || lower.includes('complete') || lower.includes('invoiced')) return 'positive';
    if (lower.includes('progress') || lower.includes('diag') || lower.includes('parts')) return 'warning';
    if (lower.includes('void') || lower.includes('cancel')) return 'destructive';
    return 'neutral';
  };

  const jobColumns: ColumnDef<JobOrder>[] = [
    {
      key: 'jobId',
      header: `${currentTerms.order} ID`,
      width: '14%',
      render: (job) => (
        <span
          className="mono-num text-xs font-semibold"
          style={{ color: 'var(--md-sys-color-primary)' }}
          title={job.jobId}
        >
          {job.jobId}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: `${currentTerms.customer} & ${currentTerms.primaryAsset}`,
      width: '28%',
      render: (job) => (
        <div className="min-w-0">
          <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
            {job.customerName}
          </div>
          <div className="text-[11px] mono-num truncate text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            {job.vehicle?.plateNumber ? `${job.vehicle.plateNumber} (${job.vehicle.model})` : (job.projectRef || job.serviceType || 'Standard Scope')}
          </div>
        </div>
      ),
    },
    {
      key: 'serviceType',
      header: 'Scope / Service',
      width: '16%',
      hideOn: 'compact',
      render: (job) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
          {job.serviceType}
        </span>
      ),
    },
    {
      key: 'bayNumber',
      header: currentTerms.facility,
      width: '12%',
      hideOn: 'medium',
      render: (job) => (
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {job.bayNumber || job.location || currentTerms.facility}
        </span>
      ),
    },
    {
      key: 'quotedAmount',
      header: 'Amount',
      align: 'right',
      isNumeric: true,
      width: '14%',
      render: (job) => (
        <span className="font-semibold text-xs tabular-nums text-[var(--md-sys-color-on-surface)]">
          {formatMVR(job.quotedAmount)}
        </span>
      ),
    },
    {
      key: 'targetMarginPercentage',
      header: 'Margin',
      align: 'right',
      isNumeric: true,
      width: '10%',
      hideOn: 'compact',
      render: (job) => (
        <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--positive)' }}>
          {job.targetMarginPercentage}%
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '12%',
      render: (job) => (
        <Badge variant={getStatusBadgeVariant(job.status)} size="sm">
          {job.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      width: '8%',
      render: () => (
        <span className="text-xs font-semibold hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>
          Inspect →
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 w-full min-w-0">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--md-sys-color-on-surface)] truncate">
              {currentTerms.orders} & Delivery Pipeline
            </h1>
            <Badge variant="accent" size="sm">
              {activeJobsCount} Active
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            Dynamic pipeline ({workflowStages.length} stages), {currentTerms.facility.toLowerCase()} allocation & deliverable tracking
          </p>
        </div>

        <ActionGroup align="right" className="shrink-0">
          {/* View Toggle */}
          <SegmentedButton<'kanban' | 'list'>
            value={viewMode}
            onChange={(v) => setViewMode(v)}
            size="sm"
            options={[
              { value: 'kanban', label: 'Kanban', icon: <LayoutGrid size={13} /> },
              { value: 'list', label: 'Table', icon: <List size={13} /> },
            ]}
          />

          <Button
            variant="filled"
            size="sm"
            onClick={() => setIsCreateJobOpen(true)}
            icon={<Plus size={15} />}
          >
            <span>New {currentTerms.order}</span>
          </Button>
        </ActionGroup>
      </div>

      {/* Filter Surface */}
      <Surface variant="filled" level={1} padding="sm" className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        <div className="flex-1 w-full md:max-w-md min-w-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search by ${currentTerms.order.toLowerCase()} ID, ${currentTerms.customer.toLowerCase()}, ${currentTerms.primaryAsset.toLowerCase()}…`}
            icon={<Search size={14} />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
              Service:
            </span>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer max-w-[140px] truncate"
            >
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium shrink-0" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
              Stage:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface)',
                borderColor: 'var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-small)',
              }}
              className="h-8 sm:h-9 px-2.5 text-xs border outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="All">All Stages</option>
              {workflowStages.map((stg) => (
                <option key={stg.id} value={stg.name}>{stg.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Surface>

      {/* Kanban View Mode */}
      {viewMode === 'kanban' && (
        <div className="space-y-4">
          {/* Mobile Stage Selector Strip (Shown on screens < md) */}
          <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 erp-scroll-region">
            {workflowStages.map((stage) => {
              const stageJobs = filteredJobs.filter(
                (j) =>
                  j.status.toLowerCase() === stage.name.toLowerCase() ||
                  j.status.toLowerCase() === stage.code.toLowerCase()
              );
              const isActive = (selectedMobileStageId || workflowStages[0]?.id) === stage.id;

              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedMobileStageId(stage.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-[var(--md-sys-shape-corner-medium)] text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] border border-[var(--md-sys-color-primary)] shadow-sm'
                      : 'bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                  }`}
                >
                  <span>{stage.name}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                        : 'bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]'
                    }`}
                  >
                    {stageJobs.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Mobile Single Column Vertical Stream (< md) */}
          <div className="flex md:hidden flex-col gap-3">
            {(() => {
              const currentStage = workflowStages.find((s) => s.id === (selectedMobileStageId || workflowStages[0]?.id)) || workflowStages[0];
              if (!currentStage) return null;
              const stageJobs = filteredJobs.filter(
                (j) =>
                  j.status.toLowerCase() === currentStage.name.toLowerCase() ||
                  j.status.toLowerCase() === currentStage.code.toLowerCase()
              );

              return (
                <div
                  className="flex flex-col p-4 rounded-[var(--md-sys-shape-corner-large)]"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-low)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div
                    className="flex items-center justify-between pb-3 mb-3"
                    style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="mono-num text-xs font-bold px-2 py-0.5 rounded-[var(--md-sys-shape-corner-extra-small)]"
                        style={{
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        {currentStage.code}
                      </span>
                      <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                        {currentStage.name}
                      </span>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {stageJobs.length} {stageJobs.length === 1 ? 'Job' : 'Jobs'}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {stageJobs.length === 0 ? (
                      <div
                        className="py-10 text-center text-xs rounded-[var(--md-sys-shape-corner-medium)]"
                        style={{
                          border: '1px dashed var(--md-sys-color-outline-variant)',
                          color: 'var(--md-sys-color-on-surface-variant)',
                        }}
                      >
                        <Wrench className="w-6 h-6 mx-auto mb-2 opacity-40 text-[var(--md-sys-color-outline)]" />
                        <p className="font-medium">No work orders in {currentStage.name}</p>
                      </div>
                    ) : (
                      stageJobs.map((job) => (
                        <div
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          style={{
                            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
                            border: '1px solid var(--md-sys-color-outline-variant)',
                            borderRadius: 'var(--md-sys-shape-corner-medium)',
                          }}
                          className="p-3.5 space-y-2.5 cursor-pointer transition-all hover:border-[var(--md-sys-color-primary)] active:scale-[0.99] shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="mono-num font-bold text-xs" style={{ color: 'var(--md-sys-color-primary)' }}>
                              {job.jobId}
                            </span>
                            <Badge
                              variant={job.priority === 'Urgent' ? 'destructive' : 'neutral'}
                              size="sm"
                            >
                              {job.priority}
                            </Badge>
                          </div>

                          <div>
                            <div className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                              {job.customerName}
                            </div>
                            <div className="text-xs mono-num text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                              {job.vehicle?.plateNumber ? `${job.vehicle.plateNumber} • ${job.vehicle.model}` : (job.projectRef || job.serviceType || 'Standard Scope')}
                            </div>
                          </div>

                          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-between pt-1">
                            <span>{job.serviceType}</span>
                            <span className="text-[11px] font-medium">{job.bayNumber || job.location || currentTerms.facility}</span>
                          </div>

                          <div
                            className="pt-2.5 flex items-center justify-between text-xs"
                            style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                          >
                            <span className="mono-num font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                              {formatMVR(job.quotedAmount)}
                            </span>
                            <span
                              className="text-xs font-semibold flex items-center gap-1 hover:underline"
                              style={{ color: 'var(--md-sys-color-primary)' }}
                            >
                              <span>Open Details</span>
                              <ChevronRight size={14} />
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Desktop Dominant Multi-Column Landscape Board (Shown on screens >= md) */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {workflowStages.map((stage) => {
              const stageJobs = filteredJobs.filter(
                (j) =>
                  j.status.toLowerCase() === stage.name.toLowerCase() ||
                  j.status.toLowerCase() === stage.code.toLowerCase()
              );

              return (
                <div
                  key={stage.id}
                  className="w-full flex flex-col max-h-[80vh] p-3.5 rounded-[var(--md-sys-shape-corner-large)] min-w-0"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-low)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  {/* Stage Column Header */}
                  <div
                    className="flex items-center justify-between pb-2.5 mb-2.5 min-w-0"
                    style={{ borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                      <span
                        className="mono-num text-[11px] font-bold px-1.5 py-0.5 rounded-[var(--md-sys-shape-corner-extra-small)] shrink-0"
                        style={{
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        {stage.code}
                      </span>
                      <span className="text-xs font-semibold truncate text-[var(--md-sys-color-on-surface)]">
                        {stage.name}
                      </span>
                    </div>
                    <Badge variant="neutral" size="sm">
                      {stageJobs.length}
                    </Badge>
                  </div>

                  {/* Stage Cards Container */}
                  <div className="space-y-2.5 overflow-y-auto flex-1 pr-1 min-w-0">
                    {stageJobs.length === 0 ? (
                      <div
                        className="p-4 text-center text-xs rounded-[var(--md-sys-shape-corner-medium)]"
                        style={{
                          border: '1px dashed var(--md-sys-color-outline-variant)',
                          color: 'var(--md-sys-color-on-surface-variant)',
                        }}
                      >
                        No jobs
                      </div>
                    ) : (
                      stageJobs.map((job) => (
                        <div
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          style={{
                            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
                            border: '1px solid var(--md-sys-color-outline-variant)',
                            borderRadius: 'var(--md-sys-shape-corner-medium)',
                          }}
                          className="p-3 space-y-2 cursor-pointer transition-all hover:border-[var(--md-sys-color-primary)] hover:shadow-xs min-w-0"
                        >
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            <span className="mono-num font-bold text-xs truncate" style={{ color: 'var(--md-sys-color-primary)' }}>
                              {job.jobId}
                            </span>
                            <Badge
                              variant={job.priority === 'Urgent' ? 'destructive' : 'neutral'}
                              size="sm"
                            >
                              {job.priority}
                            </Badge>
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] truncate">
                              {job.customerName}
                            </div>
                            <div className="text-[11px] mono-num truncate" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                              {job.vehicle?.plateNumber ? `${job.vehicle.plateNumber} • ${job.vehicle.model}` : (job.projectRef || job.serviceType || 'Standard Scope')}
                            </div>
                          </div>

                          <div className="text-[11px] truncate" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                            {job.serviceType}
                          </div>

                          <div
                            className="pt-2 flex items-center justify-between text-xs min-w-0"
                            style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}
                          >
                            <span className="mono-num font-bold text-[var(--md-sys-color-on-surface)] truncate">
                              {formatMVR(job.quotedAmount)}
                            </span>
                            <span
                              className="text-[11px] font-semibold flex items-center gap-0.5 hover:underline shrink-0"
                              style={{ color: 'var(--md-sys-color-primary)' }}
                            >
                              <span>Inspect</span>
                              <ChevronRight size={12} />
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table View Mode */}
      {viewMode === 'list' && (
        <DataTable
          data={filteredJobs}
          columns={jobColumns}
          keyExtractor={(j) => j.id}
          onRowClick={(j) => navigate(`/jobs/${j.id}`)}
          emptyMessage="No work orders matching search criteria."
        />
      )}
    </div>
  );
};
