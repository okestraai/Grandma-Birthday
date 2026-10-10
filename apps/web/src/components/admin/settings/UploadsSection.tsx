import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminSettings } from '@birthday/types';
import { GB, MB, reportFormError } from '@/lib/admin-api';
import { formatBytes } from '@/lib/utils';
import { AField, AInput, ASelect, Panel, SwitchRow, describedBy } from '@/components/admin/ui';
import { useAlbums } from '@/components/admin/media';
import { SectionFooter, useFollowSettings, useReportDirty, useSaveSettings, type SectionProps } from './shared';

/** Megabytes as typed, within the API's byte range (see settings.dto.ts). */
const sizeMb = (label: string, min: number, max: number) => {
  const Label = label.charAt(0).toUpperCase() + label.slice(1);
  return z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .refine((v) => Number.isFinite(Number(v)), `${Label} must be a number.`)
    .refine((v) => Number(v) >= min, `${Label} must be at least ${min.toLocaleString('en')} MB.`)
    .refine((v) => Number(v) <= max, `${Label} must be ${max.toLocaleString('en')} MB or less.`);
};

/**
 * Field names match the API so VALIDATION_FAILED details land on the right control.
 * The two size fields hold megabytes (as typed); they are converted to bytes on save.
 */
const schema = z.object({
  storageQuotaBytes: z
    .string()
    .min(1, 'Choose a storage quota.')
    .refine((v) => Number(v) >= 100 * MB && Number(v) <= 2048 * GB, 'Choose a quota between 100 MB and 2 TB.'),
  // API: 100 KB to 1 GB for photos, 1 MB to 10 GB for videos.
  maxPhotoBytes: sizeMb('the photo size limit', 0.1, 1024),
  maxVideoBytes: sizeMb('the video size limit', 1, 10240),
  videoUploadsEnabled: z.boolean(),
  uploadModerationEnabled: z.boolean(),
  guestUploadsOpen: z.boolean(),
  maxFilesPerUpload: z
    .string()
    .trim()
    .min(1, 'Enter a number of files.')
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100, 'Choose a whole number from 1 to 100.'),
  guestUploadAlbumId: z.string(),
});
type FormValues = z.infer<typeof schema>;

/** Megabytes as typed: whole numbers stay whole, otherwise up to 1 decimal place. */
function toMb(bytes: number): string {
  const mb = bytes / MB;
  return String(Number.isInteger(mb) ? mb : Math.round(mb * 10) / 10);
}

function toForm(s: AdminSettings): FormValues {
  return {
    storageQuotaBytes: String(s.storageQuotaBytes),
    maxPhotoBytes: toMb(s.maxPhotoBytes),
    maxVideoBytes: toMb(s.maxVideoBytes),
    videoUploadsEnabled: s.videoUploadsEnabled,
    uploadModerationEnabled: s.uploadModerationEnabled,
    guestUploadsOpen: s.guestUploadsOpen,
    maxFilesPerUpload: String(s.maxFilesPerUpload),
    guestUploadAlbumId: s.guestUploadAlbumId ?? '',
  };
}

function quotaLabel(bytes: number): string {
  const gb = bytes / GB;
  return Number.isInteger(gb) ? `${gb} GB` : formatBytes(bytes);
}

