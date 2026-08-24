# TODO — Pocket Cosmos

Dettes techniques, incohérences connues et feuille de route. Priorisé. Chaque item référence le code
réel. Voir [PHYSICS.md](PHYSICS.md) pour les détails physiques, [CHANGELOG.md](CHANGELOG.md) pour
l'historique, [CLAUDE.md](CLAUDE.md) pour l'architecture.

Légende priorité : 🔴 haute · 🟠 moyenne · 🟢 basse.

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
  `rocketModel.reset()` avant d'appliquer le spawn. Vérifié headless (reload en tenant la poussée :
  avant = redécollage `power=1000` ; après = reste posé `power=0`). `SynchronizationManager` efface
  déjà `isLanded/landedOn/relativePosition` si le corps `landedOn` est introuvable.
- 🟢 **`relativePosition` recalculée une seule fois** à l'atterrissage sur corps mobile ; dérive
  visuelle possible sur corps très rapides. *Action :* recalcul périodique si dérive mesurée.

---

## Chasse aux bugs — items différés (2e passe, 5 agents)

> Le « Tier 1 » (8 bugs sûrs : O1 missions, P1/P2 physique, D1 respawn, O2/O3 reload, R1 rendu,
> A1 tracé IA) est **corrigé** — voir [CHANGELOG.md](CHANGELOG.md). Ci-dessous : trouvailles réelles
> mais à traiter avec prudence (balance/tuning non validable sans playtest/entraînement) ou mineures.

- 🟠 **P3 — Échelle des dégâts de collision.** `IMPACT_DAMAGE_FACTOR` (10) et `COLLISION_THRESHOLD`
  (2,5) sont restés à l'ancienne échelle alors qu'`impactVelocity` est en échelle Matter (×16,67) :
  tout contact non-atterrissage (ex. angle 30–45°) inflige des centaines de dégâts → destruction
  quasi systématique. **Sensible au gameplay** → recalibrer + playtester (diviser `impactVelocity`
  par `MATTER_BASE_DELTA` avant les dégâts, ou rescaler les deux constantes).
- 🟠 **A2 — Isolation des environnements d'entraînement.** `RocketController.subscribeToEvents` n'est
  pas idempotent et l'`EventBus` est partagé entre `trainingEnv`/`evaluationEnv` → double-abonnement
  / cross-talk (impact borné). *Action :* désabonner avant de réabonner, ou isoler les bus.
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
- 🟢 **Fuite connue non résolue** : `TrainingOrchestrator.finalizeTraining` ne fait que déréférencer
  les environnements ; `HeadlessRocketEnvironment` n'a pas de `cleanup()`, ses sous-contrôleurs
  restent abonnés au bus partagé et `SynchronizationManager` garde ses écouteurs Matter. Après N
  cycles arrêt/relance, chaque commande de propulseur est distribuée aux environnements morts.

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
