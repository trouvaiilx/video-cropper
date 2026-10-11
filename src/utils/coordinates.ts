import { AspectRatio, CropConfig } from '../types';

export class PreviewMapping {
  constructor(
    public sourceW: number,
    public sourceH: number,
    public previewW: number,
    public previewH: number
  ) {}

  get scale(): number {
    if (this.sourceW <= 0 || this.previewW <= 0) return 1.0;
    return this.previewW / this.sourceW;
  }

  get invScale(): number {
    const s = this.scale;
    return s > 0 ? 1.0 / s : 1.0;
  }

  sourceToPreview(x: number, y: number, w: number, h: number) {
    const s = this.scale;
    return {
      x: x * s,
      y: y * s,
      width: w * s,
      height: h * s,
    };
  }

  previewToSource(x: number, y: number, w: number, h: number) {
    const inv = this.invScale;
    return {
      x: Math.round(x * inv),
      y: Math.round(y * inv),
      width: Math.round(w * inv),
      height: Math.round(h * inv),
    };
  }
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export const PRESET_RATIOS: AspectRatio[] = [
  { label: 'Free' },
  { label: '16:9', num: 16, den: 9 },
  { label: '9:16', num: 9, den: 16 },
  { label: '4:3', num: 4, den: 3 },
  { label: '3:4', num: 3, den: 4 },
  { label: '1:1', num: 1, den: 1 },
  { label: '4:5', num: 4, den: 5 },
  { label: '5:4', num: 5, den: 4 },
];

export function parseCustomRatio(text: string): AspectRatio | null {
  const t = (text || '').trim().toLowerCase().replace('/', ':');
  if (!t.includes(':')) return null;
  const parts = t.split(':');
  const num = parseFloat(parts[0]?.trim());
  const den = parseFloat(parts[1]?.trim());
  if (isNaN(num) || isNaN(den) || num <= 0 || den <= 0) return null;
  return {
    label: `${num}:${den}`,
    num,
    den,
  };
}

export function getRatioValue(ratio: AspectRatio): number | null {
  if (ratio.num && ratio.den && ratio.den > 0) {
    return ratio.num / ratio.den;
  }
  return null;
}

export function clampCrop(crop: CropConfig): CropConfig {
  const bw = crop.bound_w;
  const bh = crop.bound_h;
  const w = bw > 0 ? clamp(crop.width, 2, Math.max(2, bw)) : Math.max(2, crop.width);
  const h = bh > 0 ? clamp(crop.height, 2, Math.max(2, bh)) : Math.max(2, crop.height);
  const x = bw > 0 ? clamp(crop.x, 0, Math.max(0, bw - w)) : Math.max(0, crop.x);
  const y = bh > 0 ? clamp(crop.y, 0, Math.max(0, bh - h)) : Math.max(0, crop.y);

  return {
    x,
    y,
    width: w,
    height: h,
    bound_w: bw,
    bound_h: bh,
  };
}

export function applyAspectRatio(crop: CropConfig, ratio: AspectRatio): CropConfig {
  const val = getRatioValue(ratio);
  if (val === null || crop.width < 2 || crop.height < 2) {
    return clampCrop(crop);
  }

  const w = crop.width;
  const h = crop.height;
  const hFromW = w / val;

  let nw: number;
  let nh: number;

  if (hFromW <= h) {
    nw = w;
    nh = Math.round(hFromW);
  } else {
    nw = Math.round(h * val);
    nh = h;
  }

  nw = Math.max(2, nw);
  nh = Math.max(2, nh);

  const cx = crop.x + crop.width / 2.0;
  const cy = crop.y + crop.height / 2.0;

  const nx = Math.round(cx - nw / 2.0);
  const ny = Math.round(cy - nh / 2.0);

  return clampCrop({
    x: nx,
    y: ny,
    width: nw,
    height: nh,
    bound_w: crop.bound_w,
    bound_h: crop.bound_h,
  });
}

export const OUTPUT_PRESETS = [
  'Original Crop',
  '720p',
  '1080p',
  '1440p',
  '4K',
  'Custom',
] as const;

export function presetLongSide(preset: string): number | null {
  switch (preset) {
    case '720p':
      return 1280;
    case '1080p':
      return 1920;
    case '1440p':
      return 2560;
    case '4K':
      return 3840;
    default:
      return null;
  }
}

export function computeOutputSize(
  cropW: number,
  cropH: number,
  preset: string,
  customW: number = 0,
  customH: number = 0
): [number, number] {
  if (cropW < 2 || cropH < 2) return [0, 0];

  let w: number;
  let h: number;

  if (preset === 'Custom' && customW >= 2 && customH >= 2) {
    w = customW;
    h = customH;
  } else {
    const target = presetLongSide(preset);
    if (target === null) {
      w = cropW;
      h = cropH;
    } else {
      const longSide = Math.max(cropW, cropH);
      if (longSide <= 0) {
        w = cropW;
        h = cropH;
      } else {
        const factor = target / longSide;
        w = Math.max(2, Math.round(cropW * factor));
        h = Math.max(2, Math.round(cropH * factor));
      }
    }
  }

  // Snap even for yuv420
  w -= w % 2;
  h -= h % 2;
  return [Math.max(2, w), Math.max(2, h)];
}

export function isUpscale(cropW: number, cropH: number, outW: number, outH: number): boolean {
  return outW > cropW || outH > cropH;
}
