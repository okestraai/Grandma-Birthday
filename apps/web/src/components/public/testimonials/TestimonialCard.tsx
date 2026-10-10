import { motion } from 'motion/react';
import type { PublicTestimonial } from '@birthday/types';
import { apiUrl } from '@/lib/api';
import { cn, initials, paragraphs } from '@/lib/utils';
import { MediaImage } from '../media';
import { onView } from '../motion';

/** The opening quote mark: swings and drops into place when the card comes into view. */
function QuoteMark({ className }: { className: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn('block origin-bottom-left font-display', className)}
      {...onView({ opacity: 0, scale: 0.3, rotate: -30, y: -12 }, { opacity: 1, scale: 1, rotate: 0, y: 0 }, { margin: '0px' })}
      transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.2 }}
    >
      “
    </motion.span>
  );
}

export function Avatar({ t, size = 'md' }: { t: PublicTestimonial; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-16' : 'size-11';
  if (t.photo) {
    return <MediaImage media={t.photo} variant="thumb" alt="" className={cn(cls, 'shrink-0 rounded-full object-cover ring-1 ring-gold/50')} />;
  }
  return (
    <span aria-hidden className={cn(cls, 'flex shrink-0 items-center justify-center rounded-full border border-gold/50 bg-cream font-display text-navy', size === 'lg' ? 'text-xl' : 'text-sm')}>
      {initials(t.authorName)}
    </span>
  );
}

function Attribution({ t, tone }: { t: PublicTestimonial; tone: 'light' | 'dark' }) {
  return (
    <figcaption className="mt-6 flex items-center gap-3">
      <Avatar t={t} />
      <span>
        <span className={cn('block text-sm font-semibold', tone === 'dark' ? 'text-ivory' : 'text-navy')}>{t.authorName}</span>
        {t.relationship && <span className={cn('block text-xs', tone === 'dark' ? 'text-ivory/60' : 'text-muted')}>{t.relationship}</span>}
      </span>
    </figcaption>
  );
}

export function TestimonialVideo({ t }: { t: PublicTestimonial }) {
  if (!t.video) return null;
  return (
    <video
      controls
      preload="metadata"
      playsInline
      src={apiUrl(t.video.urls.original)}
      className="mt-5 aspect-video w-full rounded-xl bg-navy"
      aria-label={`Video message from ${t.authorName}`}
    />
  );
}

/** A tribute card for the wall. Message is plain text split into paragraphs. */
export function TestimonialCard({ t, className }: { t: PublicTestimonial; className?: string }) {
  return (
    <motion.figure
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={cn('break-inside-avoid rounded-2xl border border-gold/25 bg-white p-6 shadow-soft transition-shadow duration-500 hover:shadow-lift sm:p-7', className)}
    >
      <QuoteMark className="text-5xl leading-[0.6] text-gold-rich/60" />
      <blockquote className="mt-3 space-y-3 text-[15px] leading-relaxed text-charcoal">
        {paragraphs(t.message).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </blockquote>
      <TestimonialVideo t={t} />
      <Attribution t={t} tone="light" />
    </motion.figure>
  );
}

/** Large editorial quote for the featured tribute. */
export function FeaturedTestimonial({ t, tone = 'dark' }: { t: PublicTestimonial; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const text = paragraphs(t.message);
  return (
    <figure className="mx-auto max-w-3xl text-center">
      <QuoteMark className={cn('mx-auto w-fit text-7xl leading-[0.5]', dark ? 'text-gold' : 'text-gold-rich')} />
      <blockquote className={cn('mt-6 space-y-4 font-display text-xl italic leading-relaxed sm:text-2xl', dark ? 'text-ivory' : 'text-navy')}>
        {text.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </blockquote>
      {t.video && (
        <div className="mx-auto max-w-xl">
          <TestimonialVideo t={t} />
        </div>
      )}
      <figcaption className="mt-8 flex flex-col items-center gap-3">
        <Avatar t={t} size="lg" />
        <span>
          <span className={cn('block text-sm font-semibold tracking-wide', dark ? 'text-ivory' : 'text-navy')}>{t.authorName}</span>
          {t.relationship && <span className={cn('mt-0.5 block text-xs uppercase tracking-[0.2em]', dark ? 'text-gold' : 'text-gold-rich')}>{t.relationship}</span>}
        </span>
      </figcaption>
    </figure>
  );
}
