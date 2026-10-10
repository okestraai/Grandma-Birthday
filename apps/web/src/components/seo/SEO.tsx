import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { apiUrl } from '@/lib/api';

/**
 * Per-page SEO metadata using React 19's built-in <title>/<meta>/<link> hoisting.
 *
 * Crawlers that do not run JavaScript get the same metadata from the production
 * web server (server/index.mjs), which asks the API's /api/seo endpoint and injects
 * tags marked data-seo="server" into index.html. Once React takes over, those
 * server tags are removed so each tag appears once.
 */
export interface SEOProps {
  title: string;
  description?: string;
  /** Absolute URL or API path such as "/api/media/<id>/medium". */
  image?: string | null;
  /** Defaults to the current path. */
  path?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** Appended as "Title · siteName" unless the title already contains it. */
  siteName?: string;
}

export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin).replace(/\/$/, '');

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const resolved = apiUrl(url);
  return /^https?:\/\//.test(resolved) ? resolved : `${SITE_URL}${resolved}`;
}

export function SEO({ title, description, image, path, type = 'website', noindex, jsonLd, siteName }: SEOProps) {
  const location = useLocation();
  const canonical = `${SITE_URL}${path ?? location.pathname}`;
  const fullTitle = siteName && !title.includes(siteName) ? `${title} · ${siteName}` : title;
  const imageUrl = image ? absolute(image) : `${SITE_URL}/og-default.jpg`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  useEffect(() => {
    document.querySelectorAll('[data-seo="server"]').forEach((node) => node.remove());
  }, []);

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={imageUrl} />
      {siteName && <meta property="og:site_name" content={siteName} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={imageUrl} />
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          // JSON.stringify output with "<" escaped cannot break out of the script element.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
