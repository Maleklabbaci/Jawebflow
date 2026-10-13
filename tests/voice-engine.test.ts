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
  unlockVoiceAudio,
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
    // Comme un vrai navigateur : l'événement porte le code et la raison.
    this.onclose?.({ code, reason });
  }
}

/** Faux AudioContext : assez pour capturer et pour jouer, sans son réel. */
class FakeAudioContext {
  static lastProcessor: any = null;
  static played: number[] = [];
  static closed = 0;
  /** 🔔 La sonnerie (oscillateur) : nombre de démarrages. */
  static rings = 0;
  /** 🔊 Les morceaux d'audio joués, pour simuler leur fin de lecture. */
  static sources: any[] = [];
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
    const node: any = {
      buffer: null,
      connect() {},
      start() {
        FakeAudioContext.played.push(1);
      },
      stop() {},
      onended: null,
    };
    FakeAudioContext.sources.push(node);
    return node;
  }
  /** Simule la fin de lecture : un vrai navigateur appelle `onended`. */
  static finishAudio() {
    const nodes = FakeAudioContext.sources;
    FakeAudioContext.sources = [];
    for (const node of nodes) {
      if (typeof node.onended === 'function') node.onended({});
    }
  }
  /** 🔔 La tonalité d'appel : un gain + un oscillateur, comme dans le moteur. */
  createGain() {
    return {
      gain: { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect() {},
      disconnect() {},
      start() {
        FakeAudioContext.rings += 1;
      },
      stop() {},
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
  FakeAudioContext.rings = 0;
  FakeAudioContext.sources = [];
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
    // Forme ACTUELLE de l'API : `realtimeInput.audio`.
    // Avec l'ancienne (`mediaChunks`, dépréciée) Google ne garde que le PREMIER
    // morceau de micro : l'assistant n'entendait qu'un mot sur dix.
    const trame = buildAudioMessage('QUJD');
    expect(trame.realtimeInput.audio).toEqual({ mimeType: 'audio/pcm;rate=16000', data: 'QUJD' });
    expect(trame.realtimeInput.mediaChunks).toBeUndefined();
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

    // 3. 🔇 Tant que l'assistant n'a pas dit un mot, le micro est FERMÉ : le
    // client n'est pas encore censé parler, et surtout Google ne doit entendre
    // ni la sonnerie ni l'écho du haut-parleur. Sans cette porte, il croyait
    // que le client parlait et attendait… (les « 12 secondes » avant le premier
    // mot), ou coupait sa propre phrase.
    const avantPremierMot = ws.sent.length;
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.2), sampleRate: 48000 },
    });
    expect(ws.sent.length).toBe(avantPremierMot); // rien n'est parti

    // 4. Gemini répond en audio : on le joue et on passe en « il parle ».
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } });
    expect(call.getState()).toBe(VOICE_STATES.SPEAKING);
    expect(FakeAudioContext.played.length).toBe(1);

    // 5. 🔇 Il parle : le micro du client ne part TOUJOURS pas — Gemini ne doit
    // pas s'entendre lui-même (« elle parle et ça coupe »).
    const pendantLaPhrase = ws.sent.length;
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.2), sampleRate: 48000 },
    });
    expect(ws.sent.length).toBe(pendantLaPhrase);

    // 6. Transcription + consommation.
    ws.emit({ serverContent: { outputTranscription: { text: 'Oui, nous sommes ouverts.' }, turnComplete: true } });
    ws.emit({ usageMetadata: { promptTokenCount: 152, responseTokenCount: 480 } });
    expect(transcripts).toEqual([{ speaker: 'bot', text: 'Oui, nous sommes ouverts.', final: true }]);

    // 7. Le dernier mot est joué : la ligne revient au client, le micro repart —
    //    en 16 kHz (48 kHz ramené à 16).
    FakeAudioContext.finishAudio();
    expect(call.getState()).toBe(VOICE_STATES.LISTENING);
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.2), sampleRate: 48000 },
    });
    const audio = JSON.parse(ws.sent[ws.sent.length - 1]).realtimeInput.audio;
    expect(audio.mimeType).toBe('audio/pcm;rate=16000');
    expect(audio.data.length).toBeGreaterThan(0);
    // 4096 échantillons à 48 kHz → 1365 échantillons à 16 kHz → 2730 octets → 3640 caractères base64.
    expect(audio.data.length).toBe(3640);

    // 8. Il coupe la parole : la lecture en cours s'arrête, on réécoute.
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } });
    ws.emit({ serverContent: { interrupted: true } });
    expect(call.getState()).toBe(VOICE_STATES.LISTENING);

    // 9. Raccrocher libère tout et remonte ce qui a été consommé.
    call.stop('client');
    expect(call.getState()).toBe(VOICE_STATES.ENDED);
    expect(ws.closed[0].code).toBe(1000);
    expect(FakeAudioContext.closed).toBeGreaterThan(0);
    expect(ended()).toMatchObject({ tokensIn: 152, tokensOut: 480, reason: 'client' });
    expect(ended().seconds).toBeGreaterThanOrEqual(0);
    // `setupDone` distingue un vrai appel d'une session morte avant le 1er mot :
    // c'est ce que le widget lit pour décider s'il retente avec l'ancien modèle.
    expect(ended().setupDone).toBe(true);
    // ⏱️ Où est passé le temps : micro, connexion, setup, premier mot. C'est ce
    // qui permet de diagnostiquer un appel lent sans deviner.
    expect(ended().timings).toBeTruthy();
    expect(ended().timings.firstAudioMs).toBeGreaterThanOrEqual(0);
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
    // L'assistant dit bonjour puis se tait : la ligne revient au client, donc le
    // micro est de nouveau ouvert (sinon rien ne pourrait partir, par sécurité).
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(480)) } }] } } });
    ws.emit({ serverContent: { turnComplete: true } });
    FakeAudioContext.finishAudio();

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

  it('appel établi qui se coupe : le visiteur LIT pourquoi (plus de coupure muette)', async () => {
    const notices: Array<{ code: string; message: string }> = [];
    const { call, ended } = makeCall({ onNotice: (n: any) => notices.push(n) });
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    // Google referme la session en pleine conversation (réseau, durée côté
    // serveur) : l'appel s'arrête ET on dit au visiteur de réessayer.
    ws.close(1006, 'réseau');
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.ENDED);
    expect(ended().reason).toBe('closed');
    expect(notices[0]).toMatchObject({ code: 'closed' });
    expect(notices[0].message).toBe(VOICE_MESSAGES.disconnected);
  });

  it('durée de parole atteinte : on l’explique au lieu de couper sans un mot', async () => {
    const notices: Array<{ code: string; message: string }> = [];
    const { call, ended } = makeCall({ maxSeconds: 1, onNotice: (n: any) => notices.push(n) });
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    await new Promise((resolve) => setTimeout(resolve, 1200)); // le minuteur fait son travail
    expect(ended().reason).toBe('max-duration');
    expect(notices[0]).toMatchObject({ code: 'max-duration' });
    expect(notices[0].message).toBe(VOICE_MESSAGES.timeout);
    call.stop('client');
  });

  it('appel interrompu par le serveur : on remonte quand même la durée', async () => {
    const { call, ended, errors } = makeCall();
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
    // Le vrai appel avait commencé : aucune erreur affichée, et pas de nouvel essai.
    expect(ended().setupDone).toBe(true);
    expect(errors).toEqual([]);
  });

  it('Google refuse la session : le visiteur LIT la raison, l’appel se termine', async () => {
    const { call, ended, errors } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    // C'est exactement ce que Google envoie quand la configuration est refusée.
    ws.emit({ error: { code: 1007, status: 'INVALID_ARGUMENT', message: 'request contains an invalid argument' } });
    await flush();

    expect(call.getState()).toBe(VOICE_STATES.ERROR);
    expect(errors[0].message).toContain('invalid argument');
    // L'appel est TERMINÉ (plus d'écran bloqué en « en cours »)…
    expect(ended()).toBeTruthy();
    expect(ended().reason).toBe('server');
    // …et le widget sait que la session n'a jamais démarré : il peut retenter.
    expect(ended().setupDone).toBe(false);
    expect(ended().serverMessage).toContain('invalid argument');
    expect(FakeAudioContext.closed).toBeGreaterThan(0);
  });

  it('coupé avant le moindre mot : plus de raccrochage silencieux', async () => {
    const { call, ended, errors } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open(); // la socket s'ouvre… puis Google la referme aussitôt
    ws.close(1008, 'invalid payload');
    await flush();

    expect(call.getState()).toBe(VOICE_STATES.ERROR);
    expect(errors[0].message).toMatch(/fermée aussitôt/);
    expect(errors[0].message).toContain('1008');
    expect(errors[0].message).toContain('invalid payload');
    expect(ended()).toBeTruthy();
    expect(ended().setupDone).toBe(false);
  });

  it('sans adresse d’appel, on prévient au lieu de rester muet', async () => {
    const { call, errors } = makeCall({ wsUrl: '' });
    call.start();
    await flush();
    // 🔔 Nouveau : la session démarre SANS le jeton (la sonnerie tourne déjà),
    // donc l'absence d'adresse n'est une erreur qu'au moment de brancher.
    expect(FakeAudioContext.rings).toBe(1);
    await call.connect({ wsUrl: '' });
    expect(call.getState()).toBe(VOICE_STATES.ERROR);
    expect(errors[0].message).toBe(VOICE_MESSAGES.disconnected);
    call.stop('client');
  });

  it('la sonnerie et le micro démarrent AVANT le jeton du serveur', async () => {
    // C'est le correctif du « ça sonne 4 secondes puis 7 secondes de silence » :
    // le visiteur entend la tonalité dès le clic et le micro se demande en même
    // temps que le jeton part au serveur — plus rien n'attend rien.
    const { call, states } = makeCall({ wsUrl: '' });
    call.start();
    await flush();

    expect(states[0]).toBe(VOICE_STATES.CONNECTING);
    expect(FakeAudioContext.rings).toBe(1);              // la sonnerie tourne
    expect(FakeAudioContext.lastProcessor).toBeTruthy(); // le micro est demandé
    expect(FakeWebSocket.instances.length).toBe(0);      // pas encore de session

    await call.connect({ wsUrl: 'wss://exemple.test/live?access_token=JETON', setup: { setup: { model: 'models/x' } } });
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toContain('access_token=JETON');
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();
    // …et la sonnerie s'arrête au PREMIER MOT de l'assistant, pas avant.
    expect(FakeAudioContext.rings).toBe(1);
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(480)) } }] } } });
    await flush();
    expect(FakeAudioContext.played.length).toBe(1);
    call.stop('client');
  });

  it('le client qui parle PAR-DESSUS l’assistant reprend la parole (sans perdre son début de phrase)', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    // L'assistant parle.
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } });
    expect(call.getState()).toBe(VOICE_STATES.SPEAKING);
    const avantBarge = ws.sent.length;

    // Le client parle fort (0,5 d'amplitude ⇒ niveau 1) pendant ~400 ms : cinq
    // morceaux de 85 ms. L'écho du haut-parleur, lui, ne suffit pas à déclencher.
    const fort = { inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.5), sampleRate: 48000 } };
    for (let i = 0; i < 5; i += 1) FakeAudioContext.lastProcessor.onaudioprocess(fort);

    expect(call.getState()).toBe(VOICE_STATES.LISTENING); // l'assistant se tait
    const trames = ws.sent.slice(avantBarge).map((raw) => JSON.parse(raw));
    // Son début de phrase n'a pas été perdu : les morceaux gardés sont renvoyés.
    expect(trames.filter((m) => m.realtimeInput)).toHaveLength(5);
    call.stop('client');
  });

  it('un bruit court ne coupe PAS l’assistant (seule une voix tenue le fait)', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();
    ws.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } });
    const avant = ws.sent.length;

    // Une toux, un claquement de porte : fort mais COURT (1 morceau = 85 ms).
    FakeAudioContext.lastProcessor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.9), sampleRate: 48000 },
    });
    expect(call.getState()).toBe(VOICE_STATES.SPEAKING); // il continue sa phrase
    expect(ws.sent.slice(avant).filter((raw) => JSON.parse(raw).realtimeInput)).toHaveLength(0);
    call.stop('client');
  });
});

