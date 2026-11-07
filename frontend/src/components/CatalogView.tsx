import { useEffect, useState, type FormEvent } from 'react';
import {
  copyPublicSet,
  getPublicSet,
  listPublicSets,
  type Card,
  type CatalogResult,
  type VocabularySet,
} from '../api/vocabulary';
import { CardContent, ErrorNotice, Loading, SetTile } from './common';

export function CatalogView({
  onCopy,
  onBusy,
}: {
  onBusy?: (busy: boolean) => void;
  onCopy: (set: VocabularySet) => void;
}) {
  const [q, setQ] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    sourceLanguage: '',
    targetLanguage: '',
    page: 1,
  });
  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void listPublicSets(filters, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCatalog(result);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load the catalog.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, retry]);
  function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setSelected(null);
    setFilters({
      q: q.trim(),
      sourceLanguage: sourceLanguage.trim(),
      targetLanguage: targetLanguage.trim(),
      page: 1,
    });
  }
  if (selected)
    return (
      <PublicSetView
        key={selected}
        id={selected}
        onBack={() => setSelected(null)}
        onCopy={onCopy}
        onBusy={onBusy}
      />
    );
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Learn together</p>
        <h1 className="mt-2 text-3xl font-black">Discover sets</h1>
        <p className="muted mt-2 text-sm">
          Find a collection and make an independent copy in your library.
        </p>
      </div>
      <form className="panel space-y-4" onSubmit={search}>
        <label className="field">
          <span>Search by title</span>
          <input
            value={q}
            maxLength={120}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Travel, everyday phrases…"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>From language</span>
            <input
              value={sourceLanguage}
              maxLength={50}
              onChange={(event) => setSourceLanguage(event.target.value)}
              placeholder="Any"
            />
          </label>
          <label className="field">
            <span>To language</span>
            <input
              value={targetLanguage}
              maxLength={50}
              onChange={(event) => setTargetLanguage(event.target.value)}
              placeholder="Any"
            />
          </label>
        </div>
        <button className="button-primary w-full" type="submit">
          Search sets
        </button>
      </form>
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => {
            setLoading(true);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {loading ? (
        <Loading label="Finding vocabulary sets…" />
      ) : (
        catalog && (
          <>
            <p className="muted text-sm">
              {catalog.total} {catalog.total === 1 ? 'set' : 'sets'} found
            </p>
            {catalog.sets.length ? (
              <div className="grid gap-3">
                {catalog.sets.map((set) => (
                  <SetTile
                    key={set.id}
                    set={set}
                    onOpen={() => setSelected(set.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2 className="font-bold">No sets found</h2>
                <p className="muted mt-2 text-sm">
                  Try another title or language, or publish your own first set.
                </p>
              </div>
            )}
            {catalog.total > catalog.pageSize && (
              <div className="flex items-center justify-between gap-3">
                <button
                  className="button-secondary"
                  disabled={filters.page === 1}
                  onClick={() => {
                    setLoading(true);
                    setFilters((value) => ({ ...value, page: value.page - 1 }));
                  }}
                >
                  Previous
                </button>
                <span className="muted text-sm">
                  {filters.page} / {Math.ceil(catalog.total / catalog.pageSize)}
                </span>
                <button
                  className="button-secondary"
                  disabled={filters.page * catalog.pageSize >= catalog.total}
                  onClick={() => {
                    setLoading(true);
                    setFilters((value) => ({ ...value, page: value.page + 1 }));
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
function PublicSetView({
  id,
  onBack,
  onCopy,
  onBusy,
}: {
  onBusy?: (busy: boolean) => void;
  id: string;
  onBack: () => void;
  onCopy: (set: VocabularySet) => void;
}) {
  const [data, setData] = useState<{
    set: VocabularySet;
    cards: Card[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getPublicSet(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load this set.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);
  async function copy() {
    if (busy) return;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      onCopy(await copyPublicSet(id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not copy this set.',
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="space-y-5">
      <button className="back-link" onClick={onBack} disabled={busy}>
        ← Discover
      </button>
      {error && (
        <ErrorNotice
          message={error}
          onRetry={() => {
            setLoading(true);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div>
              <p className="eyebrow">
                {data.set.sourceLanguage} → {data.set.targetLanguage}
              </p>
              <h1 className="mt-2 text-3xl font-black">{data.set.title}</h1>
              <p className="muted mt-3">{data.set.description}</p>
            </div>
            <button
              className="button-primary w-full"
              disabled={busy}
              onClick={() => void copy()}
            >
              {busy ? 'Copying…' : 'Copy to my library'}
            </button>
            <p className="muted text-xs">
              Your copy stays yours even if the author changes or removes the
              original.
            </p>
            <div className="grid gap-3">
              {data.cards.map((card) => (
                <CardContent key={card.id} card={card} />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
