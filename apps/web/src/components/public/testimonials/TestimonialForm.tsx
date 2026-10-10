import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Film, ImagePlus, X } from 'lucide-react';
import type { SubmitTestimonialResult } from '@birthday/types';
import { api, errorMessage, isApiError, isServerUnreachable, UNREACHABLE_FORM_MESSAGE, uploadWithProgress } from '@/lib/api';
import { publicKeys } from '@/lib/public-api';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';

export const testimonialSchema = z.object({
  authorName: z.string().trim().min(2, 'Please enter your name (at least 2 characters).').max(80, 'Please keep your name under 80 characters.'),
  relationship: z.string().trim().max(80, 'Please keep this under 80 characters.'),
  email: z
    .string()
    .trim()
    .max(254, 'Please keep your email under 254 characters.')
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Please enter a valid email address, or leave it empty.'),
  message: z
    .string()
    .trim()
    .min(10, 'Please write at least 10 characters.')
    .max(2000, 'Please keep your message under 2,000 characters.'),
});

export type TestimonialValues = z.infer<typeof testimonialSchema>;
const FIELDS = ['authorName', 'relationship', 'email', 'message'] as const;

function FilePick({
  kind,
  file,
  onChange,
  disabled,
}: {
  kind: 'photo' | 'video';
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const Icon = kind === 'photo' ? ImagePlus : Film;
  const label = kind === 'photo' ? 'Add a photo' : 'Add a short video';
  return (
    <div className="min-w-0 flex-1">
      {file ? (
        <div className="flex h-12 items-center gap-3 rounded-xl border border-gold/40 bg-cream/60 px-3 text-sm text-navy">
          <Icon className="size-4 shrink-0 text-gold-rich" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = '';
            }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-navy/5"
            aria-label={`Remove ${file.name}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-navy/25 text-sm font-medium text-navy transition-colors hover:border-gold-rich hover:bg-cream/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-rich',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <Icon className="size-4 text-gold-rich" aria-hidden /> {label}
          <span className="text-xs font-normal text-muted">(optional)</span>
        </label>
      )}
      <input
        ref={ref}
        id={id}
        type="file"
        accept={kind === 'photo' ? 'image/*' : 'video/*'}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          if (picked && !picked.type.startsWith(kind === 'photo' ? 'image/' : 'video/')) {
            toast.error(kind === 'photo' ? 'Please choose an image file.' : 'Please choose a video file.');
            e.target.value = '';
            return;
          }
          onChange(picked);
        }}
      />
    </div>
  );
}

/** "Leave a birthday message" — multipart POST /api/testimonials. */
export function TestimonialForm({ allowPhotos, allowVideos, celebrantFirstName }: { allowPhotos: boolean; allowVideos: boolean; celebrantFirstName?: string }) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitTestimonialResult | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TestimonialValues>({
    resolver: zodResolver(testimonialSchema),
    defaultValues: { authorName: '', relationship: '', email: '', message: '' },
  });
  const messageLength = watch('message')?.length ?? 0;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const form = new FormData();
    form.set('authorName', values.authorName);
    if (values.relationship) form.set('relationship', values.relationship);
    if (values.email) form.set('email', values.email);
    form.set('message', values.message);
    if (allowPhotos && photo) form.set('photo', photo);
    if (allowVideos && video) form.set('video', video);
    try {
      const res =
        photo || video
          ? await uploadWithProgress<SubmitTestimonialResult>('/testimonials', form, (p) => setProgress(p.percent))
          : await api.post<SubmitTestimonialResult>('/testimonials', form);
      setResult(res);
      reset();
      setPhoto(null);
      setVideo(null);
      if (res.status === 'APPROVED') void queryClient.invalidateQueries({ queryKey: [...publicKeys.all, 'testimonials'] });
      toast.success('Thank you for your message');
    } catch (error) {
      if (isServerUnreachable(error)) {
        setFormError(UNREACHABLE_FORM_MESSAGE);
      } else if (isApiError(error, 'VALIDATION_FAILED') && error.details) {
        let mapped = false;
        const other: string[] = [];
        for (const [key, messages] of Object.entries(error.details)) {
          if ((FIELDS as readonly string[]).includes(key)) {
            setError(key as (typeof FIELDS)[number], { message: messages[0] });
            mapped = true;
          } else if (messages[0]) {
            // e.g. photo / video: the server explains exactly what is wrong with the file.
            other.push(messages[0]);
          }
        }
        if (other.length) setFormError(other.join(' '));
        else if (!mapped) setFormError(error.message);
      } else if (isApiError(error, 'TESTIMONIALS_CLOSED')) {
        setFormError('The message book has closed. Thank you for thinking of us.');
      } else if (isApiError(error, 'FILE_TOO_LARGE') || isApiError(error, 'PAYLOAD_TOO_LARGE')) {
        // The server's message names the real limit, e.g. "Photos can be up to 10 MB".
        setFormError(error.message || 'That file is too large. Please choose a smaller photo or a shorter video.');
      } else if (isApiError(error, 'UNSUPPORTED_FILE_TYPE')) {
        setFormError(error.message || 'That file type is not supported. Please choose a JPEG, PNG or HEIC photo, or an MP4 or MOV video.');
      } else if (isApiError(error, 'RATE_LIMITED')) {
        setFormError('You have sent several messages in a short time. Please wait a minute and try again.');
      } else {
        setFormError(errorMessage(error));
      }
    } finally {
      setProgress(null);
    }
  });

  if (result) {
    const published = result.status === 'APPROVED';
    return (
      <div role="status" className="flex flex-col items-center rounded-2xl border border-gold/30 bg-white px-6 py-12 text-center shadow-soft">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald text-ivory">
          <Check className="size-7" aria-hidden />
        </span>
        <h3 className="mt-5 font-display text-2xl text-navy">Thank you for your message</h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-charcoal/80">
          {published
            ? 'Your message is now on the tribute wall.'
            : `Your message has been received. It will appear on this page after the family reviews it${celebrantFirstName ? `, and ${celebrantFirstName} will read every word` : ''}.`}
        </p>
        <Button variant="outline" className="mt-7 text-navy" onClick={() => setResult(null)}>
          Write another message
        </Button>
      </div>
    );
  }

  const busy = isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 rounded-2xl border border-gold/30 bg-white p-6 shadow-soft sm:p-8" aria-labelledby="leave-message-heading">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="t-name" error={errors.authorName?.message} required>
          <Input id="t-name" autoComplete="name" placeholder="e.g. Adaeze Okafor" aria-invalid={!!errors.authorName} aria-describedby="t-name-msg" {...register('authorName')} />
        </Field>
        <Field label="Relationship" htmlFor="t-rel" error={errors.relationship?.message} hint="e.g. Former colleague, Grandson">
          <Input id="t-rel" placeholder="e.g. Niece" aria-invalid={!!errors.relationship} aria-describedby="t-rel-msg" {...register('relationship')} />
        </Field>
      </div>
      <Field label="Email" htmlFor="t-email" error={errors.email?.message} hint="Optional. Only the family sees it; never published.">
        <Input id="t-email" type="email" placeholder="you@example.com" inputMode="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="t-email-msg" {...register('email')} />
      </Field>
      <Field label="Your message" htmlFor="t-msg" error={errors.message?.message} required hint={`${messageLength} / 2000`}>
        <Textarea id="t-msg" rows={6} maxLength={2000} placeholder="Share a memory or a birthday wish…" aria-invalid={!!errors.message} aria-describedby="t-msg-msg" {...register('message')} />
      </Field>
      {(allowPhotos || allowVideos) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {allowPhotos && <FilePick kind="photo" file={photo} onChange={setPhoto} disabled={busy} />}
          {allowVideos && <FilePick kind="video" file={video} onChange={setVideo} disabled={busy} />}
        </div>
      )}
      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-navy/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading">
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      {formError && (
        <p role="alert" className="rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-sm text-error">
          {formError}
        </p>
      )}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Messages are reviewed by the family before they appear.</p>
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? (progress !== null ? `Sending… ${progress}%` : 'Sending…') : 'Send my message'}
        </Button>
      </div>
    </form>
  );
}
