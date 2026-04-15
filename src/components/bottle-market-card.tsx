"use client";

import Link from "next/link";

import { useLanguage } from "@/components/providers";
import { isDefaultRegisterBottleImage } from "@/lib/media/images";
import { formatUsd } from "@/lib/format";

export function BottleMarketCard({
  href,
  imageUrl,
  name,
  priceUsd,
  listingCount = 0,
  compact = false,
  onNavigate,
}: {
  href: string;
  imageUrl?: string;
  name: string;
  priceUsd: number;
  listingCount?: number;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { language } = useLanguage();
  const isDefaultImage = isDefaultRegisterBottleImage(imageUrl);
  const listingsLabel =
    language === "kr"
      ? `(${listingCount.toLocaleString("ko-KR")}개 등록)`
      : `(${listingCount.toLocaleString("en-US")} listing${listingCount === 1 ? "" : "s"})`;
  const medianLabel = language === "kr" ? "시장 중간값" : "Market Median";
  const detailsLabel = language === "kr" ? "상세 보기 →" : "View details →";

  return (
    <Link
      href={href}
      onClick={onNavigate}
      onMouseDown={onNavigate}
      onTouchStart={onNavigate}
      className={`group block bg-white transition-colors duration-500 hover:bg-[#f3f3f0] ${
        compact ? "p-1 sm:p-1.5 lg:p-2" : "p-2 sm:p-2.5 lg:p-3"
      }`}
    >
      <div className={`overflow-hidden bg-[#f4f4f1] ${compact ? "mb-1.5 sm:mb-2" : "mb-3 sm:mb-4"}`}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className={`w-full transition duration-700 ${
              compact ? "aspect-[0.52] sm:aspect-[0.58] md:aspect-[0.64] lg:aspect-[0.72] xl:aspect-[3/4]" : "aspect-[3/4]"
            } bg-[#f4f4f1] object-contain object-center ${
              isDefaultImage
                ? "p-1 group-hover:scale-[1.01] sm:p-1.5"
                : "p-1 group-hover:scale-[1.04] sm:p-1.5"
            }`}
          />
        ) : (
          <div className={`w-full bg-[#f4f4f1] ${compact ? "aspect-[0.52] sm:aspect-[0.58] md:aspect-[0.64] lg:aspect-[0.72] xl:aspect-[3/4]" : "aspect-[3/4]"}`} />
        )}
      </div>
      <div className={`flex flex-col px-0.5 pb-0.5 ${compact ? "min-h-[44px] sm:min-h-[52px] md:min-h-[58px] lg:min-h-[68px]" : "min-h-[68px] sm:min-h-[78px]"}`}>
        <h3 className={`line-clamp-2 font-bold leading-[1.22] tracking-[-0.03em] text-[#111111] ${
          compact ? "text-[11px] sm:text-[12px] md:text-[13px] lg:text-[15px]" : "text-[14px] sm:text-[15px] lg:text-[17px]"
        }`}>
          {name}
        </h3>
        {listingCount > 0 ? (
          <p
            className={`mt-1 text-[#8a847a] ${
              compact ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-[12px]"
            }`}
          >
            {listingsLabel}
          </p>
        ) : null}
        <div className="mt-auto">
          <p
            className={`font-medium uppercase tracking-[0.14em] text-[#8a847a] ${
            compact ? "pt-1 text-[9px] sm:pt-1.5 sm:text-[10px]" : "pt-2 text-[10px] sm:pt-3 sm:text-[11px]"
            }`}
          >
            {medianLabel}
          </p>
          <p className={`font-bold tracking-[-0.03em] text-[#111111] ${
            compact ? "pt-0.5 text-[12px] sm:text-[13px] md:text-[14px] lg:text-[15px]" : "pt-1 text-[15px] sm:text-[16px] lg:text-[18px]"
          }`}>
            {formatUsd(priceUsd)}
          </p>
          <p
            className={`mt-1 font-medium text-[#8a847a] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
              compact ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-[12px]"
            }`}
          >
            {detailsLabel}
          </p>
        </div>
      </div>
    </Link>
  );
}
