import { open } from 'node:fs/promises';

export type DetectedKind = 'PHOTO' | 'VIDEO';

export interface DetectedType {
  mime: string;
  kind: DetectedKind;
  extension: string;
}

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

const EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov', 'qt'],
  'video/webm': ['webm', 'mkv'],
};

/**
 * Identifies a file from its first bytes (magic numbers). The client's declared MIME type and
 * file name are never trusted. Returns null for anything not on the allow-list (including SVG,
 * HTML, executables, and HEIC, which browsers cannot display).
 */
export function detectType(head: Buffer): DetectedType | null {
  const ascii = (start: number, end: number) => head.subarray(start, end).toString('latin1');
  const make = (mime: string, kind: DetectedKind): DetectedType => ({ mime, kind, extension: EXTENSIONS[mime][0] });

  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return make('image/jpeg', 'PHOTO');
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return make('image/png', 'PHOTO');
  if (head.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return make('image/gif', 'PHOTO');
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return make('image/webp', 'PHOTO');
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return make('video/webm', 'VIDEO');

  if (head.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'avif' || brand === 'avis') return make('image/avif', 'PHOTO');
    if (brand === 'qt  ') return make('video/quicktime', 'VIDEO');
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return null;
    if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'MSNV', 'mmp4', '3gp4', '3gp5'].includes(brand)) {
      return make('video/mp4', 'VIDEO');
    }
  }
  return null;
}

/** True when the file name has no extension, or one that matches the detected content. */
export function extensionMatches(filename: string, mime: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return true;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSIONS[mime]?.includes(ext) ?? false;
}

export async function readHead(path: string, bytes = 64): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
