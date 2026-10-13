/**
 * JAWEBFLOW — 🎙️ MOTEUR D'APPEL VOCAL (navigateur)
 * ============================================================================
 * Module autonome (aucune dépendance) chargé par le widget quand le visiteur
 * appuie sur le micro. Il fait UNE chose : ouvrir un appel en direct avec
 * Gemini Live et le tenir proprement jusqu'à ce que quelqu'un raccroche.
 *
 *   micro (16 kHz PCM) ──► WebSocket ──► Gemini Live
 *   haut-parleur (24 kHz PCM) ◄── WebSocket ◄── Gemini Live
 *
 * La clé Gemini n'est PAS ici : le serveur a préparé un jeton éphémère
 * (`/api/voice/session`) et l'a rangé dans `wsUrl`. Ce module ne connaît que
 * cette adresse et les consignes déjà validées côté serveur.
 *
 * Utilisé par `public/widget.js` (site du marchand) : `import('/cdn/voice.js')`.
 */

export const VOICE_STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
  ENDED: 'ended',
  ERROR: 'error',
};

/** Messages français : le visiteur ne doit jamais voir une erreur technique. */
export const VOICE_MESSAGES = {
  denied: "L'accès au micro a été refusé. Autorisez le micro dans votre navigateur, ou écrivez-nous dans le chat.",
  unsupported: "Votre navigateur ne permet pas l'appel vocal. Écrivez-nous dans le chat, nous sommes là.",
  disconnected: "L'appel s'est interrompu. Vous pouvez réessayer, ou continuer par écrit.",
  noMic: "Aucun micro n'a été trouvé sur cet appareil. Écrivez-nous dans le chat.",
  timeout: 'Temps de parole écoulé pour cet appel. Merci ! Vous pouvez rappeler si besoin.',
};

// ── Conversions audio (fonctions pures : testées une par une) ───────────────

/** Float32 [-1,1] → PCM 16 bits signé (ce que Gemini attend). */
export function floatTo16BitPCM(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** PCM 16 bits (octets) → Float32 [-1,1] (pour la lecture). */
export function pcm16ToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** Octets → base64 (par morceaux : un seul btoa sur 1 Mo fait planter Safari). */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(String(b64 || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Ré-échantillonne vers 16 kHz : les navigateurs n'acceptent pas toujours un
 * AudioContext à 16 kHz, on convertit donc nous-mêmes (interpolation linéaire).
 */
export function downsampleBuffer(input, inRate, outRate = 16000) {
  if (!inRate || inRate === outRate) return input;
  if (inRate < outRate) return input; // déjà plus bas : Gemini accepte, on ne dégrade pas
  const ratio = inRate / outRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const pos = i * ratio;
    const before = Math.floor(pos);
    const after = Math.min(before + 1, input.length - 1);
    const weight = pos - before;
    out[i] = input[before] * (1 - weight) + input[after] * weight;
  }
  return out;
}

/** Niveau sonore 0..1 (pour animer l'onde de l'appel). */
export function levelOf(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
  const rms = Math.sqrt(sum / (input.length || 1));
  return Math.max(0, Math.min(1, rms * 3.2));
}

/** Message à envoyer pour parler au modèle en ouvrant l'appel. */
export function buildOpeningTurn(greeting) {
  const text = greeting
    ? "Le client vient de lancer l'appel. Ouvre l'appel exactement comme convenu."
    : 'Bonjour';
  return { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } };
}

/**
 * Message audio à envoyer (16 kHz mono).
 * ⚠️ `realtimeInput.mediaChunks` est DÉPRÉCIÉ et Google ne garde que le PREMIER
 * morceau : la forme actuelle est `realtimeInput.audio`. Avec l'ancienne, le
 * modèle n'entendait que le tout premier paquet de micro.
 */
export function buildAudioMessage(base64) {
  return { realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: base64 } } };
}

/**
 * Lit un message de Gemini Live et le range en clair.
 * Les deux écritures (camelCase et snake_case) sont acceptées : selon la
 * version d'API, Google renvoie l'une ou l'autre — le widget ne doit pas
 * cesser de parler pour une histoire de nom de champ.
 */
