"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BottleSelector } from "@/components/bottle-selector";
import { DemoBanner } from "@/components/demo-banner";
import { SetupNotice } from "@/components/setup-notice";
import { useAuth, useLanguage } from "@/components/providers";
import {
  BOTTLE_LABEL_VERSION_OPTIONS,
  BOTTLE_VOLUME_OPTIONS,
  CATEGORIES,
  LISTING_CONDITIONS,
  MESSENGER_OPTIONS,
} from "@/lib/constants";
import { formatKrw, formatUsd, priceToKrw, priceToUsd } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import { createBottle, fetchBottlesStrict, submitListing } from "@/lib/data/store";
import { resolveUsdKrwRate } from "@/lib/fx";
import { tCategory, tCondition, tLabelVersion, tMessenger } from "@/lib/i18n";
import type { Bottle, MessengerType, SpiritCategory } from "@/lib/types";

function sanitizeEnglishBottleText(value: string): string {
  return value
    .replace(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/g, "")
    .replace(/[^A-Za-z0-9\s&/'().,+:-]/g, "")
    .replace(/\s+/g, " ");
}

function isEnglishBottleText(value: string): boolean {
  return sanitizeEnglishBottleText(value) === value;
}

type SubmitStage =
  | "loading-archive"
  | "creating-bottle"
  | "creating-listing"
  | "uploading-images"
  | "redirecting";

export default function SubmitPage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [bottlesLoading, setBottlesLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [archiveStatus, setArchiveStatus] = useState("");
  const [selectedBottle, setSelectedBottle] = useState<Bottle | null>(null);
  const [bottleQuery, setBottleQuery] = useState("");
  const [isCreatingBottle, setIsCreatingBottle] = useState(false);
  const [newBottleCategory, setNewBottleCategory] = useState<SpiritCategory>("Bourbon");
  const [newBottleName, setNewBottleName] = useState("");
  const [newBottleBrand, setNewBottleBrand] = useState("");
  const [newBottleBatch, setNewBottleBatch] = useState("");
  const [newBottleAgeStatement, setNewBottleAgeStatement] = useState("NAS");
  const [newBottleAbv, setNewBottleAbv] = useState("");
  const [newBottleVolumeMl, setNewBottleVolumeMl] = useState("750");
  const [labelVersion, setLabelVersion] = useState<(typeof BOTTLE_LABEL_VERSION_OPTIONS)[number]>("");
  const [fxRate, setFxRate] = useState(0);
  const [priceValue, setPriceValue] = useState("0");
  const [inputCurrency, setInputCurrency] = useState<"USD" | "KRW">("USD");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState(LISTING_CONDITIONS[0]);
  const [region, setRegion] = useState("");
  const [messengerType, setMessengerType] = useState<MessengerType>("telegram");
  const [messengerHandle, setMessengerHandle] = useState("");
  const [note, setNote] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fxStatus, setFxStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage | null>(null);
  const [submitStatus, setSubmitStatus] = useState("");
  const [redirectHref, setRedirectHref] = useState("");
  const fieldIds = {
    bottleQuery: "submit-bottle-query",
    newCategory: "submit-new-category",
    newName: "submit-new-name",
    newBrand: "submit-new-brand",
    newBatch: "submit-new-batch",
    newAge: "submit-new-age",
    newAbv: "submit-new-abv",
    newVolume: "submit-new-volume",
    labelVersion: "submit-label-version",
    inputCurrency: "submit-currency",
    price: "submit-price",
    quantity: "submit-quantity",
    condition: "submit-condition",
    region: "submit-region",
    messengerType: "submit-messenger-type",
    messengerHandle: "submit-messenger-handle",
    imageUpload: "submit-image-upload",
    note: "submit-note",
  } as const;

  const getArchiveLoadingMessage = () =>
    language === "kr" ? "바틀 목록을 불러오는 중..." : "Loading bottle archive...";
  const getArchiveReadyMessage = () =>
    language === "kr" ? "바틀 목록을 불러왔습니다." : "Bottle archive loaded.";
  const getStageMessage = (stage: SubmitStage) => {
    switch (stage) {
      case "loading-archive":
        return getArchiveLoadingMessage();
      case "creating-bottle":
        return language === "kr" ? "바틀 정보를 저장하는 중..." : "Saving bottle...";
      case "creating-listing":
        return language === "kr" ? "등록 정보를 저장하는 중..." : "Saving listing...";
      case "uploading-images":
        return language === "kr" ? "이미지를 업로드하는 중..." : "Uploading images...";
      case "redirecting":
        return language === "kr" ? "상세 페이지를 여는 중..." : "Opening bottle details...";
    }
  };

  const updateSubmitStage = (stage: SubmitStage | null) => {
    setSubmitStage(stage);
    const nextMessage = stage ? getStageMessage(stage) : "";
    setSubmitStatus(nextMessage);
    if (stage) {
      console.info("[submit-stage]", stage, nextMessage);
    }
  };

  useEffect(() => {
    if (!isBackendConfigured) return;

    let cancelled = false;

    const loadArchive = async () => {
      const fetchArchive = async () => {
        try {
          return await fetchBottlesStrict();
        } catch (firstError) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          return await fetchBottlesStrict().catch(() => {
            throw firstError;
          });
        }
      };

      setBottlesLoading(true);
      setArchiveError("");
      setArchiveStatus(getArchiveLoadingMessage());
      updateSubmitStage("loading-archive");

      try {
        const archive = await fetchArchive();
        if (cancelled) return;
        setBottles(archive);
        setArchiveStatus(getArchiveReadyMessage());
      } catch (nextError) {
        if (cancelled) return;
        const nextArchiveError =
          nextError instanceof Error ? nextError.message : "Unable to load bottle archive.";
        setArchiveError(nextArchiveError);
        setArchiveStatus(
          language === "kr"
            ? "바틀 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요."
            : "We couldn't load the bottle archive. Please refresh and try again.",
        );
        setError(
          language === "kr"
            ? "바틀 목록을 불러오지 못했습니다."
            : "We couldn't load the bottle archive.",
        );
      } finally {
        if (cancelled) return;
        setBottlesLoading(false);
        updateSubmitStage(null);
      }
    };

    void loadArchive();

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    if (!isBackendConfigured) return;

    let cancelled = false;

    const loadFx = async () => {
      try {
        const nextFx = await resolveUsdKrwRate();
        if (cancelled) return;
        setFxRate(nextFx.rate);
        setFxStatus(nextFx.label);
      } catch {
        if (cancelled) return;
        setFxRate(0);
        setFxStatus(
          language === "kr"
            ? "실시간 환율을 지금 불러오지 못했습니다. 등록할 때 다시 시도합니다."
            : "Live FX is unavailable right now. We’ll try again when you submit.",
        );
      }
    };

    void loadFx();

    return () => {
      cancelled = true;
    };
  }, [language]);

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
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Authentication</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr" ? "수집가 접근 권한 확인 중" : "Checking your collector access"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          {language === "kr"
            ? "등록 화면을 열기 전에 현재 세션을 확인하고 있습니다."
            : "We&apos;re confirming your session before opening the register flow."}
        </p>
      </div>
    );
  }

  const numericPrice = Number(priceValue || 0);
  const normalizedUsd = priceToUsd(numericPrice, inputCurrency, fxRate);
  const approxKrw = priceToKrw(numericPrice, inputCurrency, fxRate);
  const pendingBottleName = newBottleName.trim() || bottleQuery.trim();

  const composeBottleBatch = (baseBatch: string, nextLabelVersion: string) => {
    const trimmedBatch = baseBatch.trim();
    const trimmedLabelVersion = nextLabelVersion.trim();

    if (!trimmedLabelVersion) return trimmedBatch;
    if (!trimmedBatch) return trimmedLabelVersion;
    if (trimmedBatch.toLowerCase().includes(trimmedLabelVersion.toLowerCase())) {
      return trimmedBatch;
    }

    return `${trimmedBatch} · ${trimmedLabelVersion}`;
  };

  const findMatchingBottleVariant = (
    sourceBottle: Pick<Bottle, "name" | "brand" | "category" | "abv" | "volumeMl">,
    batch: string,
    sourceBottles: Bottle[] = bottles,
  ) => {
    const normalizedBatch = batch.trim().toLowerCase();
    return (
      sourceBottles.find(
        (candidate) =>
          candidate.name.trim().toLowerCase() === sourceBottle.name.trim().toLowerCase() &&
          candidate.brand.trim().toLowerCase() === sourceBottle.brand.trim().toLowerCase() &&
          candidate.category === sourceBottle.category &&
          candidate.batch.trim().toLowerCase() === normalizedBatch &&
          Number(candidate.abv || 0) === Number(sourceBottle.abv || 0) &&
          Number(candidate.volumeMl || 0) === Number(sourceBottle.volumeMl || 0),
      ) ?? null
    );
  };

  const onSubmit = () => {
    if (isSubmitting) {
      return;
    }

    if (!user) {
      setError(
        language === "kr"
          ? "등록하려면 먼저 로그인해주세요."
          : "Please sign in before publishing a listing.",
      );
      return;
    }

    if (bottlesLoading) {
      setError(
        language === "kr"
          ? "바틀 목록을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요."
          : "The bottle archive is still loading. Please try again in a moment.",
      );
      return;
    }

    if (archiveError && !selectedBottle && !isCreatingBottle) {
      setError(
        language === "kr"
          ? "바틀 목록을 불러오지 못했습니다. 새로고침 후 다시 시도하거나 새 바틀을 직접 등록해주세요."
          : "We couldn't load the bottle archive. Please refresh and try again, or create a new bottle manually.",
      );
      return;
    }

    if (!numericPrice) {
      setError(language === "kr" ? "가격을 입력해주세요." : "Enter a price to continue.");
      return;
    }

    setError("");
    setMessage("");
    setRedirectHref("");
    setIsSubmitting(true);
    updateSubmitStage(null);
    void (async () => {
      let redirectTarget = "";
      let createdBottleDuringAttempt = false;
      try {
        const fxState =
          fxRate > 0
            ? {
                rate: fxRate,
                label:
                  fxStatus ||
                  "Using the currently loaded USD/KRW rate.",
              }
            : await resolveUsdKrwRate();
        const effectiveFxRate = fxState.rate;
        setFxRate(effectiveFxRate);
        setFxStatus(fxState.label);

        const normalizedQuery = bottleQuery.trim().toLowerCase();
        let bottle =
          selectedBottle ??
          bottles.find((item) => item.name.trim().toLowerCase() === normalizedQuery) ??
          null;
        let createdBottle = false;
        const shouldCreateBottle = !bottle && (isCreatingBottle || Boolean(pendingBottleName));

        if (bottle && !selectedBottle) {
          setSelectedBottle(bottle);
          setIsCreatingBottle(false);
        }

        if (!bottle && shouldCreateBottle) {
          if (bottlesLoading) {
            setError(
              language === "kr"
                ? "바틀 목록을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요."
                : "The bottle archive is still loading. Please try again in a moment.",
            );
            return;
          }

          if (!pendingBottleName) {
            setError(language === "kr" ? "바틀 이름을 입력해주세요." : "Enter a bottle name to continue.");
            return;
          }

          if (!isEnglishBottleText(pendingBottleName)) {
            setError(
              language === "kr"
                ? "바틀 이름은 영문으로 입력해주세요."
                : "Bottle name must use English letters.",
            );
            return;
          }

          if (newBottleBrand.trim() && !isEnglishBottleText(newBottleBrand.trim())) {
            setError(
              language === "kr"
                ? "브랜드명은 영문으로 입력해주세요."
                : "Brand must use English letters.",
            );
            return;
          }

          try {
            updateSubmitStage("creating-bottle");
            const nextBatch = composeBottleBatch(newBottleBatch, labelVersion);
            const draftBottle = {
              category: newBottleCategory,
              name: sanitizeEnglishBottleText(pendingBottleName).trim(),
              brand: sanitizeEnglishBottleText(newBottleBrand).trim(),
              line: "",
              batch: nextBatch,
              ageStatement: newBottleAgeStatement,
              abv: Number(newBottleAbv || 0),
              volumeMl: Number(newBottleVolumeMl || 750),
              aliases: [],
            };

            const serverBottles = await fetchBottlesStrict();
            const existingMatch = findMatchingBottleVariant(
              {
                name: draftBottle.name,
                brand: draftBottle.brand,
                category: draftBottle.category,
                abv: draftBottle.abv,
                volumeMl: draftBottle.volumeMl,
              },
              nextBatch,
              serverBottles,
            );

            if (existingMatch) {
              bottle = existingMatch;
              setBottles(serverBottles);
            } else {
              bottle = await createBottle(draftBottle);
              createdBottle = true;
              createdBottleDuringAttempt = true;
            }
          } catch (createError) {
            setError(
              createError instanceof Error
                ? createError.message
                : language === "kr"
                  ? "바틀을 생성하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요."
                  : "We couldn't create the bottle. Please check the fields and try again.",
            );
            return;
          }

          setBottles((current) => [bottle!, ...current]);
          setSelectedBottle(bottle);
          setBottleQuery(bottle.name);
          setIsCreatingBottle(true);
        }

        if (!bottle) {
          setError(
            language === "kr"
              ? "기존 바틀을 선택하거나 새 바틀을 먼저 등록해주세요."
              : "Choose an existing bottle or create a new one first.",
          );
          return;
        }

        const desiredBatch = composeBottleBatch(bottle.batch, labelVersion);
        if (desiredBatch !== bottle.batch.trim()) {
          let matchingVariant = findMatchingBottleVariant(bottle, desiredBatch);

          if (!matchingVariant) {
            const serverBottles = await fetchBottlesStrict();
            matchingVariant = findMatchingBottleVariant(bottle, desiredBatch, serverBottles);
            if (matchingVariant) {
              setBottles(serverBottles);
            }
          }

          if (matchingVariant) {
            bottle = matchingVariant;
          } else {
            updateSubmitStage("creating-bottle");
            const createdVariant = await createBottle({
              category: bottle.category,
              name: bottle.name,
              brand: bottle.brand,
              line: bottle.line,
              batch: desiredBatch,
              ageStatement: bottle.ageStatement,
              abv: bottle.abv,
              volumeMl: bottle.volumeMl,
              aliases: [],
              masterImageUrl: bottle.masterImageUrl,
              masterPreviewImageUrl: bottle.masterPreviewImageUrl,
              imageUrl: bottle.imageUrl,
            });
            bottle = createdVariant;
            createdBottleDuringAttempt = true;
            setBottles((current) => [createdVariant, ...current]);
          }
        }

        if (inputCurrency === "KRW" && !effectiveFxRate) {
          setError(
            language === "kr"
              ? "USD/KRW 환율을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
              : "We couldn't load the USD/KRW rate right now. Please try again.",
          );
          return;
        }

        const result = await submitListing(
          user,
          {
            bottle,
            inputPriceValue: numericPrice,
            inputCurrency,
            quantity: Number(quantity || 1),
            condition,
            region,
            messengerType,
            messengerHandle,
            note,
            imageFile,
          },
          effectiveFxRate,
          {
            onStageChange: (stage) => updateSubmitStage(stage),
          },
        );
        setMessage(
          [
            createdBottle
              ? language === "kr"
                ? "바틀과 등록 정보가 저장되었습니다."
                : "Bottle and listing saved."
              : language === "kr"
                ? "등록 정보가 저장되었습니다."
                : "Listing saved.",
            imageFile && !result.imageUploaded
              ? result.uploadIssue
                ? language === "kr"
                  ? `이미지는 업로드되지 않았습니다: ${result.uploadIssue}`
                  : `Images were not uploaded: ${result.uploadIssue}`
                : language === "kr"
                  ? "이미지는 업로드되지 않았습니다."
                  : "Images were not uploaded."
              : null,
          ]
            .filter(Boolean)
            .join(" "),
        );
        redirectTarget = `/bottle?id=${bottle.id}`;
        setRedirectHref(redirectTarget);
        updateSubmitStage("redirecting");
        setIsSubmitting(false);
        window.setTimeout(() => {
          window.location.assign(redirectTarget);
        }, 40);
        return;
      } catch (nextError) {
        const fallbackMessage =
          createdBottleDuringAttempt
            ? language === "kr"
              ? "바틀은 생성됐지만 등록을 끝내지 못했습니다. 등록 화면에서 방금 만든 바틀을 선택해 다시 시도해주세요."
              : "The bottle was created, but the listing could not be completed. Reopen submit, select the bottle, and try again."
            : language === "kr"
              ? "등록을 완료하지 못했습니다. 다시 시도해주세요."
              : "We couldn't finish the listing. Please try again.";
        const nextMessage =
          nextError instanceof Error && nextError.message
            ? createdBottleDuringAttempt
              ? `${nextError.message} ${fallbackMessage}`
              : nextError.message
            : fallbackMessage;
        setError(nextMessage);
      } finally {
        if (!redirectTarget) {
          setIsSubmitting(false);
          updateSubmitStage(null);
        }
      }
    })();
  };

  if (!user) {
    return (
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Authentication required</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr"
            ? "수집가를 위한 바틀 시장 가격 추적 로그인"
            : "Sign in for collectors tracking bottle market prices"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          {language === "kr"
            ? "Google로 로그인하거나 계정을 만들어 바틀 시장 데이터를 탐색하고, 등록 내역을 추적하며, 아카이브에 가격 기준 정보를 더해보세요."
            : "Sign in with Google or create an account to explore bottle market data, track listings, and contribute bottle price references to the archive."}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell"
        >
          {language === "kr" ? "로그인으로 이동" : "Go to login"}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="panel p-6">
        <p className="eyebrow">{language === "kr" ? "등록" : "Submit listing"}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr" ? "내 바틀 등록" : "Register your bottle"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          {language === "kr" ? "내 바틀의 시장 가격을 설정하세요." : "Set the market price of your bottle."}
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <label htmlFor={fieldIds.bottleQuery} className="mb-2 block text-sm font-medium text-ink">
              {language === "kr" ? "바틀 선택" : "Bottle selector"}
            </label>
            <BottleSelector
              inputId={fieldIds.bottleQuery}
              bottles={bottles}
              loading={bottlesLoading}
              selectedBottle={selectedBottle}
              onSelect={(bottle) => {
                setSelectedBottle(bottle);
                setBottleQuery(bottle.name);
                setIsCreatingBottle(false);
              }}
              query={bottleQuery}
              onQueryChange={(query) => {
                setBottleQuery(query);
                setSelectedBottle(null);
              }}
              emptyAction={
                bottleQuery.trim() ? (
                  <button
                    type="button"
                    disabled={bottlesLoading}
                    onClick={() => {
                      setIsCreatingBottle(true);
                      setNewBottleName(sanitizeEnglishBottleText(bottleQuery.trim()));
                      setNewBottleBrand("");
                    }}
                    className="button-secondary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {language === "kr" ? "새 바틀 만들기" : "Create new bottle"}
                  </button>
                ) : null
              }
            />
            {archiveStatus ? (
              <p className={`mt-2 text-xs leading-5 ${archiveError ? "text-red-600" : "text-ink/55"}`}>
                {archiveStatus}
              </p>
            ) : null}
          </div>

          {isCreatingBottle ? (
            <div className="space-y-4 rounded-3xl border border-[#e2ddd3] bg-[#f5f2ec] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#111111]">{language === "kr" ? "새 바틀 등록" : "Register new bottle"}</p>
                  <p className="text-xs text-neutral-500">
                    {language === "kr"
                      ? "먼저 바틀을 생성한 뒤, 그 다음 등록이 저장됩니다."
                      : "This bottle will be created first, then your listing will be posted."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingBottle(false)}
                  className="text-sm font-medium text-neutral-500"
                >
                  {language === "kr" ? "취소" : "Cancel"}
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={fieldIds.newCategory} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "카테고리" : "Category"}
                  </label>
                  <select
                    id={fieldIds.newCategory}
                    value={newBottleCategory}
                    onChange={(event) => setNewBottleCategory(event.target.value as SpiritCategory)}
                    className="field w-full"
                  >
                    {CATEGORIES.map((option) => (
                      <option key={option}>{tCategory(language, option)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={fieldIds.newName} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "바틀 이름" : "Bottle name"}
                  </label>
                  <input
                    id={fieldIds.newName}
                    value={newBottleName}
                    onChange={(event) =>
                      setNewBottleName(sanitizeEnglishBottleText(event.target.value))
                    }
                    className="field w-full"
                    placeholder="Elijah Craig Barrel Proof C923"
                    inputMode="text"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={fieldIds.newBrand} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "브랜드" : "Brand"}
                  </label>
                  <input
                    id={fieldIds.newBrand}
                    value={newBottleBrand}
                    onChange={(event) =>
                      setNewBottleBrand(sanitizeEnglishBottleText(event.target.value))
                    }
                    className="field w-full"
                    placeholder="Heaven Hill"
                    inputMode="text"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label htmlFor={fieldIds.newBatch} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "캐스크/배치 번호" : "Cask/batch Nr."}
                  </label>
                  <input
                    id={fieldIds.newBatch}
                    value={newBottleBatch}
                    onChange={(event) => setNewBottleBatch(event.target.value)}
                    className="field w-full"
                    placeholder="Cask 9 / Batch 9"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor={fieldIds.newAge} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "숙성 연수" : "Age"}
                  </label>
                  <input
                    id={fieldIds.newAge}
                    value={newBottleAgeStatement}
                    onChange={(event) => setNewBottleAgeStatement(event.target.value)}
                    className="field w-full"
                    placeholder="12 Years"
                  />
                </div>
                <div>
                  <label htmlFor={fieldIds.newAbv} className="mb-2 block text-sm font-medium text-ink">
                    ABV
                  </label>
                  <input
                    id={fieldIds.newAbv}
                    type="number"
                    min="0"
                    step="0.1"
                    value={newBottleAbv}
                    onChange={(event) => setNewBottleAbv(event.target.value)}
                    className="field w-full"
                    placeholder="62.5"
                  />
                </div>
                <div>
                  <label htmlFor={fieldIds.newVolume} className="mb-2 block text-sm font-medium text-ink">
                    {language === "kr" ? "용량 ml" : "Volume ml"}
                  </label>
                  <select
                    id={fieldIds.newVolume}
                    value={newBottleVolumeMl}
                    onChange={(event) => setNewBottleVolumeMl(event.target.value)}
                    className="field w-full"
                  >
                    {BOTTLE_VOLUME_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.toLocaleString("en-US")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs leading-5 text-ink/60">
                {language === "kr"
                  ? "Bottle name과 Brand는 영어로만 입력할 수 있습니다."
                  : "Bottle name and Brand must be entered in English only."}
              </p>
            </div>
          ) : null}

          <div>
            <label htmlFor={fieldIds.labelVersion} className="mb-2 block text-sm font-medium text-ink">
              {language === "kr" ? "라벨 버전" : "Label version"}
            </label>
            <select
              id={fieldIds.labelVersion}
              value={labelVersion}
              onChange={(event) =>
                setLabelVersion(
                  event.target.value as (typeof BOTTLE_LABEL_VERSION_OPTIONS)[number],
                )
              }
              className="field w-full"
            >
              <option value="">{language === "kr" ? "선택 안 함" : "Not specified"}</option>
              {BOTTLE_LABEL_VERSION_OPTIONS.filter(Boolean).map((option) => (
                <option key={option} value={option}>
                  {tLabelVersion(language, option)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-ink/60">
              {language === "kr"
                ? "신형/구형 라벨처럼 가격 차이가 있는 경우, 등록 시점을 기준으로 별도 구분할 수 있습니다."
                : "Use this when the same bottle should be tracked separately by packaging generation, such as New Label or Old Label."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldIds.inputCurrency} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "통화" : "Currency"}
              </label>
              <select
                id={fieldIds.inputCurrency}
                value={inputCurrency}
                onChange={(event) => setInputCurrency(event.target.value as "USD" | "KRW")}
                className="field w-full"
              >
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
            <div>
              <label htmlFor={fieldIds.price} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "가격" : "Price"}
              </label>
              <input
                id={fieldIds.price}
                type="number"
                min="0"
                step="0.01"
                value={priceValue}
                onChange={(event) => setPriceValue(event.target.value)}
                className="field w-full"
                placeholder={inputCurrency === "KRW" ? "290000" : "200"}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={fieldIds.quantity} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "수량" : "Quantity"}
              </label>
              <input
                id={fieldIds.quantity}
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="field w-full"
              />
            </div>
            <div>
              <label htmlFor={fieldIds.condition} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "상태" : "Condition"}
              </label>
              <select
                id={fieldIds.condition}
                value={condition}
                onChange={(event) => setCondition(event.target.value)}
                className="field w-full"
              >
                {LISTING_CONDITIONS.map((option) => (
                  <option key={option}>{tCondition(language, option)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fieldIds.region} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "지역" : "Region"}
              </label>
              <input
                id={fieldIds.region}
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder={language === "kr" ? "서울" : "Seoul"}
                className="field w-full"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldIds.messengerType} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "메신저" : "Messenger"}
              </label>
              <select
                id={fieldIds.messengerType}
                value={messengerType}
                onChange={(event) => setMessengerType(event.target.value as MessengerType)}
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
              <label htmlFor={fieldIds.messengerHandle} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "메신저 ID" : "Messenger ID"}
              </label>
              <input
                id={fieldIds.messengerHandle}
                value={messengerHandle}
                onChange={(event) => setMessengerHandle(event.target.value)}
                placeholder={language === "kr" ? "메신저 핸들을 입력하세요" : "Enter your messenger handle"}
                className="field w-full"
              />
            </div>
          </div>

          <div>
            <div>
              <label htmlFor={fieldIds.imageUpload} className="mb-2 block text-sm font-medium text-ink">
                {language === "kr" ? "이미지 업로드" : "Image upload"}
              </label>
              <input
                id={fieldIds.imageUpload}
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                className="field w-full"
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/60">
              {language === "kr"
                ? "Caskfolio에 업로드된 이미지는 공식 인스타그램에 소개될 수 있습니다."
                : "Images uploaded to Caskfolio may be featured on our official Instagram."}
            </p>
          </div>

          <div>
            <label htmlFor={fieldIds.note} className="mb-2 block text-sm font-medium text-ink">
              {language === "kr" ? "메모" : "Note"}
            </label>
            <textarea
              id={fieldIds.note}
              rows={4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={language === "kr" ? "선택 입력 사항" : "Optional listing context"}
              className="field w-full"
            />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="button-primary disabled:opacity-60"
          >
            {isSubmitting ? (language === "kr" ? "등록 중..." : "Submitting...") : language === "kr" ? "등록 게시" : "Publish listing"}
          </button>

          {submitStatus ? (
            <p data-stage={submitStage ?? ""} className="text-sm text-ink/60">
              {submitStatus}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {redirectHref ? (
            <Link href={redirectHref} className="text-sm text-ink underline underline-offset-4">
              {language === "kr" ? "상세 페이지로 이동" : "Open bottle detail"}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-cask">{language === "kr" ? "실시간 환산 미리보기" : "Live conversion preview"}</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
            {language === "kr"
              ? "인덱스 비교 방식으로 저장됩니다"
              : "Stored the way the index compares prices"}
          </h2>

          <div className="mt-6 space-y-4 rounded-3xl bg-mist p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink/55">{language === "kr" ? "바틀" : "Bottle"}</span>
              <span className="text-right text-sm font-medium text-ink">
                {selectedBottle?.name || pendingBottleName || (language === "kr" ? "바틀을 선택하세요" : "Select a bottle")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink/55">{language === "kr" ? "입력 가격" : "Input price"}</span>
              <span className="text-right text-sm font-medium text-ink">
                {inputCurrency} {numericPrice.toLocaleString("en-US")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink/55">{language === "kr" ? "등록 시 환율" : "FX rate at entry"}</span>
              <span className="text-right text-sm font-medium text-ink">
                {fxRate ? `${fxRate.toLocaleString("en-US")} KRW / USD` : language === "kr" ? "없음" : "Missing"}
              </span>
            </div>
            {fxStatus ? <p className="text-xs leading-5 text-ink/55">{fxStatus}</p> : null}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink/55">{language === "kr" ? "환산 USD" : "Normalized USD"}</span>
              <span className="text-right text-sm font-semibold text-ink">
                {formatUsd(normalizedUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink/55">{language === "kr" ? "예상 KRW" : "Approx KRW"}</span>
              <span className="text-right text-sm font-semibold text-ink">
                {formatKrw(approxKrw)}
              </span>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-cask">{language === "kr" ? "플랫폼 안내" : "Platform notes"}</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/70">
            <li>{language === "kr" ? "정확한 등록을 위해 선명한 바틀 이미지를 업로드해주세요." : "Please upload clear bottle images to ensure accurate listings."}</li>
            <li>{language === "kr" ? "바틀의 시장 인식 가치에 맞춰 직접 가격을 설정하세요." : "Set your own market price based on your bottle&apos;s perceived value."}</li>
            <li>{language === "kr" ? "문의 수신을 원한다면 선호하는 메신저 ID를 연결하세요." : "If you wish to receive inquiries, connect your preferred messenger ID."}</li>
            <li>{language === "kr" ? "모든 커뮤니케이션은 플랫폼 외부에서 독립적으로 이루어집니다." : "All communication happens independently outside the platform."}</li>
            <li>
              {language === "kr"
                ? "환율은 공개 데이터 소스에서 자동으로 불러와 등록 시점의 참고값으로 사용됩니다."
                : "Exchange rates are automatically fetched from a public data source and used as a reference at the time of listing."}
            </li>
            <li>{language === "kr" ? "Caskfolio는 마켓플레이스가 아닌 가격 인덱스이자 아카이브입니다." : "Caskfolio is a price index and archive, not a marketplace."}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
