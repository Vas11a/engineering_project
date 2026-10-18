import { useHealth } from './hooks/useHealth';

const statusContent = {
  checking: { label: 'Checking API', dot: 'bg-amber-400' },
  online: { label: 'API connected', dot: 'bg-emerald-500' },
  offline: { label: 'API unavailable', dot: 'bg-rose-500' },
} as const;

export function App() {
  const health = useHealth();
  const status = statusContent[health];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-7">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-lg font-black text-white shadow-lg shadow-violet-600/20">
            L
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
              Telegram learning
            </p>
            <h1 className="text-xl font-bold tracking-tight">Lexilo</h1>
          </div>
        </div>
        <div
          aria-label={status.label}
          className="flex items-center gap-2 rounded-full border border-black/5 bg-white/75 px-3 py-2 text-xs font-semibold shadow-sm"
        >
          <span className={`size-2 rounded-full ${status.dot}`} />
          {status.label}
        </div>
      </header>

      <section className="mt-14">
        <p className="text-sm font-semibold text-violet-600">
          Build your vocabulary
        </p>
        <h2 className="mt-3 max-w-sm text-4xl font-black leading-[1.06] tracking-[-0.04em] text-slate-950">
          Learn the words that matter to you.
        </h2>
        <p className="mt-5 max-w-sm text-base leading-7 text-slate-600">
          Create personal word sets, review difficult cards more often, and keep
          your learning progress in one place.
        </p>
      </section>

      <section className="mt-10 grid gap-3" aria-label="Planned features">
        <article className="rounded-3xl bg-violet-600 p-5 text-white shadow-xl shadow-violet-600/20">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">
                Adaptive review
              </p>
              <h3 className="mt-2 text-xl font-bold">
                Practice at the right time
              </h3>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/15 text-xl">
              ↻
            </span>
          </div>
          <p className="mt-5 text-sm leading-6 text-violet-100">
            Difficult cards return sooner while familiar words get longer review
            intervals.
          </p>
        </article>

        <div className="grid grid-cols-2 gap-3">
          <article className="rounded-3xl border border-black/5 bg-white/80 p-5 shadow-sm">
            <span className="text-2xl">◫</span>
            <h3 className="mt-5 font-bold">Your sets</h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Create and organize cards.
            </p>
          </article>
          <article className="rounded-3xl border border-black/5 bg-white/80 p-5 shadow-sm">
            <span className="text-2xl">✦</span>
            <h3 className="mt-5 font-bold">AI assist</h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Translate and add examples.
            </p>
          </article>
        </div>
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-slate-400">
        Foundation milestone
      </footer>
    </main>
  );
}
