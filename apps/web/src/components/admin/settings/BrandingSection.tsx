import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminSettings, PublicMedia } from '@birthday/types';
import { nullIfBlank, reportFormError } from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { AButton, AField, AInput, ATextarea, Panel, describedBy } from '@/components/admin/ui';
import { MediaField } from '@/components/admin/media';
import { SectionFooter, useFollowSettings, useReportDirty, useSaveSettings, type SectionProps } from './shared';

const HEX = /^#[0-9a-f]{6}$/i;
/** The site's built-in colours: dark navy and gold. */
export const DEFAULT_PRIMARY_COLOR = '#071A2B';
export const DEFAULT_ACCENT_COLOR = '#D6B36A';
const DESCRIPTION_TARGET = 160;

const schema = z.object({
  primaryColor: z.string().trim().regex(HEX, 'Use a 6-digit hex colour such as #071A2B.'),
  secondaryColor: z.string().trim().regex(HEX, 'Use a 6-digit hex colour such as #D6B36A.'),
  logoMediaId: z.string().nullable(),
  heroMediaId: z.string().nullable(),
  ogImageMediaId: z.string().nullable(),
  siteTitle: z.string().max(120, 'Keep the site title under 120 characters.'),
  siteDescription: z.string().max(300, 'Keep the description under 300 characters.'),
});
type FormValues = z.infer<typeof schema>;

type Preview = Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null;
type MediaKey = 'logoMediaId' | 'heroMediaId' | 'ogImageMediaId';

function toForm(s: AdminSettings): FormValues {
  return {
    primaryColor: s.primaryColor,
    secondaryColor: s.secondaryColor,
    logoMediaId: s.logoMediaId,
    heroMediaId: s.heroMediaId,
    ogImageMediaId: s.ogImageMediaId,
    siteTitle: s.siteTitle ?? '',
    siteDescription: s.siteDescription ?? '',
  };
}

function toPreviews(s: AdminSettings): Record<MediaKey, Preview> {
  return { logoMediaId: s.logo, heroMediaId: s.hero, ogImageMediaId: s.ogImage };
}

