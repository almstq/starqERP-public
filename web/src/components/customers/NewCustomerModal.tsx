import React, { useState } from 'react';
import { useERP } from '../../context/ERPContext';
import { Modal } from '../common/Modal';
import { CustomerType, Vehicle } from '../../types/erp';

export const NewCustomerModal: React.FC = () => {
  const { isNewCustomerOpen, setIsNewCustomerOpen, createCustomer, currentArchetype, currentTerms } = useERP();
  const isAutomotive = currentArchetype?.terminology?.showVehicleFields ?? false;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+960 ');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<CustomerType>('Individual');
  const [island, setIsland] = useState("Hulhumale'");
  const [notes, setNotes] = useState('');

  // Primary vehicle
  const [plateNumber, setPlateNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2022');
  const [color, setColor] = useState('');
  const [vehicleType, setVehicleType] = useState<'Car' | 'Motorcycle' | 'Speedboat/Jetski' | 'Van/Truck'>('Car');
  const [logoUrl, setLogoUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const vehicles: Vehicle[] = (isAutomotive && plateNumber)
      ? [
          {
            plateNumber,
            make: make || 'Custom',
            model: model || 'Vehicle',
            year: Number(year) || 2022,
            color: color || 'Standard',
            type: vehicleType
          }
        ]
      : [];

    createCustomer({
      name,
      phone,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@client.mv`,
      type,
      island,
      vehicles,
      notes,
      logoUrl: logoUrl.trim() || undefined,
    });

    setIsNewCustomerOpen(false);
    setName('');
    setPhone('+960 ');
    setEmail('');
    setLogoUrl('');
    setPlateNumber('');
    setMake('');
    setModel('');
    setColor('');
    setNotes('');
  };

  return (
    <Modal
      isOpen={isNewCustomerOpen}
      onClose={() => setIsNewCustomerOpen(false)}
      title={isAutomotive ? "Add New Customer & Vehicle" : `Add New ${currentTerms.customer}`}
      subtitle={
        isAutomotive
          ? "Register an individual, VIP, or corporate fleet account in Maldives"
          : `Register a new ${currentTerms.customer.toLowerCase()} account and contact details`
      }
      maxWidth="2xl"
      actions={
        <>
          <button
            type="button"
            onClick={() => setIsNewCustomerOpen(false)}
            className="px-4 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-xs font-semibold border border-[var(--md-sys-color-outline-variant)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
          >
            Save {currentTerms.customer} Profile
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              {currentTerms.customer} Name / Business Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ibrahim Shaan or Horizon Trading"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Account Classification *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomerType)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="Individual">Individual Client</option>
              <option value="Corporate">Corporate / Business Account</option>
              {isAutomotive && <option value="Fleet">Commercial Fleet (Multiple Assets)</option>}
              <option value="VIP">VIP Premium Client</option>
            </select>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Phone Number (Maldives) *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+960 778-1234"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@domain.mv"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Branding & Location */}
        <div className={`grid grid-cols-1 ${isAutomotive ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3.5`}>
          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Client Avatar / Logo URL</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://.../logo.png or asset path"
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Island / Location</label>
            <select
              value={island}
              onChange={(e) => setIsland(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
            >
              <option value="Hulhumale'">Hulhumale' (Phase 1 / 2)</option>
              <option value="Male'">Male' City</option>
              <option value="Villimale'">Villimale'</option>
              <option value="Thilafushi / Gulhifalhu">Thilafushi / Industrial</option>
              <option value="Resort / Atoll">Resort / Atoll Transfer</option>
            </select>
          </div>

          {isAutomotive && (
            <div>
              <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
              >
                <option value="Car">Passenger Car / Sedan / SUV</option>
                <option value="Motorcycle">Motorcycle / Scooter</option>
                <option value="Speedboat/Jetski">Jetski / Speedboat Hull</option>
                <option value="Van/Truck">Commercial Van / Pickup Truck</option>
              </select>
            </div>
          )}
        </div>

        {/* Primary Vehicle Registration (Automotive only) */}
        {isAutomotive && (
          <div className="p-3.5 rounded-xl bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] space-y-3">
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Primary Vehicle / Asset Details
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Plate Number</label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="AB1-8842"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-blue-600 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Make</label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Toyota / Honda"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Prado / Supra"
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
        )}

        <div>
          <label className="block text-xs font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
            {isAutomotive ? 'Notes & Garage Preferences' : 'Notes & Account Instructions'}
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isAutomotive
                ? "Special instructions, paint code preferences, VIP handling notes..."
                : "Billing instructions, commercial terms, key contact notes..."
            }
            className="w-full px-3 py-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
