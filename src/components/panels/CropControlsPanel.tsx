import React, { useState, useEffect } from 'react';
import { AspectRatio, CropConfig } from '../../types';
import {
  PRESET_RATIOS,
  parseCustomRatio,
  clampCrop,
  applyAspectRatio,
} from '../../utils/coordinates';

interface CropControlsPanelProps {
  crop: CropConfig;
  selectedRatio: AspectRatio;
  disabled: boolean;
  onCropChange: (crop: CropConfig) => void;
  onRatioChange: (ratio: AspectRatio) => void;
}

export const CropControlsPanel: React.FC<CropControlsPanelProps> = ({
  crop,
  selectedRatio,
  disabled,
  onCropChange,
  onRatioChange,
}) => {
  const [isCustomRatio, setIsCustomRatio] = useState<boolean>(false);
  const [customRatioText, setCustomRatioText] = useState<string>('');

  useEffect(() => {
    const isPreset = PRESET_RATIOS.some((r) => r.label === selectedRatio.label);
    if (!isPreset) {
      setIsCustomRatio(true);
      setCustomRatioText(selectedRatio.label);
    } else {
      setIsCustomRatio(false);
    }
  }, [selectedRatio]);

  const handleRatioSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'Custom…') {
      setIsCustomRatio(true);
      return;
    }
    setIsCustomRatio(false);
    const found = PRESET_RATIOS.find((r) => r.label === val) || { label: 'Free' };
    onRatioChange(found);
    if (crop.width > 0 && crop.height > 0) {
      onCropChange(applyAspectRatio(crop, found));
    }
  };

  const handleCustomRatioBlur = () => {
    const parsed = parseCustomRatio(customRatioText);
    if (parsed) {
      onRatioChange(parsed);
      if (crop.width > 0 && crop.height > 0) {
        onCropChange(applyAspectRatio(crop, parsed));
      }
    } else {
      setCustomRatioText('');
    }
  };

  const handleSpinChange = (field: keyof CropConfig, value: number) => {
    const next = { ...crop, [field]: value };
    onCropChange(clampCrop(next));
  };

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        Crop
      </div>

      <div className="space-y-2.5">
        {/* Ratio Row */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <label className="text-fg-secondary w-14 shrink-0">Ratio:</label>
            <select
              value={isCustomRatio ? 'Custom…' : selectedRatio.label}
              onChange={handleRatioSelect}
              disabled={disabled}
              className="flex-1 bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs focus:outline-none focus:border-border-focus disabled:opacity-50"
            >
              {PRESET_RATIOS.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
              <option value="Custom…">Custom…</option>
            </select>
          </div>

          {isCustomRatio && (
            <div className="flex items-center gap-2 pl-16">
              <input
                type="text"
                placeholder="Custom W:H, e.g. 2.35:1"
                value={customRatioText}
                onChange={(e) => setCustomRatioText(e.target.value)}
                onBlur={handleCustomRatioBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomRatioBlur()}
                disabled={disabled}
                className="w-full bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs focus:outline-none focus:border-border-focus disabled:opacity-50"
              />
            </div>
          )}
        </div>

        {/* Spinboxes Form */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border-subtle/50">
          <div className="flex items-center gap-2">
            <span className="text-fg-secondary w-10">X:</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, crop.bound_w - 2)}
              value={crop.x}
              onChange={(e) => handleSpinChange('x', parseInt(e.target.value) || 0)}
              disabled={disabled}
              className="w-full bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-fg-secondary w-10">Y:</span>
            <input
              type="number"
              min={0}
              max={Math.max(0, crop.bound_h - 2)}
              value={crop.y}
              onChange={(e) => handleSpinChange('y', parseInt(e.target.value) || 0)}
              disabled={disabled}
              className="w-full bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-fg-secondary w-10">Width:</span>
            <input
              type="number"
              min={2}
              max={Math.max(2, crop.bound_w)}
              value={crop.width}
              onChange={(e) => handleSpinChange('width', parseInt(e.target.value) || 2)}
              disabled={disabled}
              className="w-full bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-fg-secondary w-10">Height:</span>
            <input
              type="number"
              min={2}
              max={Math.max(2, crop.bound_h)}
              value={crop.height}
              onChange={(e) => handleSpinChange('height', parseInt(e.target.value) || 2)}
              disabled={disabled}
              className="w-full bg-bg-input border border-border-subtle rounded px-2 py-1 text-fg-primary text-xs font-mono focus:outline-none focus:border-border-focus disabled:opacity-50"
            />
          </div>
        </div>

        {/* Readout info */}
        <div className="text-[11px] text-fg-secondary font-mono pt-1">
          {disabled ? (
            <span className="text-fg-muted font-sans">No video loaded.</span>
          ) : (
            <div>
              <div>Crop: {crop.width} × {crop.height}</div>
              <div>Position: X {crop.x}, Y {crop.y}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
