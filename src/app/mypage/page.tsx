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
  updateCurrentAccountProfile,
  updateCurrentPassword,
  updateCurrentProfileDisplayName,
} from "@/lib/data/store";
import type { Bottle, BottleReferencePrice, CollectorNote, Listing, WishlistBottle } from "@/lib/types";

const MY_COLLECTION_PAGE_SIZE = 8;
type MyPageSection = "overview" | "collection" | "watchlist" | "notes" | "settings";
type MyPageIcon = MyPageSection | "logout";

function MyPageNavIcon({ icon }: { icon: MyPageIcon }) {
  const common = "h-5 w-5";
  if (icon === "overview") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    );
  }
  if (icon === "collection") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M10 3h4l1 5v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8l1-5z" />
        <path d="M9 8h6M9 14h6" />
      </svg>
    );
  }
  if (icon === "watchlist") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M20.3 5.8a5 5 0 0 0-7.1 0L12 7l-1.2-1.2a5 5 0 1 0-7.1 7.1L12 21l8.3-8.1a5 5 0 0 0 0-7.1z" />
      </svg>
    );
  }
  if (icon === "notes") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M5 5h14v10H9l-4 4V5z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  }
  if (icon === "settings") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M15 7l5 5-5 5M20 12H9" />
      <path d="M11 4H5v16h6" />
    </svg>
  );
}

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountFirstNameInput, setAccountFirstNameInput] = useState("");
  const [accountLastNameInput, setAccountLastNameInput] = useState("");
  const [accountDateOfBirthInput, setAccountDateOfBirthInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirmInput, setPasswordConfirmInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

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
        const fallbackName = user.displayName || user.email.split("@")[0] || "";
        const fallbackParts = fallbackName.split(/\s+/).filter(Boolean);
        const nextFirstName = user.firstName || fallbackParts[0] || "";
        const nextLastName = user.lastName || fallbackParts.slice(1).join(" ");
        const fullName = [nextFirstName, nextLastName].filter(Boolean).join(" ");
        setAccountFirstNameInput(nextFirstName);
        setAccountLastNameInput(nextLastName);
        setAccountDateOfBirthInput(user.dateOfBirth || "");
        setDisplayNameInput(profileDisplayName || user.displayName || fullName || fallbackName);
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
        sum.gainValueUsd += referenceValueUsd - listedValueUsd;
        return sum;
      },
      { referenceValueUsd: 0, gainValueUsd: 0 },
    );
  }, [bottleReferenceMap, listings]);
  const portfolioReferenceGainPercent =
    portfolioReferenceSummary.referenceValueUsd > 0
      ? (portfolioReferenceSummary.gainValueUsd / portfolioReferenceSummary.referenceValueUsd) * 100
      : 0;
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

  const readableAccountError = (nextError: unknown, fallback: string) => {
    if (nextError instanceof Error && nextError.message === "nickname-taken") {
      return language === "kr" ? "이미 사용 중인 닉네임입니다." : "This nickname is already taken.";
    }
    return nextError instanceof Error ? nextError.message : fallback;
  };

  const onSaveAccountSettings = async () => {
    if (accountSaving) return;
    setAccountSaving(true);
    setAccountMessage("");
    setProfileMessage("");

    try {
      const saved = await updateCurrentAccountProfile({
        firstName: accountFirstNameInput,
        lastName: accountLastNameInput,
        dateOfBirth: accountDateOfBirthInput,
        displayName: displayNameInput,
      });
      setAccountFirstNameInput(saved.firstName);
      setAccountLastNameInput(saved.lastName);
      setAccountDateOfBirthInput(saved.dateOfBirth);
      setDisplayNameInput(saved.displayName);
      setAccountMessage(language === "kr" ? "계정 정보를 저장했습니다." : "Account settings saved.");
    } catch (nextError) {
      setAccountMessage(
        readableAccountError(
          nextError,
          language === "kr" ? "계정 정보를 저장할 수 없습니다." : "Unable to save account settings.",
        ),
      );
    } finally {
      setAccountSaving(false);
    }
  };

  const onSavePassword = async () => {
    if (passwordSaving) return;
    setPasswordSaving(true);
    setPasswordMessage("");

    try {
      await updateCurrentPassword({
        password: passwordInput,
        passwordConfirm: passwordConfirmInput,
      });
      setPasswordInput("");
      setPasswordConfirmInput("");
      setPasswordEditorOpen(false);
      setPasswordMessage(language === "kr" ? "비밀번호를 변경했습니다." : "Password updated.");
    } catch (nextError) {
      setPasswordMessage(
        nextError instanceof Error
          ? nextError.message
          : language === "kr"
            ? "비밀번호를 변경할 수 없습니다."
            : "Unable to update password.",
      );
    } finally {
      setPasswordSaving(false);
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
        <p className="mb-8 px-2 text-[11px] font-black uppercase tracking-[0.32em] text-[#8b5a34]">
          {language === "kr" ? "마이페이지" : "My Page"}
        </p>
        <nav className="space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`flex w-full items-center gap-4 rounded-[0.35rem] px-4 py-4 text-left text-[12px] font-black uppercase tracking-[0.2em] transition ${
                activeSection === item.id
                  ? "bg-[#f3eee6] text-[#8b5a34] shadow-[0_10px_28px_rgba(100,74,44,0.08)]"
                  : "text-[#151515] hover:bg-[#f7f4ef] hover:text-[#8b5a34]"
              }`}
            >
              <span className={activeSection === item.id ? "text-[#8b5a34]" : "text-[#5f5a53]"}>
                <MyPageNavIcon icon={item.id} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-10 border-t border-[#e3ded5] pt-8">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-4 rounded-[0.35rem] px-4 py-4 text-left text-[12px] font-black uppercase tracking-[0.2em] text-[#7a746b] transition hover:bg-[#f7f4ef] hover:text-[#111111]"
        >
          <MyPageNavIcon icon="logout" />
          <span>Logout</span>
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
            {Math.abs(portfolioReferenceGainPercent).toFixed(1)}%{" "}
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
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="My page menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMobileMenuOpen(false);
          }}
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/25"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className="relative ml-auto h-full w-[82vw] max-w-sm bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
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
              <div className="rounded-[1.5rem] border border-[#e9e4da] bg-white">
                <div className="grid gap-4 border-b border-[#eee9df] p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                      {language === "kr" ? "이메일 주소" : "Email address"}
                    </p>
                    <p className="mt-1 text-xs text-[#9a9287]">
                      {language === "kr" ? "수정할 수 없습니다." : "Cannot be edited."}
                    </p>
                  </div>
                  <input
                    value={user.email}
                    readOnly
                    className="w-full rounded-full border border-[#e2ddd3] bg-[#f7f4ef] px-4 py-3 text-sm text-[#7a746b] outline-none"
                  />
                </div>

                <div className="grid gap-4 border-b border-[#eee9df] p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                    First Name
                  </label>
                  <input
                    value={accountFirstNameInput}
                    onChange={(event) => {
                      setAccountFirstNameInput(event.target.value.slice(0, 40));
                      setAccountMessage("");
                    }}
                    className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                    placeholder="First Name"
                  />
                </div>

                <div className="grid gap-4 border-b border-[#eee9df] p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                    Last Name
                  </label>
                  <input
                    value={accountLastNameInput}
                    onChange={(event) => {
                      setAccountLastNameInput(event.target.value.slice(0, 40));
                      setAccountMessage("");
                    }}
                    className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                    placeholder="Last Name"
                  />
                </div>

                <div className="grid gap-4 border-b border-[#eee9df] p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                  <label className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                    {language === "kr" ? "생년월일" : "Date of Birth"}
                  </label>
                  <input
                    type="date"
                    value={accountDateOfBirthInput}
                    onChange={(event) => {
                      setAccountDateOfBirthInput(event.target.value);
                      setAccountMessage("");
                    }}
                    className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                  />
                </div>

                <div className="grid gap-4 border-b border-[#eee9df] p-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                      {language === "kr" ? "닉네임" : "Nickname"}
                    </p>
                    <p className="mt-1 text-xs text-[#9a9287]">
                      {language === "kr" ? "컬렉터 노트에 표시됩니다." : "Shown on Collector Notes."}
                    </p>
                  </div>
                  <input
                    value={displayNameInput}
                    onChange={(event) => {
                      setDisplayNameInput(event.target.value.slice(0, 32));
                      setAccountMessage("");
                      setProfileMessage("");
                    }}
                    className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                    placeholder={language === "kr" ? "중복되지 않는 닉네임" : "Unique collector nickname"}
                  />
                </div>

                <div className="border-b border-[#eee9df] p-5">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordEditorOpen((current) => !current);
                      setPasswordMessage("");
                    }}
                    className="grid w-full gap-4 text-left md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center"
                  >
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7a746b]">
                        {language === "kr" ? "비밀번호" : "Password"}
                      </p>
                      <p className="mt-1 text-xs text-[#9a9287]">
                        {language === "kr" ? "변경하려면 클릭하세요." : "Click to change."}
                      </p>
                    </div>
                    <div className="rounded-full border border-[#e2ddd3] bg-[#f7f4ef] px-4 py-3 text-sm text-[#7a746b]">
                      ••••••••
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8b5a34]">
                      {passwordEditorOpen ? "Close" : "Change"}
                    </span>
                  </button>

                  {passwordEditorOpen ? (
                    <div className="mt-5 grid gap-3 border-t border-[#eee9df] pt-5 md:grid-cols-2">
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(event) => {
                          setPasswordInput(event.target.value);
                          setPasswordMessage("");
                        }}
                        className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                        placeholder={language === "kr" ? "새 비밀번호" : "New password"}
                      />
                      <input
                        type="password"
                        value={passwordConfirmInput}
                        onChange={(event) => {
                          setPasswordConfirmInput(event.target.value);
                          setPasswordMessage("");
                        }}
                        className="w-full rounded-full border border-[#e2ddd3] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition focus:border-[#111111]"
                        placeholder={language === "kr" ? "비밀번호 확인" : "Confirm password"}
                      />
                      <div className="md:col-span-2">
                        <button
                          type="button"
                          onClick={onSavePassword}
                          disabled={passwordSaving || passwordInput.length < 6 || passwordConfirmInput.length < 6}
                          className="inline-flex items-center justify-center rounded-full bg-[#111111] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#c9c1b7]"
                        >
                          {passwordSaving ? (language === "kr" ? "변경 중" : "Updating") : language === "kr" ? "비밀번호 변경" : "Update password"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {passwordMessage ? (
                    <p className="mt-3 text-xs text-[#7a746b]">{passwordMessage}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[#7a746b]">
                    {accountMessage ||
                      profileMessage ||
                      (language === "kr"
                        ? "이름, 생년월일, 닉네임은 계정과 컬렉터 활동에 사용됩니다."
                        : "Your name, date of birth, and nickname are used for account and collector activity.")}
                  </p>
                  <button
                    type="button"
                    onClick={onSaveAccountSettings}
                    disabled={accountSaving || accountFirstNameInput.trim().length < 1 || displayNameInput.trim().length < 2}
                    className="inline-flex items-center justify-center rounded-full bg-[#111111] px-6 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#c9c1b7]"
                  >
                    {accountSaving ? (language === "kr" ? "저장 중" : "Saving") : language === "kr" ? "변경 저장" : "Save changes"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
