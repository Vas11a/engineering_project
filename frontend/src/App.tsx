import { useEffect, useState } from 'react';

import {
  createCard,
  createSet,
  deleteCard,
  deleteSet,
  getCurrentUser,
  listCards,
  listSets,
  updateCard,
  updateSet,
  type Card,
  type CardInput,
  type SetInput,
  type User,
  type VocabularySet,
} from './api/vocabulary';
import { CardForm } from './components/CardForm';
import { SetForm } from './components/SetForm';
import { useHealth } from './hooks/useHealth';

const statusContent = {
  checking: { label: 'Checking API', dot: 'bg-amber-400' },
  online: { label: 'API connected', dot: 'bg-emerald-500' },
  offline: { label: 'API unavailable', dot: 'bg-rose-500' },
} as const;

type View =
  | 'library'
  | 'set-create'
  | 'set-detail'
  | 'set-edit'
  | 'card-create'
  | 'card-edit';

export function App() {
  const health = useHealth();
  const status = statusContent[health];
  const [view, setView] = useState<View>('library');
  const [user, setUser] = useState<User | null>(null);
  const [sets, setSets] = useState<VocabularySet[]>([]);
  const [selectedSet, setSelectedSet] = useState<VocabularySet | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([getCurrentUser(), listSets()])
      .then(([currentUser, vocabularySets]) => {
        if (!active) return;
        setUser(currentUser);
        setSets(vocabularySets);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load your library.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : 'Something went wrong.');
  }

  function syncSet(nextSet: VocabularySet) {
    setSets((current) =>
      current.map((set) => (set.id === nextSet.id ? nextSet : set)),
    );
    setSelectedSet(nextSet);
  }

  async function openSet(set: VocabularySet) {
    setError(null);
    setSelectedSet(set);
    setCards([]);
    setLoading(true);
    setView('set-detail');
    try {
      setCards(await listCards(set.id));
    } catch (cause) {
      showError(cause);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSet(input: SetInput) {
    setBusy(true);
    setError(null);
    try {
      const created = await createSet(input);
      setSets((current) => [created, ...current]);
      setView('library');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSet(input: SetInput) {
    if (!selectedSet) return;
    setBusy(true);
    setError(null);
    try {
      syncSet(await updateSet(selectedSet.id, input));
      setView('set-detail');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSet() {
    if (
      !selectedSet ||
      !window.confirm(`Delete “${selectedSet.title}” and all its cards?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteSet(selectedSet.id);
      setSets((current) => current.filter((set) => set.id !== selectedSet.id));
      setSelectedSet(null);
      setCards([]);
      setView('library');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCard(input: CardInput) {
    if (!selectedSet) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCard(selectedSet.id, input);
      setCards((current) => [created, ...current]);
      syncSet({ ...selectedSet, cardCount: selectedSet.cardCount + 1 });
      setView('set-detail');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCard(input: CardInput) {
    if (!selectedSet || !editingCard) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCard(selectedSet.id, editingCard.id, input);
      setCards((current) =>
        current.map((card) => (card.id === updated.id ? updated : card)),
      );
      setEditingCard(null);
      setView('set-detail');
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCard(card: Card) {
    if (!selectedSet || !window.confirm(`Delete “${card.sourceText}”?`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteCard(selectedSet.id, card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
      syncSet({
        ...selectedSet,
        cardCount: Math.max(0, selectedSet.cardCount - 1),
      });
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  function returnToLibrary() {
    setView('library');
    setSelectedSet(null);
    setEditingCard(null);
    setCards([]);
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-7">
      <header className="flex items-center justify-between gap-3">
        <button
          className="flex items-center gap-3 text-left"
          onClick={returnToLibrary}
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-lg font-black text-white shadow-lg shadow-violet-600/20">
            L
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
              Telegram learning
            </span>
            <span className="block text-xl font-bold tracking-tight">
              Lexilo
            </span>
          </span>
        </button>
        <div
          aria-label={status.label}
          className="flex shrink-0 items-center gap-2 rounded-full border border-black/5 bg-white/75 px-3 py-2 text-xs font-semibold shadow-sm"
        >
          <span className={`size-2 rounded-full ${status.dot}`} />
          {status.label}
        </div>
      </header>

      {error && (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-start justify-between gap-3">
            <p>{error}</p>
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        </div>
      )}

      <section className="mt-8 flex-1">
        {view === 'library' && (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {user ? `Hello, ${user.firstName}` : 'Your library'}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                  Vocabulary sets
                </h1>
              </div>
              <button
                className="button-primary shrink-0"
                onClick={() => setView('set-create')}
              >
                + New set
              </button>
            </div>

            {loading ? (
              <div className="empty-state mt-7">Loading your library…</div>
            ) : sets.length === 0 ? (
              <div className="empty-state mt-7">
                <span className="text-3xl">◫</span>
                <h2 className="mt-3 text-lg font-bold">
                  Your first set starts here
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Group words by topic, language, class, or anything else that
                  helps you learn.
                </p>
                <button
                  className="button-primary mt-5"
                  onClick={() => setView('set-create')}
                >
                  Create a set
                </button>
              </div>
            ) : (
              <div className="mt-7 grid gap-3">
                {sets.map((set) => (
                  <button
                    key={set.id}
                    className="set-card"
                    onClick={() => void openSet(set)}
                  >
                    <span className="flex items-start justify-between gap-4">
                      <span>
                        <span className="block text-lg font-bold">
                          {set.title}
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          {set.sourceLanguage} → {set.targetLanguage}
                        </span>
                      </span>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
                        {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
                      </span>
                    </span>
                    {set.description && (
                      <span className="mt-4 block text-sm leading-6 text-slate-600">
                        {set.description}
                      </span>
                    )}
                    <span className="mt-4 block text-xs font-semibold text-slate-400">
                      {set.visibility === 'PRIVATE'
                        ? 'Private set'
                        : 'Public set'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'set-create' && (
          <SetForm
            busy={busy}
            onCancel={returnToLibrary}
            onSubmit={handleCreateSet}
          />
        )}

        {view === 'set-edit' && selectedSet && (
          <SetForm
            initial={selectedSet}
            busy={busy}
            onCancel={() => setView('set-detail')}
            onSubmit={handleUpdateSet}
          />
        )}

        {view === 'set-detail' && selectedSet && (
          <>
            <button className="back-link" onClick={returnToLibrary}>
              ← Library
            </button>
            <div className="mt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">
                    {selectedSet.sourceLanguage} → {selectedSet.targetLanguage}
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
                    {selectedSet.title}
                  </h1>
                  {selectedSet.description && (
                    <p className="mt-3 leading-6 text-slate-600">
                      {selectedSet.description}
                    </p>
                  )}
                </div>
                <button
                  className="icon-button"
                  aria-label="Edit set"
                  onClick={() => setView('set-edit')}
                >
                  ✎
                </button>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  className="button-primary flex-1"
                  onClick={() => setView('card-create')}
                >
                  + Add card
                </button>
                <button
                  className="button-danger"
                  disabled={busy}
                  onClick={() => void handleDeleteSet()}
                >
                  Delete set
                </button>
              </div>
            </div>

            {loading ? (
              <div className="empty-state mt-7">Loading cards…</div>
            ) : cards.length === 0 ? (
              <div className="empty-state mt-7">
                <span className="text-3xl">◇</span>
                <h2 className="mt-3 text-lg font-bold">No cards yet</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Add the first word manually. AI assistance comes later.
                </p>
              </div>
            ) : (
              <div className="mt-7 grid gap-3">
                {cards.map((card) => (
                  <article className="panel" key={card.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold">{card.sourceText}</h2>
                        <p className="mt-1 font-semibold text-violet-600">
                          {card.translation}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${card.sourceText}`}
                          onClick={() => {
                            setEditingCard(card);
                            setView('card-edit');
                          }}
                        >
                          ✎
                        </button>
                        <button
                          className="icon-button text-rose-600"
                          aria-label={`Delete ${card.sourceText}`}
                          disabled={busy}
                          onClick={() => void handleDeleteCard(card)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {card.explanation && (
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        {card.explanation}
                      </p>
                    )}
                    {card.examples.length > 0 && (
                      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm italic text-slate-500">
                        {card.examples.map((example) => (
                          <li key={example}>“{example}”</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'card-create' && selectedSet && (
          <CardForm
            busy={busy}
            onCancel={() => setView('set-detail')}
            onSubmit={handleCreateCard}
          />
        )}

        {view === 'card-edit' && selectedSet && editingCard && (
          <CardForm
            initial={editingCard}
            busy={busy}
            onCancel={() => {
              setEditingCard(null);
              setView('set-detail');
            }}
            onSubmit={handleUpdateCard}
          />
        )}
      </section>
    </main>
  );
}
