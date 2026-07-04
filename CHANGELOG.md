# CHANGELOG — Pocket Cosmos

Historique des changements notables. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
ordre antéchronologique. Le dépôt n'a **pas de tags de version** ; les sections sont donc datées.
Voir aussi [PHYSICS.md](PHYSICS.md) (détails techniques), [TODO.md](TODO.md) (dettes/à faire) et
[CLAUDE.md](CLAUDE.md) (architecture).

---

## [Non publié] — Pipeline d'entraînement IA (fondations PNJ/adversaires) — 2026‑07‑03

Objectif : entraîner des pilotes IA fiables et **réutilisables** comme futurs PNJ/adversaires. Phases 1
à 3 (qualité d'entraînement + rôles) livrées. Voir [CLAUDE.md](CLAUDE.md) §AI et [PHYSICS.md §1.5](PHYSICS.md).

### Phase 3 — rôles de PNJ (course, interception, atterrisseur, orbiteur)

- **Registre de rôles** (`AI_TRAINING.ROLES`) : `race`, `intercept`, `lander`, `orbiter`. Un rôle est
  une variation d'un objectif de base (navigate/land/orbit) + des paramètres de mission. C'est le
  catalogue des pilotes entraînables et livrables (`assets/models/`).
- **Cibles mobiles** (`HeadlessRocketEnvironment`) : le rôle `intercept` fait bouger la cible
  (patterns `linear` / `circular`). L'observation expose désormais `targetX/Y/VX/VY` et le vecteur
  d'état **active enfin les dims 10-11** (vitesse propre de la cible, réservées en phase 1). Succès
  `proximity` : rester à portée d'une cible mobile pendant K steps (≠ stabilisation à l'arrêt).
- **Bonus de course** : le rôle `race` ajoute une récompense terminale proportionnelle au budget de
  steps restant (finir plus tôt = plus de bonus) + pénalité par step accrue.
