"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BottleMarketCard } from "@/components/bottle-market-card";
import { EmptyState } from "@/components/empty-state";
import { type BottleMarketEntry, buildBottleEntries } from "@/lib/bottle-market";
import { CATEGORIES, matchesCategoryFilter } from "@/lib/constants";
import { isBackendConfigured } from "@/lib/backend/client";
import {
  fetchAllListings,
  fetchBottles,
  fetchBottlesPage,
  fetchListingsForBottleIds,
} from "@/lib/data/store";
import { bottleSearchText, toDate } from "@/lib/format";
import type { Bottle, Listing } from "@/lib/types";
import { useLanguage } from "@/components/providers";

const EXPLORE_BOTTLES_STATE_KEY = "caskfolio.explore.bottles.state";

type ExploreBottlesViewState = {
  route: string;
  queryDraft: string;
  bottleSort: "latest" | "price-asc" | "price-desc" | "most-listings";
  priceFilter: "all" | "under-100" | "100-500" | "500-plus";
  visibleBottleCount: number;
  scrollY: number;
};

function ExplorePageContent() {
  const BOTTLE_PAGE_SIZE = 15;
  const router = useRouter();
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const searchCategory = searchParams.get("category") ?? "All";
  const searchCondition = searchParams.get("condition") ?? "All";
  const searchRegion = searchParams.get("region") ?? "All";
  const searchStatus = searchParams.get("status") ?? "All";
  const searchSort = searchParams.get("sort") ?? "latest";
  const isSearchView = searchParams.get("view") === "search";
  const [queryDraft, setQueryDraft] = useState(searchQuery);
  const [debouncedBottleQuery, setDebouncedBottleQuery] = useState(searchQuery);
  const [bottleSort, setBottleSort] = useState<"latest" | "price-asc" | "price-desc" | "most-listings">("latest");
  const [priceFilter, setPriceFilter] = useState<"all" | "under-100" | "100-500" | "500-plus">("all");
  const [listings, setListings] = useState<Listing[]>([]);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState("");
  const [visibleBottleCount, setVisibleBottleCount] = useState(BOTTLE_PAGE_SIZE);
  const [pagedBottleEntries, setPagedBottleEntries] = useState<BottleMarketEntry[]>([]);
  const [totalBottleCount, setTotalBottleCount] = useState(0);
  const [nextBottleOffset, setNextBottleOffset] = useState(0);
  const [hasMoreBottlePages, setHasMoreBottlePages] = useState(false);
  const [loadingMoreBottlePages, setLoadingMoreBottlePages] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const nonSearchPagingKey = useRef(0);
  const restoreScrollYRef = useRef<number | null>(null);
  const pendingRestoreStateRef = useRef<ExploreBottlesViewState | null>(null);
  const hasRestoredScrollRef = useRef(false);
  const canPersistViewStateRef = useRef(false);
  const hasInitializedVisibleCountRef = useRef(false);

  const persistBottlesViewState = useCallback(
    (overrides?: Partial<ExploreBottlesViewState>) => {
      if (typeof window === "undefined" || isSearchView || !canPersistViewStateRef.current) return;
      if (restoreScrollYRef.current !== null && !hasRestoredScrollRef.current) return;

      const nextState: ExploreBottlesViewState = {
        route: "/explore",
        queryDraft,
        bottleSort,
        priceFilter,
        visibleBottleCount,
        scrollY: window.scrollY,
        ...overrides,
      };
      window.sessionStorage.setItem(EXPLORE_BOTTLES_STATE_KEY, JSON.stringify(nextState));
    },
    [bottleSort, isSearchView, priceFilter, queryDraft, visibleBottleCount],
  );

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || isSearchView) return;

    canPersistViewStateRef.current = false;
    pendingRestoreStateRef.current = null;
    const rawState = window.sessionStorage.getItem(EXPLORE_BOTTLES_STATE_KEY);
    if (!rawState) {
      window.requestAnimationFrame(() => {
        canPersistViewStateRef.current = true;
      });
      return;
    }

    try {
      const parsed = JSON.parse(rawState) as Partial<ExploreBottlesViewState>;
      if (parsed.route !== "/explore") {
        return;
      }
      const normalizedState: ExploreBottlesViewState = {
        route: "/explore",
        queryDraft: typeof parsed.queryDraft === "string" ? parsed.queryDraft : "",
        bottleSort:
          parsed.bottleSort === "price-asc" ||
          parsed.bottleSort === "price-desc" ||
          parsed.bottleSort === "most-listings"
            ? parsed.bottleSort
            : "latest",
        priceFilter:
          parsed.priceFilter === "under-100" ||
          parsed.priceFilter === "100-500" ||
          parsed.priceFilter === "500-plus"
            ? parsed.priceFilter
            : "all",
        visibleBottleCount:
          typeof parsed.visibleBottleCount === "number" && Number.isFinite(parsed.visibleBottleCount)
            ? Math.max(BOTTLE_PAGE_SIZE, parsed.visibleBottleCount)
            : BOTTLE_PAGE_SIZE,
        scrollY:
          typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
            ? Math.max(0, parsed.scrollY)
            : 0,
      };
      pendingRestoreStateRef.current = normalizedState;

      setQueryDraft(normalizedState.queryDraft);
      setDebouncedBottleQuery(normalizedState.queryDraft);
      setBottleSort(normalizedState.bottleSort);
      setPriceFilter(normalizedState.priceFilter);
      setVisibleBottleCount(normalizedState.visibleBottleCount);
      restoreScrollYRef.current = normalizedState.scrollY;
      hasRestoredScrollRef.current = false;
    } catch {
      // Ignore malformed session state and fall back to the default view.
    } finally {
      if (!pendingRestoreStateRef.current) {
        window.requestAnimationFrame(() => {
          canPersistViewStateRef.current = true;
        });
      }
    }
  }, [BOTTLE_PAGE_SIZE, isSearchView]);

  useEffect(() => {
    setQueryDraft(searchQuery);
    setDebouncedBottleQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (isSearchView) return;
    const timeout = window.setTimeout(() => {
      setDebouncedBottleQuery(queryDraft.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isSearchView, queryDraft]);

  useEffect(() => {
    if (!isBackendConfigured) {
      setListings([]);
      setBottles([]);
      setPagedBottleEntries([]);
      setTotalBottleCount(0);
      setNextBottleOffset(0);
      setHasMoreBottlePages(false);
      setLoading(false);
      return;
    }

    if (!isSearchView) {
      setListings([]);
      setBottles([]);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [listingDocs, bottleDocs] = await Promise.all([
          fetchAllListings(200),
          fetchBottles(),
        ]);
        setListings(listingDocs);
        setBottles(bottleDocs);
      } catch (nextError) {
        setListings([]);
        setBottles([]);
        setError(nextError instanceof Error ? nextError.message : "Unable to load listings.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isSearchView]);

  const pushSearchParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    params.set("view", "search");

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === "All") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const nextQuery = params.toString();
    router.push(`/explore${nextQuery ? `?${nextQuery}` : ""}`);
  };

  const conditionOptions = useMemo(
    () =>
      [...new Set(listings.map((listing) => listing.condition.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [listings],
  );
  const regionOptions = useMemo(
    () =>
      [...new Set(listings.map((listing) => listing.region.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [listings],
  );

  const filteredListings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return listings
      .filter((listing) => {
        const bottle = bottles.find((item) => item.id === listing.bottleId);
        const matchesCategory = matchesCategoryFilter(listing.category, searchCategory);
        const matchesCondition = searchCondition === "All" || listing.condition === searchCondition;
        const matchesRegion = searchRegion === "All" || listing.region === searchRegion;
        const matchesStatus =
          searchStatus === "All" || listing.status === searchStatus;
        const matchesQuery =
          !query ||
          (bottle ? bottleSearchText(bottle) : listing.bottleName.toLowerCase()).includes(query);

        return (
          matchesCategory &&
          matchesCondition &&
          matchesRegion &&
          matchesStatus &&
          matchesQuery
        );
      })
      .sort((left, right) => {
        if (searchSort === "lowest") {
          return left.normalizedPriceUsd - right.normalizedPriceUsd;
        }

        return (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0);
      });
  }, [
    bottles,
    listings,
    searchCategory,
    searchCondition,
    searchQuery,
    searchRegion,
    searchSort,
    searchStatus,
  ]);

  const bottleEntries = useMemo(
    () => buildBottleEntries(filteredListings, bottles),
    [bottles, filteredListings],
  );
  const filteredBottleEntries = useMemo(() => {
    const query = debouncedBottleQuery.trim().toLowerCase();

    const sourceEntries = isSearchView ? bottleEntries : pagedBottleEntries;

    return sourceEntries
      .filter((entry) => {
        const matchesCategory = matchesCategoryFilter(entry.bottle.category, searchCategory);
        const matchesQuery =
          !query ||
          entry.bottle.name.toLowerCase().includes(query) ||
          entry.bottle.brand.toLowerCase().includes(query);
        const matchesPrice =
          priceFilter === "all" ||
          (priceFilter === "under-100" && entry.priceUsd < 100) ||
          (priceFilter === "100-500" && entry.priceUsd >= 100 && entry.priceUsd <= 500) ||
          (priceFilter === "500-plus" && entry.priceUsd > 500);

        return matchesCategory && matchesQuery && matchesPrice;
      })
      .sort((left, right) => {
        if (bottleSort === "price-asc") {
          return left.priceUsd - right.priceUsd;
        }
        if (bottleSort === "price-desc") {
          return right.priceUsd - left.priceUsd;
        }
        if (bottleSort === "most-listings") {
          if (right.listingCount !== left.listingCount) {
            return right.listingCount - left.listingCount;
          }
          return right.latestAt - left.latestAt;
        }
        return right.latestAt - left.latestAt;
      });
  }, [
    bottleEntries,
    bottleSort,
    debouncedBottleQuery,
    isSearchView,
    pagedBottleEntries,
    priceFilter,
    searchCategory,
  ]);
  const activeBottleEntries = isSearchView ? bottleEntries : filteredBottleEntries;
  const visibleBottleEntries = useMemo(
    () => activeBottleEntries.slice(0, visibleBottleCount),
    [activeBottleEntries, visibleBottleCount],
  );
  const showLoading = hasHydrated && loading;

  const loadNextBottlePage = useCallback(async () => {
    if (isSearchView || loading || loadingMoreBottlePages || !hasMoreBottlePages) return;

    const requestKey = nonSearchPagingKey.current;
    setLoadingMoreBottlePages(true);
    try {
      const { bottles: pageBottles, total } = await fetchBottlesPage({
        offset: nextBottleOffset,
        limit: BOTTLE_PAGE_SIZE,
        category: searchCategory,
        query: debouncedBottleQuery,
      });
      if (nonSearchPagingKey.current !== requestKey) return;

      const pageListings = await fetchListingsForBottleIds(pageBottles.map((bottle) => bottle.id));
      if (nonSearchPagingKey.current !== requestKey) return;

      const nextEntries = buildBottleEntries(pageListings, pageBottles);
      const loadedCount = nextBottleOffset + pageBottles.length;
      setPagedBottleEntries((current) => {
        const seen = new Set(current.map((entry) => entry.bottle.id));
        const uniqueAdditions = nextEntries.filter((entry) => !seen.has(entry.bottle.id));
        return [...current, ...uniqueAdditions];
      });
      setTotalBottleCount(total);
      setNextBottleOffset(loadedCount);
      setHasMoreBottlePages(loadedCount < total);
    } catch (nextError) {
      if (nonSearchPagingKey.current !== requestKey) return;
      setError(nextError instanceof Error ? nextError.message : "Unable to load more bottles.");
      setHasMoreBottlePages(false);
    } finally {
      if (nonSearchPagingKey.current === requestKey) {
        setLoadingMoreBottlePages(false);
      }
    }
  }, [
    BOTTLE_PAGE_SIZE,
    debouncedBottleQuery,
    hasMoreBottlePages,
    isSearchView,
    loading,
    loadingMoreBottlePages,
    nextBottleOffset,
    searchCategory,
  ]);

  useEffect(() => {
    if (!isBackendConfigured || isSearchView) return;

    const requestKey = nonSearchPagingKey.current + 1;
    nonSearchPagingKey.current = requestKey;
    setLoading(true);
    setError("");
    setPagedBottleEntries([]);
    setTotalBottleCount(0);
    setNextBottleOffset(0);
    setHasMoreBottlePages(false);
    setLoadingMoreBottlePages(false);

    const loadFirstPage = async () => {
      try {
        const { bottles: pageBottles, total } = await fetchBottlesPage({
          offset: 0,
          limit: BOTTLE_PAGE_SIZE,
          category: searchCategory,
          query: debouncedBottleQuery,
        });
        if (nonSearchPagingKey.current !== requestKey) return;

        const pageListings = await fetchListingsForBottleIds(pageBottles.map((bottle) => bottle.id));
        if (nonSearchPagingKey.current !== requestKey) return;

        const nextEntries = buildBottleEntries(pageListings, pageBottles);
        setPagedBottleEntries(nextEntries);
        setTotalBottleCount(total);
        setNextBottleOffset(pageBottles.length);
        setHasMoreBottlePages(pageBottles.length < total);
      } catch (nextError) {
        if (nonSearchPagingKey.current !== requestKey) return;
        setPagedBottleEntries([]);
        setTotalBottleCount(0);
        setNextBottleOffset(0);
        setHasMoreBottlePages(false);
        setError(nextError instanceof Error ? nextError.message : "Unable to load bottles.");
      } finally {
        if (nonSearchPagingKey.current === requestKey) {
          setLoading(false);
        }
      }
    };

    void loadFirstPage();
  }, [BOTTLE_PAGE_SIZE, debouncedBottleQuery, isBackendConfigured, isSearchView, searchCategory]);

  useEffect(() => {
    if (isSearchView || !hasMoreBottlePages || loading || loadingMoreBottlePages) return;
    if (filteredBottleEntries.length >= visibleBottleCount) return;

    void loadNextBottlePage();
  }, [
    filteredBottleEntries.length,
    hasMoreBottlePages,
    isSearchView,
    loading,
    loadingMoreBottlePages,
    loadNextBottlePage,
    visibleBottleCount,
  ]);

  useEffect(() => {
    if (!hasInitializedVisibleCountRef.current) {
      hasInitializedVisibleCountRef.current = true;
      return;
    }
    setVisibleBottleCount(BOTTLE_PAGE_SIZE);
    hasRestoredScrollRef.current = false;
  }, [
    BOTTLE_PAGE_SIZE,
    bottleSort,
    debouncedBottleQuery,
    isSearchView,
    priceFilter,
    searchCategory,
    searchCondition,
    searchQuery,
    searchRegion,
    searchSort,
    searchStatus,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || isSearchView) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        persistBottlesViewState();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", onScroll);
    };
  }, [isSearchView, persistBottlesViewState]);

  useEffect(() => {
    if (typeof window === "undefined" || isSearchView) return;
    persistBottlesViewState();
  }, [bottleSort, isSearchView, persistBottlesViewState, priceFilter, queryDraft, visibleBottleCount]);

  useEffect(() => {
    if (isSearchView || showLoading || hasRestoredScrollRef.current) return;
    if (restoreScrollYRef.current === null) return;
    if (activeBottleEntries.length < visibleBottleCount && hasMoreBottlePages) return;

    const restoreState = pendingRestoreStateRef.current;
    const nextScrollY = restoreState?.scrollY ?? restoreScrollYRef.current;
    const timeouts = [0, 80, 180, 350, 700, 1200].map((delay) =>
      window.setTimeout(() => {
        window.scrollTo({ top: nextScrollY, left: 0, behavior: "auto" });
      }, delay),
    );

    const finalizeTimeout = window.setTimeout(() => {
      hasRestoredScrollRef.current = true;
      canPersistViewStateRef.current = true;
      if (restoreState) {
        window.sessionStorage.setItem(
          EXPLORE_BOTTLES_STATE_KEY,
          JSON.stringify({ ...restoreState, route: "/explore" }),
        );
        pendingRestoreStateRef.current = null;
      } else {
        persistBottlesViewState({ scrollY: nextScrollY });
      }
    }, 1350);

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.clearTimeout(finalizeTimeout);
    };
  }, [
    activeBottleEntries.length,
    hasMoreBottlePages,
    isSearchView,
    persistBottlesViewState,
    showLoading,
    visibleBottleCount,
  ]);

  const handleBottleNavigate = useCallback(() => {
    persistBottlesViewState({
      route: "/explore",
      scrollY: typeof window === "undefined" ? 0 : window.scrollY,
      visibleBottleCount,
    });
  }, [persistBottlesViewState, visibleBottleCount]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    if (showLoading) return;
    if (visibleBottleCount >= activeBottleEntries.length && (isSearchView || !hasMoreBottlePages)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;

        if (visibleBottleCount < activeBottleEntries.length) {
          setVisibleBottleCount((current) =>
            Math.min(activeBottleEntries.length, current + BOTTLE_PAGE_SIZE),
          );
          return;
        }

        if (!isSearchView && hasMoreBottlePages && !loadingMoreBottlePages) {
          void loadNextBottlePage();
        }
      },
      {
        rootMargin: "320px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    BOTTLE_PAGE_SIZE,
    activeBottleEntries.length,
    hasMoreBottlePages,
    isSearchView,
    loadNextBottlePage,
    loadingMoreBottlePages,
    showLoading,
    visibleBottleCount,
  ]);

  return (
    <div className="space-y-6">
      {isSearchView ? (
        <section className="panel p-4 sm:p-5 lg:p-6">
          <p className="eyebrow">Bottle archive</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#111111] sm:text-4xl">
            Search by bottle, photo, and price
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#666159]">
            Clean archive view for historical asks and active listings. Search matches bottle names,
            brands, batches, and saved aliases.
          </p>

          <div className="mt-6">
            <input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  pushSearchParams({ q: queryDraft.trim() || null });
                }
              }}
              className="field w-full"
              placeholder="Search bottle, brand, batch, or nickname"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5 lg:gap-3">
            <select
              value={searchCategory}
              onChange={(event) => pushSearchParams({ category: event.target.value })}
              className="field"
            >
              <option value="All">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={searchCondition}
              onChange={(event) => pushSearchParams({ condition: event.target.value })}
              className="field"
            >
              <option value="All">All conditions</option>
              {conditionOptions.map((condition) => (
                <option key={condition} value={condition}>
                  {condition}
                </option>
              ))}
            </select>
            <select
              value={searchRegion}
              onChange={(event) => pushSearchParams({ region: event.target.value })}
              className="field"
            >
              <option value="All">All regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <select
              value={searchStatus}
              onChange={(event) => pushSearchParams({ status: event.target.value })}
              className="field"
            >
              <option value="All">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              onClick={() => pushSearchParams({ q: queryDraft.trim() || null })}
              className="button-primary col-span-2 justify-center disabled:opacity-60 md:col-span-3 lg:col-span-1"
            >
              Search archive
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#666159]">
              {showLoading
                ? "Loading bottles..."
                : `${bottleEntries.length} bottle${bottleEntries.length === 1 ? "" : "s"} matched your filters.`}
            </p>
            <select
              value={searchSort}
              onChange={(event) => pushSearchParams({ sort: event.target.value })}
              className="field w-full rounded-full px-4 py-2 sm:w-auto"
            >
              <option value="latest">Latest first</option>
              <option value="lowest">Lowest price</option>
            </select>
          </div>
        </section>
      ) : null}

      {!isSearchView ? (
        <section className="space-y-4 rounded-2xl border border-[#e4dfd6] bg-white p-4 sm:p-5">
          <div className="space-y-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#8f877d]">
              {language === "kr" ? "가격 인덱스" : "Price index"}
            </p>
            <p className="text-sm leading-6 text-[#666159]">
              {language === "kr"
                ? "라이브 바틀 가격 인덱스입니다. 이름과 브랜드로 검색하고, 가격대와 등록 수 기준으로 정렬할 수 있습니다."
                : "Live Bottle Price Index. Search by bottle name or brand, then sort by price or listing depth."}
            </p>
          </div>

          <div className="grid gap-2.5 md:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.7fr)_minmax(160px,0.6fr)]">
            <input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              className="field w-full"
              placeholder="Search bottle, brand, or keyword"
            />
            <select
              value={bottleSort}
              onChange={(event) =>
                setBottleSort(
                  event.target.value as "latest" | "price-asc" | "price-desc" | "most-listings",
                )
              }
              className="field w-full"
            >
              <option value="latest">Latest</option>
              <option value="price-asc">Price (Low → High)</option>
              <option value="price-desc">Price (High → Low)</option>
              <option value="most-listings">Most Listings</option>
            </select>
            <select
              value={priceFilter}
              onChange={(event) =>
                setPriceFilter(
                  event.target.value as "all" | "under-100" | "100-500" | "500-plus",
                )
              }
              className="field w-full"
            >
              <option value="all">All prices</option>
              <option value="under-100">Under $100</option>
              <option value="100-500">$100 – $500</option>
              <option value="500-plus">$500+</option>
            </select>
          </div>

          <p className="text-sm text-[#666159]">
            {language === "kr"
              ? showLoading
                ? "검색 결과를 불러오는 중입니다..."
                : hasMoreBottlePages
                ? `${filteredBottleEntries.length}개 로드됨 · 기본 후보 ${totalBottleCount}개`
                : `${filteredBottleEntries.length}개의 바틀이 현재 필터에 일치합니다.`
              : showLoading
                ? "Loading matching bottles..."
                : hasMoreBottlePages
                ? `${filteredBottleEntries.length} loaded · ${totalBottleCount} base bottle${totalBottleCount === 1 ? "" : "s"} available`
                : `${filteredBottleEntries.length} bottle${filteredBottleEntries.length === 1 ? "" : "s"} matched the current filters.`}
          </p>
        </section>
      ) : null}

      {!showLoading && !activeBottleEntries.length ? (
        <EmptyState
          title={error ? "Unable to load bottles" : "No live bottles matched"}
          description={error ? error : "Only bottles from your real archive will appear here."}
        />
      ) : null}

      {showLoading ? (
        <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
          {language === "kr" ? "바틀 아카이브를 불러오는 중입니다..." : "Loading the bottle archive..."}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-5 lg:gap-x-4 lg:gap-y-8">
        {visibleBottleEntries.map((entry) => (
          <BottleMarketCard
            key={entry.bottle.id}
            href={`/bottle?id=${entry.bottle.id}`}
            imageUrl={entry.imageUrl}
            name={entry.bottle.name}
            priceUsd={entry.priceUsd}
            listingCount={entry.listingCount}
            onNavigate={handleBottleNavigate}
          />
        ))}
      </div>

      {!showLoading &&
      (visibleBottleEntries.length < activeBottleEntries.length || (!isSearchView && hasMoreBottlePages)) ? (
        <>
          <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />
          <p className="text-center text-xs uppercase tracking-[0.2em] text-[#8f877d]">
            {language === "kr"
              ? `${visibleBottleEntries.length.toLocaleString("ko-KR")} / ${activeBottleEntries.length.toLocaleString("ko-KR")} 바틀 표시됨`
              : `${visibleBottleEntries.length.toLocaleString("en-US")} / ${activeBottleEntries.length.toLocaleString("en-US")} bottles shown`}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="panel p-6 text-sm text-ink/60">Loading explore view...</div>}>
      <ExplorePageContent />
    </Suspense>
  );
}
