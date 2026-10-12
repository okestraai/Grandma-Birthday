import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue, type Variants } from 'motion/react';
import { ArrowDown, RotateCcw } from 'lucide-react';
import type { PublicMedia, SiteOverview } from '@birthday/types';
import { celebrantName } from '@/lib/public-api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { MediaImage, mediaPlaceholder, mediaSrc, mediaSrcSet, useImageFallback } from '../media';
import { EASE, staggerChild } from '../reveal';
import { SeventyMark } from '../seventy';
import { ShaderBackdrop } from '../effects/ShaderBackdrop';
import { HERO_OVERLAY_OPACITY_WHEN_LIVE } from '../effects/settings';
import { HeroIntro, INTRO_SECONDS, useIntro } from './HeroIntro';
import { ConfettiBurst, CountUp, MagneticLink, MouseLayer, SplitText, Sparkles, TiltCard, useOnScreen, usePointerPosition } from '../motion';
import { cn } from '@/lib/utils';
import { celebrationDates, celebrationPlace, nextEvent } from '../event/event-helpers';

/** Whole days from now until the next event starts; null once it has begun. */
function daysUntil(iso: string): number | null {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

/** The hero's background photo; if it fails to load, a plain navy-to-emerald wash takes its place. */
function HeroBackground({ media, isLcp }: { media: PublicMedia; isLcp: boolean }) {
  const fallback = useImageFallback(mediaSrc(media, 'medium'), () => mediaPlaceholder(16, 9, ''));
  return (
    <img
      src={fallback.src}
      srcSet={fallback.broken ? undefined : mediaSrcSet(media)}
      sizes="100vw"
      alt=""
      className="size-full scale-110 object-cover opacity-45"
      fetchPriority={isLcp ? 'high' : undefined}
      decoding="async"
      onError={fallback.onError}
    />
  );
}

type Pointer = { x: MotionValue<number>; y: MotionValue<number> };

function HeroFrame({
  background,
  backgroundIsLcp = false,
  pointer,
  effects = false,
  children,
}: {
  background?: PublicMedia | null;
  /** The background photo is the largest thing on screen (no portrait), so fetch it first. */
  backgroundIsLcp?: boolean;
  pointer: Pointer;
  effects?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const onScreen = useOnScreen(sectionRef);
  const { scrollY } = useScroll();
  const bgY = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 280]);
  const bgScale = useTransform(scrollY, [0, 800], [1, reduce ? 1 : 1.25]);
  const [gradientLive, setGradientLive] = useState(false);
  // With no photo, let more of the moving gradient through the overlay once it is running.
  const lightenOverlay = gradientLive && !background;
  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-heading"
      // Pauses the hero's CSS loops once it has scrolled away.
      data-paused={onScreen ? undefined : ''}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-navy text-ivory"
    >
      {effects && <ShaderBackdrop name="hero" className="-z-30" onLiveChange={setGradientLive} />}
      {background && (
        <motion.div aria-hidden className="absolute inset-0 -z-20" style={{ y: bgY, scale: bgScale }}>
          <MouseLayer pointer={pointer} depth={-34} className="size-full">
            <HeroBackground media={background} isLcp={backgroundIsLcp} />
          </MouseLayer>
        </motion.div>
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-hero transition-opacity duration-[2000ms] ease-out"
        style={lightenOverlay ? { opacity: HERO_OVERLAY_OPACITY_WHEN_LIVE } : undefined}
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-navy to-transparent" />
      {effects && (
        <MouseLayer pointer={pointer} depth={48} className="pointer-events-none absolute inset-0 -z-10">
          <Sparkles count={40} />
        </MouseLayer>
      )}
      {children}
    </section>
  );
}

export function HeroSkeleton() {
  const pointer = usePointerPosition();
  return (
    <HeroFrame pointer={pointer}>
      <div className="container-page grid gap-10 pb-20 pt-32 lg:grid-cols-[1.1fr_0.9fr] lg:items-center" aria-busy="true">
        <div className="space-y-6">
          <Skeleton className="h-3 w-40 bg-white/10" />
          <Skeleton className="h-48 w-72 bg-white/10" />
          <Skeleton className="h-10 w-80 max-w-full bg-white/10" />
          <Skeleton className="h-4 w-64 bg-white/10" />
        </div>
        <Skeleton className="mx-auto aspect-[4/5] w-3/4 max-w-sm rounded-t-full bg-white/10" />
        <span className="sr-only">Loading the celebration</span>
      </div>
    </HeroFrame>
  );
}

/**
 * The home page when nothing could be loaded and nothing was saved before (a first visit while
 * the API is down): the hero frame and the gold 70, a short note and a retry button.
 */
export function HeroUnavailable({ onRetry, retrying = false }: { onRetry: () => void; retrying?: boolean }) {
  const pointer = usePointerPosition();
  return (
    <HeroFrame pointer={pointer}>
      <div className="container-page flex flex-col items-center pb-20 pt-32 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-gold">A celebration of</p>
        <SeventyMark className="mt-2" />
        <h1 id="hero-heading" className="mt-4 font-display text-3xl leading-tight text-ivory sm:text-4xl">
          A 70th birthday celebration
        </h1>
        <div aria-hidden className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-gold to-transparent" />
        <p className="mt-5 max-w-md text-sm leading-relaxed text-ivory/80 sm:text-[15px]">
          We’ll be right back — the celebration details are loading.
        </p>
        <Button variant="outline" size="sm" className="mt-7 text-ivory" onClick={onRetry} loading={retrying}>
          <RotateCcw aria-hidden /> Retry
        </Button>
      </div>
    </HeroFrame>
  );
}

export function Hero({ site }: { site: SiteOverview }) {
  const { celebrant, celebration, branding } = site;
  const reduce = useReducedMotion();
  const pointer = usePointerPosition();
  const { scrollY } = useScroll();
  const intro = useIntro();
  // Everything in the hero waits for the opening to part, when it plays.
  const wait = intro ? INTRO_SECONDS : 0;
  const portraitY = useTransform(scrollY, [0, 800], [0, reduce ? 0 : -140]);
  const portraitScale = useTransform(scrollY, [0, 800], [1, reduce ? 1 : 1.18]);
  const portraitRotate = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 5]);
  // The "70" shrinks and turns as the page scrolls away from it.
  const markScale = useSpring(useTransform(scrollY, [0, 600], [1, reduce ? 1 : 0.6]), { stiffness: 140, damping: 26 });
  const markRotate = useSpring(useTransform(scrollY, [0, 600], [0, reduce ? 0 : -18]), { stiffness: 140, damping: 26 });
  // The words drift up, shrink and fade as the hero leaves, so the next section takes over.
  const textY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : -160]);
  const textScale = useTransform(scrollY, [0, 700], [1, reduce ? 1 : 0.9]);
  const textOpacity = useTransform(scrollY, [0, 550], [1, reduce ? 1 : 0]);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const markRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);

  const parent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.1 + wait } } };
  // The "70" drops in from a little larger and turned, then lands with a flash and confetti.
  // Kept small (and unblurred) so that even a slow first frame never covers the headline.
  const slam: Variants = {
    hidden: { opacity: 0, scale: 1.3, y: -40, rotate: -10 },
    show: { opacity: 1, scale: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 170, damping: 14, mass: 0.9 } },
  };

  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => {
      setLanded(true);
      const rect = markRef.current?.getBoundingClientRect();
      if (rect && rect.bottom > 0) setBursts((list) => [...list, { id: Date.now(), x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
    }, (0.1 + wait + 0.14 + 0.45) * 1000);
    return () => window.clearTimeout(timer);
  }, [reduce, wait]);
  const heroMedia = branding.hero ?? null;
  const age = celebrant.age ?? 70;
  const headline = celebrant.heroHeadline ?? 'Years of Life. Love. Legacy.';
  const upcoming = nextEvent(site.events);
  const days = upcoming ? daysUntil(upcoming.startsAt) : null;
  // Once the first event has begun, the countdown names the event it now counts down to.
  const later = upcoming && site.events.some((e) => e.startsAt < upcoming.startsAt) ? upcoming.name : null;
  const daysLabel = later ? `${days === 1 ? 'day' : 'days'} until ${later}` : days === 1 ? 'day to go' : 'days to go';
  const place = site.events.length ? celebrationPlace(site) : null;

  // A tap on the "70" throws a little confetti. Decorative, so pointer only.
  const celebrate = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const burst = { id: Date.now(), x: e.clientX, y: e.clientY };
    setBursts((list) => [...list.slice(-2), burst]);
  };

  return (
    <HeroFrame background={heroMedia} backgroundIsLcp={!celebrant.portrait} pointer={pointer} effects>
      {intro && <HeroIntro />}
      <div className="container-page grid items-center gap-10 pb-24 pt-28 sm:pt-32 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pb-28">
        <motion.div
          variants={parent}
          initial="hidden"
          animate="show"
          style={{ y: textY, scale: textScale, opacity: textOpacity }}
          className="relative z-10 text-center lg:text-left"
        >
          <motion.p variants={staggerChild} className="text-[11px] font-medium uppercase tracking-[0.35em] text-gold">
            A celebration of
          </motion.p>
          <motion.div variants={slam} className="relative z-0 -mb-2 mt-2 flex justify-center lg:justify-start">
            <MouseLayer pointer={pointer} depth={28}>
              <motion.div ref={markRef} style={{ scale: markScale, rotate: markRotate }} onPointerDown={celebrate} className="relative cursor-pointer">
                {landed && (
                  <>
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold"
                      initial={{ scale: 0.3, opacity: 1 }}
                      animate={{ scale: 3.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                    />
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full bg-champagne/60 blur-3xl"
                      initial={{ opacity: 0.9, scale: 0.8 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                  </>
                )}
                <SeventyMark value={age} liquid />
              </motion.div>
            </MouseLayer>
          </motion.div>
          <p className="relative z-10 font-display text-2xl italic leading-snug text-champagne sm:text-3xl">
            <SplitText text={headline} delay={0.7 + wait} stagger={0.09} variant="dramatic" />
          </p>
          <motion.p variants={staggerChild} className="mt-8 text-[11px] font-medium uppercase tracking-[0.3em] text-ivory/70">
            Join us as we celebrate
          </motion.p>
          <h1 id="hero-heading" className="mt-3 font-display text-4xl leading-[1.08] text-ivory sm:text-5xl lg:text-[3.5rem]">
            <SplitText text={celebrantName(celebrant)} by="letter" delay={0.95 + wait} stagger={0.028} variant="dramatic" />
            <span className="sr-only">: celebrating {age} years</span>
          </h1>
          <motion.div variants={staggerChild} className="mx-auto mt-5 h-px w-24 bg-gradient-to-r from-transparent via-gold to-transparent lg:mx-0 lg:bg-gradient-to-r lg:from-gold lg:to-transparent" />
          <motion.p variants={staggerChild} className="mt-5 text-sm leading-relaxed text-ivory/80 sm:text-[15px]">
            <time dateTime={celebration.startsAt}>{celebrationDates(site)}</time>
            {place && (
              <>
                <span aria-hidden className="mx-2 text-gold">·</span>
                <span>{place}</span>
              </>
            )}
          </motion.p>
          {days !== null && (
            <motion.p variants={staggerChild} className="mt-4 inline-flex items-baseline gap-2 rounded-full border border-gold/30 bg-navy/60 px-4 py-1.5 text-ivory/80">
              <CountUp value={days} duration={2.2} className="font-display text-xl text-gold" />
              <span className="text-[11px] uppercase tracking-[0.25em]">{daysLabel}</span>
            </motion.p>
          )}
          <motion.div variants={staggerChild} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
            <MagneticLink
              to="/rsvp"
              className="relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-gold px-8 text-sm font-semibold tracking-wide text-navy shadow-soft transition-shadow duration-300 ease-luxe hover:shadow-gold"
            >
              <span className="relative z-10">RSVP</span>
              {!reduce && (
                <span aria-hidden className="loop-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              )}
            </MagneticLink>
            <MagneticLink
              to="/story"
              className="inline-flex h-12 items-center justify-center rounded-full border border-gold/60 px-8 text-sm font-medium tracking-wide text-ivory transition-colors duration-300 hover:border-gold hover:bg-gold/10"
            >
              Explore the Journey
            </MagneticLink>
          </motion.div>
        </motion.div>

        {celebrant.portrait && (
          <motion.div
            style={{ y: portraitY, scale: portraitScale, rotate: portraitRotate }}
            // Rises from the bottom edge; the negative inset leaves room for the gold rings around it.
            initial={{ opacity: 0, clipPath: 'inset(100% -20% -20% -20%)' }}
            animate={{ opacity: 1, clipPath: 'inset(-20% -20% -20% -20%)' }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.5 + wait }}
            className="relative mx-auto w-[72%] max-w-[26rem] sm:w-[55%] lg:w-full"
          >
            <MouseLayer pointer={pointer} depth={-30}>
              <div aria-hidden className={cn('absolute -inset-3 rounded-t-full border border-gold/40 sm:-inset-4', !reduce && 'loop-pulse')} />
              <motion.div
                aria-hidden
                className="absolute -inset-6 rounded-t-full border border-gold/15 sm:-inset-8"
                initial={reduce ? false : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.8, ease: EASE, delay: 0.8 }}
              />
              <TiltCard className="rounded-t-full" max={12} lift={1.04}>
                <div className="overflow-hidden rounded-t-full shadow-lift">
                  <MediaImage
                    media={celebrant.portrait}
                    variant="medium"
                    sizes="(min-width: 1024px) 26rem, (min-width: 640px) 55vw, 72vw"
                    priority
                    alt={celebrant.portrait.altText ?? `Portrait of ${celebrantName(celebrant)}`}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
              </TiltCard>
            </MouseLayer>
          </motion.div>
        )}
      </div>

      <motion.a
        href="#introduction"
        aria-label="Scroll to the introduction"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-ivory/60 hover:text-gold sm:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.4 + wait, duration: 1 }}
      >
        Scroll
        <span className={cn('block', !reduce && 'loop-nudge')}>
          <ArrowDown className="size-4" aria-hidden />
        </span>
      </motion.a>
      {bursts.map((b) => (
        <ConfettiBurst key={b.id} origin={b} onDone={() => setBursts((list) => list.filter((x) => x.id !== b.id))} />
      ))}
    </HeroFrame>
  );
}