- **File de runs séquentiels** (`TrainingOrchestrator.runCurriculum`) : `config.trainingRuns`
  `[{ role, episodes, loadFrom?, saveAs }]` exécutés en séquence, avec **warm-start** optionnel
  (`loadFrom` charge un modèle du zoo avant d'entraîner → transfert, ex : `race` depuis `navigate`).
  Événements `AI.CURRICULUM_STAGE_STARTED/COMPLETED/COMPLETED`. Remplace l'ancienne limite « premier
  objectif seulement ».
- **UI** : dropdown « Rôle » dans `training-interface.html`.

- **Script de livraison** : `trainAndDeliver({ role, episodes })` (console, `train.js`) entraîne en
  headless puis exporte le modèle en 3 fichiers ; `deliverModel('<nom>')` exporte un modèle déjà
  entraîné. Dossier `assets/models/` + `README.md` (procédure de livraison) ajoutés.

> ⏳ Reste manuel : **exécuter** `trainAndDeliver()` dans le navigateur puis **committer** les fichiers
> dans `assets/models/<nom>/` (l'entraînement TF.js tourne dans le navigateur, pas en CI/Node).

### Phase 2 — qualité d'apprentissage

- **Double DQN** (`RocketAI.train`) : l'action du prochain état est choisie par le modèle **online**
  (argmax), sa valeur lue sur le modèle **target**. Découple sélection et évaluation → réduit la
  surestimation systématique du DQN standard. Une prédiction de plus par batch (négligeable).
- **IA = inférence pure en jeu (posture PNJ)** : suppression de `RocketAI.step()` (boucle d'apprentissage
  in-game) et de `RocketAI.calculateReward()` (récompense d'orbite codée en dur, **divergente** de celle
  de l'environnement). Il n'existe plus qu'**une seule définition de récompense**
  (`HeadlessRocketEnvironment`). En jeu, si un modèle a été **chargé**, la politique gloutonne du réseau
  pilote (`makeDecision` → `act`) ; sinon repli sur l'heuristique `maintainOrbit`.
- **Limites de simulation** (`HeadlessRocketEnvironment._isOutOfBounds`) : `SAFETY.MAX_SIMULATION_DISTANCE`
  enfin appliqué, **borné par objectif** (navigate : 3× distance initiale ; autres : 50000). Termine les
  épisodes « fugueurs » (statut `out_of_bounds`) avec pénalité au lieu de brûler tout le budget de steps.
- **Reproductibilité** (`controllers/SeededRandom.js`, nouveau — mulberry32) : `config.seed` rend
  déterministes l'angle initial (par épisode) et l'exploration epsilon. **Jeu d'évaluation fixe** (N angles
  dérivés du seed) → scores comparables entre runs et entre modèles. Champ « Seed » dans l'UI.
- **`compareModels(a, b)`** (`train.js`) : compare deux modèles du zoo sur le même jeu d'éval fixe
  (récompense / taux de succès / médiane steps→succès).

### Phase 1 — fondations (model zoo, état, métriques)

Objectif : entraîner des pilotes IA fiables et **réutilisables** comme futurs PNJ/adversaires. Voir
[CLAUDE.md](CLAUDE.md) §AI et [PHYSICS.md §1.5](PHYSICS.md).

### ⚠️ Rupture de compatibilité : modèles v1 obsolètes
- Le vecteur d'état passe de **10 à 12 dimensions** (`STATE_VERSION 2`). Les deux nouvelles dimensions
  (10‑11) encodent la **vitesse propre de la cible** (= 0 pour une cible fixe ; prépare les cibles
  mobiles type intercept/escorte **sans nouvelle rupture** future). Les modèles v1 (10 dims, stockés
  en `localStorage://rocket-ai-model`) sont **refusés au chargement** avec un avertissement console
  explicite. Aucun modèle pré‑entraîné n'était livré, le coût est nul.

### Model zoo — persistance nommée (`controllers/AIModelStore.js`, nouveau)
- Modèles **nommés par rôle/objectif**, stockés en **IndexedDB** (`indexeddb://pc-model-<nom>`) avec un
  registre de métadonnées en `localStorage` (objectif, `stateVersion`/`stateSize`, épisodes, meilleur
  score d'éval, taux de succès…). Fin du modèle unique éphémère.
- **Export/Import fichiers** (`downloads://` + `tf.io.browserFiles`) → un modèle entraîné peut être
  livré dans `assets/models/<nom>/` (`model.json` + `meta.json`), chargé au démarrage via
  `AIModelStore.load()` (chemin « joueur frais », base des PNJ).
- **Validation de compatibilité** au chargement (dimension d'entrée réseau + `stateVersion`) : un
  modèle incompatible est refusé proprement.
- `RocketAI.saveModel(name)` / `loadModel(name)` délèguent au zoo ; `TrainingOrchestrator` sauvegarde
  checkpoints et modèle final sous `config.modelName` (défaut `<objectif>-default`) avec métadonnées.

### Correction de la saturation d'état
- Les canaux de vitesse (dims 2/3/8) saturaient à ±2 (échelle 1000, clamp ±2 ≈ ±2000 u/s) alors que la
  **croisière cible est 2500 u/s** : le réseau ne « voyait » pas les hautes vitesses. Échelle portée à
  **2500** (croisière ≈ 1.0) et clamp à **±4** (couvre `VELOCITY_MAX` 10000 u/s). Échelles centralisées
  dans `AI_TRAINING.STATE` (`constants.js`), source unique consommée par `buildStateVector`.

### Conversion d'unités Matter→u/s centralisée
- Nouveau point unique `PhysicsVectors.matterToGameVelocity(v)` (= `v / MATTER_BASE_DELTA`), remplaçant
  la constante `1000/60` réécrite en dur dans `RocketAI` + 3 sites de `HeadlessRocketEnvironment` —
  footgun récurrent de parité entraînement/jeu. Voir [PHYSICS.md §1.5](PHYSICS.md).

### Métriques & UI d'entraînement
- `TrainingOrchestrator` expose **steps/s** (fenêtre 20 épisodes), **taux de succès récent** (fenêtre
  glissante 50 épisodes, plus lisible que le cumul global) et **médiane steps→succès** à l'évaluation.
- `training-interface.html` : champ **« Nom du modèle »**, **panneau Model Zoo** (liste, charger,
  exporter, importer, supprimer), affichage steps/s. Nouveaux événements `AI.MODEL_DELETED` /
  `AI.MODEL_EXPORTED`, payload `{name, metadata}` sur `AI.MODEL_SAVED`/`MODEL_LOADED`.

---

## [Non publié] — Corrections du décollage (corps mobiles) — 2026‑06‑04

### Chasse aux bugs — 2e passe (5 agents), correctifs « Tier 1 » (faible risque)
- **O1 — Les missions n'échouaient jamais à la destruction de la fusée.** La logique d'échec
  dépendait de `ROCKET.STATE_UPDATED`, un événement **jamais émis**. Désormais déclenchée
  directement dans `update()` à la transition `PLAYING → CRASH_ANIMATION` (appel idempotent à
  `handleRocketStateUpdated`). Abonnement mort retiré.
- **P2 — Décollage sous le seuil.** `ThrusterPhysics.applyThrusterForce` déclenchait `handleLiftoff`
  dès `thrustForce > 0`, court-circuitant le seuil `TAKEOFF_THRUST_THRESHOLD_PERCENT` (10 %) appliqué
  ailleurs : la fusée « sautait » à ~5 %. Le décollage est désormais gaté par le même seuil. Vérifié
  headless (5 % reste posé, 50 % décolle).
- **P1 — `isOnMobileBody` toujours vrai** (`PhysicsController`) : le test `typeof updateOrbit ===
  'function'` (méthode de prototype, toujours présente) ne distinguait jamais un corps statique.
  Remplacé par `parentBody != null` (cohérent avec `SynchronizationManager`). Non-régression du suivi
  d'épave vérifiée headless.
- **D1 — Vélocité de respawn non convertie.** `resetRocket` posait la vélocité héritée sans
  `× MATTER_BASE_DELTA` (≠ `buildWorldFromData`) → glitch d'~1 frame au respawn sur astres mobiles
  (mondes 3/5/6). Conversion ajoutée.
- **O2 — Course au reload.** Une touche pressée pendant le `fetch` async d'un monde pouvait
  relancer l'**ancien** monde (`RESUME_IF_PAUSED`). Garde ajoutée sur `_universeLoadInFlight`.
- **O3 — Ré-atterrissage manqué après reload.** `_lastLandedEventBody` (état rémanent de
  `SynchronizationManager`) n'était pas réinitialisé : après un reload où la fusée respawn posée sur
  le **même** corps, `ROCKET.LANDED` n'était pas ré-émis (ravitaillement / mission « déjà posé »
  manqués). Reset ajouté sur `UNIVERSE.STATE_UPDATED`.
- **R1 — Frame cassée par une station mal formée.** Le rendu des stations lisait `host.position.x`
  sans garde → `TypeError` interrompant **toute** la frame (avant fusée+UI). Gardes ajoutées sur
  `host.position` et `host.radius`.
- **A1 — Tracé d'entraînement corrompu.** `TrainingOrchestrator` émettait `TRAINING_STEP` avec
  `rocketModel.x/.vx/.isCrashed` (inexistants → `undefined`/NaN). Corrigé en `position/velocity`/
  `isDestroyed`. N'affectait que la visualisation (l'état réseau était déjà correct).

### IA / entraînement — RACINE corrigée (apprentissage enfin actif) + calibration vitesse
- **🎯 BUG RACINE : `updateTargetModel()` détruisait les poids du modèle.** L'« optimisation
  memory leak » faisait `this.model.getWeights().forEach(w => w.dispose())` — or `getWeights()`
  renvoie les **tenseurs vivants des variables** (pas des copies). Résultat : dès `initModel`, le
  noyau `dense_Dense1/kernel` était disposé, et **`model.fit()` levait `LayersVariable … is already
  disposed` à CHAQUE appel** → `successfulTrainings` restait à 0, perte plate, aucun apprentissage.
  L'epsilon initial à 1.0 (actions aléatoires) masquait le défaut : la fusée bougeait sans jamais
  utiliser le réseau. **Correctif : `targetModel.setWeights(model.getWeights())` sans aucun dispose.**
- **Diagnostic instrumenté** (qui a permis de remonter à la racine) : `train()` instrumenté sur
  toutes ses sorties (`guard`/`buffer`/`inprogress`/`fit-start`/`ok` + 5 `return`), `catch`
  dé-filtré, et traces côté `TrainingOrchestrator` (taille du buffer, `isTraining`, site d'appel).
  `testUpdateFrequency()` rendu fiable (attend `waitForReady`, rapporte les updates réelles).
- **Calibration vitesse par cohérence d'unités** (cibles documentées en u/s mais comparées à une
  vitesse en échelle Matter, ×16,67) :
  - État (`RocketAI.buildStateVector`) : `vx/vy` ramenés en **u/s** (÷ `MATTER_BASE_DELTA`) → fin de la
    **saturation** (croisière ~382 u/s : feature 2,000 saturé → **0,382** informatif, vérifié en node).
  - Récompenses navigate (`calculateVelocityReward`, stabilisation, `checkNavigateSuccess`) : vitesse
    mesurée en **u/s** via `_rocketSpeedUnitsPerSec()` → cibles `VELOCITY_TARGET/MAX` et seuil de succès
    enfin cohérents (avant, la vitesse de croisière requise était **pénalisée**).
  - Stabilisation : poids dédié `STABILIZE_REWARD_WEIGHT` (au lieu de réutiliser `DISTANCE_DELTA=100`).
  > ⚠️ Valeurs absolues à **valider par un entraînement réel** une fois l'apprentissage rétabli.
- **Interface d'entraînement — bascule de vue + nettoyage.** Le bouton « 🌌 Vue absolue » devient une
  **bascule** vue vaisseau (suivi) ↔ vue absolue (centrée A↔B) via `TrainingVisualizer.toggleView()`
  (avant : impossible de revenir au suivi de la fusée). Les traces de diagnostic verbeuses
  (`[RocketAI.train]`, `[Orchestrator]`) sont désormais **silencieuses par défaut**, activables via
  `window.DEBUG_AI = true` ; les vraies erreurs de `model.fit` restent toujours remontées. Le replay
  buffer (poussé directement par l'orchestrateur) est **borné** à `replayBufferSize` (avant : croissance
  illimitée, ~270 000 entrées observées → fuite mémoire).
- **Vitesse d'entraînement.** Le mode « Sans rendu (rapide) » est désormais réellement rapide (plus
  d'émission d'événements de rendu par step, cession au navigateur 10× plus rare). En mode visuel, un
  **curseur de vitesse ⏩ ×1→×20** règle la cadence de rendu (1 rendu tous les `10 × vitesse` steps)
  pour observer en avance rapide ; modifiable **en direct** pendant l'entraînement.
- **Temps de vol A→B réduit ~5×.** Budget d'épisode navigate `20000 → 4000` steps (~66 s) + cibles de
  vitesse mises à l'échelle ×5 (`VELOCITY_TARGET 500 → 2500` u/s, `MAX 2000 → 10000`, `SIGMA 200 → 1000`,
  `MIN 50 → 250`) pour que la fusée croise assez vite et atteigne B dans le budget réduit.
  ⚠️ À valider par un entraînement (freinage/stabilisation plus serrés).

