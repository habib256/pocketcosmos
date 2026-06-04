# PHYSICS.md — Référence physique de Pocket Cosmos

> Référence **précise** du moteur de simulation réel (Matter.js 0.19 + matter‑attractors 0.1.6).
> Destinée aux IA/développeurs qui modifient la physique. Pour l'architecture globale voir
> [CLAUDE.md](CLAUDE.md) ; pour les dettes/incohérences connues voir [TODO.md](TODO.md) ;
> pour l'historique voir [CHANGELOG.md](CHANGELOG.md).

⚠️ **Avant de toucher à la physique, lisez la section 1 (unités/temps). C'est la source de 90 % des pièges du projet.**

---

## 0. Le modèle en une phrase

La gravité est appliquée par le plugin **matter‑attractors** (loi en 1/r²). Les corps célestes
sont **statiques** et **cinématiques** (leur orbite est imposée par `orbitSpeed`, PAS calculée par
la gravité). Seule la fusée est un corps dynamique réellement intégré par Matter.js. La fusée est
attirée par tous les corps ; les corps ne s'attirent pas entre eux.

---

## 1. Unités & temps — LE piège central

### 1.1 deltaTime est en SECONDES, mais Matter.js suppose des millisecondes

- `GameController.gameLoop` calcule `deltaTime = (timestamp - lastTimestamp) / 1000` → **secondes**
  (borné à `[0, 0.05]`). À 60 FPS, `deltaTime ≈ 0.0167`.
- `PhysicsController.update(deltaTime)` mémorise `this.lastDeltaTime = deltaTime` puis appelle
  `Engine.update(engine, deltaTime * timeScale)` — il passe donc à Matter un delta **en secondes**.
- Or Matter.js suppose des **millisecondes** : sa constante interne `_baseDelta = 1000/60 ≈ 16.667`.

### 1.2 Conséquence : `body.velocity` de Matter n'est PAS le déplacement par pas

Matter calcule `body.velocity = (position - positionPrev) × (_baseDelta / delta)`.
Avec `delta = 1/60` et `_baseDelta = 1000/60`, le facteur vaut **1000**.

| Grandeur | Relation (à 60 FPS) |
|---|---|
| Déplacement réel par pas `D` | `D = body.velocity × (delta/_baseDelta) = body.velocity × 0.001` |
| `body.velocity` rapportée | `= D × 1000` |
| `body.velocity` en fonction de la vitesse réelle `v` (unités/seconde) | `body.velocity = v × (1000/60) ≈ v × 16.667` |

> **Vérifié empiriquement** (harnais headless avec le vrai Matter.js) : une force de 825 000 sur une
> masse de 1500 donne, à `delta=1/60`, `body.velocity ≈ 152.8` mais un déplacement réel de `0.1528`
> par pas (rapport 1000). Voir CHANGELOG (fix `35352c8`).

### 1.3 Convertir une vitesse modèle (u/s) en vitesse Matter

`model.velocity` des corps célestes est en **unités/seconde** (orbital ; voir §5).
Pour qu'un corps Matter se déplace **comme** un corps cinématique se déplaçant à `model.velocity` :

```
velocityMatter = model.velocity × (1000/60)
```

Le `dt` se **simplifie** (le mouvement réel du corps ∝ dt, et le scaling Matter ∝ 1/dt) → le facteur
est **constant = `_baseDelta = 1000/60`**, indépendant du FPS.

### 1.4 Où cette conversion est faite

Toutes les conversions `model.velocity (u/s) → vitesse Matter` utilisent **`PHYSICS.MATTER_BASE_DELTA`
(= 1000/60)**, centralisé dans `constants.js` :

| Endroit | Rôle |
|---|---|
| `ThrusterPhysics.handleLiftoff` | vélocité héritée au décollage (co‑mouvement avec le corps quitté) |
| `PhysicsController.update` étape 1 | vélocité Matter du corps mobile (vue par le solveur de collision) |
| `SynchronizationManager` (posé / débris) | stabilisation : la fusée posée co‑bouge avec le corps |
| `CollisionHandler.getCelestialBodyVelocity` | vitesse **relative** pour atterrissage/crash |
| `GameSetupController` (spawn) | vélocité héritée du corps hôte au spawn |

> Historique : ces conversions utilisaient `× deltaTime` (~1000× trop petit), ce qui rendait la
> détection atterrissage/crash **de fait absolue** sur les corps mobiles (une fusée co‑mobile sur une
> lune rapide était classée à tort comme crash). Corrigé le 2026‑06‑04, **vérifié en headless** (vrai
> Matter.js) ; voir [CHANGELOG.md](CHANGELOG.md). `handleLiftoff` (décollage) avait été corrigé en premier.

---

## 2. Gravité

### 2.1 Source unique : `PHYSICS.G` (= 0,001) pilote la gravité réelle

