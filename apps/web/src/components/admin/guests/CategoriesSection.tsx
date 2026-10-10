import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { GuestCategory, UpsertGuestCategoryRequest } from '@birthday/types';
import { api, errorMessage } from '@/lib/api';
import { adminKeys, affects, moveItem, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { Badge } from '@/components/ui/badge';
import { AButton, AField, AInput, ATextarea, IconButton, SwitchRow, describedBy } from '../ui';
import { DataTable, type Column } from '../data-table';
import { AdminDialog, Confirm } from '../overlays';
import { ReorderButtons } from '../misc';
import { useGuestCategories } from './shared';
import { PEOPLE_COMING_NOTE } from '../event/allocations';

const HEX = /^#[0-9a-fA-F]{6}$/;

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').min(2, 'Use at least 2 characters').max(60, 'Keep it to 60 characters or fewer'),
  description: z.string().trim().max(300, 'Keep it to 300 characters or fewer'),
  defaultCompanions: z.number({ error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative').max(20, 'At most 20'),
  selfSelectable: z.boolean(),
  color: z.string().trim().refine((v) => v === '' || HEX.test(v), 'Use a hex colour such as #C9A24A'),
  sortOrder: z.number({ error: 'Enter a number' }).int('Whole numbers only').min(0, 'Cannot be negative'),
  /** Blank = no separate limit. Kept as text so an empty box stays empty. */
  capacity: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Enter a whole number, or leave blank for no limit')
    .refine((v) => v === '' || Number(v) <= 100_000, 'At most 100,000'),
});
type FormValues = z.infer<typeof schema>;

function toRequest(c: GuestCategory, sortOrder = c.sortOrder): UpsertGuestCategoryRequest {
  return {
    name: c.name,
    description: c.description,
    defaultCompanions: c.defaultCompanions,
    selfSelectable: c.selfSelectable,
    color: c.color,
    sortOrder,
  };
}

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: GuestCategory | null;
  nextSortOrder: number;
}) {
  const { register, handleSubmit, reset, setError, setValue, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const { errors } = formState;
  const color = useWatch({ control, name: 'color' }) ?? '';
  const selfSelectable = useWatch({ control, name: 'selfSelectable' }) ?? false;

  useEffect(() => {
    if (!open) return;
    reset(
      category
        ? {
            name: category.name,
            description: category.description ?? '',
            defaultCompanions: category.defaultCompanions,
            selfSelectable: category.selfSelectable,
            color: category.color ?? '',
            sortOrder: category.sortOrder,
            capacity: category.capacity === null ? '' : String(category.capacity),
          }
        : { name: '', description: '', defaultCompanions: 1, selfSelectable: false, color: '', sortOrder: nextSortOrder, capacity: '' },
    );
    // Reset on open only: nextSortOrder can change on a background refetch.
  }, [open, category, reset]);

  const save = useAdminMutation<GuestCategory, UpsertGuestCategoryRequest>({
    mutationFn: (body) =>
      category ? api.put<GuestCategory>(`/admin/guest-categories/${category.id}`, body) : api.post<GuestCategory>('/admin/guest-categories', body),
    invalidate: affects.guests,
    success: category ? 'Category saved' : 'Category added',
    toastError: false,
    onSuccess: () => onOpenChange(false),
    onError: (error) => reportFormError(error, setError, Object.keys(schema.shape)),
  });

  const onSubmit = handleSubmit((v) =>
    save.mutate({
      name: v.name,
      description: nullIfBlank(v.description),
      defaultCompanions: v.defaultCompanions,
      selfSelectable: v.selfSelectable,
      color: v.color ? v.color.toUpperCase() : null,
      sortOrder: v.sortOrder,
      capacity: v.capacity === '' ? null : Number(v.capacity),
    }),
  );

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? `Edit ${category.name}` : 'Add category'}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="category-form" variant="emerald" loading={save.isPending}>
            {category ? 'Save changes' : 'Add category'}
          </AButton>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <AField label="Name" htmlFor="cat-name" required error={errors.name?.message}>
          <AInput id="cat-name" placeholder="e.g. Family, Church, Colleagues" {...register('name')} aria-invalid={!!errors.name} aria-describedby={describedBy('cat-name', errors.name)} />
        </AField>
        <AField label="Description" htmlFor="cat-description" error={errors.description?.message} hint="Shown to guests when they can choose this category.">
          <ATextarea
            id="cat-description"
            rows={2}
            placeholder="e.g. Relatives and in-laws"
            {...register('description')}
            aria-invalid={!!errors.description}
            aria-describedby={describedBy('cat-description', errors.description, true)}
          />
        </AField>
        <div className="grid gap-4 sm:grid-cols-2">
          <AField label="Default companions" htmlFor="cat-companions" required error={errors.defaultCompanions?.message} hint="0–20 people a guest may bring.">
            <AInput
              id="cat-companions"
              type="number"
              placeholder="e.g. 1"
              min={0}
              max={20}
              inputMode="numeric"
              {...register('defaultCompanions', { valueAsNumber: true })}
              aria-invalid={!!errors.defaultCompanions}
              aria-describedby={describedBy('cat-companions', errors.defaultCompanions, true)}
            />
          </AField>
          <AField label="Sort order" htmlFor="cat-sort" error={errors.sortOrder?.message} hint="Lower numbers come first.">
            <AInput
              id="cat-sort"
              type="number"
              placeholder="e.g. 0"
              min={0}
              inputMode="numeric"
              {...register('sortOrder', { valueAsNumber: true })}
              aria-invalid={!!errors.sortOrder}
              aria-describedby={describedBy('cat-sort', errors.sortOrder, true)}
            />
          </AField>
        </div>
        <AField
          label="Places set aside"
          htmlFor="cat-capacity"
          error={errors.capacity?.message}
          hint={
            category && category.confirmedPeople > 0
              ? `Optional. Seats kept for this category (people, not invitations). ${category.confirmedPeople} ${category.confirmedPeople === 1 ? 'person is' : 'people are'} already coming, so allow at least that many.`
              : 'Optional. Seats kept for this category (people, not invitations); when they are taken, new RSVPs in this category are refused. Leave blank for no separate limit.'
          }
        >
          <AInput
            id="cat-capacity"
            type="number"
            placeholder="No limit"
            min={0}
            step={1}
            inputMode="numeric"
            className="w-40"
            {...register('capacity')}
            aria-invalid={!!errors.capacity}
            aria-describedby={describedBy('cat-capacity', errors.capacity, true)}
          />
        </AField>
        <AField label="Colour" htmlFor="cat-color" error={errors.color?.message} hint="Used as a dot next to the category name in lists.">
          <div className="flex items-center gap-2">
            <AInput
              type="color"
              aria-label="Pick a colour"
              value={HEX.test(color) ? color : '#C9A24A'}
              onChange={(e) => setValue('color', e.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
              className="w-12 shrink-0"
            />
            <AInput
              id="cat-color"
              placeholder="#C9A24A"
              maxLength={7}
              className="w-32 font-mono"
              {...register('color')}
              aria-invalid={!!errors.color}
              aria-describedby={describedBy('cat-color', errors.color, true)}
            />
            {color && (
              <IconButton label="Remove colour" tooltip={false} onClick={() => setValue('color', '', { shouldDirty: true, shouldValidate: true })}>
                <X aria-hidden />
              </IconButton>
            )}
          </div>
        </AField>
        <SwitchRow
          label="Guests can choose this category when registering"
          description="Leave off for categories you assign yourself, such as Family or VIP."
          checked={selfSelectable}
          onCheckedChange={(on) => setValue('selfSelectable', on, { shouldDirty: true })}
        />
      </form>
    </AdminDialog>
  );
}

function RemainingCell({ category }: { category: GuestCategory }) {
  if (category.capacity == null) return <span className="text-muted">—</span>;
  const left = Math.max(0, category.capacity - (category.confirmedPeople ?? 0));
  if (category.full || left === 0) return <Badge tone="danger">Full</Badge>;
  return (
    <span className="tabular-nums">
      {left.toLocaleString()} {left === 1 ? 'seat' : 'seats'} left
    </span>
  );
}

export function CategoriesSection() {
  const queryClient = useQueryClient();
  const categories = useGuestCategories();
  const [editing, setEditing] = useState<GuestCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<GuestCategory | null>(null);
  const [reordering, setReordering] = useState(false);

  const rows = categories.data ? [...categories.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined;

  const openForm = (category: GuestCategory | null) => {
    setEditing(category);
    setFormOpen(true);
  };

  const remove = useAdminMutation<void, string>({
    mutationFn: (id) => api.delete(`/admin/guest-categories/${id}`),
    invalidate: affects.guests,
    success: 'Category deleted',
    onSuccess: () => setDeleting(null),
  });

  /** There is no reorder endpoint: PUT each category whose position changed with its full body. */
  const move = async (index: number, delta: -1 | 1) => {
    if (!rows) return;
    const next = moveItem(rows, index, delta).map((c, i) => ({ category: c, sortOrder: i }));
    const changed = next.filter(({ category, sortOrder }) => category.sortOrder !== sortOrder);
    if (changed.length === 0) return;
    setReordering(true);
    queryClient.setQueryData<GuestCategory[]>(
      adminKeys.categories,
      next.map(({ category, sortOrder }) => ({ ...category, sortOrder })),
    );
    try {
      await Promise.all(changed.map(({ category, sortOrder }) => api.put(`/admin/guest-categories/${category.id}`, toRequest(category, sortOrder))));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setReordering(false);
      await Promise.all(affects.guests.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    }
  };

  const columns: Column<GuestCategory>[] = [
    {
      id: 'order',
      header: <span className="sr-only">Order</span>,
      className: 'w-20',
      cell: (c) => <ReorderButtons index={rows!.indexOf(c)} count={rows!.length} label={c.name} disabled={reordering} onMove={(d) => move(rows!.indexOf(c), d)} />,
    },
    {
      id: 'name',
      header: 'Category',
      cell: (c) => (
        <div className="flex items-start gap-2">
          <span
            className="mt-1 size-3 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: c.color ?? 'transparent' }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-medium text-navy">{c.name}</p>
            {c.description && <p className="line-clamp-2 text-xs text-muted">{c.description}</p>}
          </div>
        </div>
      ),
    },
    { id: 'companions', header: 'Companions', className: 'tabular-nums', cell: (c) => c.defaultCompanions },
    {
      id: 'self',
      header: 'Registration',
      hideBelow: 'lg',
      cell: (c) => (c.selfSelectable ? <Badge tone="info">Guests can choose</Badge> : <Badge tone="neutral">Admin only</Badge>),
    },
    { id: 'guests', header: 'Invitations', className: 'tabular-nums', cell: (c) => (c.guestCount ?? 0).toLocaleString() },
    { id: 'confirmed', header: 'People coming', className: 'tabular-nums', hideBelow: 'lg', cell: (c) => (c.confirmedPeople ?? 0).toLocaleString() },
    {
      id: 'capacity',
      header: 'Places set aside',
      className: 'tabular-nums',
      cell: (c) => (c.capacity == null ? <span className="text-muted">—</span> : c.capacity.toLocaleString()),
    },
    { id: 'remaining', header: 'Remaining', cell: (c) => <RemainingCell category={c} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (c) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit ${c.name}`} onClick={() => openForm(c)}>
            <Pencil aria-hidden />
          </IconButton>
          <IconButton label={`Delete ${c.name}`} variant="danger-ghost" onClick={() => setDeleting(c)}>
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      ),
    },
  ];

  const nextSortOrder = rows && rows.length ? Math.max(...rows.map((c) => c.sortOrder)) + 1 : 0;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Use the arrows to set the order guests see when registering. Split the event capacity between categories on the{' '}
          <Link to="/admin/event#event-allocations" className="font-medium text-navy underline underline-offset-2">
            Event page
          </Link>
          .
          <span className="mt-0.5 block text-xs">{PEOPLE_COMING_NOTE}</span>
        </p>
        <AButton variant="emerald" onClick={() => openForm(null)}>
          <Plus aria-hidden /> Add category
        </AButton>
      </div>
      <DataTable
        caption="Guest categories"
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        loading={categories.isLoading}
        error={categories.error}
        onRetry={() => categories.refetch()}
        emptyTitle="No categories yet"
        emptyDescription="Categories group guests (Family, Friends, Church…) and set how many companions they may bring."
        emptyAction={
          <AButton variant="emerald" onClick={() => openForm(null)}>
            <Plus aria-hidden /> Add category
          </AButton>
        }
        mobileCard={(c) => (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-navy">
                {c.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />}
                {c.name}
              </p>
              <p className="text-xs text-muted">
                {c.defaultCompanions} companion{c.defaultCompanions === 1 ? '' : 's'} · {c.guestCount} invitation{c.guestCount === 1 ? '' : 's'} ·{' '}
                {c.selfSelectable ? 'Guests can choose' : 'Admin only'}
              </p>
              <p className="text-xs text-muted">
                {c.confirmedPeople} {c.confirmedPeople === 1 ? 'person' : 'people'} coming · {c.capacity === null ? 'no places set aside' : `${c.capacity} places set aside`}{' '}
                {c.capacity !== null && <RemainingCell category={c} />}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <ReorderButtons index={rows!.indexOf(c)} count={rows!.length} label={c.name} disabled={reordering} onMove={(d) => move(rows!.indexOf(c), d)} />
              <IconButton label={`Edit ${c.name}`} tooltip={false} onClick={() => openForm(c)}>
                <Pencil aria-hidden />
              </IconButton>
              <IconButton label={`Delete ${c.name}`} tooltip={false} variant="danger-ghost" onClick={() => setDeleting(c)}>
                <Trash2 aria-hidden />
              </IconButton>
            </div>
          </div>
        )}
      />

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} nextSortOrder={nextSortOrder} />

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        description={
          deleting && deleting.guestCount > 0 ? (
            <>
              <strong>
                {deleting.guestCount} guest{deleting.guestCount === 1 ? '' : 's'}
              </strong>{' '}
              {deleting.guestCount === 1 ? 'is' : 'are'} in this category. They will have no category afterwards; their invitations keep working.
            </>
          ) : (
            'No guests are in this category.'
          )
        }
        confirmLabel="Delete category"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
