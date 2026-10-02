/**
 * Éditeur d'une automatisation : formulaire en langage simple à gauche,
 * aperçu « téléphone » + essai en direct à droite.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImageIcon, Link2, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  LIMITS,
  TEMPLATE_VARIABLES,
  TRIGGER_LABELS,
  byteLength,
  normalizeUrl,
  parseKeywords,
  sanitizeAutomationInput,
  simulateAutomation,
  type AutomationConfig,
  type MatchMode,
  type TriggerType,
} from '../../../functions/_shared/ig-automation-core';
import { MediaPicker, type PickedMedia } from './MediaPicker';
import { PhonePreview } from './PhonePreview';
import { Stepper, type StepDef } from '../dashboard/Stepper';
import { Card, Notice, Section, Toggle, ghostBtn, inputClass, primaryBtn, secondaryBtn } from './ui';

export interface Draft {
  id?: string;
  name: string;
  triggerType: TriggerType;
  enabled: boolean;
  config: AutomationConfig;
}

const SUGGESTED_KEYWORDS = ['prix', 'info', 'lien', 'combien', 'commander', 'livraison', 'سعر', 'ch7al'];

const MODE_LABELS: Record<TriggerType, Array<{ mode: MatchMode; label: string; help: string }>> = {
  comment: [
    { mode: 'any', label: 'Tout commentaire', help: 'Le robot réagit à n’importe quel commentaire.' },
    { mode: 'contains', label: 'Contient un mot', help: 'Dès qu’un de tes mots est dans le commentaire.' },
    { mode: 'exact', label: 'Exactement un mot', help: 'Seulement si le commentaire est UNIQUEMENT ce mot.' },
  ],
  dm_keyword: [
    { mode: 'contains', label: 'Contient un mot', help: 'Dès qu’un de tes mots est dans le message.' },
    { mode: 'exact', label: 'Message exact', help: 'Seulement si le message est UNIQUEMENT ce mot.' },
  ],
  story_reply: [
    { mode: 'any', label: 'Toute réponse', help: 'Le robot répond à toutes les réponses à tes stories.' },
    { mode: 'contains', label: 'Contient un mot', help: 'Seulement si la réponse contient un de tes mots.' },
    { mode: 'exact', label: 'Message exact', help: 'Seulement si la réponse est UNIQUEMENT ce mot.' },
  ],
  story_mention: [],
};

/** Un exemple de texte qui déclenche l'automatisation (le premier mot-clé), pour que l'aperçu soit parlant dès l'ouverture. */
function suggestTestText(cfg: AutomationConfig, isComment: boolean): string {
  const first = cfg.match.keywords[0];
  if (first) return cfg.match.mode === 'exact' ? first : `${first} svp ?`;
  return isComment ? 'Superbe publication 😍' : 'Bonjour !';
}

/** Insère `token` à l'endroit du curseur dans le champ `id` (ou à la fin). */
function insertAtCursor(id: string, current: string, token: string): string {
  const el = document.getElementById(id) as HTMLTextAreaElement | null;
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const spacer = before && !/\s$/.test(before) ? ' ' : '';
  const next = `${before}${spacer}${token}${after}`;
  const caret = (before + spacer + token).length;
  requestAnimationFrame(() => { el?.focus(); try { el?.setSelectionRange(caret, caret); } catch { /* ignore */ } });
  return next;
}

function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Variables à insérer">
      <span className="text-[11px] text-slate-400">Insérer :</span>
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          title={v.help}
          onClick={() => onInsert(v.key)}
          className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 hover:border-purple-300 hover:bg-purple-50"
        >
          + {v.label}
        </button>
      ))}
    </div>
  );
}

