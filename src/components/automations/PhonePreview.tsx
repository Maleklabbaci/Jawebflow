/**
 * Aperçu « téléphone » : montre au marchand ce que verra la personne.
 * Alimenté par simulateAutomation (même logique que le robot).
 */
import React from 'react';
import { ExternalLink, MessageCircle } from 'lucide-react';
import type { SimulationResult, TriggerType } from '../../../functions/_shared/ig-automation-core';

function Bubble({ side, children, tone = 'default' }: { side: 'left' | 'right'; children: React.ReactNode; tone?: 'default' | 'brand' }) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-[13px] leading-snug ${
          tone === 'brand' ? 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white' : 'bg-slate-100 text-slate-900'
        } ${side === 'right' ? 'rounded-br-md' : 'rounded-bl-md'}`}
      >
        {children}
      </div>
    </div>
  );
}

function LinkButton({ label }: { label: string }) {
  return (
    <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-700">
      <ExternalLink className="h-3 w-3" />
      {label}
    </div>
  );
}

export function PhonePreview({
  triggerType,
  sim,
  commentText,
  username,
  accountName,
  linkLabels,
}: {
  triggerType: TriggerType;
  sim: SimulationResult;
  commentText: string;
  username: string;
  accountName: string;
  linkLabels: string[];
}) {
  const isComment = triggerType === 'comment';
  const who = username || 'sara_dz';
  const incomingLabel =
    triggerType === 'story_mention' ? `📣 @${who} t’a mentionné dans sa story` : triggerType === 'story_reply' ? '↩︎ Réponse à ta story' : '';

  return (
    <div data-testid="phone-preview" className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[6px] border-slate-900 bg-white p-3 shadow-lg">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-200" />

      {!sim.triggers ? (
        <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
          <p className="mb-1 text-lg">🤔</p>
          <p data-testid="preview-no-trigger" className="font-medium text-slate-600">Rien ne se passe</p>
          <p className="mt-1">{sim.reason}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {isComment && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <MessageCircle className="h-3 w-3" /> Sous ta publication
              </p>
              <div className="text-[13px] leading-snug">
                <span className="font-semibold text-slate-900">{who}</span> <span className="text-slate-700">{commentText}</span>
              </div>
              {sim.publicReply ? (
                <div className="ml-4 border-l-2 border-slate-200 pl-3 text-[13px] leading-snug" data-testid="preview-public-reply">
                  <span className="font-semibold text-slate-900">{accountName}</span> <span className="text-slate-700">{sim.publicReply}</span>
                </div>
              ) : (
                <p className="ml-4 text-[11px] italic text-slate-400">Pas de réponse publique</p>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-xl bg-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isComment ? '✉️ Message privé reçu' : '💬 Conversation'}
            </p>
            {!isComment && (
              <>
                {incomingLabel && <p className="text-center text-[11px] text-slate-400">{incomingLabel}</p>}
                {triggerType !== 'story_mention' && <Bubble side="right" tone="brand">{commentText}</Bubble>}
              </>
            )}
            {sim.gate ? (
              <div data-testid="preview-gate">
                <Bubble side="left">{sim.gate.text}</Bubble>
                <div className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center text-[12px] font-semibold text-slate-800">{sim.gate.button}</div>
                <p className="mt-1.5 text-center text-[10px] text-slate-400">Le vrai message n’arrive qu’après l’abonnement ↓</p>
                {sim.dm && (
                  <div className="mt-1.5 opacity-70">
                    <Bubble side="left">{sim.dm.text}</Bubble>
                    {linkLabels.map((l) => <React.Fragment key={l}><LinkButton label={l} /></React.Fragment>)}
                  </div>
                )}
              </div>
            ) : sim.dm ? (
              <div data-testid="preview-dm">
                <Bubble side="left">{sim.dm.text}</Bubble>
                {linkLabels.map((l) => <React.Fragment key={l}><LinkButton label={l} /></React.Fragment>)}
              </div>
            ) : (
              <p className="text-[11px] italic text-slate-400">Pas de message privé</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
