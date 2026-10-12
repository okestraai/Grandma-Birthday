import { useCallback, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, type FieldPath, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, ArrowRight, Info, RotateCcw } from 'lucide-react';
import type { RsvpAvailability, RsvpFormConfig, RsvpInvitePrefill, SiteOverview, SubmitRsvpRequest, SubmitRsvpResult } from '@birthday/types';
import { Button } from '@/components/ui/button';
import { api, errorMessage, isApiError, isServerUnreachable, UNREACHABLE_FORM_MESSAGE } from '@/lib/api';
import { publicKeys } from '@/lib/public-api';
import { cn } from '@/lib/utils';
import { EASE } from '../reveal';
import { ClosedNotice, InviteOnlyNotice } from './notices';
import { InvitationHeader, RsvpCard } from './parts';
import { ProgressSteps } from './ProgressSteps';
import { RsvpResult } from './RsvpResult';
import {
  LAST_STEP,
  buildSubmitBody,
  companionLimit,
  createStepSchemas,
  defaultValues,
  eventOptions,
  firstInvalidStep,
  requiresCategory,
  sortQuestions,
  stepFields,
  stepForField,
  visibleEvents,
  type RsvpStep,
  type RsvpValues,
  SERVER_FIELD_ALIASES,
} from './schema';
import { StepDetails } from './StepDetails';
import { StepGuests } from './StepGuests';
import { StepPreferences } from './StepPreferences';
import { StepReview } from './StepReview';

type Banner = { tone: 'info' | 'error'; title: string; text: string; retry?: boolean; editStep?: RsvpStep };
type Terminal = { kind: 'closed'; reason: RsvpAvailability['closedReason'] } | { kind: 'invite' };

