export function formatSeconds(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || isNaN(seconds)) {
    return '--:--:--';
  }
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

export function formatClockPair(
  elapsed: number | undefined | null,
  total: number | undefined | null
): string {
  return `${formatSeconds(elapsed || 0)} / ${formatSeconds(total || 0)}`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${bytes.toLocaleString()} bytes`;
}

export function formatPlayerTime(seconds: number | undefined | null): string {
  const s = Math.max(0, seconds && isFinite(seconds) ? seconds : 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}
