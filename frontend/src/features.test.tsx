import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardForm } from './components/CardForm';
import { StudyView } from './components/StudyView';
import { CatalogView } from './components/CatalogView';
import { SetDetail } from './components/SetDetail';

const set = {
  id: 'set-1',
  ownerId: 'user',
  copiedFromId: null,
  title: 'Travel',
  description: null,
  sourceLanguage: 'English',
  targetLanguage: 'Polish',
  visibility: 'PUBLIC' as const,
  cardCount: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI card creation', () => {
  it('requires reviewing and applying the AI suggestion before saving', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        translation: 'Dzień dobry',
        explanation: 'A greeting',
        examples: ['Good morning!'],
      }),
    );
    render(
      <CardForm
        busy={false}
        sourceLanguage="English"
        targetLanguage="Polish"
        onCancel={() => undefined}
        onSubmit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Word or phrase'), {
      target: { value: 'Good morning' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Translate with AI/ }));
    await screen.findByRole('region', { name: 'AI suggestion' });
    expect(screen.getByLabelText('Translation')).toHaveValue('');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save card' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use suggestion' }));
    expect(screen.getByLabelText('Translation')).toHaveValue('Dzień dobry');
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'My edited explanation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        sourceText: 'Good morning',
        translation: 'Dzień dobry',
        explanation: 'My edited explanation',
        examples: ['Good morning!'],
        creationSource: 'AI',
      }),
    );
  });
  it('keeps manual creation available when AI is unavailable', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ error: { message: 'AI is not configured.' } }, 503),
    );
    render(
      <CardForm
        busy={false}
        sourceLanguage="English"
        targetLanguage="Polish"
        onCancel={() => undefined}
        onSubmit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Word or phrase'), {
      target: { value: 'Hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Translate with AI/ }));
    await screen.findByText('AI is not configured.');
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'Cześć' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          translation: 'Cześć',
          creationSource: 'MANUAL',
        }),
      ),
    );
  });
});

describe('study sessions', () => {
  it('reveals flashcards, saves a rating and shows feedback before results', async () => {
    const active = {
      id: 'session-1',
      mode: 'FLASHCARDS',
      status: 'ACTIVE',
      total: 1,
      answered: 0,
      correct: 0,
      current: { cardId: 'card-1', sourceText: 'Hello', mode: 'FLASHCARDS' },
    };
    const completed = {
      ...active,
      status: 'COMPLETED',
      answered: 1,
      correct: 1,
      current: null,
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, options) => {
        const url = input.toString();
        if (url.endsWith('/study/due'))
          return response({ dueCount: 0, newCount: 1, totalCount: 1 });
        if (url.endsWith('/study/sessions'))
          return response({ session: active });
        if (url.endsWith('/reveal'))
          return response({
            translation: 'Cześć',
            explanation: null,
            examples: [],
          });
        if (url.endsWith('/answers')) {
          expect(JSON.parse(options?.body as string)).toMatchObject({
            cardId: 'card-1',
            confidence: 2,
          });
          return response({
            isCorrect: true,
            translation: 'Cześć',
            explanation: null,
            examples: [],
            session: completed,
          });
        }
        throw Error(`Unexpected URL ${url}`);
      });
    render(<StudyView userId="user" onFinish={() => undefined} />);
    await screen.findByRole('button', { name: 'Start session' });
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await screen.findByText('Hello');
    expect(screen.queryByText('Cześć')).not.toBeInTheDocument();
    expect(localStorage.getItem('lexilo:study:user')).toBe('session-1');
    fireEvent.click(screen.getByRole('button', { name: 'Reveal translation' }));
    await screen.findByText('Cześć');
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    await screen.findByText('Well remembered');
    expect(screen.queryByText('Session complete')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See results' }));
    await screen.findByText('Session complete');
    expect(localStorage.getItem('lexilo:study:user')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('resumes a saved translation session without creating a new one', async () => {
    localStorage.setItem('lexilo:study:user', 'resume-id');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input.toString().endsWith('/study/due'))
        return response({ dueCount: 1, newCount: 0, totalCount: 1 });
      return response({
        session: {
          id: 'resume-id',
          mode: 'TRANSLATION',
          status: 'ACTIVE',
          total: 2,
          answered: 1,
          correct: 0,
          current: {
            cardId: 'card-2',
            sourceText: 'Goodbye',
            mode: 'TRANSLATION',
          },
        },
      });
    });
    render(<StudyView userId="user" onFinish={() => undefined} />);
    await screen.findByText('Goodbye');
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Your translation')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start session' }),
    ).not.toBeInTheDocument();
  });
});

