import { useMemo, useState } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AdminFamilyMember, FamilySpouseInput, PublicMedia, UpsertFamilyMemberRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { AdminDialog, Confirm } from '../overlays';
import { AButton, AField, AInput, ASelect, ATextarea, SwitchRow, describedBy } from '../ui';
import { MediaField } from '../media';
import { GENERATIONS, childOfOptions, derivedGeneration, generationName, groupByGeneration, unitKey, unitLabel, type FamilyUnit } from './family-utils';

const MIN_YEAR = 1800;
const MAX_YEAR = 2200;
const yearOk = (v: string) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= MIN_YEAR && Number(v) <= MAX_YEAR);
const yearMessage = `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}, or leave it empty.`;
const yearField = z.string().trim().refine(yearOk, yearMessage);
const deathAfterBirth = (birth: string, death: string) => !birth || !death || Number(death) >= Number(birth);
const DEATH_BEFORE_BIRTH = 'The year of death cannot be before the year of birth.';

const spouseSchema = z.object({
  fullName: z.string(),
  relationshipLabel: z.string(),
  birthYear: z.string(),
  deathYear: z.string(),
  bio: z.string(),
  photoMediaId: z.string().nullable(),
});

const schema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter the name.').min(2, 'Use at least 2 characters.').max(150, 'Keep the name to 150 characters or fewer.'),
    relationshipLabel: z
      .string()
      .trim()
      .min(1, 'Describe the relationship, e.g. “Daughter”.')
      .min(2, 'Use at least 2 characters.')
      .max(80, 'Keep this to 80 characters or fewer.'),
    /** Unit key of the parents ("id" or "id,id"), or "" for no parents in the tree. */
    parents: z.string(),
    generation: z.string(),
    isCelebrant: z.boolean(),
    bio: z.string().refine((v) => v.trim().length <= 2000, 'Keep the bio to 2,000 characters or fewer.'),
    birthYear: yearField,
    deathYear: yearField,
    photoMediaId: z.string().nullable(),
    isPublished: z.boolean(),
    sortOrder: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+$/.test(v), 'Use a whole number, 0 or more.'),
    hasSpouse: z.boolean(),
    /** Whether the spouse's details are edited here (false when the spouse is a blood relative). */
    spouseEditable: z.boolean(),
    spouse: spouseSchema,
  })
  .superRefine((v, ctx) => {
    if (!deathAfterBirth(v.birthYear, v.deathYear)) ctx.addIssue({ code: 'custom', path: ['deathYear'], message: DEATH_BEFORE_BIRTH });
    if (!v.hasSpouse || !v.spouseEditable) return;
    const s = v.spouse;
    const issue = (field: keyof typeof s, message: string) => ctx.addIssue({ code: 'custom', path: ['spouse', field], message });
    const name = s.fullName.trim();
    if (!name) issue('fullName', 'Enter the spouse’s name.');
    else if (name.length < 2) issue('fullName', 'Use at least 2 characters.');
    else if (name.length > 150) issue('fullName', 'Keep the name to 150 characters or fewer.');
    const label = s.relationshipLabel.trim();
    if (label && label.length < 2) issue('relationshipLabel', 'Use at least 2 characters.');
    else if (label.length > 80) issue('relationshipLabel', 'Keep this to 80 characters or fewer.');
    if (!yearOk(s.birthYear.trim())) issue('birthYear', yearMessage);
    if (!yearOk(s.deathYear.trim())) issue('deathYear', yearMessage);
    else if (!deathAfterBirth(s.birthYear.trim(), s.deathYear.trim())) issue('deathYear', DEATH_BEFORE_BIRTH);
    if (s.bio.trim().length > 2000) issue('bio', 'Keep the bio to 2,000 characters or fewer.');
  });

type FormValues = z.infer<typeof schema>;
type Preview = Pick<PublicMedia, 'kind' | 'urls' | 'altText' | 'caption'> | null;

const yearText = (y: number | null | undefined) => (y ? String(y) : '');

