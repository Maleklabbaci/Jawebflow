(function () {
  if (window.__JAWEBFLOW_WIDGET_LOADED__) return;
  window.__JAWEBFLOW_WIDGET_LOADED__ = true;

  // --- Config depuis la balise <script> ---
  var scripts = document.querySelectorAll('script[data-assistant-id]');
  var scriptEl = scripts[scripts.length - 1] || document.currentScript;

  var assistantId = (scriptEl && scriptEl.getAttribute('data-assistant-id')) || 'asst_live';
  var businessName = (scriptEl && scriptEl.getAttribute('data-business-name')) || 'Assistant IA';
  var primaryColor = (scriptEl && scriptEl.getAttribute('data-primary-color')) || '#9333ea';
  var secondaryColor = (scriptEl && scriptEl.getAttribute('data-secondary-color')) || '#6366f1';
  var position = (scriptEl && scriptEl.getAttribute('data-position')) || 'bottom-right';
  var theme = (scriptEl && scriptEl.getAttribute('data-theme')) || 'dark';
  var shape = (scriptEl && scriptEl.getAttribute('data-shape')) || 'circle';
  var icon = (scriptEl && scriptEl.getAttribute('data-icon')) || 'sparkles';
  var teaserText = (scriptEl && scriptEl.getAttribute('data-teaser')) || 'Une question ? Discutons en direct \uD83D\uDC4B';
  var welcomeMessage = (scriptEl && scriptEl.getAttribute('data-welcome')) || ("Bonjour ! \uD83D\uDC4B Comment puis-je vous aider aujourd'hui ?");
  var whatsappNumber = (scriptEl && scriptEl.getAttribute('data-whatsapp')) || '';
  var avatarUrl = (scriptEl && scriptEl.getAttribute('data-avatar-url')) || '';
  var brandingEnabled = true;

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

  var styleEl = document.createElement('style');
  styleEl.id = 'jawebflow-widget-styles';
  styleEl.textContent =
    ':host{--primary:' + primaryColor + ';--secondary:' + secondaryColor + ';--radius-shape:' + (shape === 'squircle' ? '16px' : '50%') + ';--window-radius:20px;--font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}' +
    '#jw-widget-wrapper{position:fixed;bottom:24px;' + (isLeft ? 'left:24px;' : 'right:24px;') + 'z-index:2147483647;font-family:var(--font-family);display:flex;flex-direction:column;align-items:' + (isLeft ? 'flex-start' : 'flex-end') + ';pointer-events:none;}' +
    '#jw-widget-wrapper *{box-sizing:border-box;pointer-events:auto;}' +
    '.jw-bubble-btn{width:60px;height:60px;border-radius:var(--radius-shape);background:linear-gradient(135deg,var(--primary),var(--secondary));box-shadow:0 8px 24px -4px var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;border:none;outline:none;transition:transform .2s cubic-bezier(.16,1,.3,1),box-shadow .2s;padding:0;overflow:hidden;}' +
    '.jw-bubble-btn:hover{transform:scale(1.06);}' +
    '.jw-bubble-btn svg{width:26px;height:26px;}' +
    '.jw-teaser{margin-bottom:12px;padding:10px 16px;border-radius:16px;font-size:13px;font-weight:500;background:' + (isDark ? '#111524' : '#fff') + ';color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)') + ';box-shadow:0 8px 24px -4px rgba(0,0,0,.15);cursor:pointer;display:flex;align-items:center;gap:10px;max-width:320px;}' +
    '.jw-teaser-close{opacity:.5;font-size:11px;padding:2px 4px;cursor:pointer;margin-left:auto;}' +
    '.jw-chat-window{width:380px;max-width:calc(100vw - 48px);height:540px;max-height:80vh;border-radius:var(--window-radius);overflow:hidden;display:flex;flex-direction:column;margin-bottom:16px;box-shadow:0 16px 40px -10px rgba(0,0,0,' + (isDark ? '.6' : '.18') + ');background:' + (isDark ? '#0c0f1d' : '#fff') + ';color:' + (isDark ? '#f1f5f9' : '#0f172a') + ';border:1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)') + ';}' +
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
    '.jw-branding{text-align:center;font-size:10px;opacity:.5;padding:8px;text-decoration:none;color:inherit;display:block;}';
  shadow.appendChild(styleEl);

  // --- Suivi prospect (Firestore, best-effort, ne bloque jamais l'IA) ---
  var firestoreDb;
  var firebaseConfig = {
    projectId: 'gen-lang-client-0772569610',
    appId: '1:637772471412:web:496cc86493ac5970d48521',
    apiKey: 'AIzaSyBvweAHBrF8IyHkE1yEOHpwglzLR0kLszk',
    authDomain: 'gen-lang-client-0772569610.firebaseapp.com',
    firestoreDatabaseId: 'ai-studio-jawebflow-3b5eca8a-3aea-4c7a-8009-6f854b13701c',
    storageBucket: 'gen-lang-client-0772569610.firebasestorage.app',
    messagingSenderId: '637772471412'
  };
  function trackProspect(status, extra) {
    if (!window.firebase) return;
    try {
      if (!firestoreDb) firestoreDb = firebase.app().firestore(firebaseConfig.firestoreDatabaseId || undefined);
      var docId = assistantId + '_' + visitorId;
      var ref = firestoreDb.collection('prospects').doc(docId);
      var payload = {
        id: docId, assistantId: assistantId, visitorId: visitorId,
        currentPage: window.location.href, language: navigator.language || 'fr',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (status) payload.status = status;
      if (extra) {
        for (var k in extra) if (extra.hasOwnProperty(k) && k !== 'messages') payload[k] = extra[k];
      }
      if (extra && extra.messages) payload.messages = firebase.firestore.FieldValue.arrayUnion.apply(null, extra.messages);
      ref.set(payload, { merge: true }).catch(function () {});
    } catch (e) { /* silencieux, ne doit jamais casser le widget */ }
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
        channel: 'web_widget'
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

  // --- Rendu ---
  function render() {
    wrapper.innerHTML = '';

    if (!isOpen && teaserText) {
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
      teaser.onclick = function (ev) { if (ev.target !== teaserClose) { isOpen = true; trackProspect('opened_bubble'); render(); } };
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
      titleText.textContent = businessName;
      title.appendChild(titleText);
      var dot = document.createElement('span');
      dot.className = 'jw-header-status-dot';
      title.appendChild(dot);
      meta.appendChild(title);
      var subtitle = document.createElement('div');
      subtitle.className = 'jw-header-subtitle';
      subtitle.textContent = 'En ligne \u00b7 Reponse IA immediate';
      meta.appendChild(subtitle);
      headerInfo.appendChild(meta);
      header.appendChild(headerInfo);
      var closeBtn = document.createElement('button');
      closeBtn.className = 'jw-header-close';
      closeBtn.innerHTML = icon24('close', 14);
      closeBtn.onclick = function () { isOpen = false; render(); };
      header.appendChild(closeBtn);
      win.appendChild(header);

      var body = document.createElement('div');
      body.className = 'jw-body';
      messages.forEach(function (m) {
        var msg = document.createElement('div');
        msg.className = 'jw-msg ' + (m.sender === 'user' ? 'jw-msg-user' : 'jw-msg-bot');
        msg.textContent = m.text;
        body.appendChild(msg);
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

      wrapper.appendChild(win);
      setTimeout(function () { body.scrollTop = body.scrollHeight; }, 15);
    }

    var bubble = document.createElement('button');
    bubble.className = 'jw-bubble-btn';
    bubble.setAttribute('aria-label', 'Ouvrir le chat');
    if (isOpen) {
      bubble.innerHTML = icon24('arrowdown', 24);
    } else if (avatarUrl) {
      var bubbleImg = document.createElement('img');
      bubbleImg.style.width = '100%'; bubbleImg.style.height = '100%';
      bubbleImg.style.borderRadius = '50%'; bubbleImg.style.objectFit = 'cover';
      bubbleImg.src = avatarUrl; bubbleImg.referrerPolicy = 'no-referrer';
      bubble.appendChild(bubbleImg);
    } else {
      bubble.innerHTML = icon24(icon, 24);
    }
    bubble.onclick = function () { isOpen = !isOpen; if (isOpen) trackProspect('opened_bubble'); render(); };
    wrapper.appendChild(bubble);
  }

  render();

  // --- Config distante (branding, couleurs, base de connaissances liee a l'assistant) ---
  loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js', function () {
    loadScript('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js', function () {
      if (!window.firebase) return;
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      firestoreDb = firebase.app().firestore(firebaseConfig.firestoreDatabaseId || undefined);
      firestoreDb.collection('assistants').doc(assistantId).get().then(function (snap) {
        if (snap.exists) {
          var d = snap.data();
          if (d.brandingEnabled === false) brandingEnabled = false;
          if (d.businessName) businessName = d.businessName;
          if (d.whatsappEscalation) whatsappNumber = d.whatsappEscalation;
          if (d.widgetConfig) {
            var c = d.widgetConfig;
            if (c.primaryColor) primaryColor = namedColors[c.primaryColor.toLowerCase()] || c.primaryColor;
            if (c.gradientSecondary) secondaryColor = namedColors[c.gradientSecondary.toLowerCase()] || c.gradientSecondary;
            if (c.themeMode) { theme = c.themeMode; isDark = theme === 'dark'; }
            if (c.position) { position = c.position; isLeft = position === 'bottom-left'; }
            if (c.shape) shape = c.shape;
            if (c.teaserText) teaserText = c.teaserText;
            if (c.welcomeMessage) messages[0] = { sender: 'bot', text: c.welcomeMessage };
            if (c.headerTitle) businessName = c.headerTitle;
            if (c.icon) icon = c.icon;
          }
          var s = shadow.querySelector('#jawebflow-widget-styles') || styleEl;
          s.textContent = s.textContent
            .replace(/--primary:\s*[^;]+/g, '--primary: ' + primaryColor)
            .replace(/--secondary:\s*[^;]+/g, '--secondary: ' + secondaryColor)
            .replace(/--radius-shape:\s*[^;]+/g, '--radius-shape: ' + (shape === 'squircle' ? '16px' : '50%'));
          render();
        }
      }).catch(function (e) { console.warn('JawebFlow sync error:', e); })
        .finally(function () { trackProspect('visited'); });
    });
  });
})();
