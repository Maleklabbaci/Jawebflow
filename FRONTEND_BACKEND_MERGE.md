# Fusion frontend/backend JawebFlow

La fusion conserve le frontend Vite/React/TypeScript de `Maleklabbaci/JawebFlowx` dans `client/src`, sans importer son backend concurrent. Le shell React reste enveloppé par le provider tRPC existant et la session locale remplaçable.

## Contrat runtime vérifié

| Élément | État | Utilisation |
|---|---|---|
| `DATABASE_URL` | Présent dans l’environnement de développement | Connexion Drizzle/MySQL/TiDB |
| `JWT_SECRET` | Présent | Signature des sessions locales |
| `OAUTH_SERVER_URL` | Présent | Infrastructure OAuth existante |
| `BUILT_IN_FORGE_API_URL` et `BUILT_IN_FORGE_API_KEY` | Présents | Services intégrés du backend |
| `VITE_OAUTH_PORTAL_URL` | Présent | Portail OAuth côté client |
| Adaptateur local | Actif | Authentification de démonstration remplaçable par Supabase |

## Parcours relié

`CreateAssistantPage` utilise `auth.login` et `auth.register`, recharge `workspace.overview` après reconnexion, puis appelle `workspace.saveBot` avec le nom du business, les connaissances textuelles et les fichiers texte encodés en base64. Le script retourné par le serveur est ensuite affiché et copiable. Les validations de taille, de type et d’isolation utilisateur restent côté serveur.

Le frontend conserve la direction artistique importée de JawebFlowx. Le composant `BackgroundVideo` validé par JawebFlow a été conservé pour maintenir le préchargement, le fallback et le scrubbing synchronisé au scroll.

## Authentification persistante

L’inscription normalise l’email, vérifie l’unicité en base, génère un hash `scrypt` salé et insère l’utilisateur dans `jawebflow_users`. La connexion relit ensuite ce compte, vérifie le hash avec une comparaison résistante au timing et émet un JWT signé par `JWT_SECRET`. Le frontend conserve uniquement le jeton de session nécessaire au rechargement du workspace ; le mot de passe ne quitte jamais le serveur et n’est jamais stocké en clair.

La présence des tables `jawebflow_users`, `bots` et `knowledge_items` a été vérifiée sur la base active. Les tests de persistance couvrent la normalisation de l’email, l’écriture du hash et l’authentification avec mauvais mot de passe.

## Validation du parcours navigateur

L’écran `/create-assistant` a été ouvert dans le navigateur. Le mode inscription expose bien le nom complet, le nom du business, l’email, le mot de passe et sa confirmation. Un login invalide affiche correctement « Email ou mot de passe incorrect. ». Le succès d’inscription et de connexion est couvert par les tests de persistance serveur ; aucune fausse donnée client n’a été créée dans la base active pour réaliser un test manuel. Après un succès réel, `LocalSessionContext` relit le token conservé, appelle `auth.me`, supprime le token s’il est invalide et restaure l’utilisateur si la session est encore valide.

## Dashboard client clair

Les routes publiques conservent la landing sombre et vidéo. Lorsqu’une session valide est présente sur `/dashboard` ou `/create-assistant`, le shell public est remplacé par `Dashboard`, un espace clair réservé au marchand. Sa sidebar contient la vue d’ensemble, l’assistant, la base de connaissances, le widget, les conversations, les statistiques, l’abonnement et les paramètres ; les vues secondaires indiquent explicitement leur état lorsqu’elles ne sont pas encore développées.

Le plan `free` peut enregistrer une configuration, mais `getWidget`, `recordMessage` et `recordWidgetMessage` refusent l’usage API/widget tant que `subscriptionStatus` n’est pas `active`. Le compteur `messagesUsed` est incrémenté atomiquement par le backend après un message widget accepté. Le runtime public applique `data-theme` et `data-position` à la bulle et appelle `workspace.recordWidgetMessage` à l’envoi.
