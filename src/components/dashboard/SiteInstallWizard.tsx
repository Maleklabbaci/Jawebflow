/**
 * « Mettre la bulle sur mon site » en 3 étapes, sans jargon :
 *   ① Sur quoi est fait ton site ?   ② Copie ton code (et où le coller)   ③ Vérifie que ça marche
 *
 * Un seul code (la ligne <script> universelle) : plus d'onglets React / Next.js / PHP.
 */
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Instagram, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Stepper, type StepDef } from './Stepper';

export const SITE_PLATFORMS: Array<{ id: string; emoji: string; label: string; hint: string; where: string[] }> = [
  {
    id: 'shopify', emoji: '🛍️', label: 'Shopify', hint: 'Ma boutique est sur Shopify',
    where: [
      'Dans Shopify : « Boutique en ligne » puis « Thèmes ».',
      'Clique sur « ⋯ » puis « Modifier le code ».',
      'Ouvre le fichier « theme.liquid », colle le code juste avant </body>, puis « Enregistrer ».',
    ],
  },
  {
    id: 'wordpress', emoji: '📝', label: 'WordPress', hint: 'WordPress ou WooCommerce',
    where: [
      'Installe l’extension gratuite « WPCode » (Extensions → Ajouter).',
      'Ouvre « Code Snippets » → « Header & Footer » et colle le code dans la zone « Footer » (pied de page).',
      'Clique sur « Enregistrer » : la bulle apparaît sur toutes tes pages.',
    ],
  },
  {
    id: 'wix', emoji: '🧩', label: 'Wix', hint: 'Mon site est sur Wix',
    where: [
      'Dans Wix : « Paramètres » puis « Code personnalisé ».',
      'Clique sur « + Ajouter un code », colle-le, choisis « Toutes les pages » et « Fin de la balise Body ».',
      'Clique sur « Appliquer », puis publie ton site.',
    ],
  },
  {
    id: 'builder', emoji: '🎨', label: 'Autre créateur de site', hint: 'Webflow, Squarespace, Jimdo…',
    where: [
      'Dans les réglages de ton site, cherche « Code personnalisé », « Custom code » ou « Code injection ».',
      'Colle le code dans la zone « Pied de page » (Footer) de tout le site.',
      'Enregistre, puis publie ton site.',
    ],
  },
  {
    id: 'custom', emoji: '👨‍💻', label: 'Site sur mesure', hint: 'Fait par un développeur, ou je ne sais pas',
    where: [
      'Le plus simple : clique sur « Envoyer à mon webmaster » : l’e-mail est déjà écrit, il n’a qu’à coller le code.',
      'Si tu le fais toi-même : colle le code juste avant la balise </body> de tes pages.',
    ],
  },
];

const STEPS: StepDef[] = [
  { id: 'site', label: 'Ton site' },
  { id: 'code', label: 'Ton code' },
  { id: 'check', label: 'Vérification' },
];

const storageKey = (uid: string) => `jawebflow_site_installed_${uid || 'anon'}`;
const readInstalled = (uid: string) => {
  try { return localStorage.getItem(storageKey(uid)) === '1'; } catch { return false; }
};

