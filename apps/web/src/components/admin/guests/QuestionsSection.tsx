import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminRsvpQuestion, RsvpQuestionType, UpsertRsvpQuestionRequest } from '@birthday/types';
import { api, errorMessage } from '@/lib/api';
import { adminKeys, moveItem, nullIfBlank, reportFormError, useAdminMutation } from '@/lib/admin-api';
import { questionsQuery } from '@/lib/admin-queries';
import { Badge } from '@/components/ui/badge';
import { AButton, AField, AInput, ASelect, ASwitch, ATextarea, IconButton, SwitchRow, describedBy } from '../ui';
import { DataTable, type Column } from '../data-table';
import { AdminDialog, Confirm } from '../overlays';
import { ReorderButtons, StringListEditor } from '../misc';

const TYPE_LABEL: Record<RsvpQuestionType, string> = {
  TEXT: 'Short text',
  TEXTAREA: 'Long text',
  SELECT: 'Dropdown',
  CHECKBOX: 'Yes / no checkbox',
};

const schema = z
  .object({
    label: z.string().trim().min(1, 'Enter the question').min(2, 'Use at least 2 characters').max(200, 'Keep it to 200 characters or fewer'),
    helpText: z.string().trim().max(300, 'Keep it to 300 characters or fewer'),
    type: z.enum(['TEXT', 'TEXTAREA', 'SELECT', 'CHECKBOX']),
    options: z.array(z.string().refine((o) => o.trim().length <= 100, 'Keep each option to 100 characters or fewer.')).max(30, 'Add up to 30 options.'),
    required: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'SELECT') return;
    const options = v.options.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'A dropdown needs at least two options.' });
    else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Each option must be different.' });
  });
type FormValues = z.infer<typeof schema>;

const invalidateQuestions = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.questions }),
    queryClient.invalidateQueries({ queryKey: adminKeys.event }),
  ]);

function toRequest(q: AdminRsvpQuestion, change: Partial<UpsertRsvpQuestionRequest> = {}): UpsertRsvpQuestionRequest {
  return {
    label: q.label,
    helpText: q.helpText,
    type: q.type,
    options: q.options,
    required: q.required,
    isActive: q.isActive,
    sortOrder: q.sortOrder,
    ...change,
  };
}

/** How the question will look on the RSVP form (non-interactive). */
function QuestionPreview({ label, helpText, type, options, required }: Pick<FormValues, 'label' | 'helpText' | 'type' | 'options' | 'required'>) {
  const id = useId();
  const title = label.trim() || 'Your question';
  const choices = options.map((o) => o.trim()).filter(Boolean);
  return (
    <div aria-label="Preview" role="group" className="rounded-lg border border-dashed border-navy/20 bg-cream/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Preview</p>
      {type === 'CHECKBOX' ? (
        <label htmlFor={id} className="flex items-start gap-2 text-sm text-charcoal">
          <input id={id} type="checkbox" disabled className="mt-0.5 size-4" />
          <span>
            {title}
            {required && <span className="text-error"> *</span>}
            {helpText && <span className="mt-0.5 block text-xs text-muted">{helpText}</span>}
          </span>
        </label>
      ) : (
        <div>
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy">
            {title}
            {required && <span className="text-error"> *</span>}
          </label>
          {type === 'TEXT' && <AInput id={id} disabled placeholder="Guest’s answer" />}
          {type === 'TEXTAREA' && <ATextarea id={id} disabled rows={3} placeholder="Guest’s answer" />}
          {type === 'SELECT' && (
            <ASelect id={id} disabled defaultValue="">
              <option value="">Choose…</option>
              {choices.map((c, i) => (
                <option key={i}>{c}</option>
              ))}
            </ASelect>
          )}
          {helpText && <p className="mt-1 text-xs text-muted">{helpText}</p>}
        </div>
      )}
    </div>
  );
}

