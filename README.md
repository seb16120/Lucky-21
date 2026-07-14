# Lucky 21

Prototype web local à deux joueurs d’un jeu de mémorisation et de déplacement.

Le plateau est brièvement visible au début de chaque round. Les tuiles sont ensuite cachées et les joueurs déplacent un pion commun pour récupérer, de mémoire, des tuiles permettant de former **21 avec exactement trois tuiles**.

## Lancer le jeu

Ouvrez simplement `index.html` dans un navigateur moderne.

Pour le publier avec GitHub Pages :

1. ouvrez **Settings → Pages** dans le dépôt ;
2. choisissez **Deploy from a branch** ;
3. sélectionnez la branche `main` et le dossier `/ (root)`.

## Règles intégrées

### Match et rounds

- Partie en **BO3** : le premier joueur à remporter deux rounds gagne le match.
- Un nouveau plateau est généré à chaque round.
- Le premier joueur à atteindre **4 points** remporte le round.
- Après un 21, le round continue sur le même plateau si personne n’a encore atteint 4 points.

### Mémorisation

- Les 49 tuiles d’une grille de 7 × 7 sont visibles pendant une durée réglable.
- Elles sont ensuite retournées face cachée.
- Le pion commun commence au centre du plateau.

### Déplacement

- À son tour, un joueur déplace le pion d’une case à la fois, horizontalement ou verticalement.
- Le déplacement normal est limité à **3 pas**.
- **Une fois par joueur et par round**, le joueur peut choisir un déplacement allant jusqu’à **5 pas**.
- Le premier déplacement du premier joueur d’un round est limité à un pas.
- Le pion ne peut pas terminer immédiatement sur la case depuis laquelle l’adversaire l’a déplacé au tour précédent.

### Tuiles et stockage

- Un joueur peut conserver jusqu’à **4 tuiles**.
- En terminant sur une case occupée, il peut prendre la tuile si son stockage n’est pas plein.
- En terminant sur une case vide, il peut y déposer l’une de ses tuiles.
- Lorsqu’il possède quatre tuiles sans pouvoir former 21, il doit donc atteindre une case vide et déposer une tuile avant d’en récupérer une autre.

### Marquer des points

Le joueur sélectionne exactement trois tuiles stockées dont la somme vaut 21 :

- combinaison ordinaire : **1 point** ;
- trois tuiles marquées d’un trèfle : **2 points** ;
- trois tuiles de valeur 7 : **2 points** ;
- une combinaison mêlant un 7 et seulement deux trèfles reste une combinaison ordinaire à **1 point**.

Les trois tuiles utilisées sont retirées du jeu. Une combinaison qui est à la fois « trois 7 » et « trois trèfles » rapporte 2 points, pas 4.

## Commandes

- Cliquez sur une case adjacente au pion, ou utilisez les flèches du clavier, pour avancer.
- Activez **Utiliser mon déplacement de 5** avant le premier pas du tour.
- Cliquez sur **Terminer le déplacement** lorsque la destination est atteinte.
- Sélectionnez des tuiles dans votre stockage pour valider un 21 ou en déposer une.

## État du prototype

La boucle de jeu locale est fonctionnelle : nouveau plateau, mémorisation, déplacements, bonus individuel de 5, prise et dépôt, stockage de quatre tuiles, détection des 21, score des rounds et BO3.

La composition exacte du paquet de 49 tuiles n’ayant pas encore été fixée, elle est provisoire et centralisée dans la fonction `createDeck()` de `script.js`. La durée de mémorisation est réglable sur l’écran de départ.
