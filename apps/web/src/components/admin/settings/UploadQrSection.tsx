import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminSettings } from '@birthday/types';
import { api } from '@/lib/api';
import { adminKeys, useAdminMutation } from '@/lib/admin-api';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { QRCodeCard } from '@/components/ui/qr-code-card';
import { AButton, AField, AInput, Panel } from '@/components/admin/ui';
import { Confirm } from '@/components/admin/overlays';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function UploadQrSection({ settings }: { settings: AdminSettings }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rotate = useAdminMutation<AdminSettings>({
    mutationFn: () => api.post<AdminSettings>('/admin/settings/upload-token/rotate'),
    success: 'New QR code created. The old one no longer works.',
    onSuccess: (data) => {
      queryClient.setQueryData(adminKeys.settings, data);
      setConfirmOpen(false);
    },
  });

  const version = `?v=${encodeURIComponent(settings.uploadTokenRotatedAt)}`;

  const copy = async () => {
    if (await copyText(settings.uploadUrl)) toast.success('Upload link copied');
    else toast.error('Could not copy. Select the link and copy it manually.');
  };

  return (
    <Panel
      id="settings-upload-qr"
      title="Guest upload QR code"
      description="Print this code at the venue. Guests scan it to share their photos and videos."
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <QRCodeCard
          svgUrl={`/api/admin/settings/upload-qr.svg${version}`}
          pngUrl={`/api/admin/settings/upload-qr.png${version}`}
          pdfUrl={`/api/admin/settings/upload-qr.pdf${version}`}
          alt="QR code that opens the guest photo upload page"
          size={180}
          className="self-center md:self-start"
        />
        <div className="min-w-0 flex-1 space-y-4">
          <AField label="Upload link" htmlFor="upload-url" hint="Share this link where a QR code cannot be scanned.">
            <div className="flex gap-2">
              <AInput
                id="upload-url"
                readOnly
                value={settings.uploadUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                aria-describedby="upload-url-msg"
              />
              <AButton onClick={() => void copy()} aria-label="Copy upload link">
                <Copy aria-hidden /> <span className="hidden sm:inline">Copy</span>
              </AButton>
              <AButton asChild variant="ghost" size="icon" aria-label="Open upload page in a new tab">
                <a href={settings.uploadUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                </a>
              </AButton>
            </div>
          </AField>

          <p className="text-[13px] text-muted">
            Last regenerated{' '}
            <time dateTime={settings.uploadTokenRotatedAt} title={formatDateTime(settings.uploadTokenRotatedAt)} className="text-charcoal">
              {formatDateTime(settings.uploadTokenRotatedAt)}
            </time>{' '}
            ({formatRelative(settings.uploadTokenRotatedAt)})
          </p>

          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-[13px] text-charcoal">
              If the code has been shared somewhere it should not be, create a new one. The current code and link stop working at once.
            </p>
            <AButton variant="warning" size="sm" className="mt-2" onClick={() => setConfirmOpen(true)}>
              <RefreshCw aria-hidden /> Regenerate QR code
            </AButton>
          </div>
        </div>
      </div>

      <Confirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Regenerate the upload QR code?"
        description="Printed QR codes and shared links will stop working immediately. Guests will need the new code."
        confirmLabel="Regenerate"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </Panel>
  );
}
