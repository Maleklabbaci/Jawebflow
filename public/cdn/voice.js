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
  audioBlocked:
    "Le son est bloqué par votre navigateur : touchez le bouton 🔊 ci-dessous pour l'activer.",
};

/**
 * 🔇 « L'assistant ne s'écoute pas lui-même ».
 *
 * Le haut-parleur renvoie la voix de l'assistant dans le micro. Sans garde-fou,
 * Gemini « entend » l'assistant et coupe sa propre phrase en plein milieu
 * (« elle parle et ça coupe »), ou croit que le client n'arrête pas de parler.
 *
 * On garde donc le micro FERMÉ (rien n'est envoyé à Gemini) pendant que
 * l'assistant parle — sauf si le CLIENT parle vraiment par-dessus : voix franche
 * et tenue (MIC_BARGE_LEVEL pendant MIC_BARGE_MS) ⇒ l'assistant se tait, on
 * renvoie les morceaux déjà captés (MIC_KEEP_FRAMES) et le client reprend la
 * parole sans avoir perdu le début de sa phrase.
 */
export const MIC_BARGE_LEVEL = 0.55;
export const MIC_BARGE_MS = 420;
export const MIC_KEEP_FRAMES = 8;
/**
 * Sécurité : si l'assistant n'a pas dit un mot au bout de 6 secondes (modèle qui
 * réfléchit, outil lent…), on rouvre le micro quand même — le client ne doit
 * jamais se retrouver sans pouvoir parler.
 */
export const MIC_GATE_FAILSAFE_MS = 6000;
/**
 * Combien de temps on laisse sonner en attendant le jeton du serveur avant de
 * prévenir le visiteur (au lieu de sonner dans le vide).
 */
export const SESSION_WAIT_MS = 20000;

// ── Conversions audio (fonctions pures : testées une par une) ───────────────

// ── Le haut-parleur ─────────────────────────────────────────────────────────

/**
 * Un SEUL contexte audio pour toute la page, créé au premier geste du visiteur.
 *
 * ⚠️ C'est la règle des navigateurs (Chrome, Safari, et surtout iOS) : un
 * contexte audio créé SANS geste de l'utilisateur démarre « suspendu », et
 * tout ce qu'on lui fait jouer reste MUET. Comme notre appel démarre après un
 * `fetch` (donc hors du clic), le contexte naissait suspendu : le modèle parlait,
 * et le visiteur n'entendait rien — ni sur PC, ni sur téléphone.
 *
 * Le widget appelle `unlockVoiceAudio()` DANS le clic (📞 / 🔊), et le contexte
 * débloqué sert ensuite à tout l'appel.
 */
let sharedOut = null;

function audioCtor() {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.webkitAudioContext || null;
}

