/**
 * 🎙️ MOTEUR D'APPEL VOCAL (navigateur) — tests
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. l'audio est converti JUSTE (16 bits, 16 kHz) : sinon Gemini reçoit du
 *      bruit et le client croit que « la voix ne marche pas » ;
 *   2. les messages de Gemini Live sont compris dans les deux écritures
 *      (camelCase et snake_case) — une version d'API ne doit pas couper l'appel ;
 *   3. un appel se termine TOUJOURS proprement : micro relâché, minuteur
 *      arrêté, durée et tokens remontés (c'est ce qui facture le marchand).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  VOICE_MESSAGES,
  VOICE_STATES,
  base64ToBytes,
  buildAudioMessage,
  buildOpeningTurn,
  bytesToBase64,
  createVoiceCall,
  downsampleBuffer,
  floatTo16BitPCM,
  levelOf,
  parseLiveMessage,
  pcm16ToFloat32,
} from '../public/cdn/voice.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fausse WebSocket : on garde tout ce qui est envoyé, on rejoue ce qu'on veut. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  readyState = 0;
  sent: string[] = [];
  closed: Array<{ code?: number; reason?: string }> = [];
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(obj: unknown) {
    this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closed.push({ code, reason });
    this.onclose?.({});
  }
}

/** Faux AudioContext : assez pour capturer et pour jouer, sans son réel. */
class FakeAudioContext {
  static lastProcessor: any = null;
  static played: number[] = [];
  static closed = 0;
  sampleRate = 48000;
  currentTime = 0;
  destination = { connect() {} };
  constructor(public options?: any) {
    if (options?.sampleRate) this.sampleRate = options.sampleRate;
  }
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, copyToChannel() {} };
  }
  createBufferSource() {
    return {
      buffer: null as any,
      connect() {},
      start() {
        FakeAudioContext.played.push(1);
      },
      stop() {},
      onended: null as any,
    };
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createScriptProcessor() {
    const processor: any = { onaudioprocess: null, connect() {}, disconnect() {} };
    FakeAudioContext.lastProcessor = processor;
    return processor;
  }
  close() {
    FakeAudioContext.closed += 1;
    return Promise.resolve();
  }
}

const fakeMic = async () => ({ getTracks: () => [{ stop() {} }] });

function makeCall(overrides: Record<string, any> = {}) {
  const states: string[] = [];
  const transcripts: Array<{ speaker: string; text: string }> = [];
  const errors: Array<{ message: string }> = [];
  let ended: any = null;
  const call = createVoiceCall({
    wsUrl: 'wss://exemple.test/live?access_token=JETON',
    setup: { setup: { model: 'models/gemini-test-live' } },
    greeting: 'Salam, bienvenue !',
    maxSeconds: 300,
    deps: {
      WebSocket: FakeWebSocket,
      getUserMedia: fakeMic,
      AudioContext: FakeAudioContext,
    },
    onState: (s: string) => states.push(s),
    onTranscript: (t: any) => transcripts.push(t),
    onError: (e: any) => errors.push(e),
    onEnd: (info: any) => { ended = info; },
    ...overrides,
  });
  return { call, states, transcripts, errors, ended: () => ended };
}

afterEach(() => {
  FakeWebSocket.instances = [];
  FakeAudioContext.lastProcessor = null;
  FakeAudioContext.played = [];
  FakeAudioContext.closed = 0;
});

