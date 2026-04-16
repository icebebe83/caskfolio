import Link from "next/link";
import { useEffect, useState } from "react";

import { DeleteListingButton } from "@/components/delete-listing-button";
import { EditListingButton } from "@/components/edit-listing-button";
import { useAuth, useLanguage } from "@/components/providers";
import { ReportListingButton } from "@/components/report-listing-button";
import { getListingImageForSurface, isDefaultRegisterBottleImage } from "@/lib/media/images";
import { fetchListingContact, updateListingStatus } from "@/lib/data/store";
import {
  buildMessengerLink,
  formatDate,
  formatCategoryLabel,
  formatKrw,
  formatListingStatus,
  formatUsd,
  getStatusDotClass,
} from "@/lib/format";
import { tListingAction, tListingUi, tStatus } from "@/lib/i18n";
import type { Bottle, Listing } from "@/lib/types";

export function ListingCard({
  listing,
  bottle,
  fxRate = 0,
  compact = false,
  onUpdated,
  onDeleted,
}: {
  listing: Listing;
  bottle?: Bottle;
  fxRate?: number;
  compact?: boolean;
  onUpdated?: (listing: Listing) => void;
  onDeleted?: (listingId: string) => void;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [currentListing, setCurrentListing] = useState(listing);
  const [isDeleted, setIsDeleted] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [isContactLoading, setIsContactLoading] = useState(false);
  const messengerType = currentListing.messengerType ?? (currentListing.telegramId ? "telegram" : undefined);
  const messengerHandle = currentListing.messengerHandle ?? currentListing.telegramId ?? "";
  const hasMessenger = Boolean(messengerType && messengerHandle.trim());
  const isOwner = user?.uid === currentListing.createdBy;
  const listingImageUrl = getListingImageForSurface(
    currentListing,
    bottle,
    compact ? "detail-archive-card" : "listing-card",
  );
  const isDefaultImage = isDefaultRegisterBottleImage(listingImageUrl);
  const statusLabel = tStatus(language, formatListingStatus(currentListing.status));
  const statusTone = currentListing.status === "active" ? "text-[#111111]" : "text-neutral-400";

  useEffect(() => {
    setCurrentListing(listing);
    setIsDeleted(false);
    setContactMessage("");
    setIsContactLoading(false);
  }, [listing]);

  const onContact = async () => {
    if (!user || currentListing.status !== "active") return;

    let nextListing = currentListing;

    if (!hasMessenger) {
      setIsContactLoading(true);
      const contact = await fetchListingContact(currentListing.id);
      setIsContactLoading(false);

      if (!contact?.messengerType || !contact.messengerHandle?.trim()) {
        setContactMessage(tListingUi(language, "Contact unavailable."));
        return;
      }

      nextListing = {
        ...currentListing,
        messengerType: contact.messengerType,
        messengerHandle: contact.messengerHandle,
        telegramId: contact.telegramId,
      };
      setCurrentListing(nextListing);
    }

    const nextMessengerType = nextListing.messengerType;
    const nextMessengerHandle = nextListing.messengerHandle ?? nextListing.telegramId ?? "";

    if (nextMessengerType === "kakaotalk") {
      const copyHandle = nextMessengerHandle.trim();
      if (!copyHandle) {
        setContactMessage(tListingUi(language, "Contact unavailable."));
        return;
      }
      void navigator.clipboard
        .writeText(copyHandle)
        .then(() => {
          setContactMessage(
            tListingUi(language, "KakaoTalk ID copied. Add the user in KakaoTalk."),
          );
        })
        .catch(() => {
          setContactMessage(
            tListingUi(language, "Copy failed. Use the saved KakaoTalk ID manually."),
          );
        });
      return;
    }

    const nextMessengerLink =
      nextMessengerType && nextMessengerHandle
        ? buildMessengerLink(nextMessengerType, nextMessengerHandle)
        : "";

    if (nextMessengerLink) {
      window.open(nextMessengerLink, "_blank", "noopener,noreferrer");
      return;
    }

    setContactMessage(tListingUi(language, "Contact unavailable."));
  };

  if (isDeleted) {
    return null;
  }

  return (
    <article
      className={`group overflow-hidden border border-[#e2ddd3] bg-white transition hover:-translate-y-0.5 hover:shadow-panel ${
        compact ? "rounded-[20px]" : "rounded-[26px]"
      }`}
    >
      <div
        className={`relative overflow-hidden bg-[#f5f2ec] ${compact ? "aspect-[0.62] sm:aspect-[0.72] md:aspect-[0.78] lg:aspect-[0.9]" : "aspect-square"}`}
      >
        {listingImageUrl ? (
          <img
            src={listingImageUrl}
            alt={currentListing.bottleName}
            className={`h-full w-full bg-[#f5f2ec] object-contain object-center transition duration-300 ${
              isDefaultImage
                ? "p-2.5 sm:p-3 group-hover:scale-[1.01]"
                : "p-2 sm:p-2.5 group-hover:scale-[1.02]"
            }`}
          />
        ) : null}
        <div
          className={`absolute inline-flex rounded-full bg-white/92 font-semibold uppercase tracking-[0.18em] text-neutral-700 ${
            compact ? "left-2 top-2 px-2 py-0.5 text-[10px]" : "left-3 top-3 px-2.5 py-1 text-[11px]"
          }`}
        >
          {formatCategoryLabel(currentListing.category)}
        </div>
      </div>

      <div className={`${compact ? "space-y-2 p-2.5 sm:space-y-2.5 sm:p-3" : "space-y-3 p-4"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/bottle?id=${currentListing.bottleId}`}
              className={`line-clamp-2 font-semibold text-[#111111] ${compact ? "text-[14px] leading-5" : "text-[15px] leading-5"}`}
            >
              {currentListing.bottleName}
            </Link>
            <p
              className={`mt-1 font-medium uppercase tracking-[0.14em] text-[#7a746b] ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              {[currentListing.region, currentListing.condition].filter(Boolean).join(" · ") ||
                tListingUi(language, "Details not set")}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 ${statusTone} font-semibold uppercase tracking-[0.14em] ${
              compact ? "text-[11px]" : "text-xs"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${getStatusDotClass(currentListing.status)}`} />
            {statusLabel}
          </span>
        </div>

        <div>
          <p className={`${compact ? "text-[12px]" : "text-[13px]"} text-[#7a746b]`}>
            {tListingUi(language, "Lowest comparable price")}
          </p>
          <p
            className={`mt-1 font-black tracking-[-0.03em] text-[#111111] ${
              compact ? "text-[23px]" : "text-[28px]"
            }`}
          >
            {formatUsd(currentListing.normalizedPriceUsd)}
          </p>
          <p className={`mt-1 text-[#7a746b] ${compact ? "text-[13px]" : "text-sm"}`}>
            {formatKrw(currentListing.approxPriceKrw)}
          </p>
        </div>

        <div className={`grid grid-cols-2 gap-2 bg-[#f5f2ec] ${compact ? "rounded-[18px] p-2.5 text-[13px]" : "rounded-2xl p-3 text-sm"}`}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a9388]">
              {tListingUi(language, "Input")}
            </p>
            <p className="mt-1 font-medium text-[#111111]">
              {currentListing.inputCurrency} {currentListing.inputPriceValue.toLocaleString("en-US")}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9a9388]">
              {tListingUi(language, "Listed")}
            </p>
            <p className="mt-1 font-medium text-[#111111]">{formatDate(currentListing.createdAt)}</p>
          </div>
        </div>

        {currentListing.note ? (
          <p className={`line-clamp-2 text-[#666159] ${compact ? "text-[13px] leading-5" : "text-sm leading-6"}`}>
            {currentListing.note}
          </p>
        ) : null}

        <div className={`flex items-center justify-between gap-3 ${compact ? "pt-0.5" : "pt-1"}`}>
          {user && currentListing.status === "active" ? (
            <button
              type="button"
              onClick={() => {
                void onContact();
              }}
              disabled={isContactLoading}
              className={`inline-flex rounded-full bg-[#111111] font-semibold text-white transition hover:bg-black disabled:opacity-60 ${
                compact ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-sm"
              }`}
            >
              {isContactLoading
                ? language === "kr"
                  ? "불러오는 중..."
                  : "Loading..."
                : tListingUi(language, "Contact")}
            </button>
          ) : (
            <span className={`${compact ? "text-[13px]" : "text-sm"} text-neutral-400`}>
              {!user
                ? tListingUi(language, "Sign in to contact.")
                : currentListing.status === "active"
                  ? tListingUi(language, "Messenger details not provided.")
                  : tListingUi(language, "Contact unavailable.")}
            </span>
          )}
          <p className={`${compact ? "text-[11px]" : "text-xs"} font-medium uppercase tracking-[0.12em] text-neutral-400`}>
            {hasMessenger
              ? tListingUi(language, "Messenger enabled")
              : tListingUi(language, "No messenger")}
          </p>
        </div>
        {contactMessage ? (
          <p className={`${compact ? "text-[11px]" : "text-xs"} text-[#7a746b]`}>
            {contactMessage}
          </p>
        ) : null}

        {isOwner ? (
          <>
            <button
              type="button"
              onClick={() => {
                const nextStatus = currentListing.status === "active" ? "inactive" : "active";
                void updateListingStatus(currentListing.id, nextStatus)
                  .then(() => {
                    const nextListing = {
                      ...currentListing,
                      status: nextStatus,
                      updatedAt: new Date(),
                    } as Listing;
                    setCurrentListing(nextListing);
                    onUpdated?.(nextListing);
                  })
                  .catch(() => undefined);
              }}
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#111111] transition hover:text-black"
            >
              {tListingAction(
                language,
                currentListing.status === "active" ? "Mark inactive" : "Activate",
              )}
            </button>
            <EditListingButton
              listing={currentListing}
              fxRate={fxRate}
              onUpdated={(nextListing) => {
                setCurrentListing(nextListing);
                onUpdated?.(nextListing);
              }}
            />
            <DeleteListingButton
              listingId={currentListing.id}
              onDeleted={() => {
                setIsDeleted(true);
                onDeleted?.(currentListing.id);
              }}
            />
          </>
        ) : null}
        <ReportListingButton listingId={currentListing.id} />
      </div>
    </article>
  );
}
