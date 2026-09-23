#!/usr/bin/env node
/**
 * JAWEBFLOW — BANC DE TEST COÛT/QUALITÉ IA
 * ----------------------------------------
 * Tire 8 messages types sur le VRAI bot en production (endpoint /api/chat)
 * et affiche : tokens consommés (renvoyés par le serveur), temps, réponses.
 *
 * UTILISATION :
 *   node scripts/bench-ia.mjs https://jawebflow.pages.dev <assistantId>
 *
 * → assistantId = l'id du bot à tester (dashboard → « Mettre sur mon site » :
 *   c'est la valeur de data-assistant-id dans le snippet).
 * Total attendu : exactement 1 conversation comptée (règle 1 conv = 8 messages).
 */

const BASE = process.argv[2] || 'https://jawebflow.pages.dev';
const ASSISTANT = process.argv[3];
if (!ASSISTANT) { console.error('Usage : node scripts/bench-ia.mjs <baseUrl> <assistantId>'); process.exit(1); }

const sessionId = 'bench_' + Date.now().toString(36);
const CASES = [
  { label: 'Salutation (doit être GRATUIT)', msg: 'salam' },
  { label: 'Salutation 2 (gratuit)', msg: 'bonjour' },
  { label: 'Intention vague', msg: 'je veux celle-là' },
  { label: 'Question produit', msg: 'vous vendez quoi exactement ?' },
  { label: 'Question précise', msg: "c'est combien le prix ? vous livrez ?" },
  { label: 'Donne son nom', msg: "je m'appelle TestBench" },
  { label: 'Demande contact', msg: 'et votre numéro de téléphone ?' },
  { label: 'Salutation finale (gratuit)', msg: 'merci, c est bon' },
];

const PRICE_IN = 0.25, PRICE_OUT = 1.5;
let totIn = 0, totOut = 0, totUnits = 0, n = 0;
console.log(`\n🧪 BANC DE TEST — ${BASE}\n🤖 assistant=${ASSISTANT}\n⏱  ${new Date().toLocaleString('fr-FR')}\n`);

for (const c of CASES) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantId: ASSISTANT, message: c.msg, sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - t0;
    const u = data.usage || {};
    const cached = u.skipped === 'smalltalk';
    totIn += Number(u.promptTokens || 0); totOut += Number(u.outputTokens || 0); totUnits += Number(u.weight || (u.skipped ? 0 : 1)); n++;
    const cost = (Number(u.promptTokens || 0) / 1e6 * PRICE_IN) + (Number(u.outputTokens || 0) / 1e6 * PRICE_OUT);
    console.log(`• ${c.msg}`);
    console.log(`  ${cached ? '🆓 SANS IA (politesse, 0 unité)' : `🤖 ${u.model || '?'} · in=${u.promptTokens ?? '?'} out=${u.outputTokens ?? '?'} · ~$${cost.toFixed(5)} · jauge +${u.weight ?? 1} unité(s)`} · ${ms} ms`);
    console.log(`  ↳ ${String(data.text || '').slice(0, 110).replace(/\n/g, ' ')}\n`);
    await new Promise(r => setTimeout(r, 1500));
  } catch (e) {
    console.log(`• ${c.msg} → ERREUR ${e.message}\n`);
  }
}

const cost = (totIn / 1e6 * PRICE_IN) + (totOut / 1e6 * PRICE_OUT);
console.log('──────────────────────────────');
console.log(`TOTAL : ${n} messages · tokens in=${totIn} out=${totOut}`);
console.log(`COÛT Gemini estimé : $${cost.toFixed(4)} (≈ ${(cost * 135).toFixed(2)} DA)`);
console.log(`Coût par CONVERSATION (8 messages) ×1000 → $${(cost * 1000).toFixed(2)}`);
console.log(`Jauge du client : +${totUnits} unité(s) = ${Math.ceil(totUnits / 8)} conversation(s) sur 1000`);
