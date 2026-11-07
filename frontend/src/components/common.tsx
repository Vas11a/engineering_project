import type { Card, VocabularySet } from '../api/vocabulary';
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="back-link mt-2" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty-state" role="status">
      {label}
    </div>
  );
}
export function SetTile({
  set,
  onOpen,
}: {
  set: VocabularySet;
  onOpen: () => void;
}) {
  return (
    <button className="set-card" onClick={onOpen}>
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-lg font-bold">{set.title}</span>
          <span className="muted mt-1 block text-sm">
            {set.sourceLanguage} → {set.targetLanguage}
          </span>
        </span>
        <span className="badge shrink-0">
          {set.cardCount} {set.cardCount === 1 ? 'card' : 'cards'}
        </span>
      </span>
      {set.description && (
        <span className="muted mt-3 block text-sm leading-6">
          {set.description}
        </span>
      )}
      <span className="muted mt-4 block text-xs">
        {set.visibility === 'PUBLIC' ? 'Public set' : 'Private set'}
      </span>
    </button>
  );
}
export function CardContent({
  card,
  actions,
}: {
  card: Pick<Card, 'sourceText' | 'translation' | 'explanation' | 'examples'>;
  actions?: React.ReactNode;
}) {
  return (
    <article className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{card.sourceText}</h3>
          <p className="accent mt-1 font-semibold">{card.translation}</p>
        </div>
        {actions}
      </div>
      {card.explanation && (
        <p className="muted mt-4 text-sm leading-6">{card.explanation}</p>
      )}
      {card.examples.length > 0 && (
        <ul className="muted mt-4 space-y-2 border-t border-current/10 pt-4 text-sm italic">
          {card.examples.map((example, index) => (
            <li key={index}>{example}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
