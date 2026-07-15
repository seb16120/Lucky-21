# Lucky 21

Prototype web local à deux joueurs d’un jeu de mémorisation, de déplacement et d’addition.

Le plateau est visible au début de chaque round. Les tuiles sont ensuite cachées et les joueurs déplacent un pion commun pour récupérer, de mémoire, trois tuiles dont la somme vaut 21.

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

### Plateau et mémorisation

- La grille contient **49 tuiles**, disposées en 7 × 7.
- Les valeurs vont de **1 à 17**, avec trois exemplaires de chaque valeur avant la création du plateau.
- Deux exemplaires sont retirés aléatoirement à chaque nouveau round afin d’obtenir 49 tuiles.
- Le pion commun commence au centre. Pendant la mémorisation, il est réduit et placé dans un coin de la case afin de laisser visible la tuile centrale.

### Déplacement

- À son tour, un joueur déplace le pion d’une case à la fois, horizontalement ou verticalement.
- Le déplacement normal est limité à **3 pas**.
- **Une fois par joueur et par round**, le joueur peut choisir un déplacement allant jusqu’à **5 pas**.
- Le premier déplacement du premier joueur d’un round est limité à un pas.
- Le pion ne peut pas terminer immédiatement sur la case depuis laquelle l’adversaire l’a déplacé au tour précédent.
- Après au moins un pas, le joueur choisit directement son action :
  - **Entrée** : prendre la tuile atteinte ou commencer un dépôt sur une case vide ;
  - **Ctrl** : passer le tour.

### Tuiles et stockage

- Un joueur peut conserver jusqu’à **4 tuiles**.
- Sur une case occupée, Entrée prend immédiatement la tuile si le stockage n’est pas plein.
- Sur une case vide, Entrée ouvre le dépôt : le joueur sélectionne une tuile stockée, puis clique sur le bouton de dépôt ou appuie de nouveau sur Entrée.
- Lorsqu’il possède quatre tuiles sans pouvoir former 21, il doit atteindre une case vide et déposer une tuile avant d’en récupérer une autre.

### Marquer des points

Le joueur sélectionne exactement trois tuiles stockées dont la somme vaut 21 :

- combinaison ordinaire : **1 point** ;
- trois tuiles marquées d’un trèfle : **2 points** ;
- trois tuiles de valeur 7 : **2 points** ;
- une combinaison mêlant un 7 et seulement deux trèfles reste une combinaison ordinaire à **1 point**.

Les trois tuiles utilisées sont retirées du jeu. Une combinaison qui est à la fois « trois 7 » et « trois trèfles » rapporte 2 points, pas 4.

## Commandes

- **Flèches du clavier** ou clic sur une case adjacente : déplacer le pion.
- **Entrée** après au moins un déplacement : agir sur la case atteinte.
- **Ctrl** après au moins un déplacement : passer le tour.
- Le déplacement de 5 doit être activé avant le premier pas du tour.

## État du prototype

La boucle de jeu locale est fonctionnelle : nouveau plateau, mémorisation, déplacements, bonus individuel de 5, prise et dépôt, stockage de quatre tuiles, détection des 21, score des rounds et BO3.

La répartition exacte des tuiles trèfle reste provisoire et est centralisée dans `createDeck()` dans `script.js`.
