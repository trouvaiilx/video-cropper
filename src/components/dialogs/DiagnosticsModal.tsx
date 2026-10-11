import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface DiagnosticsModalProps {
  diagnosticsText: string;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  diagnosticsText,
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(diagnosticsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] h-[420px] flex flex-col bg-bg-panel border border-border-subtle rounded shadow-2xl p-5 text-xs text-fg-primary">
        <div className="text-sm font-semibold tracking-tight mb-3 text-fg-primary">Diagnostics</div>

        <textarea
          readOnly
          value={diagnosticsText}
          className="flex-1 w-full bg-bg-input border border-border-subtle rounded p-3 text-fg-secondary font-mono text-[11px] leading-relaxed resize-none focus:outline-none select-text"
        />

        <div className="flex justify-between items-center pt-4 mt-2 border-t border-border-subtle/50">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied to clipboard' : 'Copy to clipboard'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
