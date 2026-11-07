import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  abandonStudy,
  answerStudy,
  getDue,
  getStudy,
  revealStudy,
  startStudy,
  type Due,
  type Feedback,
  type RevealedCard,
  type StudyMode,
  type StudySession,
} from '../api/study';
import { ErrorNotice, Loading } from './common';

const modes: { value: StudyMode; title: string; description: string }[] = [
  {
    value: 'FLASHCARDS',
    title: 'Flashcards',
    description: 'Reveal the answer and rate your recall.',
  },
  {
    value: 'TRANSLATION',
    title: 'Type the translation',
    description: 'Recall the word without a hint.',
  },
  {
    value: 'MULTIPLE_CHOICE',
    title: 'Multiple choice',
    description: 'Choose the matching translation.',
  },
  {
    value: 'MIXED',
    title: 'Mixed practice',
    description: 'A little of each, in one session.',
  },
];
function savedSession(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function persistSession(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* Private browsing may disable storage. */
  }
}
export function StudyView({
  userId,
  setId,
  setTitle,
  onFinish,
  onBusy,
}: {
  userId: string;
  setId?: string;
  setTitle?: string;
  onFinish: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const storageKey = `lexilo:study:${userId}`;
  const [resuming, setResuming] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null);
  const [due, setDue] = useState<Due | null>(null);
  const [mode, setMode] = useState<StudyMode>('FLASHCARDS');
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedCard | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [value, setValue] = useState('');
  const startedAt = useRef(0);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const stored = savedSession(storageKey);
    const loadSaved = async () => {
      if (!stored) return null;
      try {
        return await getStudy(stored, controller.signal);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          persistSession(storageKey, null);
          return null;
        }
        throw cause;
      }
    };
    void Promise.all([getDue(setId, controller.signal), loadSaved()])
      .then(([counts, resumed]) => {
        if (controller.signal.aborted) return;
        setDue(counts);
        setSession(resumed);
        setResuming(resumed?.status === 'ACTIVE');
        setError(null);
        startedAt.current = Date.now();
        if (resumed && resumed.status !== 'ACTIVE')
          persistSession(storageKey, null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load practice.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [setId, storageKey, reload]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save your answer. Please try again.',
      );
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  function start() {
    void run(async () => {
      const next = await startStudy({ setId, mode, limit });
      setSession(next);
      setResuming(false);
      persistSession(storageKey, next.status === 'ACTIVE' ? next.id : null);
      setFeedback(null);
      setRevealed(null);
      setValue('');
      startedAt.current = Date.now();
    });
  }
  function submit(submittedValue?: string, confidence?: number) {
    if (!session?.current) return;
    const current = session.current;
    void run(async () => {
      const answer = await answerStudy(session.id, {
        cardId: current.cardId,
        submittedValue,
        confidence,
        responseTimeMs: Math.min(
          86_400_000,
          Math.max(0, Date.now() - startedAt.current),
        ),
      });
      setFeedback(answer);
      if (answer.session.status !== 'ACTIVE') persistSession(storageKey, null);
    });
  }
  function next() {
    if (!feedback) return;
    setSession(feedback.session);
    setFeedback(null);
    setRevealed(null);
    setValue('');
    startedAt.current = Date.now();
  }
  function exitSession() {
    if (
      !session ||
      !window.confirm(
        'End this session? Answers already saved will count toward your progress.',
      )
    )
      return;
    void run(async () => {
      await abandonStudy(session.id);
      persistSession(storageKey, null);
      onFinish();
    });
  }
  if (loading) return <Loading label="Preparing your practice…" />;
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">A little every day</p>
        <h1 className="mt-2 text-3xl font-black">
          Study{!session && setTitle ? ` · ${setTitle}` : ''}
        </h1>
      </div>
      {resuming && session?.status === 'ACTIVE' && (
        <p className="suggestion text-sm" role="status">
          Resuming your saved session. Finish or end it before starting a
          different set.
        </p>
      )}
      {error && (
        <ErrorNotice
          message={error}
          onRetry={
            !session
              ? () => {
                  setLoading(true);
                  setReload((current) => current + 1);
                }
              : undefined
          }
        />
      )}
      {!session && (
        <>
          {due && (
            <div className="panel">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xl font-black">{due.dueCount}</p>
                  <p className="muted text-sm">ready to review</p>
                </div>
                <div>
                  <p className="text-3xl font-black">{due.newCount}</p>
                  <p className="muted text-sm">new cards</p>
                </div>
              </div>
              <p className="muted mt-4 text-sm">
                Due cards come first. Your next review adapts to each answer.
              </p>
            </div>
          )}
          <fieldset className="space-y-3" disabled={busy}>
            <legend className="mb-3 font-bold">Choose a practice mode</legend>
            {modes.map((item) => (
              <label
                className={`mode-option ${mode === item.value ? 'selected' : ''}`}
                key={item.value}
              >
                <input
                  type="radio"
                  name="mode"
                  value={item.value}
                  checked={mode === item.value}
                  onChange={() => setMode(item.value)}
                />
                <span>
                  <span className="block font-bold">{item.title}</span>
                  <span className="muted mt-1 block text-sm">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>Session length</span>
            <select
              value={limit}
              disabled={busy}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              {[5, 10, 20, 50].map((count) => (
                <option key={count} value={count}>
                  {count} cards
                </option>
              ))}
            </select>
          </label>
          <button
            className="button-primary w-full"
            disabled={busy || !due || due.dueCount + due.newCount === 0}
            onClick={start}
          >
            {busy ? 'Starting…' : 'Start session'}
          </button>
          {due && due.dueCount + due.newCount === 0 && (
            <p className="muted text-center text-sm">
              You're all caught up. Add new cards or come back when a review is
              due.
            </p>
          )}
        </>
      )}
      {session && session.status !== 'ACTIVE' && (
        <div className="panel space-y-5 text-center">
          <span className="text-4xl">✧</span>
          <h2 className="text-2xl font-black">
            {session.status === 'COMPLETED'
              ? 'Session complete'
              : 'Session ended'}
          </h2>
          <p className="muted">
            {session.correct} correct out of {session.answered} answers
          </p>
          <p className="text-4xl font-black accent">
            {session.answered
              ? Math.round((session.correct / session.answered) * 100)
              : 0}
            %
          </p>
          <p className="muted text-sm">
            Your answers are saved. The next review is scheduled for each card.
          </p>
          <button className="button-primary w-full" onClick={onFinish}>
            Back to library
          </button>
          <button
            className="back-link"
            onClick={() => {
              setSession(null);
              setLoading(true);
              setReload((current) => current + 1);
            }}
          >
            Practice more
          </button>
        </div>
      )}
      {session?.status === 'ACTIVE' && session.current && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="muted">
              Card {session.answered + 1} of {session.total}
            </span>
            <button className="back-link" disabled={busy} onClick={exitSession}>
              End session
            </button>
          </div>
          <progress
            className="w-full"
            value={session.answered}
            max={session.total}
            aria-label="Session progress"
          />
          <div className="study-card">
            <p className="eyebrow">
              {session.current.mode === 'FLASHCARDS'
                ? 'Recall the translation'
                : 'Translate this'}
            </p>
            <h2 className="my-8 text-3xl font-black">
              {session.current.sourceText}
            </h2>
            {feedback ? (
              <div className="space-y-4">
                <p
                  className={`font-bold ${feedback.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}
                >
                  {feedback.isCorrect ? 'Well remembered' : 'Keep practicing'}
                </p>
                <p className="text-xl font-bold">{feedback.translation}</p>
                {feedback.explanation && (
                  <p className="muted text-sm">{feedback.explanation}</p>
                )}
                {feedback.examples.map((example, index) => (
                  <p className="muted text-sm italic" key={index}>
                    {example}
                  </p>
                ))}
                <button
                  autoFocus
                  className="button-primary w-full"
                  onClick={next}
                >
                  {feedback.session.status === 'COMPLETED'
                    ? 'See results'
                    : 'Next card'}
                </button>
              </div>
            ) : session.current.mode === 'FLASHCARDS' ? (
              <>
                {!revealed ? (
                  <button
                    className="button-primary w-full"
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        setRevealed(await revealStudy(session.id)),
                      )
                    }
                  >
                    {busy ? 'Loading…' : 'Reveal translation'}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xl font-bold accent">
                      {revealed.translation}
                    </p>
                    {revealed.explanation && (
                      <p className="muted text-sm">{revealed.explanation}</p>
                    )}
                    {revealed.examples.map((example, index) => (
                      <p className="muted text-sm italic" key={index}>
                        {example}
                      </p>
                    ))}
                    <p className="muted text-sm">How well did you remember?</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Again', confidence: 1 },
                        { label: 'Good', confidence: 2 },
                        { label: 'Easy', confidence: 3 },
                      ].map((item) => (
                        <button
                          key={item.confidence}
                          className="button-secondary"
                          disabled={busy}
                          onClick={() => submit(undefined, item.confidence)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : session.current.mode === 'MULTIPLE_CHOICE' ? (
              <div className="grid gap-3">
                {session.current.options?.map((option) => (
                  <button
                    className="button-secondary"
                    key={option}
                    disabled={busy}
                    onClick={() => submit(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (value.trim()) submit(value.trim());
                }}
              >
                <label className="field text-left">
                  <span>Your translation</span>
                  <input
                    key={session.current.cardId}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={250}
                    value={value}
                    disabled={busy}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </label>
                <button
                  className="button-primary w-full"
                  disabled={busy || !value.trim()}
                >
                  {busy ? 'Checking…' : 'Check answer'}
                </button>
              </form>
            )}
          </div>
          <p className="muted text-center text-xs">
            Answers are saved as you go. You can leave and resume later.
          </p>
        </>
      )}
    </div>
  );
}
