import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, ImageOff, ShieldAlert, Star } from 'lucide-react';
import { CONDITION_LABEL_MAP } from '../config/marketplace';
import { useAuth } from '../context/AuthContext';
import { formatGhs } from '../lib/money';
import { summarizeSellerReviews, type SellerRatingSummary } from '../lib/reviews';
import { getActiveListingsBySeller } from '../services/listingsService';
import { subscribeSellerReviews } from '../services/reviewsService';
import { getUserPublicProfile } from '../services/usersService';
import type { Listing, SellerReview, UserPublicProfile } from '../types/marketplace';
import { SellerReviewsSection } from './SellerReviewsSection';
import { VerifiedStudentBadge } from './VerifiedStudentBadge';

interface SellerProfileCardProps {
  sellerId: string;
  fallbackSellerName: string;
  currentListingId: string;
  isOwnListing?: boolean;
  showReviewsSection?: boolean;
  externalSummary?: SellerRatingSummary;
  externalReviewsLoading?: boolean;
  reviewsAnchorHref?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatMemberSince(date: Date | null): string | null {
  if (!date) return null;
  return `Joined ${date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
}

export function SellerProfileCard({
  sellerId,
  fallbackSellerName,
  currentListingId,
  isOwnListing = false,
  showReviewsSection = true,
  externalSummary,
  externalReviewsLoading,
  reviewsAnchorHref = '#seller-reviews',
}: SellerProfileCardProps) {
  const { user, isVerified } = useAuth();
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [activeListings, setActiveListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>({});
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');

  const shouldSubscribeReviews = showReviewsSection || externalSummary === undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailedThumbIds({});

    Promise.allSettled([
      getUserPublicProfile(sellerId),
      getActiveListingsBySeller(sellerId, 25),
    ])
      .then(([profileResult, listingsResult]) => {
        if (cancelled) return;
        setProfile(profileResult.status === 'fulfilled' ? profileResult.value : null);
        setActiveListings(listingsResult.status === 'fulfilled' ? listingsResult.value : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  useEffect(() => {
    if (!shouldSubscribeReviews) {
      setReviewsLoading(false);
      setReviewsError('');
      return;
    }

    if (!user || !isVerified) {
      setReviews([]);
      setReviewsLoading(false);
      setReviewsError('');
      return;
    }

    setReviewsLoading(true);
    setReviewsError('');

    const unsubscribe = subscribeSellerReviews(
      sellerId,
      (items) => {
        setReviews(items);
        setReviewsLoading(false);
        setReviewsError('');
      },
      () => {
        setReviewsLoading(false);
        setReviewsError('Unable to load student reviews right now.');
      }
    );

    return () => {
      unsubscribe();
    };
  }, [sellerId, user, isVerified, shouldSubscribeReviews]);

  const computedSummary = useMemo(() => summarizeSellerReviews(reviews), [reviews]);
  const ratingSummary = externalSummary ?? computedSummary;
  const effectiveReviewsLoading = externalReviewsLoading ?? reviewsLoading;

  const displayName = profile?.displayName || fallbackSellerName || 'Campus Student';
  const firstName = displayName.trim().split(/\s+/)[0] || 'Seller';
  const memberSince = formatMemberSince(profile?.createdAt ?? null);
  const otherListings = activeListings.filter((item) => item.id !== currentListingId);
  const previewListings = otherListings.slice(0, 3);
  const activeCount = activeListings.length;
  const isOwnProfile = Boolean(isOwnListing || (user && user.uid === sellerId));
  const sellerListingsHref = isOwnProfile
    ? '/my-listings'
    : `/?seller=${encodeURIComponent(sellerId)}`;

  return (
    <section
      id="seller-profile"
      aria-label="Seller profile"
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            aria-hidden="true"
            className="w-11 h-11 rounded-lg bg-emerald-50 border border-emerald-900/15 text-emerald-950 font-semibold text-sm flex items-center justify-center shrink-0"
          >
            {getInitials(displayName)}
          </div>

          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-zinc-500">Seller Profile</p>

            <h2 className="text-base font-semibold text-zinc-900 truncate">
              {displayName}
            </h2>

            {loading ? (
              <div className="h-4 w-44 bg-stone-200 rounded animate-pulse" />
            ) : (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  {profile?.banned ? (
                    <p className="inline-flex items-center gap-1.5 font-medium text-red-700">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Account suspended</span>
                    </p>
                  ) : profile?.verifiedStudent ? (
                    <div className="inline-flex flex-wrap items-center gap-1.5">
                      <VerifiedStudentBadge size="sm" />
                      {profile.role === 'admin' && (
                        <span className="text-emerald-900 font-medium">· Campus admin</span>
                      )}
                    </div>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
                      <BadgeCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {profile?.role === 'admin'
                          ? 'Verified campus admin'
                          : 'Verified email account'}
                      </span>
                    </p>
                  )}

                  {!effectiveReviewsLoading && (
                    <>
                      <span className="text-zinc-300" aria-hidden="true">
                        ·
                      </span>
                      {ratingSummary.totalCount > 0 && ratingSummary.averageRating !== null ? (
                        <a
                          href={reviewsAnchorHref}
                          className="inline-flex items-center gap-1 text-zinc-700 hover:text-emerald-900 transition-colors"
                        >
                          <Star
                            className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="font-mono tabular-nums font-semibold text-zinc-900">
                            {ratingSummary.averageRating.toFixed(1)}
                          </span>
                          <span className="text-zinc-500 font-mono tabular-nums">
                            ({ratingSummary.totalCount}{' '}
                            {ratingSummary.totalCount === 1 ? 'review' : 'reviews'})
                          </span>
                        </a>
                      ) : (
                        <a
                          href={reviewsAnchorHref}
                          className="text-zinc-500 hover:text-emerald-900 transition-colors"
                        >
                          No reviews yet
                        </a>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
                  {profile?.campus && (
                    <>
                      <span>{profile.campus}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  {memberSince && (
                    <>
                      <span>{memberSince}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span className="font-mono tabular-nums">
                    {activeCount} {activeCount === 1 ? 'active listing' : 'active listings'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <Link
          to={sellerListingsHref}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] sm:min-h-[40px] text-xs font-medium text-zinc-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
        >
          <span>
            {isOwnProfile
              ? 'Manage My Listings'
              : otherListings.length > 0
                ? `View all active listings (${activeCount})`
                : `View ${firstName}'s listings`}
          </span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </div>

      {/* Star Rating & Student Reviews (when rendered standalone) */}
      {showReviewsSection && (
        <SellerReviewsSection
          sellerId={sellerId}
          sellerFirstName={firstName}
          currentListingId={currentListingId}
          reviews={reviews}
          summary={ratingSummary}
          loading={effectiveReviewsLoading}
          loadError={reviewsError}
          isOwnProfile={isOwnProfile}
        />
      )}

      {/* Preview of Seller's Other Active Listings */}
      {!loading && previewListings.length > 0 && (
        <div className="border-t border-stone-200 pt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-zinc-700">
              More active listings from {firstName}
            </h3>
            {otherListings.length > previewListings.length && (
              <Link
                to={sellerListingsHref}
                className="text-xs font-medium text-emerald-900 hover:underline whitespace-nowrap shrink-0"
              >
                See all {otherListings.length}
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {previewListings.map((item) => {
              const thumb = item.images[0];
              const thumbFailed = Boolean(failedThumbIds[item.id]);

              return (
                <Link
                  key={item.id}
                  to={`/listings/${item.id}`}
                  className="group flex sm:flex-col gap-3 sm:gap-2 p-2 -m-2 sm:p-0 sm:m-0 rounded-lg hover:bg-stone-50 sm:hover:bg-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-900"
                >
                  <div className="w-16 h-12 sm:w-full sm:h-auto sm:aspect-[4/3] rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-stone-200/80">
                    {thumb && !thumbFailed ? (
                      <img
                        src={thumb}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedThumbIds((prev) => ({ ...prev, [item.id]: true }))
                        }
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400">
                        <ImageOff className="w-4 h-4" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-xs font-medium text-zinc-900 group-hover:text-emerald-900 line-clamp-1 transition-colors">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {CONDITION_LABEL_MAP[item.condition]}
                    </p>
                    <p className="font-mono text-xs font-semibold text-emerald-900 tabular-nums">
                      {formatGhs(item.pricePesewas)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!loading && previewListings.length === 0 && (
        <p className="border-t border-stone-200 pt-3.5 text-xs text-zinc-500">
          {isOwnProfile
            ? 'You have no other active listings right now.'
            : `${firstName} has no other active listings posted right now.`}
        </p>
      )}
    </section>
  );
}
