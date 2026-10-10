import sharp from 'sharp';
import type { Metadata } from 'sharp';
import { AppException } from '../common/errors';

export interface ProcessedPhoto {
  width: number;
  height: number;
  original: Buffer;
  originalMime: string;
  thumb: Buffer;
  medium: Buffer;
}

export const THUMB_WIDTH = 400;
export const MEDIUM_SIZE = 1600;
const MAX_PIXELS = 100_000_000; // 100 MP: rejects decompression bombs
const MIN_SIDE = 32;
const MAX_SIDE = 20_000;

sharp.cache(false);
sharp.concurrency(2);

/**
 * Validates dimensions and produces three stored objects:
 * - original: full resolution, orientation applied, metadata (EXIF, GPS) stripped for privacy
 * - medium: max 1600px WebP for the lightbox
 * - thumb: 400px-wide WebP for grids
 * Animated GIFs keep their original bytes so the animation survives.
 */
export async function processPhoto(input: Buffer, mime: string): Promise<ProcessedPhoto> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new AppException(415, 'UNSUPPORTED_FILE_TYPE', 'This image could not be read. It may be damaged or too large.');
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (width < MIN_SIDE || height < MIN_SIDE) {
    throw new AppException(400, 'BAD_REQUEST', `Images must be at least ${MIN_SIDE}×${MIN_SIDE} pixels.`);
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    throw new AppException(400, 'BAD_REQUEST', `Images can be at most ${MAX_SIDE} pixels on a side.`);
  }

  try {
    const base = () => sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
    let original: Buffer;
    let originalMime = mime;
    switch (mime) {
      case 'image/gif':
        original = input;
        break;
      case 'image/png':
        original = await base().png({ compressionLevel: 8 }).toBuffer();
        break;
      case 'image/webp':
        original = await base().webp({ quality: 90 }).toBuffer();
        break;
      case 'image/avif':
        original = await base().avif({ quality: 70 }).toBuffer();
        break;
      default:
        original = await base().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        originalMime = 'image/jpeg';
    }

    const [medium, thumb] = await Promise.all([
      base().resize({ width: MEDIUM_SIZE, height: MEDIUM_SIZE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
    ]);
    return { width, height, original, originalMime, thumb, medium };
  } catch {
    // The header parsed but the pixel data is damaged or truncated.
    throw new AppException(415, 'UNSUPPORTED_FILE_TYPE', 'This image could not be read. It may be damaged or incomplete.');
  }
}
