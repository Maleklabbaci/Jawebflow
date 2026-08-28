# Project TODO

- [x] Définir le modèle de données multi-tenant pour les bots et les connaissances, isolé par utilisateur.
- [x] Ajouter les procédures sécurisées de création, lecture et mise à jour de bot.
- [x] Ajouter la persistance des textes bruts et des métadonnées de fichiers de connaissances.
- [x] Préparer le stockage sécurisé des fichiers importés avec validation de type et de taille.
- [x] Créer l’expérience d’authentification par email et mot de passe via Supabase — reportée sur instruction de l’utilisateur, avec couche d’adaptation prête.
- [x] Créer la redirection protégée vers le dashboard après connexion.
- [x] Construire le dashboard marchand à formulaire unique avec le libellé « Nom du business ».
- [x] Ajouter le champ de textes de connaissances et l’import de fichiers associés au bot.
- [x] Générer un identifiant de bot individuel et le script widget immédiatement après enregistrement.
- [x] Ajouter une action accessible de copie du script widget.
- [x] Appliquer la direction artistique éditoriale onirique lavande, rose poudré et menthe pâle.
- [x] Écrire et exécuter des tests Vitest pour les procédures de bot et la génération du widget.
- [x] Vérifier l’interface desktop et mobile, puis créer un checkpoint de livraison.
- [x] Mettre en place une persistance locale de démonstration tant que les clés Supabase ne sont pas configurées.
- [x] Préparer un adaptateur de données remplaçable par Supabase Auth, Database et Storage ultérieurement.
- [x] Ajouter des tests Vitest pour workspace.saveBot, workspace.overview et workspace.getWidget, avec isolation par utilisateur, validation des fichiers et contenu du snippet.
- [x] Créer une couche d’adaptation effective pour Auth, Database et Storage afin de remplacer la démonstration locale par Supabase sans modifier les appels métier.
- [x] Reconcevoir la landing page avec une promesse commerciale plus directe, une démonstration de chatbot tangible et des appels à l’action mieux hiérarchisés.
- [x] Vérifier l’impact visuel de la landing page améliorée sur desktop et mobile, puis sauvegarder un checkpoint.
- [x] Transformer l’identité visuelle de JawebFlow en noir profond avec halos, lueurs et accents violet électrique.
- [x] Adapter la landing page, l’authentification et le dashboard au thème sombre en préservant les contrastes et l’accessibilité.
- [x] Vérifier la nouvelle direction noire et violette sur desktop et mobile, puis créer un checkpoint.
- [x] Vérifier visuellement le dashboard en thème noir et violet sur desktop et mobile, puis ajuster les contrastes nécessaires.
- [x] Remplacer les surcharges CSS globales fragiles par des styles ciblés et maintenables pour l’authentification et le dashboard.
- [x] Intégrer la vidéo fournie en arrière-plan silencieux du hero, avec une animation liée au défilement et une alternative respectant la réduction de mouvement.
- [x] Vérifier le rendu et les performances du hero vidéo sur desktop et mobile, puis créer un checkpoint.
- [x] Retirer la barre de navigation visible du hero afin que la vidéo occupe l’écran jusqu’en haut.
- [x] Rendre la carte d’assistant commercial plus translucide pour révéler davantage la vidéo en arrière-plan.
- [x] Remplacer la lecture automatique de la vidéo par un défilement synchronisé, avec montée du contenu durant le scroll.
- [x] Vérifier le nouveau hero immersif sur desktop et mobile, puis créer un checkpoint.
- [x] Fixer le fond vidéo pendant la séquence hero afin que le contenu monte au-dessus de la scène.
- [x] Lisser le scrubbing de la vidéo en interpolant le temps de lecture durant le scroll.
- [x] Vérifier la sensation de mouvement continu sur desktop et mobile, puis créer un checkpoint.
- [x] Diagnostiquer et corriger le chargement du média vidéo du hero sur la version publiée.
- [x] Ajouter un repli visuel fiable si la vidéo ne peut pas être chargée, puis vérifier le correctif et créer un checkpoint.
- [x] Extraire la scène vidéo en composant BackgroundVideo avec un hook de scrubbing lié au scroll.
- [x] Précharger explicitement le fichier vidéo du hero et conserver le fallback visuel en cas d’erreur.
- [x] Tester le composant BackgroundVideo et vérifier le hero publié, puis créer un checkpoint.
- [x] Ajouter un test ciblé pour le préchargement et le fallback de BackgroundVideo.
- [x] Vérifier le hero refactoré sur le domaine publié, puis créer un checkpoint final.
- [x] Corriger le champ de test conversationnel afin qu’un message comme « bonjour » ajoute un échange visible.
- [x] Ajouter et tester une réponse de démonstration sûre en attendant l’intégration réelle du moteur IA.
- [x] Analyser la référence fournie et relever uniquement les choix UX/UI du landing, du hero et du fond.
- [x] Adapter l’interface visuelle JawebFlow à cette référence sans copier son contenu ni ses fonctionnalités.
- [x] Vérifier la nouvelle direction visuelle sur desktop et mobile, puis créer un checkpoint.
- [x] Recomposer l’intégralité du landing JawebFlow selon la structure UX/UI de la référence : header, hero, démo, connaissances, parcours et CTA.
- [x] Reprendre le traitement complet du fond animé, des cartes verre fumé, de la navigation et des espacements de la référence sans importer son contenu métier.
- [x] Vérifier la fidélité desktop/mobile de la landing complète, puis créer un checkpoint.
- [x] Intégrer le logo fourni au header et au footer de la landing JawebFlow.
- [x] Garantir un rendu blanc net et constant du logo sur le fond noir-violet, puis vérifier et créer un checkpoint.

