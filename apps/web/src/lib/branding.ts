import type { SiteBranding } from '@birthday/types';

const HEX = /^#[0-9a-f]{6}$/i;

/** Applies admin-configured brand colours to the CSS variables in styles/index.css. */
export function applyBranding(branding: Pick<SiteBranding, 'primaryColor' | 'secondaryColor'> | undefined): void {
  if (!branding) return;
  const root = document.documentElement.style;
  if (HEX.test(branding.primaryColor)) root.setProperty('--brand-navy', branding.primaryColor);
  if (HEX.test(branding.secondaryColor)) root.setProperty('--brand-gold', branding.secondaryColor);
}
