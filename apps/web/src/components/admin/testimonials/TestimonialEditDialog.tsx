import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminTestimonial, UpdateTestimonialRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { affects, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { AButton, AField, AInput, ATextarea, describedBy } from '../ui';
import { AdminDialog } from '../overlays';

const schema = z.object({
  authorName: z.string().trim().min(1, 'Enter the name').min(2, 'Use at least 2 characters').max(80, 'Keep it to 80 characters or fewer'),
  relationship: z.string().trim().max(80, 'Keep it to 80 characters or fewer'),
  message: z.string().trim().min(1, 'The message cannot be empty').min(2, 'Use at least 2 characters').max(2000, 'Keep it to 2,000 characters or fewer'),
});
type FormValues = z.infer<typeof schema>;

export function TestimonialEditDialog({
  testimonial,
  open,
  onOpenChange,
}: {
  testimonial: AdminTestimonial | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { authorName: '', relationship: '', message: '' },
  });
  const { register, handleSubmit, reset, setError, formState } = form;
  const { errors } = formState;

  useEffect(() => {
    if (open && testimonial) {
      reset({ authorName: testimonial.authorName, relationship: testimonial.relationship ?? '', message: testimonial.message });
    }
  }, [open, testimonial, reset]);

  const save = useAdminMutation<AdminTestimonial, UpdateTestimonialRequest>({
    mutationFn: (body) => api.patch<AdminTestimonial>(`/admin/testimonials/${testimonial!.id}`, body),
    invalidate: affects.testimonials,
    success: 'Testimonial saved',
    toastError: false,
    onSuccess: () => onOpenChange(false),
    onError: (error) => reportFormError(error, setError, ['authorName', 'relationship', 'message']),
  });

  const onSubmit = handleSubmit((values) =>
    save.mutate({ authorName: values.authorName, relationship: nullIfBlank(values.relationship), message: values.message }),
  );

  return (
    <AdminDialog
      open={open && !!testimonial}
      onOpenChange={onOpenChange}
      title="Edit testimonial"
      description="Fix typos or shorten the message. The edit date is recorded."
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="testimonial-edit-form" variant="emerald" loading={save.isPending}>
            Save changes
          </AButton>
        </>
      }
    >
      <form id="testimonial-edit-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <AField label="Name" htmlFor="t-authorName" required error={errors.authorName?.message}>
            <AInput
              id="t-authorName"
              placeholder="e.g. Adaeze Okafor"
              {...register('authorName')}
              aria-invalid={!!errors.authorName}
              aria-describedby={describedBy('t-authorName', errors.authorName)}
            />
          </AField>
          <AField label="Relationship" htmlFor="t-relationship" error={errors.relationship?.message} hint="e.g. Niece, Former colleague">
            <AInput
              id="t-relationship"
              placeholder="e.g. Niece"
              {...register('relationship')}
              aria-invalid={!!errors.relationship}
              aria-describedby={describedBy('t-relationship', errors.relationship, true)}
            />
          </AField>
        </div>
        <AField label="Message" htmlFor="t-message" required error={errors.message?.message}>
          <ATextarea
            id="t-message"
            rows={9}
            placeholder="The guest’s memory or birthday wish"
            {...register('message')}
            aria-invalid={!!errors.message}
            aria-describedby={describedBy('t-message', errors.message)}
          />
        </AField>
      </form>
    </AdminDialog>
  );
}
