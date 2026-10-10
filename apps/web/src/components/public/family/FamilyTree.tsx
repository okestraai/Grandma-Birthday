import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { FamilyTree as FamilyTreeData } from '@birthday/types';
import { EASE } from '@/components/public/reveal';
import { cn } from '@/lib/utils';
import { MemberDialog } from './MemberDialog';
import { MemberAvatar, MemberYears, SeventyBadge } from './MemberNode';
import { CARD_H, CARD_W, layoutTree, type PlacedCard } from './tree-layout';
import { useSeen } from '../motion';

/** Seconds between one generation appearing and the next. */
const ROW_DELAY = 0.32;

/** Row number for a y position: generations sit on distinct rows, top to bottom. */
function rowIndexer(ys: number[]): (y: number) => number {
  const rows = [...new Set(ys.map((y) => Math.round(y)))].sort((a, b) => a - b);
  return (y) => {
    const r = Math.round(y);
    let row = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i] <= r + 1) row = i;
    return row;
  };
}

const MIN_SCALE = 0.45;
const MAX_SCALE = 1.25;

/**
 * One person. Cards pop in a generation at a time (row by row, then left to right within a
 * row) once the tree is on screen, and spring up a little under the pointer or focus.
 */
function TreeCard({ card, onSelect, row, order, shown }: { card: PlacedCard; onSelect: (id: string) => void; row: number; order: number; shown: boolean }) {
  const { member } = card;
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(member.id)}
      initial={shown ? false : { opacity: 0, y: 24, scale: 0.7 }}
      animate={shown ? { opacity: 1, y: 0, scale: 1 } : undefined}
      whileHover={{ scale: 1.06, y: -4, transition: { type: 'spring', stiffness: 320, damping: 18 } }}
      whileFocus={{ scale: 1.04, transition: { type: 'spring', stiffness: 320, damping: 18 } }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20, delay: row * ROW_DELAY + Math.min(order * 0.05, 0.4) }}
      style={{ left: card.x, top: card.y, width: CARD_W, height: CARD_H }}
      aria-label={`${member.fullName}, ${member.relationshipLabel}. Show details`}
      className={cn(
        'group absolute flex flex-col items-center rounded-2xl border bg-white px-2.5 pb-3 pt-4 text-center shadow-soft transition-[box-shadow,border-color] duration-300 ease-luxe hover:z-10 hover:shadow-gold focus-visible:z-10 focus-visible:shadow-gold',
        card.isHonoured ? 'border-gold bg-gradient-to-b from-champagne/40 to-white' : card.role === 'spouse' ? 'border-dashed border-gold/50' : 'border-gold/25',
      )}
    >
      <span className="relative">
        <MemberAvatar
          member={member}
          className={cn('size-16 ring-2 ring-offset-2 ring-offset-white', card.isHonoured ? 'ring-gold' : 'ring-gold/30')}
          textClassName="text-base"
        />
        {card.isCelebrant && <SeventyBadge className="-bottom-1 -right-2 size-7 text-[11px]" />}
      </span>
      <span className="mt-2.5 line-clamp-2 font-display text-[14px] leading-tight text-navy">{member.fullName}</span>
      <span className="mt-1 line-clamp-2 text-[10.5px] font-medium uppercase leading-snug tracking-[0.08em] text-gold-rich">{member.relationshipLabel}</span>
      <MemberYears member={member} className="mt-auto" />
    </motion.button>
  );
}

/**
 * The family drawn as a real tree: the celebrant's parents on top, the celebrant and spouse with
 * siblings to their right, then each couple's children (with their spouses) down every generation.
 * Wide trees scroll sideways; zoom buttons and "fit" help on small screens.
 */
