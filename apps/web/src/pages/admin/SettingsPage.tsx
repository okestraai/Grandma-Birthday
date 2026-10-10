import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { settingsQuery } from '@/lib/admin-queries';
import { PageHeader } from '@/components/admin/ui';
import { UnsavedChangesGuard } from '@/components/admin/overlays';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { UploadsSection } from '@/components/admin/settings/UploadsSection';
import { UploadQrSection } from '@/components/admin/settings/UploadQrSection';
import { TestimonialsSection } from '@/components/admin/settings/TestimonialsSection';
import { BrandingSection } from '@/components/admin/settings/BrandingSection';
import { ActionGuide } from '@/components/admin/action-guide';
import { SETTINGS_ACTIONS } from '@/components/admin/action-guide-content';

type Section = 'uploads' | 'testimonials' | 'branding';

const JUMP_LINKS = [
  { href: '#settings-uploads', label: 'Uploads' },
  { href: '#settings-upload-qr', label: 'Upload QR code' },
  { href: '#settings-testimonials', label: 'Testimonials' },
  { href: '#settings-branding', label: 'Branding' },
];

export default function SettingsPage() {
  const query = useQuery(settingsQuery);
  const [dirty, setDirty] = useState<Record<Section, boolean>>({ uploads: false, testimonials: false, branding: false });

  const onUploadsDirty = useCallback((d: boolean) => setDirty((s) => (s.uploads === d ? s : { ...s, uploads: d })), []);
  const onTestimonialsDirty = useCallback((d: boolean) => setDirty((s) => (s.testimonials === d ? s : { ...s, testimonials: d })), []);
  const onBrandingDirty = useCallback((d: boolean) => setDirty((s) => (s.branding === d ? s : { ...s, branding: d })), []);
  const anyDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

  const settings = query.data;

  return (
    <>
      <PageHeader title="Settings" description="Uploads, the guest upload QR code, testimonials and branding. Each section saves on its own." />
      <ActionGuide page="settings" rows={SETTINGS_ACTIONS} />
      <UnsavedChangesGuard when={anyDirty} />

      {query.isError && !settings ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !settings ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-navy/10 bg-white p-4">
              <Skeleton className="h-4 w-40" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {settings.isDemo && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald/25 bg-emerald/5 px-4 py-3 text-[13px] text-charcoal">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
              <p>
                <span className="font-medium text-navy">Demo site.</span> This site is running with sample data. Changes you save here work, but the
                demo may be reset.
              </p>
            </div>
          )}

          <nav aria-label="Settings sections" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
            {JUMP_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex h-10 shrink-0 items-center rounded-lg px-3 text-[13px] font-medium text-navy hover:bg-navy/[0.06] md:h-8"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="space-y-4 [&>section]:scroll-mt-20">
            <UploadsSection settings={settings} onDirtyChange={onUploadsDirty} />
            <UploadQrSection settings={settings} />
            <TestimonialsSection settings={settings} onDirtyChange={onTestimonialsDirty} />
            <BrandingSection settings={settings} onDirtyChange={onBrandingDirty} />
          </div>
        </>
      )}
    </>
  );
}
