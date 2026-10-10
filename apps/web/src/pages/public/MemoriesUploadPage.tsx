import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Camera, CloudOff, Heart, ImagePlus, Images, Lock, RotateCcw, Smartphone, Video } from 'lucide-react';
import type { UploadPageConfig, UploadResult } from '@birthday/types';
import { SEO } from '@/components/seo/SEO';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, isApiError, isServerUnreachable, uploadWithProgress } from '@/lib/api';
import { useUploadConfig } from '@/lib/public-api';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/public/reveal';
import { GoldRule } from '@/components/public/section';
import { CameraView } from '@/components/public/uploads/CameraView';
import { ShotsView } from '@/components/public/uploads/ShotsView';
import { downloadBlob, isIOS, keepCopyName } from '@/components/public/uploads/save-to-phone';
import { sendShots, type StopKind } from '@/components/public/uploads/send-shots';
import { shotProblem } from '@/components/public/uploads/shot-rules';
import { openShotStore, type ShotStore } from '@/components/public/uploads/shot-store';
import { useShots, type NewShot } from '@/components/public/uploads/use-shots';
import { UpdateNotice } from '@/components/UpdateNotice';

function Shell({ children, celebrant }: { children: ReactNode; celebrant?: string }) {
  return (
    <main id="main" className="relative isolate min-h-[100svh] overflow-hidden bg-navy text-ivory">
      <SEO title="Share your photos" description="Share your photos from the celebration." noindex />
      <div aria-hidden className="absolute inset-0 -z-10 bg-luxury opacity-80" />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 -z-10 select-none font-display lining-nums text-[18rem] leading-none text-transparent opacity-[0.08]"
        style={{ WebkitTextStroke: '1px var(--brand-gold)' }}
      >
        70
      </span>
      <div className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        {celebrant && <p className="text-center text-[11px] font-medium uppercase tracking-[0.3em] text-gold">{celebrant}</p>}
        {children}
      </div>
    </main>
  );
}

function Notice({ icon, title, children, celebrant }: { icon: ReactNode; title: string; children: ReactNode; celebrant?: string }) {
  return (
    <Shell celebrant={celebrant}>
      <NoticeBody icon={icon} title={title}>
        {children}
      </NoticeBody>
    </Shell>
  );
}

function NoticeBody({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="my-auto py-10 text-center" role="alert">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full border border-gold/40 text-gold [&_svg]:size-7">{icon}</span>
      <h1 className="mt-6 font-display text-3xl leading-tight">{title}</h1>
      <GoldRule className="mt-5" />
      <div className="mt-5 text-[15px] leading-relaxed text-ivory/75">{children}</div>
    </div>
  );
}

const STOP_COPY: Record<StopKind, { title: string; body: string }> = {
  closed: { title: 'Uploads have closed', body: 'The family is no longer accepting photos through this page. Thank you for celebrating with us.' },
  invalid: { title: 'This link is no longer active', body: 'Please scan the latest QR code at the celebration, or ask a member of the family for the new link.' },
  quota: { title: 'Our album is full', body: 'We have received so many memories that the album is full for now. Thank you for sharing.' },
};

// ---------------------------------------------------------------------------
// Remembered guest details, per event link
// ---------------------------------------------------------------------------

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: not worth bothering the guest */
  }
}

function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readLocal(key, initial));
  useEffect(() => writeLocal(key, value), [key, value]);
  return [value, setValue] as const;
}

// ---------------------------------------------------------------------------
// Big buttons
// ---------------------------------------------------------------------------

function BigAction({ icon, label, hint, onClick, primary }: { icon: ReactNode; label: string; hint?: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-16 w-full items-center gap-4 rounded-2xl px-5 py-3 text-left transition active:scale-[0.98] [&_svg]:size-6 [&_svg]:shrink-0',
        primary ? 'bg-gold text-navy shadow-gold' : 'border border-white/15 bg-white/[0.06] text-ivory',
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-base font-medium">{label}</span>
        {hint && <span className={cn('block text-[12px]', primary ? 'text-navy/70' : 'text-ivory/60')}>{hint}</span>}
      </span>
    </button>
  );
}

type View = 'welcome' | 'camera' | 'shots' | 'thanks';

