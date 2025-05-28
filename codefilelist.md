# Guide de Structure et d'Architecture du Code

## Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons, captures d'écran, vidéos)
│   ├── sound/        # Effets sonores (propulsion, collisions, voix, etc.)
│   ├── image/        # Images (fusée, planètes, etc.)
│   ├── screenshots/  # Captures d'écran du jeu
│   └── video/        # Vidéos (cinématiques, tutoriels, etc.)
├── core/             # Système central et utilitaires
│   ├── constants.js          # Constantes globales (physique, rendu, configuration fusée)
│   ├── EventTypes.js         # Centralisation des clés d'événements de l'EventBus
│   ├── EventBus.js           # Système Publish/Subscribe pour la communication interne découplée
│   ├── core.bundle.js        # Bundle compilé du module core
│   └── utils/                # Utilitaires partagés
│       ├── MathUtils.js      # Fonctions mathématiques utilitaires
│       └── DebugProfiler.js  # Outils de profilage et debug
├── models/           # Représentation des données et de l'état
│   ├── core/                 # Modèles de base du système
│   │   ├── UniverseModel.js  # Gère la collection de corps célestes et logique du système planétaire
│   │   └── CameraModel.js    # Gère la position, le zoom et le suivi de la caméra
│   ├── entities/             # Modèles d'entités du jeu
│   │   ├── CelestialBodyModel.js # Représente un corps céleste (masse, position, rayon)
│   │   └── RocketModel.js    # Représente l'état de la fusée (position, vitesse, carburant)
│   ├── effects/              # Modèles d'effets visuels
│   │   ├── ParticleModel.js  # Représente une particule individuelle et ses propriétés
│   │   └── ParticleSystemModel.js # Modélise les systèmes de particules (émission, durée de vie)
│   └── models.bundle.js      # Bundle compilé du module models
├── physics/          # Moteur physique et simulation
│   ├── PhysicsController.js  # Gère le moteur Matter.js et la simulation physique globale
│   ├── PhysicsVectors.js     # Calcule et fournit les vecteurs physiques pour affichage et simulation
│   ├── SynchronizationManager.js # Synchronise état logique (modèles) et physique (Matter.js)
│   ├── handlers/             # Gestionnaires physiques spécialisés
│   │   ├── ThrusterPhysics.js # Applique les forces des propulseurs de la fusée au moteur physique
│   │   └── CollisionHandler.js # Gère les collisions entre corps physiques, met à jour RocketModel
│   ├── factories/            # Factories pour la création d'objets physiques
│   │   ├── BodyFactory.js    # Crée les corps physiques Matter.js (génériques, ex: fusée) à partir des modèles
│   │   └── CelestialBodyFactory.js # Crée les modèles de corps célestes et leurs corps physiques Matter.js
│   └── physics.bundle.js     # Bundle compilé du module physics
├── game/             # Logique de jeu et contrôleurs principaux
│   ├── GameController.js     # Orchestrateur principal, boucle de jeu, gestion des états globaux
│   ├── GameSetupController.js # Initialise les composants majeurs du jeu (modèles, vues, contrôleurs)
│   ├── camera/               # Contrôle de la caméra
│   │   └── CameraController.js # Gère le zoom, le centrage et le drag de la caméra
│   ├── rocket/               # Contrôleurs spécifiques à la fusée
│   │   ├── RocketController.js # Gère la logique spécifique à la fusée (propulsion, rotation)
│   │   └── RocketCargo.js    # Gère le cargo de la fusée (chargement, déchargement, ressources)
│   ├── particles/            # Système de particules
│   │   └── ParticleController.js # Gère la logique des particules (création, mise à jour, suppression)
│   ├── missions/             # Système de missions
│   │   └── MissionManager.js # Gère la logique des missions, leurs objectifs, et leur complétion
│   └── game.bundle.js        # Bundle compilé du module game
├── input/            # Gestion des entrées utilisateur
│   ├── InputController.js    # Entrées clavier/souris/joystick, publie sur EventBus
│   └── input.bundle.js       # Bundle compilé du module input
├── rendering/        # Système de rendu visuel
│   ├── RenderingController.js # Coordonne toutes les vues pour le rendu, gère les toggles d'affichage
│   ├── views/                # Vues de rendu spécialisées
│   │   ├── RocketView.js     # Affiche la fusée et ses états (propulseurs, image, crash)
│   │   ├── UniverseView.js   # Affiche le fond, les étoiles, coordonne dessin des corps célestes
│   │   ├── CelestialBodyView.js # Affiche un corps céleste individuel
│   │   ├── ParticleView.js   # Affiche les particules (propulsion, débris, effets)
│   │   ├── VectorsView.js    # Affiche les vecteurs physiques (poussée, vitesse, gravité, etc.)
│   │   ├── TraceView.js      # Affiche la trajectoire de la fusée
│   │   └── UIView.js         # Affiche l'interface utilisateur (infos, missions, cargo, messages)
│   └── rendering.bundle.js   # Bundle compilé du module rendering
├── ai/               # Intelligence artificielle et entraînement
│   ├── RocketAI.js           # Gère l'IA de contrôle de la fusée avec TensorFlow.js (DQN, entraînement)
│   ├── scripts/              # Scripts utilitaires IA
│   │   ├── ControllerContainer.js # Gère l'organisation ou l'accès aux contrôleurs
│   │   └── train.js          # Scripts de démonstration et d'entraînement IA (console et programmation)
│   ├── training/             # Système d'entraînement IA
│   │   ├── TrainingOrchestrator.js # Orchestrateur d'entraînement IA avec métriques, checkpoints et évaluation
│   │   ├── HeadlessRocketEnvironment.js # Environnement de simulation pour la fusée sans rendu graphique (entraînement IA)
│   │   └── TrainingVisualizer.js # Visualiseur temps réel pour l'entraînement IA (trajectoires, corps célestes)
│   └── ai.bundle.js          # Bundle compilé du module ai
├── tools/            # Outils de développement et build
│   ├── build.js              # Script de build principal
│   ├── bundle-order.json     # Configuration de l'ordre des bundles
│   ├── dev-server.js         # Serveur de développement
│   ├── optimize.js           # Optimisation des bundles
│   ├── validate-migration.js # Validation de la migration
│   ├── finalize-migration.js # Finalisation de la migration
│   ├── fix-controller-container.js # Correction du container de contrôleurs
│   ├── add-global-exports.js # Ajout d'exports globaux
│   ├── instrument-for-coverage.js # Instrumentation pour la couverture de code
│   └── test-bundles.js       # Test des bundles
├── tests/            # Tests unitaires et d'intégration
│   ├── setup.js              # Configuration Jest principale
│   ├── setup-coverage.js     # Configuration spéciale pour les tests de couverture
│   ├── core/                 # Tests des modules core
│   │   ├── EventBus.test.js  # Tests complets EventBus (Pub/Sub, gestion erreurs)
│   │   └── MathUtils.test.js # Tests utilitaires mathématiques
│   ├── models/               # Tests des modèles de données
│   │   ├── RocketModel.test.js # Tests complets RocketModel (état, carburant, dommages)
│   │   └── CelestialBodyModel.test.js # Tests complets CelestialBodyModel (physique, types)
│   ├── physics/              # Tests du moteur physique
│   │   └── PhysicsController.test.js # Tests PhysicsController (simulation, corps)
│   ├── input/                # Tests de gestion des entrées
│   │   └── InputController.test.js # Tests complets InputController (clavier, souris, gamepad)
│   ├── game/                 # Tests des contrôleurs de jeu
│   │   └── GameController.test.js # Tests GameController (états, boucle)
│   └── README_COVERAGE.md    # Documentation des améliorations de couverture
├── coverage/         # Rapports de couverture de tests (HTML, LCOV, JSON)
│   ├── lcov-report/          # Rapports HTML détaillés par fichier
│   ├── coverage-final.json   # Données de couverture finales
│   └── lcov.info            # Format LCOV pour intégration CI/CD
├── docs/             # Documentation du projet
│   └── COVERAGE.md           # Guide complet de la couverture de code
├── .build/           # Fichiers de build temporaires
├── ui/               # Interface utilisateur (si applicable)
├── main.js           # Point d'entrée : Initialisation de l'application et des composants
├── index.html        # Structure HTML principale, chargement des librairies et scripts
├── training-interface.html # Interface web complète pour l'entraînement et le monitoring de l'IA
├── test-fixes.html   # Page de test pour les corrections
├── test-quick-fix.js # Script de test rapide
├── package.json      # Configuration npm et dépendances
├── package-lock.json # Verrouillage des versions de dépendances
├── jest.config.js    # Configuration Jest standard
├── jest.coverage.config.js # Configuration Jest spécifique pour la couverture de code
├── README.md         # Informations générales sur le projet
├── BUILD_RAPPORT.md  # Rapport de build automatique
├── CORRECTIONS_FINALES_RAPPORT.md # Rapport des corrections finales
├── codefilelist.md   # Ce fichier - Guide de structure du code
├── .gitignore        # Fichiers et dossiers ignorés par Git
├── LICENSE           # Licence du projet
└── favicon.*         # Icônes du site
```

## Statistiques du Projet

- **Fichiers JavaScript** : 77 fichiers (hors bundles et node_modules)
- **Bundles générés** : 7 bundles
- **Taille totale des bundles** : ~625 KB
- **Lignes de code** : ~19,817 lignes
- **Domaines** : 7 modules (core, models, physics, game, input, rendering, ai)
- **Tests** : 180+ tests avec 159 tests qui passent
- **Couverture de code** : 15,32% statements, 30,22% functions, 15,91% lines

## Système de Tests et Couverture de Code

### Configuration de Tests
Le projet utilise Jest avec deux configurations :
- **Configuration standard** (`jest.config.js`) : Tests avec bundles précompilés
- **Configuration couverture** (`jest.coverage.config.js`) : Tests sur sources avec mesure de couverture

### Scripts de Tests Disponibles
```bash
# Tests standard
npm test                    # Tous les tests avec bundles
npm run test:core          # Tests module core uniquement
npm run test:models        # Tests module models uniquement
npm run test:physics       # Tests module physics uniquement
npm run test:input         # Tests module input uniquement
npm run test:game          # Tests module game uniquement

