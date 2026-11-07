import { useState, type FormEvent } from 'react';

import type { SetInput, VocabularySet } from '../api/vocabulary';
import { ErrorNotice } from './common';

type SetFormProps = {
  initial?: VocabularySet;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: SetInput) => Promise<void>;
};

export function SetForm({ initial, busy, onCancel, onSubmit }: SetFormProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sourceLanguage, setSourceLanguage] = useState(
    initial?.sourceLanguage ?? 'English',
  );
  const [targetLanguage, setTargetLanguage] = useState(
    initial?.targetLanguage ?? 'Polish',
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      !title.trim() ||
      sourceLanguage.trim().length < 2 ||
      targetLanguage.trim().length < 2
    ) {
      setValidationError(
        'Enter a title and language names with at least two characters.',
      );
      return;
    }
    setValidationError(null);
    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      sourceLanguage: sourceLanguage.trim(),
      targetLanguage: targetLanguage.trim(),
    });
  }

  return (
    <form
      className="panel space-y-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div>
        <p className="eyebrow">{initial ? 'Edit set' : 'New set'}</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">
          {initial ? 'Update vocabulary set' : 'Create a vocabulary set'}
        </h2>
      </div>

      {validationError && <ErrorNotice message={validationError} />}
      <label className="field">
        <span>Title</span>
        <input
          required
          disabled={busy}
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Travel essentials"
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          disabled={busy}
          maxLength={500}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Words I want to use on my next trip"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>From</span>
          <input
            required
            minLength={2}
            maxLength={50}
            disabled={busy}
            value={sourceLanguage}
            onChange={(event) => setSourceLanguage(event.target.value)}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            required
            minLength={2}
            maxLength={50}
            disabled={busy}
            value={targetLanguage}
            onChange={(event) => setTargetLanguage(event.target.value)}
          />
        </label>
      </div>

      <div className="flex gap-3">
        <button
          className="button-secondary flex-1"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button-primary flex-1" disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save set'}
        </button>
      </div>
    </form>
  );
}
