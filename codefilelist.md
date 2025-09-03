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
- **Accès Global** : Les clés d'événements sont exposées via `window.EVENTS`. L'instance du bus est `eventBus` (aussi accessible via `window.eventBus`).
- **Utilisation** :
  - **Émettre** : `eventBus.emit(window.EVENTS.ROCKET.RESET, data)`
  - **S'abonner** : `const unsub = eventBus.subscribe(window.EVENTS.ROCKET.RESET, (data) => { /* ... */ });`
  - **Wildcard** : `eventBus.subscribe('PHYSICS.*', (data) => { /* ... */ });`
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
2. **Émission d'événements sémantiques** : Émet `ROCKET_THRUST_*`, `INPUT_ROTATE_COMMAND`, `RENDER_*` sur l'EventBus.
3. **`RocketController.js`** : S'abonne à ces événements et met à jour les puissances/rotations dans `RocketModel.js`.
4. **`ThrusterPhysics.js`** : Dans la boucle de jeu, il lit la puissance du propulseur depuis `RocketModel` et applique la force correspondante au corps physique de la fusée dans le moteur Matter.js.

### c. Processus de Rendu
1. **`GameController.js`** : Appelle `renderingController.render()` à chaque frame.
2. **`RenderingController.js`** :
   - Efface le canvas.
   - Appelle `universeView.render()` pour dessiner le fond et les corps célestes.
   - Appelle `rocketView.render()` pour dessiner la fusée en se basant sur `RocketModel`.
   - Appelle les autres vues (`traceView`, `vectorsView`, `uiView`...) si elles sont actives.
   - Gère les "toggles" d'affichage (Vecteurs `RENDER_TOGGLE_VECTORS`, Traces `RENDER_TOGGLE_TRACES`, Champ de gravité `RENDER_TOGGLE_GRAVITY_FIELD`) en réponse aux événements.
   - Tient compte de l'état de pause (`GAME_PAUSED`/`GAME_RESUMED`) pour n'afficher que l'UI pendant la pause.

### d. Logique de Collision
1. **Matter.js** : Détecte une collision entre la fusée et un corps céleste.
2. **`CollisionHandler.js`** : S'abonne aux événements de collision de Matter.js.
3. **Analyse de la collision** : Calcule la vitesse, l'angle, etc., au moment de l'impact.
4. **Mise à jour du modèle** : Met à jour `rocketModel.isLanded` ou `rocketModel.isCrashed` en fonction des conditions de la collision.
5. **`SynchronizationManager.js`** : Détecte le changement d'état dans `RocketModel` et crée une contrainte physique ("attache") dans Matter.js pour que la fusée "colle" au corps céleste sur lequel elle s'est posée.