export function FamilyTree({ tree }: { tree: FamilyTreeData; celebrantName?: string | null }) {
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const [selected, setSelected] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);

  // Fit the tree to the available width on first render and when the screen width changes.
  // Only a width change counts: zooming adds or removes a scrollbar, which resizes the
  // viewport, and re-fitting then would undo every zoom.
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el || layout.width === 0) return;
    let lastWidth = -1;
    const fit = () => {
      const width = el.getBoundingClientRect().width;
      if (Math.abs(width - lastWidth) < 1) return;
      lastWidth = width;
      const available = width - 32;
      const next = Math.max(MIN_SCALE, Math.min(1, available / layout.width));
      setFitScale(next);
      setScale(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout.width]);

  // Start scrolled so the celebrant's couple is in view.
  useEffect(() => {
    const el = viewport.current;
    const honoured = layout.cards.find((c) => c.isCelebrant);
    if (!el || !honoured) return;
    el.scrollLeft = Math.max(0, honoured.x * fitScale + 16 - el.clientWidth / 2 + CARD_W * fitScale);
  }, [layout, fitScale]);

  // Play the entrance once the tree scrolls into view (at once without IntersectionObserver).
  const reduce = useReducedMotion();
  const canvas = useRef<HTMLDivElement>(null);
  const play = useSeen(canvas, { amount: 0.15 });
  const rowOf = useMemo(() => rowIndexer(layout.cards.map((c) => c.y)), [layout.cards]);
  const orderInRow = useMemo(() => {
    const seen = new Map<number, number>();
    return layout.cards.map((c) => {
      const row = rowOf(c.y);
      const n = seen.get(row) ?? 0;
      seen.set(row, n + 1);
      return n;
    });
  }, [layout.cards, rowOf]);
  // A connector starts at its first point ("M x y"); it draws once the row it leaves from is in.
  const connectorDelay = (d: string) => {
    const y = Number(d.match(/^M\s*[\d.]+\s+([\d.]+)/)?.[1] ?? 0);
    return rowOf(y) * ROW_DELAY + 0.25;
  };

  const zoom = (factor: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * factor * 100) / 100)));

  return (
    <>
      <div className="relative">
        <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-full border border-gold/30 bg-white/90 p-1 shadow-soft backdrop-blur" role="group" aria-label="Zoom the family tree">
          <button type="button" onClick={() => zoom(1 / 1.2)} className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-cream" aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <button type="button" onClick={() => setScale(fitScale)} className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-cream" aria-label="Fit the whole tree">
            <Maximize2 className="size-4" />
          </button>
          <button type="button" onClick={() => zoom(1.2)} className="flex size-9 items-center justify-center rounded-full text-navy hover:bg-cream" aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
        </div>

        <div
          ref={viewport}
          className="overflow-auto rounded-3xl border border-gold/20 bg-[radial-gradient(circle_at_top,rgba(214,179,106,0.10),transparent_60%)] px-4 pb-6 pt-14"
          tabIndex={0}
          aria-label="Family tree. Scroll sideways to see everyone."
        >
          <div style={{ width: layout.width * scale, height: layout.height * scale }} className="relative mx-auto">
            <div ref={canvas} style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
              <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden>
                {layout.connectors.map((c, i) => (
                  <motion.path
                    key={i}
                    d={c.d}
                    fill="none"
                    stroke={c.kind === 'marriage' ? 'var(--brand-gold)' : 'var(--brand-gold-rich)'}
                    strokeOpacity={c.kind === 'marriage' ? 1 : 0.6}
                    strokeWidth={c.kind === 'marriage' ? 3 : 1.75}
                    strokeLinecap="round"
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={play ? { pathLength: 1, opacity: 1 } : undefined}
                    transition={{ pathLength: { duration: 0.9, ease: EASE, delay: connectorDelay(c.d) }, opacity: { duration: 0.2, delay: connectorDelay(c.d) } }}
                  />
                ))}
                {/* A small ring on each marriage line. */}
                {layout.connectors
                  .filter((c) => c.kind === 'marriage')
                  .map((c, i) => {
                    const [, x1, y, x2] = c.d.match(/M ([\d.]+) ([\d.]+) H ([\d.]+)/) ?? [];
                    if (!x1) return null;
                    return (
                      <motion.circle
                        key={`ring-${i}`}
                        cx={(Number(x1) + Number(x2)) / 2}
                        cy={Number(y)}
                        r={5}
                        fill="var(--brand-ivory)"
                        stroke="var(--brand-gold)"
                        strokeWidth={2}
                        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                        initial={reduce ? false : { scale: 0 }}
                        animate={play ? { scale: 1 } : undefined}
                        transition={{ type: 'spring', stiffness: 400, damping: 12, delay: rowOf(Number(y)) * ROW_DELAY + 0.6 }}
                      />
                    );
                  })}
              </svg>
              {layout.cards.map((card, i) => (
                <TreeCard
                  key={card.member.id}
                  card={card}
                  onSelect={setSelected}
                  row={rowOf(card.y)}
                  order={orderInRow[i]}
                  shown={play}
                />
              ))}
            </div>
          </div>
        </div>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-[3px] w-6 rounded bg-gold" /> Married
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-4 w-4 border-l-[1.5px] border-t-[1.5px] border-gold-rich/60" /> Parent to child
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="size-4 rounded border border-dashed border-gold/60" /> Joined the family by marriage
          </li>
          <li>Tap anyone to read more.</li>
          {layout.width * scale > 700 && <li className="w-full text-center sm:w-auto">Scroll or swipe sideways to see everyone.</li>}
        </ul>

        {layout.unplaced.length > 0 && (
          <div className="mt-10">
            <h3 className="text-center font-display text-lg text-navy">Also in the family</h3>
            <ul className="mt-4 flex flex-wrap justify-center gap-3">
              {layout.unplaced.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setSelected(m.id)} className="flex items-center gap-3 rounded-full border border-gold/25 bg-white py-1.5 pl-1.5 pr-4 text-left hover:shadow-gold">
                    <MemberAvatar member={m} className="size-9" textClassName="text-xs" />
                    <span className="text-sm text-navy">{m.fullName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <MemberDialog tree={tree} memberId={selected} onSelect={setSelected} onClose={() => setSelected(null)} />
    </>
  );
}