- La gravité est fournie par `MatterAttractors.Attractors.gravity`, attaché à la fusée **et** à
  chaque corps céleste dans `BodyFactory` (`plugin.attractors`).
- Formule du plugin : `magnitude = -gravityConstant × (massA × massB) / distanceSq`.
- **`PHYSICS.G` est la source unique.** Au démarrage (`PhysicsController.initPhysics`) et à chaque
  chargement de monde (`GameSetupController`, après lecture de `data.physics.G`), le code copie
  `PHYSICS.G` dans `MatterAttractors.Attractors.gravityConstant` ; le plugin lit cette valeur à chaque
  `Engine.update`.
- ⇒ **Gravité RÉELLE = visualisation = IA = `PHYSICS.G` (= 0,001 par défaut).** Un preset peut la
  surcharger via `data.physics.G`, et la gravité réelle suit.

### 2.2 Visualisation & IA utilisent la même `PHYSICS.G`

- Les calculs de **debug/visualisation/IA** (`calculateGravityForceForDebug`, `calculateGravityAtPoint`,
  `calculateGravityAccelerationAt` → champ de gravité affiché, vecteurs, état pour l'IA) utilisent
  `PHYSICS.G`, **désormais égale à la gravité réelle** : le champ dessiné est fidèle et l'IA perçoit la
  vraie gravité.
- Les cibles d'orbite IA (`AI_TRAINING.ORBIT`) sont recalculées pour `G=0,001` (≈ ×√10 vs l'ancien
  0,0001). ⚠️ Leur calibrage absolu en unités Matter (cf. §1) reste à valider par un entraînement réel.
- Historique : avant le 2026‑06‑04, le plugin gardait son défaut 0,001 (jamais surchargé) tandis que
  `PHYSICS.G=0,0001` ne servait qu'à la viz/IA → champ ~10× trop faible et IA incohérente. Unifié
  (Option A) ; voir [CHANGELOG.md](CHANGELOG.md).

### 2.3 Décollabilité = rapport poussée/gravité (indépendant des unités)

Accélération de poussée (plein régime principal) = `825000 / 1500 = 550`.
Accélération de gravité de surface = `G_plugin × M_corps / d²` (avec `d ≈ rayon + HEIGHT/2`).

| Corps | masse | rayon | a_gravité | poussée/gravité | décolle ? |
|---|---|---|---|---|---|
| Terre (`1_solar`) | 2e11 | 720 | ≈ 356 | **1,55** | ✅ |
| Âtrebois **avant** | 2e11 | 300 | ≈ 1836 | **0,30** | ❌ (impossible) |
| Âtrebois **après** (`3e10`) | 3e10 | 300 | ≈ 275 | **2,0** | ✅ |

> Règle de design : pour qu'un corps soit décollable, **poussée/gravité > 1** (viser ~1,5–3).
> Comme G_plugin = 0,001, des masses « réalistes » (2e11) avec petits rayons rendent le décollage
> impossible. Les masses des presets doivent être tunées pour ce G.

### 2.4 Les orbites sont CINÉMATIQUES

`CelestialBodyModel.updateOrbit(dt)` impose l'orbite (pas de gravité entre corps) :
```
currentOrbitAngle += orbitSpeed × dt           // orbitSpeed en rad/seconde
position = parent.position + (cos, sin)(currentOrbitAngle) × orbitDistance
velocity = ω×r perpendiculaire + parent.velocity   // tangentSpeed = orbitSpeed × orbitDistance  (u/s)
```
⇒ **La masse d'un corps n'influe QUE sur la gravité ressentie par la fusée**, jamais sur les
trajectoires des corps. On peut donc rééquilibrer les masses sans casser les orbites.

---

## 3. Poussée & propulsion (`ThrusterPhysics`)

### 3.1 Force d'un propulseur

