import React, { useState } from 'react';
import {
  FileCheck2,
  Search,
  Filter,
  Download,
  Calendar,
  User,
  Shield,
  Clock,
  ArrowUpDown,
  FileText,
  MapPin,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Eye,
  X
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { AuditLogEntry, PermissionModule } from '../../types/erp';
import { Badge } from '../common/Badge';
import { Surface, Button } from '../ui';

export const AuditLogView: React.FC = () => {
  const { auditLogs, currentTenant } = useERP();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      searchTerm === '' ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesModule = selectedModule === 'all' || log.module === selectedModule;
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;

    return matchesSearch && matchesModule && matchesAction;
  });

  const getActionBadge = (action: AuditLogEntry['action']) => {
    switch (action) {
      case 'USER_AUTHORIZED':
        return <Badge variant="positive" size="sm">User Authorized</Badge>;
      case 'USER_INVITED':
        return <Badge variant="info" size="sm">User Invited</Badge>;
      case 'USER_SUSPENDED':
        return <Badge variant="destructive" size="sm">Suspended</Badge>;
      case 'ROLE_UPDATED':
        return <Badge variant="info" size="sm">Role Modified</Badge>;
      case 'STAGE_TRANSITIONED':
        return <Badge variant="info" size="sm">Stage Changed</Badge>;
      case 'INVOICE_ISSUED':
        return <Badge variant="info" size="sm">Invoice Issued</Badge>;
      case 'PAYMENT_RECORDED':
        return <Badge variant="positive" size="sm">Payment Logged</Badge>;
      case 'STOCK_ADJUSTED':
        return <Badge variant="warning" size="sm">Stock Movement</Badge>;
      case 'ORG_CONFIG_SAVED':
        return <Badge variant="info" size="sm">Tenant Config</Badge>;
      case 'WORKFLOW_MODIFIED':
        return <Badge variant="info" size="sm">Workflow Edit</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{action}</Badge>;
    }
  };

  const handleExportCSV = () => {
    const headers = 'ID,Timestamp,User,Email,Role,Action,Module,Entity,Summary,IP Address\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.userName}","${l.userEmail}","${l.userRole}","${l.action}","${l.module}","${l.entityName}","${l.summary.replace(/"/g, '""')}","${l.ipAddress || ''}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `StarqERP_AuditLogs_${currentTenant.slug}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12 w-full min-w-0">
      {/* Top Header Card */}
      <Surface variant="filled" level={1} padding="md" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-primary)] flex items-center justify-center shrink-0 border border-[var(--md-sys-color-primary)]">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">
                  Activity & Audit Trail
                </h1>
                <Badge variant="neutral" size="sm">
                  Owner's Evidence
                </Badge>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                Immutable, real-time audit ledger of all organizational actions, user authorizations, stage transitions, and financial events.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
          <Button
            variant="tonal"
            size="sm"
            onClick={handleExportCSV}
            icon={<Download size={14} />}
          >
            <span>Export CSV Audit Ledger</span>
          </Button>
        </div>
      </Surface>

      {/* Filter and Search Toolbar */}
      <Surface variant="filled" level={1} padding="sm" className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--md-sys-color-outline)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by staff member, invoice #, work order, customer or summary..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-semibold text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
            >
              <option value="all">All Modules</option>
              <option value="jobs">Jobs & Stages</option>
              <option value="invoices">Invoices</option>
              <option value="payments">Payments</option>
              <option value="inventory">Inventory</option>
              <option value="purchasing">Purchasing</option>
              <option value="users">User Authorizations</option>
              <option value="roles">Roles & Security</option>
              <option value="workflows">Workflows</option>
              <option value="settings">Organization Config</option>
            </select>

            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-semibold text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)] cursor-pointer"
            >
              <option value="all">All Actions</option>
              <option value="USER_AUTHORIZED">User Authorized</option>
              <option value="STAGE_TRANSITIONED">Stage Transitioned</option>
              <option value="INVOICE_ISSUED">Invoice Issued</option>
              <option value="PAYMENT_RECORDED">Payment Recorded</option>
              <option value="STOCK_ADJUSTED">Stock Movement</option>
              <option value="ROLE_UPDATED">Role Updated</option>
              <option value="ORG_CONFIG_SAVED">Org Config Saved</option>
            </select>
          </div>
        </div>
      </Surface>

      {/* Audit Log Table */}
      <Surface variant="filled" level={1} padding="none" className="overflow-hidden">
        <div className="erp-scroll-region w-full overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] uppercase text-[10px] font-bold tracking-wider whitespace-nowrap">
                <th className="py-3 px-4">Timestamp & Location</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-3">Event Type</th>
                <th className="py-3 px-3">Target Entity</th>
                <th className="py-3 px-4">Audit Narrative & Summary</th>
                <th className="py-3 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-sys-color-outline-variant)]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--md-sys-color-on-surface-variant)]">
                    No activity audit logs matching your current filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-[var(--md-sys-color-surface-container-high)] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono text-[var(--md-sys-color-primary)] font-semibold text-[11px]">
                        {log.timestamp}
                      </div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{log.location || `${currentTenant.island} Office`}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5">
                        <span>{log.userName}</span>
                      </div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        {log.userRole}
                      </div>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-[var(--md-sys-color-on-surface)]">
                        {log.entityName}
                      </div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] font-mono">
                        {log.entityType}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-[var(--md-sys-color-on-surface-variant)] font-medium max-w-md line-clamp-2">
                        {log.summary}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Log Detail Drawer Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-outline-variant)]">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[var(--md-sys-color-primary)]" />
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  Audit Log Evidence # {selectedLog.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]">
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block">Timestamp</span>
                  <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">{selectedLog.timestamp}</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]">
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block">IP Address</span>
                  <span className="font-mono font-bold text-[var(--md-sys-color-on-surface)]">{selectedLog.ipAddress || '192.168.1.1 (Internal)'}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Actor</span>
                  <span className="font-bold text-[var(--md-sys-color-on-surface)]">{selectedLog.userName} ({selectedLog.userRole})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Email</span>
                  <span className="font-mono text-[var(--md-sys-color-on-surface)]">{selectedLog.userEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Action Type</span>
                  <span className="font-mono text-[var(--md-sys-color-primary)] font-bold">{selectedLog.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Target Entity</span>
                  <span className="font-bold text-[var(--md-sys-color-on-surface)]">{selectedLog.entityName} ({selectedLog.entityType})</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] space-y-1">
                <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block font-bold uppercase">Audit Summary</span>
                <p className="text-[var(--md-sys-color-on-surface)] leading-relaxed">{selectedLog.summary}</p>
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="p-3 rounded-xl bg-[var(--md-sys-color-surface-container-lowest)] border border-[var(--md-sys-color-outline-variant)] space-y-1 font-mono text-[11px]">
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block font-sans font-bold uppercase">Metadata Payload</span>
                  <pre className="text-[var(--md-sys-color-primary)] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="filled"
                size="sm"
                onClick={() => setSelectedLog(null)}
              >
                <span>Close Evidence</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
