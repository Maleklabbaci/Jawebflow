/**
 * Faux Gemini (generateContent) : on écrit à l'avance ce que « le modèle » répond,
 * tour après tour, et on garde TOUT ce que le serveur lui a envoyé pour le vérifier.
 */
export interface GeminiCall {
  model: string;
  body: any;
  headers: Record<string, string>;
}

type Step = (call: GeminiCall) => Response | object | Promise<Response | object>;

let seq = 0;

/** Une demande d'outil telle que Gemini la renvoie. */
export const functionCall = (name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  functionCall: { name, args, id: `call_${++seq}` },
  ...extra,
});

export const textPart = (text: string) => ({ text });

/** Réponse Gemini valide contenant ces parties. */
export const modelReply = (...parts: any[]) => ({
  candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 },
});

export class FakeGemini {
  calls: GeminiCall[] = [];
  private steps: Step[] = [];
  /** Que répondre quand la file est vide (par défaut : une erreur claire dans le test). */
  fallback: Step = () => new Response(JSON.stringify({ error: { message: 'FakeGemini : plus de réponse prévue' } }), { status: 500 });

  /** Ajoute la prochaine réponse (objet Gemini, Response, ou fonction qui regarde la requête). */
  next(...steps: Array<Step | object>): this {
    for (const s of steps) this.steps.push(typeof s === 'function' ? (s as Step) : () => s);
    return this;
  }

  handler = async (url: URL, init: any): Promise<Response> => {
    if (url.host !== 'generativelanguage.googleapis.com') {
      return new Response(JSON.stringify({ error: 'hôte inattendu' }), { status: 599 });
    }
    const model = decodeURIComponent(url.pathname.split('/models/')[1]?.split(':')[0] || '');
    const headers = Object.fromEntries(new Headers(init?.headers || {}).entries());
    const call: GeminiCall = { model, body: init?.body ? JSON.parse(String(init.body)) : {}, headers };
    this.calls.push(call);
    const step = this.steps.shift() || this.fallback;
    const out = await step(call);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

export const httpError = (status: number, message = 'erreur') => new Response(JSON.stringify({ error: { message } }), { status });