`powerRatio = clamp(power / maxPower, 0, 1)`. Force appliquée via `Body.applyForce` au **point du
propulseur** (bras de levier `THRUSTER_POSITIONS`, tourné par l'angle fusée) :

| Propulseur | Formule | Force max (plein régime) |
|---|---|---|
| `main` | `MAIN_THRUST × ratio × EFFECTIVENESS.MAIN × THRUST_MULTIPLIER` | `5500 × 1.5 × 100 = 825 000` |
| `rear` | `REAR_THRUST × ratio × EFFECTIVENESS.REAR × THRUST_MULTIPLIER` | `3000 × 1.5 × 100 = 450 000` |
| `left`/`right` | `(LATERAL_THRUST × ratio × EFFECTIVENESS.LATERAL × THRUST_MULTIPLIER) / 2` | `(100 × 0.3 × 100)/2 = 1 500` chacun |

- `power` est une **valeur absolue** (0..maxPower), pas un pourcentage. Utiliser `power/maxPower`.
- `main`/`rear` poussent selon l'axe fusée ; `left`/`right` perpendiculairement (contrôle de rotation).
- Si `fuel <= 0` → force nulle. La **consommation** est gérée uniquement dans `RocketModel.update`
  (`power × FUEL_CONSUMPTION[type] × dt`), pour éviter la double‑décrémentation.

### 3.2 Décollage (`handleLiftoff`)

Appelé quand `main` est actif et la fusée posée. Une seule fois par décollage (ensuite `isLanded=false`).
1. Récupère la vélocité héritée du corps quitté : `model.velocity × (1000/60)` (co‑mouvement, §1.3).
2. `isLanded=false`, `landedOn=null`, `relativePosition=null`, `startLiftoffGracePeriod(500)`.
3. Impulsion `applyForce` de 50 vers l'extérieur (`angle - π/2`).
4. `setVelocity = 20 (vers l'extérieur) + vélocité héritée`.

---

## 4. Boucle physique & synchronisation

### 4.1 `PhysicsController.update(deltaTime)` — ordre exact

1. **Corps célestes** : pour chaque corps mobile (`parentBody != null`) → `setPosition(model.position)`
   et `setVelocity(model.velocity × lastDeltaTime)` (cf. §1.4 ⚠️), `isSleeping=false`.
2. `synchronizationManager.handleLandedOrAttachedRocket` (épingle la fusée posée/attachée — §4.3).
3. `thrusterPhysics.applyRotationStabilization` (amortit la rotation si contrôles assistés).
4. `thrusterPhysics.updateThrusters` (applique les forces des propulseurs).
5. **`Engine.update(engine, deltaTime)`** → gravité (plugin), collisions, intégration. **C'est ici
   que la gravité réelle (G=0,001) agit.**
6. `synchronizationManager.syncModelWithPhysics` **sauf** si `isHandledManually` (posé/attaché sur
   un corps mobile, ou posé sur 'Terre').
7. `checkRocketLandedStatusPeriodically` (~toutes les 150 ms).

### 4.2 Crochets Matter (enregistrés par `SynchronizationManager`)

`SynchronizationManager` n'est **pas** appelé directement comme « sync() » : il s'abonne aux
événements du moteur :
- `beforeUpdate` : `syncMovingBodyPositions()` + (si posé/détruit **et** pas en grâce **et** pas de
  poussée) `handleLandedOrAttachedRocket` + `syncPhysicsWithModel` (modèle → physique).
- `afterUpdate` : `syncModelWithPhysics` (physique → modèle).

> La synchro est donc **bidirectionnelle** : `physique → modèle` en vol (`afterUpdate`), mais
> `modèle → physique` quand la fusée est posée/attachée (pour la coller à la surface).

### 4.3 Fusée posée sur un corps mobile (épinglage)

Quand `isLanded` sur un corps en orbite, `handleLandedOrAttachedRocket` :
- calcule/maintient `relativePosition` (offset polaire vs centre du corps + angle orbital de référence) ;
- chaque frame : `updateAbsolutePosition` recalcule la position depuis l'orbite courante du corps,
  `setPosition` force la fusée dessus, angle perpendiculaire forcé, vélocité = vélocité parent, ω=0.
- **Garde décollage** : si `main > TAKEOFF_THRUST_THRESHOLD_PERCENT` (10 %), retourne **immédiatement**
  (pas d'épinglage) et déclenche/rafraîchit la grâce → la fusée n'est jamais re‑collée pendant la poussée.

---

## 5. Machine à états atterrissage / crash / décollage (`CollisionHandler`)

### 5.1 `isRocketLanded`

- **Délai de collision** : aucune collision pendant `COLLISION_DELAY = 2000 ms` après init.
- **Grâce de décollage** : si `isInLiftoffGracePeriod()` → renvoie `false` (jamais posé).
- **Proximité** : `|distance - rayon - HEIGHT/2| < 15 px`.
- **Vitesse relative** au corps (via `getCelestialBodyVelocity`, à l'échelle Matter correcte — donc
  réellement relative : co‑mobile sur une lune rapide ⇒ atterrissage doux, pas crash).
- **CRASH** si proche & collisions actives & au moins un de :
  `vitesse ≥ CRASH_SPEED_THRESHOLD (2500)` · `|Δangle| ≥ CRASH_ANGLE_DEG (45°)` ·
  `|ω| ≥ CRASH_ANGULAR_VELOCITY (400)` → `isDestroyed=true`, dégâts fatals, enfoncement visuel.
- **ATTERRISSAGE STABLE** si proche & **toutes** :
  `vitesse < LANDING_MAX_SPEED (2500)` · `|Δangle| ≤ LANDING_MAX_ANGLE_DEG (30°)` ·
  `|ω| ≤ LANDING_MAX_ANGULAR_VELOCITY (400)`.

> ⚠️ Les seuils sont en **unités Matter rapportées** (≈ u/s × 16,667). 2500 ↔ ~150 u/s. Les seuils
> atterrissage et crash étant tous deux à 2500, l'angle/ω départagent les cas limites.

### 5.2 Grâce de décollage (`RocketModel`)

- `startLiftoffGracePeriod(500)` : pose `_liftoffGracePeriodEnd = Date.now() + 500`.
- Rafraîchie **chaque frame** tant que `main > 10 %` (couvre tout le décollage + 500 ms après).
- `isInLiftoffGracePeriod()` (lecture seule) ; `canSetLanded()` (renvoie false pendant la grâce, et
  toujours false si `isDestroyed`).

---

## 6. Corps physiques (`BodyFactory`)

| Propriété | Fusée | Corps céleste |
|---|---|---|
| type | `rectangle(WIDTH=30, HEIGHT=60)`, dynamique | `circle(radius)`, `isStatic: true` |
| `mass` | `ROCKET.MASS = 1500` | `bodyModel.mass` (du JSON) |
| `inertia` | `MASS × 1.5` | — |
| `friction` | `0` | `0.05` |
| `frictionAir` | `0.1` | — |
| `restitution` | `0.05` | `PHYSICS.RESTITUTION = 0.2` |
| `sleepThreshold` | `-1` (jamais endormi) | — |
| `collisionFilter` | cat `ROCKET (0x0001)`, masque `0xFFFFFFFF` | cat `CELESTIAL (0x0002)`, masque `ROCKET` |
| `plugin.attractors` | `[Attractors.gravity]` | `[Attractors.gravity]` |
| `angularDamping` | dynamique (assisté : 2.0 / normal : 0.0) | — |

---

## 7. Référence des constantes (`constants.js`)

**PHYSICS** : `G=0.001` (source unique : gravité réelle = viz = IA, copiée dans le plugin) · `MAX_SPEED=10000` · `COLLISION_DELAY=2000` ·
`IMPACT_DAMAGE_FACTOR=10` · `RESTITUTION=0.2` · `CRASH_SPEED_THRESHOLD=2500` ·
`LANDING_MAX_SPEED=2500` · `LANDING_MAX_ANGLE_DEG=30` · `LANDING_MAX_ANGULAR_VELOCITY=400` ·
`CRASH_ANGLE_DEG=45` · `CRASH_ANGULAR_VELOCITY=400` · `TAKEOFF_THRUST_THRESHOLD_PERCENT=10` ·
`THRUST_MULTIPLIER=100` · `COLLISION_CATEGORIES{ROCKET:0x0001, CELESTIAL:0x0002}` ·
`ASSISTED_CONTROLS{NORMAL_ANGULAR_DAMPING:0, ASSISTED_ANGULAR_DAMPING:2, ROTATION_STABILITY_FACTOR:0.05}`.

**ROCKET** : `MASS=1500` · `WIDTH=30` · `HEIGHT=60` · `FRICTION=0` · `MAX_HEALTH=100` ·
`FUEL_MAX=6000` · `FUEL_CONSUMPTION{MAIN:0.2, REAR:0.2, LATERAL:0.05}` · `MAIN_THRUST=5500` ·
`LATERAL_THRUST=100` · `REAR_THRUST=3000` · `THRUSTER_POWER{MAIN:1000, REAR:200, LEFT:20, RIGHT:20}` ·
`THRUSTER_EFFECTIVENESS{MAIN:1.5, REAR:1.5, LATERAL:0.3}` ·
`THRUSTER_POSITIONS{MAIN:{-π/2,30}, REAR:{π/2,30}, LEFT:{π,15}, RIGHT:{0,15}}`.

> Constantes liées centralisées dans `PHYSICS` : `MATTER_BASE_DELTA` (= 1000/60, cf. §1),
> `LANDING_PROXIMITY_THRESHOLD` (15 px), `CRASH_SINK_DEPTH` (40 px).

---

## 8. Pièges récapitulatifs

1. **Ne jamais raisonner « body.velocity = déplacement par pas ».** C'est `× 1000/60` la vitesse u/s.
2. **La gravité réelle = `PHYSICS.G` = 0,001** (copiée dans le plugin) ; le champ de gravité affiché est fidèle.
3. **Masses des presets** : tuner pour `poussée/gravité > 1` (G=0,001).
4. **Orbites cinématiques** : changer une masse ne change pas les orbites.
5. **Décollage corps mobile** : la vélocité héritée doit être `× 1000/60` (sinon glissement orbital).
6. **Détection atterrissage/crash sur corps mobile** : relative au corps (co‑mobile = atterrissage doux).
7. **Tester** tout changement physique avec le harnais headless (vrai Matter.js) — voir CHANGELOG.
