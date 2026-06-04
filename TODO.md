# TODO — Pocket Cosmos

Dettes techniques, incohérences connues et feuille de route. Priorisé. Chaque item référence le code
réel. Voir [PHYSICS.md](PHYSICS.md) pour les détails physiques, [CHANGELOG.md](CHANGELOG.md) pour
l'historique, [CLAUDE.md](CLAUDE.md) pour l'architecture.

Légende priorité : 🔴 haute · 🟠 moyenne · 🟢 basse.

---

## Incohérences d'unités (physique) — racine commune : delta en secondes vs Matter en ms

> Contexte complet en [PHYSICS.md §1](PHYSICS.md). Le jeu passe `deltaTime` en **secondes** à
> `Engine.update` alors que Matter suppose des **millisecondes** (`_baseDelta = 1000/60`). Donc
> `body.velocity ≈ vitesse(u/s) × (1000/60)`. Le bon facteur de conversion `model.velocity (u/s) →
> vitesse Matter` est **`× 1000/60`**, **pas** `× deltaTime`. Seul `handleLiftoff` est corrigé.

- 🔴 **Détection atterrissage/crash de fait ABSOLUE sur corps mobiles.**
  `CollisionHandler.getCelestialBodyVelocity` renvoie `model.velocity × dt` (~1000× trop petit) ; comparé
  à `rocketBody.velocity` (échelle `× 1000/60`), la vélocité du corps est négligeable ⇒ la « vitesse
  relative » est en réalité ~absolue. Atterrir/crasher sur une lune rapide est mal jugé.
  *Action :* convertir en `× 1000/60` **et** revérifier les seuils (`LANDING_MAX_SPEED`,
  `CRASH_SPEED_THRESHOLD`) — tester l'atterrissage sur corps mobile avant/après.
- 🟠 **Stabilisation au sol en mauvaises unités.** `SynchronizationManager.handleLandedOrAttachedRocket`
  (`parentVelocity = model.velocity × dt`). Masqué car la position est forcée quand on est posé, mais
  incohérent. *Action :* aligner sur `× 1000/60`.
- 🟠 **Vélocité de collision des corps célestes.** `PhysicsController.update` étape 1
  (`setVelocity(body, model.velocity × lastDeltaTime)`). Le corps paraît ~immobile au solveur de
  collision. *Action :* aligner sur `× 1000/60` (vérifier qu'aucune catapulte ne réapparaît).
- 🟢 **Vélocité de spawn.** `GameSetupController` (spawn fusée) fait `setVelocity(host.velocity)`
  (u/s, sans conversion). Masqué par la stabilisation. *Action :* convertir ou documenter pourquoi c'est sûr.
- 🟢 **Centraliser la constante.** `MATTER_BASE_DELTA = 1000/60` est en dur dans `ThrusterPhysics`.
  *Action :* l'exposer dans `constants.js` (`PHYSICS.MATTER_BASE_DELTA`) et la réutiliser partout.

> ⚠️ Idéalement, **unifier toutes ces conversions** en une seule passe cohérente (helper unique) en
> revérifiant atterrissage/crash/collision sur corps mobiles avec le harnais headless. Ne pas faire à
> l'aveugle : ces lignes « marchent » par compensation et impactent des comportements calibrés.

---

## Constante de gravité

- 🔴 **`gravityConstant` plugin (0,001) ≠ `PHYSICS.G` (0,0001).** La gravité réelle (plugin) n'est pas
  celle utilisée pour la visualisation et l'IA. Conséquences : (a) le champ de gravité dessiné
  (`VectorsView`/`PhysicsVectors` via `calculateGravity*`) est ~10× trop faible ; (b) les paramètres
  d'orbite IA (`AI_TRAINING.ORBIT`, calculés avec G=0,0001) sont incohérents avec la physique réelle ;
  (c) `physics.G` d'un preset ne change que la viz, pas la gravité. Voir [PHYSICS.md §2](PHYSICS.md).
  *Action :* décider d'une source unique — soit fixer `MatterAttractors.Attractors.gravityConstant =
  PHYSICS.G` au démarrage (⚠️ re‑tune toutes les masses des 6 mondes), soit aligner `PHYSICS.G` et les
  calculs IA/viz sur 0,001. **Choix de design — ne pas trancher sans validation gameplay.**

---

## Équilibrage des mondes

- 🟠 **Vérifier la décollabilité de TOUS les corps des 6 mondes.** Seul `3_outerwilds` a été
  rééquilibré (rapport poussée/gravité visé ~1,5–3, cf. [PHYSICS.md §2.3](PHYSICS.md)). Auditer
  `1_solar`, `2_kerbol`, `4_Tatoo`, `5_Endor`, `6_alien` : tout corps atterrissable doit avoir
  `poussée/gravité > 1`. *Action :* script de calcul du rapport par corps + ajuster les masses ;
  documenter les corps volontairement non‑décollables (étoiles).
- 🟢 **Documenter le rationnel des masses** dans les JSON (commentaire d'en‑tête impossible en JSON →
  noter dans [PHYSICS.md](PHYSICS.md)/ici).

---

## Hygiène / debug

- 🟠 **`globalThis.DEBUG = true` laissé activé** (`constants.js`, marqué « TEMPORAIRE ») + plusieurs
  `console.log` **inconditionnels** dans des chemins chauds (`ThrusterPhysics.handleLiftoff`,
  `SynchronizationManager`, diagnostics `DEBUG_LIFTOFF`). *Action :* repasser `DEBUG=false` par défaut
  et gater tous les logs derrière `if (globalThis.DEBUG)`.
- 🟢 **Constantes en dur à remonter dans `constants.js`** : `CRASH_SINK_DEPTH = 40`
  (`CollisionHandler`), `MATTER_BASE_DELTA`, seuils de proximité (15 px).

---

## Robustesse / risques

- 🟠 **Rechargement d'univers pendant un décollage/atterrissage.** `SynchronizationManager` retombe sur
  `isLanded=false` si le corps `landedOn` est introuvable ; risque de transition d'état inattendue
  pendant un reload. *Action :* test ciblé + log explicite.
- 🟢 **`relativePosition` recalculée une seule fois** à l'atterrissage sur corps mobile ; dérive
  visuelle possible sur corps très rapides. *Action :* recalcul périodique si dérive mesurée.

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
