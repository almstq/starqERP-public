import React, { useState, useEffect } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { ServiceType, JobStatus, Vehicle, StaffMember } from '../../types/erp';

export const CreateJobModal: React.FC = () => {
  const {
    isCreateJobOpen,
    setIsCreateJobOpen,
    customers,
    staff,
    createJob,
    prefilledCustomerId,
    setPrefilledCustomerId,
    setSelectedJobId,
    currentUser,
    roles,
    hasPermission,
    currentArchetype,
    currentTerms,
  } = useERP();

  const isAutomotive = currentArchetype?.terminology?.showVehicleFields ?? false;

  const userRole = roles.find((r) => r.id === currentUser?.roleId);
  const isSuperAdmin = currentUser?.roleName === 'Super Admin' || !!userRole?.isSystemAdmin;
  const canCreateJob = isSuperAdmin || hasPermission('jobs', 'create');

  const [customerId, setCustomerId] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>(() =>
    isAutomotive ? 'Full Body Repaint' : 'Software & Engineering Services'
  );
  const [requestedWork, setRequestedWork] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [quotedAmount, setQuotedAmount] = useState<number>(isAutomotive ? 35000 : 25000);
  const [depositPaid, setDepositPaid] = useState<number>(isAutomotive ? 15000 : 10000);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(['st-1']);
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>('Normal');
  const [bayNumber, setBayNumber] = useState(() =>
    isAutomotive ? 'Spray Booth Bay 1 (Bake Oven)' : 'Main Studio / Engineering Unit'
  );
  const [projectRef, setProjectRef] = useState('');
  const [milestoneTarget, setMilestoneTarget] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedCompletionDate, setExpectedCompletionDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );

  // Vehicle manual input or selected from customer
  const [plateNumber, setPlateNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2022');
  const [color, setColor] = useState('');

  useEffect(() => {
    if (prefilledCustomerId) {
      setCustomerId(prefilledCustomerId);
    } else if (customers.length > 0 && !customerId) {
      setCustomerId(customers[0].id);
    }
  }, [prefilledCustomerId, customers]);

  useEffect(() => {
    if (isAutomotive) {
      setServiceType('Full Body Repaint');
      setBayNumber('Spray Booth Bay 1 (Bake Oven)');
    } else {
      setServiceType('Software & Engineering Services');
      setBayNumber('Main Studio / Engineering Unit');
    }
  }, [isAutomotive]);

  // When customer changes, auto-fill first vehicle if automotive
  useEffect(() => {
    if (!isAutomotive) return;
    const cust = customers.find((c) => c.id === customerId);
    if (cust && cust.vehicles.length > 0) {
      const v = cust.vehicles[0];
      setPlateNumber(v.plateNumber);
      setMake(v.make);
      setModel(v.model);
      setYear(String(v.year));
      setColor(v.color);
    }
  }, [customerId, customers, isAutomotive]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;

    const vehicle: Vehicle = isAutomotive
      ? {
          plateNumber: plateNumber || 'TBD-0000',
          make: make || 'Custom',
          model: model || 'Model',
          year: Number(year) || 2022,
          color: color || 'Standard',
          type: 'Car',
        }
      : {
          plateNumber: projectRef ? `REF-${projectRef}` : '',
          make: 'General',
          model: 'Deliverable',
          year: new Date().getFullYear(),
          color: 'Standard',
          type: 'Car',
        };

    const assignedStaffMembers = staff.filter((s) => selectedStaffIds.includes(s.id));
    const laborEstimate = quotedAmount * 0.35;
    const estMaterial = isAutomotive ? quotedAmount * 0.22 : quotedAmount * 0.10;

    const fullRequestedWork = !isAutomotive && milestoneTarget
      ? `${requestedWork}\nMilestone Target: ${milestoneTarget}`
      : requestedWork;

    const newJob = createJob({
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      vehicle,
      serviceType,
      requestedWork: fullRequestedWork,
      specialInstructions,
      quotedAmount: Number(quotedAmount),
      depositPaid: Number(depositPaid),
      balanceDue: Number(quotedAmount) - Number(depositPaid),
      assignedStaff: assignedStaffMembers,
      status: 'In Progress',
      priority,
      startDate,
      expectedCompletionDate,
      estimatedMaterialCost: estMaterial,
      laborCostEstimate: laborEstimate,
      targetMarginPercentage: Math.round(((quotedAmount - (estMaterial + laborEstimate)) / quotedAmount) * 100),
      bayNumber,
      projectRef: !isAutomotive ? (projectRef || 'PRJ-01') : undefined,
      location: bayNumber,
    });

    setIsCreateJobOpen(false);
    setPrefilledCustomerId(undefined);
    setSelectedJobId(newJob.id);
  };

  const toggleStaff = (id: string) => {
    if (selectedStaffIds.includes(id)) {
      if (selectedStaffIds.length > 1) {
        setSelectedStaffIds(selectedStaffIds.filter((sid) => sid !== id));
      }
    } else {
      setSelectedStaffIds([...selectedStaffIds, id]);
    }
  };

  return (
    <Modal
      isOpen={isCreateJobOpen}
      onClose={() => {
        setIsCreateJobOpen(false);
        setPrefilledCustomerId(undefined);
      }}
      title={isAutomotive ? "Create New Job Order / Work Ticket" : `Create New ${currentTerms.order}`}
      subtitle={
        isAutomotive
          ? "Issue a new automotive paint, wrap, or detailing work order"
          : `Create and schedule a new ${currentTerms.order.toLowerCase()} or client engagement`
      }
      maxWidth="3xl"
      actions={
        <>
          <button
            type="button"
            onClick={() => setIsCreateJobOpen(false)}
            className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold border border-[var(--md-sys-color-outline-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canCreateJob}
            className={`px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-xs ${
              canCreateJob ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 cursor-not-allowed'
            }`}
          >
            {isAutomotive ? 'Create & Assign to Bay' : `Create & Schedule ${currentTerms.order}`}
          </button>
        </>
      }
    >
      {!canCreateJob && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2 font-medium">
          <span>
            ⚠️ <strong>{isAutomotive ? 'Bay Intake Locked:' : 'Order Intake Locked:'}</strong> Required seat is <strong>counter</strong> (or {isAutomotive ? 'Service Advisor' : 'Project Manager'} / Managing Director). Switch acting-as seat to proceed.
          </span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer & Service Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              {isAutomotive ? 'Customer / Fleet *' : `${currentTerms.customer} *`}
            </label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type}) — {c.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              {isAutomotive ? 'Service Type *' : 'Service / Deliverable Type *'}
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 font-medium"
            >
              {isAutomotive ? (
                <>
                  <option value="Full Body Repaint">Full Body Repaint</option>
                  <option value="Vinyl Wrap Installation">Vinyl Wrap Installation</option>
                  <option value="Ceramic & Detailing">Ceramic & Detailing Package</option>
                  <option value="Panel Repaint">Panel & Spot Repaint</option>
                  <option value="PPF Protection Film">PPF Paint Protection Film</option>
                  <option value="Custom Paint">Custom Candy/Pearl Paint (Jetski / Marine)</option>
                  <option value="Caliper & Wheel Custom">Caliper & Wheel Custom Painting</option>
                </>
              ) : (
                <>
                  <option value="Software & Engineering Services">Software & Engineering Services</option>
                  <option value="System Integration & API Development">System Integration & API Development</option>
                  <option value="Technical Consulting & Architecture">Technical Consulting & Architecture</option>
                  <option value="Support & Maintenance Retainer">Support & Maintenance Retainer</option>
                  <option value="UI/UX Design & Prototyping">UI/UX Design & Prototyping</option>
                  <option value="Project Delivery & Implementation">Project Delivery & Implementation</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Vehicle or Project Scope Information */}
        {isAutomotive ? (
          <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2.5">
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Vehicle / Asset Info
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Plate Number</label>
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="AB1-8842"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-blue-600 font-mono font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Make</label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Toyota / Audi"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Prado TX / Supra"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Color / Finish</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Pearl White"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-2.5">
            <div className="text-xs font-bold text-[var(--md-sys-color-primary)] uppercase tracking-wider">
              Project & Deliverable Scope
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Project Code / Reference *</label>
                <input
                  type="text"
                  required
                  value={projectRef}
                  onChange={(e) => setProjectRef(e.target.value.toUpperCase())}
                  placeholder="e.g. STQ-PRJ-2026-01"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-primary)] font-mono font-semibold focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Milestone Target / Module</label>
                <input
                  type="text"
                  value={milestoneTarget}
                  onChange={(e) => setMilestoneTarget(e.target.value)}
                  placeholder="e.g. Architecture Milestone 1"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Scope of Work */}
        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
            {isAutomotive ? 'Requested Scope of Work *' : 'Project Scope & Deliverables *'}
          </label>
          <textarea
            required
            rows={2}
            value={requestedWork}
            onChange={(e) => setRequestedWork(e.target.value)}
            placeholder={
              isAutomotive
                ? "Detailed description of paint preparation, disassembly, layers of clearcoat, wrap coverage..."
                : "Detailed description of client deliverables, project scope, technical specifications, and milestones..."
            }
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Financials & Quotes (MVR) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Quoted Price (MVR) *</label>
            <input
              type="number"
              required
              min="0"
              value={quotedAmount}
              onChange={(e) => setQuotedAmount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-bold text-[var(--md-sys-color-on-surface)] font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Advance Deposit Received (MVR)</label>
            <input
              type="number"
              min="0"
              value={depositPaid}
              onChange={(e) => setDepositPaid(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-bold text-emerald-600 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Bay & Priority & Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-0">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              {isAutomotive ? 'Assigned Garage Bay' : `Assigned ${currentTerms.facility}`}
            </label>
            <select
              value={bayNumber}
              onChange={(e) => setBayNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 scroll-mt-4"
            >
              {isAutomotive ? (
                <>
                  <option value="Spray Booth Bay 1 (Bake Oven)">Spray Booth Bay 1 (Bake Oven)</option>
                  <option value="Clean Wrap Studio Bay 1">Clean Wrap Studio Bay 1</option>
                  <option value="Detailing Bay A (LED Tunnel)">Detailing Bay A (LED Tunnel)</option>
                  <option value="Prep Bay 2 (Sanding)">Prep Bay 2 (Sanding)</option>
                  <option value="Body Pull Bay 3">Body Pull Bay 3</option>
                </>
              ) : (
                <>
                  <option value="Main Studio / Engineering Unit">Main Studio / Engineering Unit</option>
                  <option value="Client On-Site / Remote Delivery">Client On-Site / Remote Delivery</option>
                  <option value="Development Unit 1">Development Unit 1</option>
                  <option value="Project Management Office">Project Management Office</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Job Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent / Rush</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Target Completion</label>
            <input
              type="date"
              required
              value={expectedCompletionDate}
              onChange={(e) => setExpectedCompletionDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Assigned Staff */}
        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1.5">Assign Technicians & Specialists</label>
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => {
              const isSelected = selectedStaffIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => toggleStaff(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                      : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline-variant)]'
                  }`}
                >
                  {s.name} ({s.role})
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
};
