export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export function hexToRGB(hex: string): RGBColor {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: 0, g: 0, b: 0 };
  }

  return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => {
    const clamped = Math.max(0, Math.min(255, value));
    const hex = clamped.toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function adjustColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRGB(hex);
  const factor = percent / 100;

  const adjust = (value: number) => {
    if (factor >= 0) {
      return Math.round(value + (255 - value) * factor);
    }
    return Math.round(value * (1 + factor));
  };

  return rgbToHex(adjust(r), adjust(g), adjust(b));
}

export function addAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRGB(hex);
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRGB(hex);
  const transform = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const [rs, gs, bs] = [r, g, b].map(transform);
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastColor(hex: string): string {
  const luminance = getRelativeLuminance(hex);
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
