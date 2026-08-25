# TODO — Pocket Cosmos

Dettes techniques, incohérences connues et feuille de route. Priorisé. Chaque item référence le code
réel. Voir [PHYSICS.md](PHYSICS.md) pour les détails physiques, [CHANGELOG.md](CHANGELOG.md) pour
l'historique, [CLAUDE.md](CLAUDE.md) pour l'architecture.

Légende priorité : 🔴 haute · 🟠 moyenne · 🟢 basse.

---

## Chasse aux bugs 8 (2026‑08‑25) — correctifs restés partiels & arbitrages

> Ces points viennent de la 8ᵉ passe (voir [CHANGELOG.md](CHANGELOG.md)). Chacun a été **mesuré au
> banc** ; ce qui manque est indiqué précisément, avec l'effet observé de son absence.

### ✅ ~~`RocketController.unsubscribeAll` / `MissionManager.unsubscribeAll` manquantes~~ — fait le 2026‑08‑25
Les deux méthodes ont été ajoutées, et l'abonnement `UNIVERSE_STATE_UPDATED` de
`SynchronizationManager` — jusque‑là confié au seul `controllerContainer` global, purgé uniquement au
teardown de l'application — est désormais aussi désabonné par instance dans `cleanup()`. C'était la
dernière fuite résiduelle. Mesuré sur 5 cycles création/nettoyage d'environnement : **14 → 1 → 2 →
3 → 4 → 5** écouteurs avant, **14 → 0** à chaque cycle après. Voir [CHANGELOG.md](CHANGELOG.md).

### 🔴 `RocketAI._navigateTravelDistance` n'est assigné nulle part
`RocketAI.js` le lit (passage à `positionScaleForTask`) mais un balayage du dépôt ne renvoie que
cette lecture : la propriété vaut toujours `undefined` et le jeu retombe sur
`DEFAULT_POSITION_SCALE = 150000` alors que `TrainingOrchestrator.getPositionScale` calcule
|B−A| = 127 279,22 — **17,85 % d'écart** mesuré sur les dims 0/1/7. Pas une régression (c'était déjà
le cas), mais la parité annoncée n'est pas atteinte sur `navigate`. Latent aujourd'hui :
`setObjective` n'est appelé que par l'orchestrateur, donc en jeu `currentObjective` vaut toujours
`'orbit'` et la branche `'navigate'` est inatteignable. *Action :* assigner la distance de trajet
quand un objectif `navigate` est posé en jeu, ou retirer le paramètre et documenter le repli.

### ✅ ~~`GameController` ne passe pas `deltaTime` à `inputController.update()`~~ — fait le 2026‑08‑25
Les trois appels (états `GAME_OVER`, `PAUSED`, et `update(deltaTime)`) transmettent désormais le pas
de temps, achevant le correctif du zoom analogique. Le consommateur était déjà prouvé indépendant du
framerate dès que `data.deltaTime` est fourni (1 s simulée : même zoom à 60 et 144 Hz, écart 8e‑15).

