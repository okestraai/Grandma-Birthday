import { detectType, extensionMatches } from './file-inspector';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string, pad = 16) => Buffer.concat([Buffer.from(text, 'latin1'), Buffer.alloc(pad)]);

describe('detectType', () => {
  it('recognises allowed photo formats by their magic bytes', () => {
    expect(detectType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
    expect(detectType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    expect(detectType(ascii('GIF89a'))?.mime).toBe('image/gif');
    expect(detectType(ascii('RIFF\0\0\0\0WEBP'))?.mime).toBe('image/webp');
    expect(detectType(ascii('\0\0\0\x1cftypavif'))?.mime).toBe('image/avif');
  });

  it('recognises allowed video formats', () => {
    expect(detectType(ascii('\0\0\0\x18ftypmp42'))).toEqual({ mime: 'video/mp4', kind: 'VIDEO', extension: 'mp4' });
    expect(detectType(ascii('\0\0\0\x14ftypqt  '))?.mime).toBe('video/quicktime');
    expect(detectType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0))?.mime).toBe('video/webm');
  });

  it('rejects everything else, including SVG, HTML, executables and HEIC', () => {
    expect(detectType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectType(ascii('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(detectType(ascii('\0\0\0\x18ftypheic'))).toBeNull();
    expect(detectType(Buffer.alloc(0))).toBeNull();
  });
});

describe('extensionMatches', () => {
  it('accepts matching or missing extensions and rejects disguised files', () => {
    expect(extensionMatches('photo.JPG', 'image/jpeg')).toBe(true);
    expect(extensionMatches('photo', 'image/jpeg')).toBe(true);
    expect(extensionMatches('clip.mov', 'video/quicktime')).toBe(true);
    expect(extensionMatches('photo.png', 'image/jpeg')).toBe(false);
    expect(extensionMatches('invoice.pdf', 'image/png')).toBe(false);
  });
});
