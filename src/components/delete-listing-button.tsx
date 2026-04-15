"use client";

import { useState, useTransition } from "react";

import { useLanguage } from "@/components/providers";
import { deleteListing } from "@/lib/data/store";
import { tListingAction, tListingUi } from "@/lib/i18n";

export function DeleteListingButton({
  listingId,
  onDeleted,
}: {
  listingId: string;
  onDeleted?: () => void;
}) {
  const { language } = useLanguage();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(tListingUi(language, "Delete this listing?"));

    if (!confirmed) return;

    startTransition(async () => {
      try {
        await deleteListing(listingId);
        setMessage(tListingUi(language, "Listing deleted."));
        onDeleted?.();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : tListingUi(language, "Unable to delete listing."),
        );
      }
    });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="text-xs font-medium uppercase tracking-[0.2em] text-red-600 transition hover:text-red-700 disabled:opacity-60"
      >
        {tListingAction(language, isPending ? "Deleting..." : "Delete listing")}
      </button>
      {message ? <p className="mt-2 text-xs text-ink/55">{message}</p> : null}
    </div>
  );
}