/** À appeler dans un clic : crée/réveille la sortie audio. Renvoie le contexte. */
export function unlockVoiceAudio() {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!sharedOut) {
    try {
      sharedOut = new Ctor();
    } catch {
      return null;
    }
  }
  try {
    if (sharedOut.state === 'suspended' && sharedOut.resume) sharedOut.resume();
  } catch {
    /* certains navigateurs n'ont pas besoin de resume */
  }
  // Un échantillon silencieux : c'est ce qui « ouvre » vraiment la sortie sur iOS.
  try {
    const buffer = sharedOut.createBuffer(1, 1, sharedOut.sampleRate || 48000);
    const node = sharedOut.createBufferSource();
    node.buffer = buffer;
    node.connect(sharedOut.destination);
    node.start(0);
  } catch {
    /* sans importance : la sortie reste utilisable */
  }
  return sharedOut;
}

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
 * @param {(call:{name:string,args:object,callId:string})=>Promise<object>|object} [options.onToolCall]
 *        l'agent appelle un outil (ex. enregistrer la demande du client) : le
 *        widget enregistre, puis renvoie la réponse au modèle.
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
  // Haut-parleur : allumé par défaut (le client entend son assistant).
  let speakerOn = true;
  let ringTimer = null;
  let ringNodes = null;
  let blockedWarned = false;
  // 🔇 La porte du micro (voir MIC_BARGE_* plus haut) et le chronomètre des
  // étapes du démarrage : c'est ce qui permet de dire OÙ passe le temps.
  let pendingMic = [];
  let bargeMs = 0;
  let firstAudioPlayed = false;
  let botTurnOpen = false;
  let gateFailsafe = null;
  let sessionTimeout = null;
  let micReady = Promise.resolve(false);
  const startedAt = Date.now();
  const timings = { micMs: 0, wsMs: 0, setupMs: 0, firstAudioMs: 0 };
  // Le serveur décide (jeton éphémère) ; le widget peut confier ces valeurs PLUS
  // TARD, quand le serveur a répondu — la sonnerie et le micro, eux, démarrent
  // tout de suite (c'est ce qui supprime le trou entre « ça sonne » et « il
  // parle »).
  const session = {
    wsUrl: opts.wsUrl || '',
    setup: opts.setup || {},
    greeting: opts.greeting || '',
    maxSeconds: Number(opts.maxSeconds) || 0,
  };

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

  /**
   * La ligne est-elle occupée par l'assistant ?
   *
   * Vrai pendant qu'il parle (audio en cours), pendant qu'il prépare sa réponse
   * (`botTurnOpen`), et au tout début — avant sa première phrase : le temps de la
   * sonnerie, le micro reste fermé pour que Gemini n'entende ni la sonnerie ni
   * l'écho du haut-parleur. C'est ce qui le faisait patienter (l'ancien silence
   * de plusieurs secondes) puis couper sa phrase au milieu.
   */
  function lineBusy() {
    if (!speakerOn) return false; // son coupé : le client peut parler
    if (activeSources.length) return true;
    if (botTurnOpen) return true;
    return !firstAudioPlayed;
  }

  /** Renvoie au serveur les morceaux gardés : le client vient de reprendre la parole. */
  function flushPendingMic() {
    const frames = pendingMic.slice();
    pendingMic.length = 0;
    if (!frames.length || muted || !ws || ws.readyState !== 1) return;
    for (const frame of frames) {
      try {
        ws.send(JSON.stringify(buildAudioMessage(frame)));
      } catch {
        /* trame perdue : la conversation continue */
      }
    }
  }

  /**
   * La sortie audio de CET appel. En production c'est le contexte partagé de la
   * page (débloqué par le geste du visiteur) ; en test, celui qu'on a injecté.
   */
  function ensureOut() {
    if (deps.AudioContext) {
      if (!outContext) {
        try {
          outContext = new deps.AudioContext();
        } catch {
          outContext = null;
        }
      }
      return outContext;
    }
    outContext = unlockVoiceAudio();
    return outContext;
  }

  function playChunk(base64) {
    // 🔊 Le PREMIER mot de l'assistant : on arrête la sonnerie ici (et pas à la
    // fin du « setup ») — le visiteur entend la tonalité jusqu'à ce que son
    // interlocuteur parle vraiment. Et le micro reste fermé pendant qu'il parle.
    if (!firstAudioPlayed) {
      firstAudioPlayed = true;
      timings.firstAudioMs = Date.now() - startedAt;
      stopRingtone();
    }
    botTurnOpen = true;
    if (!speakerOn) return;
    const ctx = ensureOut();
    if (!ctx) return;
    outContext = ctx;
    if (ctx.state === 'suspended') {
      // Le navigateur a re-suspendu la sortie : on prévient, sinon le visiteur
      // croit que l'assistant ne parle pas.
      if (!blockedWarned && typeof opts.onNotice === 'function') {
        blockedWarned = true;
        opts.onNotice({ code: 'audio-blocked', message: VOICE_MESSAGES.audioBlocked });
      }
      try {
        ctx.resume();
      } catch {
        /* on retente au morceau suivant */
      }
    }
    try {
      const bytes = base64ToBytes(base64);
      const floats = pcm16ToFloat32(bytes);
      const buffer = ctx.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      const now = ctx.currentTime;
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

  /** Tonalité d'appel : le visiteur entend que ça sonne pendant la connexion. */
  function startRingtone() {
    if (!speakerOn) return;
    const ctx = ensureOut();
    if (!ctx || typeof ctx.createOscillator !== 'function') return;
    stopRingtone();
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();
      ringNodes = { osc, gain };
      const beat = () => {
        if (!ringNodes) return;
        const t = ctx.currentTime;
        try {
          ringNodes.gain.gain.cancelScheduledValues(t);
          ringNodes.gain.gain.setValueAtTime(0, t);
          ringNodes.gain.gain.linearRampToValueAtTime(0.05, t + 0.04);
          ringNodes.gain.gain.setValueAtTime(0.05, t + 0.7);
          ringNodes.gain.gain.linearRampToValueAtTime(0, t + 0.78);
        } catch {
          /* fin d'appel : la tonalité s'arrête de toute façon */
        }
      };
      beat();
      ringTimer = setInterval(beat, 3000);
    } catch {
      /* pas de tonalité : l'appel continue */
    }
  }

  function stopRingtone() {
    if (ringTimer) {
      clearInterval(ringTimer);
      ringTimer = null;
    }
    if (ringNodes) {
      try {
        ringNodes.osc.stop();
      } catch {
        /* déjà arrêtée */
      }
      try {
        ringNodes.osc.disconnect();
        ringNodes.gain.disconnect();
      } catch {
        /* ignore */
      }
      ringNodes = null;
    }
  }

  /**
   * ⚠️ Gemini Live envoie ses messages en **binaire** (Blob / ArrayBuffer), pas
   * en texte. Sans cette conversion, `setupComplete` n'arrivait jamais et l'audio
   * n'était jamais joué : le modèle parlait… dans le vide. C'était LE « je
   * n'entends rien, ni sur PC ni sur téléphone ».
   */
  function decodeBytes(view) {
    try {
      return new TextDecoder().decode(new Uint8Array(view));
    } catch {
      return '';
    }
  }

  function toText(raw) {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'string') return raw;
    if (typeof ArrayBuffer !== 'undefined' && raw instanceof ArrayBuffer) return decodeBytes(raw);
    if (raw && raw.buffer instanceof ArrayBuffer) return decodeBytes(raw.buffer);
    if (raw && typeof raw.text === 'function') return raw.text();
    return raw;
  }

  function handleMessage(raw) {
    const text = toText(raw);
    // Un Blob (`raw.text()`) arrive une micro-tâche plus tard : on attend juste
    // ce cas-là, le reste est traité sans délai.
    if (text && typeof text.then === 'function') {
      text.then((resolved) => consumeLiveMessage(String(resolved)), () => {});
      return;
    }
    consumeLiveMessage(String(text));
  }

  function consumeLiveMessage(text) {
    const msg = parseLiveMessage(text);
    if (msg.error) {
      // « invalid argument », « model not found », quota… — la vraie raison.
      const detail = msg.error.message || msg.error.status || 'refus de Google';
      lastServerMessage = String(detail).slice(0, 300);
      abort('server', String(detail), 'server');
      return;
    }
    if (msg.toolCall) runToolCalls(msg.toolCall);
    if (msg.setupComplete) {
      setupDone = true;
      timings.setupMs = Date.now() - startedAt;
      emitState(VOICE_STATES.LISTENING);
      try {
        ws.send(JSON.stringify(buildOpeningTurn(session.greeting)));
      } catch {
        /* l'ouverture a échoué : le visiteur peut parler, c'est l'essentiel */
      }
      return;
    }
    if (msg.interrupted) {
      stopAudioPlayback();
      botTurnOpen = false;
      pendingMic.length = 0; // on ne renvoie pas l'écho accumulé pendant sa phrase
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
    if (msg.turnComplete) {
      // Tour terminé : on jette l'écho accumulé (on ne le renvoie PAS à Gemini),
      // et la porte du micro se rouvre dès que le dernier mot est joué.
      botTurnOpen = false;
      pendingMic.length = 0;
      if (!activeSources.length && state === VOICE_STATES.SPEAKING) emitState(VOICE_STATES.LISTENING);
    }
    if (msg.usage) {
      // Les compteurs de Gemini Live sont cumulatifs : on garde le maximum.
      tokensIn = Math.max(tokensIn, msg.usage.tokensIn || 0);
      tokensOut = Math.max(tokensOut, msg.usage.tokensOut || 0);
    }
  }

  /**
   * 🎯 L'agent vient d'appeler un outil (il veut NOTER quelque chose : nom,
   * numéro, rendez-vous). On prévient le widget (`onToolCall`), il enregistre
   * côté serveur, et on renvoie la réponse au modèle pour qu'il confirme au
   * client. Sans réponse, Gemini attendrait — et l'appel deviendrait muet.
   */
  function runToolCalls(call) {
    const calls = (call && (call.functionCalls || call.function_calls)) || [];
    if (!calls.length) return;
    const handler = typeof opts.onToolCall === 'function' ? opts.onToolCall : null;
    const send = (functionResponses) => {
      try {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
      } catch {
        /* trame perdue : l'appel continue */
      }
    };
    // Le modèle annonce lui-même « c'est noté » à voix haute : pas besoin de
    // doubler avec un message à l'écran.
    const done = (list) => send(list);
    Promise.all(
      calls.map((c) =>
        Promise.resolve()
          .then(() => (handler ? handler({ name: c.name, args: c.args || {}, callId: c.id }) : null))
          .catch(() => null)
          .then((response) => ({
            id: c.id,
            name: c.name,
            response: response && typeof response === 'object' ? response : { ok: false },
          })),
      ),
    )
      .then(done)
      .catch(() => {});
  }

  function startMic() {
    if (!getUserMedia || !AudioCtor) {
      fail(VOICE_MESSAGES.unsupported, 'unsupported');
      return Promise.resolve(false);
    }
    // 🎙️ On demande DIRECTEMENT la forme attendue par Gemini : un seul canal,
    // 16 kHz. Les navigateurs qui acceptent n'ont plus besoin d'être
    // ré-échantillonnés (son plus net, moins de calcul) ; les autres gardent
    // `downsampleBuffer`, donc rien ne casse.
    return getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
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
          const channel = event.inputBuffer.getChannelData(0);
          const level = levelOf(channel);
          if (typeof opts.onLevel === 'function') opts.onLevel(level);
          if (muted || !ws || ws.readyState !== 1) return;
          const rate = event.inputBuffer.sampleRate || micContext.sampleRate || 48000;
          const frameMs = (channel.length / rate) * 1000;
          const pcm = floatTo16BitPCM(downsampleBuffer(channel, rate, 16000));
          const frame = bytesToBase64(new Uint8Array(pcm.buffer));
          if (lineBusy()) {
            // L'assistant occupe la ligne : on N'ENVOIE PAS le son du micro
            // (Gemini « entendrait » l'assistant dans le haut-parleur et
            // couperait sa propre phrase). On garde les derniers morceaux…
            pendingMic.push(frame);
            if (pendingMic.length > MIC_KEEP_FRAMES) pendingMic.shift();
            // …et si le client parle vraiment par-dessus (voix franche et
            // tenue), l'assistant se tait et le client reprend la parole.
            bargeMs = level >= MIC_BARGE_LEVEL ? bargeMs + frameMs : 0;
            if (bargeMs >= MIC_BARGE_MS) {
              bargeMs = 0;
              firstAudioPlayed = true;
              botTurnOpen = false;
              stopAudioPlayback();
              emitState(VOICE_STATES.LISTENING);
              flushPendingMic();
            }
            return;
          }
          bargeMs = 0;
          pendingMic.length = 0;
          try {
            ws.send(JSON.stringify(buildAudioMessage(frame)));
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

  /**
   * Ouvre la connexion temps réel. Séparée de `start()` exprès : la sonnerie et
   * la demande de micro ne doivent PAS attendre le jeton du serveur (1 à 3
   * secondes de réseau) — c'était le trou entre « ça sonne » et « il parle ».
   */
  function openSocket() {
    if (ended || ws) return;
    if (!session.wsUrl) {
      fail(VOICE_MESSAGES.disconnected, 'no-url');
      return;
    }
    if (!WebSocketCtor) {
      fail(VOICE_MESSAGES.unsupported, 'unsupported');
      return;
    }
    const wsUrl = session.wsUrl;
    try {
      ws = new WebSocketCtor(wsUrl);
    } catch (e) {
      fail(VOICE_MESSAGES.disconnected, 'ws');
      return;
    }
    ws.onopen = () => {
      timings.wsMs = Date.now() - startedAt;
      try {
        ws.send(JSON.stringify(session.setup || {}));
      } catch (e) {
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
        const why = [lastServerMessage, (event && event.reason) || '', code].filter(Boolean).join(' — ');
        abort('closed', `La connexion a été fermée aussitôt (${why}).`, 'ws-close');
        return;
      }
      // La session avait DÉMARRÉ : l'appel s'est interrompu en pleine
      // conversation (réseau, durée côté Google). On le dit au visiteur —
      // c'était le « ça coupe » sans aucune explication.
      if (typeof opts.onNotice === 'function') {
        opts.onNotice({ code: 'closed', message: VOICE_MESSAGES.disconnected });
      }
      abort('closed', '', 'ws-close');
    };
    timer = setInterval(() => {
      seconds += 1;
      const max = Number(session.maxSeconds) || 0;
      if (max > 0 && seconds >= max) stop('max-duration');
    }, 1000);
  }

  /**
   * Prépare l'appel TOUT DE SUITE, dans le clic du visiteur : sortie audio
   * débloquée (sinon le navigateur rend l'assistant muet), sonnerie, et demande
   * du micro — le tout SANS attendre le serveur.
   */
  function start() {
    if (state !== VOICE_STATES.IDLE && state !== VOICE_STATES.ERROR && state !== VOICE_STATES.ENDED) return micReady;
    ended = false;
    seconds = 0;
    emitState(VOICE_STATES.CONNECTING);

    // Dans le clic : on débloque le haut-parleur et l'appel sonne immédiatement.
    outContext = ensureOut();
    blockedWarned = false;
    startRingtone();
    // Filet de sécurité : sans premier mot de l'assistant au bout de 6 s, la
    // sonnerie s'arrête et le micro s'ouvre (le client doit pouvoir parler).
    gateFailsafe = setTimeout(() => {
      if (!firstAudioPlayed) {
        firstAudioPlayed = true;
        stopRingtone();
      }
    }, MIC_GATE_FAILSAFE_MS);

    micReady = startMic().then((micOk) => {
      timings.micMs = Date.now() - startedAt;
      return micOk;
    });

    // Ancien usage (le widget avait déjà le jeton) : on enchaîne tout de suite.
    if (session.wsUrl) {
      return micReady.then((micOk) => {
        if (micOk) openSocket();
        return micOk;
      });
    }
    // Sinon : on sonne et on attend le jeton ; s'il n'arrive jamais, on prévient
    // au lieu de laisser sonner dans le vide.
    sessionTimeout = setTimeout(() => {
      abort('no-session', VOICE_MESSAGES.disconnected, 'no-url');
    }, SESSION_WAIT_MS);
    return micReady;
  }

  /**
   * Le jeton du serveur vient d'arriver : on branche la session et on parle.
   * (Rien n'est perdu si le navigateur a mis du temps : la sonnerie tournait.)
   */
  function connect(payload) {
    const conf = payload || {};
    if (conf.wsUrl) session.wsUrl = String(conf.wsUrl);
    if (conf.setup) session.setup = conf.setup;
    if (conf.greeting !== undefined) session.greeting = String(conf.greeting || '');
    if (conf.maxSeconds) session.maxSeconds = Number(conf.maxSeconds) || 0;
    return Promise.resolve(micReady).then(() => {
      if (ended || state === VOICE_STATES.ERROR) return false;
      if (!session.wsUrl) {
        fail(VOICE_MESSAGES.disconnected, 'no-url');
        return false;
      }
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
        sessionTimeout = null;
      }
      openSocket();
      return true;
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
    processor = null;
    source = null;
    stream = null;
    micContext = null;
    // ⚠️ On NE ferme PAS la sortie audio : c'est le contexte partagé de la page,
    // déjà « débloqué » par le geste du visiteur. Le fermer obligerait à
    // redemander un geste (et iOS rendrait l'appel suivant muet).
    outContext = sharedOut;
  }

  function stop(reason) {
    if (ended) return;
    ended = true;
    // La durée de parole réglée par le marchand est atteinte : on l'explique
    // (sinon l'appel se terminait sans un mot, comme une coupure).
    if (reason === 'max-duration' && typeof opts.onNotice === 'function') {
      opts.onNotice({ code: 'max-duration', message: VOICE_MESSAGES.timeout });
    }
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    stopAudioPlayback();
    stopRingtone();
    pendingMic.length = 0;
    bargeMs = 0;
    if (gateFailsafe) {
      clearTimeout(gateFailsafe);
      gateFailsafe = null;
    }
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      sessionTimeout = null;
    }
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
        // ⏱️ Où est passé le temps : micro, connexion, setup, premier mot.
        // C'est ce qui permet de diagnostiquer un appel lent SANS deviner.
        timings: { ...timings, totalMs: Date.now() - startedAt },
      });
    }
  }

  return {
    start,
    connect,
    stop,
    /** 🔇/🔊 : coupe ou remet le son de l'assistant (le micro n'est pas touché). */
    setSpeaker(on) {
      speakerOn = on !== false;
      if (!speakerOn) {
        stopRingtone();
        stopAudioPlayback();
        // Son coupé : l'assistant ne peut plus être entendu, donc on rouvre le
        // micro (le client peut parler quand même).
        botTurnOpen = false;
        pendingMic.length = 0;
      } else {
        ensureOut();
      }
      return speakerOn;
    },
    isSpeakerOn() {
      return speakerOn;
    },
    /** Réveille la sortie audio (à appeler dans un clic, ex. bouton 🔊). */
    unlockAudio() {
      return Boolean(ensureOut());
    },
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
