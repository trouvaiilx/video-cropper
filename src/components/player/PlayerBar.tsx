import React, { useEffect, useRef, useState } from 'react';
import { Crop, Pause, Play, StepBack, StepForward, Volume1, Volume2, VolumeX } from 'lucide-react';
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
  hasAudio?: boolean;
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
  hasAudio = false,
  shortcutsEnabled,
  onToggleCropView,
}) => {
  const ready = status === 'ready';
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef(0);

  // Audio state with local storage persistence
  const [userMuted, setUserMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('video_cropper_muted') === 'true';
    } catch {
      return false;
    }
  });

  const [volume, setVolume] = useState<number>(() => {
    try {
      const v = localStorage.getItem('video_cropper_volume');
      if (v !== null) {
        const parsed = parseFloat(v);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch {}
    return 1;
  });

  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const userMutedRef = useRef(userMuted);
  userMutedRef.current = userMuted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const hasAudioRef = useRef(hasAudio);
  hasAudioRef.current = hasAudio;

  const total = duration > 0 ? duration : videoRef.current?.duration || 0;
  const frameDt = 1 / (fps > 0 ? fps : 30);

  // Audio synchronization rule:
  // Video element audio is ONLY unmuted when actively playing and NOT scrubbing.
  // When paused, scrubbing, stepping, or muted by user, v.muted is strictly true.
  const syncAudio = (forceMute?: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volumeRef.current;

    const shouldMute =
      forceMute ??
      (!hasAudioRef.current ||
        userMutedRef.current ||
        volumeRef.current === 0 ||
        v.paused ||
        isScrubbingRef.current);

    v.muted = shouldMute;
  };

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
      if (!isScrubbingRef.current) {
        syncAudio(false);
      }
    };
    const onPause = () => {
      setPlaying(false);
      stop();
      setTime(v.currentTime);
      syncAudio(true);
    };
    const onSeek = () => {
      setTime(v.currentTime);
      if (isScrubbingRef.current || v.paused) {
        syncAudio(true);
      }
    };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeek);
    setTime(v.currentTime);
    setPlaying(!v.paused);
    syncAudio(v.paused || isScrubbingRef.current);
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
    if (v.paused) {
      syncAudio(false);
      void v.play().catch(() => {});
    } else {
      v.pause();
      syncAudio(true);
    }
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
    syncAudio(true);
    v.pause();
    seekTo(v.currentTime + frames * frameDt);
  };

  const handleSeekPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!ready) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    isScrubbingRef.current = true;
    const v = videoRef.current;
    if (v) {
      wasPlayingRef.current = !v.paused;
      syncAudio(true);
      if (!v.paused) {
        v.pause();
      }
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const v = videoRef.current;
    if (v) {
      syncAudio(true);
    }
    seekTo(val);
  };

  const handleSeekPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    e.currentTarget.blur();
    isScrubbingRef.current = false;

    const v = videoRef.current;
    if (!ready || !v) return;

    if (wasPlayingRef.current) {
      syncAudio(false);
      void v.play().catch(() => {});
    } else {
      syncAudio(true);
    }
    wasPlayingRef.current = false;
  };

  const toggleMute = () => {
    if (!hasAudio) return;
    setUserMuted((prev) => {
      const next = !prev;
      userMutedRef.current = next;
      try {
        localStorage.setItem('video_cropper_muted', String(next));
      } catch {}
      const v = videoRef.current;
      if (v) {
        if (next || v.paused || isScrubbingRef.current) {
          syncAudio(true);
        } else {
          syncAudio(false);
        }
      }
      return next;
    });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Math.max(0, Math.min(1, parseFloat(e.target.value)));
    setVolume(newVol);
    volumeRef.current = newVol;
    try {
      localStorage.setItem('video_cropper_volume', String(newVol));
    } catch {}

    const v = videoRef.current;
    if (v) {
      v.volume = newVol;
      if (userMuted && newVol > 0) {
        setUserMuted(false);
        userMutedRef.current = false;
        try {
          localStorage.setItem('video_cropper_muted', 'false');
        } catch {}
      }
      syncAudio(v.paused || isScrubbingRef.current || newVol === 0);
    }
  };

  // Keyboard: Space play/pause, ←/→ one frame, Shift+←/→ one second, M mute/unmute.
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
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.shiftKey) {
          syncAudio(true);
          v.pause();
          seekTo(v.currentTime + dir);
        } else {
          step(dir);
        }
      } else if ((e.key === 'm' || e.key === 'M') && hasAudio) {
        e.preventDefault();
        toggleMute();
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
    <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-t border-border-subtle bg-bg-panel text-xs select-none">
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

      {/* Audio controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!ready || !hasAudio}
          className={iconBtn}
          title={
            !hasAudio
              ? 'No audio stream in video'
              : userMuted || volume === 0
              ? 'Unmute (M)'
              : 'Mute (M)'
          }
        >
          {!hasAudio ? (
            <VolumeX size={14} className="text-fg-muted opacity-40" />
          ) : userMuted || volume === 0 ? (
            <VolumeX size={14} className="text-amber-400" />
          ) : volume < 0.5 ? (
            <Volume1 size={14} className="text-fg-secondary" />
          ) : (
            <Volume2 size={14} className="text-fg-secondary" />
          )}
        </button>

        {hasAudio && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={userMuted ? 0 : volume}
            onChange={handleVolumeChange}
            disabled={!ready}
            className="vol-slider w-14 shrink-0"
            style={{ ['--vp' as string]: `${Math.round((userMuted ? 0 : volume) * 100)}%` }}
            title={`Volume: ${Math.round((userMuted ? 0 : volume) * 100)}%`}
          />
        )}
      </div>

      <span className="font-mono tabular-nums text-[11px] text-fg-secondary min-w-[96px] text-center tracking-tight">
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
        onPointerDown={handleSeekPointerDown}
        onChange={handleSeekChange}
        onPointerUp={handleSeekPointerUp}
        onPointerCancel={handleSeekPointerUp}
        title="Seek"
      />

      {hint && <span className="text-[11px] text-fg-muted shrink-0">{hint}</span>}

      <button
        onClick={onToggleCropView}
        disabled={!hasVideo}
        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded text-xs font-medium tracking-tight transition-colors disabled:opacity-40 ${
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
