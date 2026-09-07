import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { Badge } from '../common/Badge';

export const StarqAICopilot: React.FC = () => {
  const {
    isAICopilotOpen,
    setIsAICopilotOpen,
    aiInsights,
    triggerAIInsightAction,
    setIsCreatePOOpen,
    setSelectedJobId,
  } = useERP();

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<
    { sender: 'ai' | 'user'; text: string; action?: { label: string; onClick: () => void } }[]
  >([
    {
      sender: 'ai',
      text: 'Salaam! I am starqAI, your embedded Maldives operational intelligence assistant. I monitor your cash flow, work order efficiency, GST obligations, and inventory in real-time. How can I assist your operations today?',
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  if (!isAICopilotOpen) return null;

  const handleSendMessage = (textToSend?: string) => {
    const q = textToSend || chatInput;
    if (!q.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { sender: 'user', text: q }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      let responseText = '';
      let action: { label: string; onClick: () => void } | undefined = undefined;

      const lower = q.toLowerCase();
      if (lower.includes('po') || lower.includes('clearcoat') || lower.includes('stock')) {
        responseText =
          'Identified stock risk: PPG High-Gloss Polyurethane Clearcoat (SKU: PNT-CLR-001) is down to 2 cans (reorder threshold is 5). Would you like me to open a draft Purchase Order for 10 cans from Male Paint Centre?';
        action = {
          label: 'Create Draft Purchase Order',
          onClick: () => {
            setIsCreatePOOpen(true);
            setIsAICopilotOpen(false);
          },
        };
      } else if (lower.includes('profit') || lower.includes('margin') || lower.includes('ign-0234')) {
        responseText =
          'Work Order IGN-0234 (Ahmed Rauf - Prado Repaint) quoted at MVR 48,500 has accrued MVR 9,970 in paint and clearcoat materials (+17.3% over estimate). However, due to solid labor efficiency, the job still maintains a 50.6% gross margin with MVR 24,530 net profit.';
        action = {
          label: 'Inspect Work Order Details',
          onClick: () => {
            setSelectedJobId('job-1');
            setIsAICopilotOpen(false);
          },
        };
      } else if (lower.includes('cash') || lower.includes('revenue') || lower.includes('today')) {
        responseText =
          'Today your team logged MVR 38,500 in sales. Total month-to-date revenue stands at MVR 173,700 against MVR 88,400 expenses, generating MVR 85,300 net operating surplus.';
      } else {
        responseText = `Analyzed your request for "${q}". Across your operational workspace, 4 active work orders are on track for customer handover this week, expecting MVR 38,500 cash collections.`;
      }

      setMessages((prev) => [...prev, { sender: 'ai', text: responseText, action }]);
      setIsTyping(false);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Scrim Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => setIsAICopilotOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer Surface */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="starqAI Copilot"
        className="relative w-full max-w-lg shadow-2xl flex flex-col h-full z-10 border-l animate-in slide-in-from-right duration-300"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          borderColor: 'var(--md-sys-color-outline-variant)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {/* Drawer Header */}
        <div
          className="p-5 border-b flex items-center justify-between"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--md-sys-color-primary)',
                color: 'var(--md-sys-color-on-primary)',
              }}
            >
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                  starqAI Copilot
                </h2>
                <Badge variant="info" size="sm">
                  Active
                </Badge>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Maldives ERP Intelligence Assistant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAICopilotOpen(false)}
            aria-label="Close starqAI Copilot"
            className="p-2 rounded-full hover:bg-[var(--md-sys-color-surface-container-highest)] transition-colors cursor-pointer text-[var(--md-sys-color-on-surface-variant)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Proactive Insights Banner */}
        <div
          className="p-4 border-b space-y-2.5"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-low)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              Automated Operations Intelligence
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ color: 'var(--md-sys-color-primary)' }}
            >
              {aiInsights.length} Key Insights
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {aiInsights.slice(0, 2).map((insight) => (
              <div
                key={insight.id}
                onClick={() => triggerAIInsightAction(insight)}
                className="p-2.5 rounded-[var(--md-sys-shape-corner-medium)] border cursor-pointer transition-all text-left group"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className="font-semibold"
                    style={{ color: 'var(--md-sys-color-primary)' }}
                  >
                    {insight.category}
                  </span>
                  <span
                    className="font-medium"
                    style={{ color: 'var(--md-sys-color-error)' }}
                  >
                    {insight.impact}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)] mt-1 line-clamp-1 group-hover:text-[var(--md-sys-color-primary)]">
                  {insight.title}
                </p>
                <span className="text-[10px] flex items-center gap-1 mt-1 font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  {insight.actionButtonLabel} →
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'ai' && (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  <Bot size={15} />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-[var(--md-sys-shape-corner-large)] px-4 py-3 leading-relaxed ${
                  m.sender === 'user' ? 'rounded-tr-none shadow-xs' : 'rounded-tl-none border'
                }`}
                style={
                  m.sender === 'user'
                    ? {
                        backgroundColor: 'var(--md-sys-color-primary)',
                        color: 'var(--md-sys-color-on-primary)',
                      }
                    : {
                        backgroundColor: 'var(--md-sys-color-surface)',
                        color: 'var(--md-sys-color-on-surface)',
                        borderColor: 'var(--md-sys-color-outline-variant)',
                      }
                }
              >
                <p>{m.text}</p>
                {m.action && (
                  <button
                    onClick={m.action.onClick}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--md-sys-shape-corner-small)] font-semibold text-[11px] transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    <span>{m.action.label}</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2.5 items-center text-[var(--md-sys-color-on-surface-variant)]">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                <Bot size={15} />
              </div>
              <div
                className="px-3 py-2 border rounded-xl flex items-center gap-1.5 text-[11px]"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <RefreshCw size={12} className="animate-spin text-[var(--md-sys-color-primary)]" />
                <span>Analyzing ERP data...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Suggested Prompts */}
        <div
          className="px-4 py-2 border-t"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              'Draft PO for low clearcoat',
              'Check overdue invoices',
              'Analyze IGN-0234 margin',
              'Summarize month revenue',
            ].map((p, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(p)}
                className="whitespace-nowrap px-2.5 py-1 rounded-[var(--md-sys-shape-corner-small)] text-[11px] border transition-colors shrink-0 cursor-pointer"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div
          className="p-4 flex gap-2 border-t"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Ask starqAI (e.g. 'Show margin on Prado repaint')..."
            style={{
              backgroundColor: 'var(--md-sys-color-surface)',
              color: 'var(--md-sys-color-on-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
              borderRadius: 'var(--md-sys-shape-corner-full)',
            }}
            className="flex-1 px-4 py-2 text-xs border outline-none focus:border-[var(--md-sys-color-primary)] placeholder:text-[var(--md-sys-color-on-surface-variant)]"
          />
          <button
            onClick={() => handleSendMessage()}
            style={{
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
              borderRadius: 'var(--md-sys-shape-corner-full)',
            }}
            className="px-4 py-2 font-semibold transition-colors shrink-0 cursor-pointer flex items-center justify-center"
            aria-label="Send query"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
