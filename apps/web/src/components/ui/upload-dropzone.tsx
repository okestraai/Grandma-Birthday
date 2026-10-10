import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { Film, ImagePlus, X } from 'lucide-react';
import { cn, formatSize } from '@/lib/utils';

export interface SelectedFile {
  id: string;
  file: File;
  previewUrl: string | null;
  kind: 'PHOTO' | 'VIDEO';
  /** Client-side check only; the server validates everything again. */
  error: string | null;
}

export interface UploadDropzoneProps {
  files: SelectedFile[];
  onFilesChange: (files: SelectedFile[]) => void;
  acceptedMimeTypes: string[];
  maxFiles: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  videoEnabled: boolean;
  disabled?: boolean;
  /** Per-file upload progress (0-100) keyed by SelectedFile.id. */
  progress?: Record<string, number>;
  label?: string;
  hint?: string;
  /** Large touch-first layout for the guest QR page. */
  variant?: 'guest' | 'admin';
}

let counter = 0;

function validate(file: File, props: Pick<UploadDropzoneProps, 'acceptedMimeTypes' | 'maxPhotoBytes' | 'maxVideoBytes' | 'videoEnabled'>): { kind: 'PHOTO' | 'VIDEO'; error: string | null } {
  const kind = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
  if (kind === 'VIDEO' && !props.videoEnabled) return { kind, error: 'Videos can’t be shared here, only photos.' };
  if (file.type && !props.acceptedMimeTypes.includes(file.type)) return { kind, error: 'This type of file isn’t supported.' };
  const limit = kind === 'VIDEO' ? props.maxVideoBytes : props.maxPhotoBytes;
  if (file.size > limit) {
    const noun = kind === 'VIDEO' ? 'video' : 'photo';
    return { kind, error: `This ${noun} is ${formatSize(file.size)}. ${kind === 'VIDEO' ? 'Videos' : 'Photos'} can be at most ${formatSize(limit)}.` };
  }
  return { kind, error: null };
}

/** Drag-and-drop or tap-to-pick file selector with previews. Revokes preview URLs on removal/unmount. */
export function UploadDropzone(props: UploadDropzoneProps) {
  const { files, onFilesChange, maxFiles, disabled, progress, acceptedMimeTypes, variant = 'admin' } = props;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Shown when more files were picked than there is room for. */
  const [overflow, setOverflow] = useState<number>(0);
  const filesRef = useRef(files);
  filesRef.current = files;

  useEffect(() => () => filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []);

  const add = (list: FileList | null) => {
    if (!list || disabled) return;
    const room = Math.max(0, maxFiles - files.length);
    const picked = Array.from(list);
    setOverflow(Math.max(0, picked.length - room));
    const next = picked
      .slice(0, room)
      .map<SelectedFile>((file) => {
        const { kind, error } = validate(file, props);
        return {
          id: `f${++counter}`,
          file,
          kind,
          error,
          previewUrl: !error && file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        };
      });
    onFilesChange([...files, ...next]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onFilesChange(files.filter((f) => f.id !== id));
    setOverflow(0);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  };

  const full = files.length >= maxFiles;

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition-colors',
          variant === 'guest' ? 'min-h-40 border-gold/60 bg-white/5 px-6 py-8' : 'min-h-32 border-navy/20 bg-white px-6 py-6',
          dragging && 'border-gold bg-gold/10',
          (disabled || full) && 'cursor-not-allowed opacity-60',
        )}
      >
        <ImagePlus className={cn(variant === 'guest' ? 'size-9 text-gold' : 'size-7 text-gold-rich')} aria-hidden />
        <span className={cn('font-medium', variant === 'guest' ? 'text-lg' : 'text-sm text-navy')}>
          {props.label ?? (variant === 'guest' ? 'Add photos' : 'Drop files here or click to browse')}
        </span>
        <span className={cn('text-sm', variant === 'guest' ? 'opacity-75' : 'text-muted')}>
          {props.hint ??
            `Up to ${maxFiles} files · photos ${formatSize(props.maxPhotoBytes)}${props.videoEnabled ? ` · videos ${formatSize(props.maxVideoBytes)}` : ''}`}
        </span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={acceptedMimeTypes.join(',')}
        className="sr-only"
        disabled={disabled || full}
        onChange={(e) => add(e.target.files)}
      />

      {overflow > 0 && (
        <p role="alert" className={cn('mt-3 text-sm', variant === 'guest' ? 'text-gold' : 'text-error')}>
          You can share up to {maxFiles} files at a time, so {overflow === 1 ? '1 file was' : `${overflow} files were`} not added. Share these
          first, then add the rest.
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Selected files">
          {files.map((item) => {
            const pct = progress?.[item.id];
            return (
              <li key={item.id} className="relative aspect-square overflow-hidden rounded-xl bg-navy/10">
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.file.name} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted">
                    <Film className="size-6" aria-hidden />
                    <span className="line-clamp-2 break-all">{item.file.name}</span>
                  </div>
                )}
                {item.error && (
                  <div className="absolute inset-0 flex items-end overflow-y-auto bg-error/80 p-2 pr-9 text-[11px] font-medium leading-tight text-white">{item.error}</div>
                )}
                {pct !== undefined && !item.error && (
                  <div className="absolute inset-x-0 bottom-0 h-1.5 bg-navy/30" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${item.file.name}`}>
                    <div className="h-full bg-gold transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-navy/70 text-white hover:bg-navy"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
