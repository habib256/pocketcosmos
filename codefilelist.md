# Guide de Structure et d'Architecture du Code

## Structure des Dossiers

```
├── assets/           # Ressources statiques (images, sons, captures d'écran)
│   ├── sound/        # Effets sonores (propulsion, collisions, voix, etc.)
│   ├── image/        # Images (fusée, planètes, etc.)
│   └── screenshots/  # Captures d'écran du jeu
├── controllers/      # Logique de contrôle, gestion des états et interactions
├── models/           # Représentation des données et de l'état (fusée, univers, etc.)
├── views/            # Rendu visuel des modèles sur le canvas
├── constants.js      # Constantes globales (physique, rendu, configuration fusée)
├── EventTypes.js     # Centralisation des clés d'événements de l'EventBus
├── main.js           # Point d'entrée : Initialisation de l'application et des composants
├── index.html        # Structure HTML, chargement des librairies et scripts
├── README.md         # Informations générales sur le projet
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

## Notes Importantes
- **Chargement des scripts** : !!IMPORTANT!! Tous les scripts sont chargés via `<script>` dans `index.html`. L'ordre d'inclusion est crucial.
- **Calculs physiques** : !! L'accélération F/m (somme des forces sur la fusée divisée par sa masse) est calculée indépendamment de Matter.js !! Le calcul des forces de gravité est ensuite envoyé à matter-attractor. Et c'est MatterJS qui calcule l'état physique suivant pour cette simulation. MatterJS doit être au centre de la détection des collisions entre objets comme la fusée et d'autres objets spatiaux de petites tailles. Pour les planètes et les lunes, Les collisions avec la fusée sont toujours gérée par MatterJS mais les états détruits et posés sont gérés par le fichier SynchronizationManager.js
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités. EventBus doit servir pour découpler les système MVC du système IA. Il y a encore pas mal de boulot à faire dans cette direction.
- **Nettoyage** : Supprimer les fichiers obsolètes ou redondants pour garder la base propre dès que possible.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.

## Gestion des événements très hétérogène
Mélange de noms d'événements :
INPUT_KEYDOWN vs toggleGravityField (pas de préfixe DOMAINE_).
Certains événements émis directement depuis InputController plutôt que passés par un adaptateur.
→ Créez un fichier EventTypes.js qui regroupe tous vos clés d'événements. Par exemple :
```js
export const EVENTS = {
  INPUT: {
    KEYDOWN: 'INPUT_KEYDOWN',
    KEYUP: 'INPUT_KEYUP',
    KEYPRESS: 'INPUT_KEYPRESS',
    WHEEL: 'INPUT_WHEEL',
    MOUSEDOWN: 'INPUT_MOUSEDOWN',
    MOUSEMOVE: 'INPUT_MOUSEMOVE',
    MOUSEUP: 'INPUT_MOUSEUP',
    TOUCHSTART: 'INPUT_TOUCHSTART',
    TOUCHMOVE: 'INPUT_TOUCHMOVE',
    TOUCHEND: 'INPUT_TOUCHEND',
    GAMEPAD_CONNECTED: 'INPUT_GAMEPAD_CONNECTED',
    GAMEPAD_DISCONNECTED: 'INPUT_GAMEPAD_DISCONNECTED',
    JOYSTICK_AXIS_CHANGED: 'INPUT_JOYSTICK_AXIS_CHANGED',
    JOYSTICK_AXIS_HELD: 'INPUT_JOYSTICK_AXIS_HELD',
    JOYSTICK_AXIS_RELEASED: 'INPUT_JOYSTICK_AXIS_RELEASED',
    JOYSTICK_BUTTON_DOWN: 'INPUT_JOYSTICK_BUTTON_DOWN',
    JOYSTICK_BUTTON_UP: 'INPUT_JOYSTICK_BUTTON_UP',
    KEYMAP_CHANGED: 'INPUT_KEYMAP_CHANGED',
    KEYMAP_RESET: 'INPUT_KEYMAP_RESET'
  },
  PHYSICS: {
    UPDATED: 'PHYSICS_UPDATED',
    COLLISION: 'PHYSICS_COLLISION'
  },
  RENDER: {
    UPDATE: 'RENDER_UPDATE',
    TOGGLE_VECTORS: 'RENDER_TOGGLE_VECTORS',
    TOGGLE_GRAVITY_FIELD: 'RENDER_TOGGLE_GRAVITY_FIELD'
  },
  SIMULATION: {
    UPDATED: 'SIMULATION_UPDATED'
  },
  UI: {
    UPDATE: 'UI_UPDATE',
    CREDITS_UPDATED: 'UI_UPDATE_CREDITS'
  },
  ROCKET: {
    STATE_UPDATED: 'ROCKET_STATE_UPDATED',
    LANDED: 'ROCKET_LANDED'
  },
  UNIVERSE: {
    STATE_UPDATED: 'UNIVERSE_STATE_UPDATED'
  },
  PARTICLE_SYSTEM: {
    UPDATED: 'PARTICLE_SYSTEM_UPDATED'
  },
  SYSTEM: {
    CONTROLLERS_SETUP: 'CONTROLLERS_SETUP'
  },
  MISSION: {
    FAILED: 'MISSION_FAILED',
    COMPLETED: 'MISSION_COMPLETED'
  },
  AI: {
    TOGGLE: 'TOGGLE_AI_CONTROL'
  }
};
```
