import { mediaUrls } from '../media/media.mapper';
import { PublicCache } from './public-cache';

describe('PublicCache', () => {
  it('reuses a value until cleared', async () => {
    const cache = new PublicCache();
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.remember('site', load)).toBe(1);
    expect(await cache.remember('site', load)).toBe(1);
    cache.clear();
    expect(await cache.remember('site', load)).toBe(2);
  });

  it('does not store a value loaded before a clear', async () => {
    const cache = new PublicCache();
    let release!: () => void;
    const slow = cache.remember('site', () => new Promise<string>((resolve) => (release = () => resolve('old'))));
    cache.clear();
    release();
    expect(await slow).toBe('old');
    expect(cache.get('site')).toBeUndefined();
  });

  it('keeps at most 200 entries', () => {
    const cache = new PublicCache();
    for (let i = 0; i < 250; i++) cache.set(`seo:/${i}`, i);
    expect(cache.get('seo:/0')).toBeUndefined();
    expect(cache.get('seo:/249')).toBe(249);
  });
});

describe('mediaUrls', () => {
  it('adds a version that changes when the row changes', () => {
    const media = { id: 'm1', thumbKey: 't', mediumKey: null, updatedAt: new Date(1_700_000_000_000) };
    const v = (1_700_000_000_000).toString(36);
    expect(mediaUrls(media)).toEqual({ thumb: `/api/media/m1/thumb?v=${v}`, medium: null, original: `/api/media/m1/original?v=${v}` });
    expect(mediaUrls({ ...media, updatedAt: new Date(1_700_000_000_001) }).thumb).not.toBe(mediaUrls(media).thumb);
  });
});
