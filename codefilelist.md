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
- **RocketView.js** : Affiche la fusée et ses états (propulseurs, image, crash). Ne gère plus aucun vecteur physique.
- **VectorsView.js** : Affiche tous les vecteurs physiques : poussée (rouge), vitesse, accélération totale F/m (orange, « a=F/m »), gravité, missions, etc. Centralise tout l'affichage vectoriel, indépendamment de RocketView. L'affichage des vecteurs est activable/désactivable dynamiquement (touche V, toggle global via RenderingController).
- **Champ de gravité et équipotentielles** : VectorsView.js calcule et affiche le champ de gravité généré par tous les corps célestes, soit sous forme de flèches (champ), soit sous forme de lignes équipotentielles (potentiel gravitationnel). Le mode d'affichage se toggle avec la touche G (géré globalement par RenderingController).
- **UniverseView.js** : Affiche le fond, les étoiles, et coordonne le dessin des corps célestes.
- **CelestialBodyView.js** : Affiche un corps céleste individuel.
- **TraceView.js** : Affiche la trajectoire de la fusée.
- **ParticleView.js** : Affiche les particules (propulsion, débris, effets).
- **UIView.js** : Affiche l'interface utilisateur (infos, missions, cargo, messages).

## Contrôleurs clés
- **GameController.js** : Chef d'orchestre, boucle de jeu, gestion globale.
- **InputController.js** : Entrées clavier/souris/joystick, publie sur EventBus.
- **RenderingController.js** : Coordonne toutes les vues pour le rendu. Gère le toggle d'affichage des vecteurs (touche V) et du champ de gravité/équipotentielles (touche G).
- **PhysicsController.js** : Gère le moteur Matter.js, la simulation physique.
- **SynchronizationManager.js** : Synchronise l'état logique et physique.
- **ThrusterPhysics.js** : Applique les forces des propulseurs.
- **CollisionHandler.js** : Gère les collisions.
- **BodyFactory.js** : Crée les corps physiques Matter.js.
- **EventBus.js** : Système Publish/Subscribe pour la communication interne.
- **ParticleController.js** : Gère les particules.
- **MissionManager.js** : Gère la logique des missions.

## Points d'Entrée Importants
- **main.js** : Initialisation globale.
- **index.html** : Chargement des scripts dans le bon ordre.
- **GameController.js** : Boucle de jeu, gestion des états principaux.
- **RenderingController.js** : Rendu global, gestion du toggle des vecteurs.

## Notes Importantes
- **Chargement des scripts** : Tous les scripts sont chargés via `<script>` dans `index.html`. L'ordre est crucial. Pas import/export !
- **Vecteurs physiques** : L'affichage de tous les vecteurs (poussée, vitesse, accélération totale F/m, etc.) est centralisé dans `VectorsView.js` et contrôlé globalement (touche V).
- **Champ de gravité/équipotentielles** : L'affichage du champ de gravité (flèches) et des lignes équipotentielles (potentiel) est centralisé dans `VectorsView.js` et contrôlé globalement (touche G). Outil pédagogique pour explorer la gravité multi-corps.
- **Calculs physiques** : L'accélération F/m (somme des forces sur la fusée divisée par sa masse) est calculée indépendamment de Matter.js, puis utilisée pour l'affichage et la simulation. Tout comme la physique des corps celestes.
- **EventBus** : Comprendre les événements échangés est essentiel pour le debug ou l'ajout de fonctionnalités.
- **Nettoyage** : Supprimer les fichiers obsolètes ou redondants pour garder la base propre.
- **Test manette** : Pour identifier les axes/boutons du gamepad, utiliser https://hardwaretester.com/gamepad.
- La classe EventBus utilise  la méthode emit pour publier des événements 