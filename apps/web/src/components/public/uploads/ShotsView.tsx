import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { UploadPageConfig } from '@birthday/types';
import { Input, Textarea } from '@/components/ui/input';
import { cn, formatSize } from '@/lib/utils';
import { formatDuration, shotProblem } from './shot-rules';
import { saveShotsToPhone } from './save-to-phone';
import type { Shot } from './use-shots';

// ---------------------------------------------------------------------------
// Confirm sheet
// ---------------------------------------------------------------------------

export interface ConfirmRequest {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
}

function ConfirmSheet({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="mx-auto w-full max-w-md rounded-t-3xl border-t border-gold/25 bg-navy px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-ivory"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="confirm-title" className="text-center text-[15px]">
              {request.title}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" className="h-12 rounded-full border border-white/20 text-sm font-medium" onClick={onClose} autoFocus>
                Keep
              </button>
              <button
                type="button"
                className="h-12 rounded-full bg-error text-sm font-medium text-white"
                onClick={() => {
                  request.onConfirm();
                  onClose();
                }}
              >
                {request.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Status line for one shot
// ---------------------------------------------------------------------------

function ShotStatus({ shot, problem, percent, onRetry }: { shot: Shot; problem: string | null; percent?: number; onRetry: () => void }) {
  if (problem) {
    return (
      <p className="flex items-start gap-1 text-[12px] leading-snug text-[#f2b8b6]">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span>Can’t be sent. {problem}</span>
      </p>
    );
  }
  if (percent !== undefined) {
    return (
      <p className="flex items-center gap-1 text-[12px] text-champagne">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Sending {percent}%
      </p>
    );
  }
  if (shot.status === 'sent') {
    return (
      <p className="flex items-center gap-1 text-[12px] text-[#9fd8b4]">
        <Check className="size-3" aria-hidden /> Sent
      </p>
    );
  }
  if (shot.status === 'failed') {
    return (
      <div className="text-[12px] leading-snug text-[#f2b8b6]">
        <p>
          Couldn’t send{shot.error ? `: ${shot.error}` : '.'}
        </p>
        <button type="button" className="mt-1 inline-flex h-8 items-center gap-1 font-medium text-champagne underline underline-offset-2" onClick={onRetry}>
          <RotateCcw className="size-3" aria-hidden /> Retry
        </button>
      </div>
    );
  }
  return <p className="text-[12px] text-ivory/55">Not sent</p>;
}

// ---------------------------------------------------------------------------
// Full-screen viewer
// ---------------------------------------------------------------------------

function ShotViewer({
  shots,
  index,
  onIndex,
  onClose,
  selected,
  onToggle,
  onDelete,
  onSave,
}: {
  onSave: (shots: Shot[]) => void;
  shots: Shot[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (shot: Shot) => void;
}) {
  const shot = shots[index];
  const startX = useRef<number | null>(null);
  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < shots.length) onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!shot) return null;
  const isSelected = selected.has(shot.id);
  const bar = 'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium active:bg-white/10 [&_svg]:size-5';

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black text-ivory"
      role="dialog"
      aria-modal="true"
      aria-label={`Shot ${index + 1} of ${shots.length}`}
      onTouchStart={(e) => (startX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (startX.current !== null && x !== undefined && Math.abs(x - startX.current) > 50) go(x < startX.current ? 1 : -1);
        startX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="flex size-12 items-center justify-center rounded-full bg-white/10" onClick={onClose} aria-label="Close">
          <X className="size-6" aria-hidden />
        </button>
        <span className="text-sm tabular-nums text-ivory/70">
          {index + 1} / {shots.length} · {formatSize(shot.size)}
        </span>
        <span className="size-12" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {shot.kind === 'VIDEO' ? (
          <video key={shot.id} src={shot.url} controls playsInline className="max-h-full max-w-full" />
        ) : (
          <img key={shot.id} src={shot.url} alt={`Shot ${index + 1}`} className="max-h-full max-w-full object-contain" />
        )}
        {index > 0 && (
          <button type="button" className="absolute left-2 flex size-12 items-center justify-center rounded-full bg-black/40" onClick={() => go(-1)} aria-label="Previous shot">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}
        {index < shots.length - 1 && (
          <button type="button" className="absolute right-2 flex size-12 items-center justify-center rounded-full bg-black/40" onClick={() => go(1)} aria-label="Next shot">
            <ChevronRight className="size-6" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button type="button" className={cn(bar, shot.savedToPhone && 'text-[#9fd8b4]')} onClick={() => onSave([shot])}>
          {shot.savedToPhone ? <Check aria-hidden /> : <Download aria-hidden />} {shot.savedToPhone ? 'Saved · save again' : 'Save to my phone'}
        </button>
        <button type="button" className={cn(bar, isSelected && 'text-gold')} onClick={() => onToggle(shot.id)} aria-pressed={isSelected}>
          <Check aria-hidden /> {isSelected ? 'Selected' : 'Select'}
        </button>
        <button type="button" className={cn(bar, 'text-[#f2b8b6]')} onClick={() => onDelete(shot)}>
          <Trash2 aria-hidden /> Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My shots
// ---------------------------------------------------------------------------

export interface ShotsViewProps {
  shots: Shot[];
  config: UploadPageConfig;
  persistent: boolean;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  progress: Record<string, number>;
  overall: number | null;
  sending: boolean;
  error: string | null;
  name: string;
  message: string;
  onName: (v: string) => void;
  onMessage: (v: string) => void;
  onSend: (ids: string[]) => void;
  onCancel: () => void;
  onDelete: (ids: string[]) => void;
  /** Marks shots as saved to the phone. */
  onSaved: (ids: string[]) => void;
  /** iPhone/iPad: no auto-download, so nudge the guest to save to Photos. */
  ios: boolean;
  /** The "Keep a copy on this phone" toggle (not shown on iOS). */
  keepCopy?: ReactNode;
  onBack: () => void;
  onOpenCamera: () => void;
  addMore: ReactNode;
}

export function ShotsView(props: ShotsViewProps) {
  const { shots, config, selected, onSelectedChange, progress, sending } = props;
  const [viewer, setViewer] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  /** Shots left over when the share sheet couldn't take a whole selection at once. */
  const [saveQueue, setSaveQueue] = useState<string[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const save = async (items: Shot[]) => {
    setSaveNote(null);
    const outcome = await saveShotsToPhone(items);
    if (outcome.savedIds.length) props.onSaved(outcome.savedIds);
    if (outcome.cancelled) return;
    setSaveQueue(outcome.remainingIds);
    if (outcome.remainingIds.length) {
      setSaveNote(`Saved ${outcome.savedIds.length}. Your phone takes a few at a time — tap “Save next” for the rest.`);
    }
  };
  const queued = shots.filter((s) => saveQueue.includes(s.id));
  const unsaved = shots.filter((s) => !s.savedToPhone);

  const problems = useMemo(() => new Map(shots.map((s) => [s.id, shotProblem(s, config)])), [shots, config]);
  const sendable = (s: Shot) => s.status !== 'sent' && !problems.get(s.id);
  const selectedShots = shots.filter((s) => selected.has(s.id));
  const toSend = selectedShots.filter(sendable);
  const sentIds = shots.filter((s) => s.status === 'sent').map((s) => s.id);
  const allSelected = shots.length > 0 && selected.size === shots.length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const askDelete = (ids: string[]) =>
    setConfirm({
      title: ids.length === 1 ? 'Delete this shot from your phone?' : `Delete ${ids.length} shots from your phone?`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        props.onDelete(ids);
        if (viewer !== null) {
          const remaining = shots.length - ids.length;
          setViewer(remaining > 0 ? Math.min(viewer, remaining - 1) : null);
        }
      },
    });

  // Keep the viewer index valid when shots change underneath it.
  useEffect(() => {
    if (viewer !== null && viewer >= shots.length) setViewer(shots.length ? shots.length - 1 : null);
  }, [shots.length, viewer]);

  return (
    <div className="flex flex-1 flex-col pb-40">
      <div className="flex items-center justify-between pt-4">
        <button type="button" onClick={props.onBack} className="-ml-3 flex size-12 items-center justify-center rounded-full text-ivory/80" aria-label="Back">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <h1 className="font-display text-2xl">My shots{shots.length ? ` (${shots.length})` : ''}</h1>
        <button type="button" onClick={props.onOpenCamera} className="-mr-3 flex size-12 items-center justify-center rounded-full text-gold" aria-label="Open camera">
          <Camera className="size-6" aria-hidden />
        </button>
      </div>

      <p className={cn('mt-2 text-center text-[12px] leading-relaxed', props.persistent ? 'text-ivory/55' : 'text-[#f2d49b]')} role="note">
        {props.persistent
          ? 'Saved on this phone only. Share or save them before you leave — phones can clear website storage after a few weeks.'
          : 'Shots will be lost if you close this page.'}
      </p>

      {props.ios && unsaved.length > 0 && (
        <p className="mt-3 rounded-2xl bg-gold px-4 py-3 text-center text-[13px] font-medium leading-snug text-navy" role="note">
          Save these to your Photos: tap Save all, then ‘Save Images’.
        </p>
      )}
      {!props.ios && props.keepCopy}
      {saveNote && (
        <p className="mt-3 text-center text-[12px] text-champagne" role="status">
          {saveNote}
        </p>
      )}

      {shots.length === 0 ? (
        <div className="my-auto py-12 text-center">
          <p className="text-[15px] text-ivory/70">No shots yet.</p>
          <button type="button" onClick={props.onOpenCamera} className="mx-auto mt-6 flex h-14 items-center gap-2 rounded-full bg-gold px-8 font-medium text-navy">
            <Camera className="size-5" aria-hidden /> Open camera
          </button>
          <div className="mt-4">{props.addMore}</div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              className="h-12 text-sm font-medium text-champagne"
              onClick={() => onSelectedChange(allSelected ? new Set() : new Set(shots.map((s) => s.id)))}
              disabled={sending}
            >
              {allSelected ? 'Select none' : 'Select all'}
            </button>
            <button type="button" className="h-12 text-sm font-medium text-champagne disabled:opacity-40" onClick={() => void save(shots)} disabled={sending}>
              Save all
            </button>
            {sentIds.length > 0 && (
              <button
                type="button"
                className="h-12 text-sm text-ivory/65"
                disabled={sending}
                onClick={() =>
                  setConfirm({
                    title: `Remove ${sentIds.length} sent ${sentIds.length === 1 ? 'shot' : 'shots'} from this phone? The family already has ${sentIds.length === 1 ? 'it' : 'them'}.`,
                    confirmLabel: 'Clear sent',
                    onConfirm: () => props.onDelete(sentIds),
                  })
                }
              >
                Clear sent shots
              </button>
            )}
          </div>

          <ul className="mt-1 grid grid-cols-2 gap-3" aria-label="My shots">
            {shots.map((shot, i) => {
              const problem = problems.get(shot.id) ?? null;
              const isSelected = selected.has(shot.id);
              return (
                <li key={shot.id} className="min-w-0">
                  <div className={cn('relative aspect-square overflow-hidden rounded-2xl bg-white/5 ring-2 ring-transparent transition', isSelected && 'ring-gold')}>
                    <button type="button" className="block size-full" onClick={() => setViewer(i)} aria-label={`Open ${shot.kind === 'VIDEO' ? 'video' : 'photo'} ${i + 1}`}>
                      {shot.kind === 'VIDEO' ? (
                        <>
                          <video src={shot.url} className="size-full object-cover" muted playsInline preload="metadata" aria-hidden />
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums">
                            <Play className="size-3 fill-ivory" aria-hidden />
                            {shot.durationSec ? formatDuration(shot.durationSec) : 'Video'}
                          </span>
                        </>
                      ) : (
                        <img src={shot.url} alt="" className="size-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      )}
                    </button>
                    {problem && (
                      <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-error text-white" aria-hidden>
                        <AlertTriangle className="size-4" />
                      </span>
                    )}
                    {shot.status === 'sent' && (
                      <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-emerald text-white" aria-hidden>
                        <Check className="size-4" />
                      </span>
                    )}
                    {shot.savedToPhone && (
                      <span className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-[#9fd8b4]">
                        <Check className="size-3" aria-hidden /> Saved
                      </span>
                    )}
                    <label className="absolute right-0 top-0 flex size-12 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={isSelected}
                        onChange={() => toggle(shot.id)}
                        disabled={sending}
                        aria-label={`Select ${shot.kind === 'VIDEO' ? 'video' : 'photo'} ${i + 1}`}
                      />
                      <span
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full border-2 border-ivory/90 bg-black/30 peer-focus-visible:outline-2 peer-focus-visible:outline-gold',
                          isSelected && 'border-gold bg-gold text-navy',
                        )}
                        aria-hidden
                      >
                        {isSelected && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </label>
                    {progress[shot.id] !== undefined && (
                      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                        <div className="h-full bg-gold transition-[width]" style={{ width: `${progress[shot.id]}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 px-0.5">
                    <p className="text-[12px] tabular-nums text-ivory/60">{formatSize(shot.size)}</p>
                    <ShotStatus shot={shot} problem={problem} percent={progress[shot.id]} onRetry={() => props.onSend([shot.id])} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-6">{props.addMore}</div>

          <div className="mt-6 space-y-3">
            <Input
              aria-label="Your name"
              value={props.name}
              onChange={(e) => props.onName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              placeholder="Your name (optional)"
              className="h-12 border-white/15 bg-white/[0.06] text-ivory placeholder:text-ivory/40"
              disabled={sending}
            />
            <Textarea
              aria-label="A message"
              rows={2}
              value={props.message}
              onChange={(e) => props.onMessage(e.target.value)}
              maxLength={500}
              placeholder="A message or birthday wish (optional)"
              className="min-h-16 border-white/15 bg-white/[0.06] text-ivory placeholder:text-ivory/40"
              disabled={sending}
            />
          </div>

          {props.error && (
            <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-error/40 bg-error/15 px-4 py-3 text-sm leading-relaxed">
              <CloudOff className="mt-0.5 size-4 shrink-0 text-[#f2b8b6]" aria-hidden />
              <span>{props.error}</span>
            </div>
          )}
        </>
      )}

      {shots.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy/95 backdrop-blur">
          <div className="mx-auto max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {sending && props.overall !== null && (
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Sending" aria-valuenow={props.overall} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${props.overall}%` }} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 text-[#f2b8b6] disabled:opacity-40"
                disabled={selected.size === 0 || sending}
                onClick={() => askDelete([...selected])}
                aria-label={`Delete selected (${selected.size})`}
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
              {queued.length > 0 ? (
                <button
                  type="button"
                  className="flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full border border-gold/60 px-3 text-sm font-medium text-champagne disabled:opacity-40"
                  disabled={sending}
                  onClick={() => void save(queued)}
                >
                  <Download className="size-4" aria-hidden /> Save next {queued.length}
                </button>
              ) : (
                <button
                  type="button"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 text-ivory disabled:opacity-40"
                  disabled={selected.size === 0 || sending}
                  onClick={() => void save(selectedShots)}
                  aria-label={`Save to my phone (${selected.size})`}
                >
                  <Download className="size-5" aria-hidden />
                </button>
              )}
              {sending ? (
                <button type="button" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-gold/50 font-medium text-champagne" onClick={props.onCancel}>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Sending… Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gold font-medium text-navy disabled:opacity-45"
                  disabled={toSend.length === 0}
                  onClick={() => props.onSend(toSend.map((s) => s.id))}
                >
                  <Send className="size-4" aria-hidden /> Share selected ({toSend.length})
                </button>
              )}
            </div>
            {selected.size > 0 && toSend.length < selected.size && !sending && (
              <p className="mt-2 text-center text-[11px] text-ivory/50">
                {selected.size - toSend.length} selected {selected.size - toSend.length === 1 ? 'shot is' : 'shots are'} already sent or can’t be sent.
              </p>
            )}
          </div>
        </div>
      )}

      {viewer !== null && (
        <ShotViewer
          shots={shots}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          selected={selected}
          onToggle={toggle}
          onDelete={(shot) => askDelete([shot.id])}
          onSave={save}
        />
      )}
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
