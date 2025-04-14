# Guide de Structure et d'Architecture du Code

## Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons, captures d'écran)
├── controllers/     # Logique de contrôle, gestion des états et interactions
├── models/         # Représentation des données et de l'état (fusée, univers, etc.)
├── views/          # Rendu visuel des modèles sur le canvas
├── constants.js    # Constantes globales (physique, rendu, configuration fusée)
├── main.js         # Point d'entrée : Initialisation de l'application et des composants
├── index.html      # Structure HTML, chargement des librairies et scripts
├── README.md       # Informations générales sur le projet
└── favicon.png     # Icône du site
```

## Architecture Globale (MVC étendu & EventBus)

Le projet suit une architecture inspirée du Modèle-Vue-Contrôleur (MVC), étendue pour gérer la complexité d'une simulation physique en temps réel.

-   **Modèles (`models/`)**: Contiennent l'état pur des objets (position, vitesse, fuel, santé, etc.). Ils ne contiennent pas de logique de jeu complexe ni de physique directe.
-   **Vues (`views/`)**: Responsables du dessin des modèles sur le canvas (`<canvas>`). Elles lisent l'état des modèles mais ne les modifient pas directement.
-   **Contrôleurs (`controllers/`)**: Orchestrent l'application. Ils gèrent les entrées utilisateur (`InputController`), la logique de jeu principale (`GameController`), le moteur physique (`PhysicsController`), le rendu (`RenderingController`), la communication (`EventBus`), et la synchronisation entre l'état logique (modèles) et l'état physique (moteur Matter.js) (`SynchronizationManager`).

**`EventBus.js`** est la pierre angulaire de la communication découplée entre les différents modules. Au lieu d'appels directs, les composants émettent des événements (ex: `INPUT_KEYDOWN`, `ROCKET_STATE_UPDATED`) et d'autres composants s'abonnent à ces événements pour réagir en conséquence. Cela permet une grande modularité et facilite l'ajout ou la modification de fonctionnalités.

## Gestion de la Physique (Matter.js)

La simulation physique est gérée par la bibliothèque **Matter.js**, étendue avec le plugin **Matter-Attractors** pour simuler la gravité.

-   **`PhysicsController.js`**: Initialise et gère le moteur Matter.js (`this.engine`). Il crée les corps physiques (`Matter.Body`) correspondant aux modèles logiques (fusée, corps célestes) via `BodyFactory.js`. Il contient la boucle de mise à jour du moteur physique (`Engine.update`).
-   **`BodyFactory.js`**: Centralise la création des corps physiques Matter.js pour la fusée et les corps célestes, en appliquant les propriétés définies dans `constants.js` et les modèles.
-   **`CollisionHandler.js`**: Utilise les événements de collision de Matter.js (`collisionStart`, `collisionActive`, `collisionEnd`) pour détecter les impacts, calculer les dégâts, gérer l'état d'atterrissage (`isLanded`), et déclencher les sons appropriés.
-   **`ThrusterPhysics.js`**: Applique les forces des propulseurs au corps physique de la fusée (`Matter.Body.applyForce`) en fonction de l'état du `RocketModel` et gère la stabilisation de la rotation (contrôles assistés).
-   **Gravité**: La gravité est simulée par le plugin `MatterAttractors`, configuré dans `BodyFactory.js` pour chaque corps céleste.

## Synchronisation Modèle/Physique

Un défi majeur dans les simulations physiques est de maintenir la cohérence entre l'état logique (modèles) et l'état simulé par le moteur physique.

-   **`SynchronizationManager.js`**: Ce contrôleur est **crucial**. Il assure la synchronisation bidirectionnelle :
    -   `syncModelWithPhysics()`: Met à jour le `RocketModel` avec les données (position, vitesse, angle) du `rocketBody` physique après une étape de simulation Matter.js.
    -   `syncPhysicsWithModel()`: Force l'état du `rocketBody` physique à correspondre à celui du `RocketModel` (utilisé pour la réinitialisation ou des ajustements manuels).
    -   `handleLandedOrAttachedRocket()`: Logique complexe pour stabiliser la fusée lorsqu'elle est posée (`isLanded`) ou détruite et attachée à un corps céleste. Il gère le suivi de la position et de la vélocité du corps parent (ex: Lune orbitant la Terre) et force l'état physique de la fusée pour éviter les instabilités.
    -   `syncMovingBodyPositions()`: S'assure que les positions des corps célestes physiques (qui peuvent orbiter) correspondent à leurs positions calculées dans les modèles logiques.

## Boucle de Jeu Principale (`GameController.js`)

`GameController.js` est le chef d'orchestre de l'application.

1.  **Initialisation (`init`)**: Crée les modèles, les vues, les contrôleurs (y compris `PhysicsController`), configure la caméra, et démarre la boucle de jeu.
2.  **Boucle de Jeu (`gameLoop`)**: Appelée à chaque frame (`requestAnimationFrame`).
    -   Calcule le `deltaTime`.
    -   Met à jour l'état de l'univers (orbites des planètes dans `UniverseModel.update`).
    -   Met à jour le système de particules (`ParticleController.update`).
    -   Appelle `physicsController.update(deltaTime)` pour exécuter une étape de simulation physique (incluant application des forces, détection des collisions, et mise à jour des positions/vitesses physiques).
    -   Appelle `synchronizationManager.syncModelWithPhysics()` (si nécessaire) pour mettre à jour le modèle logique de la fusée.
    -   Met à jour l'IA de la fusée (`RocketAgent.update`).
    -   Met à jour la trace de la fusée (`TraceView.addTracePoint`).
    -   Met à jour l'état des missions (`MissionManager.update`).
    -   Prépare les états pour le rendu (`RenderingController.update...State`).
    -   Appelle `renderingController.render()` pour dessiner tous les éléments (fond, étoiles, planètes, fusée, particules, UI) sur le canvas.
3.  **Gestion des Entrées**: Réagit aux événements d'entrée (`handleKeyDown`, `handleKeyUp`, etc.) transmis par `InputController` via l'EventBus, modifiant l'état des modèles (ex: activation des propulseurs dans `RocketModel`).
4.  **Gestion d'État**: Gère la pause (`isPaused`), la réinitialisation (`resetRocket`), le centrage de la caméra, etc.

## Description Détaillée des Composants

### Contrôleurs
- `GameController.js` (1197 lignes) : Orchestre principal, boucle de jeu, gestion état global, initialisation.
- `InputController.js` (226 lignes -> ~300 lignes) : Capture les entrées clavier/souris/tactile **et joystick (Gamepad API)** et les publie sur l'EventBus.
- `RenderingController.js` (204 lignes) : Reçoit les états des modèles via EventBus et coordonne les différentes vues pour le rendu final.
- `PhysicsController.js` (237 lignes) : Gère le moteur Matter.js, la création des corps, et la mise à jour de la simulation physique. Délégué la logique spécifique à d'autres contrôleurs (BodyFactory, CollisionHandler, ThrusterPhysics, SynchronizationManager).
- `SynchronizationManager.js` (286 lignes) : ** essentiel ** Synchronise l'état entre les modèles logiques et les corps physiques Matter.js. Gère la stabilisation de la fusée posée/attachée.
- `ThrusterPhysics.js` (282 lignes) : Calcule et applique les forces des propulseurs au corps physique. Gère la stabilisation (contrôles assistés).
- `CollisionHandler.js` (289 lignes) : Détecte et gère les collisions physiques via les événements Matter.js.
- `BodyFactory.js` (81 lignes) : Crée les objets physiques Matter.js (fusée, planètes) avec leurs propriétés.
- `EventBus.js` (43 lignes) : Système de messagerie Publish/Subscribe pour découpler les composants.
- `ParticleController.js` (185 lignes) : Gère la logique de mise à jour des systèmes de particules (propulsion, débris).
- `RocketAgent.js` (587 lignes) : Implémente l'IA (optionnelle) pour contrôler la fusée (peut-être basé sur TensorFlow.js).
- `MissionManager.js` (173 lignes) : Gère la logique des missions (objectifs, statut, récompenses).
- `RocketCargo.js` (114 lignes) : Gère l'inventaire de la cargaison de la fusée.
- `PhysicsVectors.js` (221 lignes) : (Optionnel) Gère l'affichage des vecteurs de force pour le débogage.

### Modèles
- `RocketModel.js` (292 lignes) : État logique de la fusée (position, vitesse, fuel, santé, état des propulseurs, état d'atterrissage/destruction, cargo).
- `CelestialBodyModel.js` (95 lignes) : État logique d'un corps céleste (position, masse, rayon, relation parent/enfant pour orbite).
- `UniverseModel.js` (104 lignes) : Contient la collection des corps célestes et la logique de mise à jour de leurs orbites.
- `ParticleSystemModel.js` (138 lignes) : Gère l'état des émetteurs de particules et des particules individuelles (débris).
- `CameraModel.js` (88 lignes) : Gère l'état de la caméra (position, zoom, cible).
- `ParticleModel.js` (63 lignes) : État d'une particule individuelle.

### Vues
- `RocketView.js` (549 lignes) : Dessine la fusée et ses états (propulseurs).
- `UniverseView.js` (171 lignes) : Dessine le fond, les étoiles, et coordonne le dessin des corps célestes.
- `CelestialBodyView.js` (122 lignes) : Dessine un corps céleste individuel.
- `UIView.js` (583 lignes) : Dessine l'interface utilisateur (infos fusée, missions, cargo, messages).
- `TraceView.js` (111 lignes) : Dessine la trajectoire de la fusée.
- `ParticleView.js` (96 lignes) : Dessine les particules.

## Points d'Entrée Importants
- `main.js` (96 lignes) : Initialisation globale.
- `index.html` (238 lignes) : Chargement des scripts dans le bon ordre, configuration initiale.
- `GameController.js` (1197 lignes) : Boucle de jeu (`gameLoop`), gestion des états principaux.
- `EventBus.js` (43 lignes) : Comprendre les événements échangés est clé pour suivre le flux d'information.
- `PhysicsController.js` (237 lignes) & `SynchronizationManager.js` (286 lignes) : Clés pour comprendre l'interaction avec le moteur physique.

## Notes Importantes

-   **Absence d'imports JS** : Tous les scripts sont chargés globalement via des balises `<script>` dans `index.html`. L'ordre de chargement est donc crucial.
-   **Erreur Matter.js/Attractors**: L'avertissement de compatibilité entre Matter.js et Matter-Attractors peut être ignoré ; ils fonctionnent ensemble dans ce projet.
-   **EventBus** : Comprendre les événements émis et écoutés par chaque composant est essentiel pour déboguer ou ajouter des fonctionnalités.
-   **Doublons**: Il serait judicieux de vérifier la présence éventuelle de fichiers dupliqués ou redondants afin de nettoyer la base de code.
-   **Code commenté**: Le code contient des commentaires et des `console.log` utiles pour le débogage.
 - Utilise https://hardwaretester.com/gamepad pour aider à l'identification des axes et des boutons du gamepad.