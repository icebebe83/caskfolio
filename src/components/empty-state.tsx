export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="panel p-8 text-center">
      <p className="eyebrow">No data</p>
      <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink">
        {title}
      </h3>
      <p className="mt-3 text-sm text-[#666159]">{description}</p>
    </div>
  );
}