### 🟠 `constants.js` — `STATE_VERSION` doit passer de 2 à 3
La dim 7 (distance à la cible) suit désormais l'échelle positionnelle effective au lieu de
`DISTANCE_SCALE` fixe. `AI_TRAINING.STATE.STATE_VERSION` est le **seul** champ réellement vérifié par
`AIModelStore` au chargement : sans ce bump, un modèle entraîné avant le changement se charge alors
que ses entrées ont changé d'échelle. Sans risque (`assets/models/` ne contient qu'un README).
Corriger dans la foulée le commentaire de `DISTANCE_SCALE` (« même échelle que POSITION_SCALE »,
faux : la clé n'est plus lue par `buildStateVector`) sans supprimer la clé.

### 🟠 `views/UIView.js` — trois consommateurs manquants
- **Stations** : `STATION_DOCKED` et `STATION_REFUELED` sont émis (le second est désormais honnête et
  porte `added` = carburant réellement ajouté) mais **n'ont toujours aucun abonné** : le ravitaillement
  reste totalement silencieux pour le joueur. *Action :* texte fugace type « ⛽ Accostage / Ravitaillement
  — <station> », sur le modèle de `_renderMissionSuccessText`.
- **Contrôle IA** : `AI_CONTROL_CHANGED` est émis par `RocketAI` sans abonné — la touche `I` n'a aucun
  retour visuel. Le témoin 🤓 de l'aide au pilotage (touche `H`) est en place et peut servir de patron.
  Ne **pas** décommenter `setAssistedControlsActive` : rien ne l'appelle, le chemin est l'événement.
- **Cargo** : la seconde occurrence de `ctx.fillText("Cargo:", …)` dans `_renderCargoSection` (branche
  où `rocketModel.cargo` est garanti non nul) peut afficher `getCurrentLoad()/getMaxCapacity()`.
  Laisser inchangée l'occurrence de la branche « Vide », où `rocketModel`/`cargo` peuvent être absents.

### 🟠 Objectif `explore` : le corps de DÉPART n'est plus crédité
Effet de bord du correctif du bonus « nouveau corps » : l'enregistrement se fait maintenant au
versement du bonus, c'est‑à‑dire **après** le pas physique. Une politique qui décolle dès le pas 0
n'est donc plus posée au moment de l'enregistrement et perd le corps de départ ; `checkExplorationSuccess()`
exigeant 2 corps distincts, elle doit réussir **deux** atterrissages au lieu d'un. *A/B mesuré* :
en passif, `visites=["Terre"]` et `r[0] = 9,99` (base : `-0,01`) — le correctif marche ; au décollage
immédiat, `visites=[]` (base : `["Terre"]`). Non corrigé volontairement : enregistrer dans `reset()`
reprivatiserait le bonus du corps de départ, donc annulerait le correctif. Arbitrage de conception.

### 🟠 Masse de la cargaison non câblée dans la physique
`RocketCargo.getTotalMass()` (1 unité = 10 kg) n'est appelée nulle part ; `RocketModel.mass` et
`momentOfInertia` sont figés sur `ROCKET.MASS`, et `BodyFactory` crée le corps Matter avec
`mass`/`inertia` constants. **Aucun `Matter.Body.setMass` / `setInertia` n'existe dans le dépôt.**
Câbler la masse imposerait ces deux appels à chaque `add`/`remove`/`clearCargo` et rééquilibrerait la
poussée utile (~−6 % d'accélération à pleine charge, 100 kg sur 1500) : décision de conception, pas
correctif de bug. `getTotalMass()` est conservée comme point d'accroche et son JSDoc le dit
désormais.

### 🟠 Reproductibilité : poids initiaux et `model.fit()` non seedés (option A à trancher)
La graine rend déterministes l'angle initial par épisode, l'exploration epsilon et l'échantillonnage
du minibatch — **pas** les poids initiaux du réseau ni le rebrassage interne de `model.fit()`. Un run
seedé n'est donc pas rejouable bit à bit. *Action possible :* dériver une graine du RNG injecté vers
`tf.initializers.glorotUniform({ seed })` (+ `biasInitializer: 'zeros'`) sur les quatre couches
denses, passer `shuffle: false, batchSize` à `fit()`, et remonter l'injection `rocketAI.rng = this.rng`
avant `waitForReady()` dans `initializeAgent` (les trois vont ensemble ; la troisième seule est sans
effet).

### 🟢 `constants.js` — annotations de constantes devenues (in)actives
- `PHYSICS.RESTITUTION` (0,2) : **plus aucun lecteur** depuis que `BodyFactory` a cessé de la passer
  à `Bodies.circle` (elle était de toute façon écrasée par `Body.setStatic`, mesuré `rest=0 fric=1`).
  Soit la supprimer, soit la re‑commenter comme inerte. Ne **pas** toucher à `IMPACT_DAMAGE_FACTOR`
  (1,0), `CRASH_SPEED_THRESHOLD` (2500) ni `LANDING_MAX_SPEED` (2500) : leur commentaire décrit
  désormais le comportement réel, le chemin de dégâts en u/s étant enfin actif.
- `RENDER.GRAVITY_SCALE_FACTOR` (3000) et `GRAVITY_MAX_LENGTH` (120) sont **redevenues lues** par
  `VectorsView` (branche du vecteur `g`) : ne pas les supprimer. `GRAVITY_VECTOR_SCALE` (150) et
  `GRAVITY_ARROW_SIZE` (15) restent non lues : les annoter `// NON LU`.
- Ajouts facultatifs, **non bloquants** (les deux sites utilisent déjà un repli, comportement
  identique avec ou sans) : `RENDER.WHEEL_NOTCH_DELTA: 100` (normalisation de la molette) et
  `RENDER.ZOOM_RATE_PER_SECOND: 1.0` (gain du zoom analogique).

### 🟢 Divers, non bloquant
- **`main.js`** : ajouter la ligne « H — Aide au pilotage (stabilisation de la rotation) » au tableau
  des contrôles, après la ligne « C ». Le témoin 🤓 du HUD est déjà branché.
- **`main.js`** : le cas « canvas absent » reste **silencieux** (garde propre qui fait `return` sans
  lever) — l'overlay d'erreur ne le couvre pas.
- **`TrainingOrchestrator.getPositionScale`** : peut déléguer à `RocketAI.positionScaleForTask` (les
  deux chemins donnent aujourd'hui la même valeur, 2220 — déduplication de règle, pas correctif).
- **`RocketAI.train()`** : les deux gardes qui remplacent silencieusement une expérience de dimension
  invalide par `Array(STATE_SIZE).fill(0)` mériteraient un avertissement throttlé (c'est ce silence
  qui rendait `testUpdateFrequency()` faussement rassurant).
- **Piège de banc, pas un bug produit** : `CustomEvent` est absent du sandbox du harnais, ce qui fait
  lever `CollisionHandler` sur tout chemin de crash en headless. Pré‑existant (ligne identique dans
  `HEAD`), global présent dans tout navigateur. Combler avec un stub (`sb.CustomEvent = class {}`) —
  à ne pas confondre avec une régression lors des prochaines passes.
- **`initializeEnvironments` force `navigateMaxSteps = max(config.maxStepsPerEpisode, 4000)`** : un
  `maxStepsPerEpisode` plus petit est ignoré sur `navigate` (~48 s par épisode au banc). Comportement
  d'exploitation à connaître, pas un bug.

### Deux faux positifs écartés par la mesure — ne pas les re‑chasser
- **« Le throttle du champ de gravité ne réutilise jamais sa grille (terme `bodiesHash`) »** : faux.
  88 réutilisations sur 120 frames à zoom 0,2, 115 sur 119 à zoom 0,05. |Δ`bodiesHash`|/frame = 3,42
  pour un quantum de 8 : la somme varie **moins** que le quantum. L'invalidation vient du déplacement
  réel d'un corps rapide (Phobos, 15,6 u/frame ≈ 2 quanta) ; sans Phobos ni Deimos les recalculs à
  zoom 1 tombent de 118/120 à 57/120. Le critère (demi‑cellule) est donc légitime ; le « correctif »
  proposé le relâcherait d'un facteur 20.
- **« Le bouton audio affiche 🔇 au lancement alors que le son est actif »** : faux. `setupAudioUnlock()`
  (`index.html`, posé sur `load`) écrit `🔊` au premier geste utilisateur, obligatoirement le clic
  « Prêt ! » (qui ne stoppe pas la propagation). Avant ce geste le panneau d'options est
  `display:none` et aucun son ne peut être déclenché. Coder `🔊` en dur ferait mentir le bouton.

---

## Constats de la passe du 2026‑08‑25 (non corrigés — décision à prendre)

### 🟠 Aucun pilote PNJ n'est réellement chargé au démarrage
`assets/models/README.md` et `CLAUDE.md` décrivent la livraison de modèles pré‑entraînés, et
`AIModelStore.load()` sait bien retomber sur `assets/models/<nom>/model.json`. Mais **aucun code
côté jeu n'appelle `loadModel()`** : ni `main.js`, ni `GameSetupController`, ni `GameController`.
`makeDecision()` reste donc sur l'heuristique `maintainOrbit` même une fois un modèle livré, et le
dossier `assets/models/` ne contient encore que son README. Il manque le branchement — et une
décision sur QUAND charger (au démarrage ? à l'apparition d'un PNJ ?) et sur le comportement en cas
d'absence ou d'incompatibilité du modèle.

### 🟠 Champ de gravité : 58 % du budget d'une frame en vol
Mesuré sur banc : un recalcul complet de la grille coûte **9,6 ms** (grille 80×80 = 6400 points ×
21 corps), soit ~58 % des 16,7 ms d'une frame à 60 fps. Le frein de 150 ms sert désormais dès que la
caméra est lente ou immobile, mais à vitesse de croisière (~2500 u/s) la caméra franchit plus d'une
cellule de grille par frame : le recalcul y reste **nécessaire pour rester exact** (179 recalculs
sur 180 frames mesurés). Réduire le coût demande de baisser la densité de la grille (80×80 → 40×40
diviserait le coût par 4), ce qui change l'aspect visuel — d'où l'arbitrage laissé au propriétaire.
Le coût est opt‑in (touche G).

### 🟢 Code mort laissé en place volontairement
- `RocketAI.STATE_SCALE_VERSION` (= **5** depuis le 2026‑08‑25), `MODEL_STORAGE_KEY`,
  `MODEL_META_KEY` : plus aucun lecteur. `STATE_SCALE_VERSION` documente encore la convention
  d'échelle — voir la mise en garde dans CLAUDE.md (§ vecteur d'état) : un modèle sauvegardé sous une
  ancienne convention se charge malgré tout, seuls `stateVersion`/`stateSize`/`actionCount` étant
  validés. ⇒ d'où le bump `STATE_VERSION` 2 → 3 réclamé plus haut.
- `PHYSICS.RESTITUTION` : plus aucun lecteur depuis le 2026‑08‑25 (cf. section « Chasse aux bugs 8 »).
- `RENDER.GRAVITY_VECTOR_SCALE` et `GRAVITY_ARROW_SIZE` : non lues. En revanche
  `GRAVITY_SCALE_FACTOR` et `GRAVITY_MAX_LENGTH` sont **redevenues lues** (vecteur `g` de
  `VectorsView`) — ne pas les supprimer. Le mode flèches du champ de gravité n'utilise, lui, aucune
  de ces quatre constantes : il encode désormais l'intensité en échelle **log relative à la plage de
  la vue**, plus par seuils absolus.
- `RocketAI.autoSaveIfNeeded()` : aucun appelant ; sa condition porte sur `this.totalSteps`, qui
  n'est plus incrémenté depuis le retrait de `step()`.
- `RocketAI.epsilonDecayManagedExternally` : écrit par l'orchestrateur, lu par personne (sa garde
  vivait dans le chemin de décroissance supprimé).
- `HeadlessRocketEnvironment.calculateCrashMoonReward` / `calculateOrbitReward` /
  `calculateExplorationReward` : inatteignables, `calculateObjectiveSpecificReward` neutralisant
  délibérément ces objectifs (source unique de récompense par objectif). `calculateOrbitReward` est
  le seul lecteur restant de `ORBIT.TARGET_ORBITAL_SPEED`/`ALTITUDE_TOLERANCE`/`SPEED_TOLERANCE` et
  de `REWARDS.TOO_CLOSE_PENALTY`/`TOO_FAR_PENALTY`, désormais morts eux aussi.
- `PhysicsVectors.calculateEarthAttractionVector` / `calculateLunarAttractionVector` : conservées,
  mais plus appelées — leurs deux branches d'affichage dans `VectorsView` sont inatteignables.

### ✅ RÉSOLU (2026‑08‑25) — Diagnostics de `train.js` construits sur 10 dimensions
`diagnosticComplet()` fabriquait des tenseurs à 10 dimensions pour un réseau à 12 entrées : l'appel
levait à chaque fois (exception attrapée et affichée « ❌ Erreur lors du diagnostic »), et
`testUpdateFrequency()` empilait des expériences que `RocketAI.train()` remplaçait silencieusement
par des vecteurs nuls. Les deux utilisent désormais `RocketAI.STATE_SIZE`. *Mesuré* : le diagnostic
va jusqu'au bout (le test 5 n'apparaissait jamais). **Reste** : les gardes silencieuses de
`RocketAI.train()` mériteraient un avertissement throttlé — c'est ce silence qui rendait
`testUpdateFrequency()` faussement rassurant (cf. section « Chasse aux bugs 8 »).