/** Colour picker and hex text box bound to the same form field. */
function ColorField({
  control,
  name,
  label,
  hint,
  defaultColor,
}: {
  control: Control<FormValues>;
  name: 'primaryColor' | 'secondaryColor';
  label: string;
  hint: string;
  defaultColor: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const valid = HEX.test(field.value);
        const error = fieldState.error?.message;
        return (
          <AField label={label} htmlFor={name} error={error} hint={hint}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} picker`}
                value={valid ? field.value.toLowerCase() : '#000000'}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                onBlur={field.onBlur}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-navy/15 bg-white p-1 md:h-9"
              />
              <AInput
                id={name}
                ref={field.ref}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                maxLength={7}
                placeholder="#071A2B"
                spellCheck={false}
                autoCapitalize="off"
                className="w-28 font-mono uppercase"
                aria-invalid={!!error}
                aria-describedby={describedBy(name, error, hint)}
              />
              <span
                aria-hidden
                className={cn('size-8 shrink-0 rounded-full ring-1 ring-navy/15', !valid && 'bg-[repeating-linear-gradient(45deg,#eee_0_4px,#fff_4px_8px)]')}
                style={valid ? { backgroundColor: field.value } : undefined}
              />
              <AButton
                size="sm"
                variant="ghost"
                onClick={() => field.onChange(defaultColor)}
                disabled={field.value.toUpperCase() === defaultColor}
                aria-label={`Reset ${label.toLowerCase()} to default (${defaultColor})`}
              >
                Reset to default
              </AButton>
            </div>
          </AField>
        );
      }}
    />
  );
}

export function BrandingSection({ settings, onDirtyChange }: SectionProps) {
  const [previews, setPreviews] = useState(() => toPreviews(settings));
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(settings) });

  const resetTo = (s: AdminSettings) => {
    reset(toForm(s));
    setPreviews(toPreviews(s));
  };

  useReportDirty(isDirty, onDirtyChange);
  useFollowSettings(settings, isDirty, () => resetTo(settings));

  const save = useSaveSettings({
    success: 'Branding saved',
    onSaved: resetTo,
    onError: (error) => reportFormError(error, setError),
  });

  const primary = watch('primaryColor');
  const secondary = watch('secondaryColor');
  const siteTitle = watch('siteTitle');
  const description = watch('siteDescription');
  const bothValid = HEX.test(primary) && HEX.test(secondary);
  const colorsAreDefault = primary.toUpperCase() === DEFAULT_PRIMARY_COLOR && secondary.toUpperCase() === DEFAULT_ACCENT_COLOR;

  const resetColors = () => {
    setValue('primaryColor', DEFAULT_PRIMARY_COLOR, { shouldDirty: true, shouldValidate: true });
    setValue('secondaryColor', DEFAULT_ACCENT_COLOR, { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = handleSubmit((values) =>
    save.mutate({
      primaryColor: values.primaryColor.toUpperCase(),
      secondaryColor: values.secondaryColor.toUpperCase(),
      logoMediaId: values.logoMediaId,
      heroMediaId: values.heroMediaId,
      ogImageMediaId: values.ogImageMediaId,
      siteTitle: nullIfBlank(values.siteTitle),
      siteDescription: nullIfBlank(values.siteDescription),
    }),
  );

  const mediaFields: { key: MediaKey; label: string; hint: string }[] = [
    { key: 'logoMediaId', label: 'Logo', hint: 'Shown in the site header. A transparent PNG works best.' },
    { key: 'heroMediaId', label: 'Hero image', hint: 'The large image at the top of the home page.' },
    { key: 'ogImageMediaId', label: 'Social sharing image', hint: 'Shown when the site is shared on WhatsApp, Facebook and others. 1200 × 630 is ideal.' },
  ];

  const descriptionLength = description.length;

  return (
    <Panel id="settings-branding" title="Branding" description="Colours, images and the text search engines and social apps show for the public site.">
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-4 rounded-lg bg-cream/60 px-3 py-2.5 text-[13px] leading-relaxed text-charcoal">
          <p className="font-medium text-navy">What branding changes on the public site</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              <span className="font-medium">Primary colour</span>: the dark backgrounds of the header, the hero section at the top of the home page, and
              the footer. The default is dark navy.
            </li>
            <li>
              <span className="font-medium">Accent colour</span>: buttons, highlights and the large &ldquo;70&rdquo;. The default is gold.
            </li>
            <li>
              <span className="font-medium">Logo</span>: shown in the site header.
            </li>
            <li>
              <span className="font-medium">Hero image</span>: the big photo at the top of the home page.
            </li>
            <li>
              <span className="font-medium">Social sharing image</span>: the picture shown when someone shares the site link on WhatsApp, Facebook or X.
            </li>
            <li>
              <span className="font-medium">Site title and description</span>: the name in the browser tab and the text shown in search results.
            </li>
          </ul>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ColorField
            control={control}
            name="primaryColor"
            label="Primary colour"
            hint={`Header, hero and footer backgrounds. Default ${DEFAULT_PRIMARY_COLOR} (navy).`}
            defaultColor={DEFAULT_PRIMARY_COLOR}
          />
          <ColorField
            control={control}
            name="secondaryColor"
            label="Accent colour"
            hint={`Buttons, highlights and the "70". Default ${DEFAULT_ACCENT_COLOR} (gold).`}
            defaultColor={DEFAULT_ACCENT_COLOR}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AButton size="sm" onClick={resetColors} disabled={colorsAreDefault}>
            Reset colours to default
          </AButton>
          <span className="text-xs text-muted">Fills in navy and gold. Save to apply them to the site.</span>
        </div>

        <div className="mt-3" aria-hidden>
          <div
            className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
            style={bothValid ? { backgroundColor: primary, borderBottom: `3px solid ${secondary}` } : undefined}
          >
            {bothValid ? (
              <>
                <span className="truncate font-display text-base text-white">{siteTitle.trim() || 'Your celebration'}</span>
                <span className="shrink-0 rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: secondary, color: primary }}>
                  RSVP
                </span>
              </>
            ) : (
              <span className="text-xs text-muted">Enter valid colours to see a preview.</span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-navy/[0.08] pt-4 md:grid-cols-3">
          {mediaFields.map(({ key, label, hint }) => (
            <Controller
              key={key}
              control={control}
              name={key}
              render={({ field }) => (
                <MediaField
                  id={`branding-${key}`}
                  label={label}
                  hint={hint}
                  value={field.value}
                  preview={previews[key]}
                  onChange={(id, media) => {
                    field.onChange(id);
                    setPreviews((p) => ({ ...p, [key]: media }));
                  }}
                />
              )}
            />
          ))}
        </div>

        <div className="mt-5 grid gap-4 border-t border-navy/[0.08] pt-4">
          <AField label="Site title" htmlFor="siteTitle" error={errors.siteTitle?.message} hint="Browser tabs and search results. Leave blank to use the event name.">
            <AInput
              id="siteTitle"
              maxLength={120}
              placeholder="e.g. Celebrating Mama at 70"
              aria-invalid={!!errors.siteTitle}
              aria-describedby={describedBy('siteTitle', errors.siteTitle, true)}
              {...register('siteTitle')}
            />
          </AField>
          <AField
            label="Site description"
            htmlFor="siteDescription"
            error={errors.siteDescription?.message}
            hint="The summary shown under the title in search results and link previews."
          >
            <ATextarea
              id="siteDescription"
              rows={3}
              maxLength={300}
              placeholder="e.g. Join the family to celebrate 70 years of love, faith and laughter."
              aria-invalid={!!errors.siteDescription}
              aria-describedby={cn(describedBy('siteDescription', errors.siteDescription, true), 'siteDescription-count')}
              {...register('siteDescription')}
            />
          </AField>
          <p
            id="siteDescription-count"
            className={cn('-mt-3 text-right text-xs tabular-nums', descriptionLength > DESCRIPTION_TARGET ? 'text-warning' : 'text-muted')}
          >
            {descriptionLength} / {DESCRIPTION_TARGET} characters
            {descriptionLength > DESCRIPTION_TARGET && ' · search engines may cut the rest'}
          </p>
        </div>

        <SectionFooter dirty={isDirty} saving={save.isPending} onDiscard={() => resetTo(settings)} />
      </form>
    </Panel>
  );
}
