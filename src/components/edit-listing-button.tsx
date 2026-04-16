"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { useLanguage } from "@/components/providers";
import { LISTING_CONDITIONS, MESSENGER_OPTIONS } from "@/lib/constants";
import { formatKrw, formatUsd, priceToKrw, priceToUsd } from "@/lib/format";
import { fetchListingContact, updateListing } from "@/lib/data/store";
import { resolveUsdKrwRate } from "@/lib/fx";
import { tCondition, tListingAction, tListingUi, tMessenger, tStatus } from "@/lib/i18n";
import type { Listing } from "@/lib/types";

export function EditListingButton({
  listing,
  fxRate,
  onUpdated,
}: {
  listing: Listing;
  fxRate: number;
  onUpdated?: (listing: Listing) => void;
}) {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [inputCurrency, setInputCurrency] = useState<Listing["inputCurrency"]>(listing.inputCurrency);
  const [priceValue, setPriceValue] = useState(String(listing.inputPriceValue));
  const [quantity, setQuantity] = useState(String(listing.quantity || 1));
  const [condition, setCondition] = useState(listing.condition || LISTING_CONDITIONS[0]);
  const [region, setRegion] = useState(listing.region);
  const [messengerType, setMessengerType] = useState<NonNullable<Listing["messengerType"]>>(
    listing.messengerType ?? "telegram",
  );
  const [messengerHandle, setMessengerHandle] = useState(listing.messengerHandle ?? listing.telegramId ?? "");
  const [note, setNote] = useState(listing.note);
  const [status, setStatus] = useState<"active" | "inactive">(
    listing.status === "active" ? "active" : "inactive",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    setInputCurrency(listing.inputCurrency);
    setPriceValue(String(listing.inputPriceValue));
    setQuantity(String(listing.quantity || 1));
    setCondition(listing.condition || LISTING_CONDITIONS[0]);
    setRegion(listing.region);
    setMessengerType(listing.messengerType ?? "telegram");
    setMessengerHandle(listing.messengerHandle ?? listing.telegramId ?? "");
    setNote(listing.note);
    setStatus(listing.status === "active" ? "active" : "inactive");
    setImageFile(null);
  }, [listing]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setError("");
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || listing.id.startsWith("local-")) return;
    if (listing.messengerType || listing.messengerHandle || listing.telegramId) return;

    void fetchListingContact(listing.id).then((contact) => {
      if (!contact) return;
      setMessengerType(contact.messengerType ?? "telegram");
      setMessengerHandle(contact.messengerHandle ?? contact.telegramId ?? "");
    });
  }, [
    isOpen,
    listing.id,
    listing.messengerHandle,
    listing.messengerType,
    listing.telegramId,
  ]);

  const numericPrice = Number(priceValue || 0);
  const numericQuantity = Math.max(1, Number(quantity || 1));
  const previewUsd = priceToUsd(numericPrice, inputCurrency, fxRate);
  const previewKrw = priceToKrw(numericPrice, inputCurrency, fxRate);

  const onSave = () => {
    if (!numericPrice) {
      setError("Price is required.");
      return;
    }

    if (inputCurrency === "KRW" && !fxRate) {
      setError("KRW listings need a USD/KRW rate.");
      return;
    }

    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const currentFxRate =
          inputCurrency === "KRW"
            ? (await resolveUsdKrwRate()).rate || fxRate
            : fxRate;
        const nextListing = await updateListing(listing, {
          inputPriceValue: numericPrice,
          inputCurrency,
          fxRate: currentFxRate,
          quantity: numericQuantity,
          condition,
          region,
          messengerType,
          messengerHandle,
          note,
          status,
          imageFile,
        });
        setMessage(tListingAction(language, "Listing updated."));
        setImageFile(null);
        setIsOpen(false);
        onUpdated?.(nextListing);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to update listing.");
      }
    });
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setIsOpen((current) => !current);
            setMessage("");
            setError("");
          }}
          className="text-xs font-medium uppercase tracking-[0.2em] text-[#111111] transition hover:text-black"
        >
          {tListingAction(language, isOpen ? "Close edit" : "Edit listing")}
        </button>
        {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 p-4 sm:p-6">
              <div
                className="absolute inset-0"
                onClick={() => {
                  setIsOpen(false);
                  setError("");
                }}
              />

              <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-50 shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Edit listing")}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#111111]">
                      {tListingUi(language, "Update")} {listing.bottleName}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setError("");
                    }}
                    className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 transition hover:text-[#111111]"
                  >
                    {tListingUi(language, "Close")}
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Listing settings")}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Availability")}
                        </label>
                        <select
                          value={status}
                          onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
                          className="field w-full"
                        >
                          <option value="active">{tStatus(language, "Active")}</option>
                          <option value="inactive">{tStatus(language, "Inactive")}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Condition")}
                        </label>
                        <select
                          value={condition}
                          onChange={(event) => setCondition(event.target.value)}
                          className="field w-full"
                        >
                          {LISTING_CONDITIONS.map((item) => (
                            <option key={item} value={item}>
                              {tCondition(language, item)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Price details")}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-[0.42fr_0.58fr]">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Currency")}
                        </label>
                        <select
                          value={inputCurrency}
                          onChange={(event) => setInputCurrency(event.target.value as Listing["inputCurrency"])}
                          className="field w-full"
                        >
                          <option value="USD">USD</option>
                          <option value="KRW">KRW</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Price")}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={priceValue}
                          onChange={(event) => setPriceValue(event.target.value)}
                          className="field w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Inventory details")}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Quantity")}
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                          className="field w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Region")}
                        </label>
                        <input
                          value={region}
                          onChange={(event) => setRegion(event.target.value)}
                          className="field w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Contact details")}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Messenger")}
                        </label>
                        <select
                          value={messengerType}
                          onChange={(event) => setMessengerType(event.target.value as NonNullable<Listing["messengerType"]>)}
                          className="field w-full"
                        >
                          {MESSENGER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {tMessenger(language, option.label)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                          {tListingUi(language, "Messenger ID")}
                        </label>
                        <input
                          value={messengerHandle}
                          onChange={(event) => setMessengerHandle(event.target.value)}
                          className="field w-full"
                          placeholder={tListingUi(language, "Enter your messenger handle")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Replace image")}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                      className="field mt-4 w-full"
                    />
                    <p className="mt-2 text-xs leading-5 text-neutral-500">
                      {tListingUi(
                        language,
                        "Upload a new image only if you want to replace the current listing photo.",
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Note")}
                    </label>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={4}
                      className="field mt-4 w-full resize-none"
                    />
                  </div>

                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                      {tListingUi(language, "Updated price preview")}
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#111111]">
                      {formatUsd(previewUsd)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">{formatKrw(previewKrw)}</p>
                  </div>
                </div>

                <div className="border-t border-neutral-200 bg-white px-5 py-4 sm:px-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={isPending}
                      className="button-primary w-full px-4 py-2.5"
                    >
                      {tListingAction(language, isPending ? "Saving..." : "Save changes")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        setError("");
                      }}
                      className="button-secondary w-full px-4 py-2.5"
                    >
                      {tListingAction(language, "Cancel")}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