### 🟢 `_initialDistanceToTarget` et l'écriture `a - b || 0`
`HeadlessRocketEnvironment` utilise `a - b || 0`, qui écrase un delta légitimement nul. Pour le rôle
`intercept`, cette distance initiale est en outre calculée face à une cible **déjà déplacée**.

---

## Entraînement IA — fondations PNJ/adversaires (2026‑07‑03)

> But : entraîner des pilotes IA fiables **et réutilisables** comme futurs PNJ (course, trafic
> ambiant, poursuite/intercept, coop). Priorité retenue : **qualité d'entraînement d'abord**.
> Voir [CHANGELOG.md](CHANGELOG.md) (2026‑07‑03), [CLAUDE.md](CLAUDE.md) §AI, [PHYSICS.md §1.5](PHYSICS.md).

### ✅ Phase 1 livrée
- ✅ **Persistance nommée (model zoo)** : `AIModelStore.js` (IndexedDB + export/import fichiers +
  fallback `assets/models/`). Fin du modèle unique éphémère en localStorage.
- ✅ **Saturation d'état corrigée** : échelle vitesse 1000→2500, clamp ±2→±4 ; échelles centralisées
  dans `AI_TRAINING.STATE`. État porté à **12 dims** (`STATE_VERSION 2`, dims 10‑11 = vitesse cible,
  = 0 si fixe → prêt pour cibles mobiles). Rupture des modèles v1 assumée (aucun livré).
