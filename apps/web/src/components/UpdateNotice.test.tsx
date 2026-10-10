import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { noteLatestBuild, startVersionCheck, stopVersionCheck } from '@/lib/version';
import { UpdateNotice } from './UpdateNotice';

beforeEach(() => {
  sessionStorage.clear();
  startVersionCheck('aaa');
});
afterEach(() => stopVersionCheck());

describe('UpdateNotice', () => {
  it('renders nothing until a newer build is known', () => {
    render(<UpdateNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => noteLatestBuild('aaa'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the message with Refresh and Later as a polite status', async () => {
    const reload = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
    try {
      render(<UpdateNotice />);
      act(() => noteLatestBuild('bbb'));
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('A new version of the site is ready.');
      expect(status).toHaveAttribute('aria-live', 'polite');

      const user = userEvent.setup();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(reload).toHaveBeenCalledTimes(1);
      await user.tab();
      expect(screen.getByRole('button', { name: 'Later' })).toHaveFocus();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });

  it('Later hides it until an even newer build appears', async () => {
    render(<UpdateNotice variant="bar" />);
    act(() => noteLatestBuild('bbb'));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => noteLatestBuild('ccc'));
    expect(screen.getByRole('status')).toHaveTextContent('A new version of the site is ready.');
  });
});
