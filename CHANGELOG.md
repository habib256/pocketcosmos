# CHANGELOG — Pocket Cosmos

Historique des changements notables. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
ordre antéchronologique. Le dépôt n'a **pas de tags de version** ; les sections sont donc datées.
Voir aussi [PHYSICS.md](PHYSICS.md) (détails techniques), [TODO.md](TODO.md) (dettes/à faire) et
[CLAUDE.md](CLAUDE.md) (architecture).

---

## [Non publié] — Corrections du décollage (corps mobiles) — 2026‑06‑04

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