export const SiteInstallWizard: React.FC<{
  /** La ligne <script> prête à coller. */
  scriptHtml: string;
  websiteUrl: string;
  userId: string;
  onGoTest: () => void;
  onGoInstagram: () => void;
}> = ({ scriptHtml, websiteUrl, userId, onGoTest, onGoInstagram }) => {
  const [installed, setInstalled] = useState(() => readInstalled(userId));
  const [step, setStep] = useState(0);
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [noBubble, setNoBubble] = useState(false);

  useEffect(() => { setInstalled(readInstalled(userId)); }, [userId]);

  const platform = SITE_PLATFORMS.find((p) => p.id === platformId) || null;
  const siteHref = (() => {
    const raw = (websiteUrl || '').trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  })();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scriptHtml);
      setCopied('ok');
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied('fail');
    }
  };

  const mailto = `mailto:?subject=${encodeURIComponent('Installation de notre assistant de discussion sur le site')}&body=${encodeURIComponent(
    `Bonjour,\n\nMerci d'ajouter ce code juste avant la balise </body> de toutes les pages de notre site. Il affiche notre assistant de discussion (une bulle en bas à droite).\n\n${scriptHtml}\n\nMerci !`,
  )}`;

  const markInstalled = () => {
    try { localStorage.setItem(storageKey(userId), '1'); } catch { /* stockage bloqué : sans gravité */ }
    setInstalled(true);
  };

  const restart = () => {
    try { localStorage.removeItem(storageKey(userId)); } catch { /* ignoré */ }
    setInstalled(false);
    setStep(0);
    setNoBubble(false);
  };

  // ── Terminé ────────────────────────────────────────────────────────────────
  if (installed) {
    return (
      <div className="space-y-5" data-testid="site-install-done">
        <div className="rounded-[28px] bg-white p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Check className="h-7 w-7" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold text-[#1b1647]">Ton assistant est sur ton site 🎉</h2>
              <p className="mt-1 text-sm text-slate-500">Tes visiteurs peuvent maintenant lui poser leurs questions, jour et nuit. Il te transmet les clients intéressés.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={onGoInstagram} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-purple-300 hover:shadow-md cursor-pointer">
              <Instagram className="h-5 w-5 text-pink-500" />
              <span><span className="block text-sm font-semibold text-slate-900">Connecter Instagram</span><span className="block text-xs text-slate-500">Il répond aussi à tes messages privés</span></span>
            </button>
            <button type="button" onClick={onGoTest} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-purple-300 hover:shadow-md cursor-pointer">
              <MessageSquare className="h-5 w-5 text-purple-600" />
              <span><span className="block text-sm font-semibold text-slate-900">Tester mon assistant</span><span className="block text-xs text-slate-500">Pose-lui une question</span></span>
            </button>
            {siteHref ? (
              <a href={siteHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-purple-300 hover:shadow-md">
                <ExternalLink className="h-5 w-5 text-slate-500" />
                <span><span className="block text-sm font-semibold text-slate-900">Ouvrir mon site</span><span className="block text-xs text-slate-500">Voir la bulle en vrai</span></span>
              </a>
            ) : null}
          </div>
          <button type="button" onClick={restart} className="mt-6 text-xs font-medium text-slate-400 underline underline-offset-2 hover:text-slate-700 cursor-pointer">
            Revoir les étapes (changer de site, recopier le code)
          </button>
        </div>
      </div>
    );
  }

  // ── Les 3 étapes ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" data-testid="site-install">
      <div className="rounded-[28px] bg-white p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[#1b1647]">Mettre ton assistant sur ton site</h2>
          <p className="mt-1 text-sm text-slate-500">3 étapes, environ 3 minutes. Pas besoin de savoir coder.</p>
        </div>

        <Stepper steps={STEPS} current={step} maxReachable={platform ? 2 : 0} onSelect={(i) => setStep(i)} />

        <div className="mt-8">
          {step === 0 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Sur quoi est fait ton site ?</h3>
              <p className="mt-1 text-sm text-slate-500">Choisis : on te dit exactement où coller le code.</p>
              <div role="radiogroup" aria-label="Type de site" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {SITE_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={platformId === p.id}
                    onClick={() => { setPlatformId(p.id); setStep(1); }}
                    className={`rounded-2xl border p-4 text-left transition hover:border-purple-300 hover:shadow-md cursor-pointer ${platformId === p.id ? 'border-purple-400 bg-purple-50/60' : 'border-slate-200 bg-white'}`}
                  >
                    <span className="text-2xl" aria-hidden>{p.emoji}</span>
                    <span className="mt-2 block text-sm font-semibold text-slate-900">{p.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{p.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && platform && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Copie ton code</h3>
              <p className="mt-1 text-sm text-slate-500">C’est une seule ligne magique : elle affiche ton assistant sur toutes les pages.</p>

              <pre className="mt-4 max-h-40 overflow-auto rounded-2xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-200" aria-label="Ton code"><code>{scriptHtml}</code></pre>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  id="install-copy"
                  onClick={copy}
                  className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-semibold text-white hover:bg-purple-700 cursor-pointer"
                >
                  {copied === 'ok' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === 'ok' ? 'Code copié !' : 'Copier le code'}
                </button>
                <a href={mailto} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-[#efe9ff] hover:text-[#6d28d9]">
                  <Send className="h-4 w-4" /> Envoyer à mon webmaster
                </a>
              </div>
              {copied === 'fail' && <p role="alert" className="mt-2 text-xs text-rose-600">La copie automatique n’a pas marché : sélectionne le code ci-dessus et copie-le (Ctrl + C).</p>}

              <div className="mt-6 rounded-2xl bg-[#f6f5fb] p-4">
                <p className="text-sm font-semibold text-slate-900">Où le coller ? <span className="font-normal text-slate-500">({platform.label})</span></p>
                <ol className="mt-3 space-y-2.5">
                  {platform.where.map((line, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-purple-600 shadow-sm">{i + 1}</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">
                  <ArrowLeft className="h-4 w-4" /> Retour
                </button>
                <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-semibold text-white hover:bg-purple-700 cursor-pointer">
                  J’ai collé le code <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Vérifie que ça marche</h3>
              <ol className="mt-3 space-y-2 text-sm text-slate-700">
                <li>1. Ouvre ton site et actualise la page (touches Ctrl + F5, ou tire la page vers le bas sur téléphone).</li>
                <li>2. Tu dois voir une <strong>bulle violette en bas à droite</strong>.</li>
                <li>3. Clique dessus et écris-lui un message pour l’essayer.</li>
              </ol>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {siteHref && (
                  <a href={siteHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-[#efe9ff] hover:text-[#6d28d9]">
                    <ExternalLink className="h-4 w-4" /> Ouvrir mon site
                  </a>
                )}
                <button type="button" onClick={onGoTest} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-[#efe9ff] hover:text-[#6d28d9] cursor-pointer">
                  <Sparkles className="h-4 w-4" /> Tester l’assistant ici
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Alors, tu la vois ?</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={markInstalled} className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-semibold text-white hover:bg-purple-700 cursor-pointer">
                    <Check className="h-4 w-4" /> Oui, je vois la bulle
                  </button>
                  <button type="button" onClick={() => setNoBubble((v) => !v)} aria-expanded={noBubble} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-200 cursor-pointer">
                    Non, je ne vois rien
                  </button>
                </div>
                {noBubble && (
                  <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-600" data-testid="no-bubble-help">
                    <li>Actualise la page en vidant le cache (Ctrl + Maj + R) ou ouvre ton site en navigation privée.</li>
                    <li>Vérifie que le code est bien collé <strong>juste avant</strong> la fin de la page ({'</body>'}) et que tu as <strong>enregistré / publié</strong> ton site.</li>
                    <li>Rien n’y fait ? <a href={mailto} className="font-semibold text-purple-700 underline">Envoie le code à ton webmaster</a>, il saura où le mettre.</li>
                  </ul>
                )}
              </div>

              <div className="mt-6">
                <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">
                  <ArrowLeft className="h-4 w-4" /> Retour au code
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
