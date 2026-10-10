import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from 'radix-ui';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { PublicMedia } from '@birthday/types';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { mediaAlt, mediaSize, mediaSrc } from '../media';
import { EASE } from '../reveal';
import { tileLayoutId } from './MasonryGrid';

export interface LightboxProps {
  items: PublicMedia[];
  /** Index of the open item; null when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
  /** Total items in the album (may exceed the loaded items). */
  total: number;
  /** More pages exist beyond `items`. */
  hasMore?: boolean;
  /** Load the next page (called when the viewer nears the end of the loaded items). */
  onNeedMore?: () => void;
  /** Album title, used for the dialog's accessible name. */
  title?: string;
  /** Element to focus when the viewer closes (defaults to whatever had focus before it opened). */
  getReturnFocus?: (index: number) => HTMLElement | null;
  /** Id of the item whose grid tile should grow into the viewer (shared layout). */
  sharedId?: string | null;
}

const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 500;

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-navy/60 text-ivory outline-none transition-colors duration-300 hover:border-gold/70 hover:text-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy disabled:pointer-events-none disabled:opacity-30 sm:size-12 [&_svg]:size-5';

/**
 * Fullscreen viewer for an album. Radix Dialog gives the focus trap, Escape and
 * focus return; arrow keys and swipes move between items; videos play inline.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onOpenChange,
  total,
  hasMore = false,
  onNeedMore,
  title,
  getReturnFocus,
  sharedId = null,
}: LightboxProps) {
  const open = index !== null && index >= 0 && index < items.length;
  const current = open ? items[index] : null;
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState(0);
  const [pendingNext, setPendingNext] = useState(false);
  // The shared zoom from the tile applies to the first item shown only, not after moving on.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (!open) setMoved(false);
  }, [open]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastIndex = useRef<number>(index ?? 0);
  useEffect(() => {
    if (index !== null) lastIndex.current = index;
  }, [index]);

  const count = Math.max(total, items.length);
  const position = open ? index + 1 : 0;
  const canPrev = open && index > 0;
  const canNext = open && (index < items.length - 1 || hasMore);

  const pauseVideo = () => {
    const video = videoRef.current;
    if (video && !video.paused) {
      try {
        video.pause();
      } catch {
        // Some environments (tests) do not implement media playback.
      }
    }
  };

  const goTo = useCallback(
    (next: number) => {
      if (index === null || next === index || next < 0 || next >= items.length) return;
      pauseVideo();
      setMoved(true);
      setDirection(next > index ? 1 : -1);
      onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  const prev = useCallback(() => {
    if (index !== null) goTo(index - 1);
  }, [goTo, index]);

  const next = useCallback(() => {
    if (index === null) return;
    if (index < items.length - 1) goTo(index + 1);
    else if (hasMore) {
      setPendingNext(true);
      onNeedMore?.();
    }
  }, [goTo, hasMore, index, items.length, onNeedMore]);

  // Ask for the next page when the viewer is close to the end of what is loaded.
  useEffect(() => {
    if (open && hasMore && index >= items.length - 2) onNeedMore?.();
  }, [open, hasMore, index, items.length, onNeedMore]);

  // "Next" was pressed on the last loaded item: advance once the page arrives.
  useEffect(() => {
    if (!pendingNext || index === null) return;
    if (index < items.length - 1) {
      setPendingNext(false);
      goTo(index + 1);
    } else if (!hasMore) {
      setPendingNext(false);
    }
  }, [pendingNext, index, items.length, hasMore, goTo]);

  // Preload the neighbours' medium images so moving feels instant.
  useEffect(() => {
    if (!open) return;
    for (const i of [index - 1, index + 1]) {
      const neighbour = items[i];
      if (neighbour && neighbour.kind === 'PHOTO') {
        const img = new Image();
        img.decoding = 'async';
        img.src = mediaSrc(neighbour, 'medium');
      }
    }
  }, [open, index, items]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLVideoElement || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) next();
    else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) prev();
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      pauseVideo();
      setPendingNext(false);
    }
    onOpenChange(value);
  };

  // Direction-aware slides: the next item comes in from the side it was asked for, with a slight turn.
  const shift = reduceMotion ? 0 : 120;
  const slideVariants = {
    enter: (dir: number) => ({ x: dir * shift, opacity: 0, scale: reduceMotion ? 1 : 0.92, rotateY: reduceMotion ? 0 : dir * 12 }),
    center: { x: 0, opacity: 1, scale: 1, rotateY: 0 },
    exit: (dir: number) => ({ x: -dir * shift, opacity: 0, scale: reduceMotion ? 1 : 0.92, rotateY: reduceMotion ? 0 : -dir * 12 }),
  };
  const layoutId = !reduceMotion && !moved && current && sharedId === current.id ? tileLayoutId(current.id) : undefined;

  const caption = current?.caption?.trim();
  const isVideo = current?.kind === 'VIDEO';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-50 bg-navy/95 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          />
        </Dialog.Overlay>
        <Dialog.Content
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            const target = getReturnFocus?.(lastIndex.current);
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
          className="fixed inset-0 z-50 flex flex-col text-ivory outline-none"
        >
          <Dialog.Title className="sr-only">{title ? `${title}: viewer` : 'Photo viewer'}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Use the left and right arrow keys, or swipe, to move between items. Press Escape to close.
          </Dialog.Description>

          {current && (
            <>
              <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
                <p data-testid="lightbox-counter" aria-live="polite" aria-atomic="true" className="font-display text-base tabular-nums tracking-wide text-ivory/85">
                  <span className="sr-only">Item </span>
                  {position} / {count}
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={apiUrl(current.urls.original)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open original ${isVideo ? 'video' : 'photo'} in a new tab`}
                    className={iconButton}
                  >
                    <ExternalLink aria-hidden />
                  </a>
                  <Dialog.Close aria-label="Close viewer" className={iconButton}>
                    <X aria-hidden />
                  </Dialog.Close>
                </div>
              </header>

              <div className="relative flex-1 overflow-hidden">
                <AnimatePresence initial={false} custom={direction}>
                  <motion.figure
                    key={current.id}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: reduceMotion ? 0.2 : 0.6, ease: EASE }}
                    style={{ transformPerspective: 1200 }}
                    drag={isVideo ? false : 'x'}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.6}
                    onDragEnd={onDragEnd}
                    className={cn(
                      'absolute inset-0 flex items-center justify-center px-3 sm:px-20',
                      !isVideo && 'cursor-grab touch-pan-y active:cursor-grabbing',
                    )}
                  >
                    {isVideo ? (
                      <video
                        ref={videoRef}
                        key={current.id}
                        controls
                        preload="metadata"
                        playsInline
                        src={apiUrl(current.urls.original)}
                        aria-label={mediaAlt(current, 'Video')}
                        className="max-h-full max-w-full rounded-lg bg-black shadow-lift"
                        style={current.width && current.height ? { aspectRatio: `${current.width} / ${current.height}` } : undefined}
                      />
                    ) : (
                      <motion.img
                        layoutId={layoutId}
                        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                        src={mediaSrc(current, 'medium')}
                        alt={mediaAlt(current)}
                        {...mediaSize(current, 'medium')}
                        decoding="async"
                        draggable={false}
                        className="max-h-full w-auto max-w-full select-none rounded-sm object-contain shadow-lift"
                      />
                    )}
                  </motion.figure>
                </AnimatePresence>

                <button type="button" onClick={prev} disabled={!canPrev} aria-label="Previous item" className={cn(iconButton, 'absolute left-3 top-1/2 hidden -translate-y-1/2 sm:flex sm:left-6')}>
                  <ChevronLeft aria-hidden />
                </button>
                <button type="button" onClick={next} disabled={!canNext} aria-label="Next item" className={cn(iconButton, 'absolute right-3 top-1/2 hidden -translate-y-1/2 sm:flex sm:right-6')}>
                  <ChevronRight aria-hidden />
                </button>
              </div>

              <footer className="flex min-h-20 items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:justify-center sm:px-6">
                <button type="button" onClick={prev} disabled={!canPrev} aria-label="Previous item" className={cn(iconButton, 'sm:hidden')}>
                  <ChevronLeft aria-hidden />
                </button>
                <p className="min-w-0 flex-1 text-center text-sm leading-relaxed text-ivory/80 sm:max-w-2xl">
                  {caption ?? <span className="sr-only">No caption</span>}
                  {pendingNext && <span className="ml-2 text-ivory/60">Loading…</span>}
                </p>
                <button type="button" onClick={next} disabled={!canNext} aria-label="Next item" className={cn(iconButton, 'sm:hidden')}>
                  <ChevronRight aria-hidden />
                </button>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
