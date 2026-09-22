# Migration JawebFlow vers Supabase

## Décision d’architecture

Supabase devient la base principale pour les assistants, les documents de connaissance, les conversations et les prospects. Firebase Auth reste temporairement l’identité des utilisateurs afin de ne pas invalider les comptes existants. Les Cloudflare Pages Functions utilisent exclusivement `SUPABASE_SERVICE_ROLE_KEY`, qui ne doit jamais être exposée au navigateur.

## Variables à configurer dans Cloudflare Pages

```text
SUPABASE_URL=https://laxscpofkjcsnbigsupg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé service_role Supabase, à récupérer dans Project Settings > API>
GEMINI_API_KEY=<clé Gemini>
FIRESTORE_API_KEY=<temporaire, uniquement pour vérifier les tokens Firebase>
```

La clé publishable fournie par l’utilisateur peut servir au frontend plus tard, mais elle ne remplace pas la clé `service_role` pour le backend. Elle ne doit pas être utilisée pour contourner RLS.

## Déploiement

1. Exécuter `supabase/schema.sql` dans Supabase SQL Editor.
2. Ajouter les variables ci-dessus à Cloudflare Pages, Preview et Production.
3. Déployer avec `npm run deploy:cloudflare`.
4. Vérifier `GET /api/health`, puis lancer un scan sur un assistant de test.
5. Garder Firestore en lecture seule pendant la période de vérification, puis exporter les anciennes collections et retirer les variables Firebase une fois les données validées.

## Limite du scanner

Aucun crawler ne peut garantir « tous les détails de tout type de site ». Cette version doit limiter l’exploration à un budget contrôlé (sitemap, liens internes autorisés, profondeur et taille), extraire le texte réellement visible, les données JSON-LD, les prix, contacts et liens, puis conserver l’URL source de chaque information. Les sites rendus uniquement en JavaScript, protégés par login, robots.txt, CAPTCHA ou paywall nécessitent une intégration spécifique.
