"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { useLanguage } from "@/components/providers";
import { fetchNewsEntries, NEWS_PAGE_SIZE, type NewsEntry } from "@/lib/data/news";
import { formatUiDate } from "@/lib/i18n";

function NewsCardImage({
  src,
  alt,
  type,
}: {
  src?: string;
  alt: string;
  type?: "article" | "video";
}) {
  const [imageSrc, setImageSrc] = useState(src || "/news-fallback.png");

  useEffect(() => {
    setImageSrc(src || "/news-fallback.png");
  }, [src]);

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={type === "video" ? "h-full w-full object-contain" : "h-full w-full object-cover"}
      onError={() => setImageSrc("/news-fallback.png")}
    />
  );
}

export default function NewsPage() {
  const { language } = useLanguage();
  const [articles, setArticles] = useState<NewsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalArticles, setTotalArticles] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalArticles / NEWS_PAGE_SIZE));

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchNewsEntries(page);
        setArticles(data.entries);
        setTotalArticles(data.total);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load news.");
        setArticles([]);
        setTotalArticles(0);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [page]);

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <p className="eyebrow">{language === "kr" ? "뉴스" : "News"}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr" ? "큐레이션된 주류 콘텐츠" : "Curated spirits coverage"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          {language === "kr"
            ? "위스키와 주류 매체의 에디토리얼 업데이트를 모았습니다."
            : "Editorial updates from whisky and spirits publications."}
        </p>
        {!loading && totalArticles ? (
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
            {language === "kr"
              ? `최신순 · ${NEWS_PAGE_SIZE}개씩 보기 · 총 ${totalArticles}개`
              : `Latest first · ${NEWS_PAGE_SIZE} per page · ${totalArticles} total`}
          </p>
        ) : null}
      </section>

      {hasHydrated && !loading && !articles.length ? (
        <EmptyState
          title={error ? (language === "kr" ? "뉴스를 불러올 수 없습니다" : "Unable to load news") : language === "kr" ? "표시할 뉴스가 없습니다" : "No news articles available"}
          description={error || (language === "kr" ? "선택된 피드에서 표시할 큐레이션 콘텐츠가 없습니다." : "The selected feeds did not return any curated articles.")}
        />
      ) : null}

      {hasHydrated && loading ? (
        <div className="rounded-2xl border border-[#e4dfd6] bg-white px-5 py-4 text-sm text-[#666159]">
          {language === "kr" ? "큐레이션된 뉴스를 불러오는 중입니다..." : "Loading curated coverage..."}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:grid-cols-4 xl:gap-3">
        {articles.map((article) => (
          <article key={article.id} className="panel overflow-hidden">
            <div className={`aspect-[0.98] ${article.type === "video" ? "bg-black" : "bg-[#f3f2ee]"}`}>
              <NewsCardImage src={article.imageUrl} alt={article.title} type={article.type} />
            </div>

            <div className="space-y-2.5 p-2.5 sm:p-3">
              <div>
                <h2 className="text-[15px] font-bold leading-snug tracking-[-0.03em] text-[#111111] sm:text-base">
                  {article.title}
                </h2>
                <p className="mt-1.5 line-clamp-2 text-[11px] leading-4.5 text-[#666159] sm:text-xs sm:leading-5">
                  {article.summary}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#7b746a] sm:text-[9px] sm:tracking-[0.18em]">
                <span>{article.source}</span>
                <span className="h-1 w-1 rounded-full bg-[#c9c2b7]" />
                <span>{formatUiDate(article.date, language)}</span>
              </div>
              <a
                href={article.url ?? article.link ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center bg-[#111111] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-black sm:px-3.5 sm:py-2"
              >
                {article.type === "video"
                  ? language === "kr"
                    ? "영상 보기"
                    : "Watch Video"
                  : language === "kr"
                    ? "원문 보기"
                    : "Read Source"}
              </a>
            </div>
          </article>
        ))}

      </section>

      {hasHydrated && !loading && totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-2 text-sm" aria-label="News pages">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {language === "kr" ? "이전" : "Previous"}
          </button>
          <span className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 font-medium text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {language === "kr" ? "다음" : "Next"}
          </button>
        </nav>
      ) : null}
    </div>
  );
}