- ✅ **Conversion Matter→u/s centralisée** : `PhysicsVectors.matterToGameVelocity` (fin de la
  duplication de `1000/60` sur 4 sites).
- ✅ **Métriques** : steps/s, taux de succès glissant (50 ép.), médiane steps→succès + panneau zoo UI.

### ✅ Phase 2 livrée
- ✅ **Double DQN** (`RocketAI.train`) : argmax via le modèle online, valeur via le target.
- ✅ **IA = inférence pure en jeu** : `RocketAI.step()` et `RocketAI.calculateReward()` (orbit hardcodé,
  divergent) supprimés → **une seule définition de récompense** (l'environnement). `makeDecision` utilise
  le réseau si un modèle est chargé, sinon repli `maintainOrbit`.
- ✅ **`SAFETY.MAX_SIMULATION_DISTANCE` appliqué** (borne par objectif) → terminaison `out_of_bounds`.
- ✅ **RNG seedé** (`SeededRandom.js`, `config.seed`) + jeu d'éval fixe → `compareModels(a, b)`.
- 🟢 **Reste (optionnel)** : replay priorisé léger (flag A/B, tirage O(n) sur |TD‑error|) ; extraction
  d'un `RewardEngine.js` (le reward est déjà à définition unique, l'extraction est cosmétique — la faire
  au moment des rewards par rôle de la phase 3).

### ✅ Phase 3 livrée
- ✅ `AI_TRAINING.ROLES` (race/intercept/lander/orbiter) + résolution rôle→objectif dans l'orchestrateur.
- ✅ **Cibles mobiles** (`intercept`) : patterns linéaire/circulaire, `getObservation` expose
  `targetVX/VY` → **dims 10‑11 du vecteur d'état activées**. Succès `proximity` (rester à portée K steps).
- ✅ **Bonus de course** (`race`) : récompense terminale ∝ steps restants + pénalité par step accrue.
- ✅ **File de runs séquentiels** (`runCurriculum`) : `config.trainingRuns` + warm‑start (`loadFrom`).
- ✅ UI : dropdown « Rôle ».
- ⏳ **Reste manuel** : entraîner et committer les premiers modèles dans `assets/models/<nom>/`
  (`model.json` + `meta.json`) pour chargement au démarrage par les PNJ.

### Intégration PNJ en jeu (au-delà de l'entraînement) — à faire
> Faire voler **plusieurs** fusées PNJ en jeu demandera de généraliser `PhysicsController` /
> `RocketController` / `SynchronizationManager`, qui supposent aujourd'hui **une seule fusée**
> (`this.rocketModel`/`rocketBody` singuliers ; événements propulseurs sans identité de fusée).
> `RocketAI` est déjà DI‑friendly (`injectDependencies`) et fait de l'inférence pure — prêt à piloter
> un PNJ une fois un modèle chargé (`_modelLoaded`). Ajouter aussi des catégories de collision
> par‑fusée (`BodyFactory`) pour les rôles de combat/poursuite.

---

## Incohérences d'unités (physique) — ✅ RÉSOLU (2026‑06‑04)

> Racine : `deltaTime` en secondes vs Matter en ms ([PHYSICS.md §1](PHYSICS.md)). Le bon facteur de
> conversion `model.velocity (u/s) → vitesse Matter` est `× 1000/60`, désormais **centralisé** dans
> `constants.js` (`PHYSICS.MATTER_BASE_DELTA`) et appliqué partout. Toutes les conversions étaient en
> `× deltaTime` (~1000× trop petit). Corrigé et **vérifié par harnais headless** (vrai Matter.js).

