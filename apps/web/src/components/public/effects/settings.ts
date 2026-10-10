/**
 * Look-and-feel settings for the public pages' visual effects, in one place.
 * Colours are brand hex values; speeds are deliberately low. After changing a value the dev
 * server hot-reloads; nothing here affects the static fallbacks (the plain CSS design).
 */

/* ------------------------------------------------------------ Shader gradient backgrounds */
/**
 * Home hero background and the RSVP call-to-action band. See the ShaderGradient docs
 * (github.com/ruucm/shadergradient) for what each value does. Keep the colours dark: the
 * hero text is ivory and must stay readable over every frame.
 */
export const BACKDROPS = {
  hero: {
    color1: '#071A2B', // navy
    color2: '#0B3D35', // deep emerald
    color3: '#6E5626', // faint champagne-gold highlight (a darkened #B88A35)
    uSpeed: 0.05, // flow speed (0.05 is a slow drift)
    uStrength: 1.6, // how far the surface folds
    uDensity: 1.1,
    uFrequency: 3.2,
    uAmplitude: 1,
    brightness: 0.95,
    reflection: 0.1,
    cDistance: 3.4,
    cPolarAngle: 90,
    cAzimuthAngle: 180,
    rotationX: 0,
    rotationY: 10,
    rotationZ: 50,
  },
  rsvp: {
    color1: '#071A2B',
    color2: '#0B3D35',
    color3: '#0C4A41', // emerald, darkened so the small gold and ivory text keep AA contrast
    uSpeed: 0.05,
    uStrength: 1.4,
    uDensity: 1.2,
    uFrequency: 3.6,
    uAmplitude: 1,
    brightness: 0.9,
    reflection: 0.1,
    cDistance: 3.2,
    cPolarAngle: 90,
    cAzimuthAngle: 180,
    rotationX: 0,
    rotationY: 0,
    rotationZ: -30,
  },
} as const;

/**
 * Opacity of the hero's existing navy overlay while the gradient is live (1 = unchanged).
 * Only used when the hero has no background photo; with a photo the overlay stays as it is.
 */
export const HERO_OVERLAY_OPACITY_WHEN_LIVE = 0.55;

export type BackdropName = keyof typeof BACKDROPS;

/* ------------------------------------------------------------ Liquid-metal "70" (home hero) */
/** Paper Shaders' LiquidMetal (shaders.paper.design/liquid-metal). */
export const LIQUID_SEVENTY = {
  /** Passed straight to <LiquidMetal>. */
  shader: {
    colorTint: '#F1E3C0', // champagne; the metal is tinted with a colour-burn of this
    speed: 0.32, // 1 is the library default; lower is slower
    repetition: 2.2, // number of light bands across the numerals
    softness: 0.35, // 0 = sharp band edges, 1 = soft
    distortion: 0.06, // noise wobble in the bands
    contour: 0.35, // how strongly the bands bend along the glyph edges
    shiftRed: 0.08, // colour fringing, kept low so the gold stays gold
    shiftBlue: 0.08,
    angle: 70, // direction the light travels, in degrees
  },
  /** How the metal layer mixes with the gold numerals beneath it. 'screen' only ever lightens. */
  blend: 'screen' as const,
  /** 0..1, the metal layer's strength over the gold numerals. */
  intensity: 0.9,
  /** Delay before the metal fades in, after the hero's entrance animation, in ms. */
  fadeInDelay: 900,
};

/* ------------------------------------------------------------ Liquid-glass header pill */
/**
 * Vendored liquid-glass-js (src/vendor/liquid-glass). Only on the home page, at the top,
 * on desktop. Refraction values are the library's `window.glassControls` knobs.
 */
export const HEADER_GLASS = {
  tintOpacity: 0.1, // white frosting mixed into the refracted background
  navyTint: 0.22, // extra navy wash (CSS) over the glass so the labels stay crisp
  /** Refraction knobs, handed to the library as `window.glassControls`. Must be non-zero. */
  controls: {
    blurRadius: 4,
    edgeIntensity: 0.006,
    rimIntensity: 0.025,
    baseIntensity: 0.005,
    edgeDistance: 0.15,
    rimDistance: 0.8,
    baseDistance: 0.1,
    cornerBoost: 0.01,
    rippleEffect: 0.03,
  },
  /** Give up on the effect if the page snapshot takes longer than this, in ms. */
  snapshotTimeout: 1500,
};

/* ------------------------------------------------------------ 3D medallion (Event page) */
export const MEDALLION = {
  gold: '#D6B36A',
  goldDeep: '#B88A35',
  metalness: 1,
  roughness: 0.28,
  /** Idle turn speed in radians per second (a full turn every ~50 s). */
  idleSpeed: 0.12,
  /** Drag sensitivity: radians per pixel dragged. */
  dragSpeed: 0.012,
  /** Light intensities. */
  keyLight: 2.2,
  fillLight: 0.6,
  environment: 0.9,
};
