import { useEffect, useState } from 'react';
import { getProgress, type Progress } from '../api/study';
import { ErrorNotice, Loading } from './common';

export function ProgressView({ onStudy }: { onStudy: () => void }) {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getProgress(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load your progress.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Every answer counts</p>
        <h1 className="mt-2 text-3xl font-black">Your progress</h1>
      </div>
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
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Learned cards', value: data.learnedCards },
                {
                  label: 'Review accuracy',
                  value: `${Math.round(data.accuracy)}%`,
                },
                { label: 'Due to review', value: data.dueCards },
                { label: 'Total answers', value: data.totalReviews },
              ].map((item) => (
                <div className="panel" key={item.label}>
                  <p className="text-3xl font-black">{item.value}</p>
                  <p className="muted mt-2 text-xs">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="panel">
              <h2 className="font-bold">Keep your words fresh</h2>
              <p className="muted mt-2 text-sm">
                {data.totalCards} cards in your library · {data.newCards} still
                to discover
              </p>
              <p className="muted mt-2 text-xs">
                A card is counted as learned when its review interval reaches 7
                days. Accuracy includes all saved answers.
              </p>
              <button className="button-primary mt-4 w-full" onClick={onStudy}>
                Start a review
              </button>
            </div>
            <section className="space-y-3">
              <h2 className="text-lg font-bold">By vocabulary set</h2>
              {data.sets.length ? (
                data.sets.map((set) => (
                  <div className="panel" key={set.id}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold">{set.title}</h3>
                      <span className="badge">{set.dueCards} due</span>
                    </div>
                    <p className="muted mt-3 text-sm">
                      {set.learnedCards} / {set.totalCards} learned ·{' '}
                      {Math.round(set.accuracy)}% accuracy
                    </p>
                    <progress
                      className="mt-3 w-full"
                      max={Math.max(1, set.totalCards)}
                      value={set.learnedCards}
                      aria-label={`${set.title} learned cards`}
                    />
                  </div>
                ))
              ) : (
                <p className="empty-state">
                  Create a set to start tracking progress.
                </p>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Recent sessions</h2>
              {data.recentSessions.length ? (
                data.recentSessions.map((session) => (
                  <div
                    className="panel flex items-start justify-between gap-3"
                    key={session.id}
                  >
                    <div>
                      <p className="font-bold">
                        {session.mode.toLowerCase().replaceAll('_', ' ')}
                      </p>
                      <p className="muted mt-1 text-xs">
                        {new Date(session.startedAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                      <p className="muted mt-2 text-xs">
                        {session.status.toLowerCase()}
                      </p>
                    </div>
                    <span className="badge">
                      {session.correct}/{session.answered} correct
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty-state">
                  Your first practice session will appear here.
                </p>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
