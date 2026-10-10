import { Link } from 'react-router';
import { SEO } from '@/components/seo/SEO';
import { siteNameOf, useSite } from '@/lib/public-api';
import { GoldRule } from '@/components/public/section';
import { NAV_LINKS } from '@/components/public/nav';

export default function NotFoundPage() {
  const { data: site } = useSite();
  return (
    <section className="relative isolate flex min-h-[80vh] items-center overflow-hidden bg-navy pb-20 pt-32 text-center text-ivory">
      <SEO title="Page not found" description="The page you were looking for does not exist." noindex siteName={siteNameOf(site)} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-80" />
      <div className="container-page">
        <p aria-hidden className="font-display text-8xl lining-nums leading-none text-gold-gradient sm:text-9xl">
          {site?.celebrant.age ?? 70}
        </p>
        <h1 className="mt-6 font-display text-3xl sm:text-4xl">This page has wandered off</h1>
        <GoldRule className="mt-6" />
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-ivory/75">
          The page you were looking for does not exist or has moved. These may help you find your way.
        </p>
        <nav aria-label="Suggested pages" className="mt-8">
          <ul className="flex flex-wrap justify-center gap-2">
            <li>
              <Link to="/" className="inline-flex h-10 items-center rounded-full bg-gold px-5 text-sm font-semibold text-navy">
                Home
              </Link>
            </li>
            {NAV_LINKS.slice(0, 5).map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="inline-flex h-10 items-center rounded-full border border-gold/50 px-5 text-sm text-ivory hover:border-gold hover:bg-gold/10">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
