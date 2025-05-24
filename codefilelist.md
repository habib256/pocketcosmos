# Guide de Structure et d'Architecture du Code

## Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons, captures d'écran, vidéos)
│   ├── sound/        # Effets sonores (propulsion, collisions, voix, etc.)
│   ├── image/        # Images (fusée, planètes, etc.)
│   ├── screenshots/  # Captures d'écran du jeu
│   └── video/        # Vidéos (cinématiques, tutoriels, etc.)
├── controllers/      # Logique de contrôle, gestion des états et interactions
│   ├── BodyFactory.js          # Crée les corps physiques Matter.js (génériques, ex: fusée) à partir des modèles
│   ├── CameraController.js     # Gère le zoom, le centrage et le drag de la caméra
│   ├── CelestialBodyFactory.js # Crée les modèles de corps célestes et leurs corps physiques Matter.js
│   ├── CollisionHandler.js     # Gère les collisions entre corps physiques, met à jour RocketModel
│   ├── ControllerContainer.js  # Gère l'organisation ou l'accès aux contrôleurs
│   ├── EventBus.js             # Système Publish/Subscribe pour la communication interne découplée
│   ├── GameController.js       # Orchestrateur principal, boucle de jeu, gestion des états globaux
│   ├── GameSetupController.js  # Initialise les composants majeurs du jeu (modèles, vues, contrôleurs)
│   ├── HeadlessRocketEnvironment.js # Environnement de simulation pour la fusée sans rendu graphique (entraînement IA)
│   ├── InputController.js        # Entrées clavier/souris/joystick, publie sur EventBus
│   ├── MissionManager.js       # Gère la logique des missions, leurs objectifs, et leur complétion
│   ├── ParticleController.js   # Gère la logique des particules (création, mise à jour, suppression)
│   ├── PhysicsController.js    # Gère le moteur Matter.js et la simulation physique globale
│   ├── PhysicsVectors.js       # Calcule et fournit les vecteurs physiques pour affichage et simulation
│   ├── RenderingController.js  # Coordonne toutes les vues pour le rendu, gère les toggles d'affichage
│   ├── RocketAI.js             # Gère l'IA de contrôle de la fusée avec TensorFlow.js (DQN, entraînement)
│   ├── RocketCargo.js          # Gère le cargo de la fusée (chargement, déchargement, ressources)
│   ├── RocketController.js     # Gère la logique spécifique à la fusée (propulsion, rotation)
│   ├── SynchronizationManager.js # Synchronise état logique (modèles) et physique (Matter.js)
│   ├── ThrusterPhysics.js      # Applique les forces des propulseurs de la fusée au moteur physique
│   └── TrainingOrchestrator.js # Orchestrateur d'entraînement IA avec métriques, checkpoints et évaluation
├── models/           # Représentation des données et de l'état
│   ├── CameraModel.js          # Gère la position, le zoom et le suivi de la caméra
│   ├── CelestialBodyModel.js   # Représente un corps céleste (masse, position, rayon)
│   ├── ParticleModel.js        # Représente une particule individuelle et ses propriétés
│   ├── ParticleSystemModel.js  # Modélise les systèmes de particules (émission, durée de vie)
│   ├── RocketModel.js          # Représente l'état de la fusée (position, vitesse, carburant)
│   └── UniverseModel.js        # Gère la collection de corps célestes et logique du système planétaire
├── views/            # Rendu visuel des modèles sur le canvas
│   ├── CelestialBodyView.js    # Affiche un corps céleste individuel
│   ├── ParticleView.js         # Affiche les particules (propulsion, débris, effets)
│   ├── RocketView.js           # Affiche la fusée et ses états (propulseurs, image, crash)
│   ├── TraceView.js            # Affiche la trajectoire de la fusée
│   ├── UniverseView.js         # Affiche le fond, les étoiles, coordonne dessin des corps célestes
│   ├── VectorsView.js          # Affiche les vecteurs physiques (poussée, vitesse, gravité, etc.)
│   └── UIView.js               # Affiche l'interface utilisateur (infos, missions, cargo, messages)
├── constants.js      # Constantes globales (physique, rendu, configuration fusée)
├── EventTypes.js     # Centralisation des clés d'événements de l'EventBus (incluant événements IA)
├── index.html        # Structure HTML principale, chargement des librairies et scripts
├── main.js           # Point d'entrée : Initialisation de l'application et des composants
├── train.js          # Scripts de démonstration et d'entraînement IA (console et programmation)
├── training-interface.html # Interface web complète pour l'entraînement et le monitoring de l'IA
├── AI_TRAINING_GUIDE.md    # Guide complet d'utilisation du système d'entraînement IA
├── README.md         # Informations générales sur le projet
├── .gitignore        # Fichiers et dossiers ignorés par Git
├── LICENSE           # Licence du projet
└── favicon.*         # Icônes du site
```

## Architecture Globale (MVC étendu & EventBus)

Le projet suit une architecture MVC étendue avec système d'IA intégré :
- **Modèles (`models/`)** : État pur des objets (position, vitesse, fuel, etc.), sans logique de jeu complexe.
- **Vues (`views/`)** : Dessinent les modèles sur le canvas, sans modifier l'état.
- **Contrôleurs (`controllers/`)** : Orchestrent la logique, la physique, les entrées, la synchronisation et le rendu.
- **EventBus** : Système d'événements pour découpler les modules et intégrer l'IA.
- **Système IA** : Entraînement par renforcement (DQN) avec TensorFlow.js, environnement headless et interface de monitoring.

## Système d'Entraînement IA (Nouveau)

### Composants Principaux
- **RocketAI.js** : Agent IA utilisant Deep Q-Network (DQN) avec TensorFlow.js pour apprendre à contrôler la fusée
- **TrainingOrchestrator.js** : Gestionnaire d'entraînement avec métriques, checkpoints, early stopping et évaluation
- **HeadlessRocketEnvironment.js** : Environnement de simulation rapide sans rendu graphique pour l'entraînement
- **training-interface.html** : Interface web complète avec monitoring temps réel, graphiques et contrôles
- **train.js** : Scripts de démonstration et fonctions utilitaires pour l'entraînement
- **AI_TRAINING_GUIDE.md** : Documentation complète du système d'entraînement

### Fonctionnalités IA
- **Entraînement DQN** : Algorithme d'apprentissage par renforcement profond
- **Environnement Headless** : Simulation rapide sans rendu pour l'entraînement intensif
- **Métriques Temps Réel** : Suivi des performances, taux de succès, exploration
- **Sauvegarde/Chargement** : Modèles persistants avec checkpoints automatiques
- **Interface Web** : Monitoring visuel avec graphiques Chart.js et contrôles interactifs
- **Évaluation Automatique** : Tests périodiques sur environnement séparé
- **Multi-Objectifs** : Entraînement pour orbite, atterrissage, exploration

### Méthodes d'Entraînement
1. **Interface Web** : `training-interface.html` avec contrôles graphiques
2. **Console** : Fonctions `demonstrateTraining()`, `quickTraining()`, `benchmarkEnvironment()`
3. **Programmation** : Utilisation directe de `TrainingOrchestrator` avec configuration personnalisée

## Vues principales (`views/`)
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

## Contrôleurs clés (`controllers/`)
- **GameController.js** : Chef d'orchestre, boucle de jeu, gestion globale. Coordonne les autres contrôleurs (y compris `CameraController` pour la gestion de la caméra) et délègue la logique spécifique (par ex. à `RocketController`). Gère l'état du jeu (pause, etc.) et la logique de mission de haut niveau.
- **GameSetupController.js** : Responsable de l'initialisation et de la configuration de tous les composants majeurs du jeu au démarrage, y compris les modèles, les vues et les autres contrôleurs.
- **InputController.js** : Entrées clavier/souris/joystick, publie sur EventBus.
- **RocketController.js** : Gère la logique spécifique à la fusée (propulsion, rotation) en réponse aux événements d'entrée. Met à jour `RocketModel` et `ParticleSystemModel`.
- **RenderingController.js** : Coordonne toutes les vues pour le rendu. Gère le toggle d'affichage des vecteurs (touche V) et du champ de gravité/équipotentielles (touche G).
- **PhysicsController.js** : Gère le moteur Matter.js et la simulation physique globale.
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

## Points d'Entrée Importants
- **main.js** : Initialisation globale du jeu.
- **index.html** : Chargement des scripts dans le bon ordre, jeu principal.
- **training-interface.html** : Interface dédiée à l'entraînement IA.
- **train.js** : Scripts d'entraînement pour la console.
- **GameController.js** : Boucle de jeu, gestion des états principaux.
- **RenderingController.js** : Rendu global, gestion du toggle des vecteurs.
- **TrainingOrchestrator.js** : Point d'entrée pour l'entraînement IA.

## Événements IA (EventTypes.js étendu)
- **Contrôle** : `AI_TOGGLE_CONTROL`, `AI_CONTROL_CHANGED`
- **Entraînement** : `AI_START_TRAINING`, `AI_STOP_TRAINING`, `AI_PAUSE_TRAINING`, `AI_RESUME_TRAINING`
- **États** : `AI_TRAINING_STARTED`, `AI_TRAINING_COMPLETED`, `AI_TRAINING_ERROR`, `AI_TRAINING_PROGRESS`
- **Évaluation** : `AI_EVALUATION_COMPLETED`, `AI_MODEL_SAVED`, `AI_MODEL_LOADED`

## NOTES TRES IMPORTANTES : IMPORTANT : IMPORTANT : IMPORTANT
## NOTES TRES IMPORTANTES : IMPORTANT : IMPORTANT : IMPORTANT
- ** IL N'Y A PAS DE PROBLEME AVEC MATTER.JS et son plugin **
- **Chargement des scripts** : !!IMPORTANT!! Tous les scripts sont chargés via `<script>` dans `index.html` et `training-interface.html`. L'ordre d'inclusion est crucial. Il ne doit pas y avoir d'import ES6
- **Système IA** : L'entraînement fonctionne avec les vrais composants (TrainingOrchestrator, RocketAI, HeadlessRocketEnvironment). L'interface web est maintenant connectée aux vrais événements d'entraînement.
- **Calculs physiques** : !! L'accélération F/m est calculée dans `PhysicsController` (méthode `calculateGravityAccelerationAt`) avant l'appel à `Engine.update()` de Matter.js. Le plugin `matter-attractors` gère ensuite l'application de la gravité. Matter.js reste responsable des collisions et du mouvement. Pour les planètes et les lunes, les collisions sont gérées par Matter.js tandis que `SynchronizationManager.js` traite les états ou la fusée est détruite ou posée.
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités. EventBus sert pour découpler le système MVC afin de l'interfacer avec le système IA. Surtout pas d'imports ES6 on utilise window.EVENTS dans tous les contrôleurs et ailleurs pour accéder à l'EventBus.
- **Entraînement IA** : Utilise TensorFlow.js avec algorithme DQN. Trois méthodes d'entraînement disponibles : interface web, console, et programmation directe.
- **Performance** : L'environnement headless permet un entraînement rapide sans rendu graphique. Métriques temps réel disponibles.
- **Nettoyage** : Supprimer les fichiers obsolètes ou redondants dès que possible pour garder la base de code la plus propre possible.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.

////////  PROCHAINES ETAPES ENVISAGEABLES ///////

**Système IA** :
- Architectures avancées : Réseaux convolutionnels, LSTM, Actor-Critic
- Apprentissage multi-objectifs et transfert d'apprentissage
- Environnements plus complexes avec obstacles et contraintes temporelles
- Interface avancée avec visualisation de l'espace des états

**Performance et Structure** :
- Éviter les scripts "monolithiques" : chaque controller trop gros avec par exemple plus de 600 lignes (GameController.js ...) devrait être refactorisé
- En cas de très nombreux corps : envisager une structure de type Barnes-Hut pour le calcul de champ gravitationnel
- Prévoir un "GamepadController" dédié pour centraliser lecture et mapping, plutôt que de tester ad hoc sur https://hardwaretester.com.

**Fonctionnalités Jeu** :
- Extension des missions et objectifs
- Système de ressources et économie spatiale
- Multiples vaisseaux et flotte


