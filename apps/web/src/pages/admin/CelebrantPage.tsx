import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminCelebrant, PublicMedia, UpdateCelebrantRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { celebrantQuery } from '@/lib/admin-queries';
import { paragraphs } from '@/lib/utils';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { AField, AInput, ATextarea, PageHeader, Panel, describedBy } from '@/components/admin/ui';
import { MediaField } from '@/components/admin/media';
import { StringListEditor } from '@/components/admin/misc';
import { UnsavedChangesGuard } from '@/components/admin/overlays';
import { SaveBar } from '@/components/admin/content/SaveBar';

const optionalText = (max: number) =>
  z.string().refine((v) => v.trim().length <= max, `Keep this to ${max.toLocaleString()} characters or fewer.`);
const listItems = (itemMax: number, noun: string) =>
  z
    .array(z.string().refine((v) => v.trim().length <= itemMax, `Keep each ${noun} to ${itemMax} characters or fewer.`))
    .refine((items) => items.filter((s) => s.trim()).length <= 30, `Add up to 30 ${noun}s.`);

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter the full name.').min(2, 'Use at least 2 characters.').max(150, 'Keep this to 150 characters or fewer.'),
  preferredName: z.string().trim().min(1, 'Enter the name guests know them by.').max(80, 'Keep this to 80 characters or fewer.'),
  honorific: optionalText(40),
  birthDate: z
    .string()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a full date.')
    .refine((v) => v === '' || v <= new Date().toISOString().slice(0, 10), 'The birth date cannot be in the future.'),
  birthPlace: optionalText(150),
  heroHeadline: optionalText(200),
  introduction: optionalText(2000),
  biography: optionalText(20000),
  quote: optionalText(600),
  quoteAttribution: optionalText(150),
  achievements: listItems(300, 'achievement'),
  values: listItems(200, 'value'),
  portraitMediaId: z.string().nullable(),
});

type FormValues = z.infer<typeof schema>;
type TextKey = 'fullName' | 'preferredName' | 'honorific' | 'birthPlace' | 'heroHeadline' | 'quoteAttribution';
type Preview = Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null;

function toForm(c: AdminCelebrant): FormValues {
  return {
    fullName: c.fullName,
    preferredName: c.preferredName,
    honorific: c.honorific ?? '',
    birthDate: c.birthDate ?? '',
    birthPlace: c.birthPlace ?? '',
    heroHeadline: c.heroHeadline ?? '',
    introduction: c.introduction ?? '',
    biography: c.biography ?? '',
    quote: c.quote ?? '',
    quoteAttribution: c.quoteAttribution ?? '',
    achievements: c.achievements,
    values: c.values,
    portraitMediaId: c.portraitMediaId,
  };
}

function toRequest(v: FormValues): UpdateCelebrantRequest {
  const list = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);
  return {
    fullName: v.fullName.trim(),
    preferredName: v.preferredName.trim(),
    honorific: nullIfBlank(v.honorific),
    birthDate: v.birthDate || null,
    birthPlace: nullIfBlank(v.birthPlace),
    heroHeadline: nullIfBlank(v.heroHeadline),
    introduction: nullIfBlank(v.introduction),
    // Keep the author's line breaks; only trim the ends.
    biography: v.biography.trim() === '' ? null : v.biography.replace(/\s+$/, '').replace(/^\s*\n/, ''),
    quote: nullIfBlank(v.quote),
    quoteAttribution: nullIfBlank(v.quoteAttribution),
    achievements: list(v.achievements),
    values: list(v.values),
    portraitMediaId: v.portraitMediaId,
  };
}

export default function CelebrantPage() {
  const query = useQuery(celebrantQuery);

  return (
    <>
      <PageHeader
        title="Celebrant"
        description="The name, story and portrait shown on the home page and the biography page."
      />
      {query.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" aria-busy>
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <CelebrantForm celebrant={query.data} />
      )}
    </>
  );
}

