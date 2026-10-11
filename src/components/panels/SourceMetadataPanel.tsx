import React from 'react';
import { VideoMetadata } from '../../types';
import { formatFileSize, formatSeconds } from '../../utils/time';

interface SourceMetadataPanelProps {
  meta: VideoMetadata | null;
}

export const SourceMetadataPanel: React.FC<SourceMetadataPanelProps> = ({ meta }) => {
  const filename = meta?.path ? meta.path.split(/[/\\]/).pop() || '' : '—';

  return (
    <div className="border border-border-subtle rounded bg-bg-panel p-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
        Source
      </div>
      <div className="space-y-1.5 select-text">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">File:</span>
          <span
            className="text-fg-primary truncate font-mono text-[11px]"
            title={meta?.path || ''}
          >
            {filename}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">Frame:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta
              ? `${meta.display_width} × ${meta.display_height}${
                  meta.rotation ? ` (${meta.rotation}°)` : ''
                }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">Duration:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta
              ? `${formatSeconds(meta.duration)} · ${
                  meta.fps ? `${meta.fps.toFixed(2)} fps` : 'unknown fps'
                }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">Video:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta
              ? `${meta.video_codec || 'unknown'}${
                  meta.bit_depth !== 8 ? `, ${meta.bit_depth}-bit` : ''
                }`
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">Audio:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta
              ? meta.audio_codec || (meta.has_audio ? 'present' : 'none')
              : '—'}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <span className="text-fg-secondary w-16 shrink-0">Size:</span>
          <span className="text-fg-primary font-mono text-[11px]">
            {meta ? formatFileSize(meta.file_size) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
