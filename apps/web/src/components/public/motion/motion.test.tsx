import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Reveal } from '../reveal';
import { ConfettiBurst, CountUp, MagneticLink, Marquee, Parallax, RouteCurtain, ScrollScene, SplitText, Sparkles, TiltCard, VelocityBand } from '.';

/* The app wraps everything in <MotionConfig reducedMotion="user">; "always" stands in for a
   visitor who has asked for reduced motion. jsdom's IntersectionObserver stub never fires. */

const calm = (ui: ReactNode) => render(<MotionConfig reducedMotion="always">{ui}</MotionConfig>);
const lively = (ui: ReactNode) => render(<MotionConfig reducedMotion="never">{ui}</MotionConfig>);

const realIO = globalThis.IntersectionObserver;
const realMatchMedia = window.matchMedia;

function withoutIntersectionObserver() {
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
}

function withMouse() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: fine'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

afterEach(() => {
  globalThis.IntersectionObserver = realIO;
  window.matchMedia = realMatchMedia;
});

describe('SplitText', () => {
  it('is plain text with reduced motion', () => {
    calm(<h1>
      <SplitText text="Seventy golden years" />
    </h1>);
    const heading = screen.getByRole('heading', { name: 'Seventy golden years' });
    expect(heading.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(heading).toHaveTextContent('Seventy golden years');
  });

  it('keeps one accessible copy of the text and hides the animated words', () => {
    lively(<h1>
      <SplitText text="Seventy golden years" />
    </h1>);
    expect(screen.getByRole('heading', { name: 'Seventy golden years' })).toBeInTheDocument();
    const pieces = screen.getByRole('heading').querySelector('[aria-hidden="true"]');
    expect(pieces?.textContent?.replace(/\s+/g, ' ')).toBe('Seventy golden years');
  });

  it('shows the words without IntersectionObserver', () => {
    withoutIntersectionObserver();
    lively(<h2>
      <SplitText text="Will you join us?" trigger="view" />
    </h2>);
    expect(screen.getByRole('heading', { name: 'Will you join us?' })).toBeInTheDocument();
  });
});

describe('CountUp', () => {
  it('shows the final number at once with reduced motion', () => {
    const { container } = calm(<CountUp value={1234} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('1,234');
    expect(screen.getByText('1,234', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('shows the final number without IntersectionObserver', () => {
    withoutIntersectionObserver();
    const { container } = lively(<CountUp value={1956} grouping={false} />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('1956');
  });

  it('always gives screen readers the real value, even before it counts', () => {
    lively(<CountUp value={70} />);
    expect(screen.getByText('70', { selector: '.sr-only' })).toBeInTheDocument();
  });
});

describe('Reveal', () => {
  it('starts in place without IntersectionObserver', () => {
    withoutIntersectionObserver();
    lively(<Reveal x={-40}>Visible text</Reveal>);
    const el = screen.getByText('Visible text');
    expect(el.style.opacity).not.toBe('0');
  });
});

describe('TiltCard', () => {
  it('is a plain wrapper on touch screens and keeps its link focusable', () => {
    lively(<TiltCard className="rounded-2xl">
      <a href="/gallery">Album</a>
    </TiltCard>);
    const link = screen.getByRole('link', { name: 'Album' });
    expect(link.parentElement?.getAttribute('style')).toBeNull();
    link.focus();
    expect(link).toHaveFocus();
  });

  it('tilts with a mouse and adds only a hidden glare layer', () => {
    withMouse();
    const { container } = lively(<TiltCard className="rounded-2xl">
      <a href="/gallery">Album</a>
    </TiltCard>);
    const card = container.firstElementChild as HTMLElement;
    fireEvent.pointerMove(card, { pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(card);
    expect(card.querySelector('[aria-hidden="true"]')).toHaveClass('pointer-events-none');
    screen.getByRole('link', { name: 'Album' }).focus();
    expect(screen.getByRole('link', { name: 'Album' })).toHaveFocus();
  });

  it('stays still with reduced motion even with a mouse', () => {
    withMouse();
    const { container } = calm(<TiltCard>
      <span>Card</span>
    </TiltCard>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('Marquee', () => {
  const items = ['One', 'Two', 'Three'].map((label) => (
    <li key={label}>
      <a href={`#${label}`}>{label}</a>
    </li>
  ));

  it('lists each item once for assistive tech, with a pause button', () => {
    lively(<Marquee label="Moments">{items}</Marquee>);
    const region = screen.getByRole('region', { name: 'Moments' });
    expect(within(region).getAllByRole('link')).toHaveLength(3);
    const copy = region.querySelector('ul[aria-hidden="true"]');
    expect(copy).toHaveAttribute('inert');
    const pause = screen.getByRole('button', { name: 'Pause the moving strip' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pause);
    expect(pause).toHaveAttribute('aria-pressed', 'true');
  });

  it('is a single scrollable row with reduced motion', () => {
    calm(<Marquee label="Moments">{items}</Marquee>);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('decorations with reduced motion', () => {
  it('renders no sparkles, confetti or route curtain', () => {
    calm(<div>
      <Sparkles />
      <ConfettiBurst />
      <RouteCurtain />
    </div>);
    expect(screen.queryByTestId('confetti')).toBeNull();
    expect(screen.queryByTestId('route-curtain')).toBeNull();
  });

  it('renders confetti in a click-through layer otherwise', () => {
    lively(<ConfettiBurst count={6} />);
    const layer = screen.getByTestId('confetti');
    expect(layer).toHaveClass('pointer-events-none', 'fixed');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves Parallax children unstyled', () => {
    calm(<Parallax>
      <p>Still</p>
    </Parallax>);
    expect(screen.getByText('Still').parentElement?.getAttribute('style') ?? '').not.toMatch(/transform/);
  });
});

describe('MagneticLink', () => {
  it('is an ordinary link', () => {
    lively(<MemoryRouter>
      <MagneticLink to="/rsvp" className="btn">
        RSVP
      </MagneticLink>
    </MemoryRouter>);
    const link = screen.getByRole('link', { name: 'RSVP' });
    expect(link).toHaveAttribute('href', '/rsvp');
    link.focus();
    expect(link).toHaveFocus();
  });
});

describe('home page drama', () => {
  it('reads a dramatic headline once and keeps it plain with reduced motion', () => {
    lively(<h2><SplitText text="Will you join us?" variant="dramatic" /></h2>);
    expect(screen.getByRole('heading')).toHaveTextContent('Will you join us?');
    calm(<p><SplitText text="Still words" variant="dramatic" /></p>);
    expect(screen.getByText('Still words').tagName).toBe('SPAN');
  });

  it('shows a scroll scene without clipping when motion is reduced', () => {
    calm(
      <ScrollScene>
        <p>Section body</p>
      </ScrollScene>,
    );
    expect(screen.getByText('Section body').parentElement?.getAttribute('style') ?? '').not.toContain('clip-path');
  });

  it('keeps the word band out of the accessibility tree', () => {
    const { container } = lively(<VelocityBand words={['Life', 'Love']} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('looping decorations', () => {
  function withTouch() {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  /** An IntersectionObserver that reports every element as off screen. */
  function nothingInView() {
    globalThis.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb([{ isIntersecting: false, target: el } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }

  it('draws sparkles as CSS motes, and about a quarter of them on a touch screen', () => {
    const { container, unmount } = lively(<Sparkles count={40} />);
    expect(container.querySelectorAll('.mote')).toHaveLength(40);
    unmount();
    withTouch();
    const touch = lively(<Sparkles count={40} />);
    expect(touch.container.querySelectorAll('.mote')).toHaveLength(10);
  });

  it('pauses sparkles off screen, and leaves them running without IntersectionObserver', () => {
    nothingInView();
    const offscreen = lively(<Sparkles count={5} />);
    expect(offscreen.container.firstElementChild).toHaveAttribute('data-paused');
    offscreen.unmount();
    withoutIntersectionObserver();
    const { container } = lively(<Sparkles count={5} />);
    expect(container.firstElementChild).not.toHaveAttribute('data-paused');
    expect(container.querySelectorAll('.mote')).toHaveLength(5);
  });

  it('uses half as many band words on a touch screen', () => {
    const desktop = lively(<VelocityBand words={['Life', 'Love']} />);
    expect(desktop.container.firstElementChild?.firstElementChild?.children).toHaveLength(8);
    desktop.unmount();
    withTouch();
    const { container } = lively(<VelocityBand words={['Life', 'Love']} />);
    expect(container.firstElementChild?.firstElementChild?.children).toHaveLength(4);
  });
});
