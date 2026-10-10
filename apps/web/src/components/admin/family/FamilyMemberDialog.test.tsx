import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AdminFamilyMember, UpsertFamilyMemberRequest } from '@birthday/types';
import { api } from '@/lib/api';
import { FamilyMemberDialog } from './FamilyMemberDialog';
import { sampleFamily } from './family-fixtures';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// The media picker needs auth and upload limits; a stub is enough here.
vi.mock('../media', () => ({ MediaField: ({ label }: { label: string }) => <p>{label}</p> }));

function renderDialog(props: Partial<Parameters<typeof FamilyMemberDialog>[0]> & { members: AdminFamilyMember[] }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  const element = <FamilyMemberDialog member={null} existingCelebrant={undefined} onClose={onClose} {...props} />;
  const router = createMemoryRouter([{ path: '/', element }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const childOf = () => screen.getByLabelText(/^Child of/) as HTMLSelectElement;
const optionLabels = () => within(childOf()).getAllByRole('option').map((o) => o.textContent);

describe('FamilyMemberDialog', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset().mockImplementation(async (_p, body) => ({ ...(body as object), fullName: (body as UpsertFamilyMemberRequest).fullName }));
    vi.mocked(api.put).mockReset().mockImplementation(async (_p, body) => ({ ...(body as object), fullName: (body as UpsertFamilyMemberRequest).fullName }));
  });

  it('lists family units in "Child of", without the person, their spouse or descendants', () => {
    const members = sampleFamily();
    renderDialog({ member: members.find((m) => m.id === 'Ngozi')!, members });
    expect(optionLabels()).toEqual(['No parents in the tree (top of the tree or married in)', 'Papa & Mama', 'Emeka', 'Stranger']);
    expect(childOf().value).toBe(['Mama', 'Papa'].sort().join(','));
    expect(screen.getByText('Celebrant’s generation (derived from parents)')).toBeInTheDocument();
  });

  it('sends both parents when a couple is chosen', async () => {
    const members = sampleFamily();
    renderDialog({ members });
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Obi Bello' } });
    fireEvent.change(screen.getByLabelText(/^Relationship to the celebrant/), { target: { value: 'Grandson' } });
    fireEvent.change(childOf(), { target: { value: ['Ada', 'Chidi'].sort().join(',') } });
    expect(screen.getByText('Grandchildren (derived from parents)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Generation/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, UpsertFamilyMemberRequest];
    expect(path).toBe('/admin/family');
    expect([...body.parentIds!].sort()).toEqual(['Ada', 'Chidi']);
    expect(body).not.toHaveProperty('generation');
    expect(body).not.toHaveProperty('spouse');
  });

  it('sends a generation and no parents for the top of the tree', async () => {
    renderDialog({ members: sampleFamily() });
    fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: 'Grandpa Okonkwo' } });
    fireEvent.change(screen.getByLabelText(/^Relationship to the celebrant/), { target: { value: 'Father' } });
    fireEvent.change(screen.getByLabelText(/^Generation/), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ parentIds: [], generation: -1 });
  });

  it('creates a spouse with the member', async () => {
    const members = sampleFamily();
    renderDialog({ member: members.find((m) => m.id === 'Emeka')!, members, startWithSpouse: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter the spouse’s name.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Spouse’s full name/), { target: { value: ' Amaka Obi ' } });
    fireEvent.change(screen.getByLabelText(/^Spouse’s relationship/), { target: { value: 'Sister-in-law' } });
    fireEvent.change(screen.getByLabelText(/^Spouse’s year of birth/), { target: { value: '1970' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.put).mock.calls[0] as [string, UpsertFamilyMemberRequest];
    expect(path).toBe('/admin/family/Emeka');
    expect(body.spouse).toEqual({ fullName: 'Amaka Obi', relationshipLabel: 'Sister-in-law', birthYear: 1970, deathYear: null, bio: null, photoMediaId: null });
  });

  it('confirms, then sends spouse: null when a married-in spouse is removed', async () => {
    const members = sampleFamily();
    renderDialog({ member: members.find((m) => m.id === 'Ada')!, members });
    expect((screen.getByLabelText(/^Spouse’s full name/) as HTMLInputElement).value).toBe('Chidi');

    fireEvent.click(screen.getByRole('switch', { name: /Has a spouse/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/This removes Chidi from the tree/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove and save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.put).mock.calls[0][1] as UpsertFamilyMemberRequest;
    expect(body.spouse).toBeNull();
    expect([...body.parentIds!].sort()).toEqual(['Ngozi', 'Tunde']);
  });

  it('does not edit a spouse who is a blood relative', async () => {
    const members = sampleFamily();
    renderDialog({ member: members.find((m) => m.id === 'Papa')!, members });
    expect(screen.getByText(/edit Mama directly/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Has a spouse/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.put).mock.calls[0][1] as UpsertFamilyMemberRequest;
    expect(body).not.toHaveProperty('spouse');
    expect(body).toMatchObject({ parentIds: [], generation: -1 });
  });
});
