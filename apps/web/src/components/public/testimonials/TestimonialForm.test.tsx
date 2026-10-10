import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jsonResponse, mockFetch } from '@/test/public-helpers';
import { TestimonialForm, testimonialSchema } from './TestimonialForm';

function renderForm(props: Partial<React.ComponentProps<typeof TestimonialForm>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestimonialForm allowPhotos={false} allowVideos={false} celebrantFirstName="Margaret" {...props} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('testimonialSchema', () => {
  const base = { authorName: 'Ada Obi', relationship: '', email: '', message: 'Happy birthday, dear aunty!' };
  it('accepts a valid message with an empty optional email', () => {
    expect(testimonialSchema.safeParse(base).success).toBe(true);
  });
  it('enforces name length, message length and email format', () => {
    expect(testimonialSchema.safeParse({ ...base, authorName: 'A' }).success).toBe(false);
    expect(testimonialSchema.safeParse({ ...base, authorName: 'x'.repeat(81) }).success).toBe(false);
    expect(testimonialSchema.safeParse({ ...base, message: 'too short' }).success).toBe(false);
    expect(testimonialSchema.safeParse({ ...base, message: 'x'.repeat(2001) }).success).toBe(false);
    expect(testimonialSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(testimonialSchema.safeParse({ ...base, email: 'ada@example.com' }).success).toBe(true);
  });
});

describe('TestimonialForm', () => {
  it('shows validation errors and does not submit invalid input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Your name/), 'A');
    await user.type(screen.getByLabelText(/^Email/), 'nope');
    await user.type(screen.getByLabelText(/Your message/), 'short');
    await user.click(screen.getByRole('button', { name: 'Send my message' }));

    expect(await screen.findByText('Please enter your name (at least 2 characters).')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid email address, or leave it empty.')).toBeInTheDocument();
    expect(screen.getByText('Please write at least 10 characters.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits multipart data and explains that the message will be reviewed', async () => {
    const fetchSpy = mockFetch({
      '/api/testimonials': () => jsonResponse({ id: 't1', status: 'PENDING', message: 'Received' }, 201),
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Your name/), 'Ada Obi');
    await user.type(screen.getByLabelText(/Your message/), 'Happy seventieth birthday, with love.');
    await user.click(screen.getByRole('button', { name: 'Send my message' }));

    expect(await screen.findByText(/after the family reviews it/)).toBeInTheDocument();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('POST');
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('authorName')).toBe('Ada Obi');
    expect(body.get('email')).toBeNull();
  });

  it('keeps what was typed and says so when the server cannot be reached', async () => {
    mockFetch({ '/api/testimonials': () => new Response('', { status: 502, statusText: 'Bad Gateway' }) });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Your name/), 'Ada Obi');
    await user.type(screen.getByLabelText(/Your message/), 'Happy seventieth birthday, with love.');
    await user.click(screen.getByRole('button', { name: 'Send my message' }));

    expect(await screen.findByText(/We couldn’t reach the server. Your answers are still here/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/)).toHaveValue('Ada Obi');
    expect(screen.getByLabelText(/Your message/)).toHaveValue('Happy seventieth birthday, with love.');
  });

  it('maps server validation details onto fields', async () => {
    mockFetch({
      '/api/testimonials': () =>
        jsonResponse(
          { success: false, statusCode: 400, code: 'VALIDATION_FAILED', message: 'Invalid', details: { message: ['Please remove links from your message.'] } },
          400,
        ),
    });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText(/Your name/), 'Ada Obi');
    await user.type(screen.getByLabelText(/Your message/), 'Visit https://spam.example now please');
    await user.click(screen.getByRole('button', { name: 'Send my message' }));
    await waitFor(() => expect(screen.getByText('Please remove links from your message.')).toBeInTheDocument());
  });
});
