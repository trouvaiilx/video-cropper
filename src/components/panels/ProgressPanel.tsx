import React, { useState } from 'react';
import { ProgressUpdate } from '../../types';
import { formatClockPair, formatSeconds } from '../../utils/time';
import { ChevronDown, ChevronRight, ChevronUp, Play, X } from 'lucide-react';

interface ProgressPanelProps {
  isRunning: boolean;
  isCancelling?: boolean;
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
  isCancelling = false,
  statusMessage,
  progress,
  totalDuration,
  commandText,
  disabled,
  onStart,
  onCancel,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showCmd, setShowCmd] = useState<boolean>(false);

  const percent = progress?.percent || 0;
  const speed = progress?.speed ? `${progress.speed.toFixed(1)}×` : '—';
  const eta = progress?.eta_seconds ? formatSeconds(progress.eta_seconds) : '—';
  const posSec = progress ? progress.out_time_ms / 1_000_000 : 0;

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-2.5 text-xs overflow-hidden transition-all duration-150">
      {!isExpanded ? (
        /* Collapsed State (Default upon starting) */
        <div className="space-y-1.5">
          {isRunning && (
            <div className="w-full bg-bg-input rounded-full h-1.5 overflow-hidden border border-border-subtle/40">
              <div
                className="bg-blue-500 h-full transition-all duration-150 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {isRunning ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="flex-1 py-1.5 px-3 bg-red-500/15 hover:bg-red-500/25 active:bg-red-500/30 text-red-400 border border-red-500/30 font-medium tracking-tight rounded text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Stop encoding and remove partial output"
              >
                <X size={13} />
                <span>
                  {isCancelling ? 'Cancelling…' : progress ? `Cancel (${percent.toFixed(0)}%)` : 'Cancel'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStart}
                disabled={disabled || isCancelling}
                className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium tracking-tight rounded text-xs transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-1.5"
                title="Crop and encode to output file (Ctrl+R)"
              >
                <Play size={11} fill="currentColor" />
                <span>Export</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="p-1.5 h-[29px] w-8 flex items-center justify-center bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle text-fg-secondary hover:text-fg-primary rounded text-xs transition-colors shrink-0"
              title="Expand process details"
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded State: Full process details */
        <div className="space-y-2.5">
          {/* Action Row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onStart}
              disabled={disabled || isRunning || isCancelling}
              className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium tracking-tight rounded text-xs transition-colors disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center gap-1.5"
              title="Crop and encode to output file (Ctrl+R)"
            >
              <Play size={11} fill="currentColor" />
              <span>Export</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={!isRunning || isCancelling}
              className="flex-1 py-1.5 px-3 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle text-fg-primary font-medium tracking-tight rounded text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
              title="Stop encoding and remove partial output"
            >
              <span>{isCancelling ? 'Cancelling…' : 'Cancel'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1.5 h-[29px] w-8 flex items-center justify-center bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle text-fg-secondary hover:text-fg-primary rounded text-xs transition-colors shrink-0"
              title="Collapse process panel"
            >
              <ChevronDown size={14} />
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
          <div className="text-[11px] text-fg-secondary font-mono tabular-nums leading-relaxed min-w-0">
            {isCancelling ? (
              <div className="text-amber-400 font-medium animate-pulse">
                Cancelling… Cleaning up partial output.
              </div>
            ) : isRunning && progress ? (
              <div>
                {percent.toFixed(1)}% · {formatClockPair(posSec, totalDuration)}
                <br />
                Speed {speed} · ETA {eta}
              </div>
            ) : (
              <div
                className="text-fg-muted break-words break-all line-clamp-2"
                title={statusMessage}
              >
                {statusMessage}
              </div>
            )}
          </div>

          {/* Command line toggle */}
          {commandText && (
            <div className="pt-1 border-t border-border-subtle/50">
              <button
                type="button"
                onClick={() => setShowCmd(!showCmd)}
                className="flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg-secondary transition-colors"
              >
                {showCmd ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Command line</span>
              </button>
              {showCmd && (
                <div className="mt-1.5 p-2 bg-bg-input/60 rounded border border-border-subtle text-[10px] font-mono text-fg-muted select-text break-all max-h-24 overflow-y-auto leading-relaxed">
                  {commandText}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
