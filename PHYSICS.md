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

> ⚠️ **La vitesse ANGULAIRE suit exactement le même piège.** `body.angularVelocity` (donc
> `rocketModel.angularVelocity`) est elle aussi en échelle Matter : **≈ rad/s × MATTER_BASE_DELTA**
> (rapport ~16,7 mesuré en headless). Conséquences pratiques :
> - `PHYSICS.LANDING_MAX_ANGULAR_VELOCITY` et `CRASH_ANGULAR_VELOCITY` (400) sont calibrées dans
>   CETTE échelle — elles valent ~24 rad/s réels (≈ 3,8 tours/s), pas 400 rad/s comme l'annotation
>   historique le laissait croire. Ne pas les « corriger » en rad/s sans recalibrer le gameplay.
> - Toute comparaison d'une vitesse angulaire à un seuil exprimé en rad/s doit d'abord diviser par
>   `MATTER_BASE_DELTA` (c'est ce que fait désormais `RocketAI`).
> - La feature d'état angulaire de l'IA est calibrée sur `CRASH_ANGULAR_VELOCITY`, dans l'échelle
>   Matter, pour couvrir toute la plage « rotation sûre → rotation fatale ».

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
| `SynchronizationManager` (posé / débris) | stabilisation : la fusée posée co‑bouge avec le corps |
| `CollisionHandler.getCelestialBodyVelocity` | vitesse **relative** pour atterrissage/crash |
| `GameSetupController` (spawn) | vélocité héritée du corps hôte au spawn |

> ⚠️ **EXCEPTION — `PhysicsController.update` étape 1 (corps célestes) : `× deltaTime`, PAS
> `× MATTER_BASE_DELTA`.** `Body.setVelocity` écrit `positionPrev = position − v × timeScale`, avec
> `timeScale = body.deltaTime / _baseDelta`. Or `body.deltaTime` n'est mis à jour que par
> `Body.update`, que `Engine._bodiesUpdate` **saute pour les corps statiques** : les corps célestes
> gardent `deltaTime = _baseDelta` ⇒ `timeScale = 1`, alors que la fusée (dynamique) obtient
> `timeScale ≈ 0,001`. Le même facteur ne convient donc pas aux deux. Avec `MATTER_BASE_DELTA` le
> corps mobile présentait au solveur une vitesse **1000× trop grande** et éjectait la fusée dès
> qu'elle n'était plus épinglée (décollage depuis une lune en orbite, contact rasant). Corrigé le
> 2026‑08‑24, vérifié en headless contre le vrai Matter.js 0.19.

> Historique : ces conversions utilisaient `× deltaTime` (~1000× trop petit), ce qui rendait la
> détection atterrissage/crash **de fait absolue** sur les corps mobiles (une fusée co‑mobile sur une
> lune rapide était classée à tort comme crash). Corrigé le 2026‑06‑04, **vérifié en headless** (vrai
> Matter.js) ; voir [CHANGELOG.md](CHANGELOG.md). `handleLiftoff` (décollage) avait été corrigé en premier.

### 1.5 Conversion inverse (vitesse Matter → u/s) — pour l'IA

Le **sens inverse** (`body/model.velocity` en échelle Matter → **u/s**) est nécessaire côté IA : le
vecteur d'état du DQN et les récompenses de navigation sont définis en u/s. Il passe par un **point de
conversion unique** :

```
PhysicsVectors.matterToGameVelocity(v)  // = v / PHYSICS.MATTER_BASE_DELTA
```

| Appelant | Rôle |
|---|---|
| `RocketAI.buildStateVector` | normalise la vitesse fusée (dims 2/3/8/10/11 du vecteur d'état) |
| `HeadlessRocketEnvironment._rocketSpeedUnitsPerSec` + rewards navigate | vitesse/vitesse radiale en u/s pour les cibles `NAVIGATE_REWARDS` et les seuils de succès |

> Auparavant la constante `1000/60` était réécrite en dur à chaque site (RocketAI + 3 sites de
> l'environnement headless) — source de bugs de parité entraînement/jeu. Centralisée le 2026‑07‑03.

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
   un corps mobile, ou posé sur 'Terre'). ⚠️ En pratique cette étape est un **no-op** : le crochet
   `afterUpdate` (§4.2) a déjà fait la synchro à la fin de `Engine.update`, donc *avant* ce point.
   C'est pour cela que le même prédicat est désormais appliqué DANS le crochet
   (`SynchronizationManager.isRocketHandledManually`, source unique).
7. `checkRocketLandedStatusPeriodically` (~toutes les 150 ms).

### 4.2 Crochets Matter (enregistrés par `SynchronizationManager`)

`SynchronizationManager` n'est **pas** appelé directement comme « sync() » : il s'abonne aux
événements du moteur :
- `beforeUpdate` : `syncMovingBodyPositions()` + (si posé/détruit **et** pas en grâce **et** pas de
  poussée) `handleLandedOrAttachedRocket` + `syncPhysicsWithModel` (modèle → physique).
- `afterUpdate` : `syncModelWithPhysics` (physique → modèle), **sauf si la fusée est épinglée**
  (`isRocketHandledManually` : posée sur un corps en orbite, ou sur 'Terre').

> La synchro est donc **bidirectionnelle** : `physique → modèle` en vol (`afterUpdate`), mais
> `modèle → physique` quand la fusée est posée/attachée (pour la coller à la surface).

> ⚠️ **Historique (corrigé le 2026‑08‑24).** Le crochet `afterUpdate` synchronisait sans condition.
> Comme il s'exécute à la FIN de `Engine.update`, il passait avant le garde de l'étape 6 — qui
> était donc mort — et réécrivait chaque frame l'épinglage par l'état post‑solveur. Mesuré en
> headless : sur Phobos (`orbitSpeed` 0,8), la position du modèle oscillait de **±16 unités**, soit
> ~40 % du rayon du corps ; sur la Lune, la vitesse affichée valait 7,6–8,4 u/s au lieu des 10 u/s
> du corps porteur, en clignotant (les frames où l'étape 7 réépinglait rétablissaient la bonne
> valeur). Après correction : écrasement 0,000 u, vitesse exacte, et aucune régression mesurée sur
> l'atterrissage, le ré‑atterrissage après un saut, ni le décollage.

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
  `vitesse ≥ CRASH_SPEED_THRESHOLD (2500)` · `|Δangle| > CRASH_ANGLE_DEG (30°)` ·
  `|ω| > CRASH_ANGULAR_VELOCITY (400)` → `isDestroyed=true`, dégâts fatals, enfoncement visuel.
- **ATTERRISSAGE STABLE** si proche & **toutes** :
  `vitesse < LANDING_MAX_SPEED (2500)` · `|Δangle| ≤ LANDING_MAX_ANGLE_DEG (30°)` ·
  `|ω| ≤ LANDING_MAX_ANGULAR_VELOCITY (400)`.

> ⚠️ Les seuils sont en **unités Matter rapportées** (≈ u/s × 16,667). 2500 ↔ ~150 u/s. Crash et
> atterrissage utilisent désormais les **mêmes** seuils sur les trois axes (vitesse 2500, angle 30°,
> ω 400) : tout contact proche est donc soit un atterrissage, soit un crash — **aucune zone morte**.
> (CRASH_ANGLE_DEG a été ramené 45°→30° le 2026‑06‑14 : la bande 30‑45° laissait la fusée glisser
> sans coller ni crasher depuis l'adoucissement des dégâts d'impact P3.)

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
| `friction` | `0` | `0.05` demandé → **forcé à `1` par `Body.setStatic`** |
| `frictionAir` | `0.1` (effet réel ~1000× plus faible, cf. note) | — |
| `restitution` | `0.05` | `PHYSICS.RESTITUTION = 0.2` demandé → **forcé à `0`** |
| `sleepThreshold` | `-1` (jamais endormi) | — |
| `collisionFilter` | cat `ROCKET (0x0001)`, masque `0xFFFFFFFF` | cat `CELESTIAL (0x0002)`, masque `ROCKET` |
| `plugin.attractors` | `[Attractors.gravity]` | `[Attractors.gravity]` |

> ⚠️ **Pièges de cette table**
> - **`Body.setStatic(body, true)` écrase `restitution` (→ 0) et `friction` (→ 1)** après
>   `Body.create` ; seuls `mass`/`inertia` sont restaurés. `PHYSICS.RESTITUTION = 0.2` est donc un
>   réglage **mort** : le rebond effectif vient du `restitution: 0.05` de la fusée (`Pair.update`
>   prend `max(restitution)` et `min(friction)`).
> - **`angularDamping` n'existe pas dans Matter.js.** La ligne qui figurait ici (« assisté 2.0 /
>   normal 0.0 ») décrivait une propriété fantôme, sans effet : les constantes
>   `ASSISTED_ANGULAR_DAMPING` / `NORMAL_ANGULAR_DAMPING` ne sont lues par aucun moteur. Les
>   écritures ont été supprimées le 2026‑08‑24 ; l'assistance réelle est
>   `ThrusterPhysics.applyRotationStabilization()` (désormais indépendante du framerate).
> - **`frictionAir`** est appliqué par Matter comme `1 − frictionAir × (delta/_baseDelta)` ; avec un
>   `delta` en secondes le facteur vaut ~0,9999 par pas, soit ~0,6 %/s de perte au lieu des 10 %
>   que la valeur laisse supposer.

---

## 7. Référence des constantes (`constants.js`)

**PHYSICS** : `G=0.001` (source unique : gravité réelle = viz = IA, copiée dans le plugin) · `MAX_SPEED=10000` · `COLLISION_DELAY=2000` ·
`IMPACT_DAMAGE_FACTOR=1.0` (en u/s, cf. §5) · `RESTITUTION=0.2` · `CRASH_SPEED_THRESHOLD=2500` ·
`LANDING_MAX_SPEED=2500` · `LANDING_MAX_ANGLE_DEG=30` · `LANDING_MAX_ANGULAR_VELOCITY=400` ·
`CRASH_ANGLE_DEG=30` · `CRASH_ANGULAR_VELOCITY=400` · `TAKEOFF_THRUST_THRESHOLD_PERCENT=10` ·
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
