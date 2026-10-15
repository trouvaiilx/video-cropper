import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Heart } from 'lucide-react';
import logoUrl from '../../../assets/logo.png';

interface AboutModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  const handleOpenLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = 'https://github.com/trouvaiilx/video-cropper';
    try {
      await invoke('open_url', { url });
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[380px] bg-bg-panel border border-border-subtle rounded shadow-2xl p-5 text-xs text-fg-primary text-center">
        <div className="flex justify-center mb-3">
          <img src={logoUrl} alt="Video Cropper" className="w-16 h-16 object-contain select-none" />
        </div>
        <div className="text-sm font-semibold tracking-tight text-fg-primary">Video Cropper</div>
        <div className="text-[11px] text-fg-muted mb-3">v0.2.0 (Rust + Tauri)</div>

        <p className="text-fg-secondary text-[11px] leading-relaxed mb-4 text-left">
          Minimalist, high-performance desktop utility for visually cropping video frames on
          Windows without re-encoding audio or degrading metadata.
        </p>

        <div className="text-[11px] text-fg-muted border-t border-border-subtle/50 pt-3 flex justify-between items-center">
          <span className="flex items-center gap-1 text-[11px] text-fg-muted">
            <span>Made with</span>
            <Heart size={12} className="text-red-500 fill-red-500 inline shrink-0" />
            <span>by</span>
            <a
              href="https://github.com/trouvaiilx/video-cropper"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenLink}
              className="underline hover:text-fg-primary text-fg-secondary transition-colors cursor-pointer"
            >
              trouvaiilx
            </a>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary text-xs font-medium tracking-tight transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