describe('conversions audio', () => {
  it('convertit des flottants en PCM 16 bits, en bornant les extrêmes', () => {
    const pcm = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    expect(Array.from(pcm)).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });

  it('fait l’aller-retour PCM → flottants sans dérive audible', () => {
    const original = new Float32Array([0, 0.25, -0.5, 0.99]);
    const back = pcm16ToFloat32(new Uint8Array(floatTo16BitPCM(original).buffer));
    expect(back.length).toBe(4);
    for (let i = 0; i < original.length; i += 1) expect(back[i]).toBeCloseTo(original[i], 3);
  });

  it('code et décode le base64 (l’audio voyage ainsi sur la WebSocket)', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('ramène 48 kHz à 16 kHz (un tiers des échantillons) et laisse 16 kHz intact', () => {
    const input = new Float32Array(4800).fill(0.1);
    expect(downsampleBuffer(input, 48000, 16000).length).toBe(1600);
    expect(downsampleBuffer(input, 16000, 16000)).toBe(input);
  });

  it('mesure le niveau sonore : silence = 0, voix = non nul', () => {
    expect(levelOf(new Float32Array(128))).toBe(0);
    expect(levelOf(new Float32Array(128).fill(0.3))).toBeGreaterThan(0.5);
  });
});

describe('messages Gemini Live', () => {
  it('reconnaît la fin de configuration', () => {
    expect(parseLiveMessage('{"setupComplete":{}}').setupComplete).toBe(true);
    expect(parseLiveMessage('{"setup_complete":{}}').setupComplete).toBe(true);
  });

  it('extrait l’audio et le texte de la réponse du modèle', () => {
    const msg = parseLiveMessage(JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'QUJD', mimeType: 'audio/pcm;rate=24000' } }, { text: 'bonjour' }] },
        turnComplete: true,
      },
    }));
    expect(msg.audioChunks).toEqual([{ data: 'QUJD', mimeType: 'audio/pcm;rate=24000' }]);
    expect(msg.textChunks).toEqual(['bonjour']);
    expect(msg.turnComplete).toBe(true);
  });

  it('comprend la même réponse écrite en snake_case', () => {
    const msg = parseLiveMessage(JSON.stringify({
      server_content: {
        model_turn: { parts: [{ inline_data: { data: 'QUJD', mime_type: 'audio/pcm;rate=24000' } }] },
        turn_complete: true,
        input_transcription: { text: 'vous êtes ouverts ?' },
        output_transcription: { text: 'oui, jusqu’à 18h' },
      },
      usage_metadata: { prompt_token_count: 152, response_token_count: 480 },
    }));
    expect(msg.audioChunks[0].data).toBe('QUJD');
    expect(msg.userText).toBe('vous êtes ouverts ?');
    expect(msg.botText).toBe('oui, jusqu’à 18h');
    expect(msg.usage).toEqual({ tokensIn: 152, tokensOut: 480, total: 0 });
  });

  it('détecte une interruption (le client coupe la parole)', () => {
    expect(parseLiveMessage(JSON.stringify({ serverContent: { interrupted: true } })).interrupted).toBe(true);
  });

  it('ne plante pas sur un message illisible', () => {
    expect(parseLiveMessage('pas du json').malformed).toBe(true);
    expect(parseLiveMessage('').malformed).toBe(true);
    expect(parseLiveMessage(JSON.stringify({ inconnu: 1 })).audioChunks).toEqual([]);
  });

  it('prépare le tour d’ouverture et la trame audio', () => {
    expect(buildOpeningTurn('Bonjour chez Nour').clientContent.turns[0].parts[0].text).toMatch(/Ouvre l.appel/);
    expect(buildOpeningTurn('').clientContent.turns[0].parts[0].text).toBe('Bonjour');
    expect(buildAudioMessage('QUJD').realtimeInput.mediaChunks[0]).toEqual({
      mimeType: 'audio/pcm;rate=16000',
      data: 'QUJD',
    });
  });
});

