import { useState, type FormEvent } from 'react';

import type { Card, CardInput } from '../api/vocabulary';

type CardFormProps = {
  initial?: Card;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: CardInput) => Promise<void>;
};

export function CardForm({ initial, busy, onCancel, onSubmit }: CardFormProps) {
  const [sourceText, setSourceText] = useState(initial?.sourceText ?? '');
  const [translation, setTranslation] = useState(initial?.translation ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [examples, setExamples] = useState(initial?.examples.join('\n') ?? '');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      sourceText: sourceText.trim(),
      translation: translation.trim(),
      explanation: explanation.trim() || null,
      examples: examples
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 5),
    });
  }

  return (
    <form
      className="panel space-y-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div>
        <p className="eyebrow">{initial ? 'Edit card' : 'New card'}</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">
          {initial ? 'Update this card' : 'Add a word or phrase'}
        </h2>
      </div>

      <label className="field">
        <span>Word or phrase</span>
        <input
          required
          maxLength={250}
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          placeholder="Good morning"
        />
      </label>
      <label className="field">
        <span>Translation</span>
        <input
          required
          maxLength={250}
          value={translation}
          onChange={(event) => setTranslation(event.target.value)}
          placeholder="Dzień dobry"
        />
      </label>
      <label className="field">
        <span>Explanation</span>
        <textarea
          maxLength={1000}
          rows={3}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="Optional note about usage"
        />
      </label>
      <label className="field">
        <span>Examples (one per line, up to 5)</span>
        <textarea
          rows={4}
          value={examples}
          onChange={(event) => setExamples(event.target.value)}
          placeholder="Good morning, how are you?"
        />
      </label>

      <div className="flex gap-3">
        <button
          className="button-secondary flex-1"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button-primary flex-1" disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </form>
  );
}
