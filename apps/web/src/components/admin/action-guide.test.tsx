import { fireEvent, render, screen } from '@testing-library/react';
import { ActionGuide } from './action-guide';

const rows = [
  { action: 'Approve', does: 'Marks it as fine.', sees: 'Only admins.' },
  { action: 'Delete', does: 'Removes it for good.', sees: 'Nobody afterwards.' },
];

afterEach(() => window.localStorage.clear());

describe('ActionGuide', () => {
  it('is closed by default and opens to show every row', () => {
    render(<ActionGuide page="test" rows={rows} />);
    const toggle = screen.getByRole('button', { name: 'What these actions mean' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table');
    expect(table).toBeVisible();
    expect(screen.getByRole('rowheader', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByText('Removes it for good.')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Who sees the result' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('remembers open per page', () => {
    const { unmount } = render(<ActionGuide page="remember" rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'What these actions mean' }));
    unmount();
    render(<ActionGuide page="remember" rows={rows} />);
    expect(screen.getByRole('button', { name: 'What these actions mean' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('table')).toBeVisible();
  });

  it('still works when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ActionGuide page="blocked" rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'What these actions mean' }));
    expect(screen.getByRole('table')).toBeVisible();
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});
