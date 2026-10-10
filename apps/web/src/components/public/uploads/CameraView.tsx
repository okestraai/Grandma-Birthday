import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Camera, CameraOff, Images, Play, RefreshCcw, SwitchCamera, X, Zap, ZapOff } from 'lucide-react';
import { cn, formatSize } from '@/lib/utils';
import { baseMime, formatDuration, pickRecorderType, shouldStopRecording, type ShotKind } from './shot-rules';
import type { NewShot } from './use-shots';

export type CameraProblem = 'insecure' | 'unsupported' | 'denied' | 'nocamera' | 'busy' | 'other';

/** Minimal typing for ImageCapture, which TypeScript's DOM library doesn't include. */
interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

export function cameraProblemOf(err: unknown): CameraProblem {
  const name = err instanceof Error || err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'other';
}

export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, string> = {
  insecure: 'The in-page camera only works on a secure (https) link.',
  unsupported: 'This browser can’t open the camera inside a page.',
  denied: 'Camera access is turned off for this page. You can allow it in your browser settings.',
  nocamera: 'We couldn’t find a camera on this device.',
  busy: 'The camera is being used by another app. Close it and try again.',
  other: 'The camera couldn’t start.',
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

interface CameraViewProps {
  videoEnabled: boolean;
  maxVideoBytes: number;
  lastShot?: { url: string; kind: ShotKind };
  count: number;
  onCapture: (shot: NewShot) => void;
  onClose: () => void;
  onOpenShots: () => void;
  /** Rendered when the in-page camera can't run: the phone camera app and photo picker buttons. */
  fallback: React.ReactNode;
}

type RecordNote = { kind: 'limit' | 'mic' | 'hidden'; text: string } | null;

/** How to unblock the microphone, in the words of the guest's phone. */
function micBlockedText(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1 && !/Android/.test(ua));
  if (iOS) {
    return 'The microphone is blocked, so videos will be silent. Tap “aA” in the address bar → Website Settings → Microphone → Allow, then tap Allow microphone.';
  }
  return 'The microphone is blocked, so videos will be silent. Tap the lock icon in the address bar → Permissions → Microphone → Allow, then tap Allow microphone.';
}

