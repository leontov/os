export function Skeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.04)] p-4">
      <span className="h-10 w-10 flex-shrink-0 rounded-xl bg-[rgba(255,255,255,0.08)]" />
      <div className="flex flex-1 flex-col gap-3">
        <span className="h-3 w-1/3 rounded-full bg-[rgba(255,255,255,0.08)]" />
        <span className="h-3 w-2/3 rounded-full bg-[rgba(255,255,255,0.06)]" />
        <span className="h-3 w-full rounded-full bg-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}
