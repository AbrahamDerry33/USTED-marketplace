import React, { useMemo } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { MAX_LISTING_IMAGES } from '../config/marketplace';
import { validateImageFiles } from '../lib/listingValidation';

interface ImageUploaderProps {
  existingUrls: string[];
  newFiles: File[];
  onRemoveExisting: (index: number) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveNewFile: (index: number) => void;
  error?: string;
  onError: (msg: string) => void;
}

export function ImageUploader({
  existingUrls,
  newFiles,
  onRemoveExisting,
  onAddFiles,
  onRemoveNewFile,
  error,
  onError,
}: ImageUploaderProps) {
  const totalCount = existingUrls.length + newFiles.length;

  const newFilePreviews = useMemo(
    () => newFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [newFiles]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (selected.length === 0) return;

    const validationError = validateImageFiles(selected, totalCount);
    if (validationError) {
      onError(validationError);
      return;
    }

    onError('');
    onAddFiles(selected);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="listing-images-input" className="block text-sm font-medium text-zinc-900">
          Photos ({totalCount}/{MAX_LISTING_IMAGES})
        </label>
        <span className="text-xs text-zinc-500">1 to 5 images · JPEG, PNG, WebP · max 5 MB each</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {existingUrls.map((url, idx) => (
          <div
            key={`existing-${url}-${idx}`}
            className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 bg-stone-100"
          >
            <img
              src={url}
              alt={`Listing photo ${idx + 1}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemoveExisting(idx)}
              aria-label={`Remove existing photo ${idx + 1}`}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md bg-zinc-900/80 text-white flex items-center justify-center hover:bg-zinc-900 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {newFilePreviews.map(({ file, url }, idx) => (
          <div
            key={`new-${file.name}-${idx}`}
            className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 bg-stone-100"
          >
            <img
              src={url}
              alt={`Selected upload ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemoveNewFile(idx)}
              aria-label={`Remove selected photo ${idx + 1}`}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md bg-zinc-900/80 text-white flex items-center justify-center hover:bg-zinc-900 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {totalCount < MAX_LISTING_IMAGES && (
          <label
            htmlFor="listing-images-input"
            className="aspect-[4/3] rounded-lg border border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors text-zinc-600 p-2 text-center"
          >
            <ImagePlus className="w-5 h-5 text-emerald-900" aria-hidden="true" />
            <span className="text-xs font-medium">Add Photo</span>
            <input
              id="listing-images-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-700 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