export function parseLiveMessage(raw) {
  let msg = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return { malformed: true };
    }
  }
  if (!msg || typeof msg !== 'object') return { malformed: true };

  const pick = (obj, camel, snake) => (obj[camel] !== undefined ? obj[camel] : obj[snake]);
  const serverContent = pick(msg, 'serverContent', 'server_content');
  const usage = pick(msg, 'usageMetadata', 'usage_metadata');

  const out = {
    // Google prévient AVANT de fermer : ce message dit exactement pourquoi.
    error: pick(msg, 'error', 'error') || null,
    setupComplete: Boolean(pick(msg, 'setupComplete', 'setup_complete')),
    audioChunks: [],
    textChunks: [],
    userText: '',
    botText: '',
    turnComplete: false,
    interrupted: false,
    usage: null,
    toolCall: pick(msg, 'toolCall', 'tool_call') || null,
  };

  if (serverContent) {
    out.turnComplete = Boolean(pick(serverContent, 'turnComplete', 'turn_complete'));
    out.interrupted = Boolean(serverContent.interrupted);
    const modelTurn = pick(serverContent, 'modelTurn', 'model_turn');
    const parts = (modelTurn && modelTurn.parts) || [];
    for (const part of parts) {
      const inline = pick(part, 'inlineData', 'inline_data');
      if (inline && inline.data) out.audioChunks.push({ data: inline.data, mimeType: inline.mimeType || inline.mime_type || '' });
      else if (typeof part.text === 'string' && part.text) out.textChunks.push(part.text);
    }
    const inT = pick(serverContent, 'inputTranscription', 'input_transcription');
    const outT = pick(serverContent, 'outputTranscription', 'output_transcription');
    if (inT && typeof inT.text === 'string') out.userText = inT.text;
    if (outT && typeof outT.text === 'string') out.botText = outT.text;
  }

  if (usage) {
    out.usage = {
      tokensIn: Number(pick(usage, 'promptTokenCount', 'prompt_token_count')) || 0,
      tokensOut: Number(pick(usage, 'responseTokenCount', 'response_token_count')) || 0,
      total: Number(pick(usage, 'totalTokenCount', 'total_token_count')) || 0,
    };
  }

  return out;
}

// ── L'appel ─────────────────────────────────────────────────────────────────

/**
 * Ouvre un appel vocal. Ne lève jamais d'exception : tout passe par onError /
 * onState (le widget doit rester utilisable même si le micro est refusé).
 *
 * @param {object} options
 * @param {string} options.wsUrl      adresse temps réel (jeton éphémère inclus)
 * @param {object} options.setup      message `setup` préparé par le serveur
 * @param {string} [options.greeting] phrase d'ouverture choisie par le marchand
 * @param {number} [options.maxSeconds] durée maximale de l'appel
 * @param {object} [options.deps]     injections de test (getUserMedia, WebSocket, AudioContext)
 * @param {(s:string)=>void} [options.onState]
 * @param {(t:{speaker:'user'|'bot',text:string,final:boolean})=>void} [options.onTranscript]
 * @param {(e:{message:string,code?:string})=>void} [options.onError]
 * @param {(u:{seconds:number,tokensIn:number,tokensOut:number,reason:string})=>void} [options.onEnd]
 * @param {(level:number)=>void} [options.onLevel]
 */
