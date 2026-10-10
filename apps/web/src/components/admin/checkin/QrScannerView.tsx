import { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { CameraOff, Flashlight, FlashlightOff, Lock, RefreshCw, SwitchCamera, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type ScannerStatus = 'starting' | 'running' | 'paused' | 'insecure' | 'no-camera' | 'denied' | 'error';

const STATUS_MESSAGE: Partial<Record<ScannerStatus, { title: string; body: string; icon: typeof CameraOff }>> = {
  insecure: {
    title: 'Camera needs a secure connection',
    body: 'Open this page over HTTPS to use the camera. You can still enter a code or search by name below.',
    icon: Lock,
  },
  'no-camera': {
    title: 'No camera found',
    body: 'This device has no camera we can use. Enter the invitation code or search by name instead.',
    icon: VideoOff,
  },
  denied: {
    title: 'Camera access was blocked',
    body: 'Allow camera access for this site in your browser settings, then try again. Or enter a code / search by name below.',
    icon: CameraOff,
  },
  error: {
    title: 'The camera could not start',
    body: 'Another app may be using it. Try again, or enter a code / search by name below.',
    icon: CameraOff,
  },
};

function classifyError(error: unknown): ScannerStatus {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (name === 'NotAllowedError' || name === 'SecurityError' || message.includes('permission') || message.includes('denied')) return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || message.includes('not found') || message.includes('no camera')) return 'no-camera';
  return 'error';
}

/**
 * Live camera QR scanner (qr-scanner). Runs only while `active`; the stream is
 * stopped otherwise (and while the tab is hidden), and destroyed on unmount.
 */
export function QrScannerView({ active, onScan, className }: { active: boolean; onScan: (value: string) => void; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [status, setStatus] = useState<ScannerStatus>('starting');
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  // Create the scanner once; destroy it (and its media tracks) on unmount.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus('insecure');
      return;
    }
    const scanner = new QrScanner(video, (result) => onScanRef.current(result.data), {
      returnDetailedScanResult: true,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      preferredCamera: 'environment',
      maxScansPerSecond: 8,
    });
    scannerRef.current = scanner;
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const shouldRun = active && !hidden;

  // Start/stop the stream as the page state changes.
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (!shouldRun) {
      scanner.stop();
      setStatus((s) => (s === 'running' || s === 'starting' ? 'paused' : s));
      setFlashOn(false);
      return;
    }
    let cancelled = false;
    setStatus('starting');
    scanner
      .start()
      .then(async () => {
        if (cancelled) return;
        setStatus('running');
        try {
          const [list, flash] = await Promise.all([QrScanner.listCameras(true), scanner.hasFlash()]);
          if (cancelled) return;
          setCameras(list);
          setHasFlash(flash);
        } catch {
          // Camera labels are optional.
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(classifyError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [shouldRun, attempt]);

  const switchCamera = async () => {
    const scanner = scannerRef.current;
    if (!scanner || cameras.length < 2) return;
    const next = (cameraIndex + 1) % cameras.length;
    setCameraIndex(next);
    try {
      await scanner.setCamera(cameras[next].id);
      setHasFlash(await scanner.hasFlash());
      setFlashOn(false);
    } catch (error) {
      setStatus(classifyError(error));
    }
  };

  const toggleFlash = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      setHasFlash(false);
    }
  };

  const problem = STATUS_MESSAGE[status];

  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-navy', className)}>
      {/* qr-scanner appends its scan-region overlay next to the video, so the video gets its own wrapper. */}
      <div className={cn('relative', problem && 'invisible')}>
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview for scanning invitation QR codes"
          className="aspect-square w-full object-cover sm:aspect-[4/3]"
        />
      </div>
      {status === 'starting' && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80" role="status">
          Starting camera…
        </p>
      )}
      {status === 'running' && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white drop-shadow">
          Point the camera at the guest&apos;s QR code
        </p>
      )}
      {problem && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
          <problem.icon className="size-8 text-gold" aria-hidden />
          <p className="font-semibold">{problem.title}</p>
          <p className="max-w-xs text-sm text-white/75">{problem.body}</p>
          {(status === 'denied' || status === 'error') && (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-navy"
            >
              <RefreshCw className="size-4" aria-hidden /> Try again
            </button>
          )}
        </div>
      )}
      {status === 'running' && (cameras.length > 1 || hasFlash) && (
        <div className="absolute right-2 top-2 flex gap-2">
          {hasFlash && (
            <button
              type="button"
              onClick={() => void toggleFlash()}
              aria-pressed={flashOn}
              aria-label={flashOn ? 'Turn torch off' : 'Turn torch on'}
              className="flex size-11 items-center justify-center rounded-full bg-navy/70 text-white backdrop-blur"
            >
              {flashOn ? <FlashlightOff className="size-5" aria-hidden /> : <Flashlight className="size-5" aria-hidden />}
            </button>
          )}
          {cameras.length > 1 && (
            <button
              type="button"
              onClick={() => void switchCamera()}
              aria-label={`Switch camera (now: ${cameras[cameraIndex]?.label || `camera ${cameraIndex + 1}`})`}
              className="flex size-11 items-center justify-center rounded-full bg-navy/70 text-white backdrop-blur"
            >
              <SwitchCamera className="size-5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
