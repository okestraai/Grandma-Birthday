import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FamilyMember, FamilyTree as Tree } from '@birthday/types';
import { FamilyTree } from './FamilyTree';

function member(id: string, fullName: string, generation: number, extra: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id,
    fullName,
    relationshipLabel: 'Relative',
    generation,
    isCelebrant: false,
    bio: null,
    birthYear: null,
    deathYear: null,
    photo: null,
    sortOrder: 0,
    ...extra,
  };
}

const tree: Tree = {
  members: [
    member('f', 'Emeka Father', -1, { relationshipLabel: 'Father', birthYear: 1920, deathYear: 1990 }),
    member('c', 'Ada Celebrant', 0, { relationshipLabel: 'The celebrant', isCelebrant: true, birthYear: 1956, bio: 'First line.\n\nSecond line.' }),
    member('s', 'Obi Spouse', 0, { relationshipLabel: 'Husband' }),
    member('k', 'Nkem Child', 1, { relationshipLabel: 'Daughter', birthYear: 1980 }),
  ],
  relationships: [
    { id: '1', fromId: 'f', toId: 'c', type: 'PARENT_OF' },
    { id: '2', fromId: 'c', toId: 's', type: 'SPOUSE_OF' },
    { id: '3', fromId: 'c', toId: 'k', type: 'PARENT_OF' },
    { id: '4', fromId: 's', toId: 'k', type: 'PARENT_OF' },
  ],
};

describe('FamilyTree', () => {
  it('draws every person as a card with their relationship and years', () => {
    render(<FamilyTree tree={tree} celebrantName="Ada" />);
    for (const name of ['Emeka Father', 'Ada Celebrant', 'Obi Spouse', 'Nkem Child']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByText('1920 – 1990')).toBeInTheDocument();
    expect(screen.getByText('b. 1980')).toBeInTheDocument();
    expect(screen.getByText('(in loving memory)')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Zoom the family tree' })).toBeInTheDocument();
  });

  it('opens a detail dialog and switches to a relation', async () => {
    const user = userEvent.setup();
    render(<FamilyTree tree={tree} />);
    await user.click(screen.getAllByRole('button', { name: /Ada Celebrant/ })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Ada Celebrant' })).toBeInTheDocument();
    expect(within(dialog).getByText('Second line.')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Parents' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Nkem Child/ }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Nkem Child' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zooms in, out and back to fit, and a resize without a width change keeps the zoom', async () => {
    const user = userEvent.setup();
    render(<FamilyTree tree={tree} />);
    const canvas = screen.getByLabelText('Family tree. Scroll sideways to see everyone.').firstElementChild as HTMLElement;
    const width = () => parseFloat(canvas.style.width);
    const fitted = width();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const zoomed = width();
    expect(zoomed).toBeGreaterThan(fitted);
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(width()).toBeLessThan(zoomed);
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Fit the whole tree' }));
    expect(width()).toBeCloseTo(fitted);
  });

  it('lists people who are not linked to anyone yet', () => {
    render(<FamilyTree tree={{ members: [member('x', 'Lone Cousin', 3)], relationships: [] }} />);
    expect(screen.getByRole('heading', { name: 'Also in the family' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lone Cousin/ })).toBeInTheDocument();
  });
});
