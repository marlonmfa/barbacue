// Shown while the force-dynamic homepage awaits its DB queries. A shimmer shell
// of the header + a grid of skeleton cards → instant feedback on a slow VPS,
// instead of a blank screen (the owner's "non-fluid" complaint).
export default function Loading() {
  return (
    <div className="animate-fade-in-up">
      <header className="bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-6 flex items-center gap-6">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full skeleton shrink-0" />
          <div className="flex-1 flex flex-col gap-3">
            <div className="h-5 w-40 skeleton rounded-md" />
            <div className="h-4 w-56 skeleton rounded-md" />
            <div className="h-3 w-72 skeleton rounded-md" />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="h-6 w-40 skeleton rounded-md mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
              <div className="w-full h-44 skeleton" />
              <div className="p-3.5 flex flex-col gap-2">
                <div className="h-4 w-3/4 skeleton rounded" />
                <div className="h-3 w-full skeleton rounded" />
                <div className="flex justify-between items-center pt-3">
                  <div className="h-4 w-16 skeleton rounded" />
                  <div className="h-7 w-20 skeleton rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
