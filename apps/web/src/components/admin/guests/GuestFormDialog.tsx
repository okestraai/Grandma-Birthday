import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { AdminGuestDetail, CreateGuestRequest, UpdateGuestRequest } from '@birthday/types';
import { api, isApiError } from '@/lib/api';
import { adminKeys, affects, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { AButton, ACheckbox, AField, AInput, ASelect, ATextarea, IconButton, SwitchRow, describedBy } from '../ui';
import { AdminDialog } from '../overlays';
import { CapacityOverride, coveredByCategory, useEvents, useGuestCategories } from './shared';

const companionSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the companion’s name').min(2, 'Use at least 2 characters').max(120, 'Keep it to 120 characters or fewer'),
  dietary: z.string().trim().max(500, 'Keep it to 500 characters or fewer'),
});

const schema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter the guest’s name').min(2, 'Use at least 2 characters').max(120, 'Keep it to 120 characters or fewer'),
    email: z.string().trim().min(1, 'Enter an email address').max(254, 'Keep it to 254 characters or fewer').pipe(z.email('Enter a valid email address')),
    phone: z.string().trim().max(40, 'Keep it to 40 characters or fewer'),
    categoryId: z.string(),
    allowedCompanions: z.number({ error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative').max(20, 'At most 20'),
    notes: z.string().refine((v) => v.trim().length <= 2000, 'Keep it to 2,000 characters or fewer'),
    sendInvitation: z.boolean(),
    recordRsvp: z.boolean(),
    response: z.enum(['ATTENDING', 'DECLINED']),
    companions: z.array(companionSchema),
    dietary: z.string().trim().max(500, 'Keep it to 500 characters or fewer'),
    accessibility: z.string().trim().max(1000, 'Keep it to 1,000 characters or fewer'),
  })
  .superRefine((v, ctx) => {
    if (v.recordRsvp && v.response === 'ATTENDING' && v.companions.length > v.allowedCompanions) {
      ctx.addIssue({
        code: 'custom',
        path: ['companions'],
        message: `This guest may bring at most ${v.allowedCompanions} companion${v.allowedCompanions === 1 ? '' : 's'}.`,
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  fullName: '',
  email: '',
  phone: '',
  categoryId: '',
  allowedCompanions: 0,
  notes: '',
  sendInvitation: true,
  recordRsvp: false,
  response: 'ATTENDING',
  companions: [],
  dietary: '',
  accessibility: '',
};

const FIELDS = ['fullName', 'email', 'phone', 'categoryId', 'allowedCompanions', 'notes', 'companions', 'dietary', 'accessibility'] as const;

/** Add a guest (with an optional RSVP on their behalf) or edit an existing one. */
export function GuestFormDialog({
  open,
  onOpenChange,
  guest,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  guest?: AdminGuestDetail | null;
  onSaved?: (guest: AdminGuestDetail) => void;
}) {
  const editing = !!guest;
  const queryClient = useQueryClient();
  const categories = useGuestCategories();
  const events = useEvents();
  // Events left unticked when recording an RSVP; none means every event the guest may attend.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [override, setOverride] = useState(false);

  const { register, handleSubmit, reset, setError, setValue, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { errors } = formState;
  const companions = useFieldArray({ control, name: 'companions' });
  const [recordRsvp, response, allowed, sendInvitation, categoryId] = useWatch({
    control,
    name: ['recordRsvp', 'response', 'allowedCompanions', 'sendInvitation', 'categoryId'],
  });
  // Events this guest could reply to, by their category. Shown only when there is a choice to make.
  const eligible = (events.data ?? []).filter((e) => e.rsvpEnabled && coveredByCategory(e, categoryId || null));
  const chooseEvents = (events.data?.length ?? 0) > 1 && eligible.length > 0;

  // Reset only when the dialog opens (or switches guest), not when a background refetch
  // hands us a new object for the same guest, which would wipe unsaved edits.
  const guestKey = guest?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setCapacityMessage(null);
    setOverride(false);
    setSkipped([]);
    setEventsError(null);
    reset(
      guest
        ? {
            ...EMPTY,
            fullName: guest.fullName,
            email: guest.email,
            phone: guest.phone ?? '',
            categoryId: guest.categoryId ?? '',
            allowedCompanions: guest.allowedCompanions,
            notes: guest.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, guestKey, reset]);

  const save = useAdminMutation<AdminGuestDetail, CreateGuestRequest | UpdateGuestRequest>({
    mutationFn: (body) =>
      editing ? api.put<AdminGuestDetail>(`/admin/guests/${guest!.id}`, body) : api.post<AdminGuestDetail>('/admin/guests', body),
    invalidate: affects.guests,
    success: (saved) => (editing ? 'Guest updated' : `${saved.fullName} added`),
    toastError: false,
    onSuccess: (saved) => {
      queryClient.setQueryData(adminKeys.guest(saved.id), saved);
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => {
      if (isApiError(error, 'EVENT_CAPACITY_REACHED') || isApiError(error, 'CATEGORY_CAPACITY_REACHED') || isApiError(error, 'EVENT_FULL')) {
        setCapacityMessage(error.message);
        return;
      }
      if (isApiError(error, 'CONFLICT')) {
        setError('email', { type: 'server', message: error.message || 'A guest with this email already exists.' });
        return;
      }
      if (isApiError(error, 'COMPANION_LIMIT_EXCEEDED')) {
        setError(recordRsvp ? 'companions' : 'allowedCompanions', { type: 'server', message: error.message });
        return;
      }
      reportFormError(error, setError, FIELDS);
    },
  });

  const onSubmit = handleSubmit((v) => {
    const base = {
      fullName: v.fullName,
      email: v.email,
      phone: nullIfBlank(v.phone),
      categoryId: v.categoryId || null,
      allowedCompanions: v.allowedCompanions,
      notes: nullIfBlank(v.notes),
      ...(capacityMessage && override ? { overrideCapacity: true } : {}),
    };
    if (editing) {
      save.mutate(base satisfies UpdateGuestRequest);
      return;
    }
    const body: CreateGuestRequest = { ...base, sendInvitation: v.sendInvitation };
    if (v.recordRsvp) {
      const attending = v.response === 'ATTENDING';
      const chosen = eligible.filter((e) => !skipped.includes(e.id));
      if (attending && chooseEvents && chosen.length === 0) {
        setEventsError('Tick at least one event, or record the reply as declined.');
        return;
      }
      setEventsError(null);
      body.rsvp = {
        response: v.response,
        companions:
          v.response === 'ATTENDING'
            ? v.companions.map((c) => ({ fullName: c.fullName, ...(c.dietary ? { dietary: c.dietary } : {}) }))
            : [],
        // Left out when every event is ticked: the API then uses every event the guest may attend.
        ...(attending && chooseEvents && chosen.length < eligible.length
          ? { events: chosen.map((e) => ({ eventId: e.id, companionCount: v.companions.length })) }
          : {}),
        ...(v.dietary ? { dietary: v.dietary } : {}),
        ...(v.accessibility ? { accessibility: v.accessibility } : {}),
      };
    }
    save.mutate(body);
  });

  const companionLimit = Number.isFinite(allowed) ? allowed : 0;
  const categoryField = register('categoryId');

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${guest!.fullName}` : 'Add guest'}
      description={editing ? undefined : 'Invite someone directly. They receive a personal link and QR pass.'}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="guest-form" variant="emerald" loading={save.isPending}>
            {editing ? 'Save changes' : sendInvitation ? 'Add and send invitation' : 'Add guest'}
          </AButton>
        </>
      }
    >
      <form id="guest-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <AField label="Full name" htmlFor="g-fullName" required error={errors.fullName?.message}>
            <AInput id="g-fullName" autoComplete="off" placeholder="e.g. Adaeze Okafor" {...register('fullName')} aria-invalid={!!errors.fullName} aria-describedby={describedBy('g-fullName', errors.fullName)} />
          </AField>
          <AField label="Email" htmlFor="g-email" required error={errors.email?.message}>
            <AInput id="g-email" type="email" autoComplete="off" placeholder="guest@example.com" {...register('email')} aria-invalid={!!errors.email} aria-describedby={describedBy('g-email', errors.email)} />
          </AField>
          <AField label="Phone" htmlFor="g-phone" error={errors.phone?.message}>
            <AInput id="g-phone" type="tel" autoComplete="off" placeholder="+234 800 000 0000" {...register('phone')} aria-invalid={!!errors.phone} aria-describedby={describedBy('g-phone', errors.phone)} />
          </AField>
          <AField label="Category" htmlFor="g-category" error={errors.categoryId?.message}>
            <ASelect
              id="g-category"
              {...categoryField}
              onChange={(e) => {
                void categoryField.onChange(e);
                if (editing) return;
                const category = categories.data?.find((c) => c.id === e.target.value);
                if (category) setValue('allowedCompanions', category.defaultCompanions, { shouldValidate: true });
              }}
              aria-invalid={!!errors.categoryId}
            >
              <option value="">No category</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </ASelect>
          </AField>
          <AField
            label="Companions allowed"
            htmlFor="g-allowed"
            required
            error={errors.allowedCompanions?.message}
            hint="How many people they may bring (0–20)."
          >
            <AInput
              id="g-allowed"
              type="number"
              placeholder="e.g. 1"
              min={0}
              max={20}
              inputMode="numeric"
              {...register('allowedCompanions', { valueAsNumber: true })}
              aria-invalid={!!errors.allowedCompanions}
              aria-describedby={describedBy('g-allowed', errors.allowedCompanions, true)}
            />
          </AField>
        </div>
        <AField label="Notes" htmlFor="g-notes" error={errors.notes?.message} hint="Only admins see these.">
          <ATextarea id="g-notes" rows={2} placeholder="e.g. Seat near the family table" {...register('notes')} aria-invalid={!!errors.notes} aria-describedby={describedBy('g-notes', errors.notes, true)} />
        </AField>

        {!editing && (
          <>
            <SwitchRow
              label="Send the invitation email now"
              description="You can also send or resend it later from the guest’s details."
              checked={sendInvitation}
              onCheckedChange={(on) => setValue('sendInvitation', on)}
            />
            <SwitchRow
              label="Record RSVP on their behalf"
              description="For guests who replied by phone or in person."
              checked={recordRsvp}
              onCheckedChange={(on) => setValue('recordRsvp', on)}
            />
            {recordRsvp && (
              <fieldset className="space-y-4 rounded-lg border border-navy/10 p-3">
                <legend className="px-1 text-[13px] font-medium text-navy">RSVP</legend>
                <div role="radiogroup" aria-label="Response" className="flex flex-wrap gap-4">
                  {(['ATTENDING', 'DECLINED'] as const).map((value) => (
                    <label key={value} className="flex min-h-10 items-center gap-2 md:min-h-0">
                      <input type="radio" value={value} {...register('response')} className="size-4 accent-navy" />
                      {value === 'ATTENDING' ? 'Attending' : 'Declined'}
                    </label>
                  ))}
                </div>

                {response === 'ATTENDING' && chooseEvents && (
                  <fieldset aria-describedby="g-events-hint">
                    <legend className="mb-1 text-[13px] font-medium text-navy">Events</legend>
                    <ul className="grid gap-x-4 sm:grid-cols-2">
                      {eligible.map((e) => {
                        const id = `g-event-${e.id}`;
                        return (
                          <li key={e.id} className="flex min-h-10 items-center gap-2.5 md:min-h-8">
                            <ACheckbox
                              id={id}
                              checked={!skipped.includes(e.id)}
                              onCheckedChange={(on) => setSkipped((list) => (on ? list.filter((x) => x !== e.id) : [...list, e.id]))}
                            />
                            <label htmlFor={id} className="text-[13px] text-charcoal">
                              {e.name}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <p id="g-events-hint" className={eventsError ? 'mt-1 text-xs text-error' : 'mt-1 text-xs text-muted'} role={eventsError ? 'alert' : undefined}>
                      {eventsError ?? 'The events the guest will attend, with all their companions. Only events their category is invited to are listed.'}
                    </p>
                  </fieldset>
                )}

                {response === 'ATTENDING' && (
                  <div>
                    <p className="mb-1 text-[13px] font-medium text-navy">
                      Companions <span className="font-normal text-muted">({companions.fields.length} of {companionLimit})</span>
                    </p>
                    {companions.fields.length > 0 && (
                      <ul className="mb-2 space-y-2">
                        {companions.fields.map((field, index) => {
                          const err = errors.companions?.[index];
                          return (
                            <li key={field.id} className="flex items-start gap-2">
                              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                                <div>
                                  <AInput
                                    placeholder="Full name"
                                    aria-label={`Companion ${index + 1} name`}
                                    {...register(`companions.${index}.fullName`)}
                                    aria-invalid={!!err?.fullName}
                                  />
                                  {err?.fullName && <p className="mt-1 text-xs text-error">{err.fullName.message}</p>}
                                </div>
                                <div>
                                  <AInput
                                    placeholder="Dietary needs (optional)"
                                    aria-label={`Companion ${index + 1} dietary needs`}
                                    {...register(`companions.${index}.dietary`)}
                                    aria-invalid={!!err?.dietary}
                                  />
                                  {err?.dietary && <p className="mt-1 text-xs text-error">{err.dietary.message}</p>}
                                </div>
                              </div>
                              <IconButton label={`Remove companion ${index + 1}`} variant="danger-ghost" tooltip={false} onClick={() => companions.remove(index)}>
                                <X aria-hidden />
                              </IconButton>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <AButton
                      size="sm"
                      onClick={() => companions.append({ fullName: '', dietary: '' })}
                      disabled={companions.fields.length >= companionLimit}
                    >
                      <Plus aria-hidden /> Add companion
                    </AButton>
                    {errors.companions?.message && (
                      <p className="mt-1 text-xs text-error" role="alert">
                        {errors.companions.message}
                      </p>
                    )}
                    {errors.companions?.root?.message && (
                      <p className="mt-1 text-xs text-error" role="alert">
                        {errors.companions.root.message}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <AField label="Dietary needs" htmlFor="g-dietary" error={errors.dietary?.message}>
                    <AInput id="g-dietary" placeholder="e.g. Vegetarian, no nuts" {...register('dietary')} aria-invalid={!!errors.dietary} />
                  </AField>
                  <AField label="Accessibility needs" htmlFor="g-accessibility" error={errors.accessibility?.message}>
                    <AInput id="g-accessibility" placeholder="e.g. Wheelchair access" {...register('accessibility')} aria-invalid={!!errors.accessibility} />
                  </AField>
                </div>
              </fieldset>
            )}
          </>
        )}

        {capacityMessage && <CapacityOverride message={capacityMessage} checked={override} onCheckedChange={setOverride} />}
      </form>
    </AdminDialog>
  );
}
