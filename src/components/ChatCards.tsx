/**
 * 🃏 L'AFFICHAGE EN CARTES (widget du site vitrine)
 * ============================================================================
 * L'assistant écrit du texte simple : un titre en gras, puis des puces, puis
 * son lien. Ce composant décide de l'affichage — carte propre quand la réponse
 * ressemble à une liste, bulle normale sinon (jamais de charabia, jamais un
 * pavé de texte).
 *
 * Le même découpage sert au widget des clients (`public/widget.js`) : la logique
 * vit dans `src/lib/chat-cards.ts`, et les deux doivent rester identiques.
 */
import React from 'react';
import { hasCards, parseChatBlocks, type ChatAction, type ChatBlock } from '../lib/chat-cards';

/** Les blocs à afficher — `null` quand un simple texte suffit. */
export function chatCardsFor(text: string): ChatBlock[] | null {
  const blocks = parseChatBlocks(text);
  return hasCards(blocks) ? blocks : null;
}

export default function ChatCards({
  blocks,
  light,
  accent,
}: {
  blocks: ChatBlock[];
  light: boolean;
  accent: string;
}) {
  return (
    <div className="flex w-full flex-col items-start gap-1.5">
      {blocks.map((block, index) => {
        if (block.kind === 'text') {
          return (
            <div
              key={index}
              className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs font-light leading-relaxed shadow-sm sm:text-[13px] ${
                light
                  ? 'rounded-tl-sm border border-black/[0.06] bg-white text-neutral-800'
                  : 'rounded-tl-sm border border-white/[0.07] bg-white/[0.045] text-neutral-100'
              }`}
            >
              {block.text}
            </div>
          );
        }
        return <Card key={index} title={block.title} items={block.items} actions={block.actions} light={light} accent={accent} />;
      })}
    </div>
  );
}

function Card({
  title,
  items,
  actions,
  light,
  accent,
}: {
  key?: React.Key;
  title: string;
  items: string[];
  actions: ChatAction[];
  light: boolean;
  accent: string;
}) {
  return (
    <div
      className={`max-w-[88%] overflow-hidden rounded-2xl border shadow-sm ${
        light ? 'border-black/[0.07] bg-white text-neutral-800' : 'border-white/[0.08] bg-white/[0.04] text-neutral-100'
      }`}
    >
      {title && (
        <div
          className={`px-3.5 py-2 text-[12.5px] font-semibold ${
            light ? 'bg-black/[0.03] text-neutral-900' : 'bg-white/[0.05] text-white'
          }`}
        >
          {title}
        </div>
      )}
      {items.length > 0 && (
        <div>
          {items.map((item, index) => (
            <div
              key={index}
              className={`flex items-start gap-2.5 px-3.5 py-2 text-[12.5px] leading-relaxed ${
                index > 0
                  ? light
                    ? 'border-t border-dashed border-black/[0.06]'
                    : 'border-t border-dashed border-white/[0.06]'
                  : ''
              }`}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 px-3.5 py-2.5 ${
            light ? 'border-t border-black/[0.06]' : 'border-t border-white/[0.07]'
          }`}
        >
          {actions.map((action, index) => (
            <a
              key={index}
              href={action.href}
              target={action.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ background: accent }}
            >
              {action.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
