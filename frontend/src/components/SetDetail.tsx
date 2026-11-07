import { useEffect, useState } from 'react';
import {
  createCard,
  deleteCard,
  deleteSet,
  listCards,
  updateCard,
  updateSet,
  type Card,
  type CardInput,
  type VocabularySet,
} from '../api/vocabulary';
import { CardForm } from './CardForm';
import { CardContent, ErrorNotice, Loading } from './common';

export function SetDetail({
  set,
  busy,
  onBusy,
  onUpdate,
  onDelete,
  onEdit,
  onBack,
  onStudy,
}: {
  set: VocabularySet;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onUpdate: (set: VocabularySet) => void;
  onDelete: () => void;
  onEdit: () => void;
  onBack: () => void;
  onStudy: () => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<'create' | Card | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void listCards(set.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setCards(result);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load cards.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [set.id, retry]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    onBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      onBusy(false);
    }
  }
  function save(input: CardInput) {
    return run(async () => {
      if (form === 'create') {
        const card = await createCard(set.id, input);
        setCards((current) => [card, ...current]);
        onUpdate({ ...set, cardCount: set.cardCount + 1 });
      } else if (form) {
        const card = await updateCard(set.id, form.id, input);
        setCards((current) =>
          current.map((item) => (item.id === card.id ? card : item)),
        );
      }
      setForm(null);
    });
  }
  function removeCard(card: Card) {
    if (!window.confirm(`Delete “${card.sourceText}”?`)) return;
    void run(async () => {
      await deleteCard(set.id, card.id);
      setCards((current) => current.filter((item) => item.id !== card.id));
      onUpdate({
        ...set,
        cardCount: Math.max(0, set.cardCount - 1),
        visibility: set.cardCount <= 1 ? 'PRIVATE' : set.visibility,
      });
    });
  }
  function removeSet() {
    if (!window.confirm(`Delete “${set.title}” and all its cards?`)) return;
    void run(async () => {
      await deleteSet(set.id);
      onDelete();
    });
  }
  function publish() {
    const visibility = set.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    if (
      visibility === 'PUBLIC' &&
      !window.confirm(
        'Publish this set? Other users will be able to read and copy its cards.',
      )
    )
      return;
    void run(async () => onUpdate(await updateSet(set.id, { visibility })));
  }
  return (
    <div className="space-y-5">
      {error && (
        <ErrorNotice
          message={error}
          onRetry={
            !form
              ? () => {
                  setLoading(true);
                  setRetry((value) => value + 1);
                }
              : undefined
          }
        />
      )}
      <button
        className="back-link"
        disabled={busy}
        onClick={form ? () => setForm(null) : onBack}
      >
        {form ? '← Back to set' : '← Library'}
      </button>
      {form ? (
        <CardForm
          key={form === 'create' ? 'new' : form.id}
          initial={form === 'create' ? undefined : form}
          sourceLanguage={set.sourceLanguage}
          targetLanguage={set.targetLanguage}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={save}
        />
      ) : (
        <>
          <div>
            <p className="eyebrow">
              {set.sourceLanguage} → {set.targetLanguage}
            </p>
            <h1 className="mt-2 text-3xl font-black">{set.title}</h1>
            {set.description && (
              <p className="muted mt-3 leading-6">{set.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="button-primary flex-1"
              disabled={busy || loading || cards.length === 0}
              onClick={onStudy}
            >
              Study set
            </button>
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => setForm('create')}
            >
              + Add card
            </button>
            <button
              className="button-secondary"
              disabled={busy}
              onClick={onEdit}
            >
              Edit set
            </button>
          </div>
          <div className="panel flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">
                {set.visibility === 'PUBLIC' ? 'Public set' : 'Private set'}
              </p>
              <p className="muted mt-1 text-xs">
                {set.visibility === 'PUBLIC'
                  ? 'Others can read and copy this set.'
                  : 'Only you can access these cards.'}
              </p>
            </div>
            <button
              className="button-secondary shrink-0"
              disabled={
                busy ||
                loading ||
                (set.visibility === 'PRIVATE' && cards.length === 0)
              }
              onClick={publish}
            >
              {set.visibility === 'PUBLIC' ? 'Make private' : 'Publish'}
            </button>
          </div>
          {loading ? (
            <Loading label="Loading cards…" />
          ) : cards.length ? (
            <div className="grid gap-3">
              {cards.map((card) => (
                <CardContent
                  key={card.id}
                  card={card}
                  actions={
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Edit ${card.sourceText}`}
                        onClick={() => setForm(card)}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-button danger"
                        disabled={busy}
                        aria-label={`Delete ${card.sourceText}`}
                        onClick={() => removeCard(card)}
                      >
                        ×
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2 className="text-lg font-bold">No cards yet</h2>
              <p className="muted mt-2 text-sm">
                Add a word and translation, or try AI assistance.
              </p>
              <button
                className="button-primary mt-4"
                onClick={() => setForm('create')}
              >
                Add your first card
              </button>
            </div>
          )}
          <button
            className="button-danger w-full"
            disabled={busy}
            onClick={removeSet}
          >
            Delete set
          </button>
        </>
      )}
    </div>
  );
}
