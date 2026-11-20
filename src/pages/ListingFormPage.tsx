import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LISTING_CATEGORIES, LISTING_CONDITIONS } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { validateListingForm } from '../lib/listingValidation';
import { pesewasToGhsString } from '../lib/money';
import { createListing, getListingById, updateListing } from '../services/listingsService';
import { ImageUploader } from '../components/ImageUploader';
import type { ListingCategory, ListingCondition, ListingStatus } from '../types/marketplace';

export function ListingFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceGhs, setPriceGhs] = useState('');
  const [category, setCategory] = useState<ListingCategory>('textbooks');
  const [condition, setCondition] = useState<ListingCondition>('good');
  const [status, setStatus] = useState<ListingStatus>('active');
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingExisting(true);

    getListingById(id)
      .then((item) => {
        if (cancelled) return;
        if (!item) {
          setSubmitError('Listing not found.');
          return;
        }
        if (user && item.sellerId !== user.uid) {
          setSubmitError('You can only edit your own listings.');
          return;
        }
        if (item.status === 'removed') {
          setSubmitError('Removed listings cannot be edited.');
          return;
        }
        setTitle(item.title);
        setDescription(item.description);
        setPriceGhs(pesewasToGhsString(item.pricePesewas));
        setCategory(item.category);
        setCondition(item.condition);
        setStatus(item.status);
        setExistingImages(item.images);
      })
      .catch(() => {
        if (!cancelled) setSubmitError('Failed to load listing for editing.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitError('');

    const totalImages = existingImages.length + newFiles.length;
    const validation = validateListingForm(
      { title, description, priceGhs, category, condition },
      totalImages
    );

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      if (validation.errors.images) {
        setImageError(validation.errors.images);
      }
      return;
    }

    setFieldErrors({});
    setImageError('');
    setSubmitting(true);
    setUploadPercent(0);

    const sellerName = profile?.displayName || user.displayName || 'Campus Seller';
    const sellerVerifiedStudent = Boolean(profile?.verifiedStudent);

    try {
      if (isEditMode && id) {
        await updateListing({
          uid: user.uid,
          sellerName,
          sellerVerifiedStudent,
          listingId: id,
          values: { title, description, priceGhs, category, condition },
          existingImages,
          newFiles,
          status,
          onProgress: setUploadPercent,
        });
        navigate(`/listings/${id}`);
      } else {
        const createdId = await createListing({
          uid: user.uid,
          sellerName,
          sellerVerifiedStudent,
          values: { title, description, priceGhs, category, condition },
          files: newFiles,
          onProgress: setUploadPercent,
        });
        navigate(`/listings/${createdId}`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save listing.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-stone-200 rounded-xl p-6 animate-pulse space-y-4">
          <div className="h-6 w-1/3 bg-stone-200 rounded" />
          <div className="h-10 w-full bg-stone-200 rounded" />
          <div className="h-28 w-full bg-stone-200 rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <Link
        to={isEditMode && id ? `/listings/${id}` : '/'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {isEditMode ? 'Back to listing' : 'Back to browse'}
      </Link>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {isEditMode ? 'Edit Listing' : 'Post a Campus Listing'}
          </h1>
          <p className="text-sm text-zinc-600">
            All prices are listed in Ghana cedis (GHS) and stored in pesewas.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="listing-title" className="block text-sm font-medium text-zinc-900 mb-1">
              Item Title
            </label>
            <input
              id="listing-title"
              type="text"
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Casio fx-991EX Scientific Calculator"
              className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
            />
            {fieldErrors.title && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                {fieldErrors.title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="listing-category" className="block text-sm font-medium text-zinc-900 mb-1">
                Category
              </label>
              <select
                id="listing-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ListingCategory)}
                className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
              >
                {LISTING_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fieldErrors.category && (
                <p className="mt-1 text-xs text-red-700" role="alert">
                  {fieldErrors.category}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="listing-condition" className="block text-sm font-medium text-zinc-900 mb-1">
                Condition
              </label>
              <select
                id="listing-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as ListingCondition)}
                className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
              >
                {LISTING_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fieldErrors.condition && (
                <p className="mt-1 text-xs text-red-700" role="alert">
                  {fieldErrors.condition}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="listing-price" className="block text-sm font-medium text-zinc-900 mb-1">
              Price (GHS)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-zinc-500">
                GHS
              </span>
              <input
                id="listing-price"
                type="text"
                inputMode="decimal"
                required
                value={priceGhs}
                onChange={(e) => setPriceGhs(e.target.value)}
                placeholder="120.00"
                className="w-full pl-14 pr-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-emerald-900"
              />
            </div>
            {fieldErrors.priceGhs && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                {fieldErrors.priceGhs}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label htmlFor="listing-description" className="block text-sm font-medium text-zinc-900">
                Description
              </label>
              <span className="text-xs text-zinc-500 tabular-nums">{description.length}/2000</span>
            </div>
            <textarea
              id="listing-description"
              rows={5}
              required
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Include model, edition, wear/tear details, and preferred campus meetup spot."
              className="w-full px-3 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-emerald-900"
            />
            {fieldErrors.description && (
              <p className="mt-1 text-xs text-red-700" role="alert">
                {fieldErrors.description}
              </p>
            )}
          </div>

          <ImageUploader
            existingUrls={existingImages}
            newFiles={newFiles}
            onRemoveExisting={(idx) =>
              setExistingImages((prev) => prev.filter((_, i) => i !== idx))
            }
            onAddFiles={(files) => setNewFiles((prev) => [...prev, ...files])}
            onRemoveNewFile={(idx) =>
              setNewFiles((prev) => prev.filter((_, i) => i !== idx))
            }
            error={imageError}
            onError={setImageError}
          />

          {submitError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {submitError}
            </p>
          )}

          {submitting && newFiles.length > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-600 tabular-nums">
                <span>Uploading photos...</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-900 transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <Link
              to={isEditMode && id ? `/listings/${id}` : '/'}
              className="px-4 py-2.5 text-sm font-medium text-center text-zinc-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-900 hover:bg-emerald-950 rounded-lg disabled:opacity-50 transition-colors"
            >
              {submitting
                ? 'Saving...'
                : isEditMode
                  ? 'Save Changes'
                  : 'Publish Listing'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
