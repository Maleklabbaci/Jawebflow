/**
 * JawebFlow AI Live Chat Widget - Standalone Universal Embed Script
 * Automatically binds to <script data-assistant-id="..." ...>
 */
(function () {
  if (window.__JAWEBFLOW_WIDGET_LOADED__) return;
  window.__JAWEBFLOW_WIDGET_LOADED__ = true;

  function initWidget() {
    // Find current script tag
    var scripts = document.querySelectorAll('script[data-assistant-id]');
    var currentScript = scripts[scripts.length - 1] || document.currentScript;
    
    var assistantId = currentScript ? currentScript.getAttribute('data-assistant-id') : 'asst_live';
    var businessName = (currentScript && currentScript.getAttribute('data-business-name')) || 'Assistant IA';
    var primaryColor = (currentScript && currentScript.getAttribute('data-primary-color')) || '#9333ea';
    var gradientSecondary = (currentScript && currentScript.getAttribute('data-secondary-color')) || '#6366f1';
    var position = (currentScript && currentScript.getAttribute('data-position')) || 'bottom-right';
    var theme = (currentScript && currentScript.getAttribute('data-theme')) || 'dark';
    var shape = (currentScript && currentScript.getAttribute('data-shape')) || 'circle';
    var teaser = (currentScript && currentScript.getAttribute('data-teaser')) || 'Une question ? Discutons en direct 👋';
    var welcomeMsg = (currentScript && currentScript.getAttribute('data-welcome')) || ('Bonjour ! 👋 Comment puis-je vous aider aujourd\'hui ?');
    var whatsappNumber = (currentScript && currentScript.getAttribute('data-whatsapp')) || '';
    var avatarUrl = (currentScript && currentScript.getAttribute('data-avatar-url')) || '';

    var isLeft = position === 'bottom-left';
    var isDark = theme === 'dark';

    // Create Container
    var container = document.createElement('div');
    container.id = 'jawebflow-chat-root';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style[isLeft ? 'left' : 'right'] = '20px';
    container.style.zIndex = '2147483647';
    container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = isLeft ? 'flex-start' : 'flex-end';

    // State
    var isOpen = false;
    var isTyping = false;
    var messages = [
      {
        sender: 'bot',
        text: welcomeMsg,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    // Styles Injection
    var styleTag = document.createElement('style');
    styleTag.innerHTML = `
      #jawebflow-chat-root * { box-sizing: border-box; }
      .jw-bubble-btn {
        width: 58px; height: 58px; border-radius: ${shape === 'squircle' ? '18px' : '50%'};
        background: linear-gradient(135deg, ${primaryColor}, ${gradientSecondary});
        box-shadow: 0 10px 25px -5px ${primaryColor}88;
        display: flex; align-items: center; justify-content: center;
        color: #fff; cursor: pointer; border: none; outline: none;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
      }
      .jw-bubble-btn:hover { transform: scale(1.06); }
      .jw-bubble-btn:active { transform: scale(0.95); }
      .jw-chat-window {
        width: 370px; max-width: calc(100vw - 40px); height: 520px; max-height: 80vh;
        border-radius: 24px; overflow: hidden; display: flex; flex-direction: column;
        margin-bottom: 14px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
        background: ${isDark ? '#0f121d' : '#ffffff'};
        color: ${isDark ? '#f1f5f9' : '#0f172a'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
        animation: jwFadeSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes jwFadeSlide {
        from { opacity: 0; transform: translateY(16px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .jw-header {
        padding: 16px; background: linear-gradient(135deg, ${primaryColor}, ${gradientSecondary});
        color: #fff; display: flex; align-items: center; justify-content: space-between;
      }
      .jw-body {
        flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
        background: ${isDark ? '#090b11' : '#f8fafc'};
      }
      .jw-msg {
        max-width: 82%; padding: 10px 14px; border-radius: 16px; font-size: 13px; line-height: 1.5;
        word-break: break-word;
      }
      .jw-msg-user {
        align-self: flex-end; color: #fff; border-bottom-right-radius: 4px;
        background: linear-gradient(135deg, ${primaryColor}, ${gradientSecondary});
      }
      .jw-msg-bot {
        align-self: flex-start; border-bottom-left-radius: 4px;
        background: ${isDark ? '#181d2d' : '#ffffff'};
        color: ${isDark ? '#f8fafc' : '#1e293b'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
      }
      .jw-input-bar {
        padding: 12px; display: flex; gap: 8px; border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
        background: ${isDark ? '#0f121d' : '#ffffff'};
      }
      .jw-input {
        flex: 1; padding: 10px 14px; border-radius: 12px; font-size: 13px; outline: none;
        background: ${isDark ? '#151928' : '#f1f5f9'};
        color: ${isDark ? '#fff' : '#0f172a'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
      }
      .jw-send-btn {
        padding: 0 14px; border-radius: 12px; border: none; cursor: pointer; color: #fff;
        background: linear-gradient(135deg, ${primaryColor}, ${gradientSecondary});
      }
      .jw-teaser {
        margin-bottom: 10px; padding: 10px 14px; border-radius: 16px; font-size: 12px;
        background: ${isDark ? '#151928' : '#ffffff'};
        color: ${isDark ? '#f1f5f9' : '#0f172a'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
        box-shadow: 0 10px 20px -5px rgba(0,0,0,0.25);
        cursor: pointer; display: flex; align-items: center; gap: 8px;
      }
    `;
    document.head.appendChild(styleTag);

    function render() {
      container.innerHTML = '';

      // Teaser
      if (!isOpen && teaser) {
        var teaserEl = document.createElement('div');
        teaserEl.className = 'jw-teaser';
        teaserEl.innerHTML = `<span>${teaser}</span> <span style="opacity:0.6;font-size:11px;">✕</span>`;
        teaserEl.onclick = function (e) {
          if (e.target.innerText === '✕') {
            teaser = '';
            render();
          } else {
            isOpen = true;
            render();
          }
        };
        container.appendChild(teaserEl);
      }

      // Chat Window
      if (isOpen) {
        var win = document.createElement('div');
        win.className = 'jw-chat-window';
        
        // Header
        var header = document.createElement('div');
        header.className = 'jw-header';
        header.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;overflow:hidden;">
              ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" />` : '✨'}
            </div>
            <div>
              <div style="font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;">
                ${businessName}
                <span style="width:7px;height:7px;border-radius:50%;background:#34d399;display:inline-block;"></span>
              </div>
              <div style="font-size:10px;opacity:0.85;">En ligne · Réponse IA immédiate</div>
            </div>
          </div>
          <button id="jw-close-btn" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;">✕</button>
        `;
        win.appendChild(header);

        // Body
        var body = document.createElement('div');
        body.className = 'jw-body';
        messages.forEach(function (m) {
          var msgDiv = document.createElement('div');
          msgDiv.className = 'jw-msg ' + (m.sender === 'user' ? 'jw-msg-user' : 'jw-msg-bot');
          msgDiv.innerText = m.text;
          body.appendChild(msgDiv);
        });

        if (isTyping) {
          var typingDiv = document.createElement('div');
          typingDiv.className = 'jw-msg jw-msg-bot';
          typingDiv.style.opacity = '0.7';
          typingDiv.innerText = 'En train d\'écrire...';
          body.appendChild(typingDiv);
        }

        win.appendChild(body);

        // Input
        var inputBar = document.createElement('form');
        inputBar.className = 'jw-input-bar';
        inputBar.innerHTML = `
          <input type="text" class="jw-input" placeholder="Posez une question..." />
          <button type="submit" class="jw-send-btn">➤</button>
        `;
        inputBar.onsubmit = function (e) {
          e.preventDefault();
          var input = inputBar.querySelector('input');
          var text = input.value.trim();
          if (!text) return;
          messages.push({ sender: 'user', text: text, time: '' });
          input.value = '';
          isTyping = true;
          render();

          setTimeout(function () {
            var lower = text.toLowerCase();
            var reply = "Merci pour votre message ! Notre équipe et notre IA sont là pour vous aider chez " + businessName + ".";
            if (lower.indexOf('tarif') >= 0 || lower.indexOf('prix') >= 0 || lower.indexOf('combien') >= 0) {
              reply = "Nos offres et tarifs sont adaptés à vos objectifs. Souhaitez-vous un devis rapide ?";
            } else if (lower.indexOf('whatsapp') >= 0 || lower.indexOf('contact') >= 0 || lower.indexOf('telephone') >= 0) {
              reply = whatsappNumber ? "Vous pouvez nous joindre directement au " + whatsappNumber + " ou laisser votre contact ici." : "Laissez-nous votre contact pour qu'un conseiller vous réponde immédiatement.";
            } else if (lower.indexOf('salam') >= 0 || lower.indexOf('bonjour') >= 0) {
              reply = "Marhaban bik ! Bonjour ! En quoi puis-je vous renseigner aujourd'hui ?";
            }
            messages.push({ sender: 'bot', text: reply, time: '' });
            isTyping = false;
            render();
          }, 600);
        };
        win.appendChild(inputBar);

        container.appendChild(win);

        // Auto scroll to bottom
        setTimeout(function () {
          body.scrollTop = body.scrollHeight;
        }, 10);

        var closeBtn = win.querySelector('#jw-close-btn');
        if (closeBtn) {
          closeBtn.onclick = function () {
            isOpen = false;
            render();
          };
        }
      }

      // Bubble
      var bubbleBtn = document.createElement('button');
      bubbleBtn.className = 'jw-bubble-btn';
      bubbleBtn.innerHTML = isOpen ? '▼' : (avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : '✨');
      bubbleBtn.onclick = function () {
        isOpen = !isOpen;
        render();
      };
      container.appendChild(bubbleBtn);
    }

    document.body.appendChild(container);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
