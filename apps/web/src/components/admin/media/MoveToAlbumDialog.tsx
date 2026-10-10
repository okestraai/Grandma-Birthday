import { useEffect, useId, useState } from 'react';
import { FolderInput } from 'lucide-react';
import { AdminDialog } from '../overlays';
import { AButton, AField, ASelect } from '../ui';
import { useAlbums } from '../media';

const NONE = '__none__';

/**
 * Choose an album for one or more media items. "No album" is offered unless `allowNone` is false.
 * `onConfirm` receives the album id, or null for "No album".
 */
export function MoveToAlbumDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  loading,
  title,
  confirmLabel = 'Move',
  allowNone = true,
  currentAlbumId,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of items being moved, for the description. */
  count: number;
  onConfirm: (albumId: string | null) => void;
  loading?: boolean;
  title?: string;
  confirmLabel?: string;
  allowNone?: boolean;
  /** Marks the album the items are in now. */
  currentAlbumId?: string | null;
  description?: string;
}) {
  const id = useId();
  const albums = useAlbums();
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue('');
      setTouched(false);
    }
  }, [open]);

  const invalid = value === '';
  const submit = () => {
    setTouched(true);
    if (invalid) return;
    onConfirm(value === NONE ? null : value);
  };

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title ?? (count === 1 ? 'Move to album' : `Move ${count} items to album`)}
      description={description}
      footer={
        <>
          <AButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </AButton>
          <AButton variant="primary" loading={loading} onClick={submit}>
            <FolderInput aria-hidden /> {confirmLabel}
          </AButton>
        </>
      }
    >
      <AField
        label="Album"
        htmlFor={id}
        required
        error={touched && invalid ? 'Choose an album.' : undefined}
        hint={albums.isError ? 'Albums could not be loaded. Close and try again.' : undefined}
      >
        <ASelect
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={touched && invalid}
          aria-describedby={touched && invalid ? `${id}-msg` : undefined}
          disabled={albums.isLoading}
        >
          <option value="" disabled>
            {albums.isLoading ? 'Loading albums…' : 'Choose an album'}
          </option>
          {allowNone && <option value={NONE}>No album</option>}
          {albums.data?.map((album) => (
            <option key={album.id} value={album.id}>
              {album.title}
              {album.id === currentAlbumId ? ' (current)' : ''}
            </option>
          ))}
        </ASelect>
      </AField>
    </AdminDialog>
  );
}
