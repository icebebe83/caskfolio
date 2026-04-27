"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { DemoBanner } from "@/components/demo-banner";
import { EmptyState } from "@/components/empty-state";
import { SetupNotice } from "@/components/setup-notice";
import {
  fetchAdminStatus,
  runNewsImportAction,
  runReferenceSyncAction,
} from "@/lib/admin/actions";
import { useAuth } from "@/components/providers";
import {
  ADMIN_NAV_ITEMS,
  createBannerDraft,
  createBottleDraft,
  createEmptyBannerDraft,
  createEmptyBottleDraft,
  createEmptyManualNewsDraft,
  createEmptyReferenceDraft,
  createReferenceDraft,
  EMPTY_METRICS,
  EMPTY_SERVER_STATUS,
  getAuditLogLabel,
  getAdminUserLabel,
  getAdminUserMeta,
  getBannerListLabel,
} from "@/lib/admin/dto";
import { formatDate } from "@/lib/format";
import { isBackendConfigured } from "@/lib/backend/client";
import {
  checkAdmin,
  createManualNews,
  deleteBottle,
  deleteBottleReferencePrice,
  deleteListing,
  fetchAuditLogs,
  deleteHomepageBanner,
  deleteNewsItem,
  fetchAdminListings,
  fetchAdminMetrics,
  fetchAdminNews,
  fetchAdminUsers,
  fetchBottles,
  fetchBottleReferencePrice,
  fetchHomepageBanners,
  fetchReports,
  reorderHomepageBanners,
  saveHomepageBanner,
  saveBottleReferencePrice,
  seedSampleData,
  syncLocalHomepageBannersToRemote,
  updateBottle,
  updateBottleHotFlag,
  updateBottleMasterImage,
  updateListingStatus,
  updateNewsImageUrl,
  updateNewsPriority,
  updateReportStatus,
  updateUserAdminRole,
} from "@/lib/data/store";
import type {
  AdminNewsItem,
  AuditLogEntry,
  Bottle,
  Listing,
  Report,
} from "@/lib/types";
import type {
  AdminBannerDraft,
  AdminBottleDraft,
  AdminManualNewsDraft,
  AdminReferenceDraft,
  AdminSection,
  AdminServerStatus,
} from "@/lib/admin/dto";
import type { AdminDashboardMetrics, AdminProfileSummary, HomepageBanner, SpiritCategory } from "@/lib/types";