- ✅ Détection atterrissage/crash enfin **relative** au corps (`CollisionHandler.getCelestialBodyVelocity`).
  Test headless : une fusée co‑mobile avec un corps rapide (~960 u/s) est maintenant détectée comme
  **atterrissage** (était un **crash**), sans régression du décollage (dérive/catapulte inchangées).
  Achève l'intention du commit `0e9546e`.
- ✅ Stabilisation posé/débris (`SynchronizationManager`), vélocité de collision des corps
  (`PhysicsController` étape 1), vélocité de spawn (`GameSetupController`) : toutes en `× MATTER_BASE_DELTA`.
- ✅ Constante `MATTER_BASE_DELTA` centralisée dans `constants.js` (plus de `1000/60` en dur).

> Reste à valider **en jeu réel** : l'atterrissage sur les lunes rapides (Phobos `orbitSpeed=0.8`,
> Deimos, Io…) devrait désormais être possible quand on co‑bouge avec elles.

---

## Constante de gravité — ✅ RÉSOLU (2026‑06‑04, Option A)

> `PHYSICS.G` est désormais la **source unique** (= 0,001) : `PhysicsController.initPhysics` et
> `GameSetupController` copient `PHYSICS.G` dans `MatterAttractors.Attractors.gravityConstant`.
> ⇒ gravité réelle = visualisation = IA. **Gameplay inchangé** (la gravité réelle était déjà 0,001 ;
> seules la viz et l'IA étaient fausses). `physics.G` des 6 presets passés à 0,001. Vérifié en
> headless (gravité réelle inchangée). Voir [PHYSICS.md §2](PHYSICS.md).

- 🟠 **Reste à valider** : le calibrage absolu des cibles `AI_TRAINING.ORBIT` (recalculées ×√10 pour
  G=0,001) — à confirmer par un **entraînement réel** de l'objectif `orbit`.
  Mise à jour 2026‑08‑24 : l'**incohérence d'unités** est corrigée (les comparaisons se faisaient en
  échelle Matter contre des seuils en u/s, soit ~16,7× trop bas — l'orbite ne pouvait jamais être
  validée). `checkOrbitSuccess` / `checkLandingSuccess` / `calculateOrbitReward` / shaping `orbit` et
  `explore` convertissent désormais via `_rocketSpeedUnitsPerSec()`. Conséquence : les magnitudes de
  récompense `orbit`/`land` changent fortement — re-calibrage empirique à refaire.
- 🟢 **Unités à trancher** (hors périmètre du correctif) : `calculateLandingReward()` (`speed < 5`) et
  `calculateExplorationReward()` (code actuellement neutralisé) comparent encore des seuils codés en
  dur à la vitesse brute — décider de leur unité cible.

---

## Équilibrage des mondes

> ⚠️ **Intention de design (confirmée)** : tous les corps n'ont PAS à être décollables avec le
> vaisseau actuel. Certaines planètes à forte gravité sont **volontairement inaccessibles** ; des
> vaisseaux à poussée supérieure viendront plus tard. La contrainte forte est donc : **le corps de
> SPAWN de chaque monde DOIT être décollable** (sinon le joueur est bloqué dès le départ).

- ✅ **`4_Tatoo` : spawn Tatooine rendu décollable** (masse 3e11 → 1,4e11, ratio 0,85 → 1,82). Tous
  les corps de spawn des 6 mondes sont désormais décollables.
- ✅ **Audit réalisé** (script de rapport poussée/gravité par corps). Spawns décollables : Terre,
  Kerbin, Âtrebois, Forêt‑lune d'Endor, Acheron. Corps volontairement « lourds » (géantes gazeuses /
  étoiles binaires, non‑spawn — cibles de futurs vaisseaux) : Jupiter, Saturne, Uranus, Ohann,
  Adriana, Endor Prime, Calpamos, Tatoo II, Zeta I/II — laissés tels quels.
- 🟢 Cibles rocheuses < 1 hors spawn (Moho 0,60 · Minmus 0,89 · Duna 0,85 dans Kerbol) : à arbitrer si
  on veut les rendre accessibles au vaisseau actuel (sinon, ce sont des cibles « futur vaisseau »).

---

## Hygiène / debug

- ✅ **`globalThis.DEBUG` repassé à `false`** ; les logs de décollage les plus fréquents (`[LIFTOFF]`,
  `[DECOLLAGE]`) sont gatés derrière `if (globalThis.DEBUG)`. Reste quelques logs d'événements
  discrets (atterrissage confirmé, position relative des débris) non gatés — gating optionnel.
- ✅ **Constantes en dur remontées dans `constants.js`** : `LANDING_PROXIMITY_THRESHOLD` (15),
  `CRASH_SINK_DEPTH` (40) et `MATTER_BASE_DELTA` (1000/60). Restent mineurs : `COLLISION_THRESHOLD`
  (2,5) et le seuil de décollage local.

---

## Robustesse / risques

