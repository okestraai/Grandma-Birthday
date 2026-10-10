import { act, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../Header';
import { NAV_LINKS } from '../nav';
import { SeventyMark } from '../seventy';
import { Medallion } from './Medallion';
import { ShaderBackdrop } from './ShaderBackdrop';
import { deviceCanRunEffects, reportBackdropVisibility, resetIdle, resetWebGLProbe, useIsLeadBackdrop } from './gate';

/* jsdom has no WebGL and its IntersectionObserver stub never fires. These helpers switch on
   the conditions one at a time, so each test shows which check keeps the fallback in place. */

const realMatchMedia = window.matchMedia;
const realIO = globalThis.IntersectionObserver;
const realGetContext = HTMLCanvasElement.prototype.getContext;

function setMedia({ reducedMotion = false, desktop = false, touch = false } = {}) {
  window.matchMedia = ((query: string) => ({
    matches:
      (query.includes('prefers-reduced-motion') && reducedMotion) ||
      (query.includes('min-width: 1280px') && desktop) ||
      (query.includes('pointer: coarse') && touch),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function fakeWebGL() {
  (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function WebGLRenderingContext() {};
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null })) as unknown as typeof realGetContext;
}

/** An IntersectionObserver that reports every element as on screen straight away. */
function everythingInView() {
  globalThis.IntersectionObserver = class {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(el: Element) {
      this.cb([{ isIntersecting: true, target: el, intersectionRect: { height: 400 } } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

/* The effects wait for an idle moment after load; here that moment comes straight away. The
   CPU count is pinned so the result does not depend on the machine running the tests. */
const realIdle = window.requestIdleCallback;
function setCores(cores: number | undefined) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => cores });
}

beforeEach(() => {
  resetWebGLProbe();
  resetIdle();
  setMedia();
  setCores(8);
  window.requestIdleCallback = ((cb: IdleRequestCallback) => {
    cb({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  }) as typeof window.requestIdleCallback;
});

afterEach(() => {
  window.requestIdleCallback = realIdle;
  delete (navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency;
  resetIdle();
  window.matchMedia = realMatchMedia;
  globalThis.IntersectionObserver = realIO;
  HTMLCanvasElement.prototype.getContext = realGetContext;
  delete (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext;
  resetWebGLProbe();
});

/** Elements with this text that assistive technology can reach (not inside aria-hidden). */
function accessibleText(text: string) {
  return screen.getAllByText(text).filter((el) => !el.closest('[aria-hidden="true"]'));
}

describe('SeventyMark with liquid metal', () => {
  it('renders the CSS numerals and an accessible "70" when WebGL is unavailable', () => {
    everythingInView();
    const { container } = render(<SeventyMark value={70} liquid />);
    expect(screen.getByTestId('seventy-numerals')).toHaveTextContent('70');
    expect(screen.getByTestId('seventy-numerals').style.backgroundImage).toBe('');
    expect(accessibleText('70')).toHaveLength(1);
    expect(container.querySelector('[data-effect-layer]')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('keeps the fallback with reduced motion, even when WebGL works', () => {
    fakeWebGL();
    everythingInView();
    setMedia({ reducedMotion: true });
    const { container } = render(<SeventyMark value={70} liquid />);
    expect(container.querySelector('[data-effect-layer]')).toBeNull();
    expect(accessibleText('70')).toHaveLength(1);
  });

  it('lays the artwork over the text once motion is allowed and WebGL works', async () => {
    fakeWebGL();
    everythingInView();
    const { container } = render(<SeventyMark value={70} liquid />);
    await act(async () => {});
    const layer = container.querySelector('[data-effect-layer]');
    expect(layer).not.toBeNull();
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer?.querySelector('img')).toHaveAttribute('src', '/brand/seventy-gold.svg');
    // The CSS glyphs stay until the artwork image has loaded.
    expect(screen.getByTestId('seventy-numerals').style.backgroundImage).toBe('');
    expect(accessibleText('70')).toHaveLength(1);
  });

  it('never uses the artwork for a number other than 70', async () => {
    fakeWebGL();
    everythingInView();
    const { container } = render(<SeventyMark value={80} liquid />);
    await act(async () => {});
    expect(container.querySelector('[data-effect-layer]')).toBeNull();
    expect(accessibleText('80')).toHaveLength(1);
  });
});

describe('ShaderBackdrop', () => {
  it('stays an empty, hidden layer without WebGL', () => {
    everythingInView();
    const { container } = render(<ShaderBackdrop name="hero" />);
    const layer = container.querySelector('[data-effect-layer]');
    expect(layer).toHaveClass('opacity-0', 'pointer-events-none');
    expect(layer).toBeEmptyDOMElement();
  });

  it('stays empty with reduced motion', () => {
    fakeWebGL();
    everythingInView();
    setMedia({ reducedMotion: true });
    const { container } = render(<ShaderBackdrop name="rsvp" />);
    expect(container.querySelector('[data-effect-layer]')).toBeEmptyDOMElement();
  });
});

describe('one shader gradient at a time', () => {
  it('lets only the backdrop with the most pixels on screen animate', () => {
    const { result } = renderHook(() => [useIsLeadBackdrop('hero'), useIsLeadBackdrop('rsvp')]);
    expect(result.current).toEqual([false, false]);
    act(() => reportBackdropVisibility('hero', 800));
    expect(result.current).toEqual([true, false]);
    act(() => reportBackdropVisibility('rsvp', 120));
    expect(result.current).toEqual([true, false]);
    act(() => reportBackdropVisibility('hero', 60));
    expect(result.current).toEqual([false, true]);
    act(() => {
      reportBackdropVisibility('hero', null);
      reportBackdropVisibility('rsvp', 0);
    });
    expect(result.current).toEqual([false, false]);
  });
});

describe('Medallion', () => {
  it('shows the static medallion with an accessible description without WebGL', () => {
    everythingInView();
    const { container } = render(<Medallion />);
    expect(screen.getByRole('img', { name: 'A gold medallion engraved with the number 70' })).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('shows the static medallion with reduced motion', () => {
    fakeWebGL();
    everythingInView();
    setMedia({ reducedMotion: true });
    const { container } = render(<Medallion />);
    expect(screen.getByRole('img', { name: 'A gold medallion engraved with the number 70' })).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('Header with the liquid-glass nav', () => {
  function renderHeader() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Header site={undefined} overHero />
      </MemoryRouter>,
    );
  }

  function expectAllLinks() {
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const link of NAV_LINKS) {
      expect(within(nav).getByRole('link', { name: link.label })).toHaveAttribute('href', link.to);
    }
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'RSVP' })).toHaveAttribute('href', '/rsvp');
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  }

  it('keeps every link, the active state and the menu button when the glass is disabled', () => {
    setMedia({ desktop: true });
    renderHeader();
    expect(screen.queryByTestId('header-glass')).toBeNull();
    expectAllLinks();
  });

  it('keeps the plain header with reduced motion', () => {
    fakeWebGL();
    setMedia({ desktop: true, reducedMotion: true });
    renderHeader();
    expect(screen.queryByTestId('header-glass')).toBeNull();
    expectAllLinks();
  });

  it('adds only a hidden, non-interactive layer when the glass can run', async () => {
    fakeWebGL();
    setMedia({ desktop: true });
    renderHeader();
    await act(async () => {});
    const glass = screen.getByTestId('header-glass');
    expect(glass).toHaveAttribute('aria-hidden', 'true');
    expect(glass).toHaveClass('pointer-events-none', 'opacity-0');
    expectAllLinks();
  });
});

describe('device and timing checks for the WebGL effects', () => {
  it('allows a capable desktop and treats missing hints as allowed', () => {
    expect(deviceCanRunEffects({ hardwareConcurrency: 8, deviceMemory: 8 } as unknown as Navigator)).toBe(true);
    expect(deviceCanRunEffects({} as Navigator)).toBe(true);
  });

  it('refuses data saver, 4 GB of memory or less, and 4 cores or fewer', () => {
    expect(deviceCanRunEffects({ hardwareConcurrency: 8, connection: { saveData: true } } as unknown as Navigator)).toBe(false);
    expect(deviceCanRunEffects({ hardwareConcurrency: 8, deviceMemory: 4 } as unknown as Navigator)).toBe(false);
    expect(deviceCanRunEffects({ hardwareConcurrency: 4 } as unknown as Navigator)).toBe(false);
  });

  it('keeps the CSS numerals and gradient on a touch screen', async () => {
    fakeWebGL();
    everythingInView();
    setMedia({ touch: true });
    const { container } = render(
      <>
        <SeventyMark value={70} liquid />
        <ShaderBackdrop name="hero" />
      </>,
    );
    await act(async () => {});
    expect(container.querySelector('[data-effect-layer] img')).toBeNull();
    expect(container.querySelector('[data-effect-layer]')).toBeEmptyDOMElement();
    expect(accessibleText('70')).toHaveLength(1);
  });

  it('keeps the fallback on a machine with few cores', async () => {
    fakeWebGL();
    everythingInView();
    setCores(2);
    const { container } = render(<SeventyMark value={70} liquid />);
    await act(async () => {});
    expect(container.querySelector('[data-effect-layer]')).toBeNull();
  });

  it('waits for the browser to be idle before mounting anything', async () => {
    fakeWebGL();
    everythingInView();
    let runIdle: (() => void) | undefined;
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      runIdle = () => cb({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    }) as typeof window.requestIdleCallback;
    const { container } = render(<SeventyMark value={70} liquid />);
    await act(async () => {});
    expect(container.querySelector('[data-effect-layer]')).toBeNull();
    await act(async () => runIdle?.());
    expect(container.querySelector('[data-effect-layer]')).not.toBeNull();
  });
});
