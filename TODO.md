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

> ⚠️ **Intention de design (confirmée)** : tous les corps n'ont PAS à être décollables avec le
> vaisseau actuel. Certaines planètes à forte gravité sont **volontairement inaccessibles** ; des
> vaisseaux à poussée supérieure viendront plus tard. La contrainte forte est donc : **le corps de
> SPAWN de chaque monde DOIT être décollable** (sinon le joueur est bloqué dès le départ).

- 🔴 **`4_Tatoo` : le corps de spawn (Tatooine) n'est PAS décollable** (poussée/gravité ≈ 0,85).
  Le joueur spawn dessus et reste collé. *Action :* rendre Tatooine décollable (réduire sa masse) OU
  déplacer le spawn — **décision de design en attente**.
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
