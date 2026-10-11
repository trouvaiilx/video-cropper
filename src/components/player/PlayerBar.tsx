import React, { useEffect, useRef, useState } from 'react';
import { Crop, Pause, Play, StepBack, StepForward } from 'lucide-react';
import { PlaybackKind, PlaybackStatus } from '../../utils/playback';
import { formatPlayerTime } from '../../utils/time';

interface PlayerBarProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: PlaybackStatus;
  kind: PlaybackKind | null;
  duration: number;
  fps: number;
  cropView: boolean;
  hasVideo: boolean;
  shortcutsEnabled: boolean;
  onToggleCropView: () => void;
}

const iconBtn =
  'p-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary transition-colors disabled:opacity-40 disabled:hover:bg-bg-input';

export const PlayerBar: React.FC<PlayerBarProps> = ({
  videoRef,
  status,
  kind,
  duration,
  fps,
  cropView,
  hasVideo,
  shortcutsEnabled,
  onToggleCropView,
}) => {
  const ready = status === 'ready';
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(0);

  const total = duration > 0 ? duration : videoRef.current?.duration || 0;
  const frameDt = 1 / (fps > 0 ? fps : 30);

  // Mirror the video element's state. The rAF loop only runs while playing and
  // only commits React state when the clock moved by >= 1/20 s.
  useEffect(() => {
    const v = videoRef.current;
    if (!ready || !v) {
      setPlaying(false);
      setTime(0);
      return;
    }

    let last = -1;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (Math.abs(v.currentTime - last) >= 0.05) {
        last = v.currentTime;
        setTime(v.currentTime);
      }
    };
    const stop = () => cancelAnimationFrame(rafRef.current);
    const onPlay = () => {
      setPlaying(true);
      stop();
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      stop();
      setTime(v.currentTime);
    };
    const onSeek = () => setTime(v.currentTime);

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeek);
    setTime(v.currentTime);
    setPlaying(!v.paused);
    if (!v.paused) onPlay();

    return () => {
      stop();
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeek);
    };
  }, [ready, videoRef]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!ready || !v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!ready || !v) return;
    const max = Math.max(0, (v.duration || total) - 0.001);
    v.currentTime = Math.min(Math.max(0, t), max);
    setTime(v.currentTime);
  };

  const step = (frames: number) => {
    const v = videoRef.current;
    if (!ready || !v) return;
    v.pause();
    seekTo(v.currentTime + frames * frameDt);
  };

  // Keyboard: Space play/pause, ←/→ one frame, Shift+←/→ one second.
  useEffect(() => {
    if (!ready || !shortcutsEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        const type = tag === 'INPUT' ? (el as HTMLInputElement).type : '';
        const typing =
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          el.isContentEditable ||
          (tag === 'INPUT' && type !== 'range' && type !== 'checkbox' && type !== 'button');
        if (typing) return;
      }

      const v = videoRef.current;
      if (!v) return;

      if (e.key === ' ') {
        // preventDefault on keydown also stops a focused button from "clicking".
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) {
          seekTo(v.currentTime + dir);
        } else {
          step(dir);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pct = total > 0 ? Math.min(100, (time / total) * 100) : 0;

  let hint: string | null = null;
  if (status === 'preparing') hint = 'Preparing preview…';
  else if (status === 'unavailable') hint = 'Playback unavailable for this file';
  else if (ready && kind === 'proxy') hint = 'Low-res proxy';

  return (
    <div className="h-10 shrink-0 flex items-center gap-1.5 px-3 border-t border-border-subtle bg-bg-panel text-xs select-none">
      <button
        onClick={() => step(-1)}
        disabled={!ready}
        className={iconBtn}
        title="Previous frame (←)"
      >
        <StepBack size={14} className="text-fg-secondary" />
      </button>

      <button
        onClick={togglePlay}
        disabled={!ready}
        className={iconBtn}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? (
          <Pause size={14} className="text-fg-secondary" />
        ) : (
          <Play size={14} className="text-fg-secondary" />
        )}
      </button>

      <button
        onClick={() => step(1)}
        disabled={!ready}
        className={iconBtn}
        title="Next frame (→)"
      >
        <StepForward size={14} className="text-fg-secondary" />
      </button>

      <span className="font-mono text-[11px] text-fg-muted min-w-[92px] text-center">
        {formatPlayerTime(time)} / {formatPlayerTime(total)}
      </span>

      <input
        type="range"
        className="seek flex-1 min-w-0"
        min={0}
        max={total > 0 ? total : 1}
        step={frameDt}
        value={Math.min(time, total > 0 ? total : 1)}
        disabled={!ready || total <= 0}
        style={{ ['--p' as string]: `${pct}%` }}
        onChange={(e) => seekTo(parseFloat(e.target.value))}
        onPointerUp={(e) => e.currentTarget.blur()}
        title="Seek"
      />

      {hint && <span className="text-[11px] text-fg-muted shrink-0">{hint}</span>}

      <button
        onClick={onToggleCropView}
        disabled={!hasVideo}
        className={`flex items-center gap-1.5 px-2 py-1 border rounded transition-colors disabled:opacity-40 ${
          cropView
            ? 'bg-bg-hover text-fg-primary border-border-focus'
            : 'bg-bg-input text-fg-secondary hover:bg-bg-hover border-border-subtle'
        }`}
        title="Show only the cropped area, as it will be exported"
      >
        <Crop size={14} />
        <span>Crop view</span>
      </button>
    </div>
  );
};
