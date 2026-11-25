// SVG → PNG in the browser (V2 exportDiagram L442 area): the SVG is drawn into a canvas at
// 1× / 2× / 3×; pictures over 16000 px a side or 64 Mpx are refused (V2 limits).
import { ExportError } from './errors';

export const PNG_SCALES = [1, 2, 3] as const;
export const PNG_LIMITS = Object.freeze({ side: 16000, pixels: 64_000_000 });

export function pngSize(width: number, height: number, scale: number): { width: number; height: number } {
  const w = Math.ceil(width * scale), hh = Math.ceil(height * scale);
  if (w > PNG_LIMITS.side || hh > PNG_LIMITS.side || w * hh > PNG_LIMITS.pixels) throw new ExportError('too-large');
  return { width: w, height: hh };
}

export async function svgToPng(source: string, width: number, height: number, scale = 1, doc: Document = document): Promise<Blob> {
  const size = pngSize(width, height, scale);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ExportError('image'));
      image.src = url;
    });
    if ('fonts' in doc) await doc.fonts.ready;
    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ExportError('image');
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new ExportError('image');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