- ✅ **Rechargement d'univers pendant un décollage/atterrissage** (2026‑06‑04). La simulation est déjà
  mise en pause pendant la reconstruction, mais le même `rocketModel` était réutilisé sans purge :
  propulseurs encore actifs → redécollage immédiat du nouveau spawn ; `relativePosition`/`attachedTo`
  périmés → téléport ; grâce active → atterrissage non détecté. Fix : `buildWorldFromData` appelle
  `rocketModel.reset()` avant d'appliquer le spawn — **inconditionnellement depuis le 2026‑08‑25** :
  l'appel était enfermé dans le garde `if (data.rocket.spawn)`, donc un preset sans spawn laissait
  survivre l'épave d'un crash (retour immédiat en `CRASH_ANIMATION`) et les propulseurs allumés.
  Vérifié headless (reload en tenant la poussée :
  avant = redécollage `power=1000` ; après = reste posé `power=0`). `SynchronizationManager` efface
  déjà `isLanded/landedOn/relativePosition` si le corps `landedOn` est introuvable.
- 🟢 **`relativePosition` recalculée une seule fois** à l'atterrissage sur corps mobile ; dérive
  visuelle possible sur corps très rapides. *Action :* recalcul périodique si dérive mesurée.

---

## Chasse aux bugs — items différés (2e passe, 5 agents)

> Le « Tier 1 » (8 bugs sûrs : O1 missions, P1/P2 physique, D1 respawn, O2/O3 reload, R1 rendu,
> A1 tracé IA) est **corrigé** — voir [CHANGELOG.md](CHANGELOG.md). Ci-dessous : trouvailles réelles
> mais à traiter avec prudence (balance/tuning non validable sans playtest/entraînement) ou mineures.

- 🟠 **P3 — Échelle des dégâts de collision — à REVALIDER en jeu (2026‑08‑25).** Les constantes sont
  maintenant cohérentes (`IMPACT_DAMAGE_FACTOR` = 1,0 exprimé en u/s, `COLLISION_THRESHOLD` = 2,5) et,
  surtout, le chemin de dégâts partiels est **atteignable pour la première fois** : jusqu'au
  2026‑08‑25 `collisionStart` lisait une vitesse ~1000× trop petite, donc aucun contact n'appelait
  jamais `applyDamage`. Mesures au banc après correctif (vol rasant, 240 frames) : 20 u/s + 50 % de
  poussée → 40,7 dmg ; 50 u/s + 50 % → 60,2 ; 120 u/s + 50 % → destruction. Décollage normal : 0 dmg.
  **Sensible au gameplay** → playtester avant de retoucher les deux constantes.
- ✅ **A2 — Isolation des environnements d'entraînement — traité le 2026‑08‑25.** L'`EventBus` reste
  partagé entre `trainingEnv`/`evaluationEnv`, mais `HeadlessRocketEnvironment.cleanup()` est
  désormais effectif : `unsubscribeAll()` existe côté `RocketController` et `MissionManager`, et
  `SynchronizationManager.cleanup()` désabonne aussi son écouteur `UNIVERSE_STATE_UPDATED`.
  Mesuré : 14 écouteurs créés puis **0** résiduels à chaque cycle création/nettoyage.
