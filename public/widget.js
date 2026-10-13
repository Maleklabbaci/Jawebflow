(function () {
  if (window.__JAWEBFLOW_WIDGET_LOADED__) return;
  window.__JAWEBFLOW_WIDGET_LOADED__ = true;

  // --- Config depuis la balise <script> ---
  // Détection robuste : certains clients collent le snippet sans
  // data-assistant-id -> on retombe sur le script widget.js lui-même
  // (sinon l'assistant retombait sur l'identifiant par défaut « asst_live »).
  var scripts = document.querySelectorAll('script[data-assistant-id], script[src*="widget.js"]');
  var scriptEl = scripts[scripts.length - 1] || document.currentScript;

  var assistantId = (scriptEl && scriptEl.getAttribute('data-assistant-id')) || 'asst_live';
  var businessName = (scriptEl && scriptEl.getAttribute('data-business-name')) || 'Assistant IA';
  var primaryColor = (scriptEl && scriptEl.getAttribute('data-primary-color')) || '#9333ea';
  var secondaryColor = (scriptEl && scriptEl.getAttribute('data-secondary-color')) || '#6366f1';
  var position = (scriptEl && scriptEl.getAttribute('data-position')) || 'bottom-right';
  var theme = (scriptEl && scriptEl.getAttribute('data-theme')) || 'dark';
  var shape = (scriptEl && scriptEl.getAttribute('data-shape')) || 'circle';
  var icon = (scriptEl && scriptEl.getAttribute('data-icon')) || 'sparkles';
  // Teaser : attribut ABSENT -> phrase par défaut ; attribut VIDE -> éteint.
  // (Avant, « teaser désactivé » remettait la phrase par défaut : le marchand
  // ne pouvait pas l'éteindre.)
  var teaserAttr = scriptEl ? scriptEl.getAttribute('data-teaser') : null;
  var teaserText = teaserAttr === null ? 'Une question ? Discutons en direct \uD83D\uDC4B' : teaserAttr;
  var welcomeMessage = (scriptEl && scriptEl.getAttribute('data-welcome')) || ("Bonjour ! \uD83D\uDC4B Comment puis-je vous aider aujourd'hui ?");
  var whatsappNumber = (scriptEl && scriptEl.getAttribute('data-whatsapp')) || '';
  var avatarUrl = (scriptEl && scriptEl.getAttribute('data-avatar-url')) || '';
  var brandingEnabled = (scriptEl && scriptEl.getAttribute('data-branding')) !== 'false';
  if (widgetMode === 'voice' && teaserAttr === null) teaserText = callCtaText;
  var size = (scriptEl && scriptEl.getAttribute('data-size')) || 'standard';
  var headerTitle = (scriptEl && scriptEl.getAttribute('data-header-title')) || '';
  var headerSubtitle = (scriptEl && scriptEl.getAttribute('data-header-subtitle')) || '';
  var onlineBadge = (scriptEl && scriptEl.getAttribute('data-badge')) !== 'false';

  // Taille de la bulle et arrondi : une seule source de vérité, utilisée pour
  // le style de départ ET pour la mise à jour quand la config arrive du serveur.
  function bubbleDims(value) {
    if (value === 'compact') return { size: 48, icon: 22 };
    if (value === 'large') return { size: 64, icon: 30 };
    return { size: 56, icon: 26 };
  }
  function shapeRadius(value) {
    if (value === 'squircle') return '16px';
    if (value === 'compact') return '12px';
    return '50%';
  }

  // ── Appel vocal (agent voix) : le marchand l'allume depuis son tableau de
  // bord, ou avec data-voice="on" pour un test rapide.
  var voiceEnabled = ((scriptEl && scriptEl.getAttribute('data-voice')) || '').toLowerCase() === 'on';
  var voiceGreeting = (scriptEl && scriptEl.getAttribute('data-voice-greeting')) || '';
  var voiceMaxMinutes = 5;

  // ── 🎯 MODE & ACCROCHE (décision du 14/10/2026) : le marchand décide de tout.
  // 'both' = écrit + appels · 'voice' = LE BOT QUI APPELLE seulement (pas de
  // chat) · 'chat' = écrit seulement (le micro disparaît même si la voix est
  // allumée). pulse / teaser-delay / auto-open / proactive servent à attirer
  // l'attention du visiteur pour qu'il engage la conversation.
  var widgetMode = ((scriptEl && scriptEl.getAttribute('data-mode')) || 'both').toLowerCase();
  if (widgetMode !== 'voice' && widgetMode !== 'chat') widgetMode = 'both';
  var pulse = ((scriptEl && scriptEl.getAttribute('data-pulse')) || 'on').toLowerCase() !== 'off';
  var teaserDelaySeconds = Number(scriptEl && scriptEl.getAttribute('data-teaser-delay')) || 0;
  var autoOpenSeconds = Number(scriptEl && scriptEl.getAttribute('data-auto-open')) || 0;
  var proactiveText = (scriptEl && scriptEl.getAttribute('data-proactive')) || '';
  var callCtaText = (scriptEl && scriptEl.getAttribute('data-call-cta')) || 'Appelez-moi';
  var customCss = '';
  var teaserVisible = teaserDelaySeconds <= 0;
  var attentionArmed = false;
  var callActive = false;      // un appel est en cours (ou en train de s'ouvrir)
  var callSession = null;      // le moteur d'appel, une fois chargé
  var callState = '';          // connecting | listening | speaking | error
  var callLines = [];          // ce qui se dit, en direct
  var callSeconds = 0;
  var callMuted = false;
  var callError = '';
  // Le moteur d'appel est mis en cache 24 h par le navigateur : on demande une
  // adresse versionnée pour qu'une correction du moteur arrive tout de suite
  // (incrémenter `v` à chaque changement de `public/cdn/voice.js`).
  var VOICE_ENGINE = '/cdn/voice.js?v=13';
  // Le moteur, chargé D'AVANCE : c'est ce qui permet de débloquer le son dans
  // le clic du visiteur (règle Chrome/Safari : sans geste, la sortie audio
  // démarre « suspendue » et l'assistant reste muet, même s'il parle).
  var engineModule = null;
  var enginePromise = null;
  function loadVoiceEngine() {
    if (!enginePromise) {
      enginePromise = import((apiOrigin || '') + VOICE_ENGINE).then(function (mod) {
        engineModule = mod;
        return mod;
      });
    }
    return enginePromise;
  }
  // À appeler EN PREMIER dans le clic, avant tout `fetch`.
  function unlockAudio() {
    try {
      if (engineModule && engineModule.unlockVoiceAudio) engineModule.unlockVoiceAudio();
    } catch (e) {
      /* le bouton « Son » reste là pour ça */
    }
  }
  // Une seule seconde chance : si Google ferme la session avant le moindre mot
  // (setup refuse), on redemande un jeton sur le couple historique.
  var voiceSetupDone = false;
  var voiceTriedFallback = false;
  var callSpeaker = true;      // le son de l'assistant : allume par defaut
  var firstCallError = '';     // la raison du PREMIER essai (la plus utile)
  var callTimerId = null;

  var namedColors = {
    violet: '#8b5cf6', cyan: '#06b6d4', orange: '#f97316', mono: '#334155',
    emerald: '#10b981', rose: '#f43f5e', indigo: '#4f46e5', blue: '#3b82f6', purple: '#9333ea'
  };
  if (namedColors[(primaryColor || '').toLowerCase()]) primaryColor = namedColors[primaryColor.toLowerCase()];
  if (namedColors[(secondaryColor || '').toLowerCase()]) secondaryColor = namedColors[secondaryColor.toLowerCase()];

  var isLeft = position === 'bottom-left';
  var isDark = theme === 'dark';

  // --- Origine reelle de l'API JawebFlow (jamais le domaine du site client) ---
  var apiOrigin = '';
  try {
    var srcUrl = (scriptEl && scriptEl.src) || (document.currentScript && document.currentScript.src) || '';
    if (srcUrl) apiOrigin = new URL(srcUrl).origin;
  } catch (e) { /* fallback: appel relatif */ }

  // --- Visiteur ---
  var visitorId = localStorage.getItem('jw_visitor_id');
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('jw_visitor_id', visitorId);
  }

  var isOpen = false;
  var isTyping = false;
  var messages = [{ sender: 'bot', text: welcomeMessage }];

  // --- Icones SVG (fonctions separees, aucune imbrication de backticks) ---
  function icon24(name, size, cls) {
    size = size || 24;
    cls = cls || '';
    if (name === 'headphone' || name === 'headphones' || name === 'support') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>';
    }
    if (name === 'bot' || name === 'robot' || name === 'ai') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
    }
    if (name === 'mic' || name === 'micro') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
    }
    if (name === 'hangup') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67"/><path d="M5 10v2a7 7 0 0 0 12 5"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
    }
    if (name === 'arrowdown') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="m6 9 6 6 6-6"/></svg>';
    }
    if (name === 'close' || name === 'x') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="' + cls + '"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>';
  }
  var sendIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>';
  var whatsappIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ffffff" d="M12 0C5.373 0 0 5.373 0 12c0 2.12.553 4.113 1.523 5.845L0 24l6.335-1.485A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.59 16.897c-.27.762-1.567 1.462-2.163 1.55-.552.083-1.247.117-2.012-.126-.463-.146-1.06-.343-1.822-.673-3.206-1.384-5.3-4.598-5.46-4.81-.16-.213-1.31-1.744-1.31-3.328 0-1.584.83-2.363 1.124-2.687.293-.323.64-.404.853-.404.213 0 .427.002.613.011.196.01.46-.075.72.55.267.64.907 2.213.987 2.373.08.16.133.347.026.56-.107.213-.16.347-.32.533-.16.187-.336.417-.48.56-.16.16-.326.333-.14.653.187.32.826 1.362 1.773 2.206 1.218 1.086 2.245 1.422 2.565 1.582.32.16.507.133.693-.08.187-.213.8-.933 1.014-1.253.213-.32.427-.267.72-.16.293.107 1.86.877 2.18 1.037.32.16.533.24.613.373.08.133.08.773-.19 1.534z"/></svg>';

  // --- Element hote + Shadow DOM (isolation CSS du site client) ---
  var hostId = 'jawebflow-widget-host-' + assistantId;
  var existing = document.getElementById(hostId);
  if (existing) existing.remove();
  var host = document.createElement('div');
  host.id = hostId;
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });
  var wrapper = document.createElement('div');
  wrapper.id = 'jw-widget-wrapper';
  shadow.appendChild(wrapper);

  // La fenêtre suit la taille choisie : compact = discret, large = confortable.
  // Le défaut (« standard ») est volontairement petit : une bulle de chat n'est
  // pas une application, elle doit se faire oublier quand on ne l'utilise pas.
  function windowDims(value) {
    if (value === 'compact') return { w: 300, h: 430 };
    if (value === 'large') return { w: 400, h: 600 };
    return { w: 340, h: 500 };
  }

  var styleEl = document.createElement('style');
  styleEl.id = 'jawebflow-widget-styles';
  styleEl.textContent =
    ':host{--primary:' + primaryColor + ';--secondary:' + secondaryColor + ';--radius-shape:' + shapeRadius(shape) + ';--bubble-size:' + bubbleDims(size).size + 'px;--bubble-icon:' + bubbleDims(size).icon + 'px;--window-radius:20px;--window-w:' + windowDims(size).w + 'px;--window-h:' + windowDims(size).h + 'px;--font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color-scheme:' + (isDark ? 'dark' : 'light') + ';-webkit-tap-highlight-color:transparent;}' +
    '#jw-widget-wrapper{position:fixed;bottom:24px;' + (isLeft ? 'left:24px;' : 'right:24px;') + 'z-index:2147483647;font-family:var(--font-family);display:flex;flex-direction:column;align-items:' + (isLeft ? 'flex-start' : 'flex-end') + ';pointer-events:none;}' +
    '#jw-widget-wrapper *{box-sizing:border-box;pointer-events:auto;}' +
    '.jw-bubble-btn{width:var(--bubble-size);height:var(--bubble-size);border-radius:var(--radius-shape);background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 8px 24px -4px var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;border:none;outline:none;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s;padding:0;overflow:hidden;}' +
    '.jw-bubble-btn:hover{transform:scale(1.06);}' +
    '.jw-bubble-btn svg{width:var(--bubble-icon);height:var(--bubble-icon);}' +
    '.jw-teaser{margin-bottom:12px;padding:10px 16px;border-radius:16px;font-size:13px;font-weight:500;background:' + (isDark ? '#111524' : '#fff') + ';color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)') + ';box-shadow:0 8px 24px -4px rgba(0,0,0,.15);cursor:pointer;display:flex;align-items:center;gap:10px;max-width:320px;}' +
    '.jw-teaser-close{opacity:.5;font-size:11px;padding:2px 4px;cursor:pointer;margin-left:auto;}' +
    '.jw-chat-window{width:var(--window-w);max-width:calc(100vw - 32px);height:var(--window-h);max-height:calc(100vh - 130px);border-radius:var(--window-radius);overflow:hidden;display:flex;flex-direction:column;margin-bottom:16px;box-shadow:0 16px 40px -10px rgba(0,0,0,' + (isDark ? '.6' : '.18') + ');background:' + (isDark ? '#0c0f1d' : '#fff') + ';color:' + (isDark ? '#f1f5f9' : '#0f172a') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)') + ';}' +
    '.jw-header{padding:16px 20px;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;display:flex;align-items:center;justify-content:space-between;}' +
    '.jw-header-info{display:flex;align-items:center;gap:12px;overflow:hidden;}' +
    '.jw-header-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;color:#fff;overflow:hidden;flex-shrink:0;}' +
    '.jw-header-avatar img{width:100%;height:100%;object-fit:cover;}' +
    '.jw-header-title{font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.jw-header-status-dot{width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;flex-shrink:0;}' +
    '.jw-header-subtitle{font-size:11px;opacity:.85;margin-top:1px;}' +
    '.jw-header-close{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;}' +
    '.jw-header-close svg{width:14px;height:14px;stroke-width:2.5;}' +
    '.jw-body{flex:1;padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;background:' + (isDark ? '#070a14' : '#f8fafc') + ';}' +
    '.jw-msg{max-width:82%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.5;word-break:break-word;}' +
    '.jw-msg-user{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;background:linear-gradient(135deg,var(--primary),var(--secondary));}' +
    '.jw-msg-bot{align-self:flex-start;border-bottom-left-radius:4px;background:' + (isDark ? '#141829' : '#fff') + ';color:' + (isDark ? '#f8fafc' : '#1e293b') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)') + ';}' +
    '.jw-typing{display:flex;gap:4px;align-items:center;padding:4px 6px;}' +
    '.jw-typing span{width:6px;height:6px;background:' + (isDark ? '#8a93a6' : '#64748b') + ';border-radius:50%;display:inline-block;animation:jwBounce 1.4s infinite ease-in-out both;}' +
    '.jw-typing span:nth-child(1){animation-delay:-.32s;}.jw-typing span:nth-child(2){animation-delay:-.16s;}' +
    '@keyframes jwBounce{0%,80%,100%{transform:scale(0);}40%{transform:scale(1);}}' +
    '.jw-input-bar{padding:14px 18px;display:flex;gap:10px;border-top:1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)') + ';background:' + (isDark ? '#0c0f1d' : '#fff') + ';align-items:center;}' +
    '.jw-input-wrapper{flex:1;}' +
    '.jw-input{width:100%;padding:11px 15px;border-radius:12px;font-size:13.5px;outline:none;background:' + (isDark ? '#111524' : '#f1f5f9') + ';color:' + (isDark ? '#fff' : '#0f172a') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)') + ';}' +
    '.jw-send-btn{width:40px;height:40px;border-radius:11px;border:none;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;}' +
    '.jw-send-btn svg{width:18px;height:18px;}' +
    '.jw-send-btn:disabled{opacity:.5;cursor:default;}' +
    '.jw-whatsapp-btn{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;background:#25d366;color:#fff;text-decoration:none;border-radius:12px;font-size:12.5px;font-weight:600;margin-top:4px;width:100%;}' +
    '.jw-whatsapp-btn svg{width:16px;height:16px;}' +
    '.jw-branding{text-align:center;font-size:10px;opacity:.5;padding:8px;text-decoration:none;color:inherit;display:block;}' +
    '.jw-feedback{display:flex;gap:2px;align-self:flex-start;margin:-8px 0 0 4px;}' +
    '.jw-feedback button{background:none;border:none;cursor:pointer;font-size:11px;opacity:.4;padding:1px 3px;transition:opacity .15s,transform .15s;}' +
    '.jw-feedback button:hover{opacity:1;}' +
    '.jw-feedback button.jw-fb-on{opacity:1;transform:scale(1.2);}' +
    '.jw-header-mic{background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;margin-right:8px;}' +
    '.jw-header-mic svg{width:14px;height:14px;stroke-width:2.5;}' +
    '.jw-call{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:22px 18px;overflow-y:auto;}' +
    '.jw-call-avatar{width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;overflow:hidden;}' +
    '.jw-call-avatar svg{width:38px;height:38px;}' +
    '.jw-call-avatar img{width:100%;height:100%;object-fit:cover;}' +
    '.jw-call-live .jw-call-avatar{animation:jwPulse 1.8s infinite;}' +
    '@keyframes jwPulse{0%{box-shadow:0 0 0 0 rgba(139,92,246,.45);}70%{box-shadow:0 0 0 26px rgba(139,92,246,0);}100%{box-shadow:0 0 0 0 rgba(139,92,246,0);}}' +
    '.jw-call-title{font-size:15px;font-weight:700;}' +
    '.jw-call-status{font-size:12.5px;opacity:.75;}' +
    '.jw-call-timer{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;}' +
    '.jw-call-lines{width:100%;max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:4px;text-align:left;}' +
    '.jw-call-line{font-size:12px;line-height:1.45;padding:7px 10px;border-radius:12px;background:rgba(127,127,127,.12);}' +
    '.jw-call-actions{display:flex;gap:10px;justify-content:center;margin-top:8px;flex-wrap:wrap;}' +
    '.jw-call-btn{border:none;cursor:pointer;border-radius:999px;padding:11px 18px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;font-family:inherit;}' +
    '.jw-call-btn svg{width:16px;height:16px;}' +
    '.jw-call-mute{background:rgba(127,127,127,.18);color:inherit;}' +
    '.jw-call-hang{background:#e11d48;color:#fff;}' +
    '.jw-call-error{font-size:12.5px;line-height:1.5;color:#e11d48;max-width:280px;white-space:pre-line;}' +
    '.jw-call-start{background:#10b981;color:#fff;font-size:15px;padding:14px 28px;}' +
    '.jw-bubble-pulse::before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--primary);opacity:.5;animation:jwBubblePulse 2.4s infinite;z-index:-1;}' +
    '.jw-bubble-btn{position:relative;}' +
    '@keyframes jwBubblePulse{0%{transform:scale(1);opacity:.45;}70%{transform:scale(1.6);opacity:0;}100%{transform:scale(1.6);opacity:0;}}' +
    '.jw-cta{margin:10px 12px 0;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:14px;border:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:13.5px;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 6px 18px -6px var(--primary);}' +
    '.jw-cta svg{width:16px;height:16px;}' +
    '.jw-cta:hover{transform:translateY(-1px);}' +
    // ── 🃏 LES CARTES : une info par ligne, jamais un pavé ────────────────────
    '.jw-card{align-self:flex-start;max-width:92%;min-width:190px;border-radius:16px;overflow:hidden;background:' + (isDark ? '#141829' : '#fff') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.09)' : 'rgba(15,23,42,.09)') + ';box-shadow:0 4px 14px -6px rgba(15,23,42,' + (isDark ? '.55' : '.18') + ');}' +
    '.jw-card-head{padding:10px 14px;font-size:12.5px;font-weight:700;line-height:1.3;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));}' +
    '.jw-card-body{padding:4px 0;}' +
    '.jw-card-row{display:flex;gap:9px;align-items:flex-start;padding:8px 14px;font-size:13px;line-height:1.45;color:' + (isDark ? '#e9edf5' : '#1f2937') + ';}' +
    '.jw-card-row + .jw-card-row{border-top:1px dashed ' + (isDark ? 'rgba(255,255,255,.07)' : 'rgba(15,23,42,.07)') + ';}' +
    '.jw-card-dot{flex-shrink:0;width:6px;height:6px;margin-top:6px;border-radius:50%;background:var(--primary);}' +
    '.jw-card-actions{display:flex;flex-wrap:wrap;gap:8px;padding:11px 14px;border-top:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.07)') + ';background:' + (isDark ? 'rgba(255,255,255,.02)' : 'rgba(15,23,42,.02)') + ';}' +
    '.jw-card-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:10px;font-size:12.5px;font-weight:600;text-decoration:none;color:#fff;background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 5px 14px -6px var(--primary);}' +
    '.jw-card-btn:hover{transform:translateY(-1px);}' +
    // ── Mode clair : les petits détails qui font « 0 défaut » ─────────────────
    '.jw-input::placeholder{color:' + (isDark ? '#7b8397' : '#94a3b8') + ';}' +
    '.jw-input:focus{border-color:var(--primary);background:' + (isDark ? '#141829' : '#fff') + ';box-shadow:0 0 0 3px ' + (isDark ? 'rgba(148,163,184,.14)' : 'rgba(99,102,241,.12)') + ';}' +
    '.jw-body::-webkit-scrollbar,.jw-call-lines::-webkit-scrollbar{width:8px;}' +
    '.jw-body::-webkit-scrollbar-thumb,.jw-call-lines::-webkit-scrollbar-thumb{background:' + (isDark ? 'rgba(255,255,255,.14)' : 'rgba(15,23,42,.16)') + ';border-radius:999px;}' +
    '.jw-body::-webkit-scrollbar-track{background:transparent;}' +
    '.jw-msg-bot a{color:inherit;text-decoration:underline;}' +
    '@media (max-width:520px){.jw-chat-window{width:calc(100vw - 28px);height:min(74vh,var(--window-h));max-height:calc(100vh - 150px);}.jw-msg{max-width:88%;}.jw-card{max-width:94%;}}' +
    '@media (max-height:600px){.jw-chat-window{height:calc(100vh - 150px);}}';
  shadow.appendChild(styleEl);

  // --- Suivi prospect (Supabase via /api/track, best-effort, ne bloque jamais l'IA) ---
  function trackProspect(status, extra) {
    try {
      var payload = {
        assistantId: assistantId,
        visitorId: visitorId,
        currentPage: window.location.href,
        userAgent: navigator.userAgent || '',
        language: navigator.language || 'fr'
      };
      if (status) payload.status = status;
      if (extra) {
        for (var k in extra) if (extra.hasOwnProperty(k)) payload[k] = extra[k];
      }
      fetch((apiOrigin || '') + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* silencieux, ne doit jamais casser le widget */ }
  }

  // --- Feedback 👍/👎 sur les réponses de l'IA (nourrit l'apprentissage) ---
  function sendFeedback(rating, botText, questionText) {
    try {
      fetch((apiOrigin || '') + '/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantId,
          rating: rating,
          messageText: botText,
          questionText: questionText || '',
          sessionId: visitorId
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* silencieux */ }
  }
  function loadScript(src, onload) {
    var s = document.createElement('script');
    s.src = src; s.async = true; s.onload = onload;
    document.head.appendChild(s);
  }

  // --- Appel reel a l'IA JawebFlow ---
  function askAssistant(userMessage, onDone) {
      fetch((apiOrigin || '') + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantId,
          sessionId: visitorId,
          message: userMessage,
          website: window.location.origin,
          channel: 'web_widget',
          // Historique court : sans lui, le bot oubliait le contexte de la
          // conversation à chaque message.
          history: messages.slice(-6).map(function (m) {
            return { sender: m.sender === 'user' ? 'user' : 'bot', text: m.text };
          })
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var reply = (data && (data.text || data.message || data.response)) ||
          "Merci pour votre message ! Notre equipe vous recontactera rapidement.";
        onDone(reply);
      })
      .catch(function () {
        onDone("Notre assistant est momentanement indisponible. Merci de reessayer dans un instant ou de laisser vos coordonnees.");
      });
  }

  // ── APPEL VOCAL (agent voix) ─────────────────────────────────────────────
  // Le visiteur appuie sur le micro : le serveur autorise l'appel (forfait,
  // quota, plafond de coût) puis rend un jeton éphémère. Le moteur
  // /cdn/voice.js ouvre alors le direct avec Gemini Live. L'audio passe par le
  // navigateur du visiteur, JAMAIS par nos serveurs : seuls la durée et les
  // tokens consommés remontent, pour que le forfait du marchand reste juste.
  var VOICE_FALLBACK_ERROR = "L'appel vocal n'est pas disponible. Ecrivez-nous dans le chat.";

  function formatTimer(total) {
    var s = Math.max(0, Math.floor(total || 0));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function addCallLine(speaker, text) {
    if (!text) return;
    var last = callLines[callLines.length - 1];
    // La transcription arrive par morceaux : on complete la derniere ligne de
    // la meme personne au lieu d'empiler des bouts de phrase.
    if (last && last.speaker === speaker) last.text = text;
    else callLines.push({ speaker: speaker, text: text });
  }

  function reportCall(info) {
    try {
      fetch((apiOrigin || '') + '/api/voice/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: assistantId,
          sessionId: visitorId,
          seconds: (info && info.seconds) || 0,
          tokensIn: (info && info.tokensIn) || 0,
          tokensOut: (info && info.tokensOut) || 0,
          transcript: (info && info.transcript) || ''
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* silencieux : un releve rate ne casse pas l'appel */ }
  }

  function hangUp() {
    if (callSession && callSession.stop) callSession.stop('client');
    else { callActive = false; callState = ''; callError = ''; render(); }
  }

  function startVoice() {
    if (callActive) return;
    // DANS le clic : on réveille la sortie audio, sinon le navigateur rend
    // l'assistant muet (c'était le « j'écoute rien »).
    unlockAudio();
    if (!voiceTriedFallback) firstCallError = '';
    callActive = true; callState = 'connecting'; callError = '';
    callSpeaker = true;
    callLines = []; callSeconds = 0; callMuted = false; callSession = null;
    voiceSetupDone = false;
    render();

    // ⏱️ TOUT PART EN MÊME TEMPS : le jeton au serveur, le moteur d'appel, la
    // sonnerie et la demande de micro. Avant, on attendait le jeton (1 à 3 s)
    // avant même de faire sonner, puis le moteur, puis le micro : l'appel
    // sonnait 4 secondes et l'assistant ne parlait qu'à la 12e seconde. Ici,
    // tout ce qui peut se faire en parallèle se fait en parallèle.
    var sessionPromise = fetch((apiOrigin || '') + '/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: assistantId, origin: window.location.origin, sessionId: visitorId, fallback: voiceTriedFallback })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (!data || !data.ok || !data.wsUrl) {
          return {
            ok: false,
            blocked: !!(data && data.blocked),
            error: (data && (data.error || data.message)) || VOICE_FALLBACK_ERROR
          };
        }
        return { ok: true, data: data };
      })
      .catch(function () {
        return { ok: false, blocked: false, error: VOICE_FALLBACK_ERROR };
      });

    loadVoiceEngine().then(function (mod) {
      callSession = mod.createVoiceCall({
        greeting: voiceGreeting,
        maxSeconds: (voiceMaxMinutes * 60) || 300,
        onState: function (state) {
          if (state === 'listening' || state === 'speaking') voiceSetupDone = true;
          callState = state; render();
        },
        onTranscript: function (t) { addCallLine(t.speaker, t.text); render(); },
        onNotice: function (n) {
          // Le navigateur a coupé la sortie : on le DIT au visiteur.
          if (n && n.message) { callError = n.message; render(); }
        },
        onToolCall: function (call) {
          // Deux outils : RECHERCHER une information (la base du commerçant
          // n'est plus dans le prompt, elle est interrogée à la question)
          // et NOTER la demande (nom, numéro, rendez-vous).
          var toolName = (call && call.name) || '';
          var toolArgs = (call && call.args) || {};
          if (toolName === 'chercher_information') {
            return fetch((apiOrigin || '') + '/api/voice/knowledge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assistantId: assistantId,
                origin: window.location.origin,
                question: toolArgs.question || '',
              }),
            })
              .then(function (r) { return r.json().catch(function () { return null; }); })
              .then(function (data) {
                // `result` = les lignes trouvées (vide = il ne sait pas) :
                // c'est CE texte que l'agent a le droit de dire au client.
                return { result: (data && data.text) || '', found: !!(data && data.found) };
              })
              .catch(function () { return { result: '', found: false }; });
          }
          // 🎯 Sans réponse, Gemini attendrait — et l'appel deviendrait muet.
          return fetch((apiOrigin || '') + '/api/voice/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assistantId: assistantId,
              origin: window.location.origin,
              sessionId: visitorId,
              args: toolArgs,
            }),
          })
            .then(function (r) { return r.json().catch(function () { return null; }); })
            .catch(function () { return null; });
        },
        onError: function (e) {
          var msg = (e && e.message) || VOICE_FALLBACK_ERROR;
          if (!firstCallError) firstCallError = msg;
          callError = msg;
          callState = 'error';
          render();
        },
        onEnd: function (info) {
          callSession = null;
          if (callTimerId) { clearInterval(callTimerId); callTimerId = null; }
          // Les DEUX essais ont echoue : la raison du premier est la plus
          // utile (la seconde n'est souvent que la consequence).
          if (callError && firstCallError && firstCallError !== callError) {
            callError = firstCallError + '\n' + callError;
          }
          // Jamais demarre : une seconde chance, autre version d'API — SAUF si
          // le serveur a refuse (forfait, quota, voix coupee...) : la, insister
          // ne sert a rien, on affiche la raison.
          if (info && !info.setupDone && !voiceSetupDone && !voiceTriedFallback && info.reason !== 'no-session') {
            voiceTriedFallback = true;
            callActive = false; callState = ''; callError = '';
            startVoice();
            return;
          }
          callActive = false;
          // La raison reste A L'ECRAN : elle ne doit pas etre effacee par le
          // retour a l'ecran d'appel (c'etait un raccrochage muet).
          callState = callError ? 'error' : '';
          reportCall(info);
          render();
        }
      });
      // 🔔 La sonnerie demarre MAINTENANT (et le micro est demande tout de
      // suite) : le visiteur n'attend pas le serveur en silence.
      callSession.start();
      if (callTimerId) clearInterval(callTimerId);
      callTimerId = setInterval(function () {
        callSeconds = callSession && callSession.getSeconds ? callSession.getSeconds() : callSeconds + 1;
        var timerEl = shadow.querySelector('.jw-call-timer');
        if (timerEl) timerEl.textContent = formatTimer(callSeconds);
      }, 1000);
      return sessionPromise.then(function (result) {
        if (!callSession) return;
        if (!result.ok) {
          // Refus du serveur : on n'insiste pas ; simple pepin reseau : la
          // seconde chance (repli d'API) est laissee au onEnd ci-dessus.
          if (result.blocked) voiceTriedFallback = true;
          callError = result.error;
          callState = 'error';
          render();
          callSession.stop('no-session');
          return;
        }
        callSession.connect({
          wsUrl: result.data.wsUrl,
          setup: result.data.setup,
          greeting: result.data.greeting || voiceGreeting,
          maxSeconds: result.data.maxSeconds || (voiceMaxMinutes * 60) || 300
        });
      });
    });
  }

  function buildCallPanel() {
    var overlay = document.createElement('div');
    overlay.className = 'jw-call';
    overlay.setAttribute('data-jw-call', '1');
    overlay.style.cssText = 'position:absolute;inset:0;z-index:9;background:' + (isDark ? '#0c0f1d' : '#fff') + ';color:' + (isDark ? '#f1f5f9' : '#0f172a') + ';';

    var avatar = document.createElement('div');
    avatar.className = 'jw-call-avatar' + (callState === 'listening' || callState === 'speaking' ? ' jw-call-live' : '');
    if (avatarUrl) avatar.innerHTML = '<img src="' + avatarUrl + '" alt="" referrerpolicy="no-referrer">';
    else avatar.innerHTML = icon24('mic', 38);
    overlay.appendChild(avatar);

    var title = document.createElement('div');
    title.className = 'jw-call-title';
    title.textContent = businessName;
    overlay.appendChild(title);

    if (callState === 'error') {
      var err = document.createElement('div');
      err.className = 'jw-call-error';
      err.textContent = callError || VOICE_FALLBACK_ERROR;
      overlay.appendChild(err);
    } else {
      var status = document.createElement('div');
      status.className = 'jw-call-status';
      status.textContent = !callActive ? 'Appuyez : l\u2019assistant decroche tout de suite.'
        : callState === 'connecting' ? 'Connexion a l\u2019appel...'
        : callState === 'speaking' ? 'Il vous repond...'
        : callState === 'listening' ? 'Je vous ecoute : parlez normalement.'
        : 'Appel en cours';
      overlay.appendChild(status);

      if (callActive) {
        var timer = document.createElement('div');
        timer.className = 'jw-call-timer';
        timer.textContent = formatTimer(callSeconds);
        overlay.appendChild(timer);
      }
    }

    if (callLines.length) {
      var lines = document.createElement('div');
      lines.className = 'jw-call-lines';
      callLines.slice(-6).forEach(function (line) {
        var el = document.createElement('div');
        el.className = 'jw-call-line';
        el.textContent = (line.speaker === 'user' ? 'Vous : ' : businessName + ' : ') + line.text;
        lines.appendChild(el);
      });
      overlay.appendChild(lines);
    }

    var actions = document.createElement('div');
    actions.className = 'jw-call-actions';
    if (!callActive && callState !== 'error') {
      // Avant l'appel : un seul bouton, gros et évident.
      var pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'jw-call-btn jw-call-start';
      pick.innerHTML = icon24('mic', 16) + '<span>' + callCtaText + '</span>';
      pick.onclick = function () { startVoice(); };
      actions.appendChild(pick);

      if (widgetMode !== 'voice') {
        var writeInstead = document.createElement('button');
        writeInstead.type = 'button';
        writeInstead.className = 'jw-call-btn jw-call-mute';
        writeInstead.textContent = 'Ecrire a la place';
        writeInstead.onclick = function () { isOpen = false; render(); };
        actions.appendChild(writeInstead);
      }
    } else if (callState === 'error') {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'jw-call-btn jw-call-hang';
      retry.innerHTML = icon24('mic', 16) + '<span>Reessayer</span>';
      retry.onclick = function () { callState = ''; callActive = false; callError = ''; startVoice(); };
      actions.appendChild(retry);

      var write = document.createElement('button');
      write.type = 'button';
      write.className = 'jw-call-btn jw-call-mute';
      write.textContent = 'Ecrire a la place';
      write.onclick = function () { callState = ''; callError = ''; callActive = false; render(); };
      actions.appendChild(write);
    } else {
      var speaker = document.createElement('button');
      speaker.type = 'button';
      speaker.className = 'jw-call-btn jw-call-mute';
      speaker.textContent = callSpeaker ? 'Son actif' : 'Son coupe';
      speaker.onclick = function () {
        callSpeaker = !callSpeaker;
        if (callSession && callSession.setSpeaker) callSpeaker = callSession.setSpeaker(callSpeaker);
        if (callSpeaker) unlockAudio();
        render();
      };
      actions.appendChild(speaker);

      var mute = document.createElement('button');
      mute.type = 'button';
      mute.className = 'jw-call-btn jw-call-mute';
      mute.textContent = callMuted ? 'Reactiver le micro' : 'Couper le micro';
      mute.onclick = function () {
        if (callSession && callSession.setMuted) { callMuted = callSession.setMuted(!callMuted); render(); }
      };
      actions.appendChild(mute);

      var hang = document.createElement('button');
      hang.type = 'button';
      hang.className = 'jw-call-btn jw-call-hang';
      hang.innerHTML = icon24('hangup', 16) + '<span>Raccrocher</span>';
      hang.onclick = hangUp;
      actions.appendChild(hang);
    }
    overlay.appendChild(actions);
    return overlay;
  }

  // --- Rendu ---
  /** Le CSS du marchand : injecté dans le shadow DOM, donc scoped au widget. */
  function applyCustomCss() {
    if (!customCss) return;
    var el = shadow.querySelector('#jawebflow-custom-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'jawebflow-custom-css';
      shadow.appendChild(el);
    }
    el.textContent = String(customCss).slice(0, 4000);
  }

  /**
   * Attire l'attention : accroche retardée puis ouverture automatique, avec le
   * message du bot s'il en a écrit un. Un seul armement (le marchand peut
   * recharger sa config, on ne double pas les minuteurs).
   */
  function armAttentionTimers() {
    if (attentionArmed) return;
    attentionArmed = true;
    if (teaserDelaySeconds > 0) {
      setTimeout(function () {
        if (isOpen) return;
        teaserVisible = true;
        render();
      }, Math.min(120, teaserDelaySeconds) * 1000);
    }
    if (autoOpenSeconds > 0 && widgetMode !== 'voice') {
      setTimeout(function () {
        if (isOpen || callActive) return;
        isOpen = true;
        if (proactiveText) messages.push({ sender: 'bot', text: proactiveText });
        trackProspect('opened_bubble');
        render();
      }, Math.min(120, autoOpenSeconds) * 1000);
    }
  }

  // ── 🃏 LES CARTES ──────────────────────────────────────────────────────────
  // L'assistant écrit du markdown simple (un titre en gras + des puces) : c'est
  // ICI qu'on décide de l'affichage. Aucune demande de JSON au modèle (il se
  // trompe), et si la réponse ne ressemble à rien, on affiche du texte normal.
  var CARD_LINK = /\[([^\]]{1,60})\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  var CARD_BULLET = /^\s*(?:[-*•·‣]|\d+[.)])\s+(.*)$/;
  var CARD_TITLE = /^\s*(?:\*\*(.+?)\*\*|__(.+?)__|#{1,4}\s*(.+?))\s*[:：]?\s*$/;

  function cardClean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function extractCardLinks(line) {
    var actions = [];
    var text = String(line).replace(CARD_LINK, function (all, label, href) {
      actions.push({ label: cardClean(label), href: String(href).trim() });
      return cardClean(label);
    });
    return { text: text, actions: actions };
  }

  function cardTitle(line) {
    var m = CARD_TITLE.exec(line);
    if (!m) return '';
    return cardClean(m[1] || m[2] || m[3] || '');
  }

  // Une ligne de titre APRÈS des puces ouvre une nouvelle carte.
  function splitCardSections(section) {
    var lines = String(section).split('\n');
    var out = [];
    var current = [];
    var seenBullet = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var isBullet = CARD_BULLET.test(line);
      if (seenBullet && !isBullet && cardTitle(line)) {
        if (current.length) out.push(current.join('\n'));
        current = [];
        seenBullet = false;
      }
      if (isBullet) seenBullet = true;
      current.push(line);
    }
    if (current.length) out.push(current.join('\n'));
    return out.map(function (chunk) { return chunk.trim(); }).filter(function (chunk) { return !!chunk; });
  }

  function parseBlocks(raw) {
    var source = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').trim();
    if (!source) return [];
    var sections = [];
    source.split(/\n{2,}/).forEach(function (part) {
      splitCardSections(part).forEach(function (chunk) { sections.push(chunk); });
    });

    var blocks = [];
    sections.forEach(function (section) {
      var lines = section.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim(); });
      if (!lines.length) return;
      var actions = [];
      var bullets = [];
      var texts = [];
      var title = '';

      lines.forEach(function (line) {
        var bullet = CARD_BULLET.exec(line);
        var found = extractCardLinks(bullet ? bullet[1] : line);
        actions = actions.concat(found.actions);
        var content = cardClean(found.text);
        if (!content) return;
        if (bullet) { bullets.push(content); return; }
        if (!bullets.length && !title) {
          var asTitle = cardTitle(line) || (content.length <= 48 ? content : '');
          if (asTitle) { title = asTitle; return; }
        }
        texts.push(content);
      });

      if (bullets.length >= 2 || (bullets.length === 1 && title)) {
        if (texts.length) blocks.push({ kind: 'text', text: texts.join(' ') });
        blocks.push({ kind: 'card', title: title, items: bullets.slice(0, 6), actions: actions });
        return;
      }
      var remaining = texts.concat(bullets);
      if (remaining.length) {
        var block = { kind: 'text', text: remaining.join('\n') };
        if (actions.length) block.actions = actions;
        blocks.push(block);
      } else if (actions.length) {
        blocks.push({ kind: 'card', title: title, items: [], actions: actions });
      } else if (title) {
        blocks.push({ kind: 'text', text: title });
      }
    });
    return blocks;
  }

  function hasCards(blocks) {
    return blocks.some(function (b) {
      return b.kind === 'card' && (b.items.length > 0 || b.actions.length > 0);
    });
  }

  /** Une carte : titre coloré, une info par ligne, boutons en bas. */
  function buildCardEl(card) {
    var el = document.createElement('div');
    el.className = 'jw-card';
    if (card.title) {
      var head = document.createElement('div');
      head.className = 'jw-card-head';
      head.textContent = card.title;
      el.appendChild(head);
    }
    if (card.items.length) {
      var body = document.createElement('div');
      body.className = 'jw-card-body';
      card.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'jw-card-row';
        var dot = document.createElement('span');
        dot.className = 'jw-card-dot';
        row.appendChild(dot);
        var text = document.createElement('span');
        text.textContent = item;
        row.appendChild(text);
        body.appendChild(row);
      });
      el.appendChild(body);
    }
    if (card.actions && card.actions.length) {
      var actions = document.createElement('div');
      actions.className = 'jw-card-actions';
      card.actions.forEach(function (action) {
        var link = document.createElement('a');
        link.className = 'jw-card-btn';
        link.href = action.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = action.label;
        actions.appendChild(link);
      });
      el.appendChild(actions);
    }
    return el;
  }

  /** Ajoute un message de l'assistant : cartes si possible, texte sinon. */
  function appendBotMessage(container, text) {
    var blocks = parseBlocks(text);
    if (!hasCards(blocks)) {
      var plain = document.createElement('div');
      plain.className = 'jw-msg jw-msg-bot';
      plain.textContent = text;
      container.appendChild(plain);
      return;
    }
    blocks.forEach(function (block) {
      if (block.kind === 'card') {
        container.appendChild(buildCardEl(block));
        if (block.actions && block.actions.length) return;
        return;
      }
      var el = document.createElement('div');
      el.className = 'jw-msg jw-msg-bot';
      el.textContent = block.text;
      container.appendChild(el);
    });
  }

  function render() {
    wrapper.innerHTML = '';

    if (!isOpen && teaserText && teaserVisible) {
      var teaser = document.createElement('div');
      teaser.className = 'jw-teaser';
      var teaserSpan = document.createElement('span');
      teaserSpan.textContent = teaserText;
      teaser.appendChild(teaserSpan);
      var teaserClose = document.createElement('span');
      teaserClose.className = 'jw-teaser-close';
      teaserClose.textContent = '\u2715';
      teaserClose.onclick = function (ev) { ev.stopPropagation(); teaserText = ''; render(); };
      teaser.appendChild(teaserClose);
      teaser.onclick = function (ev) {
        if (ev.target === teaserClose) return;
        isOpen = true;
        trackProspect('opened_bubble');
        render();
        // Mode « le bot qui appelle » : l'accroche lance l'appel directement.
        if (widgetMode === 'voice' && !callActive) startVoice();
      };
      wrapper.appendChild(teaser);
    }

    if (isOpen) {
      var win = document.createElement('div');
      win.className = 'jw-chat-window';

      var header = document.createElement('div');
      header.className = 'jw-header';
      var headerInfo = document.createElement('div');
      headerInfo.className = 'jw-header-info';
      var avatar = document.createElement('div');
      avatar.className = 'jw-header-avatar';
      if (avatarUrl) {
        var img = document.createElement('img');
        img.src = avatarUrl; img.referrerPolicy = 'no-referrer';
        avatar.appendChild(img);
      } else {
        avatar.innerHTML = icon24(icon, 20);
      }
      headerInfo.appendChild(avatar);
      var meta = document.createElement('div');
      var title = document.createElement('div');
      title.className = 'jw-header-title';
      var titleText = document.createElement('span');
      titleText.textContent = headerTitle || businessName;
      title.appendChild(titleText);
      if (onlineBadge) {
        var dot = document.createElement('span');
        dot.className = 'jw-header-status-dot';
        title.appendChild(dot);
      }
      meta.appendChild(title);
      var subtitle = document.createElement('div');
      subtitle.className = 'jw-header-subtitle';
      subtitle.textContent = headerSubtitle || 'En ligne \u00b7 R\u00e9ponse IA imm\u00e9diate';
      meta.appendChild(subtitle);
      headerInfo.appendChild(meta);
      header.appendChild(headerInfo);
      if (voiceEnabled && widgetMode !== 'chat') {
        var micBtn = document.createElement('button');
        micBtn.type = 'button';
        micBtn.className = 'jw-header-mic';
        micBtn.setAttribute('aria-label', 'Appeler : parler a voix haute');
        micBtn.innerHTML = icon24('mic', 14);
        micBtn.onclick = function () { if (!callActive) startVoice(); };
        header.appendChild(micBtn);
      }
      var closeBtn = document.createElement('button');
      closeBtn.className = 'jw-header-close';
      closeBtn.innerHTML = icon24('close', 14);
      closeBtn.onclick = function () { isOpen = false; render(); };
      header.appendChild(closeBtn);
      win.appendChild(header);

      var body = document.createElement('div');
      body.className = 'jw-body';
      messages.forEach(function (m, i) {
        if (m.sender === 'bot') {
          appendBotMessage(body, m.text);
        } else {
          var msg = document.createElement('div');
          msg.className = 'jw-msg jw-msg-user';
          msg.textContent = m.text;
          body.appendChild(msg);
        }

        // Boutons 👍/👎 sous chaque réponse de l'IA (pas le message d'accueil).
        if (m.sender === 'bot' && i > 0) {
          var prevUser = '';
          for (var j = i - 1; j >= 0; j--) {
            if (messages[j].sender === 'user') { prevUser = messages[j].text; break; }
          }
          var fbRow = document.createElement('div');
          fbRow.className = 'jw-feedback';
          [['👍', 'up'], ['👎', 'down']].forEach(function (pair) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = pair[0];
            b.setAttribute('aria-label', pair[1] === 'up' ? 'Bonne réponse' : 'Mauvaise réponse');
            b.onclick = function () {
              if (fbRow.dataset.done) return;
              fbRow.dataset.done = '1';
              b.className = 'jw-fb-on';
              sendFeedback(pair[1], m.text, prevUser);
            };
            fbRow.appendChild(b);
          });
          body.appendChild(fbRow);
        }
      });
      if (isTyping) {
        var typingMsg = document.createElement('div');
        typingMsg.className = 'jw-msg jw-msg-bot';
        var typing = document.createElement('div');
        typing.className = 'jw-typing';
        typing.appendChild(document.createElement('span'));
        typing.appendChild(document.createElement('span'));
        typing.appendChild(document.createElement('span'));
        typingMsg.appendChild(typing);
        body.appendChild(typingMsg);
      }
      win.appendChild(body);

      if (whatsappNumber) {
        var wa = document.createElement('a');
        wa.className = 'jw-whatsapp-btn';
        wa.href = 'https://wa.me/' + whatsappNumber.replace(/[^0-9]/g, '');
        wa.target = '_blank'; wa.rel = 'noopener noreferrer';
        wa.innerHTML = whatsappIconSvg + ' Direct WhatsApp';
        body.appendChild(wa);
      }

      if (voiceEnabled && widgetMode !== 'chat' && !callActive) {
        var cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'jw-cta';
        cta.innerHTML = icon24('mic', 16) + '<span>' + callCtaText + '</span>';
        cta.onclick = function () { startVoice(); };
        win.appendChild(cta);
      }

      var form = document.createElement('form');
      form.className = 'jw-input-bar';
      var inputWrap = document.createElement('div');
      inputWrap.className = 'jw-input-wrapper';
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'jw-input'; input.placeholder = 'Posez une question...';
      inputWrap.appendChild(input);
      form.appendChild(inputWrap);
      var sendBtn = document.createElement('button');
      sendBtn.type = 'submit'; sendBtn.className = 'jw-send-btn';
      sendBtn.innerHTML = sendIconSvg;
      form.appendChild(sendBtn);

      form.onsubmit = function (ev) {
        ev.preventDefault();
        var text = input.value.trim();
        if (!text || isTyping) return;

        messages.push({ sender: 'user', text: text });

        var emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i);
        var phoneMatch = text.match(/(?:(?:\+|00)213|[0])(?:5|6|7)[0-9]{8}/);
        var nameMatch = text.match(/(?:je m'appelle|mon nom est|c'est|appellez-moi|je suis)\s+([a-zA-Z\u00C0-\u00FF\s-]+)/i);
        var status = (emailMatch || phoneMatch) ? 'qualifie' : 'nouveau';

        trackProspect(status, {
          email: emailMatch ? emailMatch[0] : undefined,
          phone: phoneMatch ? phoneMatch[0] : undefined,
          name: nameMatch ? nameMatch[1].trim() : undefined,
          need: text,
          status: status,
          messages: [{ sender: 'user', text: text, timestamp: new Date().toISOString() }]
        });

        input.value = '';
        isTyping = true;
        sendBtn.disabled = true;
        render();

        askAssistant(text, function (reply) {
          messages.push({ sender: 'bot', text: reply });
          isTyping = false;
          trackProspect(status, { messages: [{ sender: 'bot', text: reply, timestamp: new Date().toISOString() }] });
          render();
        });
      };
      win.appendChild(form);

      if (brandingEnabled) {
        var branding = document.createElement('a');
        branding.className = 'jw-branding';
        branding.href = 'https://jawebflow.com';
        branding.textContent = 'Developpe par JawebFlow';
        branding.target = '_blank';
        win.appendChild(branding);
      }

      if (callActive || callState === 'error' || (widgetMode === 'voice' && isOpen)) {
        win.style.position = 'relative';
        win.appendChild(buildCallPanel());
      }

      wrapper.appendChild(win);
      setTimeout(function () { body.scrollTop = body.scrollHeight; }, 15);
    }

    var bubble = document.createElement('button');
    bubble.className = 'jw-bubble-btn' + (pulse && !isOpen ? ' jw-bubble-pulse' : '');
    bubble.setAttribute('aria-label', widgetMode === 'voice' ? 'Appeler' : 'Ouvrir le chat');
    if (isOpen) {
      bubble.innerHTML = icon24('arrowdown', 24);
    } else if (avatarUrl) {
      var bubbleImg = document.createElement('img');
      bubbleImg.style.width = '100%'; bubbleImg.style.height = '100%';
      bubbleImg.style.borderRadius = '50%'; bubbleImg.style.objectFit = 'cover';
      bubbleImg.src = avatarUrl; bubbleImg.referrerPolicy = 'no-referrer';
      bubble.appendChild(bubbleImg);
    } else {
      bubble.innerHTML = icon24(widgetMode === 'voice' ? 'mic' : icon, 24);
    }
    bubble.onclick = function () {
      if (widgetMode === 'voice') {
        isOpen = true;
        trackProspect('opened_bubble');
        render();
        if (!callActive) startVoice();
        return;
      }
      isOpen = !isOpen;
      if (isOpen) trackProspect('opened_bubble');
      render();
    };
    wrapper.appendChild(bubble);
  }

  render();

  // --- Config distante (branding, couleurs...) : Supabase via /api/widget-config ---
  fetch((apiOrigin || '') + '/api/widget-config?id=' + encodeURIComponent(assistantId))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      if (d.brandingEnabled === false) brandingEnabled = false;
      if (d.businessName) businessName = d.businessName;
      if (d.whatsappEscalation) whatsappNumber = d.whatsappEscalation;
      var c = d.widgetConfig || {};
      if (c.primaryColor) primaryColor = namedColors[String(c.primaryColor).toLowerCase()] || c.primaryColor;
      if (c.gradientSecondary) secondaryColor = namedColors[String(c.gradientSecondary).toLowerCase()] || c.gradientSecondary;
      if (c.themeMode) { theme = c.themeMode; isDark = theme === 'dark'; }
      if (c.position) { position = c.position; isLeft = position === 'bottom-left'; }
      if (c.shape) shape = c.shape;
      if (c.showTeaser === false) teaserText = '';
      else if (c.teaserText) teaserText = c.teaserText;
      if (c.welcomeMessage) messages[0] = { sender: 'bot', text: c.welcomeMessage };
      if (c.headerTitle) headerTitle = c.headerTitle;
      if (c.headerSubtitle) headerSubtitle = c.headerSubtitle;
      if (typeof c.onlineBadge === 'boolean') onlineBadge = c.onlineBadge;
      if (typeof c.showBranding === 'boolean') brandingEnabled = c.showBranding !== false;
      if (c.size) size = c.size;
      if (c.iconType) icon = c.iconType;
      else if (c.icon) icon = c.icon;
      if (c.mode) widgetMode = String(c.mode);
      if (c.attention && typeof c.attention === 'object') {
        if (typeof c.attention.pulse === 'boolean') pulse = c.attention.pulse;
        if (c.attention.teaserDelaySeconds) teaserDelaySeconds = Number(c.attention.teaserDelaySeconds) || 0;
        if (c.attention.autoOpenSeconds) autoOpenSeconds = Number(c.attention.autoOpenSeconds) || 0;
        if (c.attention.proactiveText) proactiveText = String(c.attention.proactiveText);
        if (c.attention.callCtaText) callCtaText = String(c.attention.callCtaText);
      }
      if (typeof c.customCss === 'string') { customCss = c.customCss; applyCustomCss(); }
      if (c.voice && typeof c.voice === 'object') {
        if (c.voice.enabled === true) voiceEnabled = true;
        if (c.voice.greeting) voiceGreeting = String(c.voice.greeting);
        if (c.voice.maxMinutes) voiceMaxMinutes = Number(c.voice.maxMinutes) || voiceMaxMinutes;
      }
      // L'appel est disponible : on charge le moteur TOUT DE SUITE. C'est ce qui
      // permet de réveiller la sortie audio dans le clic du visiteur — sans ça,
      // le premier appel peut rester muet (le temps que le moteur arrive).
      if (voiceEnabled && widgetMode !== 'chat') loadVoiceEngine();
      var s = shadow.querySelector('#jawebflow-widget-styles') || styleEl;
      s.textContent = s.textContent
        .replace(/--primary:\s*[^;]+/g, '--primary: ' + primaryColor)
        .replace(/--secondary:\s*[^;]+/g, '--secondary: ' + secondaryColor)
        .replace(/--radius-shape:\s*[^;]+/g, '--radius-shape: ' + shapeRadius(shape))
        .replace(/--bubble-size:\s*[^;]+/g, '--bubble-size: ' + bubbleDims(size).size + 'px')
        .replace(/--bubble-icon:\s*[^;]+/g, '--bubble-icon: ' + bubbleDims(size).icon + 'px');
      render();
    })
    .catch(function (e) { console.warn('JawebFlow sync error:', e); })
    .finally(function () { armAttentionTimers(); trackProspect('visited'); });
})();