export function CameraView({ videoEnabled, maxVideoBytes, lastShot, count, onCapture, onClose, onOpenShots, fallback }: CameraViewProps) {
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const generation = useRef(0);
  const [mode, setMode] = useState<ShotKind>('PHOTO');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<RecordNote>(null);
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const stopAll = useCallback(() => {
    generation.current += 1;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    stopStream(streamRef.current);
    stopStream(audioRef.current);
    streamRef.current = null;
    audioRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Stop the camera while the tab is hidden; start it again when the guest comes back.
  useEffect(() => {
    const onVisibility = () => {
      const isVisible = document.visibilityState !== 'hidden';
      if (!isVisible && recorderRef.current?.state === 'recording') {
        setNote({ kind: 'hidden', text: 'Recording stopped when you left the page. Your video is saved.' });
      }
      setVisible(isVisible);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Start (or restart) the video stream.
  useEffect(() => {
    if (!visible) {
      stopAll();
      return;
    }
    const gen = ++generation.current;
    setStatus('starting');
    setTorch({ available: false, on: false });
    (async () => {
      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setProblem('insecure');
        setStatus('error');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem('unsupported');
        setStatus('error');
        return;
      }
      stopStream(streamRef.current);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (gen !== generation.current) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch({ available: Boolean(caps.torch), on: false });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay is allowed for muted inline video; ignore odd browsers */
          }
        }
        setProblem(null);
        setStatus('ready');
      } catch (err) {
        if (gen !== generation.current) return;
        setProblem(cameraProblemOf(err));
        setStatus('error');
      }
    })();
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing, visible, retryKey, stopAll]);

  // The microphone is released when leaving video mode or the page.
  useEffect(() => {
    if (mode !== 'VIDEO' || !visible) {
      stopStream(audioRef.current);
      audioRef.current = null;
    }
  }, [mode, visible]);

  /**
   * Asks for the microphone. Must be called straight from a tap (choosing Video, "Allow
   * microphone", or the record button): iPhone Safari may refuse or skip the prompt otherwise.
   */
  const requestMic = useCallback(async (): Promise<boolean> => {
    if (audioRef.current?.getAudioTracks().some((t) => t.readyState === 'live')) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      audioRef.current = audio;
      setNote((n) => (n?.kind === 'mic' ? null : n));
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setNote({
        kind: 'mic',
        text:
          name === 'NotAllowedError' || name === 'SecurityError'
            ? micBlockedText()
            : name === 'NotFoundError'
              ? 'No microphone was found, so videos will be silent.'
              : 'The microphone is busy or unavailable, so videos will be silent. Close other apps using it and try again.',
      });
      return false;
    }
  }, []);

  const chooseMode = (m: ShotKind) => {
    setMode(m);
    if (m === 'VIDEO') void requestMic();
  };

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const buzz = () => {
    try {
      navigator.vibrate?.(30);
    } catch {
      /* ignore */
    }
  };

  const takePhoto = async () => {
    const stream = streamRef.current;
    const track = stream?.getVideoTracks()[0];
    const video = videoRef.current;
    if (!track || !video || busy) return;
    setBusy(true);
    setFlash((n) => n + 1);
    buzz();
    try {
      let blob: Blob | null = null;
      let width: number | undefined;
      let height: number | undefined;
      const IC = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
      if (IC) {
        try {
          blob = await new IC(track).takePhoto();
        } catch {
          blob = null;
        }
      }
      if (!blob) {
        const settings = track.getSettings?.() ?? {};
        width = video.videoWidth || settings.width || 1280;
        height = video.videoHeight || settings.height || 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      }
      if (blob) onCapture({ blob, kind: 'PHOTO', width, height });
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (!audioRef.current) await requestMic();
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setNote({ kind: 'limit', text: 'This browser can’t record video here. Use your phone’s camera app instead.' });
      return;
    }
    const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
    const tracks = [...stream.getVideoTracks(), ...(audioRef.current?.getAudioTracks() ?? [])];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 5_000_000 });
    } catch {
      setNote({ kind: 'limit', text: 'This browser can’t record video here. Use your phone’s camera app instead.' });
      return;
    }
    const chunks: Blob[] = [];
    let bytes = 0;
    const started = Date.now();
    let hitLimit = false;
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      chunks.push(e.data);
      bytes += e.data.size;
      if (!hitLimit && shouldStopRecording(bytes, maxVideoBytes) && recorder.state === 'recording') {
        hitLimit = true;
        recorder.stop();
      }
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      setRecording(false);
      const mime = baseMime(recorder.mimeType || type || 'video/webm');
      const blob = new Blob(chunks, { type: mime });
      if (blob.size > 0) onCapture({ blob, kind: 'VIDEO', durationSec: (Date.now() - started) / 1000 });
      if (hitLimit) setNote({ kind: 'limit', text: `Recording stopped: videos can be at most ${formatSize(maxVideoBytes)}.` });
    };
    recorderRef.current = recorder;
    setNote((n) => (n?.kind === 'mic' ? n : null));
    recorder.start(500);
    setRecording(true);
    buzz();
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ available: true, on: next });
    } catch {
      setTorch({ available: false, on: false });
    }
  };

  const shutter = () => {
    if (mode === 'PHOTO') void takePhoto();
    else if (recording) stopRecording();
    else void startRecording();
  };

  const iconButton =
    'flex size-12 items-center justify-center rounded-full bg-black/45 text-ivory backdrop-blur-sm transition active:scale-95 disabled:opacity-40 [&_svg]:size-6';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-ivory" role="dialog" aria-modal="true" aria-label="Camera">
      <video
        ref={videoRef}
        className={cn('absolute inset-0 size-full object-cover', facing === 'user' && '-scale-x-100')}
        playsInline
        muted
        autoPlay
        aria-hidden
      />

      <AnimatePresence>
        {flash > 0 && !reduceMotion && (
          <motion.div
            key={flash}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-white"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          />
        )}
      </AnimatePresence>

      <div className="relative flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" className={iconButton} onClick={onClose} aria-label="Close camera" disabled={recording}>
          <X aria-hidden />
        </button>
        {recording ? (
          <span className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 font-mono text-sm tabular-nums" role="timer" aria-live="off">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
            {formatDuration(elapsed)}
          </span>
        ) : (
          <span />
        )}
        {torch.available ? (
          <button type="button" className={iconButton} onClick={toggleTorch} aria-label={torch.on ? 'Turn light off' : 'Turn light on'} aria-pressed={torch.on}>
            {torch.on ? <Zap aria-hidden className="text-gold" /> : <ZapOff aria-hidden />}
          </button>
        ) : (
          <span className="size-12" />
        )}
      </div>

      {status === 'error' && problem && (
        <div className="relative mx-auto my-auto w-full max-w-sm px-6 text-center" role="alert">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-gold/40 text-gold">
            <CameraOff className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-[15px] leading-relaxed text-ivory/85">{CAMERA_PROBLEM_TEXT[problem]}</p>
          <div className="mt-6 space-y-3 text-left">{fallback}</div>
          {(problem === 'denied' || problem === 'busy' || problem === 'other') && (
            <button type="button" className="mt-4 inline-flex h-12 items-center gap-2 px-4 text-sm text-champagne underline-offset-4 hover:underline" onClick={() => setRetryKey((k) => k + 1)}>
              <RefreshCcw className="size-4" aria-hidden /> Try the camera again
            </button>
          )}
        </div>
      )}

      {status !== 'error' && <div className="flex-1" />}

      {note && (
        <div className="relative mx-auto mb-3 flex max-w-xs flex-col items-center gap-2 rounded-2xl bg-black/65 px-4 py-2.5 text-center text-[13px] leading-snug text-champagne" role="status">
          <p>{note.text}</p>
          {note.kind === 'mic' && mode === 'VIDEO' && (
            <button type="button" onClick={() => void requestMic()} className="h-10 rounded-full bg-gold px-4 text-[13px] font-semibold text-navy">
              Allow microphone
            </button>
          )}
        </div>
      )}

      {status !== 'error' && (
        <div className="relative bg-gradient-to-t from-black/80 to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          {videoEnabled && (
            <div className="mx-auto mb-5 flex w-fit rounded-full bg-black/50 p-1 text-[13px] font-medium uppercase tracking-[0.18em]" role="radiogroup" aria-label="Camera mode">
              {(['PHOTO', 'VIDEO'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={recording}
                  onClick={() => chooseMode(m)}
                  className={cn('h-10 min-w-20 rounded-full px-4 transition', mode === m ? 'bg-gold text-navy' : 'text-ivory/75')}
                >
                  {m === 'PHOTO' ? 'Photo' : 'Video'}
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto flex max-w-sm items-center justify-between">
            <button
              type="button"
              onClick={onOpenShots}
              disabled={recording}
              className="relative size-14 overflow-hidden rounded-xl border-2 border-ivory/70 bg-white/10 disabled:opacity-40"
              aria-label={`My shots (${count})`}
            >
              {lastShot ? (
                lastShot.kind === 'VIDEO' ? (
                  <>
                    <video src={lastShot.url} className="size-full object-cover" muted playsInline preload="metadata" aria-hidden />
                    <Play className="absolute inset-0 m-auto size-5 fill-ivory" aria-hidden />
                  </>
                ) : (
                  <img src={lastShot.url} alt="" className="size-full object-cover" />
                )
              ) : (
                <Images className="m-auto size-6 text-ivory/70" aria-hidden />
              )}
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-gold px-1 text-center text-[11px] font-semibold leading-5 text-navy">{count}</span>
              )}
            </button>

            <button
              type="button"
              onClick={shutter}
              disabled={status !== 'ready' || busy}
              aria-label={mode === 'PHOTO' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
              className="flex size-20 items-center justify-center rounded-full border-4 border-ivory transition active:scale-95 disabled:opacity-50"
            >
              <span
                className={cn(
                  'block transition-all',
                  mode === 'PHOTO' ? 'size-16 rounded-full bg-ivory' : recording ? 'size-8 rounded-md bg-red-500' : 'size-16 rounded-full bg-red-500',
                )}
              />
            </button>

            <button
              type="button"
              className={iconButton}
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              disabled={recording || status !== 'ready'}
              aria-label="Flip camera"
            >
              <SwitchCamera aria-hidden />
            </button>
          </div>
          {status === 'starting' && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-ivory/60">
              <Camera className="size-3.5" aria-hidden /> Starting camera…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
