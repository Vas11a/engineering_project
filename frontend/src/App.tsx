import { useEffect, useState } from 'react';
import { retrieveRawInitData } from '@tma.js/sdk-react';
import {
  createSet,
  getCurrentUser,
  listSets,
  updateSet,
  type SetInput,
  type User,
  type VocabularySet,
} from './api/vocabulary';
import { CatalogView } from './components/CatalogView';
import { ProgressView } from './components/ProgressView';
import { SetDetail } from './components/SetDetail';
import { SetForm } from './components/SetForm';
import { StudyView } from './components/StudyView';
import { ErrorNotice, Loading, SetTile } from './components/common';
import { useHealth } from './hooks/useHealth';

type View =
  | 'library'
  | 'set-create'
  | 'set-detail'
  | 'set-edit'
  | 'study'
  | 'catalog'
  | 'progress';
const tabs = [
  { view: 'library', label: 'Library', icon: '▦' },
  { view: 'study', label: 'Study', icon: '◇' },
  { view: 'catalog', label: 'Discover', icon: '◎' },
  { view: 'progress', label: 'Progress', icon: '↗' },
] as const;
function initialView(): View {
  let start = new URLSearchParams(window.location.search).get('start');
  try {
    start =
      new URLSearchParams(retrieveRawInitData() ?? '').get('start_param') ??
      start;
  } catch {
    /* Ordinary browser development. */
  }
  return start === 'study' || start === 'progress' ? start : 'library';
}
export function App() {
  const health = useHealth();
  const [view, setView] = useState<View>(initialView);
  const [user, setUser] = useState<User | null>(null);
  const [sets, setSets] = useState<VocabularySet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studySet, setStudySet] = useState<VocabularySet | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = sets.find((set) => set.id === selectedId);
  useEffect(() => {
    let active = true;
    void Promise.all([getCurrentUser(), listSets()])
      .then(([currentUser, library]) => {
        if (active) {
          setUser(currentUser);
          setSets(library);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load your library.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  function navigate(next: View) {
    if (busy) return;
    setView(next);
    setError(null);
    setNotice(null);
    if (next === 'library') setSelectedId(null);
    if (next === 'study') setStudySet(undefined);
  }
  function syncSet(next: VocabularySet) {
    setSets((current) =>
      current.map((set) => (set.id === next.id ? next : set)),
    );
  }
  async function saveSet(input: SetInput) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (view === 'set-edit' && selected) {
        syncSet(await updateSet(selected.id, input));
        setView('set-detail');
      } else {
        const created = await createSet(input);
        setSets((current) => [created, ...current]);
        setView('library');
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this set.',
      );
    } finally {
      setBusy(false);
    }
  }
  function copied(set: VocabularySet) {
    setSets((current) => [set, ...current]);
    setSelectedId(set.id);
    setView('set-detail');
    setNotice(
      'Set copied to your library. You can edit it and start learning.',
    );
  }
  const activeTab = view.startsWith('set-') ? 'library' : view;
  const status =
    health === 'online'
      ? 'API connected'
      : health === 'offline'
        ? 'API unavailable'
        : 'Checking API';
  return (
    <main className="app-shell">
      <header className="flex items-center justify-between gap-3">
        <button
          className="flex items-center gap-3 text-left"
          disabled={busy}
          onClick={() => navigate('library')}
          aria-label="Lexilo home"
        >
          <span className="brand-mark">L</span>
          <span>
            <span className="eyebrow block text-[10px]">A word at a time</span>
            <span className="block text-xl font-black">Lexilo</span>
          </span>
        </button>
        <span className="api-status" aria-label={status}>
          <span
            className={`size-2 rounded-full ${health === 'online' ? 'bg-emerald-500' : health === 'offline' ? 'bg-rose-500' : 'bg-amber-400'}`}
          />
          <span>{status}</span>
        </span>
      </header>
      <section className="mt-8 flex-1 space-y-5">
        {error && (
          <ErrorNotice
            message={error}
            onRetry={
              !user
                ? () => {
                    setLoading(true);
                    setRetry((value) => value + 1);
                  }
                : undefined
            }
          />
        )}
        {notice && (
          <div className="suggestion text-sm" role="status">
            {notice}
          </div>
        )}
        {view === 'library' && (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">
                  {user ? `Hello, ${user.firstName}` : 'Your library'}
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  Vocabulary sets
                </h1>
              </div>
              <button
                className="button-primary shrink-0"
                disabled={!user || busy}
                onClick={() => setView('set-create')}
              >
                + New set
              </button>
            </div>
            {loading ? (
              <Loading label="Loading your library…" />
            ) : (
              user &&
              (sets.length ? (
                <>
                  <button
                    className="review-banner"
                    onClick={() => navigate('study')}
                  >
                    <span>
                      <span className="block text-lg font-bold">
                        Make a little progress
                      </span>
                      <span className="mt-1 block text-sm opacity-85">
                        Your next review is ready when you are.
                      </span>
                    </span>
                    <span className="text-2xl" aria-hidden>
                      →
                    </span>
                  </button>
                  <div className="grid gap-3">
                    {sets.map((set) => (
                      <SetTile
                        key={set.id}
                        set={set}
                        onOpen={() => {
                          setSelectedId(set.id);
                          setView('set-detail');
                          setNotice(null);
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span className="text-4xl accent">◫</span>
                  <h2 className="mt-3 text-lg font-bold">
                    Your first set starts here
                  </h2>
                  <p className="muted mt-2 text-sm leading-6">
                    Group words by topic, language, class, or anything else that
                    helps you learn.
                  </p>
                  <button
                    className="button-primary mt-5"
                    onClick={() => setView('set-create')}
                  >
                    Create a set
                  </button>
                  <button
                    className="back-link mt-4 block w-full"
                    onClick={() => navigate('catalog')}
                  >
                    Explore public sets →
                  </button>
                </div>
              ))
            )}
          </>
        )}
        {loading && view !== 'library' && (
          <Loading label="Opening your account…" />
        )}
        {user && !loading && (
          <>
            {view === 'set-create' && (
              <SetForm
                busy={busy}
                onCancel={() => navigate('library')}
                onSubmit={saveSet}
              />
            )}
            {view === 'set-edit' && selected && (
              <SetForm
                initial={selected}
                busy={busy}
                onCancel={() => setView('set-detail')}
                onSubmit={saveSet}
              />
            )}
            {view === 'set-detail' && selected && (
              <SetDetail
                key={selected.id}
                set={selected}
                busy={busy}
                onBusy={setBusy}
                onUpdate={syncSet}
                onDelete={() => {
                  setSets((current) =>
                    current.filter((set) => set.id !== selected.id),
                  );
                  navigate('library');
                  setView('library');
                  setSelectedId(null);
                }}
                onEdit={() => setView('set-edit')}
                onBack={() => navigate('library')}
                onStudy={() => {
                  setStudySet(selected);
                  setView('study');
                }}
              />
            )}
            {view === 'study' && (
              <StudyView
                key={`${user.id}:${studySet?.id ?? 'all'}`}
                userId={user.id}
                onBusy={setBusy}
                setId={studySet?.id}
                setTitle={studySet?.title}
                onFinish={() => navigate('library')}
              />
            )}
            {view === 'catalog' && (
              <CatalogView onCopy={copied} onBusy={setBusy} />
            )}
            {view === 'progress' && (
              <ProgressView onStudy={() => navigate('study')} />
            )}
          </>
        )}
      </section>
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button
            key={tab.view}
            disabled={!user || busy}
            aria-current={activeTab === tab.view ? 'page' : undefined}
            onClick={() => navigate(tab.view)}
          >
            <span className="text-xl" aria-hidden>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
