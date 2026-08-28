import React, { FormEvent, useEffect, useRef, useState } from "react";
import { CheckCheck, Globe2, Layers3, MessageCircle, RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";

import { buildDemoReply } from "@/lib/demoReply";

type ChatMessage = { id: string; sender: "user" | "assistant"; text: string };

const seedMessages: ChatMessage[] = [
  { id: "seed-1", sender: "user", text: "Salam, wach kayen la livraison à Blida ?" },
  { id: "seed-2", sender: "assistant", text: "Oui, la livraison est disponible à Blida. Envoie-moi le produit qui t’intéresse et je te confirme les détails." },
];

export default function LandingChatDemo() {
  const [messages, setMessages] = useState(seedMessages);
  const [message, setMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const [channel, setChannel] = useState<"web" | "whatsapp">("web");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, replying]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = message.trim();
    if (!question || replying) return;
    setMessages(current => [...current, { id: `${Date.now()}-user`, sender: "user", text: question }]);
    setMessage("");
    setReplying(true);
    window.setTimeout(() => {
      setMessages(current => [...current, { id: `${Date.now()}-assistant`, sender: "assistant", text: buildDemoReply(question) }]);
      setReplying(false);
    }, 500);
  }

  return (
    <section id="demo" className="reference-section reference-demo">
      <div className="reference-kicker-row"><span><ShieldCheck size={14} /> Réponses fondées sur vos données</span><span><Layers3 size={14} /> Base de connaissances</span><span><Globe2 size={14} /> Français & Darija</span></div>
      <div className="reference-chat-switch"><button className={channel === "web" ? "is-active" : ""} type="button" onClick={() => setChannel("web")}><Globe2 size={14} /> Web</button><button className={channel === "whatsapp" ? "is-active" : ""} type="button" onClick={() => setChannel("whatsapp")}><MessageCircle size={14} /> WhatsApp</button></div>
      <article className="reference-chat-card">
        <header className="reference-chat-card__header"><div className="reference-avatar">JF<span /></div><div><h2>Maison Lila <small>E-commerce</small></h2><p><i /> En direct sur votre site</p></div><button type="button" onClick={() => setMessages(seedMessages)} aria-label="Réinitialiser la conversation"><RotateCcw size={15} /></button></header>
        <div ref={scrollRef} className="reference-chat-card__messages">
          {messages.map(item => <div className={`reference-message reference-message--${item.sender}`} key={item.id}><div>{item.sender === "assistant" ? <Sparkles size={12} /> : null}<p>{item.sender === "assistant" ? <small>Réponse vérifiée entreprise</small> : null}{item.text}</p><time>{item.sender === "assistant" ? "maintenant" : "vu"}{item.sender === "user" ? <CheckCheck size={12} /> : null}</time></div></div>)}
          {replying ? <div className="reference-message reference-message--assistant"><div><Sparkles size={12} /><p className="reference-typing"><span /><span /><span /> Vérification des informations…</p></div></div> : null}
        </div>
        <div className="reference-chat-card__suggestions"><span>Exemples :</span><button type="button" onClick={() => setMessage("Bonjour")}>Bonjour</button><button type="button" onClick={() => setMessage("Quel est le prix ?")}>Prix & disponibilités</button><button type="button" onClick={() => setMessage("Livraison à Alger ?")}>Livraison</button></div>
        <form className="reference-chat-card__form" onSubmit={submit}><input value={message} onChange={event => setMessage(event.target.value)} placeholder="Posez une question sur vos produits, prix, délais…" aria-label="Tester l’assistant commercial" /><button type="submit" disabled={!message.trim() || replying} aria-label="Envoyer"><Send size={16} /></button></form>
      </article>
    </section>
  );
}
