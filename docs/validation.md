# Validation de l’interface JawebFlow

La page d’entrée et le dashboard ont été vérifiés sur écran desktop et mobile. La hiérarchie éditoriale, le fond noir profond, les halos violet électrique, les repères géométriques, le contraste des textes et la lisibilité des appels à l’action sont présents aux deux formats. Le dashboard conserve le formulaire à une étape, l’import, le widget copiable et une mise en page sans débordement horizontal sur mobile. Le parcours métier est couvert par les tests Vitest ; l’authentification Supabase réelle reste volontairement différée, conformément à la demande de ne pas configurer les clés dans cette étape.

La vidéo de fond du hero a été vérifiée sur desktop et mobile. Elle se lance en boucle sans son ni contrôles, reste atténuée par un voile violet/noir et conserve la lisibilité du contenu. Son déplacement et son opacité réagissent au défilement ; la lecture et le mouvement sont neutralisés lorsque le navigateur indique une préférence de réduction de mouvement.

La vérification navigateur confirme un média de 8 secondes en 1920 × 1080, en lecture automatique, muette, en boucle, sans contrôles et chargé avec `preload="metadata"`. L’état de lecture et le rendu desktop/mobile n’ont pas présenté de régression visible.

Après la refonte du hero, la vérification navigateur confirme que la vidéo reste arrêtée à l’ouverture (`currentTime: 0`, `paused: true`). À mi-hauteur de scroll, elle atteint environ 5,3 secondes tout en restant arrêtée, et le contenu du hero est translaté vers le haut d’environ 37 pixels. Le média est ainsi exclusivement piloté par le défilement.

Le hero immersif a été vérifié sur desktop et mobile. La barre de navigation a été retirée, permettant au fond vidéo d’occuper le haut de l’écran. La carte de conversation est désormais translucide, le média reste visible en arrière-plan et le contenu se déplace vers le haut pendant le défilement.

La scène vidéo fixe a été contrôlée dans le navigateur. La vidéo reste à l’écran (`position: fixed`, sommet à 0) lorsque le contenu défile. Après un mouvement de scroll, les temps observés progressent graduellement de 0,370 s à 1,547 s sur cinq images d’animation, tout en restant en pause : le rendu est donc interpolé et piloté exclusivement par le scroll.

Le contraste de la scène vidéo a été relevé : le voile noir est moins dense, la carte d’assistant est plus transparente et le sujet de la vidéo demeure nettement visible derrière l’interface. Le gradient violet/noir de la page reste disponible comme repli visuel si le média n’est pas accessible.

Le mécanisme de repli a été testé en simulant un événement d’erreur sur le média. La scène a immédiatement basculé vers l’état `hero-video-stage--fallback`, qui conserve une composition abstraite violet/noir et ne laisse aucun fond vide.

Le composant `BackgroundVideo` porte désormais le hook de scrubbing et le préchargement du média. Le navigateur confirme un média disponible (`readyState: 4`), un fond en position fixe et le préchargement anticipé de la vidéo. La logique de préchargement programme également la vidéo tout en dédupliquant la balise déjà présente dans l’en-tête HTML.

La carte de démonstration conversationnelle a été testée dans le navigateur. La saisie de « bonjour » est ajoutée comme message utilisateur, puis l’assistant répond visiblement : « Salam ! Je peux vous renseigner sur les produits, les prix et la livraison. Quel produit souhaitez-vous découvrir ? ».

Après le checkpoint, le domaine publié affichait encore temporairement l’ancien libellé du champ de test. Une vérification sans cache est nécessaire avant de considérer la propagation de la nouvelle version comme terminée.

La référence visuelle fournie a été analysée uniquement pour son langage UX/UI : fond noir profond, halo violet-fuchsia, cartes en verre fumé, titre sans-serif sculptural, bouton dégradé et marqueurs de surface. Ces codes ont été appliqués au landing JawebFlow sans importer le contenu ni les fonctionnalités de la référence. Le rendu a été vérifié sur desktop et mobile ; l’échelle du titre desktop a été réduite pour préserver l’équilibre entre message et carte conversationnelle.

La première consultation du domaine publié après le checkpoint de refonte continue de retourner le bundle précédent : le sélecteur `hero-title` et la règle de progression violette ne sont pas présents, tandis que l’ancien fond est encore actif. La version sauvegardée est correcte dans l’aperçu ; la diffusion publique requiert donc une nouvelle vérification de propagation avant validation finale.

La propagation a finalement été confirmée sur le domaine publié : le nouveau bundle expose la classe `hero-title`, le champ « Testez : bonjour » est visible et l’interface affiche la direction noir-violet, les cartes fumées et la hiérarchie typographique adaptée à la référence.

La landing a ensuite été recomposée sur la structure complète de la référence : header fixe et transparent, hero de conversion, carte de démonstration interactive, section de connaissances, trois étapes, aperçu de widget et CTA final. La version JawebFlow conserve son propre contenu et ses interactions. Les captures full-page desktop et mobile confirment la cohérence de la navigation, des espacements, des cartes verre fumé et de la direction noir-violet.

La version recomposée a été ouverte dans l’aperçu et le test conversationnel a été déclenché avec le message « bonjour ». Une vérification différée de l’apparition de la réponse est menée afin de confirmer la conservation de l’interaction dans la nouvelle carte.

La vérification différée est réussie : après sélection de l’exemple « Bonjour » puis envoi, la carte affiche le message utilisateur et la réponse de démonstration. La landing entière reprend désormais le rythme de référence — header, hero, fond animé, carte de conversation, base de connaissances, parcours et CTA — tout en conservant les textes et les actions JawebFlow.

Le diagnostic de la version publiée confirme que le média est présent, décodable et chargé sans erreur (`readyState: 4`, 1920 × 1080, 8 secondes). Au scroll, son temps passe successivement de 0,386 s à 2,270 s sans lecture autonome. L’anomalie perçue provient donc de son contraste trop faible derrière les voiles sombres et la carte, qui doit être allégé pour rendre le mouvement plus perceptible.