/** Create (member null) or edit a family member, their parents and their spouse. Mount only while open. */
export function FamilyMemberDialog({
  member,
  members,
  existingCelebrant,
  initialParentIds,
  startWithSpouse = false,
  onClose,
}: {
  member: AdminFamilyMember | null;
  /** Everyone in the tree (for "Child of" and the spouse's details). */
  members: AdminFamilyMember[];
  /** The member currently marked as the celebrant, if any (for a warning). */
  existingCelebrant: AdminFamilyMember | undefined;
  /** For a new person: preset "Child of" to these parents. */
  initialParentIds?: string[];
  /** Open with the spouse section switched on ("Add spouse"). */
  startWithSpouse?: boolean;
  onClose: () => void;
}) {
  const spouse = member?.spouseId ? members.find((m) => m.id === member.spouseId) : undefined;
  const spouseEditable = !spouse || spouse.marriedIn;

  const units = useMemo(() => childOfOptions(members, member?.id ?? null), [members, member?.id]);
  const currentParents = member ? member.parentIds : (initialParentIds ?? []);
  const currentKey = currentParents.length ? unitKey(currentParents) : '';
  // Parents that do not match a unit (e.g. one parent of a couple) still get an option.
  const extraUnit: FamilyUnit | null =
    currentKey && !units.some((u) => u.key === currentKey)
      ? { key: currentKey, members: currentParents.map((id) => members.find((m) => m.id === id)).filter((m): m is AdminFamilyMember => !!m) }
      : null;
  const byPrimary = new Map((extraUnit && extraUnit.members.length ? [...units, extraUnit] : units).map((u) => [u.members[0], u]));
  const unitGroups = groupByGeneration([...byPrimary.keys()]).map(([generation, primaries]) => [generation, primaries.map((p) => byPrimary.get(p)!)] as const);

  const [preview, setPreview] = useState<Preview>(member?.photo ?? null);
  const [spousePreview, setSpousePreview] = useState<Preview>(spouse?.photo ?? null);
  const [pendingRemoval, setPendingRemoval] = useState<UpsertFamilyMemberRequest | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: member?.fullName ?? '',
      relationshipLabel: member?.relationshipLabel ?? '',
      parents: currentKey,
      generation: String(member && member.parentIds.length === 0 ? member.generation : 0),
      isCelebrant: member?.isCelebrant ?? false,
      bio: member?.bio ?? '',
      birthYear: yearText(member?.birthYear),
      deathYear: yearText(member?.deathYear),
      photoMediaId: member?.photoMediaId ?? null,
      isPublished: member?.isPublished ?? true,
      sortOrder: member ? String(member.sortOrder) : '',
      hasSpouse: !!spouse || startWithSpouse,
      spouseEditable,
      spouse: {
        fullName: spouse?.fullName ?? '',
        relationshipLabel: spouse?.relationshipLabel ?? '',
        birthYear: yearText(spouse?.birthYear),
        deathYear: yearText(spouse?.deathYear),
        bio: spouse?.bio ?? '',
        photoMediaId: spouse?.photoMediaId ?? null,
      },
    },
  });

  const save = useAdminMutation<AdminFamilyMember, UpsertFamilyMemberRequest>({
    mutationFn: (body) => (member ? api.put<AdminFamilyMember>(`/admin/family/${member.id}`, body) : api.post<AdminFamilyMember>('/admin/family', body)),
    invalidate: [adminKeys.family],
    success: (data) => (member ? `${data.fullName} was updated.` : `${data.fullName} was added to the family.`),
    toastError: false,
    onSuccess: onClose,
    onError: (error) => {
      setPendingRemoval(null);
      // The API calls the parents field `parentIds`; the form calls it `parents`.
      reportFormError<FormValues>(error, (name, err, opts) => setError((name === ('parentIds' as string) ? 'parents' : name) as FieldPath<FormValues>, err, opts));
    },
  });

  const submit = handleSubmit((v) => {
    const parentIds = v.parents ? v.parents.split(',') : [];
    const body: UpsertFamilyMemberRequest = {
      fullName: v.fullName.trim(),
      relationshipLabel: v.relationshipLabel.trim(),
      parentIds,
      isCelebrant: v.isCelebrant,
      bio: nullIfBlank(v.bio),
      birthYear: v.birthYear ? Number(v.birthYear) : null,
      deathYear: v.deathYear ? Number(v.deathYear) : null,
      photoMediaId: v.photoMediaId,
      isPublished: v.isPublished,
    };
    if (parentIds.length === 0) body.generation = Number(v.generation);
    if (v.sortOrder !== '') body.sortOrder = Number(v.sortOrder);
    if (spouseEditable) {
      if (v.hasSpouse) {
        const s = v.spouse;
        const input: FamilySpouseInput = {
          fullName: s.fullName.trim(),
          birthYear: s.birthYear.trim() ? Number(s.birthYear.trim()) : null,
          deathYear: s.deathYear.trim() ? Number(s.deathYear.trim()) : null,
          bio: nullIfBlank(s.bio),
          photoMediaId: s.photoMediaId,
        };
        if (s.relationshipLabel.trim()) input.relationshipLabel = s.relationshipLabel.trim();
        body.spouse = input;
      } else if (spouse) {
        body.spouse = null;
        setPendingRemoval(body);
        return;
      }
    }
    save.mutate(body);
  });

  const isCelebrant = watch('isCelebrant');
  const hasSpouse = watch('hasSpouse');
  const parentsKey = watch('parents');
  const otherCelebrant = existingCelebrant && existingCelebrant.id !== member?.id ? existingCelebrant : undefined;
  const derived = parentsKey ? derivedGeneration(members, parentsKey.split(',')) : null;

  const text = (name: 'fullName' | 'relationshipLabel', id: string, label: string, placeholder: string) => (
    <AField label={label} htmlFor={id} required error={errors[name]?.message}>
      <AInput id={id} placeholder={placeholder} aria-invalid={!!errors[name]} aria-describedby={describedBy(id, errors[name])} {...register(name)} />
    </AField>
  );

  const year = (name: 'birthYear' | 'deathYear' | 'spouse.birthYear' | 'spouse.deathYear', id: string, label: string, placeholder: string, error?: string, hint?: string) => (
    <AField label={label} htmlFor={id} error={error} hint={hint}>
      <AInput id={id} inputMode="numeric" placeholder={placeholder} maxLength={4} aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} {...register(name)} />
    </AField>
  );

  const se = errors.spouse;

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={member ? `Edit ${member.fullName}` : 'Add family member'}
      size="lg"
      footer={
        <>
          <AButton variant="ghost" onClick={onClose}>
            Cancel
          </AButton>
          <AButton type="submit" form="family-member-form" variant="emerald" loading={save.isPending}>
            {member ? 'Save changes' : 'Add member'}
          </AButton>
        </>
      }
    >
      <form id="family-member-form" noValidate onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {text('fullName', 'fm-name', 'Full name', 'e.g. Adaeze Johnson')}
          {text('relationshipLabel', 'fm-relationship', 'Relationship to the celebrant', 'e.g. Daughter')}
          <AField label="Child of" htmlFor="fm-parents" error={errors.parents?.message} hint="Choose their parents. Their generation follows from the parents.">
            <ASelect id="fm-parents" aria-invalid={!!errors.parents} aria-describedby="fm-parents-msg" {...register('parents')}>
              <option value="">No parents in the tree (top of the tree or married in)</option>
              {unitGroups.map(([generation, group]) => (
                <optgroup key={generation} label={generationName(generation)}>
                  {group.map((u) => (
                    <option key={u.key} value={u.key}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </ASelect>
          </AField>
          {parentsKey ? (
            <div className="min-w-0">
              <p className="mb-1 block text-[13px] font-medium text-navy">Generation</p>
              <p className="flex h-10 items-center text-[13px] text-charcoal md:h-9" id="fm-generation-derived">
                {derived === null ? 'Derived from parents' : `${generationName(derived)} (derived from parents)`}
              </p>
            </div>
          ) : (
            <AField
              label="Generation"
              htmlFor="fm-generation"
              required
              error={errors.generation?.message}
              hint={GENERATIONS.find((g) => String(g.value) === watch('generation'))?.hint}
            >
              <ASelect id="fm-generation" aria-describedby="fm-generation-msg" {...register('generation')}>
                {GENERATIONS.map((g) => (
                  <option key={g.value} value={String(g.value)}>
                    {g.label} ({g.value})
                  </option>
                ))}
              </ASelect>
            </AField>
          )}
          {year('birthYear', 'fm-birth', 'Year of birth', 'e.g. 1985', errors.birthYear?.message)}
          {year('deathYear', 'fm-death', 'Year of death', 'e.g. 2010', errors.deathYear?.message, 'Leave empty if living.')}
          <AField label="Display order" htmlFor="fm-sort" error={errors.sortOrder?.message} hint="Lower numbers appear first among brothers and sisters.">
            <AInput id="fm-sort" inputMode="numeric" placeholder="e.g. 1" aria-invalid={!!errors.sortOrder} aria-describedby="fm-sort-msg" {...register('sortOrder')} />
          </AField>
        </div>
        <AField label="Short bio" htmlFor="fm-bio" error={errors.bio?.message}>
          <ATextarea id="fm-bio" rows={3} placeholder="A sentence or two about them" aria-invalid={!!errors.bio} aria-describedby={describedBy('fm-bio', errors.bio)} {...register('bio')} />
        </AField>
        <MediaField
          id="fm-photo"
          label="Photo"
          value={watch('photoMediaId')}
          preview={preview}
          onChange={(id, media) => {
            setValue('photoMediaId', id, { shouldDirty: true });
            setPreview(media);
          }}
        />

        <fieldset className="rounded-lg border border-navy/[0.08] px-3 py-1">
          <legend className="sr-only">Spouse or partner</legend>
          {spouseEditable ? (
            <>
              <Controller
                control={control}
                name="hasSpouse"
                render={({ field }) => (
                  <SwitchRow
                    label="Has a spouse / partner in the tree"
                    description={
                      !field.value && spouse
                        ? `Saving will remove ${spouse.fullName} from the tree.`
                        : 'Adds them next to this person, in the same generation.'
                    }
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              {hasSpouse && (
                <div className="space-y-3 pb-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AField label="Spouse’s full name" htmlFor="fm-spouse-name" required error={se?.fullName?.message}>
                      <AInput
                        id="fm-spouse-name"
                        placeholder="e.g. Tunde Bello"
                        aria-invalid={!!se?.fullName}
                        aria-describedby={describedBy('fm-spouse-name', se?.fullName)}
                        {...register('spouse.fullName')}
                      />
                    </AField>
                    <AField label="Spouse’s relationship to the celebrant" htmlFor="fm-spouse-relationship" error={se?.relationshipLabel?.message} hint="Leave empty for “Spouse”.">
                      <AInput
                        id="fm-spouse-relationship"
                        placeholder="e.g. Son-in-law"
                        maxLength={80}
                        aria-invalid={!!se?.relationshipLabel}
                        aria-describedby="fm-spouse-relationship-msg"
                        {...register('spouse.relationshipLabel')}
                      />
                    </AField>
                    {year('spouse.birthYear', 'fm-spouse-birth', 'Spouse’s year of birth', 'e.g. 1983', se?.birthYear?.message)}
                    {year('spouse.deathYear', 'fm-spouse-death', 'Spouse’s year of death', 'e.g. 2015', se?.deathYear?.message, 'Leave empty if living.')}
                  </div>
                  <AField label="Spouse’s short bio" htmlFor="fm-spouse-bio" error={se?.bio?.message}>
                    <ATextarea
                      id="fm-spouse-bio"
                      rows={2}
                      placeholder="A sentence or two about them"
                      aria-invalid={!!se?.bio}
                      aria-describedby={describedBy('fm-spouse-bio', se?.bio)}
                      {...register('spouse.bio')}
                    />
                  </AField>
                  <MediaField
                    id="fm-spouse-photo"
                    label="Spouse’s photo"
                    value={watch('spouse.photoMediaId')}
                    preview={spousePreview}
                    onChange={(id, media) => {
                      setValue('spouse.photoMediaId', id, { shouldDirty: true });
                      setSpousePreview(media);
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="py-2 text-[13px] text-charcoal">
              Married to <strong className="font-medium text-navy">{spouse!.fullName}</strong> (edit {spouse!.fullName} directly).
            </p>
          )}
        </fieldset>

        <div className="divide-y divide-navy/[0.08]">
          <Controller
            control={control}
            name="isCelebrant"
            render={({ field }) => (
              <SwitchRow
                label="This is the celebrant"
                description={
                  isCelebrant && otherCelebrant
                    ? `${otherCelebrant.fullName} is currently marked as the celebrant. Only one person should be.`
                    : 'Highlights this person at the centre of the family tree.'
                }
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Controller
            control={control}
            name="isPublished"
            render={({ field }) => (
              <SwitchRow
                label="Published"
                description="Unpublished members are hidden from the public family tree."
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      </form>

      <Confirm
        open={!!pendingRemoval}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={`Remove ${spouse?.fullName ?? 'the spouse'}?`}
        description={`This removes ${spouse?.fullName ?? 'the spouse'} from the tree. Their photo stays in the media library.`}
        confirmLabel="Remove and save"
        loading={save.isPending}
        onConfirm={() => pendingRemoval && save.mutate(pendingRemoval)}
      />
    </AdminDialog>
  );
}
