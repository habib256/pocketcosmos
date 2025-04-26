# Guide de Structure et d'Architecture du Code

## Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons, captures d'écran)
│   ├── sound/        # Effets sonores (propulsion, collisions, voix, etc.)
│   ├── image/        # Images (fusée, planètes, etc.)
│   └── screenshots/  # Captures d'écran du jeu
├── controllers/      # Logique de contrôle, gestion des états et interactions
│   ├── BodyFactory.js
│   ├── CollisionHandler.js
│   ├── EventBus.js
│   ├── GameController.js
│   ├── InputController.js
│   ├── MissionManager.js
│   ├── ParticleController.js
│   ├── PhysicsController.js
│   ├── PhysicsVectors.js
│   ├── RenderingController.js
│   ├── RocketAgent.js
│   ├── RocketCargo.js
│   ├── SynchronizationManager.js
│   └── ThrusterPhysics.js
├── models/           # Représentation des données et de l'état
│   ├── CameraModel.js
│   ├── CelestialBodyModel.js
│   ├── ParticleModel.js
│   ├── ParticleSystemModel.js
│   ├── RocketModel.js
│   └── UniverseModel.js
├── views/            # Rendu visuel des modèles sur le canvas
│   ├── CelestialBodyView.js
│   ├── ParticleView.js
│   ├── RocketView.js
│   ├── TraceView.js
│   ├── UniverseView.js
│   ├── VectorsView.js
│   └── UIView.js
├── constants.js      # Constantes globales (physique, rendu, configuration fusée)
├── EventTypes.js     # Centralisation des clés d'événements de l'EventBus
├── index.html        # Structure HTML, chargement des librairies et scripts
├── main.js           # Point d'entrée : Initialisation de l'application et des composants
├── README.md         # Informations générales sur le projet
├── .gitignore        # Fichiers et dossiers ignorés par Git
├── LICENSE           # Licence du projet
└── favicon.*         # Icônes du site
```

## Architecture Globale (MVC étendu & EventBus)

Le projet suit une architecture MVC étendue :
- **Modèles (`models/`)** : État pur des objets (position, vitesse, fuel, etc.), sans logique de jeu complexe.
- **Vues (`views/`)** : Dessinent les modèles sur le canvas, sans modifier l'état.
- **Contrôleurs (`controllers/`)** : Orchestrent la logique, la physique, les entrées, la synchronisation et le rendu.
- **EventBus** : Système d'événements pour découpler les modules.

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
- **GameController.js** : Chef d'orchestre, boucle de jeu, gestion globale.
- **InputController.js** : Entrées clavier/souris/joystick, publie sur EventBus.
- **RenderingController.js** : Coordonne toutes les vues pour le rendu. Gère le toggle d'affichage des vecteurs (touche V) et du champ de gravité/équipotentielles (touche G).
- **PhysicsController.js** : Gère le moteur Matter.js et la simulation physique.
- **SynchronizationManager.js** : Synchronise l'état logique et physique entre modèle et moteur.
- **ThrusterPhysics.js** : Applique les forces des propulseurs de la fusée.
- **PhysicsVectors.js** : Calcule et fournit les vecteurs physiques (vitesse, accélération) pour l'affichage et la simulation.
- **CollisionHandler.js** : Gère les collisions entre corps physiques.
- **BodyFactory.js** : Crée les corps physiques Matter.js à partir des modèles.
- **EventBus.js** : Système Publish/Subscribe pour la communication interne.
- **ParticleController.js** : Gère la logique des particules (création, mise à jour, suppression).
- **MissionManager.js** : Gère la logique des missions et leurs objectifs.
- **RocketAgent.js** : Gère l'IA de contrôle de la fusée avec TensorFlow.js (prise de décision, apprentissage par renforcement).
- **RocketCargo.js** : Gère le cargo de la fusée (chargement, déchargement, gestion des ressources).

## Points d'Entrée Importants
- **main.js** : Initialisation globale.
- **index.html** : Chargement des scripts dans le bon ordre.
- **GameController.js** : Boucle de jeu, gestion des états principaux.
- **RenderingController.js** : Rendu global, gestion du toggle des vecteurs.

## NOTES TRES IMPORTANTES : IMPORTANT : IMPORTANT : IMPORTANT
- **Chargement des scripts** : !!IMPORTANT!! Tous les scripts sont chargés via `<script>` dans `index.html`. L'ordre d'inclusion est crucial. Il ne doit pas y avoir d'import ES6
- **Calculs physiques** : !! L'accélération F/m est calculée dans `PhysicsController` (méthode `calculateGravityAccelerationAt`) avant l'appel à `Engine.update()` de Matter.js. Le plugin `matter-attractors` gère ensuite l'application de la gravité. Matter.js reste responsable des collisions et du mouvement. Pour les planètes et les lunes, les collisions sont gérées par Matter.js tandis que `SynchronizationManager.js` traite les états ou la fusée est détruite ou posée.
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités. EventBus sert pour découpler le système MVC afin de l'interfacer avec le système IA. Surtout pas d'imports ES6 on utilise window.EVENTS dans tous les contrôleurs et ailleurs pour accéder à l'EventBus.
- **Nettoyage** : Supprimer les fichiers obsolètes ou redondants dès que possible pour garder la base de code la plus propre possible.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.




////////  PROCHAINES ETAPES ///////

Découplage et patterns
Éviter les scripts "monolithiques" : chaque controller un peu trop gros (plus de 600 lignes) (GameController.js ...) devrait être refactorisé

Préférer les événements Matter.js (engine.on('beforeUpdate'), world.on('collisionStart')) pour déclencher la synchronisation et la gestion des collisions, plutôt que de poller ou de vérifier manuellement dans SynchronizationManager.

Moteur physique & optimisation
Déléguer au plugin matter-attractors tout le calcul de gravité : ajouter les attracteurs (planètes, lunes) comme bodies statiques dotés de la propriété plugin.attractors.

En cas de nombreux corps : envisager une structure de type Barnes-Hut pour le calcul de champ gravitationnel

Performance Canvas & UX
S'assurer d'utiliser requestAnimationFrame pour le rendu, et ne pas mélanger avec setInterval.
Regrouper au maximum les appels de dessin sur le canvas (batching).
Pour la vue trace/particules, recycler les objets (object pooling) plutôt que de créer/supprimer à chaque frame.
Extension & évolutivité
Si vous envisagez d'étendre la logique IA (RocketAgent), isoler l'environnement de simulation dans un module "headless" pour pouvoir faire tourner de l'entraînement sans affichage.
Prévoir un "GamepadController" dédié pour centraliser lecture et mapping, plutôt que de tester ad hoc sur https://hardwaretester.com.


