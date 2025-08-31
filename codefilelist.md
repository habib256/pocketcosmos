# Hub d'Architecture de PocketCosmos pour l'IA

Ce document est votre guide central pour comprendre, naviguer et contribuer efficacement à la base de code de PocketCosmos. Il est conçu pour vous donner rapidement les clés de l'architecture, des flux de données et des conventions du projet.

## 1. Vue d'ensemble pour l'IA (Démarrage Rapide)

- **Objectif du projet** : Une simulation de fusée 2D avec un système d'entraînement par renforcement (IA) robuste pour apprendre à la piloter.
- **Architecture Clé** : **MVC étendu** avec un **`EventBus`** pour une communication découplée.
  - **Modèles (`models/`)** : Représentent l'état pur des données (la "vérité").
  - **Vues (`views/`)** : Se chargent uniquement du rendu visuel sur le canvas.
  - **Contrôleurs (`controllers/`)** : Orchestrent toute la logique, la physique et les interactions.
- **Le Trio Essentiel** : Pour comprendre 80% du jeu, commencez par ces fichiers :
  1. `GameController.js` : Le chef d'orchestre, qui contient la boucle de jeu principale.
  2. `RocketModel.js` : Le "cerveau" de la fusée, qui contient tout son état (position, fuel, etc.).
  3. `RenderingController.js` : Le maître du rendu, qui coordonne toutes les vues.
- **Point d'Entrée Principal** : `main.js` initialise `GameSetupController.js`, qui configure et instancie tous les composants du jeu.

## 2. Architecture et `EventBus`

L'**`EventBus`** est le cœur de la communication découplée du projet. Il permet aux différents modules (jeu, UI, IA) de communiquer sans avoir de dépendances directes les uns envers les autres.

- **Implémentation** : `EventBus.js`.
- **Accès Global** : L'instance est accessible via `window.EVENTS`.
- **Utilisation** :
  - **Émettre un événement** : `window.EVENTS.publish('EVENT_NAME', data);`
  - **S'abonner à un événement** : `window.EVENTS.subscribe('EVENT_NAME', (data) => { /* ... */ });`
- **Référence des Événements** : Tous les noms d'événements sont centralisés dans `EventTypes.js`.

## 3. Workflows Clés

Comprendre ces flux de données est essentiel pour toute modification.

### a. Boucle de Jeu Principale
*Lieu : `GameController.js`*
1. `requestAnimationFrame(gameLoop)` est appelé en continu.
2. `gameController.update()` est exécuté.
3. **Mise à jour de la physique** : `physicsController.update()` fait avancer le moteur Matter.js.
4. **Synchronisation** : `synchronizationManager.sync()` met à jour les modèles (ex: `RocketModel`) avec les données du moteur physique.
5. **Logique de jeu** : Les autres contrôleurs (ex: `rocketController`, `missionManager`) sont mis à jour.
6. **Rendu** : `renderingController.render()` dessine l'état actuel sur le canvas.

### b. De l'Entrée Utilisateur à la Poussée de la Fusée
1. **`InputController.js`** : Détecte une pression de touche (ex: Flèche Haut).
2. **Émission d'événement** : Publie un événement `KEY_DOWN` sur l'EventBus.
3. **`RocketController.js`** : S'abonne à `KEY_DOWN`, et si la touche correspond, il met à jour la puissance du propulseur dans `RocketModel.js`.
4. **`ThrusterPhysics.js`** : Dans la boucle de jeu, il lit la puissance du propulseur depuis `RocketModel` et applique la force correspondante au corps physique de la fusée dans le moteur Matter.js.

### c. Processus de Rendu
1. **`GameController.js`** : Appelle `renderingController.render()` à chaque frame.
2. **`RenderingController.js`** :
   - Efface le canvas.
   - Appelle `universeView.render()` pour dessiner le fond et les corps célestes.
   - Appelle `rocketView.render()` pour dessiner la fusée en se basant sur `RocketModel`.
   - Appelle les autres vues (`traceView`, `vectorsView`, `uiView`...) si elles sont actives.
   - Gère les "toggles" d'affichage (Vecteurs, Traces, Grille de gravité) en réponse aux événements.

### d. Logique de Collision
1. **Matter.js** : Détecte une collision entre la fusée et un corps céleste.
2. **`CollisionHandler.js`** : S'abonne aux événements de collision de Matter.js.
3. **Analyse de la collision** : Calcule la vitesse, l'angle, etc., au moment de l'impact.
4. **Mise à jour du modèle** : Met à jour `rocketModel.isLanded` ou `rocketModel.isCrashed` en fonction des conditions de la collision.
5. **`SynchronizationManager.js`** : Détecte le changement d'état dans `RocketModel` et crée une contrainte physique ("attache") dans Matter.js pour que la fusée "colle" au corps céleste sur lequel elle s'est posée.

