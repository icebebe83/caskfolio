import Link from "next/link";

export function DemoBanner({ message }: { message?: string }) {
  return (
    <div className="rounded-[24px] border border-[#e2ddd3] bg-[rgba(255,255,255,0.92)] px-4 py-3 text-sm text-[#5f5a52]">
      {message ??
        "Demo data is being shown because the live data layer is not fully configured yet."}{" "}
      Auth, submit, admin actions, and uploads require Supabase plus image storage setup. See{" "}
      <Link href="/login" className="font-semibold underline">
        login
      </Link>{" "}
      or follow the setup steps in the README.
    </div>
  );
}