describe('les messages binaires de Gemini Live', () => {
  it('comprend un message envoyé en Blob (la vraie forme en production)', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    await flush();

    // ⚠️ Google n'envoie PAS du texte : il envoie du binaire. Ne pas décoder
    // ces trames, c'était le bot muet — aucun `setupComplete`, aucun audio joué.
    ws.onmessage?.({ data: new Blob([JSON.stringify({ setupComplete: {} })]) } as any);
    await flush();
    await flush();
    expect(call.getState()).toBe(VOICE_STATES.LISTENING);

    ws.onmessage?.({
      data: new Blob([
        JSON.stringify({
          serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } },
        }),
      ]),
    } as any);
    await flush();
    await flush();
    expect(FakeAudioContext.played.length).toBe(1);
    call.stop('client');
  });

  it('comprend aussi un ArrayBuffer (autres navigateurs)', async () => {
    const { call, transcripts } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    const charge = new TextEncoder().encode(
      JSON.stringify({ serverContent: { outputTranscription: { text: 'Salam, ça coûte dix dinars.' }, turnComplete: true } }),
    );
    ws.onmessage?.({ data: charge.buffer } as any);
    await flush();
    await flush();

    expect(transcripts[0]).toMatchObject({ speaker: 'bot', text: 'Salam, ça coûte dix dinars.' });
    call.stop('client');
  });
});