describe('l’appel, de bout en bout (faux navigateur)', () => {
  it('s’ouvre, parle, écoute, transcrit et remonte la consommation', async () => {
    const { call, states, transcripts, errors, ended } = makeCall();

    call.start();
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.CONNECTING);
    expect(states[0]).toBe(VOICE_STATES.CONNECTING);

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain('access_token=JETON');
    ws.open();
    await flush();

    // 1. Le navigateur envoie EXACTEMENT la configuration décidée par le serveur.
    expect(JSON.parse(ws.sent[0])).toEqual({ setup: { model: 'models/gemini-test-live' } });

    // 2. Gemini confirme → l'assistant ouvre l'appel et on écoute.
    ws.emit({ setupComplete: {} });
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.LISTENING);
    // La phrase d'ouverture du marchand vit dans les consignes que le SERVEUR a
    // rangées dans le jeton (voir voice-session.test.ts) : ici, le navigateur ne
    // fait que demander à l'assistant d'ouvrir l'appel.
    expect(JSON.parse(ws.sent[1]).clientContent.turns[0].parts[0].text).toMatch(/Ouvre l.appel/);

    // 3. Le micro envoie de l'audio 16 kHz (48 kHz ramené à 16).
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.2), sampleRate: 48000 },
    });
    const audio = JSON.parse(ws.sent[ws.sent.length - 1]).realtimeInput.mediaChunks[0];
    expect(audio.mimeType).toBe('audio/pcm;rate=16000');
    expect(audio.data.length).toBeGreaterThan(0);
    // 4096 échantillons à 48 kHz → 1365 échantillons à 16 kHz → 2730 octets → 3640 caractères base64.
    expect(audio.data.length).toBe(3640);

    // 4. Gemini répond en audio : on le joue et on passe en « il parle ».
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } });
    expect(call.getState()).toBe(VOICE_STATES.SPEAKING);
    expect(FakeAudioContext.played.length).toBe(1);

    // 5. Transcription + consommation.
    ws.emit({ serverContent: { outputTranscription: { text: 'Oui, nous sommes ouverts.' }, turnComplete: true } });
    ws.emit({ usageMetadata: { promptTokenCount: 152, responseTokenCount: 480 } });
    expect(transcripts).toEqual([{ speaker: 'bot', text: 'Oui, nous sommes ouverts.', final: true }]);

    // 6. Il coupe la parole : la lecture en cours s'arrête, on réécoute.
    ws.emit({ serverContent: { interrupted: true } });
    expect(call.getState()).toBe(VOICE_STATES.LISTENING);

    // 7. Raccrocher libère tout et remonte ce qui a été consommé.
    call.stop('client');
    expect(call.getState()).toBe(VOICE_STATES.ENDED);
    expect(ws.closed[0].code).toBe(1000);
    expect(FakeAudioContext.closed).toBeGreaterThan(0);
    expect(ended()).toMatchObject({ tokensIn: 152, tokensOut: 480, reason: 'client' });
    expect(ended().seconds).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  it('le micro coupé n’envoie plus rien, mais l’appel continue', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    const before = ws.sent.length;
    expect(call.setMuted(true)).toBe(true);
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(512).fill(0.4), sampleRate: 16000 },
    });
    expect(ws.sent.length).toBe(before); // rien n'est parti
    expect(call.isMuted()).toBe(true);

    expect(call.setMuted(false)).toBe(false);
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(512).fill(0.4), sampleRate: 16000 },
    });
    expect(ws.sent.length).toBe(before + 1); // le micro repart
    call.stop('client');
  });

  it('micro refusé : message clair au visiteur, aucun appel ouvert', async () => {
    const denied = async () => {
      const err = new Error('refusé');
      (err as any).name = 'NotAllowedError';
      throw err;
    };
    const { call, errors } = makeCall({
      deps: { WebSocket: FakeWebSocket, getUserMedia: denied, AudioContext: FakeAudioContext },
    });
    call.start();
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.ERROR);
    expect(errors[0].message).toBe(VOICE_MESSAGES.denied);
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it('appel interrompu par le serveur : on remonte quand même la durée', async () => {
    const { call, ended } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    ws.close(1006, 'réseau'); // Google coupe
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.ENDED);
    expect(ended()).toBeTruthy();
    expect(ended().reason).toBe('closed');
  });

  it('sans adresse d’appel, on prévient au lieu de rester muet', async () => {
    const { call, errors } = makeCall({ wsUrl: '' });
    call.start();
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.ERROR);
    expect(errors[0].message).toBe(VOICE_MESSAGES.disconnected);
  });
});
