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
import {
  fetchAllListings,
  fetchBottleReferencePrices,
  fetchBottles,
  fetchCurrentProfileDisplayName,
  fetchCurrentUserCollectorNotes,
  fetchWishlistBottles,
  signOutUser,
  updateCurrentProfileDisplayName,
} from "@/lib/data/store";
import type { Bottle, BottleReferencePrice, CollectorNote, Listing, WishlistBottle } from "@/lib/types";

const MY_COLLECTION_PAGE_SIZE = 8;
type MyPageSection = "overview" | "collection" | "watchlist" | "notes" | "settings";
type AccountSettingsTab = "profile" | "security" | "notifications";

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
  const [bottleReferences, setBottleReferences] = useState<BottleReferencePrice[]>([]);
  const [collectorNotes, setCollectorNotes] = useState<CollectorNote[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [wishlistEntries, setWishlistEntries] = useState<WishlistBottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState("");
  const [collectionPage, setCollectionPage] = useState(1);
  const [activeSection, setActiveSection] = useState<MyPageSection>("overview");
  const [accountTab, setAccountTab] = useState<AccountSettingsTab>("profile");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

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
        const [allListings, allBottles, referencePrices, wishlist, notes, profileDisplayName] = await Promise.all([
          fetchAllListings(500),
          fetchBottles(),
          fetchBottleReferencePrices(),
          fetchWishlistBottles(),
          fetchCurrentUserCollectorNotes(),
          fetchCurrentProfileDisplayName(),
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
        setBottleReferences(referencePrices);
        setWishlistEntries(wishlist);
        setCollectorNotes(notes);
        setDisplayNameInput(
          profileDisplayName ||
            user.displayName ||
            [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
            user.email.split("@")[0] ||
            "",
        );
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

  const bottleReferenceMap = useMemo(() => {
    const referenceMap = new Map<string, BottleReferencePrice>();
    bottleReferences.forEach((reference) => {
      if (!referenceMap.has(reference.bottleId)) {
        referenceMap.set(reference.bottleId, reference);
      }
    });
    return referenceMap;
  }, [bottleReferences]);

  const bottleNameById = useMemo(() => {
    return new Map(bottles.map((bottle) => [bottle.id, bottle.name]));
  }, [bottles]);

  useEffect(() => {
    setCollectionPage((current) => Math.min(Math.max(1, current), collectionPageCount));
  }, [collectionPageCount]);

  const totalPortfolioValueUsd = collectionEntries.reduce(
    (sum, entry) => sum + entry.totalBottleValueUsd,
    0,
  );
  const portfolioReferenceSummary = useMemo(() => {
    return listings.reduce(
      (sum, listing) => {
        const reference = bottleReferenceMap.get(listing.bottleId);
        const quantity = Math.max(listing.quantity || 1, 1);
        const listedValueUsd = listing.normalizedPriceUsd * quantity;
        const referenceValueUsd = (reference?.referencePriceUsd ?? 0) * quantity;

        sum.referenceValueUsd += referenceValueUsd;
        sum.gainValueUsd += listedValueUsd - referenceValueUsd;
        return sum;
      },
      { referenceValueUsd: 0, gainValueUsd: 0 },
    );
  }, [bottleReferenceMap, listings]);
  const activeListingCount = listings.filter((listing) => listing.status === "active").length;
  const featuredEntry = collectionEntries[0] ?? null;
  const recentEntries = collectionEntries.slice(1, 4);

  const onSaveDisplayName = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileMessage("");

    try {
      const savedDisplayName = await updateCurrentProfileDisplayName(displayNameInput);
      setDisplayNameInput(savedDisplayName);
      setProfileMessage(language === "kr" ? "닉네임을 저장했습니다." : "Nickname saved.");
    } catch (nextError) {
      const message =
        nextError instanceof Error && nextError.message === "nickname-taken"
          ? language === "kr"
            ? "이미 사용 중인 닉네임입니다."
            : "This nickname is already taken."
          : nextError instanceof Error
            ? nextError.message
            : language === "kr"
              ? "닉네임을 저장할 수 없습니다."
              : "Unable to save nickname.";
      setProfileMessage(
        message,
      );
    } finally {
      setProfileSaving(false);
    }
  };

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

  const navItems: Array<{ id: MyPageSection; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "collection", label: "My Collection" },
    { id: "watchlist", label: "Watchlist" },
    { id: "notes", label: "Collector Notes" },
    { id: "settings", label: "Account Settings" },
  ];
  const sectionTitle = navItems.find((item) => item.id === activeSection)?.label ?? "Overview";
  const activeListings = listings.filter((listing) => listing.status === "active");

  const selectSection = (section: MyPageSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  const onLogout = () => {
    void signOutUser()
      .then(() => {
        window.location.assign("/");
      })
      .catch(() => undefined);
  };

  const sidebar = (
    <aside className="flex h-full flex-col justify-between">
      <div>
        <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">
          {language === "kr" ? "마이페이지" : "My Page"}
        </p>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`flex w-full items-center justify-between rounded-full px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] transition ${
                activeSection === item.id
                  ? "bg-[#111111] text-white"
                  : "text-[#7a746b] hover:bg-[#f4f1eb] hover:text-[#111111]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-10 border-t border-[#e9e4da] pt-5">
        <button
          type="button"
          onClick={onLogout}
          className="w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.16em] text-[#9a9287] transition hover:text-[#111111]"
        >
          Logout
        </button>
      </div>
    </aside>
  );

  const portfolioSummary = (
    <div className="grid gap-6 border-y border-[#e9e4da] py-7 sm:grid-cols-3">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
          {language === "kr" ? "포트폴리오 가치" : "Portfolio value"}
        </p>
        <p className="text-4xl font-black tracking-[-0.04em] text-[#111111]">
          {formatUsd(totalPortfolioValueUsd)}
        </p>
        <div className="mt-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a746b]">
            {language === "kr"
              ? `글로벌 기준 총액 ${formatUsd(portfolioReferenceSummary.referenceValueUsd)}`
              : `Global ref total ${formatUsd(portfolioReferenceSummary.referenceValueUsd)}`}
          </p>
          <p
            className={`text-xs font-extrabold uppercase tracking-[0.14em] ${
              portfolioReferenceSummary.gainValueUsd >= 0 ? "text-red-600" : "text-blue-600"
            }`}
          >
            {portfolioReferenceSummary.gainValueUsd >= 0 ? "▲" : "▼"}{" "}
            {portfolioReferenceSummary.gainValueUsd >= 0 ? "+" : "-"}
            {formatUsd(Math.abs(portfolioReferenceSummary.gainValueUsd))}{" "}
            <span className="text-[#7a746b]">
              {portfolioReferenceSummary.gainValueUsd >= 0
                ? language === "kr"
                  ? "평가 이익"
                  : "estimated gain"
                : language === "kr"
                  ? "평가 손실"
                  : "estimated loss"}
            </span>
          </p>
        </div>
      </div>
      <div className="border-[#e9e4da] sm:border-l sm:pl-8">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
          {language === "kr" ? "업로드한 바틀" : "Uploaded bottles"}
        </p>
        <p className="text-4xl font-black tracking-[-0.04em] text-[#111111]">{collectionEntries.length}</p>
      </div>
      <div className="border-[#e9e4da] sm:border-l sm:pl-8">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
          {language === "kr" ? "활성 등록" : "Active listings"}
        </p>
        <p className="text-4xl font-black tracking-[-0.04em] text-[#111111]">{activeListingCount}</p>
      </div>
    </div>
  );

  const collectionGrid = (
    <div className="space-y-8">
      {!loading && !collectionEntries.length ? (
        <EmptyState
          title={
            error
              ? language === "kr"
                ? "컬렉션을 불러올 수 없습니다"
                : "Unable to load your collection"
              : language === "kr"
                ? "업로드한 바틀이 아직 없습니다"
                : "No uploaded bottles yet"
          }
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

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
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
              <h3 className="text-lg font-bold leading-tight text-[#111111]">{entry.bottle.name}</h3>
              <div className="mt-4 flex items-end justify-between border-t border-[#ece8e0] pt-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                  {language === "kr" ? "총 등록 가치" : "Total listed value"}
                </span>
                <span className="text-sm font-bold text-[#111111]">{formatUsd(entry.totalBottleValueUsd)}</span>
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
    </div>
  );

  return (
    <div className="pb-8">
      <div className="mb-6 flex items-center justify-between lg:hidden">
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">
          {sectionTitle}
        </p>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded-full border border-[#e2ddd3] bg-white px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#111111]"
        >
          Menu
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/25 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="ml-auto h-full w-[82vw] max-w-sm bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <div className="sticky top-28 rounded-[1.75rem] border border-[#e9e4da] bg-white/75 p-5">
            {sidebar}
          </div>
        </div>

        <main className="min-w-0 space-y-12">
          {activeSection === "overview" ? (
            <>
              <header className="flex flex-col justify-between gap-10 border-b border-[#e9e4da] pb-10 xl:flex-row xl:items-end">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">
                    {language === "kr" ? "마이페이지" : "My Page"}
                  </p>
                  <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(2.3rem,4.8vw,4.2rem)] font-bold leading-[0.98] tracking-[-0.04em] text-[#111111]">
                    {language === "kr" ? "포트폴리오 개요" : "Portfolio Overview"}
                  </h1>
                </div>
                <Link
                  href="/submit"
                  className="inline-flex items-center justify-center bg-[#111111] px-8 py-4 text-[11px] font-extrabold uppercase tracking-[0.24em] text-white transition hover:bg-black"
                >
                  {language === "kr" ? "바틀 등록" : "Register bottle"}
                </Link>
              </header>
              {portfolioSummary}
              {featuredEntry ? (
                <section className="space-y-8">
                  <div className="flex items-center justify-between border-b border-[#e9e4da] pb-4">
                    <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-[#111111]">
                      {language === "kr" ? "최근 아카이브 활동" : "Recent archive activity"}
                    </h2>
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
                              isDefaultRegisterBottleImage(featuredEntry.cardImageUrl) ? "p-3" : "p-2.5"
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
                            {featuredEntry.latestListing.note ||
                              (language === "kr"
                                ? "최근 업로드한 바틀 아카이브 항목입니다."
                                : "Your latest uploaded bottle archive entry.")}
                          </p>
                        </div>
                        <div className="mt-6 flex items-center justify-between border-t border-[#ddd7cd] pt-4">
                          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                            {language === "kr" ? "최근 등록" : "Latest listing"}
                          </span>
                          <span className="text-xl font-bold text-[#111111]">
                            {formatUsd(featuredEntry.latestListing.normalizedPriceUsd)}
                          </span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex flex-col gap-6">
                      {recentEntries.map((entry) => (
                        <Link key={entry.bottle.id} href={`/bottle?id=${entry.bottle.id}`} className="group flex items-center gap-6">
                          <div className="h-24 w-24 shrink-0 overflow-hidden bg-[#f3f2ee]">
                            {entry.cardImageUrl ? (
                              <img src={entry.cardImageUrl} alt={entry.bottle.name} className="h-full w-full bg-[#f3f2ee] object-contain object-center p-2" />
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
                              <span className="text-sm font-bold text-[#111111]">{formatUsd(entry.latestListing.normalizedPriceUsd)}</span>
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
            </>
          ) : null}

          {activeSection === "collection" ? (
            <section className="space-y-10">
              <div className="flex flex-col justify-between gap-4 border-b border-[#e9e4da] pb-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">
                    {language === "kr" ? "내 컬렉션" : "My Collection"}
                  </p>
                  <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-[#111111]">
                    {language === "kr" ? "업로드한 바틀" : "Uploaded bottles"}
                  </h1>
                </div>
                <div className="flex gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                  <span>{collectionEntries.length} bottles</span>
                  <span>{activeListingCount} active</span>
                </div>
              </div>
              {collectionGrid}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[#e9e4da] bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">Active listings</p>
                  <p className="mt-3 text-3xl font-black text-[#111111]">{activeListings.length}</p>
                </div>
                <div className="rounded-[1.5rem] border border-[#e9e4da] bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">Archive activity</p>
                  <p className="mt-3 text-3xl font-black text-[#111111]">{listings.length}</p>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "watchlist" ? (
            <section className="space-y-8">
              <div className="flex items-center justify-between gap-4 border-b border-[#e9e4da] pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">Watchlist</p>
                  <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-[#111111]">
                    {language === "kr" ? "저장한 바틀" : "Saved bottles"}
                  </h1>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">{wishlistEntries.length}</span>
              </div>
              {!loading && !wishlistEntries.length ? (
                <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
                  {language === "kr" ? "아직 위시리스트에 추가한 바틀이 없습니다." : "No saved bottles in your watchlist yet."}
                </div>
              ) : null}
              <div className="flex flex-col gap-6">
                {wishlistEntries.map((entry) => {
                  const latestListing = latestListingByBottleId.get(entry.bottle.id) ?? null;
                  const imageUrl = latestListing
                    ? getListingImageForSurface(latestListing, entry.bottle, "mypage-card")
                    : getBottleImageForSurface(entry.bottle, "market-card");
                  return (
                    <Link key={entry.id} href={`/bottle?id=${entry.bottle.id}`} className="group flex items-center gap-6 transition hover:translate-x-1">
                      <div className="h-24 w-24 shrink-0 overflow-hidden bg-[#f3f2ee]">
                        {imageUrl ? (
                          <img src={imageUrl} alt={entry.bottle.name} className="h-full w-full bg-[#f3f2ee] object-contain object-center p-2" />
                        ) : (
                          <div className="h-full w-full bg-[#ece9e2]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                          {entry.bottle.brand || entry.bottle.category}
                        </p>
                        <h3 className="truncate text-lg font-bold text-[#111111]">{entry.bottle.name}</h3>
                        <div className="mt-1 flex items-center gap-4">
                          <span className="text-sm font-bold text-[#111111]">{language === "kr" ? "저장됨" : "Saved"}</span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">
                            {formatDate(entry.createdAt)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activeSection === "notes" ? (
            <section className="space-y-8">
              <div className="border-b border-[#e9e4da] pb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">Collector Notes</p>
                <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-[#111111]">
                  {language === "kr" ? "내 컬렉터 노트" : "Your collector notes"}
                </h1>
              </div>
              {!collectorNotes.length ? (
                <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
                  {language === "kr" ? "아직 작성한 컬렉터 노트가 없습니다." : "No collector notes written yet."}
                </div>
              ) : (
                <div className="divide-y divide-[#e9e4da] rounded-[1.5rem] border border-[#e9e4da] bg-white">
                  {collectorNotes.map((note) => (
                    <Link key={note.id} href={`/bottle?id=${note.bottleId}`} className="block p-5 transition hover:bg-[#faf8f3]">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b5a34]">
                            {bottleNameById.get(note.bottleId) ?? "Bottle archive"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#111111]">{note.content}</p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7a746b]">{formatDate(note.createdAt)}</p>
                          <p className="mt-2 text-xs font-bold text-[#7a746b]">Helpful {note.helpfulCount}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeSection === "settings" ? (
            <section className="space-y-8">
              <div className="border-b border-[#e9e4da] pb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#8b5a34]">Account Settings</p>
                <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-[#111111]">
                  {language === "kr" ? "계정 설정" : "Account Settings"}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["profile", "security", "notifications"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setAccountTab(tab)}
                    className={`rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition ${
                      accountTab === tab
                        ? "border-[#111111] bg-[#111111] text-white"
                        : "border-[#e2ddd3] bg-white text-[#7a746b] hover:border-[#111111] hover:text-[#111111]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {accountTab === "profile" ? (
                <div className="rounded-[1.5rem] border border-[#e9e4da] bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a746b]">
                    {language === "kr" ? "컬렉터 닉네임" : "Collector nickname"}
                  </p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={displayNameInput}
                      onChange={(event) => {
                        setDisplayNameInput(event.target.value.slice(0, 32));
                        setProfileMessage("");
                      }}
                      className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                      placeholder={language === "kr" ? "중복되지 않는 닉네임" : "Unique collector nickname"}
                    />
                    <button
                      type="button"
                      onClick={onSaveDisplayName}
                      disabled={profileSaving || displayNameInput.trim().length < 2}
                      className="inline-flex items-center justify-center rounded-full bg-[#111111] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#c9c1b7]"
                    >
                      {profileSaving ? (language === "kr" ? "저장 중" : "Saving") : language === "kr" ? "저장" : "Save"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-[#7a746b]">
                    {profileMessage ||
                      (language === "kr"
                        ? "Collector Notes 작성자명으로 사용됩니다. 다른 유저와 같은 닉네임은 사용할 수 없습니다."
                        : "Used as your Collector Notes display name. Nicknames must be unique.")}
                  </p>
                </div>
              ) : null}
              {accountTab === "security" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {["Change password", "Password reset", "Account security settings"].map((item) => (
                    <div key={item} className="rounded-[1.5rem] border border-[#e9e4da] bg-white p-5">
                      <p className="text-sm font-bold text-[#111111]">{item}</p>
                      <p className="mt-2 text-xs leading-5 text-[#7a746b]">Managed through secure account authentication.</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {accountTab === "notifications" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {["Email notifications", "Market alerts", "Watchlist alerts"].map((item) => (
                    <div key={item} className="rounded-[1.5rem] border border-[#e9e4da] bg-white p-5">
                      <p className="text-sm font-bold text-[#111111]">{item}</p>
                      <p className="mt-2 text-xs leading-5 text-[#7a746b]">Notification controls will live here.</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
