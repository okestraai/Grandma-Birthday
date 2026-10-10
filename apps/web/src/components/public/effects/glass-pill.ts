/**
 * Lazy chunk: html2canvas + the vendored liquid-glass-js Container. Imported only by HeaderGlass.
 *
 * The library would snapshot the whole page itself; instead the snapshot is taken here, once,
 * of just the strip behind the header (the top of the hero), and handed to the library through
 * its static `Container.pageSnapshot`. WebGL canvases and effect layers are left out of the
 * snapshot (html2canvas cannot read them and would paint black boxes), so the glass refracts the
 * hero's CSS gradient, which is what the moving gradient is drawn over anyway.
 */
import html2canvas from 'html2canvas';
import { Container } from '@/vendor/liquid-glass/liquid-glass.js';
import '@/vendor/liquid-glass/glass.css';
import { HEADER_GLASS } from './settings';

export interface GlassPill {
  redraw: () => void;
  destroy: () => void;
}

/** Height of page strip captured, in CSS px; the header is 72px tall. */
const STRIP_HEIGHT = 120;

let cached: { width: number; canvas: HTMLCanvasElement } | null = null;

const MODERN_COLOR = /okl(?:ab|ch)\(|\blab\(|\blch\(|color\(|color-mix\(/;
const COLOR_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'column-rule-color',
];

/**
 * Prepares html2canvas's clone of the hero. Only the background layers matter (the strip is
 * above the text), so the content is dropped; and html2canvas 1.4 cannot parse the oklab()/
 * oklch() colours Tailwind 4 emits, so those are rewritten as rgba() via a 1px canvas.
 */
function prepareClone(doc: Document, hero: HTMLElement) {
  for (const child of Array.from(hero.children)) {
    if (child.getAttribute('aria-hidden') !== 'true') child.remove();
  }
  const view = doc.defaultView ?? window;
  const probe = doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const toRgba = (value: string) => {
    if (!probe) return 'transparent';
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000';
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`;
  };
  for (const node of [hero, ...Array.from(hero.querySelectorAll<HTMLElement>('*'))]) {
    const style = view.getComputedStyle(node);
    for (const prop of COLOR_PROPS) {
      const value = style.getPropertyValue(prop);
      if (MODERN_COLOR.test(value)) node.style.setProperty(prop, toRgba(value), 'important');
    }
    for (const prop of ['background-image', 'box-shadow', 'text-shadow', 'filter']) {
      if (MODERN_COLOR.test(style.getPropertyValue(prop))) node.style.setProperty(prop, 'none', 'important');
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`page snapshot took longer than ${ms}ms`)), ms);
    work.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function snapshotHeaderStrip(): Promise<HTMLCanvasElement> {
  const width = document.documentElement.clientWidth;
  if (cached && cached.width === width) return cached.canvas;
  // The hero is the first section in <main> and starts at the top of the page.
  const hero = document.querySelector<HTMLElement>('#main section');
  if (!hero || Math.round(hero.getBoundingClientRect().top + window.scrollY) !== 0) {
    throw new Error('no hero at the top of the page to refract');
  }
  const canvas = await withTimeout(
    html2canvas(hero, {
      x: 0,
      y: 0,
      width,
      height: STRIP_HEIGHT,
      scrollX: 0,
      scrollY: 0,
      windowWidth: width,
      windowHeight: window.innerHeight,
      scale: 1,
      backgroundColor: '#071A2B',
      logging: false,
      useCORS: true,
      ignoreElements: (el) => el.tagName === 'CANVAS' || el.tagName === 'HEADER' || el.hasAttribute('data-effect-layer'),
      onclone: (doc, clonedHero) => prepareClone(doc, clonedHero),
    }),
    HEADER_GLASS.snapshotTimeout,
  );
  cached = { width, canvas };
  return canvas;
}

function waitFor(check: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const tick = () => {
      if (check()) resolve();
      else if (performance.now() - started > ms) reject(new Error('liquid glass did not initialise'));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function createGlassPill(host: HTMLElement): Promise<GlassPill> {
  const snapshot = await snapshotHeaderStrip();

  // The library reads its refraction settings from this global.
  (window as unknown as { glassControls: typeof HEADER_GLASS.controls }).glassControls = HEADER_GLASS.controls;
  Container.pageSnapshot = snapshot;

  const glass = new Container({ type: 'pill', tintOpacity: HEADER_GLASS.tintOpacity });
  const el: HTMLElement = glass.element;
  Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', padding: '0' });
  glass.canvas.style.boxShadow = 'none';
  host.appendChild(el);
  glass.updateSizeFromDOM();

  const destroy = () => {
    window.removeEventListener('resize', onResize);
    const gl: WebGLRenderingContext | undefined = glass.gl_refs?.gl;
    glass.gl_refs = {}; // the library's scroll listener stays attached but now does nothing
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    el.remove();
    const index = Container.instances.indexOf(glass);
    if (index >= 0) Container.instances.splice(index, 1);
  };
  const redraw = () => requestAnimationFrame(() => glass.render?.());
  const onResize = () => {
    glass.updateSizeFromDOM();
    redraw();
  };

  try {
    await waitFor(() => Boolean(glass.webglInitialized && glass.render), 1500);
  } catch (error) {
    destroy();
    throw error;
  }
  window.addEventListener('resize', onResize);
  redraw();
  return { redraw, destroy };
}
