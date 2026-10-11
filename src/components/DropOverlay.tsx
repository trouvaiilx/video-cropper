import React from 'react';
import { Film } from 'lucide-react';

interface DropOverlayProps {
  isDragging: boolean;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg-dark/85 backdrop-blur-[2px] pointer-events-none transition-all duration-150">
      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-blue-500 rounded-lg text-blue-400 bg-blue-500/5">
        <Film size={44} className="mb-3 animate-pulse" />
        <div className="text-sm font-semibold tracking-tight text-fg-primary">Drop video file here</div>
        <div className="text-xs text-fg-secondary mt-1 tracking-tight">
          Supports MP4, MKV, MOV, WebM, AVI and more
        </div>
      </div>
    </div>
  );
};
