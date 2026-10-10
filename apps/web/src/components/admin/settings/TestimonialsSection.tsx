import { Controller, useForm } from 'react-hook-form';
import type { AdminSettings } from '@birthday/types';
import { reportFormError } from '@/lib/admin-api';
import { Panel, SwitchRow } from '@/components/admin/ui';
import { SectionFooter, useFollowSettings, useReportDirty, useSaveSettings, type SectionProps } from './shared';

interface FormValues {
  testimonialsOpen: boolean;
  testimonialsRequireApproval: boolean;
  testimonialsAllowPhotos: boolean;
  testimonialsAllowVideos: boolean;
}

function toForm(s: AdminSettings): FormValues {
  return {
    testimonialsOpen: s.testimonialsOpen,
    testimonialsRequireApproval: s.testimonialsRequireApproval,
    testimonialsAllowPhotos: s.testimonialsAllowPhotos,
    testimonialsAllowVideos: s.testimonialsAllowVideos,
  };
}

const ROWS: { name: keyof FormValues; label: string; description: string }[] = [
  { name: 'testimonialsOpen', label: 'Accept testimonials', description: 'Show the form where guests write a message for the celebrant.' },
  {
    name: 'testimonialsRequireApproval',
    label: 'Require approval',
    description: 'New testimonials stay hidden until an admin approves them.',
  },
  { name: 'testimonialsAllowPhotos', label: 'Allow a photo', description: 'Guests can attach one photo to their message.' },
  { name: 'testimonialsAllowVideos', label: 'Allow a video', description: 'Guests can attach one short video to their message.' },
];

export function TestimonialsSection({ settings, onDirtyChange }: SectionProps) {
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = useForm<FormValues>({ defaultValues: toForm(settings) });

  useReportDirty(isDirty, onDirtyChange);
  useFollowSettings(settings, isDirty, () => reset(toForm(settings)));

  const save = useSaveSettings({
    success: 'Testimonial settings saved',
    onSaved: (next) => reset(toForm(next)),
    onError: (error) => reportFormError(error, setError),
  });

  return (
    <Panel id="settings-testimonials" title="Testimonials" description="What guests can send with their birthday messages.">
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <div className="divide-y divide-navy/[0.06]">
          {ROWS.map((row) => (
            <Controller
              key={row.name}
              control={control}
              name={row.name}
              render={({ field }) => (
                <SwitchRow label={row.label} description={row.description} checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          ))}
        </div>
        <SectionFooter dirty={isDirty} saving={save.isPending} onDiscard={() => reset(toForm(settings))} />
      </form>
    </Panel>
  );
}
