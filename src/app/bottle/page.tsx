"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BottleMarketCard } from "@/components/bottle-market-card";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { useAuth, useLanguage } from "@/components/providers";
import { getEquivalentBottleGroup } from "@/lib/bottle-identity";
import { getBottleImageForSurface, getListingImageForSurface } from "@/lib/media/images";
import { resolveUsdKrwRate } from "@/lib/fx";
import { formatCategoryLabel, formatKrw, formatListingStatus, formatUsd, median, toDate } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import {
  createCollectorNote,
  fetchAllListings,
  fetchBottleById,
  fetchBottleReferencePrice,
  fetchBottles,
  fetchCollectorNotes,
  fetchListingsForBottleIds,
  fetchWishlistBottleIds,
  findCollectorNoteQualifiedBottleId,
  hideOwnCollectorNote,
  markCollectorNoteHelpful,
  setBottleWishlist,
  updateCollectorNoteContent,
} from "@/lib/data/store";
import { formatUiDate, tStatus } from "@/lib/i18n";
import type { Bottle, BottleReferencePrice, CollectorNote, Listing } from "@/lib/types";

function formatPercentChange(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  const rounded = Math.abs(value).toFixed(1);
  return `${value >= 0 ? "+" : "-"}${rounded}%`;
}

type ChartSeriesPoint = {
  timestamp: number;
  date: string;
  price: number | null;
};

function BottlePageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { language } = useLanguage();
  const bottleId = searchParams.get("id") ?? "";
  const [bottle, setBottle] = useState<Bottle | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [equivalentBottleIds, setEquivalentBottleIds] = useState<string[]>([]);
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [allBottles, setAllBottles] = useState<Bottle[]>([]);
  const [referencePrice, setReferencePrice] = useState<BottleReferencePrice | null>(null);
  const [collectorNotes, setCollectorNotes] = useState<CollectorNote[]>([]);
  const [qualifiedNoteBottleId, setQualifiedNoteBottleId] = useState<string | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteDraft, setEditingNoteDraft] = useState("");
  const [deleteNoteId, setDeleteNoteId] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteUpdating, setNoteUpdating] = useState(false);
  const [noteMessage, setNoteMessage] = useState("");
  const [fxRate, setFxRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllRecentListings, setShowAllRecentListings] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistUpdating, setWishlistUpdating] = useState(false);
  const [wishlistMessage, setWishlistMessage] = useState("");

  useEffect(() => {
    if (!bottleId) {
      setLoading(false);
      return;
    }

    if (!isBackendConfigured) {
      setBottle(null);
      setListings([]);
      setEquivalentBottleIds([]);
      setAllListings([]);
      setAllBottles([]);
      setReferencePrice(null);
      setCollectorNotes([]);
      setFxRate(0);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [bottleDoc, fxState, bottleDocs, allListingDocs, referenceDoc] = await Promise.all([
          fetchBottleById(bottleId),
          resolveUsdKrwRate(),
          fetchBottles(),
          fetchAllListings(200),
          fetchBottleReferencePrice(bottleId),
        ]);
        const equivalentBottleIds =
          bottleDoc && bottleDocs.length
            ? getEquivalentBottleGroup(bottleDocs, bottleDoc).map((item) => item.id)
            : [bottleId];
        const [listingDocs, noteDocs] = await Promise.all([
          fetchListingsForBottleIds(equivalentBottleIds),
          fetchCollectorNotes(equivalentBottleIds),
        ]);
        setBottle(bottleDoc);
        setEquivalentBottleIds(equivalentBottleIds);
        setAllBottles(bottleDocs);
        setAllListings(allListingDocs);
        setListings(listingDocs);
        setCollectorNotes(noteDocs);
        setReferencePrice(referenceDoc);
        setFxRate(fxState.rate);
      } catch (nextError) {
        setBottle(null);
        setListings([]);
        setEquivalentBottleIds([]);
        setAllListings([]);
        setAllBottles([]);
        setReferencePrice(null);
        setCollectorNotes([]);
        setFxRate(0);
        setError(nextError instanceof Error ? nextError.message : "Unable to load bottle.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [bottleId]);

  useEffect(() => {
    if (!user || !equivalentBottleIds.length || !isBackendConfigured) {
      setQualifiedNoteBottleId(null);
      return;
    }

    let cancelled = false;
    void findCollectorNoteQualifiedBottleId(equivalentBottleIds)
      .then((qualifiedBottleId) => {
        if (!cancelled) setQualifiedNoteBottleId(qualifiedBottleId);
      })
      .catch(() => {
        if (!cancelled) setQualifiedNoteBottleId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [equivalentBottleIds, user]);

  useEffect(() => {
    if (!bottleId || !user || !isBackendConfigured) {
      setIsWishlisted(false);
      setWishlistLoading(false);
      return;
    }

    let cancelled = false;
    setWishlistLoading(true);
    setWishlistMessage("");

    void fetchWishlistBottleIds()
      .then((ids) => {
        if (!cancelled) setIsWishlisted(ids.has(bottleId));
      })
      .catch(() => {
        if (!cancelled) setWishlistMessage(language === "kr" ? "위시리스트를 불러올 수 없습니다." : "Unable to load wishlist.");
      })
      .finally(() => {
        if (!cancelled) setWishlistLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bottleId, language, user]);

  const onWishlistToggle = async () => {
    if (!bottleId || wishlistUpdating) return;

    if (!user) {
      setWishlistMessage(language === "kr" ? "위시리스트는 로그인 후 사용할 수 있습니다." : "Sign in to use wishlist.");
      return;
    }

    const nextWishlisted = !isWishlisted;
    setWishlistUpdating(true);
    setWishlistMessage("");
    setIsWishlisted(nextWishlisted);

    try {
      await setBottleWishlist(bottleId, nextWishlisted);
      setWishlistMessage(
        nextWishlisted
          ? language === "kr"
            ? "위시리스트에 추가했습니다."
            : "Added to wishlist."
          : language === "kr"
            ? "위시리스트에서 제거했습니다."
            : "Removed from wishlist.",
      );
    } catch (nextError) {
      setIsWishlisted(!nextWishlisted);
      setWishlistMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "위시리스트를 업데이트할 수 없습니다."
            : "Unable to update wishlist.",
      );
    } finally {
      setWishlistUpdating(false);
    }
  };

  const onCollectorNoteSubmit = async () => {
    if (!user) {
      setNoteMessage(language === "kr" ? "노트는 로그인 후 작성할 수 있습니다." : "Sign in to add a collector note.");
      return;
    }
    if (!qualifiedNoteBottleId) {
      setNoteMessage(
        language === "kr"
          ? "이 바틀에 등록 이력이 있는 컬렉터만 노트를 남길 수 있습니다."
          : "Only collectors with archive activity can leave notes.",
      );
      return;
    }
    if (!noteDraft.trim() || noteDraft.trim().length > 300 || noteSubmitting) return;

    setNoteSubmitting(true);
    setNoteMessage("");
    try {
      await createCollectorNote({
        bottleId: qualifiedNoteBottleId,
        content: noteDraft,
        user,
      });
      setNoteDraft("");
      setNoteModalOpen(false);
      setNoteMessage(
        language === "kr"
          ? "노트가 등록되었습니다."
          : "Collector note published.",
      );
      const nextNotes = await fetchCollectorNotes(equivalentBottleIds);
      setCollectorNotes(nextNotes);
    } catch (nextError) {
      setNoteMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "노트를 제출할 수 없습니다."
            : "Unable to submit collector note.",
      );
    } finally {
      setNoteSubmitting(false);
    }
  };

  const onHelpfulNote = async (noteId: string) => {
    if (!user) {
      setNoteMessage(language === "kr" ? "로그인 후 Helpful을 누를 수 있습니다." : "Sign in to mark notes helpful.");
      return;
    }

    try {
      const nextHelpfulCount = await markCollectorNoteHelpful(noteId);
      setCollectorNotes((current) =>
        current.map((note) =>
          note.id === noteId
            ? {
                ...note,
                helpfulByCurrentUser: true,
                helpfulCount: nextHelpfulCount ?? note.helpfulCount,
              }
            : note,
        ),
      );
    } catch (nextError) {
      setNoteMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "Helpful을 저장할 수 없습니다."
            : "Unable to save helpful vote.",
      );
    }
  };

  const onUpdateCollectorNote = async (noteId: string) => {
    if (!editingNoteDraft.trim() || editingNoteDraft.trim().length > 300 || noteUpdating) return;

    setNoteUpdating(true);
    setNoteMessage("");
    try {
      const updatedNote = await updateCollectorNoteContent(noteId, editingNoteDraft);
      setCollectorNotes((current) =>
        current.map((note) =>
          note.id === noteId
            ? {
                ...note,
                content: updatedNote.content,
                updatedAt: updatedNote.updatedAt,
              }
            : note,
        ),
      );
      setEditingNoteId("");
      setEditingNoteDraft("");
      setNoteMessage(language === "kr" ? "노트를 수정했습니다." : "Collector note updated.");
    } catch (nextError) {
      setNoteMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "노트를 수정할 수 없습니다."
            : "Unable to update collector note.",
      );
    } finally {
      setNoteUpdating(false);
    }
  };

  const onDeleteCollectorNote = async (noteId: string) => {
    if (noteUpdating) return;

    setNoteUpdating(true);
    setNoteMessage("");
    try {
      await hideOwnCollectorNote(noteId);
      setCollectorNotes((current) => current.filter((note) => note.id !== noteId));
      setEditingNoteId("");
      setEditingNoteDraft("");
      setDeleteNoteId("");
      setNoteMessage(language === "kr" ? "노트를 삭제했습니다." : "Collector note deleted.");
    } catch (nextError) {
      setNoteMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "노트를 삭제할 수 없습니다."
            : "Unable to delete collector note.",
      );
    } finally {
      setNoteUpdating(false);
    }
  };

  if (!bottleId) {
    return (
      <EmptyState
        title={language === "kr" ? "바틀 ID가 없습니다" : "Bottle id missing"}
        description={language === "kr" ? "리스트에서 바틀을 열거나 URL에 `?id=`를 추가하세요." : "Open a bottle from the listing grid or pass `?id=` in the URL."}
      />
    );
  }

  if (error) {
    return <EmptyState title={language === "kr" ? "바틀을 불러올 수 없습니다" : "Bottle unavailable"} description={error} />;
  }

  if (!loading && !bottle) {
    return <EmptyState title={language === "kr" ? "바틀을 찾을 수 없습니다" : "Bottle not found"} description={language === "kr" ? "이 바틀 ID는 아카이브에 없습니다." : "This bottle id is not in the archive."} />;
  }

  const last30Days = listings.filter((listing) => {
    const createdAt = toDate(listing.createdAt);
    if (!createdAt) return false;
    return createdAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  });

  const median30d = median(last30Days.map((listing) => listing.normalizedPriceUsd));
  const activeListings = listings.filter((listing) => listing.status === "active");
  const inactiveListings = listings.filter((listing) => listing.status === "inactive");
  const sortedListings = [...listings].sort(
    (left, right) =>
      (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
  );
  const latestListing = sortedListings[0] ?? null;
  const oldestListing = sortedListings[sortedListings.length - 1] ?? null;
  const priceValues = listings.map((listing) => listing.normalizedPriceUsd).filter(Boolean);
  const marketLow = priceValues.length ? Math.min(...priceValues) : 0;
  const marketHigh = priceValues.length ? Math.max(...priceValues) : 0;
  const marketChange =
    latestListing && oldestListing && oldestListing.normalizedPriceUsd
      ? ((latestListing.normalizedPriceUsd - oldestListing.normalizedPriceUsd) /
          oldestListing.normalizedPriceUsd) *
        100
      : 0;
  const listingChartPoints: ChartSeriesPoint[] = [...listings].map((listing) => ({
    timestamp: toDate(listing.createdAt)?.getTime() ?? 0,
    date:
      toDate(listing.createdAt)?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }) ?? "Pending",
    price: listing.normalizedPriceUsd,
  }));
  const chartPoints = listingChartPoints
    .sort((left, right) => (left?.timestamp ?? 0) - (right?.timestamp ?? 0))
    .map((point) => ({
      date: point.date ?? "Pending",
      timestamp: point.timestamp ?? 0,
      price: typeof point.price === "number" && Number.isFinite(point.price) ? point.price : null,
    }));
  const equivalentBottleIdSet = bottle ? new Set(getEquivalentBottleGroup(allBottles, bottle).map((item) => item.id)) : new Set<string>();
  const relatedBottles = allBottles
    .filter(
      (item) =>
        !equivalentBottleIdSet.has(item.id) &&
        item.category === bottle?.category,
    )
    .slice(0, 4)
    .map((item) => {
      const relatedListings = allListings.filter((listing) => listing.bottleId === item.id);
      const relatedPrice =
        relatedListings.length > 0
          ? Math.min(...relatedListings.map((listing) => listing.normalizedPriceUsd))
          : 0;

      return {
        bottle: item,
        priceUsd: relatedPrice,
        listingCount: relatedListings.length,
        imageUrl:
          getListingImageForSurface(
            [...relatedListings].sort(
              (left, right) =>
                (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
            )[0],
            item,
            "detail-related-card",
          ) || "",
      };
    });
  const firstRegisteredListingImage =
    !loading && bottle
      ? [...listings]
          .sort(
            (left, right) =>
              (toDate(left.createdAt)?.getTime() ?? 0) - (toDate(right.createdAt)?.getTime() ?? 0),
          )
          .map((listing) => getListingImageForSurface(listing, bottle, "detail-hero"))
          .find(Boolean) || ""
      : "";
  const bottleHeroImage =
    !loading && bottle
      ? firstRegisteredListingImage || getBottleImageForSurface(bottle, "detail-hero")
      : "";
  const visibleRecentListings = showAllRecentListings ? sortedListings : sortedListings.slice(0, 4);

  return (
    <div className="space-y-20 pb-20">
      <section className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="bg-white px-6 py-8 sm:px-8 sm:py-10 lg:col-span-5 lg:px-10 lg:py-12 xl:px-12 xl:py-14">
          <div className="mb-8">
            <span className="bg-[#f1dfb1] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#624604]">
              {language === "kr" ? bottle?.category ?? "Whisky" : formatCategoryLabel(bottle?.category ?? "Whisky")}
            </span>
          </div>
          {bottleHeroImage ? (
            <img
              src={bottleHeroImage}
              alt={bottle?.name ?? (language === "kr" ? "바틀 이미지" : "Bottle image")}
              className="mx-auto max-h-[240px] w-auto max-w-full object-contain mix-blend-multiply sm:max-h-[300px] md:max-h-[340px] lg:max-h-[400px] xl:max-h-[460px]"
            />
          ) : (
            <div className="aspect-[3/4] w-full bg-[#f2f2ef]" />
          )}
        </div>

        <div className="flex flex-col justify-center pt-4 lg:col-span-7 lg:pt-8">
          <nav className="mb-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#7b746a]">
            <span>{bottle?.category}</span>
            <span> / </span>
            <span>{bottle?.brand || (language === "kr" ? "브랜드 미확인" : "Unknown brand")}</span>
          </nav>

          <h1 className="text-4xl font-black leading-[0.96] tracking-[-0.05em] text-[#111111] sm:text-5xl lg:text-6xl">
            {bottle?.name}
          </h1>

          <div className="mb-12 mt-8 flex flex-wrap items-end gap-x-10 gap-y-6">
            <div className="flex flex-col">
              <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7b746a]">
                {language === "kr" ? "시장 중간값" : "Market median"}
              </span>
              <span className="text-4xl font-black tracking-[-0.04em] text-[#111111]">
                {formatUsd(median30d || latestListing?.normalizedPriceUsd || 0)}
              </span>
              <span className="mt-2 text-sm text-[#7b746a]">
                {fxRate
                  ? formatKrw((median30d || latestListing?.normalizedPriceUsd || 0) * fxRate)
                  : language === "kr" ? "예상 KRW 없음" : "Approx KRW unavailable"}
              </span>
            </div>

            <div className="flex flex-col text-[#785a1a]">
              <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em]">
                {language === "kr" ? "아카이브 변동" : "Archive move"}
              </span>
              <div className="flex items-center text-xl font-bold">
                <span>{formatPercentChange(marketChange)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 border-t border-[#e7e1d8] pt-10 md:grid-cols-3">
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "브랜드" : "Brand"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {bottle?.brand || (language === "kr" ? "미설정" : "Not set")}
              </span>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "배치" : "Batch"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {bottle?.batch || (language === "kr" ? "미설정" : "Not set")}
              </span>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "도수" : "Strength"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {bottle?.abv ? `${bottle.abv}% ABV` : language === "kr" ? "미설정" : "Not set"}
              </span>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "숙성 연수" : "Age statement"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {bottle?.ageStatement || (language === "kr" ? "미설정" : "Not set")}
              </span>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "용량" : "Volume"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {bottle?.volumeMl ? `${bottle.volumeMl} ml` : language === "kr" ? "미설정" : "Not set"}
              </span>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-[#7b746a]">
                {language === "kr" ? "최신 업데이트" : "Latest update"}
              </span>
              <span className="block text-sm font-semibold text-[#111111]">
                {latestListing ? formatUsd(latestListing.normalizedPriceUsd) : language === "kr" ? "등록 없음" : "No listings yet"}
              </span>
            </div>
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-3">
            <a
              href="#listing-archive"
              className="inline-flex bg-[#111111] px-10 py-5 text-xs font-bold uppercase tracking-[0.24em] text-white transition-colors hover:bg-black"
            >
              {language === "kr" ? "실시간 등록 보기" : "View live listings"}
            </a>
            <button
              type="button"
              onClick={onWishlistToggle}
              disabled={wishlistLoading || wishlistUpdating}
              className={`inline-flex border px-7 py-5 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isWishlisted
                  ? "border-[#111111] bg-white text-[#111111]"
                  : "border-[#d8d1c7] bg-white text-[#7b746a] hover:border-[#111111] hover:text-[#111111]"
              }`}
            >
              {isWishlisted
                ? language === "kr"
                  ? "♥ 위시리스트"
                  : "♥ Wishlisted"
                : language === "kr"
                  ? "♡ 위시리스트"
                  : "♡ Wishlist"}
            </button>
          </div>
          {wishlistMessage ? (
            <p className="mt-3 text-sm text-[#7b746a]">{wishlistMessage}</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-10">
        {referencePrice ? (
          <div className="panel p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#7b746a]">
              {language === "kr" ? "글로벌 기준 가격" : "Global Reference Price"}
            </p>
            <div className="mt-4 space-y-3">
              <div className="text-4xl font-black tracking-[-0.04em] text-[#111111]">
                {formatUsd(referencePrice.referencePriceUsd)}
              </div>
              <div className="space-y-1 text-sm text-[#7b746a]">
                <p>
                  {language === "kr" ? "출처: " : "Source: "}
                  {referencePrice.sourceUrl ? (
                    <a
                      href={referencePrice.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#111111] underline underline-offset-4"
                    >
                      {referencePrice.source}
                    </a>
                  ) : (
                    <span className="font-medium text-[#111111]">{referencePrice.source}</span>
                  )}
                </p>
                <p>
                  {language === "kr" ? "업데이트: " : "Last updated: "}
                  {formatUiDate(referencePrice.updatedAt, language)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-[#111111]">{language === "kr" ? "가격 히스토리" : "Price history"}</h2>
            <p className="mt-2 text-sm text-[#7b746a]">
              {language === "kr" ? "기록된 등록 항목을 기반으로 한 시장 가치 흐름입니다." : "Aggregated market value performance from recorded listing entries."}
            </p>
          </div>
          {referencePrice ? (
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#7b746a]">
              <span className="inline-block h-[2px] w-8 border-t-2 border-dashed border-[#111111]" />
              <span>{language === "kr" ? "글로벌 기준값" : "Global Reference"}</span>
            </div>
          ) : null}
        </div>
        {chartPoints.length ? <PriceHistoryChart points={chartPoints} referencePrice={referencePrice?.referencePriceUsd ?? null} /> : (
          <EmptyState
            title={language === "kr" ? "차트 데이터가 없습니다" : "No chart data yet"}
            description={language === "kr" ? "이 바틀에 등록이 추가되면 가격 히스토리가 표시됩니다." : "Price history appears after listings are added for this bottle."}
          />
        )}
      </section>

      <section className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-8 flex items-center gap-3 text-xl font-bold text-[#111111]">
            {language === "kr" ? "최근 등록" : "Recent listings"}
            <span className="h-2 w-2 rounded-full bg-[#785a1a]" />
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#111111] text-[10px] font-bold uppercase tracking-[0.24em] text-[#111111]">
                  <th className="pb-4">{language === "kr" ? "상태" : "Status"}</th>
                  <th className="pb-4">{language === "kr" ? "컨디션" : "Condition"}</th>
                  <th className="pb-4">{language === "kr" ? "날짜" : "Date"}</th>
                  <th className="pb-4 text-right">{language === "kr" ? "가격" : "Price"}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {visibleRecentListings.map((listing) => (
                  <tr
                    key={listing.id}
                    className="border-b border-[#e7e1d8] transition-colors hover:bg-[#f3f4f2]"
                  >
                    <td className="py-5 font-semibold text-[#111111]">{language === "kr" ? tStatus(language, formatListingStatus(listing.status)) : formatListingStatus(listing.status)}</td>
                    <td className="py-5 text-[#7b746a]">
                      {[listing.condition, listing.region].filter(Boolean).join(", ") || (language === "kr" ? "상세 정보 없음" : "No details")}
                    </td>
                    <td className="py-5 text-[#7b746a]">
                      {formatUiDate(String(listing.createdAt), language)}
                    </td>
                    <td className="py-5 text-right font-bold text-[#111111]">
                      {formatUsd(listing.normalizedPriceUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedListings.length > 4 ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowAllRecentListings((current) => !current)}
                className="border-b border-[#8f877d] pb-1 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#111111] transition-colors hover:border-[#111111]"
              >
                {showAllRecentListings ? (language === "kr" ? "접기" : "See less") : language === "kr" ? "더 보기" : "See more"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="bg-[#f3f4f2] p-8">
          <div>
            <h3 className="text-xl font-bold text-[#111111]">{language === "kr" ? "시장 스냅샷" : "Market snapshot"}</h3>
            <p className="mb-10 mt-2 text-sm text-[#7b746a]">
              {language === "kr" ? "현재 등록 깊이와 가격 범위 기준의 아카이브 상태입니다." : "Archive health from current listing depth and price spread."}
            </p>

            <div className="space-y-7">
              <div>
                <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-[#111111]">
                  <span>{language === "kr" ? "활성 등록" : "Active listings"}</span>
                  <span>{activeListings.length}</span>
                </div>
                <div className="h-1 w-full bg-[#ddd7cd]">
                  <div
                    className="h-full bg-[#111111]"
                    style={{
                      width: `${Math.min(100, activeListings.length * 20 || 6)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.24em] text-[#111111]">
                  <span>{language === "kr" ? "비활성 아카이브" : "Inactive archive"}</span>
                  <span>{inactiveListings.length}</span>
                </div>
                <div className="h-1 w-full bg-[#ddd7cd]">
                  <div
                    className="h-full bg-[#785a1a]"
                    style={{
                      width: `${Math.min(100, inactiveListings.length * 18 || 6)}%`,
                    }}
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="mt-12 border border-[#e7e1d8] bg-white p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7b746a]">
              {language === "kr" ? "현재 범위" : "Current range"}
            </p>
            <p className="mt-4 text-sm leading-7 text-[#111111]">
              {language === "kr" ? `최저 ${formatUsd(marketLow)} / 최고 ${formatUsd(marketHigh)}` : `Low ${formatUsd(marketLow)} / High ${formatUsd(marketHigh)}`}
            </p>
            <p className="mt-4 text-sm leading-7 text-[#111111]">
              {language === "kr"
                ? `활성 ${activeListings.length}, 비활성 ${inactiveListings.length}`
                : `Active ${activeListings.length}, inactive ${inactiveListings.length}`}
            </p>
            <p className="mt-4 text-sm leading-7 text-[#7b746a]">
              {language === "kr"
                ? "바틀에 대한 자세한 정보는 메신저를 통해 등록자에게 문의해주세요."
                : "For detailed information about the bottle, please contact the lister via messenger."}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-[#e7e1d8] bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-5 border-b border-[#ece8e0] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-black tracking-[-0.04em] text-[#111111]">
              {language === "kr" ? "컬렉터 노트" : "Collector Notes"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7b746a]">
              {language === "kr"
                ? "컬렉터가 남긴 짧은 인사이트입니다. 공식 데이터가 아닌 개인 관찰입니다."
                : "Curated bottle observations from collectors. Personal insight, not official data."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNoteMessage("");
              setNoteModalOpen(true);
            }}
            className="inline-flex items-center justify-center border border-[#d8d2c8] bg-white px-5 py-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#111111] transition hover:border-[#111111]"
          >
            + {user ? (language === "kr" ? "노트 추가" : "Add note") : (language === "kr" ? "로그인 후 노트 추가" : "Add note (login)")}
          </button>
        </div>

        {noteMessage ? (
          <p className="mt-4 text-sm font-medium text-[#8d5b33]">{noteMessage}</p>
        ) : null}

        <div className="mt-6 divide-y divide-[#ece8e0] border border-[#ece8e0]">
          {collectorNotes.length ? (
            collectorNotes.slice(0, 6).map((note) => {
              const isOwnNote = Boolean(user && note.createdBy === user.uid);
              const isEditing = editingNoteId === note.id;
              return (
                <article key={note.id} className="grid gap-5 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)_160px] md:items-start">
                  <div>
                    <p className="font-bold text-[#111111]">{note.displayName}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#7b746a]">
                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-[#2f80ed]">
                        <path
                          fill="currentColor"
                          d="M10 1.6 3.5 4.2v4.9c0 4.1 2.6 7.7 6.5 9.3 3.9-1.6 6.5-5.2 6.5-9.3V4.2L10 1.6Zm3.4 6.7-4.1 4.5-2.2-2.1 1.1-1.2 1.1 1.1 3-3.4 1.1 1.1Z"
                        />
                      </svg>
                      <span>{language === "kr" ? "인증된 컬렉터" : "Verified Collector"}</span>
                    </p>
                  </div>
                  <div>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <textarea
                            value={editingNoteDraft}
                            onChange={(event) => setEditingNoteDraft(event.target.value.slice(0, 300))}
                            disabled={noteUpdating}
                            className="min-h-28 w-full resize-none border border-[#d8d2c8] bg-white px-4 py-3 pr-20 text-sm leading-7 text-[#111111] outline-none transition focus:border-[#111111] disabled:bg-[#f4f1ec]"
                          />
                          <span className="absolute bottom-3 right-3 text-xs font-bold text-[#8f877d]">
                            {editingNoteDraft.length} / 300
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onUpdateCollectorNote(note.id)}
                            disabled={!editingNoteDraft.trim() || editingNoteDraft.length > 300 || noteUpdating}
                            className="border border-[#111111] bg-[#111111] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition disabled:cursor-not-allowed disabled:border-[#c9c1b7] disabled:bg-[#c9c1b7]"
                          >
                            {language === "kr" ? "저장" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId("");
                              setEditingNoteDraft("");
                            }}
                            disabled={noteUpdating}
                            className="border border-[#d8d2c8] bg-white px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#111111]"
                          >
                            {language === "kr" ? "취소" : "Cancel"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-7 text-[#111111]">{note.content}</p>
                    )}
                  </div>
                  <div className="space-y-4 text-left md:text-right">
                    <p className="text-xs text-[#7b746a]">{formatUiDate(String(note.createdAt), language)}</p>
                    <button
                      type="button"
                      onClick={() => onHelpfulNote(note.id)}
                      disabled={Boolean(note.helpfulByCurrentUser)}
                      className="text-xs font-bold text-[#5f5145] transition hover:text-[#111111] disabled:cursor-default disabled:text-[#8f877d]"
                    >
                      {note.helpfulByCurrentUser ? "✓ " : "♡ "}
                      {language === "kr" ? `Helpful ${note.helpfulCount}` : `Helpful ${note.helpfulCount}`}
                    </button>
                    {isOwnNote ? (
                      <div className="flex flex-wrap gap-3 md:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingNoteDraft(note.content);
                            setNoteMessage("");
                          }}
                          disabled={noteUpdating || isEditing}
                          className="text-xs font-bold text-[#5f5145] transition hover:text-[#111111] disabled:opacity-40"
                        >
                          {language === "kr" ? "수정" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteNoteId(note.id)}
                          disabled={noteUpdating}
                          className="text-xs font-bold text-red-600 transition hover:text-red-700 disabled:opacity-40"
                        >
                          {language === "kr" ? "삭제" : "Delete"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="px-5 py-8 text-sm text-[#7b746a]">
              {language === "kr"
                ? "아직 등록된 컬렉터 노트가 없습니다."
                : "No collector notes yet."}
            </div>
          )}
        </div>
      </section>

      <section id="listing-archive" className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">{language === "kr" ? "등록 아카이브" : "Listing archive"}</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#111111]">
            {language === "kr" ? "현재 바틀 아카이브" : "Current bottle archive"}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {listings.slice(0, 6).map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              bottle={bottle ?? undefined}
              fxRate={fxRate}
              compact
              onUpdated={(nextListing) => {
                setListings((current) =>
                  current.map((item) => (item.id === nextListing.id ? nextListing : item)),
                );
                setAllListings((current) =>
                  current.map((item) => (item.id === nextListing.id ? nextListing : item)),
                );
              }}
              onDeleted={(listingId) => {
                setListings((current) => current.filter((item) => item.id !== listingId));
                setAllListings((current) => current.filter((item) => item.id !== listingId));
              }}
            />
          ))}
        </div>
      </section>

      {relatedBottles.length ? (
        <section className="space-y-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">{language === "kr" ? "관련 바틀" : "Related bottles"}</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#111111]">
              {language === "kr"
                ? `${bottle?.category ?? "Whisky"} 더 보기`
                : `More in ${formatCategoryLabel(bottle?.category ?? "Whisky")}`}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            {relatedBottles.map((item) => (
              <BottleMarketCard
                key={item.bottle.id}
                href={`/bottle?id=${item.bottle.id}`}
                imageUrl={item.imageUrl}
                name={item.bottle.name}
                priceUsd={item.priceUsd}
                listingCount={item.listingCount}
                compact
              />
            ))}
          </div>
        </section>
      ) : null}

      {noteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8">
          <div className="w-full max-w-xl rounded-[1.5rem] bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-[#111111]">
                  {language === "kr" ? "컬렉터 노트 추가" : "Add Collector Note"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#7b746a]">
                  {language === "kr"
                    ? "이 바틀에 대한 짧은 관찰과 시장 인사이트를 공유하세요."
                    : "Share a short collector insight about this bottle."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="text-3xl leading-none text-[#7b746a] transition hover:text-[#111111]"
                aria-label="Close collector note modal"
              >
                ×
              </button>
            </div>

            <div className="mt-6 border border-[#e7e1d8] bg-[#fbf8f2] p-4">
              <p className="text-sm font-bold text-[#111111]">
                {user
                  ? qualifiedNoteBottleId
                    ? language === "kr"
                      ? "아카이브 활동이 확인되었습니다"
                      : "Verified archive activity detected"
                    : language === "kr"
                      ? "작성 권한이 없습니다"
                      : "Collector activity required"
                  : language === "kr"
                    ? "로그인이 필요합니다"
                    : "Sign in required"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#7b746a]">
                {user
                  ? qualifiedNoteBottleId
                    ? language === "kr"
                      ? "이 바틀을 등록했거나 리스팅을 만든 컬렉터만 노트를 남길 수 있습니다."
                      : "Only collectors who registered this bottle or created a listing can leave notes."
                    : language === "kr"
                      ? "이 바틀에 등록 이력이 있는 컬렉터만 노트를 남길 수 있습니다."
                      : "Only collectors with archive activity can leave notes."
                  : language === "kr"
                    ? "컬렉터 노트를 작성하려면 먼저 로그인해주세요."
                    : "Please sign in before writing a collector note."}
              </p>
            </div>

            <div className="mt-6">
              <label className="mb-3 block text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#7b746a]">
                {language === "kr" ? "내 노트" : "Your note"}
              </label>
              <div className="relative">
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value.slice(0, 300))}
                  disabled={!user || !qualifiedNoteBottleId || noteSubmitting}
                  className="min-h-44 w-full resize-none border border-[#d8d2c8] bg-white px-4 py-4 pr-20 text-sm leading-7 text-[#111111] outline-none transition focus:border-[#111111] disabled:bg-[#f4f1ec] disabled:text-[#8f877d]"
                  placeholder={
                    language === "kr"
                      ? "릴리즈 차이, 라벨 변화, 시장 수요 같은 짧은 인사이트를 남겨주세요."
                      : "Share a short insight, release difference, label change, or market observation."
                  }
                />
                <span className="absolute bottom-4 right-4 text-xs font-bold text-[#8f877d]">
                  {noteDraft.length} / 300
                </span>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-3 text-xs font-bold text-[#7b746a]">
                {language === "kr" ? "좋은 노트 힌트" : "Tips for a helpful note"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(language === "kr"
                  ? ["릴리즈 차이", "시장 흐름", "라벨 / 패키징"]
                  : ["Release differences", "Market trend", "Label / Packaging"]
                ).map((tip) => (
                  <span key={tip} className="rounded-full bg-[#f0ece5] px-3 py-1.5 text-xs font-bold text-[#5f5145]">
                    {tip}
                  </span>
                ))}
              </div>
            </div>

            {noteMessage ? (
              <p className="mt-5 text-sm font-medium text-[#8d5b33]">{noteMessage}</p>
            ) : null}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="border border-[#d8d2c8] bg-white px-6 py-4 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#111111] transition hover:border-[#111111]"
              >
                {language === "kr" ? "취소" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={onCollectorNoteSubmit}
                disabled={!user || !qualifiedNoteBottleId || !noteDraft.trim() || noteDraft.length > 300 || noteSubmitting}
                className="bg-[#111111] px-6 py-4 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#c9c1b7]"
              >
                {noteSubmitting ? (language === "kr" ? "제출 중" : "Submitting") : language === "kr" ? "노트 제출" : "Submit note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteNoteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8">
          <div className="w-full max-w-md rounded-[1.25rem] bg-white p-6 shadow-2xl sm:p-7">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#8b5a34]">
              {language === "kr" ? "노트 삭제" : "Delete note"}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#111111]">
              {language === "kr" ? "이 노트를 삭제하시겠습니까?" : "Delete this collector note?"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#7b746a]">
              {language === "kr"
                ? "삭제하면 이 바틀 상세 페이지에서 바로 보이지 않게 됩니다."
                : "This will immediately remove the note from this bottle page."}
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeleteNoteId("")}
                disabled={noteUpdating}
                className="border border-[#d8d2c8] bg-white px-5 py-4 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#111111] transition hover:border-[#111111] disabled:opacity-50"
              >
                {language === "kr" ? "취소" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => onDeleteCollectorNote(deleteNoteId)}
                disabled={noteUpdating}
                className="bg-red-600 px-5 py-4 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {noteUpdating ? (language === "kr" ? "삭제 중" : "Deleting") : language === "kr" ? "삭제" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function BottlePage() {
  return (
    <Suspense fallback={<div className="panel p-6 text-sm text-ink/60">Loading bottle view...</div>}>
      <BottlePageContent />
    </Suspense>
  );
}
