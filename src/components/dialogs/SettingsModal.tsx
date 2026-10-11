import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SettingsModalProps {
  ffmpegPath: string;
  ffprobePath: string;
  onSave: (ffmpeg: string, ffprobe: string) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  ffmpegPath,
  ffprobePath,
  onSave,
  onClose,
}) => {
  const [ff, setFf] = useState<string>(ffmpegPath);
  const [fp, setFp] = useState<string>(ffprobePath);

  const handleBrowse = async (type: 'ffmpeg' | 'ffprobe') => {
    try {
      const selected = await invoke<string | null>('select_exe_file', {
        title: `Locate ${type} executable`,
      });
      if (selected) {
        if (type === 'ffmpeg') setFf(selected);
        else setFp(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[460px] bg-bg-panel border border-border-subtle rounded shadow-2xl p-5 text-xs text-fg-primary">
        <div className="text-sm font-semibold tracking-tight mb-4 text-fg-primary">Settings</div>

        <div className="space-y-3.5 mb-5">
          <div>
            <label className="block text-fg-secondary text-[11px] mb-1">ffmpeg executable:</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="system PATH"
                value={ff}
                onChange={(e) => setFf(e.target.value)}
                className="flex-1 bg-bg-input border border-border-subtle rounded px-2.5 py-1.5 text-fg-primary text-xs font-mono tracking-tight focus:outline-none focus:border-border-focus"
              />
              <button
                onClick={() => handleBrowse('ffmpeg')}
                className="px-3 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight shrink-0 transition-colors"
              >
                Browse…
              </button>
            </div>
          </div>

          <div>
            <label className="block text-fg-secondary text-[11px] mb-1">ffprobe executable:</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="system PATH"
                value={fp}
                onChange={(e) => setFp(e.target.value)}
                className="flex-1 bg-bg-input border border-border-subtle rounded px-2.5 py-1.5 text-fg-primary text-xs font-mono tracking-tight focus:outline-none focus:border-border-focus"
              />
              <button
                onClick={() => handleBrowse('ffprobe')}
                className="px-3 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight shrink-0 transition-colors"
              >
                Browse…
              </button>
            </div>
          </div>

          <div className="text-[11px] text-fg-muted leading-relaxed">
            Leave empty to use system PATH. Custom paths override PATH and bundled executables.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle/50">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(ff.trim(), fp.trim());
              onClose();
            }}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium tracking-tight rounded text-xs transition-colors shadow-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