const DEV_ADMIN_ACTION_HOSTS = new Set(["localhost", "127.0.0.1", "172.20.40.66"]);

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>("Dashboard");
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>(EMPTY_METRICS);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [newsItems, setNewsItems] = useState<AdminNewsItem[]>([]);
  const [users, setUsers] = useState<AdminProfileSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [selectedBottleId, setSelectedBottleId] = useState("");
  const [bottleDraft, setBottleDraft] = useState<AdminBottleDraft>(createEmptyBottleDraft);
  const [referenceDraft, setReferenceDraft] = useState<AdminReferenceDraft>(createEmptyReferenceDraft);
  const [masterImageFile, setMasterImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [heroBanners, setHeroBanners] = useState<HomepageBanner[]>([]);
  const [selectedBannerId, setSelectedBannerId] = useState("");
  const [bannerDraft, setBannerDraft] = useState<AdminBannerDraft>(() => createEmptyBannerDraft(0));
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
  const [serverStatus, setServerStatus] = useState<AdminServerStatus>(EMPTY_SERVER_STATUS);
  const [isPending, startTransition] = useTransition();
  const [manualNews, setManualNews] = useState<AdminManualNewsDraft>(createEmptyManualNewsDraft);
  const [newsImageDrafts, setNewsImageDrafts] = useState<Record<string, string>>({});
  const [adminServerActionsEnabled, setAdminServerActionsEnabled] = useState(false);
  const newsImportActionsEnabled = true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    const forceEnabled = process.env.NEXT_PUBLIC_ENABLE_ADMIN_SERVER_ACTIONS === "true";
    setAdminServerActionsEnabled(forceEnabled || DEV_ADMIN_ACTION_HOSTS.has(hostname));
  }, []);

  const loadAdminData = async () => {
    const [metricsData, listingDocs, reportDocs, bottleDocs, newsDocs, userDocs, heroBannerData, auditLogData] = await Promise.all([
      fetchAdminMetrics(),
      fetchAdminListings(),
      fetchReports(),
      fetchBottles(),
      fetchAdminNews(),
      fetchAdminUsers(),
      fetchHomepageBanners(),
      fetchAuditLogs(12),
    ]);
    setMetrics(metricsData);
    setListings(listingDocs);
    setReports(reportDocs);
    setBottles(bottleDocs);
    setNewsItems(newsDocs);
    setNewsImageDrafts(Object.fromEntries(newsDocs.map((item) => [item.id, item.imageUrl])));
    setUsers(userDocs);
    setHeroBanners(heroBannerData);
    setAuditLogs(auditLogData);
    if (heroBannerData[0]) {
      setSelectedBannerId((current) => current || heroBannerData[0].id);
    }
    if (bottleDocs[0]) {
      setSelectedBottleId((current) => current || bottleDocs[0].id);
    }
  };

  const loadServerStatus = async () => {
    const data = await fetchAdminStatus();
    if (data) setServerStatus(data);
  };

  useEffect(() => {
    if (!isBackendConfigured || !user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const adminAllowed = await checkAdmin(user.uid);
        setIsAdmin(adminAllowed);
        if (!adminAllowed) return;
        try {
          await syncLocalHomepageBannersToRemote();
        } catch {
          // Keep the admin UI usable even if banner backfill cannot sync right now.
        }
        await loadAdminData();
        await loadServerStatus();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to load admin tools.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadServerStatus();
    if (!serverStatus.referenceSync.running && !serverStatus.newsImport.running) return;

    const interval = window.setInterval(() => {
      void loadServerStatus();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [isAdmin, serverStatus.referenceSync.running, serverStatus.newsImport.running]);

  useEffect(() => {
    const selectedBottle = bottles.find((bottle) => bottle.id === selectedBottleId);
    if (selectedBottle) {
      setBottleDraft(createBottleDraft(selectedBottle));
      setMasterImageFile(null);
    }
  }, [bottles, selectedBottleId]);

  useEffect(() => {
    if (!selectedBottleId) {
      setReferenceDraft(createEmptyReferenceDraft());
      return;
    }

    const loadReference = async () => {
      try {
        const referencePrice = await fetchBottleReferencePrice(selectedBottleId);
        setReferenceDraft(
          referencePrice ? createReferenceDraft(referencePrice) : createEmptyReferenceDraft(),
        );
      } catch {
        setReferenceDraft(createEmptyReferenceDraft());
      }
    };

    void loadReference();
  }, [selectedBottleId]);

  useEffect(() => {
    const selectedBanner = heroBanners.find((banner) => banner.id === selectedBannerId);
    if (!selectedBanner) return;
    setBannerDraft(createBannerDraft(selectedBanner));
    setBannerImageFile(null);
  }, [heroBanners, selectedBannerId]);

  const bottleMap = useMemo(() => new Map(bottles.map((bottle) => [bottle.id, bottle])), [bottles]);
  const listingMap = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const selectedBottle = bottles.find((bottle) => bottle.id === selectedBottleId) ?? null;

  if (!isBackendConfigured) {
    return (
      <div className="space-y-6">
        <DemoBanner />
        <SetupNotice />
      </div>
    );
  }

  if (!authLoading && !user) {
    return (
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Admin access</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          Sign in to use moderation tools.
        </h1>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (!loading && !isAdmin) {
    return (
      <EmptyState
        title="Admin role required"
        description="Create an `admins` row for the signed-in user to enable moderation tools."
      />
    );
  }

  const refresh = async () => {
    await loadAdminData();
  };

  const withAction = (action: () => Promise<void>, successMessage: string) => {
    startTransition(async () => {
      try {
        setError("");
        await action();
        await refresh();
        setMessage(successMessage);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Admin action failed.");
      }
    });
  };

  const onSeed = () => {
    if (!user) return;
    withAction(() => seedSampleData(user), "Sample data seeded.");
  };

  const onListingAction = (listingId: string, status: Listing["status"]) => {
    withAction(() => updateListingStatus(listingId, status), `Listing marked ${status}.`);
  };

  const onListingDelete = (listingId: string) => {
    withAction(() => deleteListing(listingId), "Listing deleted.");
  };

  const onReportResolve = (reportId: string) => {
    withAction(() => updateReportStatus(reportId, "resolved"), "Report resolved.");
  };

  const onReportDeactivateListing = (report: Report) => {
    withAction(async () => {
      await updateListingStatus(report.listingId, "inactive");
      await updateReportStatus(report.id, "resolved");
    }, "Listing marked inactive and report resolved.");
  };

  const onSaveBottle = () => {
    if (!selectedBottleId) return;
    withAction(async () => {
      await updateBottle(selectedBottleId, {
        name: bottleDraft.name,
        brand: bottleDraft.brand,
        category: bottleDraft.category,
        batch: bottleDraft.batch,
        abv: Number(bottleDraft.abv || 0),
        volumeMl: Number(bottleDraft.volumeMl || 750),
        aliases: bottleDraft.aliases
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        hotBottle: bottleDraft.hotBottle,
      });
      if (masterImageFile) {
        await updateBottleMasterImage(selectedBottleId, masterImageFile);
        setMasterImageFile(null);
      }
    }, "Bottle updated.");
  };

  const onDeleteBottle = () => {
    if (!selectedBottleId || !selectedBottle) return;
    const confirmed = window.confirm(
      `Delete "${selectedBottle.name}"? This will also remove linked listings, reports, and reference prices.`,
    );
    if (!confirmed) return;

    withAction(async () => {
      const nextBottleId =
        bottles.find((bottle) => bottle.id !== selectedBottleId)?.id ?? "";
      await deleteBottle(selectedBottleId);
      setSelectedBottleId(nextBottleId);
      setMasterImageFile(null);
      setReferenceDraft(createEmptyReferenceDraft());
    }, "Bottle deleted.");
  };

  const onSaveReferencePrice = () => {
    if (!selectedBottleId) return;
    withAction(
      async () => {
        await saveBottleReferencePrice(selectedBottleId, {
          source: referenceDraft.source,
          referencePriceUsd: Number(referenceDraft.referencePriceUsd || 0),
          sourceUrl: referenceDraft.sourceUrl,
          updatedAt: referenceDraft.updatedAt,
        });
      },
      "Global reference price saved.",
    );
  };

  const onDeleteReferencePrice = () => {
    if (!selectedBottleId) return;
    withAction(async () => {
      await deleteBottleReferencePrice(selectedBottleId);
      setReferenceDraft(createEmptyReferenceDraft());
    }, "Global reference price removed.");
  };

  const onToggleHotBottleById = (bottleId: string) => {
    const targetBottle = bottleMap.get(bottleId);
    if (!targetBottle) return;
    withAction(
      () => updateBottleHotFlag(bottleId, !targetBottle.hotBottle),
      !targetBottle.hotBottle ? "Hot bottle enabled." : "Hot bottle removed.",
    );
  };

  const onCreateManualNews = () => {
    withAction(
      async () => {
        await createManualNews(manualNews);
        setManualNews(createEmptyManualNewsDraft());
      },
      "Manual news added.",
    );
  };

  const onCreateBanner = () => {
    if (heroBanners.length >= 10) return;
    setSelectedBannerId("");
    setBannerDraft(createEmptyBannerDraft(heroBanners.length));
    setBannerImageFile(null);
  };

  const onSaveHeroBanner = () => {
    withAction(
      async () => {
        const saved = await saveHomepageBanner({
          id: bannerDraft.id || undefined,
          label: bannerDraft.label,
          headline: bannerDraft.headline,
          subcopy: bannerDraft.subcopy,
          isActive: bannerDraft.isActive,
          type: bannerDraft.type,
          imageUrl: bannerDraft.imageUrl,
          imageFile: bannerImageFile,
          displayOrder: bannerDraft.displayOrder,
        });
        setSelectedBannerId(saved.id);
        setBannerImageFile(null);
      },
      bannerDraft.id ? "Homepage banner updated." : "Homepage banner created.",
    );
  };

  const onSaveHeadlineCopy = () => {
    withAction(
      async () => {
        const saved = await saveHomepageBanner({
          id: bannerDraft.id || undefined,
          label: bannerDraft.label,
          headline: bannerDraft.headline,
          subcopy: bannerDraft.subcopy,
          isActive: bannerDraft.isActive,
          type: bannerDraft.type,
          imageUrl: bannerDraft.imageUrl,
          displayOrder: bannerDraft.displayOrder,
        });
        setSelectedBannerId(saved.id);
      },
      "Homepage copy updated.",
    );
  };

  const onDeleteBanner = (bannerId: string) => {
    withAction(async () => {
      await deleteHomepageBanner(bannerId);
      if (selectedBannerId === bannerId) {
        setSelectedBannerId("");
        setBannerDraft(createEmptyBannerDraft(Math.max(0, heroBanners.length - 1)));
        setBannerImageFile(null);
      }
    }, "Homepage banner removed.");
  };

  const onMoveBanner = (bannerId: string, direction: "up" | "down") => {
    const ordered = [...heroBanners].sort((a, b) => a.displayOrder - b.displayOrder);
    const from = ordered.findIndex((banner) => banner.id === bannerId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ordered.length) return;

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    withAction(
      () => reorderHomepageBanners(ordered.map((banner) => banner.id)),
      "Homepage banner order updated.",
    );
  };

  const onNewsPriorityChange = (newsId: string, priority: "high" | "medium" | "low") => {
    withAction(() => updateNewsPriority(newsId, priority), "News priority updated.");
  };

  const onNewsImageUpdate = (newsId: string) => {
    withAction(
      () => updateNewsImageUrl(newsId, newsImageDrafts[newsId] ?? ""),
      "News thumbnail updated.",
    );
  };

  const onNewsDelete = (newsId: string) => {
    withAction(() => deleteNewsItem(newsId), "News item removed.");
  };

  const onToggleAdminRole = (profile: AdminProfileSummary) => {
    withAction(
      () => updateUserAdminRole(profile.id, profile.role !== "admin"),
      profile.role === "admin" ? "Admin role removed." : "Admin role granted.",
    );
  };

  const onRunReferenceSync = async () => {
    if (!adminServerActionsEnabled) {
      setError("This action is not available in production yet.");
      return;
    }
    try {
      setError("");
      setMessage("");
      const data = await runReferenceSyncAction();
      setServerStatus(data);
      setMessage(
        data.referenceSync.running
          ? "Reference sync started."
          : "Reference sync request accepted.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to start reference sync.",
      );
    }
  };

  const onRunNewsImport = async () => {
    if (!newsImportActionsEnabled) {
      setError("This action is not available in production yet.");
      return;
    }
    try {
      setError("");
      setMessage("");
      const data = await runNewsImportAction();
      setServerStatus(data);
      setMessage(data.newsImport.message || "News import completed.");
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to start news import.");
    }
  };

  const renderDashboard = () => (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Today Visitors", value: metrics.todayVisitors },
          { label: "Total Visitors", value: metrics.totalVisitors },
          { label: "Today Listings", value: metrics.todayListings },
          { label: "Total Listings", value: metrics.totalListings },
          { label: "Active Listings", value: metrics.activeListings },
          { label: "Open Reports", value: metrics.openReports },
        ].map((card) => (
          <div key={card.label} className="panel p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-cask">{card.label}</p>
            <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-ink/8 px-6 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Listings</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Latest moderation queue
            </h2>
          </div>
          <div className="divide-y divide-ink/8">
            {listings.slice(0, 8).map((listing) => {
              const linkedBottle = bottleMap.get(listing.bottleId);
              return (
                <div key={listing.id} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-medium text-ink">{listing.bottleName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">
                      {listing.status} · {listing.region} · {formatDate(listing.createdAt)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">
                      Hot bottle: {linkedBottle?.hotBottle ? "Enabled" : "Off"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleHotBottleById(listing.bottleId)}
                      className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                    >
                      {linkedBottle?.hotBottle ? "Remove hot bottle" : "Set hot bottle"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection("Listings")}
                      className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                    >
                      Manage listings
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-8">
          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Reference pricing</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Run reference sync
            </h2>
            <p className="mt-4 text-sm leading-6 text-ink/65">
              Trigger the reference pricing workflow directly from the admin dashboard.
            </p>
            <button
              type="button"
              onClick={onRunReferenceSync}
              disabled={!adminServerActionsEnabled || serverStatus.referenceSync.running}
              className="mt-5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
            >
              {serverStatus.referenceSync.running ? "Reference Sync Running..." : "Run Reference Sync"}
            </button>
            {!adminServerActionsEnabled ? (
              <p className="mt-3 text-sm text-ink/55">
                This action is not available in production yet.
              </p>
            ) : null}
            <div className="mt-4 space-y-2 text-sm text-ink/70">
              <p>
                Status: <span className="font-medium text-ink">{serverStatus.referenceSync.status}</span>
              </p>
              {serverStatus.referenceSync.lastSuccessAt ? (
                <p>
                  Last successful sync:{" "}
                  <span className="font-medium text-ink">
                    {formatDate(serverStatus.referenceSync.lastSuccessAt)}
                  </span>
                </p>
              ) : null}
              {typeof serverStatus.referenceSync.matchedCount === "number" ? (
                <p>
                  Matched:{" "}
                  <span className="font-medium text-ink">{serverStatus.referenceSync.matchedCount}</span>
                  {typeof serverStatus.referenceSync.failedCount === "number" ? (
                    <>
                      {" · "}Failed:{" "}
                      <span className="font-medium text-ink">{serverStatus.referenceSync.failedCount}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
              {serverStatus.referenceSync.message ? (
                <p className="text-xs leading-5 text-ink/55">{serverStatus.referenceSync.message}</p>
              ) : null}
              {serverStatus.referenceSync.lastError ? (
                <p className="text-xs leading-5 text-red-600">{serverStatus.referenceSync.lastError}</p>
              ) : null}
            </div>
          </div>

          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Reports</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Open reports
            </h2>
            <div className="mt-5 space-y-4">
              {reports.filter((report) => report.status === "open").slice(0, 4).map((report) => (
                <div key={report.id} className="rounded-2xl border border-ink/8 bg-mist p-4">
                  <p className="font-medium text-ink">{report.reason}</p>
                  <p className="mt-2 text-sm text-ink/70">{report.note || "No note supplied."}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReportResolve(report.id)}
                      className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      onClick={() => onReportDeactivateListing(report)}
                      className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                    >
                      Deactivate listing
                    </button>
                  </div>
                </div>
              ))}
              {!reports.some((report) => report.status === "open") ? (
                <p className="text-sm text-ink/60">No open reports.</p>
              ) : null}
            </div>
          </div>

          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Audit</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Recent admin activity
            </h2>
            <div className="mt-5 space-y-4">
              {auditLogs.slice(0, 6).map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-ink/8 bg-mist p-4">
                  <p className="font-medium text-ink">{entry.action}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">
                    {entry.targetType}
                    {entry.targetId ? ` · ${entry.targetId}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-ink/70">
                    {getAuditLogLabel(entry)} · {formatDate(entry.createdAt)}
                  </p>
                </div>
              ))}
              {!auditLogs.length ? <p className="text-sm text-ink/60">No audit activity yet.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderListings = () => (
    <section className="panel overflow-hidden">
      <div className="border-b border-ink/8 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Listings</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          Listings management
        </h2>
      </div>
      <div className="divide-y divide-ink/8">
        {listings.slice(0, 50).map((listing) => {
          const linkedBottle = bottleMap.get(listing.bottleId);
          return (
            <div key={listing.id} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-medium text-ink">{listing.bottleName}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">
                  {listing.status} · {listing.region} · {formatDate(listing.createdAt)}
                </p>
                <p className="mt-2 text-xs text-ink/55">
                  Uploader ID: <span className="font-medium text-ink/80">{listing.createdBy}</span>
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">
                  Hot bottle: {linkedBottle?.hotBottle ? "Enabled" : "Off"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onToggleHotBottleById(listing.bottleId)}
                  className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                >
                  {linkedBottle?.hotBottle ? "Remove hot bottle" : "Set hot bottle"}
                </button>
                <button
                  type="button"
                  onClick={() => onListingAction(listing.id, "inactive")}
                  className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                >
                  Mark inactive
                </button>
                <button
                  type="button"
                  onClick={() => onListingAction(listing.id, "active")}
                  className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => onListingDelete(listing.id)}
                  className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderNews = () => (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">News</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          Run news import
        </h2>
        <p className="mt-4 text-sm leading-6 text-ink/65">
          Refresh curated news items and rebuild the site feed from the approved sources.
        </p>
        <button
          type="button"
          onClick={onRunNewsImport}
          disabled={!newsImportActionsEnabled || serverStatus.newsImport.running}
          className="mt-5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
        >
          {serverStatus.newsImport.running ? "News Import Running..." : "Run News Import"}
        </button>
        {!newsImportActionsEnabled ? (
          <p className="mt-3 text-sm text-ink/55">
            This action is not available in production yet.
          </p>
        ) : null}
        <div className="mt-4 space-y-2 text-sm text-ink/70">
          <p>
            Status: <span className="font-medium text-ink">{serverStatus.newsImport.status}</span>
          </p>
          {serverStatus.newsImport.lastSuccessAt ? (
            <p>
              Last successful import:{" "}
              <span className="font-medium text-ink">
                {formatDate(serverStatus.newsImport.lastSuccessAt)}
              </span>
            </p>
          ) : null}
          {serverStatus.newsImport.message ? (
            <p className="text-xs leading-5 text-ink/55">{serverStatus.newsImport.message}</p>
          ) : null}
          {serverStatus.newsImport.lastError ? (
            <p className="text-xs leading-5 text-red-600">{serverStatus.newsImport.lastError}</p>
          ) : null}
        </div>
      </div>

      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">News</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          Add manual news
        </h2>
        <div className="mt-5 space-y-4">
          <input value={manualNews.title} onChange={(event) => setManualNews((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="Title" />
          <textarea value={manualNews.summary} onChange={(event) => setManualNews((current) => ({ ...current, summary: event.target.value }))} rows={4} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="Summary" />
          <input value={manualNews.source} onChange={(event) => setManualNews((current) => ({ ...current, source: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="Source" />
          <input value={manualNews.url} onChange={(event) => setManualNews((current) => ({ ...current, url: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="URL" />
          <input value={manualNews.imageUrl} onChange={(event) => setManualNews((current) => ({ ...current, imageUrl: event.target.value }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm" placeholder="Image URL (optional)" />
          <select value={manualNews.priority} onChange={(event) => setManualNews((current) => ({ ...current, priority: event.target.value as "high" | "medium" | "low" }))} className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
          <button type="button" onClick={onCreateManualNews} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90">
            Add manual news
          </button>
        </div>
      </div>

      <div className="panel overflow-hidden lg:col-span-2">
        <div className="border-b border-ink/8 px-6 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-cask">News</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
            Editorial management
          </h2>
        </div>
        <div className="divide-y divide-ink/8">
          {newsItems.slice(0, 30).map((item) => (
            <div key={item.id} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-medium text-ink">{item.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">
                  {item.source} · {formatDate(item.publishedAt)} · {item.type}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                  <div className="aspect-[1.15] overflow-hidden rounded-xl border border-ink/10 bg-[#f3f2ee]">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = "/news-fallback.png";
                        }}
                      />
                    ) : null}
                  </div>
                  <input
                    value={newsImageDrafts[item.id] ?? ""}
                    onChange={(event) =>
                      setNewsImageDrafts((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    className="w-full rounded-full border border-ink/10 bg-white px-3 py-2 text-xs"
                    placeholder="Image URL"
                  />
                  <button
                    type="button"
                    onClick={() => onNewsImageUpdate(item.id)}
                    className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium text-ink"
                  >
                    Save image
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={item.priority}
                  onChange={(event) => onNewsPriorityChange(item.id, event.target.value as "high" | "medium" | "low")}
                  className="rounded-full border border-ink/10 bg-white px-3 py-2 text-xs font-medium"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="button"
                  onClick={() => onNewsDelete(item.id)}
                  className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBottles = () => (
    <div className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr]">
      <div className="panel overflow-hidden">
        <div className="border-b border-ink/8 px-6 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-cask">Bottles</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
            Bottle library
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-ink/8 bg-[#faf8f4] text-[11px] uppercase tracking-[0.18em] text-ink/45">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Brand</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {bottles.map((bottle) => (
                <tr
                  key={bottle.id}
                  onClick={() => setSelectedBottleId(bottle.id)}
                  className={`cursor-pointer transition-colors hover:bg-[#faf8f4] ${
                    bottle.id === selectedBottleId ? "bg-[#f5f2ec]" : "bg-white"
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink">{bottle.name}</div>
                  </td>
                  <td className="px-6 py-4 text-ink/70">{bottle.brand || "—"}</td>
                  <td className="px-6 py-4 text-ink/70">{bottle.category}</td>
                  <td className="px-6 py-4 text-ink/55">{formatDate(bottle.updatedAt)}</td>
                </tr>
              ))}
              {!bottles.length ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-ink/60">
                    No bottles available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Bottle editor</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          {selectedBottle ? "Edit bottle" : "Select a bottle"}
        </h2>
        {selectedBottle ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Name</label>
                <input
                  value={bottleDraft.name}
                  onChange={(event) => setBottleDraft((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Brand</label>
                <input
                  value={bottleDraft.brand}
                  onChange={(event) => setBottleDraft((current) => ({ ...current, brand: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Category</label>
                <select
                  value={bottleDraft.category}
                  onChange={(event) =>
                    setBottleDraft((current) => ({ ...current, category: event.target.value as SpiritCategory }))
                  }
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  {["Whisky", "Bourbon", "Tequila", "Rum", "Etc", "Sake", "Other spirits"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Batch</label>
                <input
                  value={bottleDraft.batch}
                  onChange={(event) => setBottleDraft((current) => ({ ...current, batch: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">ABV</label>
                <input
                  type="number"
                  step="0.1"
                  value={bottleDraft.abv}
                  onChange={(event) => setBottleDraft((current) => ({ ...current, abv: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Volume (ml)</label>
                <input
                  type="number"
                  value={bottleDraft.volumeMl}
                  onChange={(event) => setBottleDraft((current) => ({ ...current, volumeMl: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Aliases</label>
              <textarea
                rows={4}
                value={bottleDraft.aliases}
                onChange={(event) => setBottleDraft((current) => ({ ...current, aliases: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                placeholder="Comma-separated aliases"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-white px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={bottleDraft.hotBottle}
                onChange={(event) =>
                  setBottleDraft((current) => ({ ...current, hotBottle: event.target.checked }))
                }
                className="h-4 w-4 rounded border-ink/20"
              />
              Hot bottle
            </label>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Master image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setMasterImageFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              />
              <p className="mt-2 text-xs text-ink/45">
                {masterImageFile ? `Selected: ${masterImageFile.name}` : "Leave empty to keep the current master image."}
              </p>
            </div>

            <div className="rounded-2xl border border-ink/8 bg-[#faf8f4] px-4 py-3 text-xs uppercase tracking-[0.16em] text-ink/45">
              Updated {formatDate(selectedBottle.updatedAt)}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSaveBottle}
                disabled={isPending || !selectedBottleId}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
              >
                Save bottle
              </button>
              <button
                type="button"
                onClick={onDeleteBottle}
                disabled={isPending || !selectedBottleId}
                className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                Delete bottle
              </button>
            </div>

            <div className="mt-4 rounded-[28px] border border-ink/8 bg-[#faf8f4] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-cask">Global reference price</p>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Source</label>
                    <input
                      value={referenceDraft.source}
                      onChange={(event) =>
                        setReferenceDraft((current) => ({ ...current, source: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                      placeholder="SpiritRadar"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Price (USD)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={referenceDraft.referencePriceUsd}
                      onChange={(event) =>
                        setReferenceDraft((current) => ({
                          ...current,
                          referencePriceUsd: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                      placeholder="420"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Source URL</label>
                  <input
                    value={referenceDraft.sourceUrl}
                    onChange={(event) =>
                      setReferenceDraft((current) => ({ ...current, sourceUrl: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Updated at</label>
                  <input
                    type="date"
                    value={referenceDraft.updatedAt}
                    onChange={(event) =>
                      setReferenceDraft((current) => ({ ...current, updatedAt: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onSaveReferencePrice}
                    disabled={
                      isPending ||
                      !selectedBottleId ||
                      !referenceDraft.source.trim() ||
                      !(Number(referenceDraft.referencePriceUsd) > 0)
                    }
                    className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
                  >
                    Save reference
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteReferencePrice}
                    disabled={isPending || !selectedBottleId}
                    className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Delete reference
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-ink/60">Select a bottle from the table to edit its data.</p>
        )}
      </div>
    </div>
  );

  const renderHeroBanner = () => {
    const orderedBanners = [...heroBanners].sort((a, b) => a.displayOrder - b.displayOrder);
    const previewImage = bannerImageFile ? URL.createObjectURL(bannerImageFile) : bannerDraft.imageUrl || "";

    return (
      <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="panel p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-cask">Hero / Banner</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
            Homepage banner library
          </h2>
          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="text-sm text-ink/60">Manage up to 10 rotating homepage banners.</p>
            <button
              type="button"
              onClick={onCreateBanner}
              disabled={heroBanners.length >= 10}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Add banner
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {orderedBanners.map((banner, index) => (
              <div
                key={banner.id}
                className={`grid gap-3 rounded-2xl border px-4 py-4 transition ${
                  selectedBannerId === banner.id ? "border-ink/25 bg-[#faf8f4]" : "border-ink/8 bg-white"
                }`}
              >
                <button type="button" onClick={() => setSelectedBannerId(banner.id)} className="text-left">
                  <p className="font-medium text-ink">{getBannerListLabel(banner, index)}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/45">
                    Order {banner.displayOrder + 1} · {banner.isActive ? "Active" : "Inactive"} · {formatDate(banner.updatedAt)}
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveBanner(banner.id, "up")}
                    disabled={index === 0}
                    className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveBanner(banner.id, "down")}
                    disabled={index === orderedBanners.length - 1}
                    className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBanner(banner.id)}
                    className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!orderedBanners.length ? (
              <div className="rounded-2xl border border-ink/8 bg-white px-4 py-5 text-sm text-ink/60">
                No homepage banners yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-8">
          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Banner editor</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              {bannerDraft.id ? "Edit banner" : "Create banner"}
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Banner name</label>
                <input
                  value={bannerDraft.label}
                  onChange={(event) => setBannerDraft((current) => ({ ...current, label: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  placeholder="Spring campaign"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">
                  Hero image <span className="normal-case tracking-normal text-ink/35">(Recommended canvas: 1600 × 760)</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setBannerImageFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
                <p className="mt-2 text-xs text-ink/45">
                  {bannerImageFile ? `Selected: ${bannerImageFile.name}` : "Leave empty to keep the current hero image."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Type</label>
                  <select
                    value={bannerDraft.type}
                    onChange={(event) => setBannerDraft((current) => ({ ...current, type: event.target.value }))}
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  >
                    <option value="hero">Hero</option>
                    <option value="promotion">Promotion</option>
                    <option value="campaign">Campaign</option>
                    <option value="ad">Ad</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Order</label>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={bannerDraft.displayOrder}
                    onChange={(event) =>
                      setBannerDraft((current) => ({ ...current, displayOrder: Number(event.target.value || 0) }))
                    }
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-ink/8 bg-white px-4 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={bannerDraft.isActive}
                  onChange={(event) => setBannerDraft((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-ink/20"
                />
                Active homepage banner
              </label>

              <button
                type="button"
                onClick={onSaveHeroBanner}
                disabled={isPending || (!bannerDraft.id && heroBanners.length >= 10)}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
              >
                Save banner
              </button>
            </div>
          </div>

          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Headline editor</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Homepage copy
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Headline</label>
                <input
                  value={bannerDraft.headline}
                  onChange={(event) => setBannerDraft((current) => ({ ...current, headline: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  placeholder="Discover real bottle market prices."
                />
              </div>

              <div>
                <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink/45">Subcopy</label>
                <textarea
                  rows={4}
                  value={bannerDraft.subcopy}
                  onChange={(event) => setBannerDraft((current) => ({ ...current, subcopy: event.target.value }))}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                  placeholder="Short supporting copy for homepage hero."
                />
              </div>

              <button
                type="button"
                onClick={onSaveHeadlineCopy}
                disabled={isPending || (!bannerDraft.id && heroBanners.length >= 10)}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90 disabled:opacity-60"
              >
                Save copy
              </button>
            </div>
          </div>

          <div className="panel p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-cask">Live preview</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
              Homepage hero preview
            </h2>
            <div className="mt-5 overflow-hidden rounded-[28px] border border-ink/8 bg-white">
              <div className="space-y-0 bg-[#f9f9f7]">
                <div className="px-6 pb-8 pt-8 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-[#8d5b33]">
                    Secondary spirits archive
                  </span>
                  <h3 className="mt-5 text-3xl font-bold leading-[1.02] tracking-[-0.05em] text-[#222728]">
                    {bannerDraft.headline || "Discover real bottle market prices."}
                  </h3>
                  <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#666159]">
                    {bannerDraft.subcopy || "Explore a collector-focused bottle price index and market archive in one place."}
                  </p>
                  <span className="mt-6 inline-flex items-center bg-[#111111] px-6 py-3 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white">
                    Explore Bottles
                  </span>
                </div>
                <div className="px-6 pb-6">
                  <div className="relative aspect-[2.1/1] overflow-hidden bg-[#f3f1eb]">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt="Homepage hero preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-[#ece8e0]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-white/18 to-transparent" />
                  </div>
                </div>
                <div className="px-6 pb-6 text-xs uppercase tracking-[0.18em] text-ink/45">
                  {bannerDraft.isActive ? "Status: Active" : "Status: Inactive"} · Type: {bannerDraft.type || "hero"} · Order {bannerDraft.displayOrder + 1}
                </div>
              </div>
            </div>
            {orderedBanners.length ? (
              <p className="mt-4 text-xs text-ink/50">Auto-rotates through up to 10 active banners.</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderReports = () => (
    <section className="panel p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-cask">Reports</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
        Reports queue
      </h2>
      <div className="mt-5 space-y-4">
        {reports.length ? (
          reports.map((report) => {
            const relatedListing = listingMap.get(report.listingId);
            return (
              <div key={report.id} className="rounded-2xl border border-ink/8 bg-mist p-4">
                <p className="font-medium text-ink">{report.reason}</p>
                <p className="mt-2 text-sm text-ink/70">{report.note || "No note supplied."}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/45">
                  {relatedListing?.bottleName ?? "Unknown listing"} · {report.status} · {formatDate(report.createdAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.status === "open" ? (
                    <>
                      <button type="button" onClick={() => onReportResolve(report.id)} className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium">
                        Resolve
                      </button>
                      <button type="button" onClick={() => onReportDeactivateListing(report)} className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium">
                        Deactivate listing
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-ink/60">No suspicious listings have been reported.</p>
        )}
      </div>
    </section>
  );

  const renderUsers = () => (
    <section className="panel overflow-hidden">
      <div className="border-b border-ink/8 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Users</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          User roles
        </h2>
      </div>
      <div className="divide-y divide-ink/8">
        {users.slice(0, 100).map((profile) => (
          <div key={profile.id} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-medium text-ink">{getAdminUserLabel(profile)}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{getAdminUserMeta(profile)}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggleAdminRole(profile)}
              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-medium"
            >
              {profile.role === "admin" ? "Remove admin" : "Make admin"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );

  const renderPlaceholder = (title: string, description: string) => (
    <section className="panel p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-cask">{title}</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/65">{description}</p>
    </section>
  );

  const renderSettings = () => (
    <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Settings</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          Operational status
        </h2>
        <div className="mt-5 space-y-4 text-sm text-ink/70">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Google OAuth</p>
            <p className="mt-1 font-medium text-ink">{serverStatus.settings.googleOAuth.label}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Reference sync schedule</p>
            <p className="mt-1 font-medium text-ink">{serverStatus.settings.referenceSyncSchedule}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Last sync time</p>
            <p className="mt-1 font-medium text-ink">
              {serverStatus.settings.lastSyncTime ? formatDate(serverStatus.settings.lastSyncTime) : "No successful sync yet"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink/45">News ingestion status</p>
            <p className="mt-1 font-medium text-ink">
              {serverStatus.settings.newsIngestion.label} · {serverStatus.settings.newsIngestion.count} items
            </p>
            {serverStatus.settings.newsIngestion.lastUpdatedAt ? (
              <p className="mt-1 text-xs text-ink/50">
                Last updated: {formatDate(serverStatus.settings.newsIngestion.lastUpdatedAt)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">RSS sources</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
          News ingestion sources
        </h2>
        <div className="mt-5 space-y-3">
          {serverStatus.settings.rssSources.map((source) => (
            <div key={source} className="rounded-2xl border border-ink/8 bg-mist px-4 py-3 text-sm text-ink/75">
              {source}
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "Dashboard":
        return renderDashboard();
      case "Listings":
        return renderListings();
      case "News":
        return renderNews();
      case "Bottles":
        return renderBottles();
      case "Hero / Banner":
        return renderHeroBanner();
      case "Reports":
        return renderReports();
      case "Users":
        return renderUsers();
      case "Subscription":
        return renderPlaceholder("Subscription", "Subscription controls can be added here when monetization tools are ready.");
      case "Settings":
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="panel h-fit p-4 sm:p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-cask">Admin</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink">
          Dashboard
        </h2>
        <nav className="mt-6 space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setActiveSection(item)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                activeSection === item ? "bg-mist text-ink" : "text-ink/65 hover:bg-mist/80 hover:text-ink"
              }`}
            >
              <span>{item}</span>
              {item === "Subscription" ? (
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink/35">Soon</span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      <div className="space-y-8">
        <section className="panel p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cask">Admin console</p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
                Dashboard overview
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
                Review archive activity, moderate listings, and manage editorial operations from one place.
              </p>
            </div>
            <button
              type="button"
              onClick={onSeed}
              disabled={isPending}
              className="rounded-full bg-cask px-5 py-3 text-sm font-medium text-white transition hover:bg-cask/90 disabled:opacity-60"
            >
              Seed example data
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
        </section>

        {renderActiveSection()}
      </div>
    </div>
  );
}
