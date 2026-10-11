import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOverwriteModalProps {
  filePath: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmOverwriteModal: React.FC<ConfirmOverwriteModalProps> = ({
  filePath,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] bg-bg-panel border border-border-subtle rounded shadow-2xl p-5 text-xs text-fg-primary">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-fg-primary mb-1">Output Exists</div>
            <div className="text-fg-secondary text-xs leading-relaxed select-text font-mono break-all">
              “{filePath}” already exists.
            </div>
            <div className="text-fg-primary text-xs mt-2 font-medium">
              Do you want to overwrite it?
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle/50">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs transition-colors"
          >
            No
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-medium rounded text-xs transition-colors shadow-sm"
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
};
