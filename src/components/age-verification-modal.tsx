"use client";

import { useEffect, useState } from "react";

const AGE_GATE_KEYS = ["caskfolio.age-verified", "caskindex.age-verified"] as const;

export function AgeVerificationModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const accepted = AGE_GATE_KEYS.some((key) => window.localStorage.getItem(key) === "true");
    if (accepted && window.localStorage.getItem(AGE_GATE_KEYS[0]) !== "true") {
      window.localStorage.setItem(AGE_GATE_KEYS[0], "true");
    }
    setIsOpen(!accepted);
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md border border-[#e7e1d8] bg-white p-6 shadow-2xl">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#8f877d]">
          Age verification
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111111]">
          You must be of legal drinking age to enter this site.
        </h2>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(AGE_GATE_KEYS[0], "true");
              setIsOpen(false);
            }}
            className="inline-flex items-center justify-center bg-[#111111] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black"
          >
            Enter
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "about:blank";
            }}
            className="inline-flex items-center justify-center border border-[#d8d2c8] px-5 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[#f5f2ec]"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
