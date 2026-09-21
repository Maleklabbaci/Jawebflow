/**
 * JAWEBFLOW — Webhook Instagram Direct (alias historique).
 *
 * L'URL `/api/instagram/webhook` a été utilisée lors des premiers essais
 * d'abonnement côté Meta. On la conserve, mais elle délègue désormais à la
 * MÊME implémentation que `/api/webhook/instagram` : une seule logique, donc
 * la base de connaissances de l'entreprise et le système de collecte des
 * messages sont bien utilisés dans les deux cas.
 */

export { onRequestGet, onRequestPost, onRequestOptions } from "../webhook/instagram.ts";