function PartyCamera({ token, config, openStore }: { token: string; config: UploadPageConfig; openStore: () => Promise<ShotStore> }) {
  const { shots, ready, persistent, add, update, remove } = useShots(token, openStore);
  const [view, setView] = useState<View>('welcome');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [details, setDetails] = useLocalState(`party-shots:details:${token}`, { name: '', message: '' });
  const [keepCopy, setKeepCopy] = useLocalState(`party-shots:keep-copy:${token}`, false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [overall, setOverall] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stop, setStop] = useState<StopKind | null>(null);
  const [thanks, setThanks] = useState<{ accepted: number; moderated: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ios = useMemo(() => (typeof navigator === 'undefined' ? false : isIOS()), []);

  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const pickInput = useRef<HTMLInputElement>(null);

  const onFiles = async (list: FileList | null, input: HTMLInputElement | null) => {
    const files = list ? Array.from(list) : [];
    if (input) input.value = '';
    if (!files.length) return;
    // Keep the camera's own file untouched: the server makes previews and strips location data.
    const ids = await add(files.map((file) => ({ blob: file, originalName: file.name })));
    setSelected((prev) => new Set([...prev, ...ids]));
    setError(null);
    setView('shots');
  };

  const onCapture = useCallback(
    (shot: NewShot) => {
      let savedToPhone = false;
      if (keepCopy && !ios) {
        // Numbered per event link across visits, so a later visit doesn't reuse a name.
        const counterKey = `party-shots:copy-count:${token}`;
        const n = readLocal(counterKey, 0) + 1;
        writeLocal(counterKey, n);
        downloadBlob(shot.blob, keepCopyName(shot.blob.type, n));
        savedToPhone = true;
      }
      void add([{ ...shot, savedToPhone }]).then((ids) => setSelected((prev) => new Set([...prev, ...ids])));
    },
    [add, keepCopy, ios, token],
  );

  const send = async (ids: string[]) => {
    if (sending) return;
    const wanted = new Set(ids);
    const items = shots.filter((s) => wanted.has(s.id) && s.status !== 'sent' && !shotProblem(s, config));
    if (!items.length) return;
    setSending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await sendShots({
        shots: items,
        config,
        uploaderName: details.name,
        message: details.message,
        signal: controller.signal,
        upload: (form, onProgress, signal) =>
          uploadWithProgress<UploadResult>(`/uploads/${encodeURIComponent(token)}`, form, (p) => onProgress(p.percent), signal),
        onProgress: (groupIds, percent, all) => {
          setProgress((prev) => ({ ...prev, ...Object.fromEntries(groupIds.map((id) => [id, percent])) }));
          setOverall(all);
        },
        onShotDone: (id, patch) => {
          setProgress((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          void update(id, patch);
          if (patch.status === 'sent') {
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        },
      });
      if (outcome.stop) {
        setStop(outcome.stop);
        if (outcome.accepted > 0) toast.success(`${outcome.accepted} sent before this happened.`);
        return;
      }
      if (outcome.error) {
        setError(outcome.accepted > 0 ? `${outcome.accepted} sent. ${outcome.error}` : outcome.error);
        return;
      }
      if (outcome.accepted > 0) {
        setThanks({ accepted: outcome.accepted, moderated: outcome.moderated });
        setView('thanks');
      } else {
        setError('None of these could be added. The reason is under each shot.');
      }
    } finally {
      setProgress({});
      setOverall(null);
      setSending(false);
      abortRef.current = null;
    }
  };

  const openPhoneCamera = (kind: 'photo' | 'video') => (kind === 'photo' ? photoInput : videoInput).current?.click();
  const openPicker = () => pickInput.current?.click();

  const nativeButtons = (compact = false) => (
    <>
      {config.videoUploadsEnabled ? (
        <div className={cn('rounded-2xl border border-white/15 bg-white/[0.06] p-3', compact && 'bg-white/[0.04]')}>
          <p className="flex items-center gap-2 px-1 text-sm font-medium">
            <Smartphone className="size-5 text-gold" aria-hidden /> Use my phone’s camera app
          </p>
          <p className="px-1 text-[12px] text-ivory/60">Best quality on iPhone</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => openPhoneCamera('photo')} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium">
              <Camera className="size-4" aria-hidden /> Take photo
            </button>
            <button type="button" onClick={() => openPhoneCamera('video')} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium">
              <Video className="size-4" aria-hidden /> Record video
            </button>
          </div>
        </div>
      ) : (
        <BigAction icon={<Smartphone />} label="Use my phone’s camera app" hint="Best quality on iPhone" onClick={() => openPhoneCamera('photo')} />
      )}
      <BigAction icon={<ImagePlus />} label="Choose from my photos" onClick={openPicker} />
    </>
  );

  const inputs = (
    <div className="hidden">
      <input ref={photoInput} type="file" accept="image/*" capture="environment" data-testid="camera-photo-input" onChange={(e) => void onFiles(e.target.files, e.target)} />
      {config.videoUploadsEnabled && (
        <input ref={videoInput} type="file" accept="video/*" capture="environment" data-testid="camera-video-input" onChange={(e) => void onFiles(e.target.files, e.target)} />
      )}
      <input ref={pickInput} type="file" accept={config.acceptedMimeTypes.join(',')} multiple data-testid="picker-input" onChange={(e) => void onFiles(e.target.files, e.target)} />
    </div>
  );

  if (stop) {
    const copy = STOP_COPY[stop];
    return (
      <>
        <NoticeBody icon={<Lock />} title={copy.title}>
          <p>{copy.body}</p>
          {shots.length > 0 && (
            <>
              <p className="mt-4 text-sm text-champagne">Your shots are still saved on this phone.</p>
              <Button variant="outline" className="mt-5 h-12 text-ivory" onClick={() => { setStop(null); setView('shots'); }}>
                <Images aria-hidden /> My shots
              </Button>
            </>
          )}
        </NoticeBody>
      </>
    );
  }

  const unsent = shots.filter((s) => s.status !== 'sent').length;
  // Never offer a reload mid-send, over the camera, or when shots live only in this page's memory.
  const offerUpdate = !sending && view !== 'camera' && (persistent || shots.length === 0);

  return (
    <>
      {inputs}

      {offerUpdate && (
        <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex justify-center px-3">
          <UpdateNotice className="pointer-events-auto" />
        </div>
      )}

      {view === 'welcome' && (
        <div className="flex flex-1 flex-col">
          <div className="pt-8 text-center">
            <h1 className="font-display text-[2.1rem] leading-tight">Capture the Celebration</h1>
            <GoldRule className="mt-5" />
          </div>
          <div className="mt-8 space-y-3">
            {ready && shots.length > 0 && (
              <BigAction
                icon={<Images />}
                label={`My shots (${shots.length})`}
                hint={unsent ? `${unsent} not sent yet` : 'All sent'}
                onClick={() => setView('shots')}
                primary
              />
            )}
            <BigAction icon={<Camera />} label="Open camera" onClick={() => setView('camera')} primary={!shots.length} />
            {nativeButtons()}
          </div>
          <p className="mt-5 rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3 text-[13px] leading-relaxed text-champagne">
            Want everything in your Photos? Use your normal Camera app, then tap ‘Choose from my photos’ to share.
          </p>
          <p className="mt-auto pt-8 text-center text-xs text-ivory/55">
            <Lock className="mr-1 inline size-3 align-[-1px]" aria-hidden />
            Nothing is sent until you choose.
          </p>
        </div>
      )}

      {view === 'camera' && (
        <CameraView
          videoEnabled={config.videoUploadsEnabled}
          maxVideoBytes={config.maxVideoBytes}
          lastShot={shots[0] ? { url: shots[0].url, kind: shots[0].kind } : undefined}
          count={shots.length}
          onCapture={onCapture}
          onClose={() => setView('welcome')}
          onOpenShots={() => setView('shots')}
          fallback={nativeButtons(true)}
        />
      )}

      {view === 'shots' && (
        <ShotsView
          shots={shots}
          config={config}
          persistent={persistent}
          selected={selected}
          onSelectedChange={setSelected}
          progress={progress}
          overall={overall}
          sending={sending}
          error={error}
          name={details.name}
          message={details.message}
          onName={(name) => setDetails((d) => ({ ...d, name }))}
          onMessage={(message) => setDetails((d) => ({ ...d, message }))}
          onSend={(ids) => void send(ids)}
          onCancel={() => abortRef.current?.abort()}
          onDelete={(ids) => {
            void remove(ids);
            setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
          }}
          onSaved={(ids) => ids.forEach((id) => void update(id, { savedToPhone: true }))}
          ios={ios}
          keepCopy={
            <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2">
              <span className="text-sm">
                Keep a copy on this phone
                <span className="block text-[11px] text-ivory/55">Downloads each camera shot as you take it</span>
              </span>
              <input type="checkbox" role="switch" className="size-6 accent-[var(--brand-gold)]" checked={keepCopy} onChange={(e) => setKeepCopy(e.target.checked)} />
            </label>
          }
          onBack={() => setView('welcome')}
          onOpenCamera={() => setView('camera')}
          addMore={<div className="space-y-3">{nativeButtons(true)}</div>}
        />
      )}

      {view === 'thanks' && thanks && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="my-auto py-10 text-center"
          role="status"
        >
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-gold text-navy">
            <Heart className="size-7" aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-3xl leading-tight">Thank you</h1>
          <p className="mt-4 font-display text-lg italic leading-relaxed text-champagne">Thank you for helping us capture this beautiful celebration.</p>
          <GoldRule className="mt-6" />
          <p className="mt-6 text-sm text-ivory/75">
            {thanks.accepted} {thanks.accepted === 1 ? 'memory' : 'memories'} received.
            {thanks.moderated && ' They will appear in the gallery once the family has had a look.'}
          </p>
          <div className="mt-8 space-y-3">
            <Button variant="gold" size="lg" className="h-14 w-full text-base" onClick={() => setView('camera')}>
              <Camera aria-hidden /> Back to the camera
            </Button>
            <Button variant="ghost" className="h-12 w-full text-ivory/85 hover:bg-white/10" onClick={() => setView('shots')}>
              <Images aria-hidden /> My shots
            </Button>
          </div>
        </motion.div>
      )}
    </>
  );
}

export default function MemoriesUploadPage({ openStore = openShotStore }: { openStore?: () => Promise<ShotStore> } = {}) {
  const { token = '' } = useParams();
  const config = useUploadConfig(token);

  if (config.isPending) {
    return (
      <Shell>
        <div className="space-y-4 pt-10" aria-busy="true" aria-label="Loading">
          <Skeleton className="mx-auto h-9 w-64 bg-white/10" />
          <Skeleton className="mx-auto h-4 w-52 bg-white/10" />
          <Skeleton className="mt-8 h-16 rounded-2xl bg-white/10" />
          <Skeleton className="h-16 rounded-2xl bg-white/10" />
          <Skeleton className="h-16 rounded-2xl bg-white/10" />
        </div>
      </Shell>
    );
  }

  if (config.isError) {
    const err = config.error;
    // A failed refetch while the page is open keeps the camera (and what was typed) on screen.
    if (isApiError(err, 'UPLOAD_TOKEN_INVALID') || (isApiError(err) && err.status === 404)) {
      return (
        <Notice icon={<Lock />} title={STOP_COPY.invalid.title}>
          {STOP_COPY.invalid.body}
        </Notice>
      );
    }
    if (isApiError(err, 'UPLOADS_CLOSED')) {
      return (
        <Notice icon={<Lock />} title={STOP_COPY.closed.title}>
          {STOP_COPY.closed.body}
        </Notice>
      );
    }
  }
  if (!config.data) {
    const err = config.error;
    return (
      <Notice icon={<CloudOff />} title="We couldn’t connect">
        <p>{isServerUnreachable(err) ? 'We can’t reach the celebration server right now. Please try again in a moment.' : errorMessage(err)}</p>
        <Button variant="gold" className="mt-6" onClick={() => config.refetch()} loading={config.isRefetching}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </Notice>
    );
  }

  const data = config.data;
  if (!data.open) {
    return (
      <Notice icon={<Lock />} title={data.closedReason === 'STORAGE_FULL' ? 'Our album is full' : 'Uploads have closed'} celebrant={data.celebrantName}>
        {data.closedReason === 'STORAGE_FULL'
          ? 'We have received so many memories that the album is full for now. Thank you for sharing.'
          : 'The family is not accepting photos through this page at the moment. Thank you for celebrating with us.'}
      </Notice>
    );
  }

  return (
    <Shell celebrant={data.celebrantName}>
      <PartyCamera token={token} config={data} openStore={openStore} />
    </Shell>
  );
}
