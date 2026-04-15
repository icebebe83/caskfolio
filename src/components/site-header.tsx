"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { useAuth, useLanguage } from "@/components/providers";
import { checkAdmin, signOutUser } from "@/lib/data/store";
import { tCategory } from "@/lib/i18n";

const navItems = [
  { href: "/", label: "Market" },
  { href: "/explore", label: "Bottles" },
  { href: "/news", label: "News" },
  { href: "/submit", label: "Register" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBottleMenuHovered, setIsBottleMenuHovered] = useState(false);
  const [isBottleMenuOpen, setIsBottleMenuOpen] = useState(false);
  const [activeBottleCategory, setActiveBottleCategory] = useState("All");
  const [isSearchView, setIsSearchView] = useState(false);
  const bottleMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottleMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAdminState = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }

      try {
        const allowed = await checkAdmin(user.uid);
        if (!cancelled) {
          setIsAdmin(allowed);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    };

    void loadAdminState();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setActiveBottleCategory(params.get("category") ?? "All");
    setIsSearchView(pathname === "/explore" && params.get("view") === "search");
  }, [pathname]);

  useEffect(() => {
    setIsBottleMenuHovered(false);
    setIsBottleMenuOpen(false);
    if (bottleMenuCloseTimer.current) {
      clearTimeout(bottleMenuCloseTimer.current);
      bottleMenuCloseTimer.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-bottle-menu-root='true']")
      ) {
        return;
      }
      if (target instanceof Node && bottleMenuRef.current && !bottleMenuRef.current.contains(target)) {
        setIsBottleMenuHovered(false);
        setIsBottleMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const visibleNavItems = isAdmin
    ? [...navItems, { href: "/admin", label: "Admin" }]
    : navItems;
  const isBottleMenuVisible = pathname === "/explore" || isBottleMenuHovered || isBottleMenuOpen;
  const bottleCategories = ["All", "Whisky", "Bourbon", "Tequila", "Rum", "Etc"];

  const openBottleMenu = () => {
    if (bottleMenuCloseTimer.current) {
      clearTimeout(bottleMenuCloseTimer.current);
      bottleMenuCloseTimer.current = null;
    }
    setIsBottleMenuHovered(true);
  };

  const scheduleBottleMenuClose = () => {
    if (pathname === "/explore") {
      return;
    }
    if (bottleMenuCloseTimer.current) {
      clearTimeout(bottleMenuCloseTimer.current);
    }
    bottleMenuCloseTimer.current = setTimeout(() => {
      setIsBottleMenuHovered(false);
      bottleMenuCloseTimer.current = null;
    }, 180);
  };

  const onBottleClick = () => {
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      setIsBottleMenuOpen((current) => !current);
      return;
    }
    if (pathname !== "/explore") {
      router.push("/explore");
      return;
    }
    setIsBottleMenuOpen((current) => !current);
  };

  const onBottleCategoryClick = (category: string) => {
    setActiveBottleCategory(category);
    setIsBottleMenuHovered(false);
    setIsBottleMenuOpen(false);
    router.push(category === "All" ? "/explore" : `/explore?category=${encodeURIComponent(category)}`);
  };

  const labelMap =
    language === "kr"
      ? {
          Market: "마켓",
          Bottles: "바틀",
          News: "뉴스",
          Register: "등록",
          Admin: "관리",
          myPage: "마이페이지",
          Search: "검색",
          Logout: "로그아웃",
          Login: "로그인",
        }
      : {
          Market: "Market",
          Bottles: "Bottles",
          News: "News",
          Register: "Register",
          Admin: "Admin",
          myPage: "My Page",
          Search: "Search",
          Logout: "Logout",
          Login: "Login",
        };

  return (
    <header className="sticky top-0 z-20 border-b border-[#ece8e0] bg-white/88 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-4 sm:px-6 lg:gap-4 lg:px-8 lg:py-5">
        <div className="flex flex-col items-center gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6">
          <nav className="order-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 whitespace-nowrap lg:order-1 lg:justify-start lg:gap-5">
            {visibleNavItems.map((item) =>
              item.label === "Bottles" ? (
                <div
                  key={item.href}
                  ref={bottleMenuRef}
                  data-bottle-menu-root="true"
                  onMouseEnter={openBottleMenu}
                  onMouseLeave={scheduleBottleMenuClose}
                >
                  <button
                    type="button"
                    onClick={onBottleClick}
                    className={clsx(
                      "inline-flex h-8 items-center whitespace-nowrap border-b text-[11px] font-extrabold uppercase tracking-[0.18em] transition-colors sm:h-9 sm:text-[12px] lg:h-10 lg:text-[13px] lg:tracking-[0.22em]",
                      pathname === item.href || isBottleMenuVisible
                        ? "border-[#111111] text-[#111111]"
                        : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]",
                    )}
                  >
                    {labelMap[item.label as keyof typeof labelMap] ?? item.label}
                  </button>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setIsBottleMenuHovered(false);
                    setIsBottleMenuOpen(false);
                  }}
                  className={clsx(
                    "inline-flex h-8 items-center whitespace-nowrap border-b text-[11px] font-extrabold uppercase tracking-[0.18em] transition-colors sm:h-9 sm:text-[12px] lg:h-10 lg:text-[13px] lg:tracking-[0.22em]",
                    pathname === item.href
                      ? "border-[#111111] text-[#111111]"
                      : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]",
                  )}
                >
                  {labelMap[item.label as keyof typeof labelMap] ?? item.label}
                </Link>
              ),
            )}
          </nav>

          <Link href="/" className="order-1 flex items-center justify-center gap-3 lg:order-2">
            <div className="text-center">
              <p className="text-[1.75rem] font-black tracking-[-0.05em] text-[#111111] sm:text-[1.95rem] lg:text-3xl">Caskfolio</p>
            </div>
          </Link>

          <div className="order-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 whitespace-nowrap lg:justify-end lg:gap-5">
            {user ? (
              <Link
                href="/mypage"
                onClick={() => {
                  setIsBottleMenuHovered(false);
                  setIsBottleMenuOpen(false);
                }}
                className={clsx(
                  "inline-flex h-8 items-center border-b text-[11px] font-extrabold uppercase tracking-[0.18em] transition-colors sm:h-9 sm:text-[12px] lg:h-10 lg:text-[13px] lg:tracking-[0.22em]",
                  pathname === "/mypage"
                    ? "border-[#111111] text-[#111111]"
                    : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]",
                )}
              >
                {labelMap.myPage}
              </Link>
            ) : null}
            <Link
              href="/explore?view=search"
              onClick={() => {
                setIsBottleMenuHovered(false);
                setIsBottleMenuOpen(false);
              }}
              className={clsx(
                "inline-flex h-8 w-8 items-center justify-center border-b transition-colors sm:h-9 sm:w-9 lg:h-10 lg:w-10",
                isSearchView
                  ? "border-[#111111] text-[#111111]"
                  : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]",
              )}
              aria-label={language === "kr" ? "검색" : "Search"}
              title={language === "kr" ? "검색" : "Search"}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] sm:h-[19px] sm:w-[19px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l5 5" />
              </svg>
            </Link>
            <div className="inline-flex items-center rounded-full border border-[#e2ddd3] bg-white p-0.5">
              {(["en", "kr"] as const).map((option, index) => (
                <div key={option} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setLanguage(option)}
                    aria-pressed={language === option}
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] transition-colors sm:text-[11px]",
                      language === option ? "bg-[#111111] text-white" : "text-[#7b746a] hover:text-[#111111]",
                    )}
                  >
                    {option.toUpperCase()}
                  </button>
                  {index === 0 ? (
                    <span className="px-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#b6afa3] sm:text-[11px]">
                      |
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void signOutUser()
                      .then(() => {
                        window.location.assign("/");
                      })
                      .catch(() => undefined);
                  }}
                  className="inline-flex h-8 items-center border-b border-transparent text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#111111] transition-colors hover:border-[#111111] sm:h-9 sm:text-[12px] lg:h-10 lg:text-[13px] lg:tracking-[0.22em]"
                >
                  {labelMap.Logout}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => {
                  setIsBottleMenuHovered(false);
                  setIsBottleMenuOpen(false);
                }}
                className="inline-flex h-8 items-center bg-[#111111] px-5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white transition-colors hover:bg-black sm:h-9 sm:px-6 sm:text-[12px] lg:h-10 lg:px-7 lg:text-[13px] lg:tracking-[0.22em]"
              >
                {labelMap.Login}
              </Link>
            )}
          </div>
        </div>

        {isBottleMenuVisible ? (
          <div
            data-bottle-menu-root="true"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-[#ece8e0] pt-3 whitespace-nowrap lg:justify-start lg:gap-8 lg:py-4"
            onMouseEnter={openBottleMenu}
            onMouseLeave={scheduleBottleMenuClose}
          >
            {bottleCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onBottleCategoryClick(category)}
                className={clsx(
                  "inline-flex h-8 items-center border-b text-[11px] font-extrabold uppercase tracking-[0.18em] transition-colors sm:h-9 sm:text-[12px] lg:h-10 lg:text-[13px] lg:tracking-[0.22em]",
                  activeBottleCategory === category
                    ? "border-[#111111] text-[#111111]"
                    : "border-transparent text-[#7b746a] hover:border-[#d8d2c8] hover:text-[#111111]",
                )}
              >
                {tCategory(language, category)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