# Tests de couverture
npm run test:coverage:source    # Couverture sur sources (recommandé)
npm run test:coverage:html      # Génère rapport HTML
npm run test:coverage:open      # Ouvre le rapport dans le navigateur
```

### État de la Couverture
- **Objectifs atteints** : ✅ 15% statements, ✅ 15% lines
- **Modules bien testés** :
  - `InputController` : 99,26% statements
  - `EventBus` : 100% statements  
  - `MathUtils` : 100% statements
  - `RocketModel` : 100% statements
  - `PhysicsController` : Tests complets
- **Rapports** : HTML détaillés disponibles dans `coverage/lcov-report/`

### Fichiers de Tests
- **`tests/core/`** : EventBus (Pub/Sub, erreurs), MathUtils (conversions, calculs)
- **`tests/models/`** : RocketModel (carburant, dommages), CelestialBodyModel (physique, types)
- **`tests/physics/`** : PhysicsController (simulation, pause/resume)
- **`tests/input/`** : InputController (clavier, souris, molette, gamepad, nettoyage)
- **`tests/game/`** : GameController (états, boucle de jeu)

## Architecture Globale (MVC étendu & EventBus)

Le projet suit une architecture MVC étendue avec système d'IA intégré :
- **Modèles (`models/`)** : État pur des objets (position, vitesse, fuel, etc.), sans logique de jeu complexe.
- **Vues (`views/`)** : Dessinent les modèles sur le canvas, sans modifier l'état.
- **Contrôleurs (`game/`, `physics/`, `input/`)** : Orchestrent la logique, la physique, les entrées, la synchronisation et le rendu.
- **EventBus** : Système d'événements pour découpler les modules et intégrer l'IA.
- **Système IA** : Entraînement par renforcement (DQN) avec TensorFlow.js, environnement headless et interface de monitoring.

## Système de Build

Le projet utilise un système de build modulaire qui génère des bundles par domaine :

### Configuration (tools/bundle-order.json)
```json
{
  "core": ["constants.js", "EventTypes.js", "EventBus.js", "utils/MathUtils.js", "utils/DebugProfiler.js"],
  "models": ["core/UniverseModel.js", "core/CameraModel.js", "entities/CelestialBodyModel.js", "entities/RocketModel.js", "effects/ParticleModel.js", "effects/ParticleSystemModel.js"],
  "physics": ["PhysicsVectors.js", "factories/BodyFactory.js", "factories/CelestialBodyFactory.js", "handlers/CollisionHandler.js", "handlers/ThrusterPhysics.js", "SynchronizationManager.js", "PhysicsController.js"],
  "game": ["missions/MissionManager.js", "rocket/RocketCargo.js", "rocket/RocketController.js", "particles/ParticleController.js", "camera/CameraController.js", "GameSetupController.js", "GameController.js"],
  "input": ["InputController.js"],
  "rendering": ["views/RocketView.js", "views/UniverseView.js", "views/CelestialBodyView.js", "views/ParticleView.js", "views/VectorsView.js", "views/TraceView.js", "views/UIView.js", "RenderingController.js"],
  "ai": ["scripts/ControllerContainer.js", "RocketAI.js", "training/HeadlessRocketEnvironment.js", "training/TrainingOrchestrator.js", "training/TrainingVisualizer.js"]
}
```

### Scripts de Build Disponibles
- `npm run build` : Build complet de tous les bundles
- `npm run build:watch` : Build en mode watch
- `npm run build:physics` : Build du module physics uniquement
- `npm run build:ai` : Build du module ai uniquement
- `npm run dev` : Serveur de développement avec watch
- `npm run clean` : Nettoyage des bundles

## Système d'Entraînement IA

### Composants Principaux
- **RocketAI.js** : Agent IA utilisant Deep Q-Network (DQN) avec TensorFlow.js pour apprendre à contrôler la fusée
- **TrainingOrchestrator.js** : Gestionnaire d'entraînement avec métriques, checkpoints, early stopping et évaluation
- **HeadlessRocketEnvironment.js** : Environnement de simulation rapide sans rendu graphique pour l'entraînement
- **TrainingVisualizer.js** : Visualiseur temps réel pour l'entraînement avec trajectoires multiples et contrôles de caméra
- **training-interface.html** : Interface web complète avec monitoring temps réel, graphiques et contrôles
- **train.js** : Scripts de démonstration et fonctions utilitaires pour l'entraînement

### Fonctionnalités IA
- **Entraînement DQN** : Algorithme d'apprentissage par renforcement profond
- **Environnement Headless** : Simulation rapide sans rendu pour l'entraînement intensif
- **Visualisation Temps Réel** : Trajectoires multiples persistantes, caméra adaptative, contrôles de zoom étendus
- **Métriques Temps Réel** : Suivi des performances, taux de succès, exploration, métriques de concurrence TensorFlow.js
- **Sauvegarde/Chargement** : Modèles persistants avec checkpoints automatiques
- **Interface Web** : Monitoring visuel avec graphiques Chart.js, contrôles interactifs et statistiques d'entraînement
- **Évaluation Automatique** : Tests périodiques sur environnement séparé
- **Multi-Objectifs** : Entraînement pour orbite, atterrissage, exploration

### Méthodes d'Entraînement
1. **Interface Web** : `training-interface.html` avec contrôles graphiques (modes headless ou visual)
2. **Console** : Fonctions `demonstrateTraining()`, `quickTraining()`, `benchmarkEnvironment()`
3. **Programmation** : Utilisation directe de `TrainingOrchestrator` avec configuration personnalisée

## Vues principales (`rendering/views/`)
- **RocketView.js** : Affiche la fusée et ses états (propulseurs, image, crash).
- **VectorsView.js** : Affiche tous les vecteurs physiques : poussée (rouge), vitesse, accélération totale F/m (orange, « a=F/m »), gravité, missions, etc. Centralise tout l'affichage vectoriel, indépendamment de RocketView. L'affichage des vecteurs est activable/désactivable dynamiquement (touche V, toggle global via RenderingController).
- **Champ de gravité et équipotentielles** : VectorsView.js calcule et affiche le champ de gravité généré par tous les corps célestes, soit sous forme de flèches (champ), soit sous forme de lignes équipotentielles (potentiel gravitationnel). Le mode d'affichage se toggle avec la touche G (géré globalement par RenderingController).
- **UniverseView.js** : Affiche le fond, les étoiles, et coordonne le dessin des corps célestes.
- **CelestialBodyView.js** : Affiche un corps céleste individuel.
- **TraceView.js** : Affiche la trajectoire de la fusée.
- **ParticleView.js** : Affiche les particules (propulsion, débris, effets).
- **UIView.js** : Affiche l'interface utilisateur (infos, missions, cargo, messages).

## Modèles principaux (`models/`)
- **RocketModel.js** : Représente l'état de la fusée (position, vitesse, carburant, orientation).
- **CelestialBodyModel.js** : Représente un corps céleste (masse, position, rayon).
- **UniverseModel.js** : Gère la collection de corps célestes et la logique du système planétaire.
- **ParticleSystemModel.js** : Modélise les systèmes de particules (émission, durée de vie, interactions).
- **ParticleModel.js** : Représente une particule individuelle avec ses propriétés (position, vélocité, couleur).
- **CameraModel.js** : Gère la position, le zoom et le suivi de la caméra.

## Contrôleurs clés
- **GameController.js** : Chef d'orchestre, boucle de jeu, gestion globale. Coordonne les autres contrôleurs (y compris `CameraController` pour la gestion de la caméra) et délègue la logique spécifique (par ex. à `RocketController`). Gère l'état du jeu (pause, etc.) et la logique de mission de haut niveau.
- **GameSetupController.js** : Responsable de l'initialisation et de la configuration de tous les composants majeurs du jeu au démarrage, y compris les modèles, les vues et les autres contrôleurs.
- **InputController.js** : Entrées clavier/souris/joystick, publie sur EventBus.
- **RocketController.js** : Gère la logique spécifique à la fusée (propulsion, rotation) en réponse aux événements d'entrée. Met à jour `RocketModel` et `ParticleSystemModel`.
- **RenderingController.js** : Coordonne toutes les vues pour le rendu. Gère le toggle d'affichage des vecteurs (touche V) et du champ de gravité/équipotentielles (touche G).
- **PhysicsController.js** : Gère le moteur Matter.js et la simulation physique globale. Inclut les méthodes `pauseSimulation()`, `stopSimulation()` et `resumeSimulation()` pour le contrôle d'état.
- **SynchronizationManager.js** : Synchronise l'état logique (modèles) et physique (moteur Matter.js) entre eux, en particulier pour la fusée (atterrissage, décollage, attachement) et les corps célestes. Gère l'émission d'événements clés comme `ROCKET_LANDED`.
- **ThrusterPhysics.js** : Applique les forces des propulseurs de la fusée au moteur physique.
- **PhysicsVectors.js** : Calcule et fournit les vecteurs physiques (vitesse, accélération) pour l'affichage et la simulation.
- **CollisionHandler.js** : Gère les collisions entre corps physiques, met à jour l'état du `RocketModel` en cas d'atterrissage ou de crash.
- **BodyFactory.js** : Crée les corps physiques Matter.js (génériques, ex: fusée) à partir des modèles.
- **CelestialBodyFactory.js** : Spécialisé dans la création des corps célestes (planètes, lunes), incluant leur modèle et leur corps physique Matter.js.
- **EventBus.js** : Système Publish/Subscribe pour la communication interne découplée.
- **ParticleController.js** : Gère la logique des particules (création, mise à jour, suppression pour effets visuels).
- **MissionManager.js** : Gère la logique des missions, leurs objectifs, et leur complétion.
- **RocketAI.js** : Gère l'IA de contrôle de la fusée avec TensorFlow.js (prise de décision, apprentissage par renforcement DQN).
- **RocketCargo.js** : Gère le cargo de la fusée (chargement, déchargement, gestion des ressources).
- **TrainingOrchestrator.js** : Orchestrateur complet pour l'entraînement IA avec métriques temps réel, checkpoints, early stopping et évaluation automatique.
- **TrainingVisualizer.js** : Visualiseur temps réel pour l'entraînement IA avec trajectoires multiples, caméra adaptative et contrôles de zoom étendus.

## Points d'Entrée Importants
- **main.js** : Initialisation globale du jeu.
- **index.html** : Chargement des scripts dans le bon ordre, jeu principal.
- **training-interface.html** : Interface dédiée à l'entraînement IA.
- **GameController.js** : Boucle de jeu, gestion des états principaux.
- **RenderingController.js** : Rendu global, gestion du toggle des vecteurs.
- **TrainingOrchestrator.js** : Point d'entrée pour l'entraînement IA.

## Événements IA (EventTypes.js étendu)
- **Contrôle** : `AI_TOGGLE_CONTROL`, `AI_CONTROL_CHANGED`
- **Entraînement** : `AI_START_TRAINING`, `AI_STOP_TRAINING`, `AI_PAUSE_TRAINING`, `AI_RESUME_TRAINING`
- **États** : `AI_TRAINING_STARTED`, `AI_TRAINING_COMPLETED`, `AI_TRAINING_ERROR`, `AI_TRAINING_PROGRESS`
- **Évaluation** : `AI_EVALUATION_COMPLETED`, `AI_MODEL_SAVED`, `AI_MODEL_LOADED`

## NOTES TRÈS IMPORTANTES

- **Chargement des scripts** : Tous les scripts sont chargés via `<script>` dans `index.html` et `training-interface.html`. L'ordre d'inclusion est crucial. Il ne doit pas y avoir d'import ES6.
- **Système IA** : L'entraînement fonctionne avec les vrais composants (TrainingOrchestrator, RocketAI, HeadlessRocketEnvironment, TrainingVisualizer). L'interface web est maintenant connectée aux vrais événements d'entraînement avec visualisation temps réel.
- **Calculs physiques** : L'accélération F/m est calculée dans `PhysicsController` (méthode `calculateGravityAccelerationAt`) avant l'appel à `Engine.update()` de Matter.js. Le plugin `matter-attractors` gère ensuite l'application de la gravité. Matter.js reste responsable des collisions et du mouvement.
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités. EventBus sert pour découpler le système MVC afin de l'interfacer avec le système IA. Pas d'imports ES6, on utilise window.EVENTS dans tous les contrôleurs.
- **Entraînement IA** : Utilise TensorFlow.js avec algorithme DQN. Trois méthodes d'entraînement disponibles : interface web, console, et programmation directe.
- **Performance** : L'environnement headless permet un entraînement rapide sans rendu graphique. Métriques temps réel disponibles.
- **Visualisation d'Entraînement** : TrainingVisualizer.js gère l'affichage temps réel avec trajectoires multiples, caméra adaptative et zoom étendu.
- **Interface Web** : training-interface.html est une interface complète avec 6 panneaux : configuration, métriques temps réel, visualisation pleine largeur, graphiques, métriques de concurrence et statistiques d'entraînement.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.
- **Couverture de code** : Système de tests robuste avec couverture mesurée via Jest. Configuration spéciale pour tester les sources plutôt que les bundles. Objectifs atteints : 15%+ statements et lines.
- **Correction PhysicsController** : Méthodes `pauseSimulation()` et `stopSimulation()` ajoutées pour résoudre les erreurs de GameController lors des changements d'état.

## Prochaines Étapes Envisageables

**Tests et Qualité** :
- Amélioration de la couverture branches (actuellement 0,16%)
- Tests d'intégration end-to-end
- Correction des tests CelestialBodyModel pour correspondre aux vraies méthodes

**Système IA** :
- Architectures avancées : Réseaux convolutionnels, LSTM, Actor-Critic
- Apprentissage multi-objectifs et transfert d'apprentissage
- Optimisation des hyperparamètres automatique

**Performance** :
- Optimisation des bundles et lazy loading
- Web Workers pour les calculs intensifs
- Amélioration du système de particules

**Fonctionnalités** :
- Système de sauvegarde/chargement de parties
- Multijoueur en réseau
- Éditeur de missions personnalisées
- Support VR/AR


