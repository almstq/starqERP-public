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
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Info
} from 'lucide-react';
import {
  calculateMiraGst201Return,
  generateMiraConnectCsv,
  MiraGst201Return,
} from '../../domain/miraGst201';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const MiraGst201View: React.FC = () => {
  const { invoices, expenses, purchaseOrders, currentTenant, formatMVR } = useERP();
  // ERPContext exposes no isGstRegistered; derive it from the tenant's real status.
  const isGstRegistered = currentTenant?.gstStatus === 'registered';

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // August
  const [activeAuditTab, setActiveAuditTab] = useState<'supplies' | 'purchases' | 'none'>('none');

  // Compute MIRA Return
  const miraReturn: MiraGst201Return = useMemo(() => {
    return calculateMiraGst201Return({
      invoices,
      expenses,
      purchaseOrders: purchaseOrders.map((po) => ({
        id: po.id,
        orderNumber: po.poNumber,
        date: po.orderDate,
        supplierName: po.supplierName,
        subtotal: po.subtotal,
        taxAmount: po.gstAmount,
        totalAmount: po.totalAmount,
      })),
      periodYear: selectedYear,
      periodMonth: selectedMonth,
      // SERP-237: NEVER fabricate a statutory identifier. An invented TIN on a
      // GST-201 is a false declaration to MIRA, and an invented legal entity
      // name is worse. If the tenant has not recorded them, the return shows
      // them as absent and the operator supplies them before filing.
      tin: currentTenant.tinNumber || '',
      legalEntityName: currentTenant.name || '',
      isGstRegistered,
    });
  }, [invoices, expenses, purchaseOrders, selectedYear, selectedMonth, currentTenant, isGstRegistered]);

  // Download MIRAconnect CSV
  const handleDownloadCsv = () => {
    const csv = generateMiraConnectCsv(miraReturn);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `MIRA-GST-201-${miraReturn.taxPeriod}-${miraReturn.tin || 'TAX'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <div className="space-y-6 finance-light-compat" data-testid="mira-gst-201-view">
      {/* 1. Official Form Header & Controls */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileText size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">MIRA GST-201 Tax Return</h2>
                <Badge variant={isGstRegistered ? 'positive' : 'neutral'}>
                  {isGstRegistered ? 'GST Registered' : 'Not Registered'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                Official Maldives Inland Revenue Authority (MIRA) Form 201 Tax Return Schedule (General Sector 8% GST).
              </p>
            </div>
          </div>

          {/* Period Selectors & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
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
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>

            <Button
              variant="tonal"
              size="sm"
              onClick={handleDownloadCsv}
              icon={<Download size={14} />}
            >
              <span>MIRAconnect CSV</span>
            </Button>

            <Button
              variant="filled"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              <span>Print Return</span>
            </Button>
          </div>
        </div>

        {/* Taxpayer Meta Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-800/80">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Taxpayer (TIN)</span>
            <div className="text-xs font-bold text-white font-mono">{miraReturn.tin || 'NOT REGISTERED'}</div>
            <div className="text-[10px] text-slate-400 truncate">{miraReturn.legalName}</div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Tax Period</span>
            <div className="text-xs font-bold text-emerald-400 font-mono">{miraReturn.taxPeriod}</div>
            <div className="text-[10px] text-slate-400">{miraReturn.periodStartDate} to {miraReturn.periodEndDate}</div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Filing Due Date</span>
            <div className="text-xs font-bold text-amber-400 font-mono">{miraReturn.filingDueDate}</div>
            <div className="text-[10px] text-slate-400">By 28th of next month</div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Net MIRA Liability</span>
            <div className={`text-base font-bold font-mono ${
              miraReturn.box13_netGstPayable > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {formatMVR(miraReturn.box13_netGstPayable)}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {miraReturn.box13_netGstPayable > 0 ? 'Tax Payable to MIRA' : 'Tax Refundable / Credit'}
            </div>
          </div>
        </div>
      </Surface>

      {/* 2. Official 3-Part Box Table */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-6">
        {/* Part A: Output Tax */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Part A: Tax on Supplies (Output Tax)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">MIRA Form 201 (Boxes 1–7)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                  <th className="py-2 px-3 w-16">Box</th>
                  <th className="py-2 px-3">Description of Supply</th>
                  <th className="py-2 px-3 text-right">Taxable Value (MVR)</th>
                  <th className="py-2 px-3 text-right">Tax Amount (MVR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 1 & 2</td>
                  <td className="py-2 px-3 font-sans text-white">Standard Rated Supplies (General Sector 8%)</td>
                  <td className="py-2 px-3 text-right text-slate-200">{formatMVR(miraReturn.box1_standardSupplies8Value)}</td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-bold">{formatMVR(miraReturn.box2_standardSupplies8Tax)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 3 & 4</td>
                  <td className="py-2 px-3 font-sans text-slate-300">Tourism Sector Supplies (16% TGST)</td>
                  <td className="py-2 px-3 text-right text-slate-400">{formatMVR(miraReturn.box3_tourismSupplies16Value)}</td>
                  <td className="py-2 px-3 text-right text-slate-400">{formatMVR(miraReturn.box4_tourismSupplies16Tax)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 5</td>
                  <td className="py-2 px-3 font-sans text-slate-300">Zero-Rated Supplies (Exports & Essential Goods)</td>
                  <td className="py-2 px-3 text-right text-slate-200">{formatMVR(miraReturn.box5_zeroRatedSuppliesValue)}</td>
                  <td className="py-2 px-3 text-right text-slate-500">0.00</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 6</td>
                  <td className="py-2 px-3 font-sans text-slate-300">Exempt Supplies (Financial Services & Education)</td>
                  <td className="py-2 px-3 text-right text-slate-200">{formatMVR(miraReturn.box6_exemptSuppliesValue)}</td>
                  <td className="py-2 px-3 text-right text-slate-500">0.00</td>
                </tr>
                <tr className="bg-slate-900/80 font-bold text-white">
                  <td className="py-2.5 px-3 text-emerald-400">Box 7</td>
                  <td className="py-2.5 px-3 font-sans">Total Output Tax (Box 2 + Box 4)</td>
                  <td className="py-2.5 px-3 text-right">-</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400 text-sm">{formatMVR(miraReturn.box7_totalOutputTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Part B: Input Tax */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              Part B: Input Tax on Purchases (Deductions)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">MIRA Form 201 (Boxes 8–12)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase">
                  <th className="py-2 px-3 w-16">Box</th>
                  <th className="py-2 px-3">Description of Purchase / Expense</th>
                  <th className="py-2 px-3 text-right">Taxable Value (MVR)</th>
                  <th className="py-2 px-3 text-right">Deductible Tax (MVR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 8 & 9</td>
                  <td className="py-2 px-3 font-sans text-white">Standard Rated Local Purchases (8% GST)</td>
                  <td className="py-2 px-3 text-right text-slate-200">{formatMVR(miraReturn.box8_standardPurchasesValue)}</td>
                  <td className="py-2 px-3 text-right text-sky-400 font-bold">{formatMVR(miraReturn.box9_standardPurchasesTax)}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-slate-300">Box 10 & 11</td>
                  <td className="py-2 px-3 font-sans text-slate-300">Capital Purchases / Fixed Assets Subject to GST</td>
                  <td className="py-2 px-3 text-right text-slate-200">{formatMVR(miraReturn.box10_capitalPurchasesValue)}</td>
                  <td className="py-2 px-3 text-right text-sky-400 font-bold">{formatMVR(miraReturn.box11_capitalPurchasesTax)}</td>
                </tr>
                <tr className="bg-slate-900/80 font-bold text-white">
                  <td className="py-2.5 px-3 text-sky-400">Box 12</td>
                  <td className="py-2.5 px-3 font-sans">Total Deductible Input Tax (Box 9 + Box 11)</td>
                  <td className="py-2.5 px-3 text-right">-</td>
                  <td className="py-2.5 px-3 text-right text-sky-400 text-sm">{formatMVR(miraReturn.box12_totalInputTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Part C: Final Computation */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-white font-mono flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Box 13
                </span>
                Net GST Payable / (Refundable) to MIRA (Box 7 - Box 12)
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Calculated under Chapter 5 of the Maldives Goods & Services Tax Act.
              </p>
            </div>

            <div className="text-right">
              <div className={`text-2xl font-bold font-mono ${
                miraReturn.box13_netGstPayable > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {formatMVR(miraReturn.box13_netGstPayable)}
              </div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                {miraReturn.box13_netGstPayable > 0 ? 'Tax Payable' : 'Credit Refundable'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Granular Audit Trails Drawer Toggle */}
        <div className="pt-2">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => setActiveAuditTab(activeAuditTab === 'supplies' ? 'none' : 'supplies')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeAuditTab === 'supplies'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Taxable Supplies Audit Trail ({miraReturn.supplyAuditLines.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveAuditTab(activeAuditTab === 'purchases' ? 'none' : 'purchases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeAuditTab === 'purchases'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Taxable Purchases Audit Trail ({miraReturn.purchaseAuditLines.length})
            </button>
          </div>

          {activeAuditTab === 'supplies' && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-800 pb-1">
                    <th className="py-1.5 px-2">Invoice #</th>
                    <th className="py-1.5 px-2">Date</th>
                    <th className="py-1.5 px-2">Customer</th>
                    <th className="py-1.5 px-2">Type</th>
                    <th className="py-1.5 px-2 text-right">Taxable Amount</th>
                    <th className="py-1.5 px-2 text-right">GST (8%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-[11px]">
                  {miraReturn.supplyAuditLines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5 px-2 text-white font-bold">{l.invoiceNumber}</td>
                      <td className="py-1.5 px-2 text-slate-400">{l.date}</td>
                      <td className="py-1.5 px-2 text-slate-300">{l.customerName}</td>
                      <td className="py-1.5 px-2 text-slate-400 uppercase text-[10px]">{l.type}</td>
                      <td className="py-1.5 px-2 text-right text-slate-300">{formatMVR(l.taxableAmount)}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">{formatMVR(l.gstAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeAuditTab === 'purchases' && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-800 pb-1">
                    <th className="py-1.5 px-2">Reference</th>
                    <th className="py-1.5 px-2">Date</th>
                    <th className="py-1.5 px-2">Supplier / Vendor</th>
                    <th className="py-1.5 px-2">Category</th>
                    <th className="py-1.5 px-2 text-right">Taxable Amount</th>
                    <th className="py-1.5 px-2 text-right">Input Tax (8%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-[11px]">
                  {miraReturn.purchaseAuditLines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-1.5 px-2 text-white font-bold">{l.reference}</td>
                      <td className="py-1.5 px-2 text-slate-400">{l.date}</td>
                      <td className="py-1.5 px-2 text-slate-300">{l.supplierName}</td>
                      <td className="py-1.5 px-2 text-slate-400 uppercase text-[10px]">{l.isCapital ? 'Capital Asset' : 'Operating'}</td>
                      <td className="py-1.5 px-2 text-right text-slate-300">{formatMVR(l.taxableAmount)}</td>
                      <td className="py-1.5 px-2 text-right text-sky-400 font-bold">{formatMVR(l.gstAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
};
