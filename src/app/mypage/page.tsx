"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { useLanguage } from "@/components/providers";
import { SetupNotice } from "@/components/setup-notice";
import { useAuth } from "@/components/providers";
import { getBottleImageForSurface, getListingImageForSurface, isDefaultRegisterBottleImage } from "@/lib/media/images";
import { formatDate, formatUsd, toDate } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import { fetchAllListings, fetchBottles, fetchWishlistBottles } from "@/lib/data/store";
import type { Bottle, Listing, WishlistBottle } from "@/lib/types";

const MY_COLLECTION_PAGE_SIZE = 8;

type CollectionEntry = {
  bottle: Bottle;
  latestListing: Listing;
  totalBottleValueUsd: number;
  cardImageUrl: string;
};

export default function MyPage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [wishlistEntries, setWishlistEntries] = useState<WishlistBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState("");
  const [collectionPage, setCollectionPage] = useState(1);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured || !user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [allListings, allBottles, wishlist] = await Promise.all([
          fetchAllListings(500),
          fetchBottles(),
          fetchWishlistBottles(),
        ]);
        setAllListings(allListings);
        setListings(
          allListings
            .filter((listing) => listing.createdBy === user.uid)
            .sort(
              (left, right) =>
                (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
            ),
        );
        setBottles(allBottles);
        setWishlistEntries(wishlist);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load your portfolio.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user]);

  const collectionEntries = useMemo(() => {
    const bottleMap = new Map(bottles.map((bottle) => [bottle.id, bottle]));
    const grouped = new Map<string, Listing[]>();

    listings.forEach((listing) => {
      const current = grouped.get(listing.bottleId) ?? [];
      current.push(listing);
      grouped.set(listing.bottleId, current);
    });

    return [...grouped.entries()]
      .map(([bottleId, bottleListings]) => {
        const bottle = bottleMap.get(bottleId);
        if (!bottle) return null;

        const sortedListings = [...bottleListings].sort(
          (left, right) =>
            (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
        );
        const latestListing = sortedListings[0];
        const totalBottleValueUsd = sortedListings.reduce(
          (sum, listing) => sum + listing.normalizedPriceUsd * Math.max(listing.quantity || 1, 1),
          0,
        );

        return {
          bottle,
          latestListing,
          totalBottleValueUsd,
          cardImageUrl: getListingImageForSurface(latestListing, bottle, "mypage-card"),
        } satisfies CollectionEntry;
      })
      .filter((entry): entry is CollectionEntry => Boolean(entry));
  }, [bottles, listings]);

  const collectionPageCount = Math.max(
    1,
    Math.ceil(collectionEntries.length / MY_COLLECTION_PAGE_SIZE),
  );
  const visibleCollectionEntries = collectionEntries.slice(
    (collectionPage - 1) * MY_COLLECTION_PAGE_SIZE,
    collectionPage * MY_COLLECTION_PAGE_SIZE,
  );

  const latestListingByBottleId = useMemo(() => {
    const listingMap = new Map<string, Listing>();

    allListings.forEach((listing) => {
      const current = listingMap.get(listing.bottleId);
      const currentTime = toDate(current?.createdAt)?.getTime() ?? 0;
      const nextTime = toDate(listing.createdAt)?.getTime() ?? 0;
      if (!current || nextTime > currentTime) {
        listingMap.set(listing.bottleId, listing);
      }
    });

    return listingMap;
  }, [allListings]);

  useEffect(() => {
    setCollectionPage((current) => Math.min(Math.max(1, current), collectionPageCount));
  }, [collectionPageCount]);

  const totalPortfolioValueUsd = collectionEntries.reduce(
    (sum, entry) => sum + entry.totalBottleValueUsd,
    0,
  );
  const activeListingCount = listings.filter((listing) => listing.status === "active").length;
  const featuredEntry = collectionEntries[0] ?? null;
  const recentEntries = collectionEntries.slice(1, 4);

  if (!isBackendConfigured) {
    return (
      <div className="space-y-6">
        <DemoBanner />
        <SetupNotice />
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">My Page</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr" ? "수집가 프로필 확인 중" : "Checking your collector profile"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          {language === "kr"
            ? "바틀 아카이브를 불러오기 전에 현재 세션을 확인하고 있습니다."
            : "We're confirming your session before loading your bottle archive."}
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">My Page</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr" ? "업로드한 바틀을 보려면 로그인하세요." : "Sign in to view your uploaded bottles."}
        </h1>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell"
        >
          {language === "kr" ? "로그인으로 이동" : "Go to login"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-14 pb-8">
      <header className="flex flex-col justify-between gap-10 border-b border-[#e9e4da] pb-12 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">{language === "kr" ? "마이페이지" : "My Page"}</p>
          <h1 className="mt-3 whitespace-nowrap font-[family-name:var(--font-display)] text-[clamp(2.3rem,4.8vw,4.2rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#111111]">
            {language === "kr" ? "포트폴리오 개요" : "Portfolio Overview"}
          </h1>
          <div className="mt-7 flex flex-wrap items-center gap-7 border-t border-[#e9e4da] pt-6">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                {language === "kr" ? "포트폴리오 가치" : "Portfolio value"}
              </p>
              <p className="text-3xl font-black tracking-[-0.04em] text-[#111111]">
                {formatUsd(totalPortfolioValueUsd)}
              </p>
            </div>
            <div className="hidden h-9 w-px bg-[#e9e4da] sm:block" />
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                {language === "kr" ? "업로드한 바틀" : "Uploaded bottles"}
              </p>
              <p className="text-3xl font-black tracking-[-0.04em] text-[#111111]">
                {collectionEntries.length}
              </p>
            </div>
            <div className="hidden h-9 w-px bg-[#e9e4da] sm:block" />
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                {language === "kr" ? "활성 등록" : "Active listings"}
              </p>
              <p className="text-3xl font-black tracking-[-0.04em] text-[#111111]">
                {activeListingCount}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href="/submit"
            className="inline-flex items-center bg-[#111111] px-8 py-4 text-[11px] font-extrabold uppercase tracking-[0.24em] text-white transition hover:bg-black"
          >
            {language === "kr" ? "바틀 등록" : "Register bottle"}
          </Link>
        </div>
      </header>

      <section className="space-y-8">
        <div className="flex items-center justify-between border-b border-[#e9e4da] pb-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-[#111111]">
            {language === "kr" ? "내 컬렉션" : "My Collection"}
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
            {language === "kr" ? `전체 보기 (${collectionEntries.length})` : `View all (${collectionEntries.length})`}
          </span>
        </div>

        {!loading && !collectionEntries.length ? (
          <EmptyState
              title={error ? (language === "kr" ? "컬렉션을 불러올 수 없습니다" : "Unable to load your collection") : language === "kr" ? "업로드한 바틀이 아직 없습니다" : "No uploaded bottles yet"}
              description={
                error
                  ? error
                  : language === "kr"
                    ? "직접 업로드한 등록의 바틀만 이곳에 표시됩니다."
                    : "Only bottles from listings you personally uploaded will appear here."
              }
            />
        ) : null}

        {hasHydrated && loading ? (
          <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
            {language === "kr" ? "컬렉션을 불러오는 중입니다..." : "Loading your collection..."}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {visibleCollectionEntries.map((entry) => (
            <Link
              key={entry.bottle.id}
              href={`/bottle?id=${entry.bottle.id}`}
              className="group flex flex-col bg-white"
            >
              <div className="relative mb-6 aspect-[3/4] overflow-hidden bg-[#f3f2ee]">
                {entry.cardImageUrl ? (
                  <img
                    src={entry.cardImageUrl}
                    alt={entry.bottle.name}
                    className={`h-full w-full bg-[#f3f2ee] object-contain object-center grayscale transition-all duration-700 group-hover:grayscale-0 ${
                      isDefaultRegisterBottleImage(entry.cardImageUrl)
                        ? "p-3 group-hover:scale-[1.01]"
                        : "p-2.5 group-hover:scale-[1.01]"
                    }`}
                  />
                ) : (
                  <div className="h-full w-full bg-[#f3f2ee]" />
                )}
              </div>
              <div className="px-2 pb-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                  {entry.bottle.brand || entry.bottle.category}
                </p>
                <h3 className="text-lg font-bold leading-tight text-[#111111]">
                  {entry.bottle.name}
                </h3>
                <div className="mt-4 flex items-end justify-between border-t border-[#ece8e0] pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                    {language === "kr" ? "총 등록 가치" : "Total listed value"}
                  </span>
                  <span className="text-sm font-bold text-[#111111]">
                    {formatUsd(entry.totalBottleValueUsd)}
                  </span>
                </div>
              </div>
            </Link>
          ))}

        </div>
        {!loading && collectionPageCount > 1 ? (
          <nav className="flex items-center justify-center gap-2 text-sm" aria-label="My collection pages">
            <button
              type="button"
              onClick={() => setCollectionPage((current) => Math.max(1, current - 1))}
              disabled={collectionPage <= 1}
              className="rounded-full border border-[#e2ddd3] bg-white px-4 py-2 font-semibold text-[#111111] transition hover:border-[#111111] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {language === "kr" ? "이전" : "Previous"}
            </button>
            <span className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#7a746b]">
              {collectionPage} / {collectionPageCount}
            </span>
            <button
              type="button"
              onClick={() => setCollectionPage((current) => Math.min(collectionPageCount, current + 1))}
              disabled={collectionPage >= collectionPageCount}
              className="rounded-full border border-[#e2ddd3] bg-white px-4 py-2 font-semibold text-[#111111] transition hover:border-[#111111] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {language === "kr" ? "다음" : "Next"}
            </button>
          </nav>
        ) : null}
      </section>

      <section className="space-y-8 border-t border-[#e9e4da] pt-10">
        <div className="flex items-center justify-between gap-4 border-b border-[#e9e4da] pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">
              {language === "kr" ? "위시리스트" : "Wishlist"}
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-[#111111]">
              {language === "kr" ? "저장한 바틀" : "Saved bottles"}
            </h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
            {wishlistEntries.length}
          </span>
        </div>

        {!loading && !wishlistEntries.length ? (
          <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
            {language === "kr"
              ? "아직 위시리스트에 추가한 바틀이 없습니다."
              : "No saved bottles in your wishlist yet."}
          </div>
        ) : null}

        {wishlistEntries.length ? (
          <div className="flex flex-col gap-6">
            {wishlistEntries.map((entry) => {
              const latestListing = latestListingByBottleId.get(entry.bottle.id) ?? null;
              const imageUrl = latestListing
                ? getListingImageForSurface(latestListing, entry.bottle, "mypage-card")
                : getBottleImageForSurface(entry.bottle, "market-card");
              const isDefaultWishlistImage = isDefaultRegisterBottleImage(imageUrl);

              return (
                <Link
                  key={entry.id}
                  href={`/bottle?id=${entry.bottle.id}`}
                  className="group flex items-center gap-6 transition hover:translate-x-1"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden bg-[#f3f2ee]">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={entry.bottle.name}
                        className={`h-full w-full bg-[#f3f2ee] object-contain object-center transition duration-500 group-hover:scale-[1.02] ${
                          isDefaultWishlistImage ? "p-2.5" : "p-2"
                        }`}
                      />
                    ) : (
                      <div className="h-full w-full bg-[#ece9e2]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                      {entry.bottle.brand || entry.bottle.category}
                    </p>
                    <h3 className="truncate text-lg font-bold text-[#111111]">
                      {entry.bottle.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-4">
                      <span className="text-sm font-bold text-[#111111]">
                        {language === "kr" ? "저장됨" : "Saved"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>

      {featuredEntry ? (
        <section className="space-y-8">
          <div className="flex items-center justify-between border-b border-[#e9e4da] pb-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-[#111111]">
              {language === "kr" ? "최근 업로드" : "Recent Uploads"}
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
              {language === "kr" ? "최근 아카이브 활동" : "Your latest archive activity"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <Link
              href={`/bottle?id=${featuredEntry.bottle.id}`}
              className="group flex flex-col gap-8 bg-[#f3f4f2] p-6 sm:flex-row"
            >
              <div className="aspect-[3/4] w-full shrink-0 overflow-hidden bg-white sm:w-1/3">
                {featuredEntry.cardImageUrl ? (
                  <img
                    src={featuredEntry.cardImageUrl}
                    alt={featuredEntry.bottle.name}
                    className={`h-full w-full bg-[#f3f2ee] object-contain object-center transition-transform duration-700 group-hover:scale-[1.02] ${
                      isDefaultRegisterBottleImage(featuredEntry.cardImageUrl)
                        ? "p-3"
                        : "p-2.5"
                    }`}
                  />
                ) : (
                  <div className="h-full w-full bg-[#ece9e2]" />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between py-1">
                <div>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8b5a34]">
                      {language === "kr" ? "최근 업로드" : "Latest upload"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                      {formatDate(featuredEntry.latestListing.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-[#111111]">{featuredEntry.bottle.name}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-[#666159]">
                    {featuredEntry.latestListing.note || (language === "kr" ? "최근 업로드한 바틀 아카이브 항목입니다." : "Your latest uploaded bottle archive entry.")}
                  </p>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between border-t border-[#ddd7cd] pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                      {language === "kr" ? "최근 등록" : "Latest listing"}
                    </span>
                    <span className="text-xl font-bold text-[#111111]">
                      {formatUsd(featuredEntry.latestListing.normalizedPriceUsd)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>

            <div className="flex flex-col gap-6">
              {recentEntries.map((entry) => (
                <Link
                  key={entry.bottle.id}
                  href={`/bottle?id=${entry.bottle.id}`}
                  className="group flex items-center gap-6"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden bg-[#f3f2ee]">
                    {entry.cardImageUrl ? (
                      <img
                        src={entry.cardImageUrl}
                        alt={entry.bottle.name}
                        className={`h-full w-full bg-[#f3f2ee] object-contain object-center ${
                          isDefaultRegisterBottleImage(entry.cardImageUrl)
                            ? "p-2.5"
                            : "p-2"
                        }`}
                      />
                    ) : (
                      <div className="h-full w-full bg-[#ece9e2]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                      {entry.bottle.brand || entry.bottle.category}
                    </p>
                    <h4 className="truncate text-lg font-bold text-[#111111]">{entry.bottle.name}</h4>
                    <div className="mt-1 flex items-center gap-4">
                      <span className="text-sm font-bold text-[#111111]">
                        {formatUsd(entry.latestListing.normalizedPriceUsd)}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                        {formatDate(entry.latestListing.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