describe('l’outil : l’agent note la demande du client', () => {
  it('appelle onToolCall puis RENVOIE la réponse au modèle (sinon l’appel se fige)', async () => {
    const calls: any[] = [];
    const { call } = makeCall({
      onToolCall: (c: any) => {
        calls.push(c);
        return { ok: true, enregistre: true };
      },
    });
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    ws.emit({
      toolCall: {
        functionCalls: [{ id: 'fc1', name: 'enregistrer_demande', args: { nom: 'Sara', telephone: '0697660969' } }],
      },
    });
    await flush();
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'enregistrer_demande', args: { telephone: '0697660969' } });

    const sent = ws.sent.map((raw) => JSON.parse(raw));
    const toolResponse = sent.find((m) => m.toolResponse);
    expect(toolResponse.toolResponse.functionResponses[0]).toMatchObject({
      id: 'fc1',
      name: 'enregistrer_demande',
      response: { ok: true, enregistre: true },
    });
    call.stop('client');
  });

  it('sans gestionnaire, le modèle reçoit quand même une réponse (jamais de silence)', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    ws.emit({ toolCall: { functionCalls: [{ id: 'fc2', name: 'enregistrer_demande', args: {} }] } });
    await flush();
    await flush();

    const sent = ws.sent.map((raw) => JSON.parse(raw));
    const toolResponse = sent.find((m) => m.toolResponse);
    expect(toolResponse.toolResponse.functionResponses[0]).toMatchObject({ id: 'fc2', response: { ok: false } });
    call.stop('client');
  });

  it('comprend l’écriture snake_case de Google (tool_call)', () => {
    const parsed = parseLiveMessage(
      JSON.stringify({ tool_call: { function_calls: [{ id: 'x', name: 'enregistrer_demande', args: {} }] } }),
    );
    expect(parsed.toolCall).toBeTruthy();
  });
});

