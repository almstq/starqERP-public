import React, { useState } from 'react';
import {
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Scan,
  Layers,
  Search,
  ShieldCheck,
  Bot,
  Zap
} from 'lucide-react';
import {
  parseReceiptOcr,
  generateAiMatchSuggestions,
  convertMatchToReconciliationProposal,
  ExtractedReceiptData,
  AiMatchSuggestion,
} from '../../domain/aiReconciliation';
import { DEFAULT_AI_AGENTS } from '../../domain/agentRegistry';
import { useERP } from '../../context/ERPContext';
import { Badge, Surface, Button } from '../ui';
import {
  DEMO_AI_RECONCILIATION_OCR_TEXT,
  DEMO_AI_RECONCILIATION_SUGGESTIONS,
} from '../../data/demoFixtures';

export const AiReconciliationView: React.FC = () => {
  const { formatMVR, currentTenant } = useERP();

  const financeBot = DEFAULT_AI_AGENTS.find((a) => a.handle === '@financebot') || DEFAULT_AI_AGENTS[0];

  const [rawOcrText, setRawOcrText] = useState<string>(DEMO_AI_RECONCILIATION_OCR_TEXT);

  const [extractedData, setExtractedData] = useState<ExtractedReceiptData | null>(() =>
    parseReceiptOcr(rawOcrText)
  );

  const [suggestions, setSuggestions] = useState<AiMatchSuggestion[]>(() =>
    DEMO_AI_RECONCILIATION_SUGGESTIONS.map((suggestion) => ({ ...suggestion }))
  );

  const handleParseOcr = () => {
    const data = parseReceiptOcr(rawOcrText);
    setExtractedData(data);
  };

  const handleAcceptMatch = (suggestionId: string) => {
    const match = suggestions.find((s) => s.id === suggestionId);
    if (!match) return;

    const proposal = convertMatchToReconciliationProposal(match, financeBot);

    setSuggestions((prev) =>
      prev.map((s) => (s.id === suggestionId ? { ...s, status: 'ACCEPTED' } : s))
    );

    if (typeof window !== 'undefined' && window.alert) {
      window.alert(
        `AI Match Accepted! Proposal #${proposal.id} created for ${financeBot.handle} under SERP-015 governance.`
      );
    }
  };

  return (
    <div className="space-y-6" data-testid="ai-reconciliation-view">
      {/* Header */}
      <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">AI-Assisted Reconciliation & OCR Extraction</h2>
                <Badge variant="positive">Confidence Scored</Badge>
              </div>
              <p className="text-xs text-slate-400">
                Automated transaction pattern recognition, Maldives OCR parsing (TIN/BML Ref), and 1-click ledger reconciliation.
              </p>
            </div>
          </div>
        </div>
      </Surface>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OCR Parsing Sandbox */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scan size={16} className="text-indigo-400" />
              <span>Smart Receipt / BML Slip OCR Parser</span>
            </h3>
            <Button variant="filled" size="sm" onClick={handleParseOcr} icon={<Zap size={14} />}>
              <span>Extract Data</span>
            </Button>
          </div>

          <textarea
            value={rawOcrText}
            onChange={(e) => setRawOcrText(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 focus:border-indigo-500 focus:outline-none"
            placeholder="Paste raw receipt text or BML transfer slip..."
          />

          {extractedData && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400">Extraction Confidence:</span>
                <Badge variant={extractedData.confidenceScore >= 80 ? 'positive' : 'warning'}>
                  {extractedData.confidenceScore}% Confidence
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-500 block">Vendor:</span>
                  <span className="text-white font-bold">{extractedData.vendorName || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Vendor TIN:</span>
                  <span className="text-cyan-400 font-bold">{extractedData.vendorTin || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Invoice #:</span>
                  <span className="text-white font-bold">{extractedData.invoiceNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">BML Ref:</span>
                  <span className="text-amber-300 font-bold">{extractedData.bmlReference || 'N/A'}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Total Amount:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {formatMVR(extractedData.totalAmountMvr)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Surface>

        {/* AI Match Suggestions & Proposals */}
        <Surface className="p-6 rounded-2xl border border-slate-800 bg-[#0a0f1d] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bot size={16} className="text-indigo-400" />
              <span>AI Multi-Factor Match Suggestions</span>
            </h3>
            <Badge variant="neutral">{suggestions.length} Matches Found</Badge>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {suggestions.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{s.matchedInvoiceNumber}</span>
                    <Badge variant={s.confidenceScore >= 95 ? 'positive' : 'warning'}>
                      {s.confidenceScore}% Match
                    </Badge>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm">{formatMVR(s.invoiceAmount)}</span>
                </div>

                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <div className="text-slate-400">
                    Entity: <span className="text-white font-bold">{s.customerOrVendorName}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-sans">{s.matchReason}</div>
                </div>

                <div className="flex justify-end pt-1">
                  {s.status === 'SUGGESTED' && (
                    <Button
                      variant="filled"
                      size="sm"
                      onClick={() => handleAcceptMatch(s.id)}
                      icon={<CheckCircle2 size={14} />}
                    >
                      <span>Accept & Auto-Reconcile</span>
                    </Button>
                  )}
                  {s.status === 'ACCEPTED' && (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold font-sans">
                      <CheckCircle2 size={14} />
                      <span>Reconciliation Proposal Created ✓</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
};
