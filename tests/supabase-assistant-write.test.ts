import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabasePatchAssistant } from '../functions/_shared/supabase';

const ENV = {
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('supabasePatchAssistant', () => {
  it('preserves the required owner id when upserting knowledge notes', async () => {
    const existing = {
      id: 'assistant-1',
      user_id: 'owner-1',
      business_name: 'Telya Agency',
      config: { behavior: { tone: 'friendly' } },
      knowledge_notes: [],
    };
    let upsertBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';

      if (url.pathname.endsWith('/assistants') && method === 'GET') {
        return new Response(JSON.stringify([existing]), { status: 200 });
      }
      if (url.pathname.endsWith('/assistants') && method === 'POST') {
        upsertBody = JSON.parse(String(init?.body));
        if (!upsertBody.user_id) {
          return new Response('null value in column "user_id" violates not-null constraint', { status: 400 });
        }
        return new Response('[]', { status: 201 });
      }
      if (url.pathname.endsWith('/knowledge_entries')) {
        // The legacy JSON write must still succeed before this migration is applied.
        return new Response('relation "knowledge_entries" does not exist', { status: 404 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const notes = [{ id: 'note-1', title: 'Services', content: 'Marketing hôtelier', category: 'services', enabled: true }];
    const result = await supabasePatchAssistant(ENV, 'assistant-1', { knowledgeNotes: notes });

    expect(result.ok).toBe(true);
    expect(upsertBody?.user_id).toBe('owner-1');
    expect(upsertBody?.knowledge_notes).toEqual(notes);
  });
});