function LengthBar({ text }: { text: string }) {
  const used = byteLength(text);
  const pct = Math.min(100, Math.round((used / LIMITS.maxDmBytes) * 100));
  const over = used > LIMITS.maxDmBytes;
  return (
    <div className="space-y-1" data-testid="length-bar">
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] ${over ? 'font-medium text-red-600' : 'text-slate-400'}`}>
        {over ? 'Message trop long : raccourcis-le (Instagram refuse les messages trop longs).' : `Longueur : ${pct} % du maximum autorisé par Instagram`}
      </p>
    </div>
  );
}

function KeywordInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('');
  const commit = (raw: string) => {
    const incoming = parseKeywords(raw);
    if (!incoming.length) { setText(''); return; }
    onChange(parseKeywords([...value, ...incoming]).slice(0, LIMITS.maxKeywords));
    setText('');
  };
  const remaining = SUGGESTED_KEYWORDS.filter((s) => !value.some((v) => v.toLowerCase() === s));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20">
        {value.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
            {k}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`Retirer le mot « ${k} »`} className="rounded-full p-0.5 hover:bg-white/20">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); commit(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit(text)}
          maxLength={LIMITS.maxKeywordLength}
          placeholder={value.length ? 'Ajouter un mot…' : 'Écris un mot puis appuie sur Entrée (ex. prix)'}
          aria-label="Ajouter un mot-clé"
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {remaining.length > 0 && value.length < LIMITS.maxKeywords && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Idées :</span>
          {remaining.slice(0, 6).map((s) => (
            <button key={s} type="button" onClick={() => commit(s)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-purple-400 hover:text-purple-700">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AutomationEditor({
  initial,
  accountName,
  businessName,
  saving,
  serverErrors,
  onSave,
  onCancel,
}: {
  initial: Draft;
  accountName: string;
  businessName?: string;
  saving: boolean;
  serverErrors: string[];
  onSave: (draft: Draft, activate: boolean) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [lastVariation, setLastVariation] = useState(0);
  const errorsRef = useRef<HTMLDivElement>(null);

  const t = draft.triggerType;
  const cfg = draft.config;
  const isComment = t === 'comment';
  const isStoryMention = t === 'story_mention';
  const isNew = !draft.id;

  const patch = (p: Partial<AutomationConfig>) => setDraft((d) => ({ ...d, config: { ...d.config, ...p } }));

  // ── Essai en direct ───────────────────────────────────────────────────────
  const [testText, setTestText] = useState(() => suggestTestText(initial.config, initial.triggerType === 'comment'));
  const [testTouched, setTestTouched] = useState(false);
  const [testUser, setTestUser] = useState('sara_dz');
  const [testFirst, setTestFirst] = useState('Sara');
  useEffect(() => {
    if (!testTouched) setTestText(suggestTestText(cfg, isComment));
  }, [cfg.match.keywords, cfg.match.mode, testTouched, isComment]);

  const sim = useMemo(
    () =>
      simulateAutomation(
        { triggerType: t, config: cfg },
        { text: testText, username: testUser, firstName: isComment ? '' : testFirst, businessName: businessName || '', mediaId: cfg.media.scope === 'one' ? cfg.media.id : undefined },
      ),
    [t, cfg, testText, testUser, testFirst, isComment, businessName],
  );

  // ── Validation (même code que le serveur) ─────────────────────────────────
  const check = useMemo(() => sanitizeAutomationInput({ name: draft.name, triggerType: t, config: cfg }), [draft.name, t, cfg]);
  const errors = serverErrors.length ? serverErrors : submitted && !check.ok ? check.errors : [];
  useEffect(() => { if (errors.length) errorsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }, [errors.length]);

  const submit = (activate: boolean) => {
    setSubmitted(true);
    if (!check.ok) return;
    onSave({ ...draft, enabled: activate ? true : draft.enabled }, activate);
  };

  const setVariation = (i: number, value: string) => patch({ publicReply: { ...cfg.publicReply, variations: cfg.publicReply.variations.map((v, idx) => (idx === i ? value : v)) } });
  const addVariation = () => {
    if (cfg.publicReply.variations.length >= LIMITS.maxVariations) return;
    patch({ publicReply: { ...cfg.publicReply, variations: [...cfg.publicReply.variations, ''] } });
    setLastVariation(cfg.publicReply.variations.length);
  };
  const removeVariation = (i: number) => patch({ publicReply: { ...cfg.publicReply, variations: cfg.publicReply.variations.filter((_, idx) => idx !== i) } });
  const setButton = (i: number, key: 'title' | 'url', value: string) =>
    patch({ dm: { ...cfg.dm, buttons: cfg.dm.buttons.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)) } });

  const pick = (m: PickedMedia) => {
    patch({ media: { scope: 'one', id: m.id, permalink: m.permalink, thumbnail: m.thumbnail, caption: m.caption, type: m.type } });
    setPickerOpen(false);
  };

  const modes = MODE_LABELS[t];
  const heading = TRIGGER_LABELS[t].title;

  // ── Étapes : on ne montre qu'une chose à la fois ──
  const flow: StepDef[] = isComment
    ? [{ id: 'media', label: 'Publication' }, { id: 'trigger', label: 'Déclencheur' }, { id: 'reply', label: 'Réponses' }, { id: 'validate', label: 'Valider' }]
    : isStoryMention
      ? [{ id: 'reply', label: 'Réponse' }, { id: 'validate', label: 'Valider' }]
      : [{ id: 'trigger', label: 'Déclencheur' }, { id: 'reply', label: 'Réponse' }, { id: 'validate', label: 'Valider' }];
  const [stepIdx, setStepIdx] = useState(0);
  const cur = flow[Math.min(stepIdx, flow.length - 1)].id;
  const isLastStep = stepIdx >= flow.length - 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className={ghostBtn}><ArrowLeft className="h-4 w-4" /> Retour</button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{isNew ? 'Nouvelle automatisation' : 'Modifier l’automatisation'}</h2>
            <p className="text-xs text-slate-500">{heading}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ───────────── Formulaire ───────────── */}
        <Card className="p-5 sm:p-6">
          <div className="mb-6"><Stepper steps={flow} current={stepIdx} onSelect={setStepIdx} maxReachable={flow.length - 1} /></div>
          {cur === 'validate' && (
          <Section title="Nom de l’automatisation" hint="Juste pour t’y retrouver dans ta liste.">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              maxLength={LIMITS.maxName}
              aria-label="Nom de l’automatisation"
              className={inputClass}
              placeholder="Ex. Prix de la nouvelle collection"
            />
          </Section>
          )}

          {cur === 'media' && isComment && (
            <Section title="Sous quelle publication ?" hint="Choisis un post ou un reel précis, ou toutes tes publications d’un coup.">
              <div role="radiogroup" aria-label="Publication concernée" className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button" role="radio" aria-checked={cfg.media.scope === 'any'}
                  onClick={() => patch({ media: { scope: 'any' } })}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm ${cfg.media.scope === 'any' ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  Toutes mes publications
                  <span className="block text-xs font-normal text-slate-500">Posts et reels, y compris les prochains</span>
                </button>
                <button
                  type="button" role="radio" aria-checked={cfg.media.scope === 'one'}
                  onClick={() => (cfg.media.id ? patch({ media: { ...cfg.media, scope: 'one' } }) : setPickerOpen(true))}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm ${cfg.media.scope === 'one' ? 'border-slate-900 bg-slate-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  Une publication précise
                  <span className="block text-xs font-normal text-slate-500">Tu la choisis dans tes vrais posts</span>
                </button>
              </div>
              {cfg.media.scope === 'one' && cfg.media.id && (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5" data-testid="chosen-media">
                  {cfg.media.thumbnail ? (
                    <img src={cfg.media.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-400"><ImageIcon className="h-5 w-5" /></div>
                  )}
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-700">{cfg.media.caption || 'Publication sans légende'}</p>
                  <button type="button" onClick={() => setPickerOpen(true)} className={secondaryBtn}>Changer</button>
                </div>
              )}
            </Section>
          )}

          {cur === 'trigger' && !isStoryMention && (
            <Section
              title={isComment ? 'Quel commentaire déclenche le robot ?' : t === 'dm_keyword' ? 'Quel mot déclenche la réponse ?' : 'Quelles réponses déclenchent le robot ?'}
              hint="Les majuscules, les accents et la ponctuation sont ignorés : « Prix », « prix ? » et « PRIX !! » comptent pareil. Ça marche aussi en arabe."
            >
              <div role="radiogroup" aria-label="Type de déclenchement" className="flex flex-wrap gap-2">
                {modes.map((m) => (
                  <button
                    key={m.mode} type="button" role="radio" aria-checked={cfg.match.mode === m.mode} title={m.help}
                    onClick={() => patch({ match: { ...cfg.match, mode: m.mode } })}
                    className={`rounded-full border px-3.5 py-1.5 text-sm ${cfg.match.mode === m.mode ? 'border-slate-900 bg-slate-900 font-medium text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">{modes.find((m) => m.mode === cfg.match.mode)?.help}</p>
              {cfg.match.mode !== 'any' && <KeywordInput value={cfg.match.keywords} onChange={(keywords) => patch({ match: { ...cfg.match, keywords } })} />}
              {t === 'story_reply' && cfg.match.mode === 'any' && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Avec « Toute réponse », ce message remplace la réponse de l’IA pour TOUTES les réponses à tes stories.</p>
              )}
            </Section>
          )}

          {cur === 'reply' && isComment && (
            <Section
              title="Réponse publique sous le commentaire"
              hint="Une petite réponse visible par tous. Écris-en plusieurs : le robot en choisit une au hasard, ça fait plus naturel (et Instagram aime mieux). Évite les liens ici : ils ne sont pas cliquables dans les commentaires."
              right={<Toggle checked={cfg.publicReply.enabled} onChange={(v) => patch({ publicReply: { ...cfg.publicReply, enabled: v, variations: v && cfg.publicReply.variations.length === 0 ? [''] : cfg.publicReply.variations } })} label="Activer la réponse publique" />}
            >
              {cfg.publicReply.enabled && (
                <div className="space-y-2.5">
                  {cfg.publicReply.variations.map((v, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <textarea
                        id={`variation-${i}`}
                        value={v}
                        onFocus={() => setLastVariation(i)}
                        onChange={(e) => setVariation(i, e.target.value)}
                        rows={2}
                        maxLength={LIMITS.maxPublicReplyLength}
                        aria-label={`Réponse publique, variante ${i + 1}`}
                        placeholder="Ex. Merci {@pseudo} ! Je t’envoie ça en message privé 📩"
                        className={`${inputClass} resize-none`}
                      />
                      {cfg.publicReply.variations.length > 1 && (
                        <button type="button" onClick={() => removeVariation(i)} aria-label={`Supprimer la variante ${i + 1}`} className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <VariableChips onInsert={(token) => setVariation(lastVariation, insertAtCursor(`variation-${lastVariation}`, cfg.publicReply.variations[lastVariation] || '', token))} />
                    <button type="button" onClick={addVariation} disabled={cfg.publicReply.variations.length >= LIMITS.maxVariations} className={ghostBtn}>
                      <Plus className="h-3.5 w-3.5" /> Ajouter une variante
                    </button>
                  </div>
                </div>
              )}
            </Section>
          )}

          {cur === 'reply' && (
          <Section
            title={isComment ? 'Message privé envoyé à la personne' : isStoryMention ? 'Message de remerciement' : 'Réponse automatique'}
            hint={
              isComment
                ? 'Arrive dans ses messages privés (dans « Demandes » si elle ne te suit pas). Instagram autorise UN seul message privé par commentaire, dans les 7 jours.'
                : 'Envoyé tout de suite, sans IA. Pour toutes les autres questions, ton assistant IA continue de répondre.'
            }
            right={isComment ? <Toggle checked={cfg.dm.enabled} onChange={(v) => patch({ dm: { ...cfg.dm, enabled: v }, gate: v ? cfg.gate : { ...cfg.gate, enabled: false } })} label="Activer le message privé" /> : undefined}
          >
            {cfg.dm.enabled && (
              <div className="space-y-3">
                <textarea
                  id="dm-text"
                  value={cfg.dm.text}
                  onChange={(e) => patch({ dm: { ...cfg.dm, text: e.target.value } })}
                  rows={5}
                  aria-label="Message privé"
                  placeholder={'Salut {prenom} 👋\nVoici les infos que tu as demandées : …'}
                  className={`${inputClass} resize-y`}
                />
                <LengthBar text={cfg.dm.text} />
                <VariableChips onInsert={(token) => patch({ dm: { ...cfg.dm, text: insertAtCursor('dm-text', cfg.dm.text, token) } })} />

                <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Link2 className="h-3.5 w-3.5" /> Boutons avec un lien (3 maximum)</p>
                  {cfg.dm.buttons.map((b, i) => {
                    const badUrl = Boolean(b.url.trim()) && !normalizeUrl(b.url);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={b.title}
                            maxLength={LIMITS.maxButtonTitle}
                            onChange={(e) => setButton(i, 'title', e.target.value)}
                            aria-label={`Texte du bouton ${i + 1}`}
                            placeholder="Texte (ex. Voir l’offre)"
                            className={`${inputClass} max-w-[11rem]`}
                          />
                          <input
                            value={b.url}
                            onChange={(e) => setButton(i, 'url', e.target.value)}
                            aria-label={`Lien du bouton ${i + 1}`}
                            placeholder="https://ma-boutique.com/offre"
                            className={`${inputClass} ${badUrl ? 'border-red-400' : ''}`}
                            inputMode="url"
                          />
                          <button type="button" onClick={() => patch({ dm: { ...cfg.dm, buttons: cfg.dm.buttons.filter((_, idx) => idx !== i) } })} aria-label={`Supprimer le bouton ${i + 1}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {badUrl && <p className="text-[11px] text-red-600">Ce lien n’est pas valide. Exemple : https://ma-boutique.com/offre</p>}
                      </div>
                    );
                  })}
                  {cfg.dm.buttons.length < LIMITS.maxButtons && (
                    <button type="button" onClick={() => patch({ dm: { ...cfg.dm, buttons: [...cfg.dm.buttons, { title: '', url: '' }] } })} className={ghostBtn}>
                      <Plus className="h-3.5 w-3.5" /> Ajouter un bouton
                    </button>
                  )}
                </div>

                {isComment && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Demander de suivre mon compte avant d’envoyer</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                          La personne reçoit d’abord une demande avec un bouton « ✅ C’est fait ». Ton message n’est envoyé qu’après avoir vérifié qu’elle te suit. Idéal pour gagner des abonnés.
                        </p>
                      </div>
                      <Toggle checked={cfg.gate.enabled} onChange={(v) => patch({ gate: { ...cfg.gate, enabled: v } })} label="Demander de suivre mon compte" />
                    </div>
                    {cfg.gate.enabled && (
                      <div className="mt-3">
                        <button type="button" onClick={() => setGateOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900" aria-expanded={gateOpen}>
                          Personnaliser les messages de la demande <ChevronDown className={`h-3.5 w-3.5 transition-transform ${gateOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {gateOpen && (
                          <div className="mt-2 space-y-2">
                            <label className="block text-xs text-slate-500">
                              Message de demande
                              <textarea value={cfg.gate.text} onChange={(e) => patch({ gate: { ...cfg.gate, text: e.target.value } })} rows={2} maxLength={LIMITS.maxGateText} className={`${inputClass} mt-1 resize-none`} />
                            </label>
                            <label className="block text-xs text-slate-500">
                              Texte du bouton (20 caractères max)
                              <input value={cfg.gate.button} onChange={(e) => patch({ gate: { ...cfg.gate, button: e.target.value } })} maxLength={LIMITS.maxButtonTitle} className={`${inputClass} mt-1`} />
                            </label>
                            <label className="block text-xs text-slate-500">
                              Rappel si la personne n’est pas encore abonnée
                              <textarea value={cfg.gate.retry} onChange={(e) => patch({ gate: { ...cfg.gate, retry: e.target.value } })} rows={2} maxLength={LIMITS.maxGateText} className={`${inputClass} mt-1 resize-none`} />
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>
          )}

          {cur === 'validate' && isComment && (
            <Section title="Options">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Une seule fois par personne</p>
                  <p className="mt-0.5 text-xs text-slate-500">Si quelqu’un commente plusieurs fois « prix », il ne reçoit le message qu’une fois. Recommandé.</p>
                </div>
                <Toggle checked={cfg.oncePerUser} onChange={(v) => patch({ oncePerUser: v })} label="Une seule fois par personne" />
              </div>
            </Section>
          )}

          {cur === 'validate' && errors.length > 0 && (
            <div ref={errorsRef} className="mt-2">
              <Notice kind="error">
                <p className="font-medium">Il manque quelque chose avant d’enregistrer :</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </Notice>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
            {stepIdx > 0 ? (
              <button type="button" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} className={secondaryBtn}><ArrowLeft className="h-4 w-4" /> Retour</button>
            ) : (
              <button type="button" onClick={onCancel} disabled={saving} className={secondaryBtn}>Annuler</button>
            )}
            {!isLastStep ? (
              <button type="button" onClick={() => setStepIdx((i) => Math.min(flow.length - 1, i + 1))} className={primaryBtn}>Continuer <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {(isNew || !draft.enabled) && (
                  <button type="button" onClick={() => submit(false)} disabled={saving} className={secondaryBtn}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
                  </button>
                )}
                <button type="button" onClick={() => submit(isNew || !draft.enabled)} disabled={saving} className={primaryBtn}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {isNew || !draft.enabled ? 'Enregistrer et activer' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* ───────────── Aperçu + essai ───────────── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Aperçu et essai">
          <Card className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Essaie en direct</h3>
            <p className="text-xs text-slate-500">Écris ce que la personne écrirait : tu vois ce qu’elle recevrait. Rien n’est envoyé sur Instagram.</p>
            <label className="block text-xs font-medium text-slate-600">
              {isComment ? 'Commentaire de test' : t === 'story_mention' ? 'Mention de test' : 'Message de test'}
              {!isStoryMention && (
                <input
                  value={testText}
                  onChange={(e) => { setTestTouched(true); setTestText(e.target.value); }}
                  className={`${inputClass} mt-1`}
                  aria-label="Texte de test"
                />
              )}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-slate-600">
                Pseudo
                <input value={testUser} onChange={(e) => setTestUser(e.target.value.replace(/^@/, ''))} className={`${inputClass} mt-1`} aria-label="Pseudo de test" />
              </label>
              {!isComment && (
                <label className="block text-xs font-medium text-slate-600">
                  Prénom
                  <input value={testFirst} onChange={(e) => setTestFirst(e.target.value)} className={`${inputClass} mt-1`} aria-label="Prénom de test" />
                </label>
              )}
            </div>
            <p
              data-testid="sim-verdict"
              className={`rounded-lg px-3 py-2 text-xs font-medium ${sim.triggers ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
            >
              {sim.triggers ? sim.reason : `Ne se déclenche pas : ${sim.reason}`}
            </p>
          </Card>

          <PhonePreview
            triggerType={t}
            sim={sim}
            commentText={testText}
            username={testUser}
            accountName={accountName}
            linkLabels={cfg.dm.buttons.filter((b) => b.title.trim()).map((b) => b.title.trim())}
          />
        </aside>
      </div>

      {pickerOpen && <MediaPicker onPick={pick} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
