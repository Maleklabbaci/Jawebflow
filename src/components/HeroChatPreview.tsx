import React from 'react';
import { Send } from 'lucide-react';

/**
 * Aperçu décoratif d'une conversation, affiché à droite du titre sur grand écran.
 *
 * Il remplace TEMPORAIREMENT l'ancien robot animé : aucune photo lourde, aucun
 * script, juste du HTML et du CSS. Même boutique de démonstration (Maison Lila)
 * et mêmes informations que la maquette interactive juste en dessous.
 *
 * C'est une illustration, pas un vrai chat : elle est masquée pour les lecteurs
 * d'écran et n'apparaît qu'à partir de 1280 px de large (en dessous, le titre
 * a besoin de toute la place).
 */
const MESSAGES: ReadonlyArray<{ from: 'visitor' | 'assistant'; text: string }> = [
  { from: 'visitor', text: 'Salam, chhal waqt pour la livraison à Blida ?' },
  { from: 'assistant', text: 'Livraison en 24h sur Blida (400 DA). Le livreur vous appelle 1h avant de passer.' },
  { from: 'visitor', text: 'Ok, je veux commander le Pack Soin Bio.' },
  { from: 'assistant', text: 'Parfait ! Laissez votre numéro : l’équipe vous rappelle pour confirmer.' },
];

export const HeroChatPreview: React.FC = () => (
  <div
    id="hero-chat-preview"
    aria-hidden="true"
    className="hidden xl:flex flex-1 items-start justify-center self-start mt-14 pl-8 pointer-events-none select-none"
  >
    <div className="relative w-full max-w-[420px]">
      {/* Halo violet derrière la carte (dégradé, pas de flou coûteux) */}
      <div className="absolute -inset-20 bg-[radial-gradient(closest-side,rgba(124,58,237,0.26),transparent)]" />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/55 backdrop-blur-xl shadow-2xl shadow-purple-950/40">
        {/* En-tête : la boutique et son assistant */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Maison Lila</p>
            <p className="flex items-center gap-1.5 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Assistant en ligne
            </p>
          </div>
        </div>

        {/* Conversation */}
        <div className="space-y-3 px-5 py-5">
          {MESSAGES.map((m, i) => (
            <div key={i} className={m.from === 'visitor' ? 'flex justify-end' : 'flex justify-start'}>
              <p
                className={
                  m.from === 'visitor'
                    ? 'max-w-[82%] rounded-2xl rounded-br-md bg-purple-600 px-3.5 py-2.5 text-[13px] leading-snug text-white'
                    : 'max-w-[82%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-neutral-100'
                }
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>

        {/* Zone de saisie (décor) */}
        <div className="mx-5 mb-5 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] py-2 pl-4 pr-2 text-xs text-neutral-500">
          <span>Écrivez votre message…</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600/80 text-white">
            <Send className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  </div>
);
