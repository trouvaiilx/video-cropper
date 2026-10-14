/** Playback helpers for the in-app preview player (native <video>, no extra libs). */

export type PlaybackStatus = 'none' | 'preparing' | 'ready' | 'unavailable';
export type PlaybackKind = 'native' | 'proxy';

export interface PlaybackState {
  status: PlaybackStatus;
  kind: PlaybackKind | null;
}

export const NO_PLAYBACK: PlaybackState = { status: 'none', kind: null };

/** Same frame the still preview was extracted from (mirrors `preview_seek_time` in Rust). */
export function previewSeekTime(duration: number): number {
  if (!(duration > 0)) return 1.0;
  return Math.min(Math.max(duration * 0.1, 0.5), 10.0);
}

/** Fully release the decoder/file handle held by the shared <video>. */
export function resetVideo(video: HTMLVideoElement): void {
  video.pause();
  video.muted = true;
  video.removeAttribute('src');
  video.load();
}

/**
 * Loads `url` into `video`, parks it on `startTime`, and resolves true only if
 * the webview can actually decode video frames from it with the expected
 * geometry. Resolves false on decode errors, audio-only results (no video
 * track decoded), aspect mismatches (e.g. unapplied rotation) or timeout, so
 * the caller can fall back to a proxy.
 */
export function attachSource(
  video: HTMLVideoElement,
  url: string,
  startTime: number,
  expectedAspect: number,
  timeoutMs = 12000
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    video.muted = true;

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('error', onError);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('seeked', onSeeked);
    };
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    const onError = () => finish(false);
    const onSeeked = () => finish(true);
    const onLoaded = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return finish(false);

      if (expectedAspect > 0) {
        const aspect = w / h;
        if (Math.abs(aspect - expectedAspect) / expectedAspect > 0.05) return finish(false);
      }

      const target = Math.min(startTime, Math.max(0, (video.duration || startTime) - 0.05));
      if (target > 0.01) {
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = target;
      } else {
        finish(true);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener('error', onError);
    video.addEventListener('loadeddata', onLoaded, { once: true });
    video.src = url;
    video.load();
  });
}
