import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PublicMedia } from '@birthday/types';
import { Lightbox, type LightboxProps } from './Lightbox';

function photo(id: string, caption: string): PublicMedia {
  return {
    id,
    kind: 'PHOTO',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    caption,
    altText: null,
    urls: { thumb: `/api/media/${id}/thumb`, medium: `/api/media/${id}/medium`, original: `/api/media/${id}/original` },
  };
}

const video: PublicMedia = {
  id: 'v1',
  kind: 'VIDEO',
  mimeType: 'video/mp4',
  width: null,
  height: null,
  caption: 'The first dance',
  altText: null,
  urls: { thumb: null, medium: null, original: '/api/media/v1/original' },
};

const items = [photo('p1', 'Cutting the cake'), photo('p2', 'Family portrait'), video];

function Harness(props: Partial<LightboxProps> & { start?: number }) {
  const { start = 0, ...rest } = props;
  const [index, setIndex] = useState<number | null>(start);
  return (
    <Lightbox
      items={items}
      total={items.length}
      index={index}
      onIndexChange={setIndex}
      onOpenChange={(open) => {
        if (!open) setIndex(null);
      }}
      {...rest}
    />
  );
}

const counter = () => screen.getByTestId('lightbox-counter');

describe('Lightbox', () => {
  it('opens on the chosen item', () => {
    render(<Harness start={1} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(counter()).toHaveTextContent('2 / 3');
    expect(screen.getByRole('img', { name: 'Family portrait' })).toHaveAttribute('src', '/api/media/p2/medium');
    expect(screen.getByText('Family portrait', { selector: 'p' })).toBeInTheDocument();
  });

  it('moves with the arrow keys and the buttons', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(counter()).toHaveTextContent('1 / 3');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(counter()).toHaveTextContent('2 / 3');

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(counter()).toHaveTextContent('1 / 3');

    // Cannot go before the first item.
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(counter()).toHaveTextContent('1 / 3');

    fireEvent.click(screen.getAllByRole('button', { name: 'Next item' })[0]);
    expect(counter()).toHaveTextContent('2 / 3');
  });

  it('calls onOpenChange(false) on Escape', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes from the close button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a video element for video items', () => {
    render(<Harness start={2} />);
    const el = screen.getByRole('dialog').querySelector('video');
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('src', '/api/media/v1/original');
    expect(el).toHaveAttribute('controls');
    expect(el).toHaveAttribute('preload', 'metadata');
  });

  it('asks for more when it reaches the last loaded item', () => {
    const onNeedMore = vi.fn();
    render(<Harness start={2} total={10} hasMore onNeedMore={onNeedMore} />);
    expect(counter()).toHaveTextContent('3 / 10');
    expect(onNeedMore).toHaveBeenCalled();
    onNeedMore.mockClear();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(onNeedMore).toHaveBeenCalled();
  });
});