- [x] Inspecter le dépôt GitHub Maleklabbaci/JawebFlowx et identifier sa structure actuelle.
- [x] Comparer JawebFlowx avec le projet JawebFlow existant avant toute synchronisation.
- [x] Définir une stratégie de reprise sans écraser les fonctionnalités déjà validées.
- [x] Vérifier les prérequis d’authentification, de base de données et de secrets avant l’intégration.

- [x] Importer le frontend Vite/React/TypeScript de JawebFlowx sans reprendre son backend concurrent.
- [x] Préserver et exposer les procédures backend JawebFlow pour l’authentification, les bots, les connaissances et le widget.
- [x] Relier les écrans du frontend GitHub aux procédures tRPC sécurisées et aux sessions existantes.
- [x] Vérifier la fusion complète, les tests et le rendu, puis créer un checkpoint.

- [x] Vérifier explicitement et documenter les prérequis d’environnement avant fusion (auth, DATABASE_URL, secrets, mode fallback local).
- [x] Exposer dans l’UI importée la relecture du bot existant, des connaissances et du snippet via workspace.overview/getWidget après reconnexion.
- [x] Afficher les états d’erreur et de chargement dans les étapes authentifiées de CreateAssistantPage et terminer le câblage tRPC du parcours marchand.

- [x] Refaire une vérification visuelle après les dernières modifications de CreateAssistantPage et créer le checkpoint final.
- [x] Afficher les connaissances existantes et recharger le snippet via workspace.getWidget indépendamment de l’overview.
- [x] Démontrer le parcours marchand complet avec états loading/error/success puis revalider.

- [x] Vérifier que la table des utilisateurs JawebFlow est présente et synchronisée avec le schéma Drizzle.
- [x] Confirmer que register et login écrivent/lisent les comptes en base avec mot de passe hashé et session signée.
- [x] Vérifier le flux frontend d’inscription/connexion, les erreurs et la persistance de session.
- [x] Ajouter ou mettre à jour les tests d’authentification en base, puis valider et créer un checkpoint.

- [x] Vérifier la structure SQL complète de jawebflow_users contre le schéma Drizzle (colonnes, contraintes et index).
- [x] Tester dans le navigateur le parcours inscription, connexion, erreur et restauration de session.
- [x] Créer un checkpoint dédié après la validation finale du flux d’authentification persistant.