describe('public catalog', () => {
  it('sends filters to the backend and copies the chosen public set', async () => {
    const copied = vi.fn();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = input.toString();
        if (url.endsWith('/copy'))
          return response({
            set: { ...set, id: 'copied-id', visibility: 'PRIVATE' },
          });
        if (url.endsWith('/public-sets/set-1'))
          return response({ set, cards: [] });
        return response({ sets: [set], total: 1, page: 1, pageSize: 12 });
      });
    render(<CatalogView onCopy={copied} />);
    await screen.findByText('Travel');
    fireEvent.change(screen.getByLabelText('Search by title'), {
      target: { value: 'Travel' },
    });
    fireEvent.change(screen.getByLabelText('To language'), {
      target: { value: 'Polish' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search sets' }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) =>
          url
            .toString()
            .includes('q=Travel&sourceLanguage=&targetLanguage=Polish'),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Travel.*English/ }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy to my library' }),
    );
    await waitFor(() =>
      expect(copied).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'copied-id', visibility: 'PRIVATE' }),
      ),
    );
  });
});

describe('study answer modes', () => {
  it.each(['TRANSLATION', 'MULTIPLE_CHOICE'] as const)(
    'submits a %s answer and displays server feedback',
    async (mode) => {
      const active = {
        id: 'session',
        mode,
        status: 'ACTIVE',
        total: 1,
        answered: 0,
        correct: 0,
        current: {
          cardId: 'card',
          sourceText: 'Hello',
          mode,
          options: mode === 'MULTIPLE_CHOICE' ? ['Cześć', 'Dzięki'] : undefined,
        },
      };
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (input, options) => {
          const url = input.toString();
          if (url.endsWith('/study/due'))
            return response({ dueCount: 1, newCount: 0, totalCount: 1 });
          if (url.endsWith('/study/sessions'))
            return response({ session: active });
          if (url.endsWith('/answers')) {
            expect(JSON.parse(options?.body as string)).toMatchObject({
              cardId: 'card',
              submittedValue: 'Cześć',
            });
            return response({
              isCorrect: true,
              translation: 'Cześć',
              explanation: 'A greeting',
              examples: [],
              session: {
                ...active,
                status: 'COMPLETED',
                answered: 1,
                correct: 1,
                current: null,
              },
            });
          }
          throw Error('Unexpected request');
        },
      );
      render(<StudyView userId="user" onFinish={() => undefined} />);
      await screen.findByRole('button', { name: 'Start session' });
      fireEvent.click(screen.getByDisplayValue(mode));
      fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
      await screen.findByText('Hello');
      if (mode === 'TRANSLATION') {
        fireEvent.change(screen.getByLabelText('Your translation'), {
          target: { value: 'Cześć' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      } else fireEvent.click(screen.getByRole('button', { name: 'Cześć' }));
      await screen.findByText('Well remembered');
      expect(screen.getByText('A greeting')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'See results' }));
      await screen.findByText('Session complete');
    },
  );
});

describe('set publishing', () => {
  const card = {
    id: 'card',
    setId: set.id,
    sourceText: 'Hello',
    translation: 'Cześć',
    explanation: null,
    examples: [],
    creationSource: 'MANUAL',
  };
  it('publishes an owned nonempty set after confirming visibility', async () => {
    const update = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (input.toString().endsWith('/cards'))
        return response({ cards: [card] });
      expect(options?.method).toBe('PATCH');
      expect(JSON.parse(options?.body as string)).toEqual({
        visibility: 'PUBLIC',
      });
      return response({ set });
    });
    render(
      <SetDetail
        set={{ ...set, visibility: 'PRIVATE' }}
        busy={false}
        onBusy={() => undefined}
        onUpdate={update}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onBack={() => undefined}
        onStudy={() => undefined}
      />,
    );
    await screen.findByText('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(set));
  });
  it('reflects automatic unpublishing when the final card is deleted', async () => {
    const update = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) =>
      options?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : response({ cards: [card] }),
    );
    render(
      <SetDetail
        set={set}
        busy={false}
        onBusy={() => undefined}
        onUpdate={update}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onBack={() => undefined}
        onStudy={() => undefined}
      />,
    );
    await screen.findByText('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Hello' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ cardCount: 0, visibility: 'PRIVATE' }),
      ),
    );
  });
});
