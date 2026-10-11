import React, { useState } from 'react';
import { ProgressUpdate } from '../../types';
import { formatClockPair, formatSeconds } from '../../utils/time';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ProgressPanelProps {
  isRunning: boolean;
  statusMessage: string;
  progress: ProgressUpdate | null;
  totalDuration: number;
  commandText: string;
  disabled: boolean;
  onStart: () => void;
  onCancel: () => void;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  isRunning,
  statusMessage,
  progress,
  totalDuration,
  commandText,
  disabled,
  onStart,
  onCancel,
}) => {
  const [showCmd, setShowCmd] = useState<boolean>(false);

  const percent = progress?.percent || 0;
  const speed = progress?.speed ? `${progress.speed.toFixed(1)}×` : '—';
  const eta = progress?.eta_seconds ? formatSeconds(progress.eta_seconds) : '—';
  const posSec = progress ? progress.out_time_ms / 1_000_000 : 0;

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        Process
      </div>

      <div className="space-y-2.5">
        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onStart}
            disabled={disabled || isRunning}
            className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded text-xs transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm"
            title="Crop and encode to output file (Ctrl+R)"
          >
            Start
          </button>
          <button
            onClick={onCancel}
            disabled={!isRunning}
            className="flex-1 py-1.5 px-3 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle text-fg-primary rounded text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Stop encoding and remove partial output"
          >
            Cancel
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-bg-input rounded-full h-2 overflow-hidden border border-border-subtle/40">
          <div
            className="bg-blue-500 h-full transition-all duration-150 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>

        {/* Status Text */}
        <div className="text-[11px] text-fg-secondary font-mono leading-relaxed">
          {isRunning && progress ? (
            <div>
              {percent.toFixed(1)}% · {formatClockPair(posSec, totalDuration)}
              <br />
              Speed {speed} · ETA {eta}
            </div>
          ) : (
            <div className="text-fg-muted font-sans">{statusMessage}</div>
          )}
        </div>

        {/* Command line toggle */}
        {commandText && (
          <div className="pt-1 border-t border-border-subtle/50">
            <button
              onClick={() => setShowCmd(!showCmd)}
              className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg-secondary transition-colors"
            >
              {showCmd ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Command line</span>
            </button>
            {showCmd && (
              <div className="mt-1.5 p-2 bg-bg-input/60 rounded border border-border-subtle text-[10px] font-mono text-fg-muted select-text break-all max-h-24 overflow-y-auto">
                {commandText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
