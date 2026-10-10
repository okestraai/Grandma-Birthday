import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE } from './reveal';
import { Parallax, SplitText, Sparkles, onView } from './motion';

/** Small uppercase label above headings. Gold on dark, gold-rich on light (contrast). */
export function Eyebrow({ children, tone = 'light', className }: { children: ReactNode; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <p className={cn('text-[11px] font-medium uppercase tracking-[0.3em]', tone === 'dark' ? 'text-gold' : 'text-gold-rich', className)}>
      {children}
    </p>
  );
}

/** A fine gold hairline with a small diamond in the middle. The lines draw out from the diamond on view. */
export function GoldRule({ className, align = 'center' }: { className?: string; align?: 'center' | 'left' }) {
  const draw = { hidden: { scaleX: 0, opacity: 0 }, show: { scaleX: 1, opacity: 1, transition: { duration: 1.1, ease: EASE, delay: 0.15 } } };
  return (
    <motion.div
      aria-hidden
      className={cn('flex items-center gap-3', align === 'center' ? 'justify-center' : 'justify-start', className)}
      {...onView('hidden', 'show', { margin: '0px' })}
    >
      <motion.span variants={draw} className="h-px w-12 origin-right bg-gradient-to-r from-transparent to-gold/70" />
      <motion.span
        variants={{ hidden: { scale: 0, rotate: 0 }, show: { scale: 1, rotate: 45, transition: { type: 'spring', stiffness: 300, damping: 15 } } }}
        className="size-1.5 bg-gold"
      />
      <motion.span variants={draw} className="h-px w-12 origin-left bg-gradient-to-l from-transparent to-gold/70" />
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  tone = 'light',
  align = 'center',
  as: Heading = 'h2',
  id,
  dramatic = false,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  tone?: 'light' | 'dark';
  align?: 'center' | 'left';
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  /** A bigger, slower title reveal, for the home page. */
  dramatic?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' ? 'mx-auto text-center' : 'text-left', className)}>
      {eyebrow && <Eyebrow tone={tone}>{eyebrow}</Eyebrow>}
      <Heading
        id={id}
        className={cn(
          'mt-3 font-display text-3xl leading-tight sm:text-4xl',
          tone === 'dark' ? 'text-ivory' : 'text-navy',
        )}
      >
        {typeof title === 'string' ? <SplitText text={title} trigger="view" variant={dramatic ? 'dramatic' : 'soft'} /> : title}
      </Heading>
      <GoldRule className="mt-5" align={align} />
      {description && (
        <p className={cn('mt-5 text-[15px] leading-relaxed sm:text-base', tone === 'dark' ? 'text-ivory/75' : 'text-muted')}>
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Dark editorial band at the top of interior pages. Holds the page's single h1.
 * A faint outlined "70" sits behind the text as the recurring motif.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('relative isolate overflow-hidden bg-navy pb-16 pt-32 text-ivory sm:pb-20 sm:pt-40', className)}>
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-90" />
      <Parallax offset={-50} className="pointer-events-none absolute -right-6 -top-10 -z-10">
        <motion.span
          aria-hidden
          className="block select-none font-display lining-nums text-[16rem] leading-none text-transparent opacity-[0.09] sm:text-[24rem]"
          style={{ WebkitTextStroke: '1px var(--brand-gold)' }}
          initial={{ opacity: 0, scale: 0.9, rotate: -6 }}
          animate={{ opacity: 0.09, scale: 1, rotate: 0 }}
          transition={{ duration: 1.6, ease: EASE }}
        >
          70
        </motion.span>
      </Parallax>
      <Sparkles count={10} className="-z-10" />
      <motion.div
        className="container-page"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: EASE }}
      >
        {eyebrow && <Eyebrow tone="dark">{eyebrow}</Eyebrow>}
        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">
          {typeof title === 'string' ? <SplitText text={title} delay={0.1} /> : title}
        </h1>
        <GoldRule className="mt-6" align="left" />
        {description && <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ivory/75 sm:text-base">{description}</p>}
        {children}
      </motion.div>
    </section>
  );
}
