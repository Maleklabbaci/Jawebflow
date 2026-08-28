# Vérification visuelle du dashboard

La capture automatisée de `/dashboard?preview=1` a affiché la navbar sombre de la landing, ce qui indique que le moteur de capture ne transmet pas le paramètre de query au routeur client. Le dashboard est donc à vérifier via une session authentifiée réelle ou via une route d’aperçu dédiée. La compilation, les tests et le build restent valides avant cette vérification.

## Vérification du runtime widget

Le runtime public a été chargé avec `data-theme="cyan"` et `data-position="bottom-left"`. La console a confirmé que l’élément widget existe, que sa position gauche vaut `20px`, et que le bouton reçoit la couleur `rgb(8, 145, 178)`, correspondant au thème cyan. Le script appelle désormais la mutation publique de comptage lors de l’envoi d’un message ; pour le compte Free testé, le serveur doit refuser l’appel avec le paywall.

## Vérification mobile

La route de prévisualisation développement `/dashboard-preview` a été capturée en 390×844. Le mode clair est conservé, la sidebar desktop devient une barre d’outils horizontale défilante, les quatre cartes de synthèse passent en grille deux colonnes, le formulaire reste lisible et le sélecteur de thème ainsi que le paywall restent accessibles.

## Formulaire rapide

Les captures desktop et mobile de `/dashboard-preview` confirment que le premier écran ne présente plus la base de connaissances ni l’upload de documents. Il contient uniquement le nom du business, l’activité, une présentation rapide et le thème/position de la bulle. La base de connaissances et les documents sont accessibles séparément depuis l’outil « Base de connaissances » de la sidebar.

## Persistance après reconnexion

La route authentifiée `/dashboard` a été ouverte avec la session existante. Le dashboard affiche le compte, les métriques, « Configuration enregistrée », le business `ivision agency`, le thème Violet et la position Bas droite. Le formulaire complet n’est pas affiché ; seule l’action « Modifier les informations » permet de le rouvrir. Le plan Free reste correctement verrouillé pour l’API/widget.

## Route create-assistant corrigée

Les captures desktop et mobile de `/create-assistant?preview=1` affichent directement le dashboard client clair avec sidebar/barre d’outils, formulaire rapide, métriques et paywall. L’ancien écran « Étape 01 / Étape 02 / Étape 03 » et la base de connaissances initiale ne sont plus rendus sur cette route. Sans prévisualisation et sans session, la route affiche uniquement la connexion ; avec une session valide, AppRoutes rend Dashboard.