### e. Reload d'Univers (Preset/Procédural)
1. **Déclencheur** : émission de `UNIVERSE_LOAD_REQUESTED` avec `{ source: 'preset'|'random', url?, seed? }`.
2. **`GameController.handleUniverseLoadRequested`** : met la simulation en pause, charge/génère les données, appelle `resetWorld(data)`.
3. **`GameSetupController.buildWorldFromData`** : construit un nouvel `UniverseModel` (corps, stations, étoiles, astéroïdes) et repositionne la fusée selon `rocket.spawn`.
4. **Événements** : `UNIVERSE_STATE_UPDATED` puis `UNIVERSE_RELOAD_COMPLETED` sont émis pour informer vues/contrôleurs.

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
- **`UniverseModel.js`**: Gère la collection des corps célestes et les ressources de fond (étoiles, ceintures d'astéroïdes, stations), ainsi que des dimensions et constants (ex: `gravitationalConstant`). Met à jour le scintillement des étoiles et les orbites à chaque frame.
- **`CelestialBodyModel.js`**: Propriétés d'un corps céleste (masse, position, rayon).
- **`CameraModel.js`**: Gère l'état de la caméra (position, zoom, cible suivie).
- **`ParticleSystemModel.js`**: Modélise un système de particules (ex: propulsion).
- **`ParticleModel.js`**: Propriétés d'une particule individuelle.

### Vues (`views/`) - Le Rendu Visuel
*Lisent les données des modèles et les dessinent sur le canvas. Ne modifient jamais l'état.*
- **`RocketView.js`**: Affiche la fusée, ses propulseurs et son état (crashé ou non).
- **`UniverseView.js`**: Affiche le fond étoilé (scintillement), coordonne le dessin des corps célestes, et rend les ceintures d'astéroïdes.
- **`CelestialBodyView.js`**: Affiche un corps céleste individuel.
- **`VectorsView.js`**: Affiche les vecteurs physiques (poussée, vitesse, accélération, attractions) et peut afficher le champ de gravité en modes "flèches" ou "lignes".
- **`TraceView.js`**: Affiche la trajectoire de la fusée.
- **`UIView.js`**: Affiche l'interface utilisateur (infos, missions, cargo, crédits), gère des écrans modaux (Chargement, Pause, Game Over) et un effet "Mission Réussie".
- **`ParticleView.js`**: Affiche les particules.
 - **`StationView.js`**: Affiche des stations ancrées aux corps célestes (icônes/labels), utilisées par `RenderingController`.

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
- **`BodyFactory.js`**: Crée les corps physiques Matter.js plus génériques (comme la fusée).
- **`MissionManager.js`**: Gère la logique des missions.
- **`RocketCargo.js`**: Gère le cargo de la fusée.

#### Rendu et Caméra
- **`RenderingController.js`**: Coordonne toutes les vues pour le rendu. Gère les toggles d'affichage (Vecteurs `V`, Gravité `G`, Traces `T`), réagit à la pause (`GAME_PAUSED`/`GAME_RESUMED`), réinitialise la trace lors d'un `UNIVERSE_STATE_UPDATED`, et dessine aussi les stations via `StationView`.
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
| `INPUT_ROTATE_COMMAND` / `INPUT_ZOOM_COMMAND` | Entrées continues de rotation/zoom.              | `InputController`                 | `RocketController`, `CameraController` |
| `RENDER_TOGGLE_VECTORS`      | Demande d'affichage/masquage des vecteurs.              | `InputController` (touche V)      | `RenderingController`                |
| `RENDER_TOGGLE_TRACES`       | Bascule l'affichage de la trace.                        | `InputController` (touche T)      | `RenderingController`                |
| `RENDER_TOGGLE_GRAVITY_FIELD`| Bascule le mode du champ de gravité (off/flèches/lignes).| `InputController` (touche G)      | `RenderingController`                |
| `ROCKET_LANDED` / `ROCKET_CRASHED` | La fusée a atterri ou s'est écrasée.             | `CollisionHandler`                | `GameController`, `AudioManager`     |
| `ROCKET_LIFTOFF`             | La fusée a décollé.                                     | `SynchronizationManager`          | `AudioManager`                       |
| `AI_START_TRAINING`          | Démarre une session d'entraînement de l'IA.             | `training-interface.html` (UI)    | `TrainingOrchestrator`               |
| `AI_EPISODE_ENDED`           | Un épisode d'entraînement est terminé.                  | `TrainingOrchestrator`            | `TrainingVisualizer`, UI             |
| `AI_CONTROL_ACTION`          | Trace/diagnostic d'une action IA.                       | `RocketAI`                        | UI / Logs                            |
| `ROCKET_SET_THRUSTER_POWER`  | Fixe la puissance d'un propulseur (idempotent).         | `InputController`, `RocketAI`     | `RocketController`                   |
| `SIMULATION_UPDATED`         | État global agrégé de la simulation (fusée/univers/UI). | `GameController`                  | `RenderingController`, UI            |
| `GAME_STATE_CHANGED`         | Changement d'état du jeu (FSM).                         | `GameController`                  | UI                                   |
| `UI_SHOW_*` / `UI_HIDE_*`    | Écrans UI (Chargement, Pause, Game Over).               | `GameController`                  | `UIView`                             |
| `UNIVERSE_LOAD_REQUESTED`    | Demande de chargement d'un univers (preset/procédural). | UI/Debug/IA                       | `GameController`                     |
| `UNIVERSE_STATE_UPDATED`     | Nouvel état d'univers prêt (modèles/states).            | `GameController`/Setup            | Vues/Contrôleurs                     |
| `UNIVERSE_RELOAD_COMPLETED`  | Reload terminé et synchronisé.                          | `GameController`                  | Tous                                  |
| `STATION_DOCKED` / `STATION_REFUELED` | Docking et ravitaillement à une station.       | `GameController`                  | UI/Audio                             |
| `system:canvasResized`       | Redimensionnement du canvas.                            | `RenderingController`             | Caméra/Contrôleurs                   |
| `particles:explosionCompleted`| Fin de l'animation d'explosion.                         | `ParticleController`              | `GameController`                     |

## 8. Notes Techniques et Conventions

### Environnement d'Exécution
- **Pas de Modules ES6** : Le projet utilise des scripts globaux chargés via des balises `<script>` dans les fichiers HTML. L'ordre de chargement est crucial. **N'utilisez pas `import`/`export`**.
- **Accès Global** : Les clés d'événements via `window.EVENTS`. Le bus d'événements via `window.eventBus`.

### Moteur Physique (Matter.js)
- **Version** : Le plugin `matter-attractors@0.1.4` et `matter-attractors@0.1.6` sont compatibles avec `matter-js@0.19.0`; cette combinaison est testée et stable.
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



## 10. Architecture Modulaire pour la Génération Procédurale et le Reload d'Univers

Objectif: séparer les données de configuration du monde de la logique pour permettre le chargement de systèmes artisanaux (préconfigurés) ou générés de façon procédurale, sans refonte majeure.

- **Principe clé**: les contrôleurs et vues ne doivent pas dépendre de données codées en dur. Ils doivent lire l'état exclusif depuis les modèles (ex: `UniverseModel`, `CelestialBodyModel`, `RocketModel`).
- **Source des données**: fichiers JSON (présets) et/ou générateur procédural in-memory. Le projet n'utilisant pas les modules ES6, exposez les points d'entrée via `window.*` et chargez les JSON via `fetch`.

### 10.1. Séparation Données vs Logique

- **Données de monde** (statique ou générée):
  - Emplacement recommandé: `assets/worlds/` (ex: `assets/worlds/starter-system.json`).
  - Contenu: paramètres des corps célestes, points d'apparition, options de gravité/attracteurs, seed, missions initiales.
- **Logique**: reste dans `controllers/` et `models/`.
  - `GameSetupController` orchestre la création du monde à partir de données.
  - `CelestialBodyFactory`/`BodyFactory` instancient les corps Matter.js à partir de données, sans lire de valeurs de monde depuis `constants.js`.
  - `SynchronizationManager` relie l'état logique et physique après (re)construction.

### 10.2. Événements `UNIVERSE_*` (EventBus)

Définir des événements dédiés dans `EventTypes.js` pour décrire le cycle de vie d'un rechargement:

- `UNIVERSE_LOAD_REQUESTED` — demande de chargement d'un nouveau monde (payload: `{ source: 'preset'|'random', url?, seed? }`).
- `UNIVERSE_STATE_UPDATED` — un nouvel état d'univers est prêt et devient la source de vérité (payload: objets modèles/références nécessaires).
- `UNIVERSE_RELOAD_COMPLETED` — tous les contrôleurs/vues ont consommé la mise à jour et sont synchronisés.

Ces événements permettent aux composants d'être informés sans couplage direct et d'exécuter leurs propres routines de reset.

### 10.3. Cycle de Vie de Reload (proposé)

1. Un initiateur (UI, IA, debug) émet `UNIVERSE_LOAD_REQUESTED`.
2. Un chargeur (ex: `UniverseLoader` ou `GameSetupController`) obtient les données (JSON ou génération procédurale) et construit des structures prêtes à l'emploi.
3. Pause sûre du jeu: geler la boucle (`GameController`), stopper l'audio (`AudioManager`), désabonner temporairement les listeners sensibles.
4. Teardown contrôlé: détruire les corps Matter.js existants, nettoyer les contraintes et traces, annuler les abonnements spécifiques au monde.
5. Rebuild: créer les nouveaux `CelestialBodyModel` et leurs corps Matter.js via les factories, initialiser `UniverseModel`, positionner la `RocketModel` (spawn), recâbler la synchronisation.
6. Émettre `UNIVERSE_STATE_UPDATED` avec les références des nouveaux modèles/ressources.
7. Les consommateurs (vues/contrôleurs) se reconfigurent (références de modèles, caméras, caches, tracés) et confirment implicitement.
8. Reprise: relancer la boucle et l'audio, puis émettre `UNIVERSE_RELOAD_COMPLETED`.

### 10.4. Contrat de Données Minimal (JSON)

Exemple de structure de preset (indicative):

```json
{
  "seed": 123456,
  "physics": {
    "G": 6.674e-11,
    "timeStepMs": 16.6667
  },
  "bodies": [
    {
      "id": "earth",
      "name": "Earth",
      "radius": 6.371e6,
      "mass": 5.972e24,
      "position": { "x": 0, "y": 0 },
      "velocity": { "x": 0, "y": 0 },
      "attractor": { "enabled": true }
    }
  ],
  "rocket": {
    "spawn": {
      "position": { "x": 7.5e6, "y": 0 },
      "velocity": { "x": 0, "y": 7800 },
      "angle": 0
    }
  },
  "missions": []
}
```

Notes:
- Les constantes purement algorithmiques (seuils de crash, ratio de puissance) restent dans `constants.js`.
- Les valeurs dépendantes d'un monde (masse/rayon/positions des corps, spawn) viennent des données.

Champs additionnels supportés (optionnels):
- `stations`: liste d'objets `{ hostName, angle, name, color? }` positionnés sur la surface des corps.
- `asteroidBelts`: configuration(s) d'anneaux d'astéroïdes `{ innerRadius, outerRadius, count, seed?, sizeRange?, color?, brightness? }`.
- `starsConfig`: génération compacte des étoiles d'arrière-plan `{ count, radius, seed }`.

### 10.5. Responsabilités lors d'un Reload

- **`GameController`**: pause/reprise de la boucle; expose `resetWorld(data)`.
- **`GameSetupController`**: `buildWorldFromData(data)`; gère le teardown/rebuild orchestré.
- **`PhysicsController`**: réinitialise le monde Matter.js (vider le `World`, recréer contraintes, réappliquer attractors).
- **`SynchronizationManager`**: recalcule attaches/états (landed/crashed), recrée les liens fusée-corps si nécessaire.
- **`RenderingController`**: recrée les vues dépendantes de `UniverseModel`, purge caches (grilles/équipotentielles), reset des toggles si voulu.
- **`CameraController`**: recale la caméra (target/zoom) sur le spawn ou la cible par défaut.
- **`RocketController`**: remet à zéro les puissances/états, repositionne la fusée via `RocketModel`.
- **`AudioManager`**: coupe/rejoue les ambiances en fonction du nouvel univers.

### 10.6. Pseudo-code de Référence

```js
eventBus.subscribe(window.EVENTS.UNIVERSE_LOAD_REQUESTED, async (opts) => {
  gameController.pause();
  const data = opts.source === 'random'
    ? window.ProceduralGenerator.generate(opts.seed)
    : await fetch(opts.url).then(r => r.json());
  gameController.resetWorld(data);
});

// Dans GameController
window.gameController.resetWorld = function resetWorld(worldData) {
  this.teardownWorld();
  const models = window.GameSetupController.buildWorldFromData(worldData);
  eventBus.emit(window.EVENTS.UNIVERSE_STATE_UPDATED, models);
  this.resume();
  eventBus.emit(window.EVENTS.UNIVERSE_RELOAD_COMPLETED, {});
};
```

### 10.7. Règles de Conception

- **Idempotence**: les setters d'état (ex: position de la fusée, puissances) doivent être sûrs lors d'appels répétés.
- **Références fraîches**: évitez de conserver des références directes aux anciens modèles/corps; re-resolvez via `UniverseModel` après `UNIVERSE_STATE_UPDATED`.
- **Agnosticisme**: les vues ne doivent lire que les modèles; aucune logique de génération ni d'accès direct aux `constants.js` spécifiques au monde.

### 10.8. Chemin de Migration Progressif (conseillé)

1. Extraire les paramètres des corps célestes hors de `constants.js` vers un preset JSON simple.
2. Introduire les clés `UNIVERSE_*` dans `EventTypes.js` (stubs) et les exposer dans `window.EVENTS`.
3. Ajouter `buildWorldFromData(data)` dans `GameSetupController` et faire l'initialisation initiale via ces données.
4. Adapter `CelestialBodyFactory`/`BodyFactory` pour construire depuis `data` plutôt que des constantes codées en dur.
5. Réinitialiser proprement `PhysicsController` et `SynchronizationManager` lors d'un reload.
6. Exposer un déclencheur de debug (ex: touche `N`) qui émet `UNIVERSE_LOAD_REQUESTED` avec `{ source: 'random', seed: Date.now() }`.

