import React, { useState } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';

interface ErrorModalProps {
  title: string;
  errorText: string;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  title,
  errorText,
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[580px] max-h-[85vh] flex flex-col bg-bg-panel border border-border-subtle rounded shadow-2xl p-5 text-xs text-fg-primary">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-full bg-red-500/10 text-red-400 shrink-0">
            <AlertCircle size={16} />
          </div>
          <div className="text-sm font-semibold tracking-tight text-fg-primary truncate">
            {title}
          </div>
        </div>

        <textarea
          readOnly
          value={errorText}
          className="flex-1 min-h-[220px] max-h-[380px] w-full bg-bg-input border border-border-subtle rounded p-3 text-fg-secondary font-mono text-[11px] leading-relaxed resize-none focus:outline-none select-text"
        />

        <div className="flex justify-between items-center pt-4 mt-2 border-t border-border-subtle/50">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copied to clipboard' : 'Copy details'}</span>
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