export function createVoiceCall(options) {
  const opts = options || {};
  const deps = opts.deps || {};
  const getUserMedia =
    deps.getUserMedia ||
    (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      : null);
  const WebSocketCtor = deps.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const AudioCtor =
    deps.AudioContext || (typeof AudioContext !== 'undefined' ? AudioContext : (typeof (globalThis || {}).webkitAudioContext !== 'undefined' ? globalThis.webkitAudioContext : null));

  let state = VOICE_STATES.IDLE;
  let ws = null;
  let stream = null;
  let micContext = null;
  let outContext = null;
  let processor = null;
  let source = null;
  let timer = null;
  let seconds = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let muted = false;
  let ended = false;
  let setupDone = false;
  let playHead = 0;
  let activeSources = [];
  let transcript = '';
  // Dernier mot de Google : sert à expliquer une fermeture inattendue.
  let lastServerMessage = '';

  const emitState = (next) => {
    state = next;
    if (typeof opts.onState === 'function') opts.onState(next);
  };
  const fail = (message, code) => {
    emitState(VOICE_STATES.ERROR);
    if (typeof opts.onError === 'function') opts.onError({ message, code: code || 'error' });
  };

  /**
   * Ferme l'appel anormalement : on affiche la raison, PUIS on termine
   * proprement (micro relâché, minuteur arrêté, `onEnd` appelé) — sinon le
   * widget resterait bloqué sur « appel en cours » sans jamais savoir pourquoi.
   */
  function abort(reason, message, code) {
    if (ended) return;
    if (message) fail(message, code);
    stop(reason);
  }

  function stopAudioPlayback() {
    for (const node of activeSources) {
      try {
        node.stop();
      } catch {
        /* déjà terminé */
      }
    }
    activeSources = [];
    playHead = 0;
  }

  function playChunk(base64) {
    if (!outContext) return;
    try {
      const bytes = base64ToBytes(base64);
      const floats = pcm16ToFloat32(bytes);
      const buffer = outContext.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const node = outContext.createBufferSource();
      node.buffer = buffer;
      node.connect(outContext.destination);
      const now = outContext.currentTime;
      const startAt = Math.max(now, playHead);
      node.start(startAt);
      playHead = startAt + buffer.duration;
      activeSources.push(node);
      node.onended = () => {
        activeSources = activeSources.filter((n) => n !== node);
        if (!activeSources.length && state === VOICE_STATES.SPEAKING) emitState(VOICE_STATES.LISTENING);
      };
      emitState(VOICE_STATES.SPEAKING);
    } catch {
      /* un morceau illisible ne doit pas couper l'appel */
    }
  }

  function handleMessage(raw) {
    const msg = parseLiveMessage(raw);
    if (msg.error) {
      // « invalid argument », « model not found », quota… — la vraie raison.
      const detail = msg.error.message || msg.error.status || 'refus de Google';
      lastServerMessage = String(detail).slice(0, 300);
      abort('server', String(detail), 'server');
      return;
    }
    if (msg.setupComplete) {
      setupDone = true;
      emitState(VOICE_STATES.LISTENING);
      try {
        ws.send(JSON.stringify(buildOpeningTurn(opts.greeting)));
      } catch {
        /* l'ouverture a échoué : le visiteur peut parler, c'est l'essentiel */
      }
      return;
    }
    if (msg.interrupted) {
      stopAudioPlayback();
      emitState(VOICE_STATES.LISTENING);
    }
    for (const chunk of msg.audioChunks) playChunk(chunk.data);
    if (msg.userText && typeof opts.onTranscript === 'function') {
      opts.onTranscript({ speaker: 'user', text: msg.userText, final: true });
      transcript += `Client : ${msg.userText}\n`;
    }
    if (msg.botText && typeof opts.onTranscript === 'function') {
      opts.onTranscript({ speaker: 'bot', text: msg.botText, final: true });
      transcript += `Assistant : ${msg.botText}\n`;
    }
    if (msg.turnComplete && !activeSources.length && state === VOICE_STATES.SPEAKING) emitState(VOICE_STATES.LISTENING);
    if (msg.usage) {
      // Les compteurs de Gemini Live sont cumulatifs : on garde le maximum.
      tokensIn = Math.max(tokensIn, msg.usage.tokensIn || 0);
      tokensOut = Math.max(tokensOut, msg.usage.tokensOut || 0);
    }
  }

  function startMic() {
    if (!getUserMedia || !AudioCtor) {
      fail(VOICE_MESSAGES.unsupported, 'unsupported');
      return Promise.resolve(false);
    }
    return getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((micStream) => {
        stream = micStream;
        micContext = new AudioCtor();
        source = micContext.createMediaStreamSource(stream);
        const bufferSize = 4096;
        processor = micContext.createScriptProcessor
          ? micContext.createScriptProcessor(bufferSize, 1, 1)
          : null;
        if (!processor) {
          fail(VOICE_MESSAGES.unsupported, 'unsupported');
          return false;
        }
        processor.onaudioprocess = (event) => {
          if (muted || !ws || ws.readyState !== 1) return;
          const channel = event.inputBuffer.getChannelData(0);
          if (typeof opts.onLevel === 'function') opts.onLevel(levelOf(channel));
          const rate = event.inputBuffer.sampleRate || micContext.sampleRate || 48000;
          const resampled = downsampleBuffer(channel, rate, 16000);
          const pcm = floatTo16BitPCM(resampled);
          try {
            ws.send(JSON.stringify(buildAudioMessage(bytesToBase64(new Uint8Array(pcm.buffer)))));
          } catch {
            /* trame perdue : la conversation continue */
          }
        };
        source.connect(processor);
        processor.connect(micContext.destination);
        return true;
      })
      .catch((err) => {
        const name = (err && err.name) || '';
        fail(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? VOICE_MESSAGES.denied
            : name === 'NotFoundError'
              ? VOICE_MESSAGES.noMic
              : VOICE_MESSAGES.unsupported,
          name || 'mic'
        );
        return false;
      });
  }

  function start() {
    if (state !== VOICE_STATES.IDLE && state !== VOICE_STATES.ERROR && state !== VOICE_STATES.ENDED) return;
    if (!opts.wsUrl) {
      fail(VOICE_MESSAGES.disconnected, 'no-url');
      return;
    }
    if (!WebSocketCtor) {
      fail(VOICE_MESSAGES.unsupported, 'unsupported');
      return;
    }
    ended = false;
    seconds = 0;
    emitState(VOICE_STATES.CONNECTING);

    startMic().then((micOk) => {
      if (!micOk) return;
      try {
        outContext = AudioCtor ? new AudioCtor({ sampleRate: 24000 }) : null;
      } catch {
        outContext = null;
      }
      try {
        ws = new WebSocketCtor(opts.wsUrl);
      } catch {
        fail(VOICE_MESSAGES.disconnected, 'ws');
        return;
      }
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify(opts.setup || {}));
        } catch {
          fail(VOICE_MESSAGES.disconnected, 'setup');
        }
      };
      ws.onmessage = (event) => handleMessage(event && event.data);
      ws.onerror = () => abort('ws-error', VOICE_MESSAGES.disconnected, 'ws-error');
      ws.onclose = (event) => {
        if (ended) return;
        // Anormal seulement si la session n'a JAMAIS démarré (Google a refermé
        // juste après l'ouverture), ou si Google avait déjà signalé une faute.
        if (!setupDone || lastServerMessage) {
          // Fermeture AVANT que la session soit prête : on dit ce que Google a
          // répondu, et s'il n'a rien dit, le code de fermeture.
          const code = event && event.code ? `code ${event.code}` : 'sans code';
          const why = [
            lastServerMessage,
            (event && event.reason) || '',
            code,
          ]
            .filter(Boolean)
            .join(' — ');
          abort('closed', `La connexion a été fermée aussitôt (${why}).`, 'ws-close');
          return;
        }
        abort('closed', '', 'ws-close');
      };
      timer = setInterval(() => {
        seconds += 1;
        const max = Number(opts.maxSeconds) || 0;
        if (max > 0 && seconds >= max) stop('max-duration');
      }, 1000);
    });
  }

  function releaseMic() {
    try {
      if (processor) processor.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (source) source.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (stream) for (const track of stream.getTracks()) track.stop();
    } catch {
      /* ignore */
    }
    try {
      if (micContext && micContext.close) micContext.close();
    } catch {
      /* ignore */
    }
    try {
      if (outContext && outContext.close) outContext.close();
    } catch {
      /* ignore */
    }
    processor = null;
    source = null;
    stream = null;
    micContext = null;
    outContext = null;
  }

  function stop(reason) {
    if (ended) return;
    ended = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stopAudioPlayback();
    try {
      if (ws && ws.readyState === 1) ws.close(1000, 'client-stop');
    } catch {
      /* ignore */
    }
    ws = null;
    releaseMic();
    // Un appel terminé par une erreur RESTE en erreur : le visiteur doit lire
    // la raison (sinon l'écran d'appel retomberait sur « rappeler » sans
    // explication, exactement le raccrochage muet d'avant).
    if (state !== VOICE_STATES.ERROR) emitState(VOICE_STATES.ENDED);
    if (typeof opts.onEnd === 'function') {
      opts.onEnd({
        seconds,
        tokensIn,
        tokensOut,
        reason: reason || 'client',
        // « setup » = la session n'a jamais démarré : le widget peut réessayer
        // une fois avec le couple historique au lieu d'afficher une erreur.
        setupDone,
        serverMessage: lastServerMessage,
        transcript: transcript.trim().slice(0, 4000),
      });
    }
  }

  return {
    start,
    stop,
    /** Coupe le micro sans raccrocher : le visiteur continue d'écouter. */
    setMuted(value) {
      muted = Boolean(value);
      return muted;
    },
    isMuted: () => muted,
    getState: () => state,
    getSeconds: () => seconds,
  };
}
