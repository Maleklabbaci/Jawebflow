/**
 * JAWEBFLOW — ÉCRAN « CONFIGURATION MANQUANTE »
 * ============================================================================
 * Affiché tant que `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` n'ont pas été
 * fournies **à la construction**.
 *
 * Pourquoi un écran et pas un plantage : avant, le site affichait une page
 * blanche et une erreur technique dans la console. Personne ne pouvait deviner
 * quoi faire. Ici, la cause et les deux corrections possibles sont écrites en
 * clair, à l'écran — donc visibles même pour quelqu'un qui n'ouvre pas la
 * console du navigateur.
 *
 * Cet écran n'apparaît JAMAIS sur un site correctement configuré.
 */

import type { CSSProperties } from 'react';

export function ConfigMissing() {
  const wrap: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#08070f',
    color: '#f5f3ff',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  };
  const card: CSSProperties = {
    maxWidth: '680px',
    width: '100%',
    background: '#15132a',
    border: '1px solid #2f2a55',
    borderRadius: '20px',
    padding: '28px',
    lineHeight: 1.6,
  };
  const code: CSSProperties = {
    display: 'block',
    background: '#0d0b1c',
    border: '1px solid #2f2a55',
    borderRadius: '10px',
    padding: '12px 14px',
    margin: '8px 0 4px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '13px',
    overflowX: 'auto',
  };
  const h2: CSSProperties = { fontSize: '15px', fontWeight: 700, margin: '22px 0 6px', color: '#fff' };

  return (
    <div style={wrap} data-testid="config-missing">
      <div style={card}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>
          JawebFlow — le site n’est pas encore configuré
        </h1>
        <p style={{ marginTop: '10px', color: '#c7c2e8' }}>
          L’assistant ne peut joindre sa base de données, donc rien ne fonctionne pour l’instant.
          <strong> Ce n’est pas une panne : il manque deux informations.</strong>
        </p>

        <h2 style={h2}>Pourquoi maintenant ?</h2>
        <p style={{ margin: 0, color: '#c7c2e8' }}>
          Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> sont
          injectées dans le site <strong>au moment de sa construction</strong>. Les définir dans
          Cloudflare ne suffit pas si la construction a été faite ailleurs (sur ta machine, ou par
          GitHub).
        </p>

        <h2 style={h2}>Correction A — tu construis sur ta machine</h2>
        <p style={{ margin: 0, color: '#c7c2e8' }}>
          Crée un fichier <code>.env</code> à la racine du projet (copie de <code>.env.example</code>) :
        </p>
        <code style={code}>
          VITE_SUPABASE_URL=https://xxxxx.supabase.co
          <br />
          VITE_SUPABASE_ANON_KEY=eyJ...
        </code>
        <p style={{ margin: '4px 0 0', color: '#8f89b8', fontSize: '13px' }}>
          Les deux valeurs sont dans Supabase → <em>Project Settings</em> → <em>API</em>.
        </p>

        <h2 style={h2}>Correction B — la construction est faite par Cloudflare</h2>
        <p style={{ margin: 0, color: '#c7c2e8' }}>
          Cloudflare → <em>Workers &amp; Pages</em> → projet <strong>jawebflow</strong> →{' '}
          <em>Settings</em> → <em>Environment variables</em> : ajoute ces deux variables, puis{' '}
          <strong>relance un déploiement</strong> (une variable ajoutée ne s’applique qu’à la
          construction suivante).
        </p>

        <p style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #2f2a55', color: '#8f89b8', fontSize: '13px' }}>
          Marche à suivre détaillée : <code>docs/DEPLOIEMENT.md</code>. Si tu es un visiteur,
          signale-le au propriétaire du site.
        </p>
      </div>
    </div>
  );
}