export function UploadsSection({ settings, onDirtyChange }: SectionProps) {
  const albums = useAlbums();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(settings) });

  useReportDirty(isDirty, onDirtyChange);
  useFollowSettings(settings, isDirty, () => reset(toForm(settings)));

  const save = useSaveSettings({
    success: 'Upload settings saved',
    onSaved: (next) => reset(toForm(next)),
    onError: (error) => reportFormError(error, setError),
  });

  const presets = settings.quotaPresets.slice().sort((a, b) => a - b);
  const isCustom = !presets.includes(settings.storageQuotaBytes);

  const onSubmit = handleSubmit((values) => {
    save.mutate({
      storageQuotaBytes: Number(values.storageQuotaBytes),
      maxPhotoBytes: Math.round(Number(values.maxPhotoBytes) * MB),
      maxVideoBytes: Math.round(Number(values.maxVideoBytes) * MB),
      videoUploadsEnabled: values.videoUploadsEnabled,
      uploadModerationEnabled: values.uploadModerationEnabled,
      guestUploadsOpen: values.guestUploadsOpen,
      maxFilesPerUpload: Number(values.maxFilesPerUpload),
      guestUploadAlbumId: values.guestUploadAlbumId || null,
    });
  });

  return (
    <Panel id="settings-uploads" title="Uploads" description="Storage and the rules for photos and videos guests upload with the QR code.">
      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <AField label="Storage quota" htmlFor="storageQuotaBytes" error={errors.storageQuotaBytes?.message} hint={`${formatBytes(settings.storageQuotaBytes)} currently allowed for all media.`}>
            <ASelect
              id="storageQuotaBytes"
              aria-invalid={!!errors.storageQuotaBytes}
              aria-describedby={describedBy('storageQuotaBytes', errors.storageQuotaBytes, true)}
              {...register('storageQuotaBytes')}
            >
              {presets.map((bytes) => (
                <option key={bytes} value={String(bytes)}>
                  {quotaLabel(bytes)}
                </option>
              ))}
              {isCustom && <option value={String(settings.storageQuotaBytes)}>Custom: {quotaLabel(settings.storageQuotaBytes)}</option>}
            </ASelect>
          </AField>

          <AField
            label="Guest upload album"
            htmlFor="guestUploadAlbumId"
            error={errors.guestUploadAlbumId?.message}
            hint="Approved guest photos are added to this album."
          >
            <ASelect
              id="guestUploadAlbumId"
              aria-invalid={!!errors.guestUploadAlbumId}
              aria-describedby={describedBy('guestUploadAlbumId', errors.guestUploadAlbumId, true)}
              disabled={albums.isPending}
              {...register('guestUploadAlbumId')}
            >
              <option value="">No album</option>
              {albums.data?.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
              {/* Keep the saved value selectable while albums load or if it was deleted. */}
              {settings.guestUploadAlbumId && !albums.data?.some((a) => a.id === settings.guestUploadAlbumId) && (
                <option value={settings.guestUploadAlbumId}>{albums.isPending ? 'Loading…' : 'Unknown album'}</option>
              )}
            </ASelect>
          </AField>

          <AField label="Largest photo (MB)" htmlFor="maxPhotoBytes" error={errors.maxPhotoBytes?.message} hint="Per file. 0.1 to 1,024 MB.">
            <AInput
              id="maxPhotoBytes"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 25"
              min={0.1}
              max={1024}
              step="any"
              aria-invalid={!!errors.maxPhotoBytes}
              aria-describedby={describedBy('maxPhotoBytes', errors.maxPhotoBytes, true)}
              {...register('maxPhotoBytes')}
            />
          </AField>

          <AField label="Largest video (MB)" htmlFor="maxVideoBytes" error={errors.maxVideoBytes?.message} hint="Per file. 1 to 10,240 MB.">
            <AInput
              id="maxVideoBytes"
              type="number"
              inputMode="decimal"
              placeholder="e.g. 500"
              min={1}
              max={10240}
              step="any"
              aria-invalid={!!errors.maxVideoBytes}
              aria-describedby={describedBy('maxVideoBytes', errors.maxVideoBytes, true)}
              {...register('maxVideoBytes')}
            />
          </AField>

          <AField label="Files per upload" htmlFor="maxFilesPerUpload" error={errors.maxFilesPerUpload?.message} hint="How many files a guest can send at once.">
            <AInput
              id="maxFilesPerUpload"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 20"
              min={1}
              max={100}
              step={1}
              aria-invalid={!!errors.maxFilesPerUpload}
              aria-describedby={describedBy('maxFilesPerUpload', errors.maxFilesPerUpload, true)}
              {...register('maxFilesPerUpload')}
            />
          </AField>
        </div>

        <div className="mt-4 divide-y divide-navy/[0.06] border-t border-navy/[0.08] pt-2">
          <Controller
            control={control}
            name="guestUploadsOpen"
            render={({ field }) => (
              <SwitchRow
                label="Accept guest uploads"
                description="When off, the upload page tells guests uploads are closed."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="uploadModerationEnabled"
            render={({ field }) => (
              <SwitchRow
                label="Moderate guest uploads"
                description="Guest photos wait for approval before appearing in the gallery."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="videoUploadsEnabled"
            render={({ field }) => (
              <SwitchRow
                label="Allow video uploads"
                description="Videos use far more storage than photos."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        <SectionFooter dirty={isDirty} saving={save.isPending} onDiscard={() => reset(toForm(settings))} />
      </form>
    </Panel>
  );
}
