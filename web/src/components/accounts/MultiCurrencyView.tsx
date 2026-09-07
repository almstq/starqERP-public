import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Scale,
  Plus,
  Building2,
  Layers,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Globe,
  Coins
} from 'lucide-react';
import {
  DEFAULT_MMA_RATES,
  SupportedCurrency,
  convertToBaseMvr,
  calculateRealizedFxGainLoss,
  calculateUnrealizedRevaluation,
  FxSettlementResult,
  UnrealizedRevaluationResult,
} from '../../domain/multiCurrency';
import { JournalEntry } from '../../domain/journals';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';

export const MultiCurrencyView: React.FC<{
  onAddJournalEntry?: (entry: JournalEntry) => void;
}> = ({ onAddJournalEntry }) => {
  const { formatMVR, currentTenant } = useERP();

  const [mmaRates, setMmaRates] = useState<Record<SupportedCurrency, number>>(DEFAULT_MMA_RATES);
  const [editingCurrency, setEditingCurrency] = useState<SupportedCurrency | null>(null);
  const [editRateValue, setEditRateValue] = useState<string>('');

  // Settlement Form State
  const [transType, setTransType] = useState<'AR_COLLECTION' | 'AP_DISBURSEMENT'>('AR_COLLECTION');
  const [refDoc, setRefDoc] = useState('INV-USD-2026-08');
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [foreignAmt, setForeignAmt] = useState<number>(5000);
  const [originalRate, setOriginalRate] = useState<number>(15.42);
  const [settlementRate, setSettlementRate] = useState<number>(15.65);
  const [recentSettlements, setRecentSettlements] = useState<FxSettlementResult[]>([]);

  // Period End Revaluation State
  const [usdBankBalance, setUsdBankBalance] = useState<number>(25000);
  const [usdBookMvr, setUsdBookMvr] = useState<number>(385500); // 25,000 * 15.42

  const handleUpdateRate = (cur: SupportedCurrency) => {
    const num = parseFloat(editRateValue);
    if (!isNaN(num) && num > 0) {
      setMmaRates((prev) => ({ ...prev, [cur]: num }));
      setEditingCurrency(null);
    }
  };

  const handleCalculateSettlement = () => {
    const result = calculateRealizedFxGainLoss({
      transactionType: transType,
      reference: refDoc,
      currency,
      foreignAmount: foreignAmt,
      originalRate,
      settlementRate,
      settlementDate: new Date().toISOString().slice(0, 10),
      tenantId: currentTenant.id || 'tenant-01',
    });

    setRecentSettlements([result, ...recentSettlements]);

    if (onAddJournalEntry) {
      onAddJournalEntry(result.journalEntry);
    }

    alert(`Realized FX Settlement recorded! Journal Entry #${result.journalEntry.entryNumber} posted.`);
  };

  const revalResult: UnrealizedRevaluationResult = calculateUnrealizedRevaluation({
    accountCode: '1112',
    accountName: 'Bank of Maldives (BML) USD Account',
    currency: 'USD',
    foreignBalance: usdBankBalance,
    bookMvrBalance: usdBookMvr,
    closingMmaRate: mmaRates.USD,
  });

  return (
    <div className="space-y-6 finance-light-compat" data-testid="multi-currency-view">
      {/* Header & MMA Rates Board */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Globe size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Multi-Currency & MMA Exchange Rates</h2>
                <Badge variant="neutral">Base Currency: MVR</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Official Maldives Monetary Authority (MMA) pegged rates, dynamic spot conversion, and automated Realized FX Gain/Loss.
              </p>
            </div>
          </div>
        </div>

        {/* Currency Rates Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-6">
          {(Object.keys(mmaRates) as SupportedCurrency[]).map((cur) => (
            <div
              key={cur}
              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white font-mono">{cur}</span>
                <span className="text-[9px] text-slate-500 font-mono">1 {cur}</span>
              </div>
              {editingCurrency === cur && cur !== 'MVR' ? (
                <div className="flex items-center gap-1 pt-1">
                  <input
                    type="number"
                    step="0.01"
                    value={editRateValue}
                    onChange={(e) => setEditRateValue(e.target.value)}
                    className="w-full px-1.5 py-0.5 rounded bg-slate-950 border border-amber-500 text-xs text-white font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateRate(cur)}
                    className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-bold cursor-pointer"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    if (cur !== 'MVR') {
                      setEditingCurrency(cur);
                      setEditRateValue(mmaRates[cur].toString());
                    }
                  }}
                  className={`text-sm font-bold font-mono ${
                    cur === 'MVR' ? 'text-slate-400' : 'text-amber-400 hover:text-amber-300 cursor-pointer'
                  }`}
                  title={cur !== 'MVR' ? 'Click to edit spot rate' : undefined}
                >
                  {mmaRates[cur].toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">MVR</span>
                </div>
              )}
              <div className="text-[9px] text-slate-500">
                {cur === 'USD' ? 'MMA Peg Band' : cur === 'MVR' ? 'Base Currency' : 'MMA Daily Spot'}
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {/* Realized FX Settlement Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-sky-400" />
            <h3 className="text-sm font-bold text-white">Foreign Currency Settlement Simulator</h3>
          </div>
          <p className="text-xs text-slate-400">
            Calculate and book Realized FX Gain or Loss upon foreign invoice collection or supplier bill payment.
          </p>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Transaction Type</label>
                <select
                  value={transType}
                  onChange={(e) => setTransType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="AR_COLLECTION">AR Customer Collection (Receipt)</option>
                  <option value="AP_DISBURSEMENT">AP Supplier Payment (Disbursement)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Reference Document</label>
                <input
                  type="text"
                  value={refDoc}
                  onChange={(e) => setRefDoc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => {
                    const c = e.target.value as SupportedCurrency;
                    setCurrency(c);
                    setOriginalRate(mmaRates[c]);
                    setSettlementRate(mmaRates[c]);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="SGD">SGD (S$)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Foreign Amount</label>
                <input
                  type="number"
                  value={foreignAmt}
                  onChange={(e) => setForeignAmt(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Original Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={originalRate}
                  onChange={(e) => setOriginalRate(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Settlement Spot Rate</label>
              <input
                type="number"
                step="0.01"
                value={settlementRate}
                onChange={(e) => setSettlementRate(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <Button
              variant="filled"
              size="sm"
              onClick={handleCalculateSettlement}
              icon={<Scale size={14} />}
              className="w-full mt-2"
            >
              <span>Record Settlement & Post FX Journal</span>
            </Button>
          </div>
        </Surface>

        {/* Period-End Foreign Currency Asset Revaluation */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-purple-400" />
            <h3 className="text-sm font-bold text-white">Foreign Currency Balance Revaluation</h3>
          </div>
          <p className="text-xs text-slate-400">
            Revalue foreign bank accounts and open AR/AP balances against latest closing MMA rates.
          </p>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>Account:</span>
              <span className="text-white font-bold">{revalResult.accountCode} - {revalResult.accountName}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Foreign Balance:</span>
              <span className="text-white font-bold">${revalResult.foreignBalance.toLocaleString()} {revalResult.currency}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Book Balance (MVR):</span>
              <span>{formatMVR(revalResult.bookMvrBalance)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Current MMA Rate:</span>
              <span className="text-amber-400 font-bold">{revalResult.closingMmaRate.toFixed(2)} MVR</span>
            </div>
            <div className="flex items-center justify-between text-slate-300 pt-2 border-t border-slate-800">
              <span>Revalued Asset Balance:</span>
              <span className="text-purple-300 font-bold">{formatMVR(revalResult.revaluedMvrBalance)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span>Unrealized Gain / (Loss):</span>
              <span className={`font-bold text-sm ${
                revalResult.unrealizedGainLossMvr >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {formatMVR(revalResult.unrealizedGainLossMvr)}
              </span>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
};