- 🔴 **Apprentissage IA inactif (`successfulTrainings = 0`).** `RocketAI.train()` est appelé ~1,5M
  fois mais n'aboutit JAMAIS à une mise à jour des poids (perte plate à 0 ; la hausse de récompense est
  un artefact de la décroissance d'epsilon). Instrumentation throttlée ajoutée (`_diagTrain` + `catch`
  non muet `RocketAI.js`). *Action :* **relancer ~30 s d'entraînement et lire la console** (`[RocketAI.train]
  guard:` vs `fit:`) pour la cause exacte (garde l.652 vs exception `model.fit`), puis corriger la racine.
- ✅ **A3/A4/A5 — Calibrage vitesse IA (cohérence d'unités).** État + récompenses navigate + succès
  mesurés en **u/s** (÷ `MATTER_BASE_DELTA`) ; dé-saturation du vecteur d'état vérifiée (croisière
  0,382 au lieu de 2,0 saturé) ; poids de stabilisation dédié `STABILIZE_REWARD_WEIGHT`. **Valeurs
  absolues à valider par un entraînement** une fois l'apprentissage rétabli (item ci-dessus).
- 🟢 **Nettoyage / cosmétique.** `angularDamping` inopérant (propriété absente de Matter.js) ; events/
  états morts (`ROCKET.CRASHED`, `ROCKET.STATE_UPDATED`, `GAME.GAME_STARTED`, états FSM inatteignables) ;
  ceintures d'astéroïdes mondes 5/6 centrées sur l'origine (cosmétique) ; `narratives`/`timeStepMs`
  parsés mais jamais lus ; dégradé d'anneaux « front » désaligné ; gardes de parsing preset
  (`parentName` introuvable, `spawn.angle` manquant) sans avertissement.

---

## Architecture / scalabilité (roadmap)

- 🟢 **Découper `GameController`** (monolithique : FSM, boucle, chargement d'univers, médiation
  d'événements) en modules dédiés.
- 🟢 **Gravité en quad‑tree** pour de grands univers (actuellement O(n) par frame sur les corps).
- 🟢 **`GamepadController` dédié** (aujourd'hui mêlé à `InputController`/`RocketController`).
- 🟢 **IA avancée** : Actor‑Critic / LSTM, environnements d'entraînement plus riches.
- 🟢 **Gameplay** : étendre les missions, gestion de ressources, plus de corps célestes.

---

## Outillage

- 🟠 **Aucun test, lint, ni build.** Test manuel uniquement. *Action :* un harnais de simulation
  headless Node existe déjà comme preuve de concept (cf. [CHANGELOG.md](CHANGELOG.md), fix `35352c8`) —
  l'industrialiser en tests de non‑régression physique (charger `matter-js`/`matter-attractors` via npm,
  rejouer décollage/atterrissage et asserter les invariants). Ajouter ESLint.

---

## Méthode recommandée pour les changements physiques

1. Lire [PHYSICS.md](PHYSICS.md) (surtout §1 unités).
2. Reproduire/mesurer en **headless avec le vrai Matter.js** avant de coder le fix (éviter les
   correctifs « à l'aveugle »).
3. Comparer corps **mobile vs statique** pour isoler les effets liés au mouvement.
4. Mettre à jour [CHANGELOG.md](CHANGELOG.md) et, si une incohérence est résolue, cet item dans TODO.md.

---

## Contenu & équilibrage des mondes — relevé chiffré (2026‑08‑24)

> Audit calculé sur `constants.js` + les 6 presets (`a_poussée = 550 u/s²` ; gravité NETTE échantillonnée
> tous les 1° en tenant compte de **tous** les corps). Ces points sont des décisions d'auteur, pas des
> bugs de code — d'où leur place ici plutôt que dans un correctif.

- 🔴 **`5_Endor` / « Endor III » inutilisable.** `orbitDistance 1200`, rayon 120, parent (Endor Prime)
  rayon 1050 ⇒ corridor de **30 unités** pour une fusée de 60. Face interne : la fusée est à
  l'intérieur d'Endor Prime. Face externe : poussée/gravité **0,68**. Corriger demande de choisir un
  nouveau `orbitDistance` (≥ ~1400 pour un corridor jouable).
- 🔴 **`1_solar` : missions `m7`/`m8` impossibles, victoire hors d'atteinte.** Le cargo n'est délivré
  qu'en se posant au point de départ, or Jupiter (0,583) et Saturne (0,595) ne permettent ni
  l'atterrissage ni le décollage. Le HUD n'affiche « Missions réussies ! » que si plus aucune mission
  n'est en cours : ces deux-là restent « pending » à jamais. Options : déplacer le départ sur la lune
  (Europe→Jupiter souffre du même problème : la livraison exige de s'y poser), ou alléger les masses.
- 🟠 **8 stations sur des corps sans retour** : Uranus 0,758 · Duna 0,847 · Ohann 0,486 · Adriana 0,528 ·
  Endor Prime 0,535 · Calpamos 0,535 · 2 sur l'étoile Grand Feu 0,083 (inatteignable). Une station
  promet un plein : la poser sur un corps sans décollage possible est un piège.
- 🟠 **Marges de décollage réelles au spawn** (gravité nette, parent compris) : Kerbin **1,10** ·
  Acheron **1,17** · Forêt‑lune d'Endor **1,18** · Terre 1,47 · Tatooine 1,66 · Âtrebois 1,72.
  Quatre mondes sur six sont sous la cible 1,5–3 de [PHYSICS.md §2.3](PHYSICS.md) — le tableau
  « corps seul » de la doc surestime jusqu'à ×3 (Forêt‑lune : 3,50 annoncé vs 1,18 réel, Endor Prime
  fournissant 298 des 465 u/s² ressentis). Aucun monde n'est injouable : le décollage vertical coûte
  de 577 (1_solar) à 1703 (2_kerbol) de carburant sur 6000.
- 🟠 **Sauts de lune à lune au-delà du seuil de crash** aux mauvaises phases : Phobos↔Deimos jusqu'à
  1680 u/s relatifs = 28 000 en échelle Matter, soit **11× `CRASH_SPEED_THRESHOLD`**. Racine : les
  orbites étant cinématiques, `orbitSpeed × orbitDistance` vaut 3 à 25× **moins** que le `√(GM/r)`
  physique — sauf Phobos (×2,94) et Deimos (×2,70) qui vont au contraire trop vite.
- 🟢 **Récompenses incohérentes** : m1/m2 = même saut de 2000 unités, m2 paie +25 % ; m3 (320) vs m4
  (520) à distance identique ; le prix à l'unité de cargo va de 12 à 52 crédits sans logique.
- 🟢 **Tolérance d'amarrage inversée par la taille** : `min(π/12, 100/(R+20))` donne ±97 unités sur
  Terre mais **±13** sur « Trou blanc » (rayon 50), dont l'icône (100 unités) couvre pourtant tout le
  corps. Les petites lunes, les plus dures à viser, ont la fenêtre la plus étroite.
- 🟢 **Pas d'économie** : les crédits n'ont aucun puits (le ravitaillement est gratuit), et `R` offre
  un plein + une téléportation gratuits depuis n'importe où, ce qui rend les stations redondantes.
- ✅ **Fuite d'abonnements — refermée le 2026‑08‑25** : `HeadlessRocketEnvironment.cleanup()` est
  appelé par `TrainingOrchestrator` avant de recréer les environnements, dans `cleanupAfterError` et
  dans `finalizeTraining`, et il agit désormais réellement — `RocketController.unsubscribeAll`,
  `MissionManager.unsubscribeAll` et le désabonnement `UNIVERSE_STATE_UPDATED` de
  `SynchronizationManager.cleanup()` sont en place. Mesuré : 14 écouteurs créés, 0 résiduel.

---

## Machine à états & ordonnancement — relevé (2026‑08‑24)

> Audit d'ordonnancement (ordre réel des étapes d'une frame, hooks Matter, transitions FSM). Ces
> points sont réels mais soit délicats à corriger, soit du nettoyage à arbitrer.

- ✅ **RÉSOLU (2026‑08‑24) — Le garde de l'étape 6 de `PhysicsController.update` était mort.** Le hook `afterUpdate` de
  `SynchronizationManager` s'exécute à la FIN de `Engine.update`, donc AVANT la ligne qui teste
  `isHandledManually` : `syncModelWithPhysics` a déjà écrasé le modèle depuis le corps physique.
  Conséquence : pour une fusée posée, la vélocité « du corps porteur » que `handleLandedOrAttachedRocket`
  écrit volontairement est remplacée par la vélocité post-solveur, et la position épinglée est
  remplacée par la position post-intégration (dérive d'environ un pas de gravité, corrigée à la
  frame suivante). Effets : la barre de vitesse du HUD n'indique pas zéro sur une fusée posée, et
  un très léger tremblement au sol. [PHYSICS.md §4.1](PHYSICS.md) étape 6 décrit un comportement que
  le code n'a pas. *Correction possible* : appliquer la même condition dans le hook `afterUpdate`.
  **Mesuré puis corrigé** : le prédicat est désormais factorisé dans
  `SynchronizationManager.isRocketHandledManually()` et appliqué DANS le crochet `afterUpdate`.
  Avant : sur Phobos, position du modèle oscillant de **±16 u** (~40 % du rayon du corps) ; sur la
  Lune, vitesse HUD 7,6–8,4 u/s au lieu de 10. Après : écrasement 0,000 u, vitesse exacte. Aucune
  régression mesurée (atterrissage, ré‑atterrissage après saut, décollage : profils identiques).
  Vérifié aussi : dans les 6 mondes, seul l'astre central est sans parent — tous les corps posables
  sont donc couverts, le cas `'Terre'` codé en dur est redondant.
- 🟠 **`CollisionHandler` écrit dans le modèle pendant `collisionStart`/`collisionActive`** (angle
  perpendiculaire, vélocité nulle) — écritures que le même `afterUpdate` efface dans le même pas.
  De plus `updateRelativePosition` y est appelée avec la position de la fusée de la frame
  PRÉCÉDENTE et la position du corps de la frame courante : le point d'attache mémorisé est décalé
  d'un pas de mouvement relatif, et il est figé pour toute la durée de l'atterrissage. Sur un corps
  rapide, ce décalage peut suffire à sortir de la tolérance d'amarrage d'une station.
- 🟢 **6 des 11 états du FSM sont inatteignables** : `MAIN_MENU`, `LEVEL_SETUP`, `LEVEL_TRANSITION`,
  `MISSION_BRIEFING`, `MISSION_DEBRIEFING`, `CREDITS_SCREEN` ne sont la cible d'aucun `changeState`.
  En conséquence `_pendingStateTransition` (assigné seulement dans `_onEnterState(LEVEL_SETUP)`) est
  du code mort, tout comme le `stopSimulation()` de `MAIN_MENU` et la branche correspondante de la
  boucle de jeu. `GAME_OVER` n'a aucune sortie automatique (seul `ROCKET.RESET` en sort).
- 🟢 **Le stick gamepad provoque 3 `SIMULATION.UPDATED` par frame au lieu d'un** : `handleRotateCommand`
  émet deux `SET_THRUSTER_POWER`, chacun déclenchant `INTERNAL_STATE_CHANGED` → `emitUpdatedStates()`,
  et ce AVANT la physique de la frame. Chaque émission recalcule tous les vecteurs pour tous les
  corps. Ce n'est pas un bug de correction (la dernière émission fait foi avant le rendu) mais les
  deux tiers du travail sont perdus, et cela se déclenche aussi sur une simple dérive de stick.
- 🟢 **Écritures jamais lues** : `CollisionHandler._lastLandedState` (écrit, jamais lu),
  l'événement DOM `ROCKET_CRASH_EXPLOSION` (aucun auditeur), `rocketModel.acceleration` (transmis à
  `UIView` dont le bloc consommateur est commenté), et la branche décollage de
  `ThrusterPhysics.applyThrusterForce` (inatteignable : l'étape 3 a déjà basculé `isLanded`).

---

## Faux positif écarté — « les collisions ne fonctionnent pas » (2026‑08‑24)

> Un audit a conclu que `collisionFilter.group` étant absent, `Matter.Detector.canCollide` renvoyait
> toujours `false` et qu'**aucune paire de collision n'était jamais créée** entre la fusée et un corps
> céleste — donc que tout `CollisionHandler` était du code mort. **C'est FAUX**, vérifié directement
> sur les corps réellement construits par `PhysicsController.initPhysics` :
>
> - `rocket.collisionFilter = {category:1, mask:4294967295, group:0}`
> - `body.collisionFilter   = {category:2, mask:1,          group:0}`
> - `Detector.canCollide(...) === true`
> - avec un chevauchement franc, **un seul `Engine.update` produit `pairs.list.length === 1` et
>   déclenche `collisionStart`**.
>
> `Bodies.circle`/`Bodies.rectangle` fusionnent bien le `collisionFilter` partiel avec les valeurs par
> défaut : `group` vaut 0, pas `undefined`.
>
> **Ne pas « corriger » les filtres de collision.** L'observation d'origine (0 paire) a une autre
> cause, réelle celle-là : en headless la fusée est détruite par `checkImminentCrash` **à ~48 unités
> AU-DESSUS de la surface**, ou épinglée par la vérification périodique de distance — le contact
> physique n'a donc jamais lieu dans ces scénarios. C'est ce chemin-là qu'il faut traiter.
