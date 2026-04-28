"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { BottleMarketCard } from "@/components/bottle-market-card";
import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/listing-card";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { useAuth, useLanguage } from "@/components/providers";
import { getBottleImageForSurface, getListingImageForSurface } from "@/lib/media/images";
import { resolveUsdKrwRate } from "@/lib/fx";
import { formatCategoryLabel, formatKrw, formatListingStatus, formatUsd, median, toDate } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import {
  fetchAllListings,
  fetchBottleById,
  fetchBottleReferencePrice,
  fetchBottles,
  fetchListingsForBottle,
  fetchWishlistBottleIds,
  setBottleWishlist,
} from "@/lib/data/store";
import { formatUiDate, tStatus } from "@/lib/i18n";
import type { Bottle, BottleReferencePrice, Listing } from "@/lib/types";

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
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [allBottles, setAllBottles] = useState<Bottle[]>([]);
  const [referencePrice, setReferencePrice] = useState<BottleReferencePrice | null>(null);
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
      setAllListings([]);
      setAllBottles([]);
      setReferencePrice(null);
      setFxRate(0);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [bottleDoc, listingDocs, fxState, bottleDocs, allListingDocs, referenceDoc] = await Promise.all([
          fetchBottleById(bottleId),
          fetchListingsForBottle(bottleId),
          resolveUsdKrwRate(),
          fetchBottles(),
          fetchAllListings(200),
          fetchBottleReferencePrice(bottleId),
        ]);
        setBottle(bottleDoc);
        setAllBottles(bottleDocs);
        setAllListings(allListingDocs);
        setListings(listingDocs);
        setReferencePrice(referenceDoc);
        setFxRate(fxState.rate);
      } catch (nextError) {
        setBottle(null);
        setListings([]);
        setAllListings([]);
        setAllBottles([]);
        setReferencePrice(null);
        setFxRate(0);
        setError(nextError instanceof Error ? nextError.message : "Unable to load bottle.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [bottleId]);

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
  const relatedBottles = allBottles
    .filter((item) => item.id !== bottle?.id && item.category === bottle?.category)
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