export function RsvpForm({
  config,
  site,
  prefill,
  inviteToken,
}: {
  config: RsvpFormConfig;
  site?: SiteOverview;
  prefill?: RsvpInvitePrefill | null;
  inviteToken: string | null;
}) {
  const invited = Boolean(prefill && inviteToken);
  const questions = useMemo(() => sortQuestions(config.questions), [config.questions]);
  const ctx = useMemo(
    () => ({
      config,
      invited,
      allowedCompanions: invited ? (prefill?.allowedCompanions ?? 0) : null,
      events: invited ? (prefill?.events ?? []) : config.events,
    }),
    [config, invited, prefill],
  );
  const schemas = useMemo(() => createStepSchemas(ctx), [ctx]);

  const [step, setStep] = useState<RsvpStep>(0);
  const stepRef = useRef<RsvpStep>(0);
  const [direction, setDirection] = useState(1);
  const [navigated, setNavigated] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [companionError, setCompanionError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [result, setResult] = useState<SubmitRsvpResult | null>(null);
  /** Categories the server just told us are full, before the refreshed form config arrives. */
  const [fullNow, setFullNow] = useState<ReadonlySet<string>>(() => new Set());
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  // Validate only the slice that belongs to the current step.
  const resolver = useMemo<Resolver<RsvpValues>>(() => {
    const perStep = [zodResolver(schemas[0]), zodResolver(schemas[1]), zodResolver(schemas[2])] as unknown as Resolver<RsvpValues>[];
    return (values, context, options) => {
      const current = stepRef.current;
      if (current === LAST_STEP) return { values, errors: {} };
      return perStep[current](values, context, options);
    };
  }, [schemas]);

  const form = useForm<RsvpValues>({
    defaultValues: defaultValues(questions, invited ? prefill : null, eventOptions(ctx)),
    resolver,
    mode: 'onTouched',
  });
  const { trigger, getValues, watch, setError } = form;

  const response = watch('response');
  const categoryId = watch('categoryId');
  const limit = companionLimit(config, { allowedCompanions: ctx.allowedCompanions, categoryId });
  const categories = useMemo(
    () => (requiresCategory(ctx) ? config.categories.map((c) => (fullNow.has(c.id) ? { ...c, full: true } : c)) : null),
    [ctx, config.categories, fullNow],
  );
  const invitedAs = invited ? (prefill?.categoryName ?? null) : null;
  const offered = visibleEvents(ctx, categoryId);
  const timezone = site?.celebration.timezone;

  const goTo = useCallback((target: RsvpStep) => {
    setDirection(target > stepRef.current ? 1 : -1);
    stepRef.current = target;
    setStep(target);
    setNavigated(true);
  }, []);

  const fieldsFor = (target: RsvpStep) => stepFields(target, getValues(), questions) as FieldPath<RsvpValues>[];

  async function next() {
    if (step === LAST_STEP) return;
    const ok = await trigger(fieldsFor(step), { shouldFocus: true });
    if (!ok) return;
    if (step === 1) setCompanionError(null);
    setBanner(null);
    goTo((step + 1) as RsvpStep);
  }

  function back() {
    if (step === 0) return;
    setBanner(null);
    goTo((step - 1) as RsvpStep);
  }

  const mutation = useMutation({
    mutationFn: (body: SubmitRsvpRequest) => api.post<SubmitRsvpResult>('/rsvp', body),
  });

  function applyValidationDetails(details: Record<string, string[]> | undefined): boolean {
    let first: RsvpStep | null = null;
    for (const [key, messages] of Object.entries(details ?? {})) {
      const target = stepForField(key);
      if (target === null || key === 'inviteToken') continue;
      setError((SERVER_FIELD_ALIASES[key] ?? key) as FieldPath<RsvpValues>, { type: 'server', message: messages[0] ?? 'Please check this field.' });
      if (first === null || target < first) first = target;
    }
    if (first === null) return false;
    goTo(first);
    return true;
  }

  function handleError(error: unknown) {
    if (isServerUnreachable(error)) {
      setBanner({ tone: 'error', title: 'Your reply was not sent', text: UNREACHABLE_FORM_MESSAGE, retry: true });
      return;
    }
    if (!isApiError(error)) {
      setBanner({ tone: 'error', title: 'Your reply was not sent', text: errorMessage(error), retry: true });
      return;
    }
    switch (error.code) {
      case 'RSVP_ALREADY_EXISTS':
        setBanner({
          tone: 'info',
          title: 'You already have an invitation',
          text: 'An invitation has already been sent to this email address. Please check your inbox and use the link in that email to update your reply.',
          editStep: 0,
        });
        return;
      case 'COMPANION_LIMIT_EXCEEDED':
        setCompanionError(error.message || 'You have added more accompanying guests than your invitation allows.');
        goTo(1);
        return;
      case 'EVENT_CAPACITY_REACHED':
        setTerminal({ kind: 'closed', reason: 'CAPACITY_REACHED' });
        return;
      case 'EVENT_FULL':
        // One event filled up; the others may still have room. Fresh counts mark it full.
        void queryClient.invalidateQueries({ queryKey: invited && inviteToken ? publicKeys.invite(inviteToken) : publicKeys.rsvpForm });
        setError('events', { type: 'server', message: error.message });
        setBanner({ tone: 'error', title: 'One of your events is full', text: `${error.message} Please untick it and confirm again.` });
        goTo(1);
        return;
      case 'CATEGORY_CAPACITY_REACHED': {
        void queryClient.invalidateQueries({ queryKey: publicKeys.rsvpForm });
        const chosen = getValues('categoryId');
        if (categories && chosen) {
          setFullNow((prev) => new Set(prev).add(chosen));
          setError('categoryId', { type: 'server', message: 'The places for this group are taken. Please choose another option.' });
          setBanner({
            tone: 'error',
            title: 'No places left in this group',
            text: `${error.message} Please go back to step 1 and choose another answer to "How do you know the family?".`,
            editStep: 0,
          });
          goTo(0);
        } else {
          // Invited guests do not choose a category; only the family can help.
          setBanner({
            tone: 'error',
            title: 'No places left in your group',
            text: `${error.message} Please contact the family if you would still like to attend.`,
          });
        }
        return;
      }
      case 'RSVP_CLOSED':
        setTerminal({ kind: 'closed', reason: null });
        return;
      case 'RSVP_INVITE_REQUIRED':
        setTerminal({ kind: 'invite' });
        return;
      case 'VALIDATION_FAILED':
        if (applyValidationDetails(error.details)) {
          toast.error('Please check the highlighted details.');
          return;
        }
        setBanner({ tone: 'error', title: 'Please check your reply', text: error.message, editStep: 0 });
        return;
      case 'RATE_LIMITED':
        setBanner({
          tone: 'error',
          title: 'A moment, please',
          text: 'We received several attempts in quick succession. Please wait a minute, then try again.',
          retry: true,
        });
        return;
      default:
        setBanner({ tone: 'error', title: 'Your reply was not sent', text: errorMessage(error), retry: true });
    }
  }

  async function submit() {
    setBanner(null);
    const values = getValues();
    const invalid = firstInvalidStep(schemas, values);
    if (invalid !== null) {
      goTo(invalid);
      await trigger(fieldsFor(invalid));
      return;
    }
    try {
      const body = buildSubmitBody(values, { ...ctx, inviteToken: invited ? inviteToken : null });
      const data = await mutation.mutateAsync(body);
      setResult(data);
      toast.success(data.response === 'ATTENDING' ? 'Your reply has been received. See you there!' : 'Thank you for letting us know.');
    } catch (error) {
      handleError(error);
    }
  }

  const contact = site?.celebration;

  if (result) return <RsvpResult result={result} email={getValues('email').trim()} event={contact} timezone={timezone} />;
  if (terminal?.kind === 'invite') return <InviteOnlyNotice event={contact} focusOnMount />;
  if (terminal?.kind === 'closed') {
    return <ClosedNotice availability={{ closedReason: terminal.reason, deadline: null }} event={contact} timezone={timezone} focusOnMount />;
  }

  // Direction-aware step slides. Variants (not inline values) so the leaving step reads the
  // new direction from AnimatePresence's `custom` and exits the right way.
  const offset = reduceMotion ? 0 : 56;
  const stepVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * offset, rotateY: reduceMotion ? 0 : dir * 8 }),
    center: { opacity: 1, x: 0, rotateY: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -offset, rotateY: reduceMotion ? 0 : dir * -8 }),
  };
  const attending = response === 'ATTENDING';

  return (
    <RsvpCard>
      {site && step === 0 && <InvitationHeader site={site} className="mb-8" />}
      {invitedAs && (
        <p className="mb-6 text-center text-sm text-muted">
          You are invited as <span className="font-medium text-navy">{invitedAs}</span>
        </p>
      )}
      {invited && prefill?.existing && step === 0 && (
        <p className="mx-auto mb-6 flex max-w-md items-start justify-center gap-2 rounded-xl bg-cream px-4 py-3 text-left text-sm text-navy">
          <Info className="mt-0.5 size-4 shrink-0 text-gold-rich" aria-hidden />
          You have replied before. Your answers are filled in below; change anything and confirm again to update your reply.
        </p>
      )}

      <ProgressSteps step={step} />

      <form
        noValidate
        aria-label="RSVP"
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (step === LAST_STEP) void submit();
          else void next();
        }}
      >
        <FormProvider {...form}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduceMotion ? 0.2 : 0.45, ease: EASE }}
              style={{ transformPerspective: 1000 }}
            >
              {step === 0 && <StepDetails focusOnMount={navigated} emailLocked={invited} categories={categories} />}
              {step === 1 && (
                <StepGuests
                  focusOnMount={navigated}
                  allowCompanions={config.allowCompanions}
                  limit={limit}
                  serverError={companionError}
                  events={offered}
                  timezone={timezone}
                  wholeCelebration={config.rsvpScope === 'WHOLE_CELEBRATION'}
                />
              )}
              {step === 2 && <StepPreferences focusOnMount={navigated} questions={questions} tributes={config.tributes} />}
              {step === 3 && (
                <StepReview
                  focusOnMount={navigated}
                  onEdit={goTo}
                  allowCompanions={config.allowCompanions}
                  categories={categories}
                  invitedAs={invitedAs}
                  questions={questions}
                  schemaContext={ctx}
                  timezone={timezone}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </FormProvider>

        {banner && (
          <div
            role="alert"
            className={cn(
              'mt-6 flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm',
              banner.tone === 'error' ? 'border-error/25 bg-error/5' : 'border-gold/40 bg-champagne/40',
            )}
          >
            {banner.tone === 'error' ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-gold-rich" aria-hidden />
            )}
            <div className="flex-1">
              <p className="font-medium text-navy">{banner.title}</p>
              <p className="mt-1 leading-relaxed text-charcoal/80">{banner.text}</p>
              {(banner.retry || banner.editStep !== undefined) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {banner.retry && (
                    <Button size="sm" variant="outline" className="text-navy" onClick={() => void submit()} loading={mutation.isPending}>
                      <RotateCcw aria-hidden /> Try again
                    </Button>
                  )}
                  {banner.editStep !== undefined && (
                    <Button size="sm" variant="ghost" className="text-navy" onClick={() => goTo(banner.editStep!)}>
                      Edit my details
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-gold/25 pt-6 sm:flex-row sm:items-center sm:justify-between">
          {step > 0 ? (
            <Button variant="ghost" className="text-navy" onClick={back} disabled={mutation.isPending}>
              <ArrowLeft aria-hidden /> Back
            </Button>
          ) : (
            <span aria-hidden className="hidden sm:block" />
          )}
          {step < LAST_STEP ? (
            <Button type="submit" variant="primary" size="lg">
              Continue <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button type="submit" variant="gold" size="lg" loading={mutation.isPending}>
              {attending ? 'Confirm my attendance' : 'Send my regrets'}
            </Button>
          )}
        </div>
      </form>
    </RsvpCard>
  );
}
