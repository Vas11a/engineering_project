import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  generateCardContent,
  type Card,
  type CardInput,
  type GeneratedContent,
} from '../api/vocabulary';
import { ErrorNotice } from './common';

type CardFormProps = {
  initial?: Card;
  busy: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  onCancel: () => void;
  onSubmit: (input: CardInput) => Promise<void>;
};
export function CardForm({
  initial,
  busy,
  sourceLanguage,
  targetLanguage,
  onCancel,
  onSubmit,
}: CardFormProps) {
  const [sourceText, setSourceText] = useState(initial?.sourceText ?? '');
  const [translation, setTranslation] = useState(initial?.translation ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [examples, setExamples] = useState(initial?.examples.join('\n') ?? '');
  const [creationSource, setCreationSource] = useState<'MANUAL' | 'AI'>(
    initial?.creationSource === 'AI' ? 'AI' : 'MANUAL',
  );
  const [suggestion, setSuggestion] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate() {
    if (!sourceLanguage || !targetLanguage || !sourceText.trim()) return;
    const nextController = new AbortController();
    controller.current = nextController;
    setGenerating(true);
    setError(null);
    setSuggestion(null);
    try {
      setSuggestion(
        await generateCardContent(
          { sourceText: sourceText.trim(), sourceLanguage, targetLanguage },
          nextController.signal,
        ),
      );
    } catch (cause) {
      if (!nextController.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'AI assistance is unavailable. You can still add the translation manually.',
        );
    } finally {
      if (!nextController.signal.aborted) setGenerating(false);
    }
  }
  function applySuggestion() {
    if (!suggestion) return;
    setTranslation(suggestion.translation);
    setExplanation(suggestion.explanation ?? '');
    setExamples(suggestion.examples.join('\n'));
    setCreationSource('AI');
    setSuggestion(null);
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextExamples = examples
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      nextExamples.length > 5 ||
      nextExamples.some((value) => value.length > 500)
    ) {
      setError('Use up to five examples, with at most 500 characters each.');
      return;
    }
    if (!sourceText.trim() || !translation.trim()) {
      setError('Enter a word and its translation.');
      return;
    }
    await onSubmit({
      sourceText: sourceText.trim(),
      translation: translation.trim(),
      explanation: explanation.trim() || null,
      examples: nextExamples,
      creationSource,
    });
  }
  return (
    <form
      className="panel space-y-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div>
        <p className="eyebrow">{initial ? 'Edit card' : 'New card'}</p>
        <h2 className="mt-2 text-2xl font-black">
          {initial ? 'Update this card' : 'Add a word or phrase'}
        </h2>
        <p className="muted mt-2 text-sm">
          {sourceLanguage} → {targetLanguage}
        </p>
      </div>
      {error && <ErrorNotice message={error} />}
      <label className="field">
        <span>Word or phrase</span>
        <input
          required
          maxLength={250}
          value={sourceText}
          disabled={busy || generating}
          onChange={(event) => {
            setSourceText(event.target.value);
            setSuggestion(null);
            setCreationSource('MANUAL');
          }}
          placeholder="Good morning"
        />
      </label>
      {sourceLanguage && targetLanguage && (
        <button
          className="button-secondary w-full"
          type="button"
          disabled={busy || generating || !sourceText.trim()}
          onClick={() => void generate()}
        >
          {generating ? 'Preparing suggestion…' : '✦ Translate with AI'}
        </button>
      )}
      {suggestion && (
        <section className="suggestion space-y-3" aria-label="AI suggestion">
          <p className="eyebrow">Review AI suggestion</p>
          <p className="font-bold">{suggestion.translation}</p>
          {suggestion.explanation && (
            <p className="text-sm">{suggestion.explanation}</p>
          )}
          <ul className="text-sm italic">
            {suggestion.examples.map((value, index) => (
              <li key={index}>{value}</li>
            ))}
          </ul>
          <p className="muted text-xs">
            Check the meaning and examples. Use this suggestion, edit it below,
            then save the card.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="button-primary"
              type="button"
              onClick={applySuggestion}
            >
              Use suggestion
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => setSuggestion(null)}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}
      <label className="field">
        <span>Translation</span>
        <input
          required
          maxLength={250}
          value={translation}
          disabled={busy}
          onChange={(event) => setTranslation(event.target.value)}
          placeholder="Dzień dobry"
        />
      </label>
      <label className="field">
        <span>Explanation</span>
        <textarea
          maxLength={1000}
          rows={3}
          disabled={busy}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="Optional note about usage"
        />
      </label>
      <label className="field">
        <span>Examples (one per line, up to 5)</span>
        <textarea
          rows={4}
          disabled={busy}
          value={examples}
          onChange={(event) => setExamples(event.target.value)}
          placeholder="Good morning, how are you?"
        />
      </label>
      <div className="flex gap-3">
        <button
          className="button-secondary flex-1"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="button-primary flex-1"
          disabled={busy || generating || Boolean(suggestion)}
          type="submit"
        >
          {busy ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </form>
  );
}
