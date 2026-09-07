import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Building2,
  Layers,
  MapPin,
  Mail,
  Phone,
  FileText,
  AlertCircle,
  HelpCircle,
  Plus
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { OrganisationApplication } from '../../data/demoFixtures';

export const StarqHQApplications: React.FC = () => {
  const {
    pendingApplications,
    approveOrganisationApplication,
    rejectOrganisationApplication,
    setIsRegisterOrgModalOpen
  } = useERP();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<OrganisationApplication | null>(null);
  const [requestInfoModalOpen, setRequestInfoModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const [isProcessing, setIsProcessing] = useState(false);

  const handleApprove = async (app: OrganisationApplication) => {
    setIsProcessing(true);
    try {
      await approveOrganisationApplication(app.id);
      showToast(`Successfully provisioned "${app.name}" as an active client tenant!`);
      setSelectedApp(null);
    } catch {
      showToast(`Provisioning failed for "${app.name}".`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (app: OrganisationApplication) => {
    setIsProcessing(true);
    try {
      await rejectOrganisationApplication(app.id, 'Application declined by Starq HQ Operator');
      showToast(`Application for "${app.name}" was rejected.`);
      setSelectedApp(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendInfoRequest = () => {
    if (!selectedApp || !infoMessage.trim()) return;
    showToast(`Information request sent to ${selectedApp.applicantEmail}.`);
    setRequestInfoModalOpen(false);
    setInfoMessage('');
  };

  const filteredApps = pendingApplications.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.legalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.applicantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.island.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="fixed top-16 right-6 z-50 px-4 py-3 rounded-[var(--md-sys-shape-corner-medium)] shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top-4"
          style={{
            backgroundColor: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
              Business Registration Intake Queue
            </h2>
            <Badge variant="accent" size="sm">
              {pendingApplications.filter((a) => a.status === 'pending_approval').length} Pending
            </Badge>
          </div>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
            Prospective business owners who signed in and applied for starqERP access.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--md-sys-color-on-surface-variant)]" />
            <input
              type="text"
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            />
          </div>
          <button
            onClick={() => setIsRegisterOrgModalOpen(true)}
            className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
            style={{
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
            }}
          >
            <Plus size={14} />
            <span>Test Intake</span>
          </button>
        </div>
      </div>

      {/* Applications List */}
      {filteredApps.length === 0 ? (
        <div
          className="p-10 rounded-[var(--md-sys-shape-corner-medium)] border text-center space-y-2"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <ClipboardList size={32} className="mx-auto text-[var(--md-sys-color-on-surface-variant)] opacity-40" />
          <div className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
            No Applications Found
          </div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-sm mx-auto">
            {searchQuery
              ? 'No applications match your filter query.'
              : 'All incoming customer business applications have been processed.'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApps.map((app) => {
            const isPending = app.status === 'pending_approval';
            return (
              <div
                key={app.id}
                className="p-4 rounded-[var(--md-sys-shape-corner-medium)] border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-[var(--md-sys-color-on-surface)]">
                      {app.name}
                    </span>
                    <Badge
                      variant={
                        isPending ? 'warning' : app.status === 'approved' ? 'accent' : 'destructive'
                      }
                      size="sm"
                    >
                      {app.status === 'pending_approval' ? 'Pending Review' : app.status.toUpperCase()}
                    </Badge>
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/5 font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                      {app.archetypeName}
                    </span>
                  </div>

                  <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>Legal: <strong>{app.legalName}</strong></span>
                    <span>Primary Book: <strong>[{app.primaryBookCode}] {app.primaryBookName}</strong></span>
                    <span>Location: <strong>{app.island}, {app.atoll}</strong></span>
                    <span>Applicant: <strong>{app.applicantName}</strong> ({app.applicantEmail})</span>
                    <span>Submitted: <strong>{app.submittedAt}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedApp(app)}
                    className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)] cursor-pointer"
                  >
                    Review Dossier
                  </button>

                  {isPending && (
                    <button
                      onClick={() => handleApprove(app)}
                      className="px-3.5 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                      style={{
                        backgroundColor: 'var(--md-sys-color-primary)',
                        color: 'var(--md-sys-color-on-primary)',
                      }}
                    >
                      <CheckCircle2 size={13} />
                      <span>Approve & Provision</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Dossier Modal */}
      {selectedApp && (
        <Modal
          isOpen={Boolean(selectedApp)}
          onClose={() => setSelectedApp(null)}
          title={`Application Review: ${selectedApp.name}`}
        >
          <div className="space-y-4 text-xs">
            <div
              className="p-3 rounded-[var(--md-sys-shape-corner-small)] border space-y-2"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="font-bold text-sm text-[var(--md-sys-color-on-surface)] flex items-center justify-between">
                <span>{selectedApp.name}</span>
                <Badge variant={selectedApp.status === 'pending_approval' ? 'warning' : 'accent'} size="sm">
                  {selectedApp.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Legal Entity Name:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.legalName}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Operating Archetype:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.archetypeName}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Primary Book Code & Name:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                    [{selectedApp.primaryBookCode}] {selectedApp.primaryBookName}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Location & Atoll:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                    {selectedApp.island}, {selectedApp.atoll}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="p-3 rounded-[var(--md-sys-shape-corner-small)] border space-y-2"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="font-bold text-xs uppercase text-[var(--md-sys-color-primary)]">
                Applicant Identity & Verification
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Applicant Name:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.applicantName}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Contact Email:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.applicantEmail}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Contact Phone:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.phone}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block">Submitted Timestamp:</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{selectedApp.submittedAt}</span>
                </div>
              </div>
            </div>

            {selectedApp.status === 'pending_approval' ? (
              <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                <button
                  onClick={() => setRequestInfoModalOpen(true)}
                  className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold text-amber-600 hover:bg-amber-500/10 border border-amber-500/20"
                >
                  Request Info
                </button>
                <button
                  onClick={() => handleReject(selectedApp)}
                  className="px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-semibold text-rose-600 hover:bg-rose-500/10 border border-rose-500/20"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(selectedApp)}
                  className="px-4 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary)',
                    color: 'var(--md-sys-color-on-primary)',
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Approve & Provision</span>
                </button>
              </div>
            ) : (
              <div className="flex justify-end pt-3 border-t" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                <button
                  onClick={() => setSelectedApp(null)}
                  className="px-4 py-1.5 rounded-[var(--md-sys-shape-corner-small)] text-xs font-bold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Request Info Dialog */}
      {requestInfoModalOpen && (
        <Modal
          isOpen={requestInfoModalOpen}
          onClose={() => setRequestInfoModalOpen(false)}
          title="Request Clarification from Applicant"
        >
          <div className="space-y-3 text-xs">
            <p className="text-[var(--md-sys-color-on-surface-variant)]">
              Specify what additional documentation (e.g. MIRA TIN certificate, Ministry registration document) is required from <strong>{selectedApp?.applicantName}</strong>:
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Please provide a copy of your MIRA GST registration certificate or company registry document."
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              className="w-full p-2.5 rounded-[var(--md-sys-shape-corner-small)] border bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] text-xs"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRequestInfoModalOpen(false)}
                className="px-3 py-1.5 rounded text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInfoRequest}
                className="px-4 py-1.5 rounded text-xs font-bold"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary)',
                  color: 'var(--md-sys-color-on-primary)',
                }}
              >
                Send Request
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
