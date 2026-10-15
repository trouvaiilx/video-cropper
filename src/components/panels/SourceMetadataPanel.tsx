import React from 'react';
import { VideoMetadata } from '../../types';
import { formatFileSize, formatSeconds } from '../../utils/time';

interface SourceMetadataPanelProps {
  meta: VideoMetadata | null;
  userRotation?: number;
}

export const SourceMetadataPanel: React.FC<SourceMetadataPanelProps> = ({ meta, userRotation = 0 }) => {
  const filename = meta?.path ? meta.path.split(/[/\\]/).pop() || '' : '—';
  const isRotated90or270 = userRotation === 90 || userRotation === 270;
  const currentW = meta ? (isRotated90or270 ? meta.display_height : meta.display_width) : 0;
  const currentH = meta ? (isRotated90or270 ? meta.display_width : meta.display_height) : 0;

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-3 text-xs overflow-hidden">
      <div className="text-[10px] font-medium uppercase tracking-section text-fg-muted mb-2.5">
        Source
      </div>
      <div className="space-y-1.5 select-text">
        <div className="flex justify-between items-baseline gap-2 min-w-0">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">File:</span>
          <span
            className="text-fg-primary truncate min-w-0 text-[11px] font-mono tracking-tight"
            title={meta?.path || ''}
          >
            {filename}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">Frame:</span>
          <span className="text-fg-primary font-mono text-[11px] tabular-nums">
            {meta
              ? userRotation !== 0
                ? `${currentW} × ${currentH} (rotated +${userRotation}°)`
                : `${meta.display_width} × ${meta.display_height}${
                    meta.rotation ? ` (${meta.rotation}°)` : ''
                  }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">Duration:</span>
          <span className="text-fg-primary font-mono text-[11px] tabular-nums">
            {meta
              ? `${formatSeconds(meta.duration)} · ${
                  meta.fps ? `${meta.fps.toFixed(2)} fps` : 'unknown fps'
                }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">Video:</span>
          <span className="text-fg-primary font-mono text-[11px] tabular-nums">
            {meta
              ? `${meta.video_codec || 'unknown'}${
                  meta.bit_depth !== 8 ? `, ${meta.bit_depth}-bit` : ''
                }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">Audio:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta
              ? meta.audio_codec || (meta.has_audio ? 'present' : 'none')
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary text-[11px] w-16 shrink-0">Size:</span>
          <span className="text-fg-primary font-mono text-[11px] tabular-nums">
            {meta ? formatFileSize(meta.file_size) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
