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
- **Chargement des scripts** : Tous les scripts sont chargés via `<script>` dans `index.html`. L'ordre d'inclusion est crucial.
- **Calculs physiques** : !! L'accélération F/m (somme des forces sur la fusée divisée par sa masse) est calculée indépendamment de Matter.js !! Le calcul des forces de gravité est ensuite envoyé à matter-attractor. Et c'est MatterJS qui calcule l'état physique suivant pour cette simulation. MatterJS doit être au centre de la détection des collisions entre objets comme la fusée et d'autres objets spatiaux de petites tailles. Pour les planètes et les lunes, Les collisions avec la fusée sont toujours gérée par MatterJS mais les états détruits et posés sont gérés par le fichier SynchronizationManager.js
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités. EventBus doit servir pour découpler les système MVC du système IA. Il y a encore pas mal de boulot à faire dans cette direction.
- **Nettoyage** : Supprimer les fichiers obsolètes ou redondants pour garder la base propre dès que possible.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.




/////////// A FAIRE POUR IMPLEMENTER SERIEUSEMENT EVENTBUS ////////.
Voici les principaux défauts et manques dans votre implantation actuelle du MVC & EventBus, et ce qu’il faut absolument améliorer :
Couplage fort entre contrôleurs
RenderingController conserve des références directes à physicsController, gameController et même particleController.
Dans render(), on va piocher dans this.gameController.universe et this.particleController.getStars() → violation du découplage MVC/EventBus.
→ Il faut que RenderingController ne reçoive rien d’autre que des événements (« PHYSICS_UPDATED », « UNIVERSE_UPDATED », etc.) et construise son état interne à partir de ces datas.
Injection de dépendances manuelle et dispersée
Vous appelez gameController.renderingController.setPhysicsController(...) depuis main.js → injection ad hoc.
GameController fait setControllers(...) mais ne gère ni la désinscription ni la vérification de cycle de vie.
→ Mettez en place un container DI ou au moins centralisez l’initialisation et la destruction des contrôleurs, avec un pattern subscribe() → unsubscribe() stocké et appelé dans cleanup().
Gestion des événements très hétérogène
Mélange de noms d’events :
INPUT_KEYDOWN vs toggleGravityField (pas de préfixe DOMAINE_).
Certains events émis directement depuis InputController plutôt que passés par un adaptateur.
→ Créez un fichier EventTypes.js (ou un enum TS) regroupant tous vos clés d’événements, p.ex.
       export const EVENTS = {
         INPUT: { KEYDOWN: 'INPUT_KEYDOWN', WHEEL: 'INPUT_WHEEL', GAMEPAD_CONNECTED: 'INPUT_GAMEPAD_CONNECTED' },
         PHYSICS: { UPDATED: 'PHYSICS_UPDATED', COLLISION: 'PHYSICS_COLLISION' },
         RENDER: { UPDATE: 'RENDER_UPDATE', TOGGLE_VECTORS: 'RENDER_TOGGLE_VECTORS' },
         // …
       };

Absence de nettoyage des abonnements
Vous ne stockez pas les callbacks de désabonnement renvoyés par eventBus.subscribe().
Dans GameController.cleanup(), vous n’appelez pas eventBus.clear() et ne désabonnez pas individuellement.
→ Pour chaque subscribe(), conservez la fonction de désinscription (unsubscribe) et appelez-la dans cleanup() pour éviter les fuites mémoire.
EventBus trop basique, sans typage ni helpers
Les payloads ne sont pas typés, pas de validation des données.
Pas de support pour un abonnement « une seule fois » (once), pas de pattern de wildcard ('PHYSICS.*').
→ Envisagez :
Une surcouche d’EventBus pour gérer once(), hasSubscribers(), wildcard, priorités.
Typage via JSDoc ou migration TypeScript pour contraindre les signatures emit(EVENTS.PHYSICS.UPDATED, payload: PhysicsState).
Responsabilités mal distribuées
GameController fait tourner la boucle, gère la physique, les traces, les missions, l’UI, l’injection de vues… → Single Responsibility Principle en berne.
→ Dédiez des micro-contrôleurs (p.ex. CameraController, ViewToggleController, MissionController) : chacun s’abonne aux events dont il a besoin et publie à son tour les siens.
Ordre de chargement et modularité
Dépendance à l’ordre des <script> dans index.html → fragile.
→ Passez en ES modules + bundler (Rollup/Vite/Webpack) : chaque contrôleur importe explicitement l’EventBus et vos types d’événements.
Configuration de l’InputController
InputController émet parfois directement toggleGravityField sans passer par un event INPUT_ACTION standard.
→ Uniformisez tout : clavier, manette et souris → un même event INPUT_ACTION ou INPUT_KEYDOWN → un middleware ViewToggleController convertit en RENDER_TOGGLE_GRAVITY.
Fusionner les mises à jour d’état
Trois events distincts (ROCKET_STATE_UPDATED, UNIVERSE_STATE_UPDATED, PARTICLE_SYSTEM_UPDATED) déclenchés à chaque frame → overhead.
→ Combinez-les en un unique SIMULATION_UPDATED (payload complet) ou regroupez par domaine. Les vues ne se réabonnent qu’à un flux de données unifié.
Absence de gestion des erreurs et de logs cohérents
EventBus catch les callbacks mais ne notifie pas de l’absence d’abonnés ni du payload incorrect.
→ Ajoutez des warnings si un event est émis sans listener, ou validez le schéma du payload (p.ex. avec ajv ou io-ts).
En corrigeant ces points, vous obtiendrez un EventBus réellement découplé et un MVC modulaire où chaque couche ne connaît que les events qu’elle publie et consomme, sans jamais toucher directement aux autres contrôleurs.