describe('le son de l’appel (haut-parleur)', () => {
  it('le module expose de quoi débloquer le son dans un clic', () => {
    // Indispensable : sans geste de l'utilisateur, les navigateurs créent une
    // sortie audio « suspendue » et l'assistant reste muet.
    expect(typeof unlockVoiceAudio).toBe('function');
  });

  it('le son est actif par défaut, et le bouton le coupe puis le remet', async () => {
    const { call } = makeCall();
    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    expect(call.isSpeakerOn()).toBe(true);

    const morceau = { serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } };
    ws.emit(morceau);
    expect(FakeAudioContext.played.length).toBe(1);

    // Son coupé : plus rien n'est joué, mais l'appel continue.
    expect(call.setSpeaker(false)).toBe(false);
    expect(call.isSpeakerOn()).toBe(false);
    ws.emit(morceau);
    expect(FakeAudioContext.played.length).toBe(1);

    // Remis : le son repart.
    expect(call.setSpeaker(true)).toBe(true);
    ws.emit(morceau);
    expect(FakeAudioContext.played.length).toBe(2);
    call.stop('client');
  });

  it('navigateur qui bloque le son : on le DIT au lieu de laisser muet', async () => {
    class BlockedAudioContext extends FakeAudioContext {
      state = 'suspended';
      resumed = 0;
      resume() {
        this.resumed += 1;
        return Promise.resolve();
      }
    }
    const notices: Array<{ code: string; message: string }> = [];
    const { call } = makeCall({
      deps: { WebSocket: FakeWebSocket, getUserMedia: fakeMic, AudioContext: BlockedAudioContext },
      onNotice: (n: any) => notices.push(n),
    });

    call.start();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ setupComplete: {} });
    await flush();

    // Deux morceaux : l'avis n'est donné qu'UNE fois, puis on retente en silence.
    const morceau = { serverContent: { modelTurn: { parts: [{ inlineData: { data: bytesToBase64(new Uint8Array(960)) } }] } } };
    ws.emit(morceau);
    ws.emit(morceau);
    await flush();

    expect(notices).toHaveLength(1);
    expect(notices[0].code).toBe('audio-blocked');
    expect(notices[0].message).toMatch(/son est bloqué|🔊/);
    call.stop('client');
  });
});
