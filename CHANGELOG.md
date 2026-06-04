# CHANGELOG — Pocket Cosmos

Historique des changements notables. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
ordre antéchronologique. Le dépôt n'a **pas de tags de version** ; les sections sont donc datées.
Voir aussi [PHYSICS.md](PHYSICS.md) (détails techniques), [TODO.md](TODO.md) (dettes/à faire) et
[CLAUDE.md](CLAUDE.md) (architecture).

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