function CelebrantForm({ celebrant }: { celebrant: AdminCelebrant }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(celebrant);
  const [portrait, setPortrait] = useState<Preview>(celebrant.portrait);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(celebrant) });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = form;

  const save = useAdminMutation<AdminCelebrant, UpdateCelebrantRequest>({
    mutationFn: (body) => api.put<AdminCelebrant>('/admin/celebrant', body),
    invalidate: [adminKeys.celebrant],
    success: 'Celebrant details saved.',
    toastError: false,
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.celebrant, data);
      setSaved(data);
      setPortrait(data.portrait);
      reset(toForm(data));
    },
    onError: (error) => reportFormError(error, setError),
  });

  const biography = watch('biography');
  const paragraphCount = paragraphs(biography).length;
  const portraitMediaId = watch('portraitMediaId');

  const resetForm = () => {
    reset(toForm(saved));
    setPortrait(saved.portrait);
  };

  const text = (name: TextKey, label: string, opts: { required?: boolean; hint?: string; placeholder?: string; className?: string } = {}) => {
    const id = `celebrant-${name}`;
    const error = errors[name]?.message;
    return (
      <AField label={label} htmlFor={id} required={opts.required} error={error} hint={opts.hint} className={opts.className}>
        <AInput
          id={id}
          placeholder={opts.placeholder}
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error, opts.hint)}
          {...register(name)}
        />
      </AField>
    );
  };

  return (
    <form id="celebrant-form" noValidate onSubmit={handleSubmit((values) => save.mutate(toRequest(values)))}>
      <UnsavedChangesGuard when={isDirty && !save.isPending} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel title="Name and birth" id="celebrant-name">
            <div className="grid gap-3 sm:grid-cols-2">
              {text('fullName', 'Full name', { required: true, placeholder: 'e.g. Chief Adebayo Olufemi Johnson' })}
              {text('preferredName', 'Preferred name', { required: true, hint: 'Used in headings, e.g. "Papa Femi".', placeholder: 'e.g. Mama Ngozi' })}
              {text('honorific', 'Honorific', { placeholder: 'e.g. Chief, Dr, Mrs' })}
              {text('birthPlace', 'Birthplace', { placeholder: 'e.g. Abeokuta, Ogun State' })}
              <AField
                label="Date of birth"
                htmlFor="celebrant-birthDate"
                error={errors.birthDate?.message}
                hint="Used to work out the age being celebrated."
              >
                <AInput
                  id="celebrant-birthDate"
                  type="date"
                  aria-invalid={!!errors.birthDate}
                  aria-describedby="celebrant-birthDate-msg"
                  {...register('birthDate')}
                />
              </AField>
              <div>
                <p className="mb-1 text-[13px] font-medium text-navy" id="celebrant-age-label">
                  Age being celebrated
                </p>
                <p
                  aria-labelledby="celebrant-age-label"
                  className="flex h-10 items-center rounded-lg border border-dashed border-navy/15 bg-cream/40 px-3 text-sm tabular-nums text-navy md:h-9"
                >
                  {saved.age ?? '—'}
                </p>
                <p className="mt-1 text-xs text-muted">Worked out from the birth date and the event date after saving.</p>
              </div>
            </div>
          </Panel>

          <Panel title="Home page introduction" id="celebrant-intro">
            <div className="space-y-3">
              {text('heroHeadline', 'Hero headline', { placeholder: 'e.g. Celebrating 70 years of grace' })}
              <AField
                label="Introduction"
                htmlFor="celebrant-introduction"
                error={errors.introduction?.message}
                hint="A short paragraph shown under the headline."
              >
                <ATextarea
                  id="celebrant-introduction"
                  rows={3}
                  placeholder="e.g. Join us as we celebrate a life of faith, family and service."
                  aria-invalid={!!errors.introduction}
                  aria-describedby="celebrant-introduction-msg"
                  {...register('introduction')}
                />
              </AField>
            </div>
          </Panel>

          <Panel title="Biography" id="celebrant-bio">
            <AField
              label="Life story"
              htmlFor="celebrant-biography"
              error={errors.biography?.message}
              hint={
                <>
                  Leave a blank line between paragraphs. Plain text only.{' '}
                  <span className="tabular-nums">
                    {paragraphCount} {paragraphCount === 1 ? 'paragraph' : 'paragraphs'}
                  </span>
                </>
              }
            >
              <ATextarea
                id="celebrant-biography"
                rows={16}
                placeholder="Where they grew up, their work, family and the moments people remember…"
                className="min-h-72"
                aria-invalid={!!errors.biography}
                aria-describedby="celebrant-biography-msg"
                {...register('biography')}
              />
            </AField>
          </Panel>

          <Panel title="Quote" id="celebrant-quote">
            <div className="space-y-3">
              <AField label="Quote" htmlFor="celebrant-quote-text" error={errors.quote?.message}>
                <ATextarea
                  id="celebrant-quote-text"
                  rows={2}
                  placeholder="e.g. Kindness costs nothing and returns everything."
                  aria-invalid={!!errors.quote}
                  aria-describedby={describedBy('celebrant-quote-text', errors.quote?.message)}
                  {...register('quote')}
                />
              </AField>
              {text('quoteAttribution', 'Attribution', { placeholder: 'e.g. Her favourite saying' })}
            </div>
          </Panel>

          <Panel title="Achievements and values" id="celebrant-lists">
            <div className="grid gap-6 xl:grid-cols-2">
              <Controller
                control={control}
                name="achievements"
                render={({ field }) => (
                  <StringListEditor
                    label="Achievements"
                    values={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. First female bank manager in Ibadan"
                    addLabel="Add achievement"
                    max={30}
                    maxLength={300}
                    error={errors.achievements?.message ?? errors.achievements?.find?.((e) => e)?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="values"
                render={({ field }) => (
                  <StringListEditor
                    label="Values"
                    values={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Integrity"
                    addLabel="Add value"
                    max={30}
                    maxLength={200}
                    error={errors.values?.message ?? errors.values?.find?.((e) => e)?.message}
                  />
                )}
              />
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Portrait" id="celebrant-portrait">
            <MediaField
              id="celebrant-portraitMediaId"
              label="Portrait photo"
              value={portraitMediaId}
              preview={portrait}
              hint="A clear, well-lit photo. Portrait orientation works best."
              onChange={(id, media) => {
                setValue('portraitMediaId', id, { shouldDirty: true });
                setPortrait(media);
              }}
            />
          </Panel>
        </div>
      </div>
      <SaveBar formId="celebrant-form" dirty={isDirty} saving={save.isPending} onReset={resetForm} />
    </form>
  );
}
