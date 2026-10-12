import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckInGuestSummary, CheckInVerifyResult } from '@birthday/types';
import { CheckInResultCard, announcementFor, type CheckInView } from './CheckInResultCard';

const guest: CheckInGuestSummary = {
  invitationId: 'inv-1',
  code: '7K3P-Q9XA',
  guestName: 'Adaeze Okafor',
  categoryName: 'Family',
  partySize: 2,
  companions: ['Chidi Okafor'],
  dietary: 'Vegetarian',
  accessibility: 'Wheelchair access',
  events: [{ id: 'e1', name: 'Thanksgiving Service' }],
};

const event = { id: 'e1', name: 'Thanksgiving Service' };

function resultView(result: Partial<CheckInVerifyResult> & Pick<CheckInVerifyResult, 'status'>): CheckInView {
  return { kind: 'result', result: { guest: null, checkIn: null, event, ...result } };
}

function renderCard(view: CheckInView, showEvent = false) {
  const onCheckIn = vi.fn();
  const onReset = vi.fn();
  render(<CheckInResultCard view={view} onCheckIn={onCheckIn} onReset={onReset} showEvent={showEvent} />);
  return { onCheckIn, onReset };
}

describe('CheckInResultCard', () => {
  it('shows a valid invitation with party size, companions, notes and a check-in button', async () => {
    const { onCheckIn } = renderCard(resultView({ status: 'VALID', guest }));
    expect(screen.getByRole('heading', { name: 'Valid Invitation' })).toBeInTheDocument();
    expect(screen.getByText('Adaeze Okafor')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
    expect(screen.getByText('2 Guests')).toBeInTheDocument();
    expect(screen.getByText('Chidi Okafor')).toBeInTheDocument();
    expect(screen.getByText('Vegetarian')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair access')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /fewer guests/i }));
    await user.click(screen.getByRole('button', { name: /^check in/i }));
    expect(onCheckIn).toHaveBeenCalledWith(1);
  });

  it('checks in the full party by default', async () => {
    const { onCheckIn } = renderCard(resultView({ status: 'VALID', guest }));
    await userEvent.setup().click(screen.getByRole('button', { name: /^check in 2/i }));
    expect(onCheckIn).toHaveBeenCalledWith(2);
  });

  it('shows who checked the guest in and when for ALREADY_CHECKED_IN', async () => {
    const checkedInAt = new Date(2026, 10, 21, 19, 42).toISOString();
    const { onReset } = renderCard(
      resultView({ status: 'ALREADY_CHECKED_IN', guest, checkIn: { checkedInAt, checkedInByName: 'Event Staff', partySize: 2 } }),
    );
    expect(screen.getByRole('heading', { name: 'Already Checked In' })).toBeInTheDocument();
    expect(screen.getByText(/Checked in at 7:42\sPM by Event Staff/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^check in/i })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /scan next guest/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it.each([
    ['INVALID', 'Invalid Code', /not a recognised invitation/],
    ['REVOKED', 'Invitation Revoked', /Do not admit/],
    ['EXPIRED', 'Invitation Expired', /no longer valid/],
    ['NOT_ATTENDING', 'Not Attending', /declined the invitation/],
  ] as const)('renders %s with its own heading and guidance and no check-in button', (status, heading, help) => {
    renderCard(resultView({ status, guest: status === 'INVALID' ? null : guest }));
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByText(help)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^check in/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan next guest/i })).toBeInTheDocument();
  });

  it('shows the completed state after check-in', () => {
    renderCard({
      kind: 'done',
      record: {
        id: 'c1',
        invitationId: 'inv-1',
        eventId: 'e1',
        eventName: 'Thanksgiving Service',
        code: guest.code,
        guestName: guest.guestName,
        categoryName: 'Family',
        partySize: 2,
        checkedInAt: new Date(2026, 10, 21, 19, 5).toISOString(),
        checkedInByName: 'Door Staff',
        reversedAt: null,
        reversedByName: null,
        reverseReason: null,
      },
    });
    expect(screen.getByRole('heading', { name: 'Check-In Complete' })).toBeInTheDocument();
    expect(screen.getByText(/2 Guests admitted at 7:05\sPM/)).toBeInTheDocument();
  });

  it('blocks a guest who is not on the list for this event and names their events', () => {
    const dinnerGuest = { ...guest, events: [{ id: 'e2', name: 'Birthday Dinner' }, { id: 'e3', name: 'Family Brunch' }] };
    renderCard(resultView({ status: 'NOT_FOR_THIS_EVENT', guest: dinnerGuest }), true);
    expect(screen.getByRole('heading', { name: 'Not For This Event' })).toBeInTheDocument();
    expect(screen.getByText('Not on the list for Thanksgiving Service.')).toBeInTheDocument();
    expect(screen.getByText('Birthday Dinner')).toBeInTheDocument();
    expect(screen.getByText('Family Brunch')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^check in/i })).not.toBeInTheDocument();
    expect(announcementFor(resultView({ status: 'NOT_FOR_THIS_EVENT', guest: dinnerGuest }))).toBe(
      'Not For This Event. Adaeze Okafor is not on the list for Thanksgiving Service.',
    );
  });

  it('names the event a result is for only when there are several', () => {
    const { unmount } = render(<CheckInResultCard view={resultView({ status: 'VALID', guest })} onCheckIn={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByText('Thanksgiving Service')).not.toBeInTheDocument();
    unmount();
    renderCard(resultView({ status: 'VALID', guest }), true);
    expect(screen.getByText('Thanksgiving Service')).toBeInTheDocument();
  });

  it('shows a progress state while verifying', () => {
    renderCard({ kind: 'verifying', value: 'ABC' });
    expect(screen.getByText('Checking invitation…')).toBeInTheDocument();
  });

  it('builds screen-reader announcements', () => {
    expect(announcementFor(resultView({ status: 'VALID', guest }))).toBe('Valid Invitation. Adaeze Okafor. 2 Guests.');
    expect(announcementFor(resultView({ status: 'INVALID' }))).toBe('Invalid Code.');
  });
});
