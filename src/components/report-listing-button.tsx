"use client";

import { useState, useTransition } from "react";

import { useAuth, useLanguage } from "@/components/providers";
import { REPORT_REASONS } from "@/lib/constants";
import { createReport } from "@/lib/data/store";
import { tListingAction, tListingUi } from "@/lib/i18n";

export function ReportListingButton({ listingId }: { listingId: string }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!user) {
    return null;
  }

  const onSubmit = () => {
    startTransition(async () => {
      try {
        await createReport(listingId, reason, note, user);
        setMessage(tListingAction(language, "Report submitted."));
        setNote("");
        setIsOpen(false);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : tListingUi(language, "Unable to submit report."),
        );
      }
    });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="text-xs font-medium uppercase tracking-[0.2em] text-ink/50 transition hover:text-cask"
      >
        {tListingAction(language, "Report listing")}
      </button>
      {isOpen ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-ink/10 bg-mist p-4">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
          >
            {REPORT_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm"
            placeholder={tListingUi(language, "Optional context for the admin queue")}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
          >
            {isPending
              ? tListingUi(language, "Sending...")
              : tListingUi(language, "Submit report")}
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-xs text-ink/55">{message}</p> : null}
    </div>
  );
}
