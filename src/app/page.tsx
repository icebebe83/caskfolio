"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BottleMarketCard } from "@/components/bottle-market-card";
import { EmptyState } from "@/components/empty-state";
import { useLanguage } from "@/components/providers";
import { buildBottleEntries } from "@/lib/bottle-market";
import { CATEGORIES, matchesCategoryFilter } from "@/lib/constants";
import { bottleSearchText, toDate } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import { fetchAllListings, fetchBottles, fetchHomepageBanners } from "@/lib/data/store";
import { tCategory } from "@/lib/i18n";
import type { Bottle, HomepageBanner, Listing } from "@/lib/types";

const INITIAL_VISIBLE = 8;
const PAGE_SIZE = 8;
const MAX_VISIBLE = 24;
const LATEST_LISTINGS_VISIBLE = 10;

export default function HomePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState("");
  const [heroBanners, setHeroBanners] = useState<HomepageBanner[]>([]);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBackendConfigured) {
      setListings([]);
      setBottles([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const [listingDocs, bottleDocs, bannerDocs] = await Promise.all([
          fetchAllListings(200),
          fetchBottles(),
          fetchHomepageBanners(),
        ]);
        setListings(listingDocs);
        setBottles(bottleDocs);
        setHeroBanners(bannerDocs);
      } catch (nextError) {
        setListings([]);
        setBottles([]);
        setError(nextError instanceof Error ? nextError.message : "Unable to load data.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const bottleEntries = useMemo(
    () =>
      buildBottleEntries(listings, bottles, {
        preferListingThumbnail: true,
        fallbackToDefaultImage: true,
      }),
    [bottles, listings],
  );
  const bottleMap = useMemo(
    () => new Map(bottles.map((bottle) => [bottle.id, bottle])),
    [bottles],
  );
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bottleEntries.filter((entry) => {
      const matchesCategory = matchesCategoryFilter(entry.bottle.category, category);
      const matchesQuery = !query || bottleSearchText(entry.bottle).includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [bottleEntries, category, search]);

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return listings
      .filter((listing) => {
        const bottle = bottleMap.get(listing.bottleId);
        const matchesCategory = matchesCategoryFilter(listing.category, category);
        const matchesQuery =
          !query || (bottle ? bottleSearchText(bottle) : listing.bottleName.toLowerCase()).includes(query);
        return matchesCategory && matchesQuery;
      })
      .sort(
        (left, right) =>
          (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0),
      );
  }, [bottleMap, category, listings, search]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [category, search]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    if (visibleCount >= Math.min(filteredEntries.length, MAX_VISIBLE)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;

        setVisibleCount((current) =>
          Math.min(current + PAGE_SIZE, Math.min(filteredEntries.length, MAX_VISIBLE)),
        );
      },
      { rootMargin: "300px 0px" },
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [filteredEntries.length, visibleCount]);

  const visibleEntries = filteredEntries.slice(0, Math.min(visibleCount, MAX_VISIBLE));
  const hotEntries = filteredEntries.filter((entry) => entry.bottle.hotBottle).slice(0, 5);
  const latestEntries = filteredListings
    .map((listing) => {
      const bottle = bottleMap.get(listing.bottleId);
      if (!bottle) return null;
      return {
        id: listing.id,
        href: `/bottle?id=${bottle.id}`,
        imageUrl: filteredEntries.find((entry) => entry.bottle.id === bottle.id)?.imageUrl || "",
        name: bottle.name,
        priceUsd: listing.normalizedPriceUsd,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, LATEST_LISTINGS_VISIBLE);
  const showLoading = hasHydrated && loading;
  const canLoadMore = visibleEntries.length < Math.min(filteredEntries.length, MAX_VISIBLE);
  const defaultHero = {
    imageUrl: "",
    headline:
      language === "kr"
        ? "실제 바틀 시장 가격을 확인해보세요."
        : "Discover real bottle market prices.",
    subcopy:
      language === "kr"
        ? "수집가를 위한 가격 인덱스와 시장 아카이브를 한 곳에서 살펴보세요."
        : "Explore a collector-focused bottle price index and market archive in one place.",
    buttonLabel: language === "kr" ? "바틀 탐색" : "Explore Bottles",
    buttonLink: "/explore",
  };
  const activeBanners = heroBanners
    .filter((banner) => banner.isActive)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .slice(0, 10);

  useEffect(() => {
    if (activeBanners.length <= 1) {
      setActiveHeroIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setActiveHeroIndex((current) => (current + 1) % activeBanners.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [activeBanners.length]);

  useEffect(() => {
    if (!activeBanners.length) {
      setActiveHeroIndex(0);
      return;
    }

    if (activeHeroIndex >= activeBanners.length) {
      setActiveHeroIndex(0);
    }
  }, [activeBanners.length, activeHeroIndex]);

  const selectedBanner = activeBanners[activeHeroIndex] ?? null;
  const activeHero = selectedBanner
    ? {
        imageUrl: selectedBanner.imageUrl || defaultHero.imageUrl,
        headline: selectedBanner.headline || defaultHero.headline,
        subcopy: selectedBanner.subcopy || defaultHero.subcopy,
        buttonLabel: defaultHero.buttonLabel,
        buttonLink: defaultHero.buttonLink,
      }
    : defaultHero;

  return (
    <div className="space-y-0 bg-[#f9f9f7]">
      <section className="bg-white pb-16 pt-10 sm:pb-24 sm:pt-14">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-[#8d5b33]">
              {language === "kr" ? "세컨더리 증류주 아카이브" : "Secondary spirits archive"}
            </span>
            <h1 className="mt-5 w-full max-w-none text-[clamp(1.55rem,4.1vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.05em] text-[#222728] sm:whitespace-nowrap">
              {activeHero.headline}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#666159] sm:text-base">
              {activeHero.subcopy}
            </p>
            <div className="mt-6">
              <Link
                href={activeHero.buttonLink}
                className="inline-flex items-center bg-[#111111] px-6 py-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white transition-colors hover:bg-black sm:px-7 sm:py-3.5 sm:text-[12px]"
              >
                {activeHero.buttonLabel}
              </Link>
            </div>
            <div className="relative mt-8 w-full max-w-xl sm:mt-10 sm:max-w-2xl">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    router.push(`/explore${search ? `?q=${encodeURIComponent(search)}` : ""}`);
                  }
                }}
                className="w-full border-b border-[#d8d2c8] bg-transparent px-2 py-4 pr-12 text-base text-[#111111] outline-none transition-colors placeholder:text-[#9c958b] focus:border-[#111111] sm:px-3 sm:py-5 sm:pr-16 sm:text-lg"
                placeholder={
                  language === "kr"
                    ? "바틀, 브랜드, 배치 또는 별칭 검색"
                    : "Search bottle, brand, batch, or nickname"
                }
              />
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/explore${search ? `?q=${encodeURIComponent(search)}` : ""}`,
                  )
                }
                aria-label={language === "kr" ? "바틀 검색" : "Search bottles"}
                className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center text-[#6f6f68] transition-colors hover:text-[#111111] sm:right-2 sm:h-10 sm:w-10"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l5 5" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-12 gap-4 sm:mt-14 sm:gap-6 lg:gap-8">
            {activeHero.imageUrl ? (
              <div className="col-span-12">
                <div className="relative aspect-[2.1/1] overflow-hidden bg-[#f3f1eb]">
                  <img
                    src={activeHero.imageUrl}
                    alt="Homepage banner"
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white/18 to-transparent" />
                  {activeBanners.length > 1 ? (
                    <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 sm:bottom-5">
                      <div className="flex items-center gap-2 rounded-full bg-black/28 px-3 py-2 backdrop-blur-sm">
                        {activeBanners.map((banner, index) => {
                          const isActive = index === activeHeroIndex;
                          return (
                            <button
                              key={banner.id}
                              type="button"
                              onClick={() => setActiveHeroIndex(index)}
                              aria-label={
                                language === "kr"
                                  ? `${index + 1}번 배너로 이동`
                                  : `Go to banner ${index + 1}`
                              }
                              aria-pressed={isActive}
                              className={`h-1.5 rounded-full transition-all sm:h-2 ${
                                isActive
                                  ? "w-8 bg-white"
                                  : "w-4 bg-white/55 hover:bg-white/80"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-y border-[#ece8e0] bg-[#f9f9f7]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:py-8 lg:px-8">
          <div className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-7">
            {["All", ...CATEGORIES].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`border-b pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.22em] transition-colors sm:text-[11px] sm:tracking-[0.24em] ${
                  category === item
                    ? "border-[#111111] text-[#111111]"
                    : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]"
                }`}
              >
                {tCategory(language, item)}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f877d] sm:text-[11px] sm:tracking-[0.24em]">
            {language === "kr"
              ? `${Math.min(filteredEntries.length, MAX_VISIBLE)}개 바틀 표시 중`
              : `${Math.min(filteredEntries.length, MAX_VISIBLE)} visible bottles`}
          </p>
        </div>
      </section>

      <section className="bg-[#f3f4f2] py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          {!showLoading && !visibleEntries.length ? (
            <EmptyState
              title={
                error
                  ? language === "kr"
                    ? "바틀을 불러올 수 없습니다"
                    : "Unable to load bottles"
                  : language === "kr"
                    ? "등록된 바틀이 아직 없습니다"
                    : "No live bottles yet"
              }
              description={
                error
                  ? error
                  : language === "kr"
                    ? "실제로 등록된 바틀만 이곳에 표시됩니다."
                    : "Only bottles you have actually registered will appear here."
              }
            />
          ) : null}

          <div className="space-y-12 sm:space-y-14">
            {showLoading ? (
              <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
                {language === "kr" ? "바틀 아카이브를 불러오는 중입니다..." : "Loading the bottle archive..."}
              </div>
            ) : null}

            {!showLoading && hotEntries.length ? (
              <section className="space-y-4 sm:space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#8f877d]">
                    {language === "kr" ? "추천" : "Featured"}
                  </p>
                  <h2 className="text-[24px] font-bold tracking-[-0.04em] text-[#111111] sm:text-[28px] lg:text-[30px]">
                    {language === "kr" ? "핫 바틀" : "Hot Bottles"}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-4 lg:gap-y-8">
                  {hotEntries.map((entry) => (
                    <BottleMarketCard
                      key={`hot-${entry.bottle.id}`}
                      href={`/bottle?id=${entry.bottle.id}`}
                      imageUrl={entry.imageUrl}
                      name={entry.bottle.name}
                      priceUsd={entry.priceUsd}
                      listingCount={entry.listingCount}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {!showLoading && latestEntries.length ? (
              <section className="space-y-4 sm:space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#8f877d]">
                    {language === "kr" ? "아카이브" : "Archive"}
                  </p>
                  <h2 className="text-[24px] font-bold tracking-[-0.04em] text-[#111111] sm:text-[28px] lg:text-[30px]">
                    {language === "kr" ? "최신 등록" : "Latest Listings"}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-4 lg:gap-y-8">
                  {latestEntries.map((entry) => (
                    <BottleMarketCard
                      key={`latest-${entry.id}`}
                      href={entry.href}
                      imageUrl={entry.imageUrl}
                      name={entry.name}
                      priceUsd={entry.priceUsd}
                      listingCount={1}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {canLoadMore ? (
            <div ref={sentinelRef} className="mt-12 flex justify-center sm:mt-16">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((current) =>
                    Math.min(current + PAGE_SIZE, Math.min(filteredEntries.length, MAX_VISIBLE)),
                  )
                }
                className="border-b border-[#8f877d] pb-2 text-[12px] font-extrabold uppercase tracking-[0.28em] text-[#111111] transition-colors hover:border-[#111111]"
              >
                {language === "kr" ? "바틀 더 보기" : "Load more bottles"}
              </button>
            </div>
          ) : (
            <div ref={sentinelRef} />
          )}
        </div>
      </section>

      <footer className="border-t border-[#ece8e0] bg-white py-20">
        <div className="mx-auto max-w-[1440px] px-5 sm:px-8">
          <div className="grid gap-14 md:grid-cols-[1.6fr_0.9fr_0.9fr]">
            <div>
              <p className="text-[2rem] font-black tracking-[-0.05em] text-[#111111]">Caskfolio</p>
              <p className="mt-6 max-w-sm text-sm leading-8 text-[#7b746a]">
                {language === "kr"
                  ? "수집가를 위한 바틀 가격 인덱스이자 시장 아카이브입니다."
                  : "A collector-focused bottle price index and archive for market-tracked spirits."}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.26em] text-[#8f877d]">
                {language === "kr" ? "메뉴" : "Navigation"}
              </p>
              <div className="mt-6 flex flex-col gap-5 text-sm text-[#111111]">
                <Link href="/" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "마켓" : "Market"}
                </Link>
                <Link href="/explore" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "바틀" : "Bottles"}
                </Link>
                <Link href="/submit" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "등록" : "Register"}
                </Link>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.26em] text-[#8f877d]">
                {language === "kr" ? "정책" : "Legal"}
              </p>
              <div className="mt-6 flex flex-col gap-5 text-sm text-[#111111]">
                <Link href="/privacy-policy" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "개인정보처리방침" : "Privacy Policy"}
                </Link>
                <Link href="/terms-of-service" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "이용약관" : "Terms of Service"}
                </Link>
                <Link href="/listing-policy" className="hover:text-[#8d5b33]">
                  {language === "kr" ? "등록 정책" : "Listing Policy"}
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-16 flex flex-col gap-5 border-t border-[#ece8e0] pt-8 text-[10px] font-medium uppercase tracking-[0.2em] text-[#8f877d] md:flex-row md:items-center md:justify-between">
            <span>{language === "kr" ? "© 2026 Caskfolio. 모든 권리 보유." : "© 2026 Caskfolio. All rights reserved."}</span>
            <div className="flex items-center gap-5">
              <span>{language === "kr" ? "아카이브" : "Archive"}</span>
              <span>{language === "kr" ? "인덱스" : "Index"}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
