import React, { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  Printer,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Layers,
  Palmtree,
  DollarSign,
  Plus,
  Scale,
  Users,
  Moon,
  Ship,
  Sparkles
} from 'lucide-react';
import {
  calculateMiraTgstReturn,
  createGreenTaxJournalEntry,
  GreenTaxStayRecord,
  MiraTgstReturn,
} from '../../domain/miraTgst';
import { JournalEntry } from '../../domain/journals';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const MiraTgstView: React.FC<{
  onAddJournalEntry?: (entry: JournalEntry) => void;
}> = ({ onAddJournalEntry }) => {
  const { invoices, expenses, currentTenant, formatMVR } = useERP();

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // August
  const [greenTaxStays, setGreenTaxStays] = useState<GreenTaxStayRecord[]>([
    {
      id: 'stay-01',
      guestName: 'Alexander Wright',
      passportOrId: 'GB9920194',
      nationality: 'British',
      isTourist: true,
      checkInDate: '2026-08-01',
      checkOutDate: '2026-08-08',
      totalNights: 7,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: 42.0,
      exchangeRate: 15.42,
      totalGreenTaxMvr: 647.64,
    },
    {
      id: 'stay-02',
      guestName: 'Elena Rostova',
      passportOrId: 'RU8819201',
      nationality: 'Russian',
      isTourist: true,
      checkInDate: '2026-08-05',
      checkOutDate: '2026-08-15',
      totalNights: 10,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: 60.0,
      exchangeRate: 15.42,
      totalGreenTaxMvr: 925.20,
    },
    {
      id: 'stay-03',
      guestName: 'Ahmed Zahir',
      passportOrId: 'A091823',
      nationality: 'Maldivian',
      isTourist: false, // Maldivian citizen exempt
      checkInDate: '2026-08-10',
      checkOutDate: '2026-08-14',
      totalNights: 4,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: 0,
      exchangeRate: 15.42,
      totalGreenTaxMvr: 0,
    },
  ]);

  const [isAddStayModalOpen, setIsAddStayModalOpen] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newPassport, setNewPassport] = useState('');
  const [newNationality, setNewNationality] = useState('German');
  const [newNights, setNewNights] = useState(5);

  // Compute TGST Return
  const tgstReturn: MiraTgstReturn = useMemo(() => {
    return calculateMiraTgstReturn({
      invoices,
      expenses,
      greenTaxStays,
      periodYear: selectedYear,
      periodMonth: selectedMonth,
      // SERP-237: no fabricated TIN on a statutory return. See MiraGst201View.
      tin: currentTenant.tinNumber || '',
      // SERP-237: no invented legal entity name on a statutory return. This is
      // the twin of the MiraGst201View fix — the same defect, one file over.
      legalEntityName: currentTenant.name || '',
      isGstRegistered: currentTenant.gstStatus === 'registered',
      usdToMvrRate: 15.42,
    });
  }, [invoices, expenses, greenTaxStays, selectedYear, selectedMonth, currentTenant]);

  const handleAddGuestStay = () => {
    if (!newGuestName || !newPassport) return;
    const isTour = newNationality.toLowerCase() !== 'maldivian';
    const taxUsd = isTour ? newNights * 6.0 : 0;
    const taxMvr = taxUsd * 15.42;

    const newRecord: GreenTaxStayRecord = {
      id: `stay-${Date.now()}`,
      guestName: newGuestName,
      passportOrId: newPassport,
      nationality: newNationality,
      isTourist: isTour,
      checkInDate: '2026-08-15',
      checkOutDate: '2026-08-20',
      totalNights: newNights,
      ratePerNightUsd: 6.0,
      totalGreenTaxUsd: taxUsd,
      exchangeRate: 15.42,
      totalGreenTaxMvr: taxMvr,
    };

    setGreenTaxStays([...greenTaxStays, newRecord]);
    setIsAddStayModalOpen(false);
    setNewGuestName('');
    setNewPassport('');
  };

  const handlePostGreenTaxJournal = () => {
    const je = createGreenTaxJournalEntry(tgstReturn, currentTenant.id || 'tenant-01');
    if (je && onAddJournalEntry) {
      onAddJournalEntry(je as any);
      alert(`Green Tax Journal Entry #${je.entryNumber} posted successfully to General Ledger.`);
    }
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <div className="space-y-6 finance-light-compat" data-testid="mira-tgst-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Palmtree size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">MIRA Tourism GST (16%) & Green Tax</h2>
                <Badge variant="warning">Tourism Sector (TGSTA)</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Official Maldives Inland Revenue Authority (MIRA) Form for 16% TGST and $6.00 USD/night Green Tax returns.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>

            <Button
              variant="filled"
              size="sm"
              disabled={tgstReturn.filingReadiness.status === 'HOLD'}
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              <span>Print Schedule</span>
            </Button>
          </div>
        </div>

        <div role="status" aria-live="polite" className="mt-4 text-sm">
          HOLD — {tgstReturn.filingReadiness.reason} Amounts remain visible for reconciliation.
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">16% TGST Output Tax</span>
            <div className="text-base font-bold text-amber-300 font-mono">
              {formatMVR(tgstReturn.totalTgstOutputTaxMvr)}
            </div>
            <div className="text-[10px] text-slate-500">From 16% Tourism Invoices</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Deductible Input Tax</span>
            <div className="text-base font-bold text-sky-300 font-mono">
              {formatMVR(tgstReturn.totalTgstInputTaxMvr)}
            </div>
            <div className="text-[10px] text-slate-500">From Tourism Sector Expenses</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Net 16% TGST Payable</span>
            <div className="text-base font-bold text-rose-300 font-mono">
              {formatMVR(tgstReturn.netTgstPayableMvr)}
            </div>
            <div className="text-[10px] text-slate-500">Due by {tgstReturn.filingDueDate}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Green Tax Payable</span>
            <div className="text-base font-bold text-emerald-300 font-mono">
              ${tgstReturn.totalGreenTaxPayableUsd.toFixed(2)} <span className="text-xs text-slate-400">({formatMVR(tgstReturn.totalGreenTaxPayableMvr)})</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">{tgstReturn.totalTouristBedNights} Tourist Bed-Nights</div>
          </div>
        </div>
      </Surface>

      {/* Green Tax Stays Register */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Green Tax Guest Stays Register ($6.00 USD/night)</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddStayModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Guest Stay</span>
            </button>

            <button
              type="button"
              onClick={handlePostGreenTaxJournal}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Scale size={13} />
              <span>Post GL Tax Provision</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                <th className="py-2.5 px-3">Guest Name</th>
                <th className="py-2.5 px-3">Passport / ID</th>
                <th className="py-2.5 px-3">Nationality</th>
                <th className="py-2.5 px-3 text-center">Tourist Status</th>
                <th className="py-2.5 px-3 text-right">Bed Nights</th>
                <th className="py-2.5 px-3 text-right">Green Tax (USD)</th>
                <th className="py-2.5 px-3 text-right">Green Tax (MVR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {tgstReturn.greenTaxRecords.map((stay) => (
                <tr key={stay.id} className="hover:bg-slate-900/40">
                  <td className="py-2.5 px-3 font-sans font-medium text-white">{stay.guestName}</td>
                  <td className="py-2.5 px-3 text-slate-400">{stay.passportOrId}</td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans">{stay.nationality}</td>
                  <td className="py-2.5 px-3 text-center">
                    {stay.isTourist ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                        Foreign Tourist
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[9px] font-bold">
                        Maldivian (Exempt)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-200">{stay.totalNights}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                    ${stay.totalGreenTaxUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    {formatMVR(stay.totalGreenTaxMvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Add Stay Modal */}
      {isAddStayModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsAddStayModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-sm text-white">Record Guest Stay (Green Tax Intake)</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Guest Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Charlotte Dupont"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Passport / National ID</label>
                <input
                  type="text"
                  placeholder="e.g. FR9901923"
                  value={newPassport}
                  onChange={(e) => setNewPassport(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Nationality</label>
                  <select
                    value={newNationality}
                    onChange={(e) => setNewNationality(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="German">German</option>
                    <option value="British">British</option>
                    <option value="French">French</option>
                    <option value="Italian">Italian</option>
                    <option value="American">American</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Maldivian">Maldivian (Exempt)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Bed Nights</label>
                  <input
                    type="number"
                    min={1}
                    value={newNights}
                    onChange={(e) => setNewNights(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setIsAddStayModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddGuestStay}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-md"
              >
                Add Guest Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