## 4. Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons)
├── controllers/      # Logique de contrôle, gestion des états et interactions
├── models/           # Représentation des données et de l'état (source de vérité)
├── views/            # Rendu visuel des modèles sur le canvas
├── constants.js      # Constantes globales (physique, jeu, IA)
├── EventTypes.js     # Centralisation des clés d'événements de l'EventBus
├── index.html        # Point d'entrée du jeu principal
├── main.js           # Initialisation de l'application
├── train.js          # Scripts pour l'entraînement IA en console
└── training-interface.html # Interface web complète pour l'entraînement de l'IA
```

## 5. Description des Composants

### Modèles (`models/`) - La Source de Vérité
*Contiennent l'état brut des objets du jeu. Ne contiennent pas de logique complexe.*
- **`RocketModel.js`**: État complet de la fusée (position, vitesse, fuel, orientation, état des propulseurs, crash/landed). **Fichier central.**
- **`UniverseModel.js`**: Gère la collection de tous les corps célestes.
- **`CelestialBodyModel.js`**: Propriétés d'un corps céleste (masse, position, rayon).
- **`CameraModel.js`**: Gère l'état de la caméra (position, zoom, cible suivie).
- **`ParticleSystemModel.js`**: Modélise un système de particules (ex: propulsion).
- **`ParticleModel.js`**: Propriétés d'une particule individuelle.

### Vues (`views/`) - Le Rendu Visuel
*Lisents les données des modèles et les dessinent sur le canvas. Ne modifient jamais l'état.*
- **`RocketView.js`**: Affiche la fusée, ses propulseurs et son état (crashé ou non).
- **`UniverseView.js`**: Affiche le fond étoilé et coordonne le dessin des corps célestes.
- **`CelestialBodyView.js`**: Affiche un corps céleste individuel.
- **`VectorsView.js`**: Affiche les vecteurs physiques (poussée, vitesse, gravité). Gère aussi l'affichage du champ de gravité et des équipottentielles.
- **`TraceView.js`**: Affiche la trajectoire de la fusée.
- **`UIView.js`**: Affiche l'interface utilisateur (infos, missions, messages).
- **`ParticleView.js`**: Affiche les particules.

### Contrôleurs (`controllers/`) - La Logique Applicative
*Orchestrent la logique, la physique, les entrées et la synchronisation.*

#### Orchestration et Initialisation
- **`GameController.js`**: **Le chef d'orchestre**. Contient la boucle de jeu principale, gère les états globaux (pause, etc.) et coordonne les autres contrôleurs.
- **`GameSetupController.js`**: **Le constructeur**. Initialise tous les composants majeurs du jeu au démarrage.

#### Physique et Simulation
- **`PhysicsController.js`**: Gère le moteur Matter.js et la simulation physique globale.
- **`ThrusterPhysics.js`**: Applique les forces des propulseurs de la fusée au moteur physique en se basant sur `RocketModel`.
- **`CollisionHandler.js`**: Gère les collisions détectées par Matter.js et met à jour l'état du `RocketModel`.
- **`SynchronizationManager.js`**: Synchronise l'état logique (`RocketModel`) avec l'état physique (Matter.js), notamment pour attacher/détacher la fusée lors de l'atterrissage/décollage.

#### Entités du Jeu
- **`RocketController.js`**: Gère la logique spécifique à la fusée (propulsion, rotation) en réponse aux événements d'entrée ou de l'IA.
- **`CelestialBodyFactory.js`**: Crée les modèles et corps physiques pour les planètes et les lunes.
 - **`CelestialBodyFactory.js`**: Crée les modèles et corps physiques pour les planètes et les lunes, y compris Jupiter, Saturne, Uranus et Neptune.
- **`BodyFactory.js`**: Crée les corps physiques Matter.js plus génériques (comme la fusée).
- **`MissionManager.js`**: Gère la logique des missions.
- **`RocketCargo.js`**: Gère le cargo de la fusée.

#### Rendu et Caméra
- **`RenderingController.js`**: Coordonne toutes les vues pour le rendu. Gère les toggles d'affichage (Vecteurs `V`, Gravité `G`, Traces `T`).
- **`CameraController.js`**: Gère la logique de la caméra (zoom, déplacement, suivi).

#### Entrées et UI
- **`InputController.js`**: Capture les entrées clavier/souris/manette et les publie sur l'EventBus.
- **`AudioManager.js`**: Gestion centralisée de l'audio.

#### IA et Entraînement
- **`RocketAI.js`**: L'agent IA (Deep Q-Network) qui prend des décisions pour piloter la fusée.
- **`TrainingOrchestrator.js`**: Orchestre le processus d'entraînement de l'IA (épisodes, récompenses, métriques).
- **`HeadlessRocketEnvironment.js`**: Environnement de simulation rapide sans rendu graphique pour l'entraînement intensif.
- **`TrainingVisualizer.js`**: Visualiseur temps réel pour l'entraînement de l'IA.

## 6. Le Système d'Intelligence Artificielle
Le système d'IA est conçu pour être à la fois puissant et facile à superviser.

- **Composants Clés** : `RocketAI`, `TrainingOrchestrator`, `HeadlessRocketEnvironment`, `TrainingVisualizer`.
- **Algorithme** : Deep Q-Network (DQN) avec TensorFlow.js.
- **Méthodes d'Entraînement** :
  1. **Interface Web (`training-interface.html`)**: La méthode recommandée, avec visualisation et contrôles complets.
  2. **Console (`train.js`)**: Pour des scripts d'entraînement rapides ou du benchmarking.
  3. **Programmation Directe**: En utilisant `TrainingOrchestrator` dans le code.
- **Interface d'Entraînement (`training-interface.html`)** : Une application complète pour configurer, lancer, et monitorer l'entraînement avec des graphiques de performance, des métriques en temps réel et une visualisation de la trajectoire.

## 7. Événements Clés (`EventTypes.js`)
Voici une sélection des événements les plus importants circulant sur l'`EventBus`.

| Événement                    | Description                                             | Publié par (typiquement)         | Consommé par (typiquement)          |
|------------------------------|---------------------------------------------------------|-----------------------------------|--------------------------------------|
| `KEY_DOWN` / `KEY_UP`        | Une touche du clavier est pressée/relâchée.             | `InputController`                 | `RocketController`, `CameraController` |
| `RENDER_TOGGLE_VECTORS`      | Demande d'affichage/masquage des vecteurs.              | `InputController` (touche V)      | `RenderingController`                |
| `ROCKET_LANDED` / `ROCKET_CRASHED` | La fusée a atterri ou s'est écrasée.             | `CollisionHandler`                | `GameController`, `AudioManager`     |
| `ROCKET_LIFTOFF`             | La fusée a décollé.                                     | `SynchronizationManager`          | `AudioManager`                       |
| `AI_START_TRAINING`          | Démarre une session d'entraînement de l'IA.             | `training-interface.html` (UI)    | `TrainingOrchestrator`               |
| `AI_EPISODE_ENDED`           | Un épisode d'entraînement est terminé.                  | `TrainingOrchestrator`            | `TrainingVisualizer`, UI             |
| `AI_CONTROL_ACTION`          | L'IA envoie une commande de contrôle à la fusée.        | `RocketAI`                        | `RocketController`                   |

## 8. Notes Techniques et Conventions

### Environnement d'Exécution
- **Pas de Modules ES6** : Le projet utilise des scripts globaux chargés via des balises `<script>` dans les fichiers HTML. L'ordre de chargement est crucial. **N'utilisez pas `import`/`export`**.
- **Accès Global** : Les instances clés comme l'EventBus (`window.EVENTS`) sont accessibles globalement.

### Moteur Physique (Matter.js)
- **Version** : le plugin matter-attractors@0.1.4 FONCTIONNE PARFAITEMENT avec matter-js@0.19.0. CE N'EST PAS UN PROBLEME, TOUT FONCTIONNE BIEN.
- **Gravité** : La force de gravité est appliquée directement par le plugin `matter-attractors` durant la mise à jour du moteur physique.
- **Calculs manuels** : Les fonctions comme `calculateGravityAccelerationAt` sont utilisées pour la visualisation (ex: `VectorsView`) ou le debug, **pas** pour appliquer la force dans la simulation.
- **Collisions** : Gérées par Matter.js, filtrées par catégories (`PHYSICS.COLLISION_CATEGORIES`) pour que la fusée n'interagisse qu'avec les corps célestes.

### Constantes et Cohérence
- **`constants.js`** : Fichier unique pour toutes les constantes magiques (physique, gameplay). Utilisez-le pour assurer la cohérence.
- **Puissance des propulseurs** : La puissance (`power`) est une valeur absolue. Les calculs de force utilisent le ratio `power / maxPower`.
- **Seuils** : Les seuils de crash, d'atterrissage et de décollage sont définis dans `constants.js` et doivent être utilisés comme seule source de vérité.

## 9. Prochaines Étapes Envisageables

- **Refactoring** : Diviser les contrôleurs monolithiques (ex: `GameController.js`) en modules plus petits et spécialisés.
- **Optimisation** : Envisager une structure de données optimisée (ex: quad-tree) pour le calcul gravitationnel si le nombre de corps augmente.
- **Gamepad** : Créer un `GamepadController` dédié pour centraliser la gestion des manettes.
- **IA** : Explorer des architectures plus avancées (Actor-Critic, LSTM) et des environnements plus complexes.
- **Fonctionnalités de jeu** : Étendre le système de missions, ajouter un système de ressources, etc.


