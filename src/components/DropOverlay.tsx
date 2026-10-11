import React from 'react';
import { Film } from 'lucide-react';

interface DropOverlayProps {
  isDragging: boolean;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-[3px] pointer-events-none transition-all duration-150 animate-in fade-in"
    >
      {/* Outer dashed perimeter framing the entire window UI */}
      <div className="absolute inset-3 sm:inset-4 rounded-lg border-2 border-dashed border-blue-500/75" />

      {/* Center drop zone target card */}
      <div className="relative flex flex-col items-center justify-center p-8 sm:p-10 border border-dashed border-blue-400/40 rounded-xl text-blue-400 bg-bg-panel/95 shadow-2xl max-w-md mx-4">
        <div className="p-3.5 rounded-full bg-blue-500/10 text-blue-400 mb-3">
          <Film size={36} className="animate-pulse" />
        </div>
        <div className="text-base font-semibold tracking-tight text-fg-primary">
          Drop video to open
        </div>
        <div className="text-xs text-fg-secondary mt-1 tracking-tight">
          Release anywhere in the window to load video
        </div>
        <div className="mt-4 px-2.5 py-1 rounded bg-bg-input border border-border-subtle text-[10px] text-fg-muted font-mono tracking-tight">
          MP4 · MKV · MOV · WebM · AVI · TS
        </div>
      </div>
    </div>
  );
};