function QuestionFormDialog({
  open,
  onOpenChange,
  question,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: AdminRsvpQuestion | null;
  nextSortOrder: number;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', helpText: '', type: 'TEXT', options: [], required: false, isActive: true },
  });
  const { errors } = formState;
  const optionsError = errors.options?.message ?? errors.options?.root?.message ?? (Array.isArray(errors.options) ? errors.options.find((e) => e)?.message : undefined);
  const watched = useWatch({ control });

  useEffect(() => {
    if (!open) return;
    reset(
      question
        ? {
            label: question.label,
            helpText: question.helpText ?? '',
            type: question.type,
            options: question.options,
            required: question.required,
            isActive: question.isActive,
          }
        : { label: '', helpText: '', type: 'TEXT', options: [], required: false, isActive: true },
    );
  }, [open, question, reset]);

  const save = useAdminMutation<AdminRsvpQuestion, UpsertRsvpQuestionRequest>({
    mutationFn: (body) =>
      question ? api.put<AdminRsvpQuestion>(`/admin/rsvp-questions/${question.id}`, body) : api.post<AdminRsvpQuestion>('/admin/rsvp-questions', body),
    success: question ? 'Question saved' : 'Question added',
    toastError: false,
    onSuccess: () => {
      void invalidateQuestions(queryClient);
      onOpenChange(false);
    },
    onError: (error) => reportFormError(error, setError, ['label', 'helpText', 'type', 'options', 'required', 'isActive']),
  });

  const onSubmit = handleSubmit((v) =>
    save.mutate({
      label: v.label,
      helpText: nullIfBlank(v.helpText),
      type: v.type,
      options: v.type === 'SELECT' ? v.options.map((o) => o.trim()).filter(Boolean) : [],
      required: v.required,
      isActive: v.isActive,
      sortOrder: question?.sortOrder ?? nextSortOrder,
    }),
  );

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={question ? 'Edit question' : 'Add RSVP question'}
      description="Extra questions appear on the RSVP form after the standard fields."
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton type="submit" form="question-form" variant="emerald" loading={save.isPending}>
            {question ? 'Save changes' : 'Add question'}
          </AButton>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_16rem]">
        <form id="question-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <AField label="Question" htmlFor="q-label" required error={errors.label?.message}>
            <AInput id="q-label" placeholder="e.g. Which meal would you prefer?" {...register('label')} aria-invalid={!!errors.label} aria-describedby={describedBy('q-label', errors.label)} />
          </AField>
          <AField label="Help text" htmlFor="q-help" error={errors.helpText?.message} hint="Optional hint shown under the question.">
            <AInput id="q-help" placeholder="e.g. Let us know by 1 December" {...register('helpText')} aria-invalid={!!errors.helpText} aria-describedby={describedBy('q-help', errors.helpText, true)} />
          </AField>
          <AField label="Answer type" htmlFor="q-type" error={errors.type?.message}>
            <ASelect id="q-type" {...register('type')}>
              {(Object.keys(TYPE_LABEL) as RsvpQuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </ASelect>
          </AField>
          {watched.type === 'SELECT' && (
            <div>
              <Controller
                control={control}
                name="options"
                render={({ field }) => (
                  <StringListEditor label="Options" values={field.value} onChange={field.onChange} placeholder="e.g. Jollof rice" max={30} maxLength={100} hint="At least two." />
                )}
              />
              {optionsError && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {optionsError}
                </p>
              )}
            </div>
          )}
          <Controller
            control={control}
            name="required"
            render={({ field }) => (
              <SwitchRow label="Required" description="Guests must answer before sending their RSVP." checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <SwitchRow label="Active" description="Inactive questions are hidden from the form; past answers are kept." checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </form>
        <div className="md:pt-6">
          <QuestionPreview
            label={watched.label ?? ''}
            helpText={watched.helpText ?? ''}
            type={watched.type ?? 'TEXT'}
            options={(watched.options ?? []).filter((o): o is string => typeof o === 'string')}
            required={watched.required ?? false}
          />
        </div>
      </div>
    </AdminDialog>
  );
}

export function QuestionsSection() {
  const queryClient = useQueryClient();
  const questions = useQuery(questionsQuery);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRsvpQuestion | null>(null);
  const [deleting, setDeleting] = useState<AdminRsvpQuestion | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = questions.data ? [...questions.data].sort((a, b) => a.sortOrder - b.sortOrder) : undefined;
  const nextSortOrder = rows && rows.length ? Math.max(...rows.map((q) => q.sortOrder)) + 1 : 0;

  const openForm = (q: AdminRsvpQuestion | null) => {
    setEditing(q);
    setFormOpen(true);
  };

  /** PUT a batch of full question bodies, optimistically. */
  const putAll = async (updates: { question: AdminRsvpQuestion; change: Partial<UpsertRsvpQuestionRequest> }[], success?: string) => {
    if (updates.length === 0) return;
    setBusy(true);
    const previous = queryClient.getQueryData<AdminRsvpQuestion[]>(adminKeys.questions);
    queryClient.setQueryData<AdminRsvpQuestion[]>(adminKeys.questions, (list) =>
      list?.map((q) => {
        const u = updates.find((x) => x.question.id === q.id);
        return u ? ({ ...q, ...u.change } as AdminRsvpQuestion) : q;
      }),
    );
    try {
      await Promise.all(updates.map(({ question, change }) => api.put(`/admin/rsvp-questions/${question.id}`, toRequest(question, change))));
      if (success) toast.success(success);
    } catch (error) {
      queryClient.setQueryData(adminKeys.questions, previous);
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      await invalidateQuestions(queryClient);
    }
  };

  const move = (index: number, delta: -1 | 1) => {
    if (!rows) return;
    const next = moveItem(rows, index, delta);
    void putAll(next.map((question, i) => ({ question, change: { sortOrder: i } })).filter(({ question, change }) => question.sortOrder !== change.sortOrder));
  };

  const toggleActive = (q: AdminRsvpQuestion, isActive: boolean) =>
    putAll([{ question: q, change: { isActive } }], isActive ? 'Question shown on the RSVP form' : 'Question hidden from the RSVP form');

  const remove = useAdminMutation<void, string>({
    mutationFn: (id) => api.delete(`/admin/rsvp-questions/${id}`),
    invalidate: [adminKeys.questions, adminKeys.event],
    success: 'Question deleted',
    onSuccess: () => setDeleting(null),
  });

  const columns: Column<AdminRsvpQuestion>[] = [
    {
      id: 'order',
      header: <span className="sr-only">Order</span>,
      className: 'w-20',
      cell: (q) => <ReorderButtons index={rows!.indexOf(q)} count={rows!.length} label={q.label} disabled={busy} onMove={(d) => move(rows!.indexOf(q), d)} />,
    },
    {
      id: 'label',
      header: 'Question',
      cell: (q) => (
        <div>
          <p className="font-medium text-navy">{q.label}</p>
          {q.type === 'SELECT' && <p className="text-xs text-muted">{q.options.join(' · ')}</p>}
        </div>
      ),
    },
    { id: 'type', header: 'Type', cell: (q) => TYPE_LABEL[q.type] },
    { id: 'required', header: 'Required', cell: (q) => (q.required ? <Badge tone="gold">Required</Badge> : <span className="text-muted">Optional</span>) },
    {
      id: 'active',
      header: 'Active',
      cell: (q) => <ASwitch checked={q.isActive} onCheckedChange={(on) => toggleActive(q, on)} aria-label={`Show “${q.label}” on the RSVP form`} disabled={busy} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (q) => (
        <div className="flex justify-end gap-0.5">
          <IconButton label={`Edit “${q.label}”`} onClick={() => openForm(q)}>
            <Pencil aria-hidden />
          </IconButton>
          <IconButton label={`Delete “${q.label}”`} variant="danger-ghost" onClick={() => setDeleting(q)}>
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">Questions appear on the RSVP form in this order.</p>
        <AButton variant="emerald" onClick={() => openForm(null)}>
          <Plus aria-hidden /> Add question
        </AButton>
      </div>
      <DataTable
        caption="RSVP questions"
        columns={columns}
        rows={rows}
        getRowId={(q) => q.id}
        loading={questions.isLoading}
        error={questions.error}
        onRetry={() => questions.refetch()}
        emptyTitle="No extra questions"
        emptyDescription="The RSVP form already asks for name, contact details, companions, dietary and accessibility needs."
        rowClassName={(q) => (q.isActive ? undefined : 'opacity-60')}
        mobileCard={(q) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-navy">{q.label}</p>
                <p className="text-xs text-muted">
                  {TYPE_LABEL[q.type]} · {q.required ? 'Required' : 'Optional'}
                </p>
              </div>
              <ASwitch checked={q.isActive} onCheckedChange={(on) => toggleActive(q, on)} aria-label={`Show “${q.label}” on the RSVP form`} disabled={busy} />
            </div>
            <div className="flex items-center justify-between">
              <ReorderButtons index={rows!.indexOf(q)} count={rows!.length} label={q.label} disabled={busy} onMove={(d) => move(rows!.indexOf(q), d)} />
              <div className="flex">
                <IconButton label={`Edit “${q.label}”`} tooltip={false} onClick={() => openForm(q)}>
                  <Pencil aria-hidden />
                </IconButton>
                <IconButton label={`Delete “${q.label}”`} tooltip={false} variant="danger-ghost" onClick={() => setDeleting(q)}>
                  <Trash2 aria-hidden />
                </IconButton>
              </div>
            </div>
          </div>
        )}
      />

      <QuestionFormDialog open={formOpen} onOpenChange={setFormOpen} question={editing} nextSortOrder={nextSortOrder} />

      <Confirm
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this question?"
        description={
          <>
            “{deleting?.label}” will be removed from the RSVP form, and answers guests already gave may no longer be shown. To keep them, switch the question off instead.
          </>
        }
        confirmLabel="Delete question"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </>
  );
}
