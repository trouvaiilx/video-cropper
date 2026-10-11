import React from 'react';
import { EncoderInfo } from '../../types';
import { OUTPUT_PRESETS, isUpscale } from '../../utils/coordinates';

interface OutputControlsPanelProps {
  preset: string;
  outputW: number;
  outputH: number;
  cropW: number;
  cropH: number;
  encoders: EncoderInfo[];
  selectedEncoder: string;
  outputPath: string;
  disabled: boolean;
  onPresetChange: (preset: string) => void;
  onSizeChange: (w: number, h: number) => void;
  onEncoderChange: (encoder: string) => void;
  onPathChange: (path: string) => void;
  onBrowse: () => void;
}

export const OutputControlsPanel: React.FC<OutputControlsPanelProps> = ({
  preset,
  outputW,
  outputH,
  cropW,
  cropH,
  encoders,
  selectedEncoder,
  outputPath,
  disabled,
  onPresetChange,
  onSizeChange,
  onEncoderChange,
  onPathChange,
  onBrowse,
}) => {
  const isUp = cropW >= 2 && cropH >= 2 && isUpscale(cropW, cropH, outputW, outputH);

  const handleWidthChange = (val: number) => {
    let w = Math.max(2, val);
    w -= w % 2;
    onSizeChange(w, outputH);
    if (preset !== 'Custom') {
      onPresetChange('Custom');
    }
  };

  const handleHeightChange = (val: number) => {
    let h = Math.max(2, val);
    h -= h % 2;
    onSizeChange(outputW, h);
    if (preset !== 'Custom') {
      onPresetChange('Custom');
    }
  };

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        Output
      </div>

      <div className="space-y-2.5">
        {/* Preset & Size */}
        <div className="flex items-center gap-2">
          <label className="text-fg-secondary w-14 shrink-0">Size:</label>
          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value)}
            disabled={disabled}
            className="flex-1 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs focus:outline-none focus:border-border-focus disabled:opacity-50"
          >
            {OUTPUT_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Pixel Dimensions */}
        <div className="flex items-center gap-2">
          <label className="text-fg-secondary w-14 shrink-0">Pixels:</label>
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="number"
              min={2}
              max={16384}
              value={outputW}
              onChange={(e) => handleWidthChange(parseInt(e.target.value) || 2)}
              disabled={disabled}
              className="w-20 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
            <span className="text-fg-muted">×</span>
            <input
              type="number"
              min={2}
              max={16384}
              value={outputH}
              onChange={(e) => handleHeightChange(parseInt(e.target.value) || 2)}
              disabled={disabled}
              className="w-20 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
          </div>
        </div>

        {/* Encoder */}
        <div className="flex items-center gap-2">
          <label className="text-fg-secondary w-14 shrink-0">Encoder:</label>
          <select
            value={selectedEncoder}
            onChange={(e) => onEncoderChange(e.target.value)}
            disabled={disabled}
            className="flex-1 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs focus:outline-none focus:border-border-focus disabled:opacity-50"
          >
            {encoders.map((enc) => (
              <option key={enc.id} value={enc.id} disabled={!enc.available}>
                {enc.label} {!enc.available ? '(unavailable)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Output Path */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Output file…"
            value={outputPath}
            onChange={(e) => onPathChange(e.target.value)}
            disabled={disabled}
            className="flex-1 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50 truncate"
          />
          <button
            onClick={onBrowse}
            disabled={disabled}
            className="px-2.5 py-1 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs shrink-0 transition-colors disabled:opacity-50"
          >
            Browse…
          </button>
        </div>

        {/* Notes & Upscale Warning */}
        <div className="pt-1">
          {isUp ? (
            <div className="text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded p-1.5 leading-normal">
              Upscaling {cropW}×{cropH} → {outputW}×{outputH}. Quality will not improve.
            </div>
          ) : (
            <div className="text-[11px] text-fg-muted">
              Audio is copied without re-encoding when present.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
