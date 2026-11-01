import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

const user = {
  id: '9af688f7-9df5-461c-a90d-688e97c5da7a',
  telegramId: '987654321',
  username: 'ada',
  firstName: 'Ada',
  lastName: null,
  languageCode: 'en',
  photoUrl: null,
};

const createdSet = {
  id: 'ec6329fc-1fb2-436d-a2eb-6dd6ba97f3b1',
  ownerId: user.id,
  copiedFromId: null,
  title: 'Travel essentials',
  description: null,
  sourceLanguage: 'English',
  targetLanguage: 'Polish',
  visibility: 'PRIVATE' as const,
  cardCount: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = input.toString();
    if (url.endsWith('/health')) {
      return jsonResponse({
        status: 'ok',
        service: 'language-learning-api',
        timestamp: new Date().toISOString(),
      });
    }
    if (url.endsWith('/api/v1/users/me')) {
      return jsonResponse({ user });
    }
    if (url.endsWith('/api/v1/sets') && options?.method === 'POST') {
      return jsonResponse({ set: createdSet }, 201);
    }
    if (url.endsWith('/api/v1/sets')) {
      return jsonResponse({ sets: [] });
    }
    return jsonResponse({ error: { message: 'Unexpected request' } }, 404);
  });
}

describe('App', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads the authenticated library and reports a healthy API', async () => {
    mockApi();
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Vocabulary sets' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Hello, Ada')).toBeInTheDocument();
      expect(screen.getByText('API connected')).toBeInTheDocument();
      expect(
        screen.getByText('Your first set starts here'),
      ).toBeInTheDocument();
    });
  });

  it('creates a vocabulary set from the library', async () => {
    mockApi();
    render(<App />);

    await screen.findByText('Your first set starts here');
    fireEvent.click(screen.getByRole('button', { name: '+ New set' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Travel essentials' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save set' }));

    await waitFor(() => {
      expect(screen.getByText('Travel essentials')).toBeInTheDocument();
      expect(screen.getByText('English → Polish')).toBeInTheDocument();
    });
  });
});
