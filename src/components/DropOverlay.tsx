import React from 'react';
import { Film, AlertTriangle } from 'lucide-react';

interface DropOverlayProps {
  isDragging: boolean;
  isValid?: boolean | null;
  fileName?: string;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({
  isDragging,
  isValid = null,
  fileName,
}) => {
  if (!isDragging) return null;

  const isInvalid = isValid === false;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/80 backdrop-blur-[3px] pointer-events-none transition-all duration-150 animate-in fade-in"
    >
      {/* Outer dashed perimeter framing the entire window UI */}
      <div
        className={`absolute inset-3 sm:inset-4 rounded-lg border-2 border-dashed transition-colors duration-200 ${
          isInvalid
            ? 'border-amber-500/75 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
            : 'border-blue-500/75 shadow-[0_0_24px_rgba(59,130,246,0.12)]'
        }`}
      />

      {/* Center drop zone target card */}
      <div
        className={`relative flex flex-col items-center justify-center p-8 sm:p-10 border border-dashed rounded-xl bg-bg-panel/95 shadow-2xl max-w-md mx-4 transition-colors duration-200 ${
          isInvalid ? 'border-amber-400/40 text-amber-400' : 'border-blue-400/40 text-blue-400'
        }`}
      >
        <div
          className={`p-3.5 rounded-full mb-3 ${
            isInvalid ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
          }`}
        >
          {isInvalid ? (
            <AlertTriangle size={36} className="animate-pulse" />
          ) : (
            <Film size={36} className="animate-pulse" />
          )}
        </div>
        <div className="text-base font-semibold tracking-tight text-fg-primary text-center">
          {isInvalid ? 'Not a video file' : 'Drop video to open'}
        </div>
        <div className="text-xs text-fg-secondary mt-1 tracking-tight text-center max-w-xs truncate">
          {isInvalid
            ? fileName
              ? `"${fileName}" is not recognized as a video`
              : 'Please drop a video file instead'
            : fileName
              ? `Ready to open "${fileName}"`
              : 'Release anywhere in the window to load video'}
        </div>
        <div className="mt-4 px-2.5 py-1 rounded bg-bg-input border border-border-subtle text-[10px] text-fg-muted font-mono tracking-tight">
          MP4 · MKV · MOV · WebM · AVI · TS · M4V · WMV
        </div>
      </div>
    </div>
  );
};