### Corrigé
- **Décollage propre depuis un corps en orbite** (`ThrusterPhysics.handleLiftoff`) — `35352c8`.
  La vélocité orbitale héritée passe de `× deltaTime` (~0,0167, soit ~1000× trop petit) à
  `× (1000/60)` (`MATTER_BASE_DELTA`). Cause : le jeu passe `deltaTime` en **secondes** à
  `Engine.update` alors que Matter suppose des **ms** (`_baseDelta = 1000/60`). Vérifié en headless
  (vrai Matter.js) : dérive tangentielle au décollage **−6,64° → −2,65°** (niveau d'un corps fixe).
  No‑op pour les corps immobiles → aucune régression ; améliore aussi le décollage des lunes en orbite.
- **Catapulte tangentielle au décollage** (`PhysicsController.update`, étape 1) — `0851b0b`.
  La vélocité Matter des corps mobiles est convertie en par‑pas (`× lastDeltaTime`) ; complète le
  fix d'unités `96b471b` qui avait oublié cette ligne.
- **Cohérence des unités de vélocité (secondes↔ms).** Détection atterrissage/crash
  (`CollisionHandler.getCelestialBodyVelocity`), stabilisation posé/débris (`SynchronizationManager`),
  vélocité de collision des corps mobiles (`PhysicsController` étape 1) et vélocité de spawn
  (`GameSetupController`) passent toutes de `× deltaTime` (~1000× trop petit) à `× MATTER_BASE_DELTA`
  (`= 1000/60`), désormais **centralisée** dans `constants.js`. Vérifié en headless : un atterrissage
  **co-mobile** sur un corps rapide (~960 u/s), auparavant classé à tort comme **crash**, est
  maintenant correctement détecté comme **atterrissage**, sans régression du décollage (dérive et
  catapulte inchangées). Achève l'intention du commit `0e9546e` (« vitesse relative au corps ») que
  le bug d'unités rendait inopérante.
- **Reload d'univers pendant un décollage** (`GameSetupController.buildWorldFromData`) : le
  `rocketModel` est désormais réinitialisé (`reset()`) avant d'appliquer le spawn. Sans cela, l'état
  en cours (propulseurs tenus, période de grâce, `relativePosition`/`attachedTo` périmés) "fuyait"
  dans le nouveau monde → redécollage immédiat du spawn / téléport. Vérifié en headless (avant :
  `power=1000`, redécolle ; après : `power=0`, reste posé).
- **Épave qui ne suivait pas une planète MOBILE après un crash.** Le crash via le chemin "impact"
  (`CollisionHandler` collisionStart, choc de côté/angle) posait `landedOn` mais **pas** `attachedTo`,
  or le suivi de l'épave (`SynchronizationManager` CAS débris) exigeait `attachedTo` → l'épave restait
  fixe pendant que la planète s'éloignait. Double correctif : (1) ce chemin pose désormais `attachedTo`
  (+ `relativePosition=null`) à la destruction ; (2) le CAS débris retombe sur `landedOn` si
  `attachedTo` est absent. Vérifié headless (corps mobile ~72 u/s : dérive de l'épave 72 u → **1,5 u**).

### Modifié
- **Rééquilibrage des masses du monde Outer Wilds** (`assets/worlds/3_outerwilds.json`) — `145e3bb`,
  `0851b0b`. Âtrebois `2e11 → 3e10` (à `2e11`, gravité 3,3× la poussée → décollage impossible).
  10 des 13 corps avaient un rapport poussée/gravité < 1 ; masses ré‑échelonnées pour viser ~1,5–3
  en préservant les écarts relatifs. *Grand Feu* (étoile) gardé lourd (ancre la gravité
  interplanétaire) ; *Trou blanc*/*L'Intrus* (exotiques) laissés tels quels. Orbites inchangées
  (cinématiques).

### Nettoyage / hygiène
- `globalThis.DEBUG` repassé à `false` ; les logs de décollage fréquents (`[LIFTOFF]`, `[DECOLLAGE]`)
  gatés derrière `if (globalThis.DEBUG)`.
- Constantes en dur centralisées dans `constants.js` : `MATTER_BASE_DELTA` (1000/60),
  `LANDING_PROXIMITY_THRESHOLD` (15), `CRASH_SINK_DEPTH` (40).
- Audit d'équilibrage des 6 mondes : **tous les corps de spawn sont décollables** (Tatooine corrigé :
  masse 3e11 → 1,4e11, ratio 0,85 → 1,82). Les corps à forte gravité non‑spawn sont laissés
  volontairement inaccessibles au vaisseau actuel (cibles de futurs vaisseaux plus puissants).

### Unification de la gravité (Option A)
- `PHYSICS.G` devient la **source unique** : `PhysicsController.initPhysics` et `GameSetupController`
  copient `PHYSICS.G` dans `MatterAttractors.Attractors.gravityConstant` ⇒ gravité réelle = viz = IA.
- `PHYSICS.G` et les `physics.G` des 6 presets passés de `0,0001` à **`0,001`** (la valeur réelle déjà
  en vigueur) → **gameplay inchangé** ; seules la visualisation du champ de gravité et l'IA (qui
  utilisaient 0,0001) deviennent correctes. Cibles `AI_TRAINING.ORBIT` recalculées ×√10 (calibrage
  absolu IA à valider par entraînement). Vérifié en headless : gravité réelle inchangée (0,001).

### Robustesse / nettoyage (chasse aux bugs — workflow de 5 agents)
- Code mort : abonnement à `ROCKET.CRASHED` (jamais émis) retiré de `RocketAI` — le crash passe par
  `ROCKET.DESTROYED` ; constante `PHYSICS.MAX_SPEED` (inutilisée) retirée (`MAX_COORDINATE` conservée,
  utilisée par `UniverseModel`).
- `GameController._universeLoadInFlight` désormais initialisé dans le constructeur (au lieu de
  reposer sur `undefined`).
- Abonnement `ROCKET.RESET` de `InputController` désormais tracké via `controllerContainer`.
- Gardes défensives : `CameraModel.screenToWorld` protège contre `zoom<=0` ; le rendu des stations
  protège contre un `angle` non fini (coordonnées NaN).
- IA : décroissance d'epsilon dédupliquée — gérée une seule fois par épisode par
  `TrainingOrchestrator` (retirée de `RocketAI.handleCrash`/`handleSuccess` où elle s'ajoutait,
  causant une décroissance ~2× trop rapide et ratant les épisodes en timeout).
- Faux positifs écartés après vérification (aucun changement) : « fuite » `newWeights.dispose()`
  (code correct, `setWeights` copie), overlap audio thruster, double `STATION.REFUELED`, fuites
  d'écouteurs au reload (vues/input créés une seule fois), `bestModelWeights` (déjà libéré).

---

## 2026‑06‑02 — Stabilisation décollage & atterrissage relatif

### Corrigé
- `6d9c88e` — Re‑collage de la fusée sur les corps mobiles au décollage : machine à états de la
  période de grâce (empêche `isLanded` d'être ré‑armé pendant la montée) + diagnostic
  `window.DEBUG_LIFTOFF`.
- `e3f4246` — Direction de l'impulsion de décollage : pousse vers l'extérieur (`angle - π/2`) et non
  vers le centre de la planète.
- `96b471b` — Incohérence d'unités : conversion de la vélocité des corps célestes (u/s → par‑pas
  Matter via `× deltaTime`) dans `handleLiftoff`, la stabilisation et `getCelestialBodyVelocity`.
- `0e9546e` — Détection atterrissage/crash basée sur la vitesse **relative** au corps céleste.

### Notes
- Correctifs IA/entraînement, particules et rendu groupés (`c97977c`, `0421d97`, série de bugfixes).

---

## Antérieur — par thème

> Résumé thématique des évolutions structurantes (avant la campagne décollage). Voir `git log` pour
> le détail commit par commit.

### Système d'univers & écran de démarrage
- Écran de démarrage avec sélection parmi 6 mondes (`1_solar`, `2_kerbol`, `3_outerwilds`, `4_Tatoo`,
  `5_Endor`, `6_alien`) et bouton « Prêt ! » ; émission de `UNIVERSE_LOAD_REQUESTED`.
- Chargement de monde par preset JSON (`GameSetupController.buildWorldFromData`) : corps, stations,
  étoiles, ceintures d'astéroïdes, récits, spawn fusée. Génération procédurale & rechargement
  d'univers modulaires.
- Nouveaux corps (Cérès, Pluton), ceintures d'astéroïdes, atmosphères (ombres, couches avant/arrière),
  anneaux planétaires.

### IA (Deep Q‑Network, TensorFlow.js)
- Agent `RocketAI`, `TrainingOrchestrator`, environnement headless `HeadlessRocketEnvironment`,
  visualiseur `TrainingVisualizer`. Objectifs : `navigate` (défaut), `orbit`, `land`, `crash`.
- Système de récompenses `navigate` (6 composantes) ; constantes `AI_TRAINING` ; nettoyages mémoire
  (tenseurs `tf.tidy`/`dispose`) ; repli backend CPU si WebGL échoue.

### Audio
- `AudioManager` : préchargement et lecture des SFX (propulseur, collision) et ambiances ; déverrouillage
  audio au premier clic/touche.

### Rendu
- Pipeline `RenderingController` : fond/étoiles, corps célestes (ombres jour/nuit, atmosphère, anneaux),
  stations, traces, particules, fusée, vecteurs/champ de gravité, HUD.

### Refactors & robustesse
- Découplage via `EventBus` ; `ControllerContainer.track` pour le nettoyage des abonnements (anti‑fuite
  au rechargement d'univers) ; centralisation de la consommation de carburant dans `RocketModel`.

---

## Conventions de mise à jour de ce fichier

- À chaque changement notable, ajouter une entrée sous **[Non publié]** (catégories : *Ajouté*,
  *Modifié*, *Corrigé*, *Supprimé*, *Connu/non corrigé*) avec le hash de commit court.
- Tout changement **physique** doit référencer la section concernée de [PHYSICS.md](PHYSICS.md) et
  idéalement être vérifié par le harnais headless (vrai Matter.js).