- [x] Ajouter le profil business obligatoire après connexion et bloquer la configuration tant que les informations essentielles sont absentes.
- [x] Ajouter un statut d’abonnement et protéger l’accès aux fonctions API/widget payantes.
- [x] Ajouter des métriques de messages et de consommation dans le dashboard client.
- [x] Ajouter une personnalisation persistante du thème de la bulle chatbot.
- [x] Tester le parcours client, les droits d’accès, les métriques et le thème, puis créer un checkpoint.

- [x] Ajouter une incrémentation réelle des messages consommés sur l’interaction chatbot/API.
- [x] Vérifier le dashboard connecté avec plan gratuit et le verrouillage du script/API.
- [x] Vérifier que le thème et la position choisis sont reflétés dans le snippet et le runtime widget.
- [x] Créer un checkpoint dédié après la validation finale du dashboard client étendu.

- [x] Séparer les routes publiques de landing des routes authentifiées du dashboard client.
- [x] Créer un layout dashboard en mode clair avec barre latérale responsive et identité JawebFlow.
- [x] Ajouter les entrées d’outils du compte : Vue d’ensemble, Assistant, Connaissances, Widget, Conversations, Statistiques, Abonnement et Paramètres.
- [x] Relier la navigation aux données workspace et conserver le paywall, les métriques et le thème widget.
- [x] Tester desktop/mobile et créer un checkpoint du dashboard séparé.

- [x] Donner un retour visuel aux outils secondaires du dashboard et relier l’entrée Abonnement à la page Pricing.

- [x] Relier `workspace.recordMessage` à un vrai point d’entrée du widget public et vérifier que messagesUsed augmente.
- [x] Tester bout-en-bout le choix thème/position avec un snippet généré puis le runtime widget chargé.
- [x] Créer le checkpoint final après ces validations.

- [x] Vérifier le dashboard séparé sur un viewport mobile et conserver une note de rendu.
- [x] Vérifier le chemin d’envoi widget autorisé et la remontée de messagesUsed via le contrat actif testé (la validation sur un compte réellement payé reste à effectuer après activation d’un abonnement).
- [x] Valider le flux choix thème/position → sauvegarde → snippet → rendu widget.
- [x] Créer le checkpoint après ces validations finales.

- [x] Charger automatiquement les informations déjà enregistrées au retour de l’utilisateur.
- [x] Éviter de réenregistrer le formulaire si aucune donnée n’a changé.
- [x] Afficher clairement l’état enregistré et permettre une modification volontaire.
- [x] Tester la reconnexion, la persistance et créer un checkpoint du correctif.

- [x] Réduire le premier formulaire aux informations rapides du business et de l’assistant.
- [x] Retirer les textes, uploads et documents du formulaire initial.
- [x] Déplacer la gestion Base de connaissances & Documents dans une vue dédiée de la sidebar.
- [x] Réutiliser les procédures workspace existantes dans cette vue dédiée et préserver l’enregistrement unique.
- [x] Tester le parcours rapide desktop/mobile et créer un checkpoint.

- [x] Faire pointer /create-assistant vers le dashboard client clair et son formulaire rapide.
- [x] Retirer de cette route l’ancien écran Étape 01/02/03 et la base de connaissances initiale.
- [x] Conserver l’accès Base de connaissances & Documents dans l’outil séparé de la sidebar.
- [x] Tester directement /create-assistant desktop/mobile et créer un checkpoint.

- [x] Vérifier /create-assistant en prévisualisation connectée sur desktop et mobile après suppression de l’ancien parcours.
- [x] Créer un checkpoint dédié après cette validation finale de route.

- [ ] Vérifier le remote et l’état du dépôt local JawebFlow avant synchronisation.
- [ ] Synchroniser la version finale vers Maleklabbaci/JawebFlowx sans inclure secrets ni artefacts de build.
- [ ] Vérifier le commit, la branche et les fichiers principaux sur GitHub.
- [ ] Livrer le lien du dépôt GitHub et le commit publié.
