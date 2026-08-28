(() => {
  const currentScript = document.currentScript;
  if (!currentScript || currentScript.dataset.jawebflowLoaded === "true") return;
  currentScript.dataset.jawebflowLoaded = "true";

  const botId = currentScript.getAttribute("data-bot-id");
  const widgetToken = currentScript.getAttribute("data-widget-token");
  if (!botId || !widgetToken) return;

  const theme = currentScript.getAttribute("data-theme") || "violet";
  const position = currentScript.getAttribute("data-position") || "bottom-right";
  const themes = {
    violet: { accent: "#7c3aed", accentDark: "#4c1d95", shadow: "rgba(124,58,237,.35)" },
    cyan: { accent: "#0891b2", accentDark: "#164e63", shadow: "rgba(8,145,178,.35)" },
    orange: { accent: "#ea580c", accentDark: "#7c2d12", shadow: "rgba(234,88,12,.35)" },
    mono: { accent: "#262626", accentDark: "#0a0a0a", shadow: "rgba(0,0,0,.35)" },
  };
  const selectedTheme = themes[theme] || themes.violet;
  const isLeft = position === "bottom-left";

  const host = document.createElement("div");
  host.setAttribute("data-jawebflow-widget", botId);
  host.style.cssText = `position:fixed;${isLeft ? "left:20px" : "right:20px"};bottom:20px;z-index:2147483000;font-family:Arial,sans-serif`;

  const panel = document.createElement("section");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Assistant commercial");
  panel.style.cssText = `display:none;width:320px;margin-bottom:12px;border:1px solid ${selectedTheme.accent}44;border-radius:18px;padding:18px;background:linear-gradient(135deg,#18121f,#0f172a);box-shadow:0 18px 48px ${selectedTheme.shadow};color:#f5f3ff;line-height:1.5`;
  panel.innerHTML = `<div style='font-family:Arial,sans-serif;font-size:19px;font-weight:700'>Assistant commercial</div><p style='margin:8px 0 12px;font-size:13px;color:#c4b5fd'>Posez une question à votre assistant.</p><div data-jawebflow-messages style='max-height:180px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px'><div style='align-self:flex-start;max-width:90%;padding:8px 10px;border-radius:12px;background:#241b38;color:#ddd6fe;font-size:13px'>Bonjour, comment puis-je vous aider ?</div></div><form data-jawebflow-form style='display:flex;gap:6px'><input data-jawebflow-input aria-label='Votre message' placeholder='Écrivez votre question…' style='min-width:0;flex:1;border:1px solid #3d2d5c;border-radius:10px;padding:9px 10px;background:#0d0a14;color:#fff;font-size:12px;outline:none'><button type='submit' style='border:0;border-radius:10px;padding:0 11px;background:${selectedTheme.accent};color:#fff;font-weight:700;cursor:pointer'>→</button></form>`;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Ouvrir l’assistant commercial");
  button.textContent = "✦";
  button.style.cssText = `margin-${isLeft ? "right" : "left"}:auto;display:block;width:52px;height:52px;border:0;border-radius:50%;background:linear-gradient(135deg,${selectedTheme.accent},${selectedTheme.accentDark});color:#fff;font-size:22px;cursor:pointer;box-shadow:0 12px 24px ${selectedTheme.shadow}`;
  button.addEventListener("click", () => {
    const isOpen = panel.style.display === "block";
    panel.style.display = isOpen ? "none" : "block";
    button.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) panel.querySelector("[data-jawebflow-input]")?.focus();
  });

  const form = panel.querySelector("[data-jawebflow-form]");
  const input = panel.querySelector("[data-jawebflow-input]");
  const messages = panel.querySelector("[data-jawebflow-messages]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.disabled = true;
    const userMessage = document.createElement("div");
    userMessage.textContent = message;
    userMessage.style.cssText = `align-self:flex-end;max-width:90%;padding:8px 10px;border-radius:12px;background:${selectedTheme.accent};color:#fff;font-size:13px`;
    messages.appendChild(userMessage);
    input.value = "";
    try {
      const response = await fetch("/api/trpc/workspace.recordWidgetMessage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { botId, widgetToken, message } }),
      });
      if (!response.ok) throw new Error("Message refusé");
      const assistantMessage = document.createElement("div");
      assistantMessage.textContent = "Merci, votre demande a bien été reçue. Notre équipe revient vers vous rapidement.";
      assistantMessage.style.cssText = "align-self:flex-start;max-width:90%;padding:8px 10px;border-radius:12px;background:#241b38;color:#ddd6fe;font-size:13px";
      messages.appendChild(assistantMessage);
    } catch {
      const errorMessage = document.createElement("div");
      errorMessage.textContent = "Ce message n’a pas pu être envoyé. Réessayez dans un instant.";
      errorMessage.style.cssText = "align-self:flex-start;max-width:90%;padding:8px 10px;border-radius:12px;background:#3b1720;color:#fecdd3;font-size:13px";
      messages.appendChild(errorMessage);
    } finally {
      input.disabled = false;
      input.focus();
      messages.scrollTop = messages.scrollHeight;
    }
  });

  host.append(panel, button);
  document.body.appendChild(host);
})();
