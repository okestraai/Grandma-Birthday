import { Transform } from 'class-transformer';

/**
 * Trims strings and removes control characters (keeps newlines and tabs).
 * Empty strings become null when `nullable` so "clear this field" works from forms.
 */
export function Clean(options: { nullable?: boolean; lowercase?: boolean } = {}) {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    // eslint-disable-next-line no-control-regex
    let out = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (options.lowercase) out = out.toLowerCase();
    if (out === '' && options.nullable) return null;
    return out;
  });
}

/** Safe storage/display name for an uploaded file: no paths, no odd characters, bounded length. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(-120);
  return cleaned || 'file';
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
