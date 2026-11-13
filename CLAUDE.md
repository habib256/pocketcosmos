# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pocket Cosmos is an interactive 2D rocket simulation with realistic physics using Matter.js. It features a mission system, cargo management, optional AI (TensorFlow.js), and procedural universe generation. The project uses a modular MVC-extended architecture with an EventBus for decoupled communication.

## Documentation Map

These four docs are complementary — keep them in sync when you change the code:

| File | Purpose |
|------|---------|
| **CLAUDE.md** (this file) | Architecture, conventions, how to work in the repo — start here |
| **[PHYSICS.md](PHYSICS.md)** | Precise physics/simulation reference (units, gravity, forces, collision, takeoff). **Read before touching physics.** |
| **[CHANGELOG.md](CHANGELOG.md)** | Reverse-chronological history of notable changes |
| **[TODO.md](TODO.md)** | Known issues & tech debt (esp. unit/gravity inconsistencies) and roadmap |

## Running the Project

This is a browser-based application with no build step:

1. **Start a local server**: `python -m http.server 8000` or any local web server
2. **Open in browser**: Navigate to `http://localhost:8000/index.html`
3. **Training interface**: Open `training-interface.html` for the AI training interface

**Important**: All scripts are loaded via `<script>` tags in HTML files. The project does NOT use ES6 modules (`import`/`export`). Load order in HTML is critical.

## Key Commands

Since this is a browser-based project with no build tooling:
- **No npm/package.json**: All dependencies are loaded via CDN in the HTML files
- **No tests**: Manual testing only
- **No linting**: Code style is manual

For development, simply edit files and refresh the browser.

## Architecture Overview

### Core Pattern: MVC + EventBus

The codebase follows an extended MVC pattern with centralized event-driven communication:

- **Models** (`models/`): Pure data state (the "source of truth"). No complex logic.
- **Views** (`views/`): Canvas rendering only. Read from models, never modify state.
- **Controllers** (`controllers/`): All logic, physics, and orchestration.
- **EventBus** (`controllers/EventBus.js`): Decoupled communication between components.

### The Essential Trio

To understand 80% of the codebase, start with these three files:

1. **`controllers/GameController.js`**: The orchestrator containing the main game loop
2. **`models/RocketModel.js`**: The rocket's complete state (position, fuel, health, etc.)
3. **`controllers/RenderingController.js`**: Coordinates all views for rendering

### Entry Point Flow

1. `index.html` loads all scripts in specific order
2. `main.js` initializes on DOM ready
3. `GameSetupController` creates all components
4. `GameController` starts the game loop

## EventBus System

The EventBus is the heart of inter-module communication:

- **Access**: `window.eventBus` (instance), `window.EVENTS` (event keys)
- **Event definitions**: All keys centralized in `EventTypes.js`
- **Usage**:
  - Emit: `eventBus.emit(window.EVENTS.ROCKET.RESET, data)`
  - Subscribe: `eventBus.subscribe(window.EVENTS.ROCKET.RESET, (data) => {...})`
  - Wildcard: `eventBus.subscribe('PHYSICS.*', (data) => {...})`

### Critical Event Flows

**User Input → Rocket Thrust**:
1. `InputController` detects keypress — or `TouchControlsController` a held on-screen button, which
   calls `inputController.appuyerCommande(action)` / `relacherCommande(action)`: the source is
   recorded in `activeKeyActions` as `${action}-tactile`, exactly like a key (`${action}-${code}`),
   so source counting, release on `blur`/`ROCKET_RESET`, etc. apply to fingers too
2. Emits `ROCKET_THRUST_*` or `INPUT_ROTATE_COMMAND`
3. `RocketController` updates `RocketModel`
4. `ThrusterPhysics` applies force to Matter.js body

**Game Loop** (~60 FPS via `requestAnimationFrame`; `deltaTime` in **seconds**, capped at 0.05):
1. `inputController.update()`
2. `universeModel.update(deltaTime)` — advances the kinematic orbits
3. `physicsController.update(deltaTime)` — orbits sync → landed-rocket pinning → thrusters → `Engine.update` (gravity + collisions) → model sync → periodic landing check
4. `rocketController.update()`, `rocketAI.update()` (if active), `particleController.update()`, `rocketModel.update()` (fuel), `cameraModel.update()`, `missionManager.update()`
5. `renderingController.render()` draws the current state

> `SynchronizationManager` has **no** `sync()` entry point: it hooks Matter's `beforeUpdate`/`afterUpdate` events and syncs **bidirectionally** (physics→model in flight; model→physics when landed/attached, to pin the rocket to a surface). See [PHYSICS.md §4](PHYSICS.md).

**Collision Handling**:
1. Matter.js detects collision
2. `CollisionHandler` analyzes impact (speed, angle, angular velocity) against thresholds in `constants.js`
3. Updates `rocketModel.isLanded` or `rocketModel.isDestroyed`, recalculates relative position on landing
4. `SynchronizationManager` force-syncs the rocket's position/velocity to "attach" it to the body (no Matter constraint is created)
5. Landing triggers `MISSION_COMPLETED` check via `MissionManager`

## Universe System (Presets & Procedural)

The universe is loaded from JSON presets. ⚠️ **`source: 'random'` is NOT implemented**: the loader
requires `window.ProceduralGenerator.generate`, which is never assigned anywhere in the repo, so a
random request just logs a warning and restores the previous state. (Asteroid *belts* inside a preset
are genuinely procedural — that is a different thing.)

- **Preset files**: `assets/worlds/*.json` (6 worlds available). ⚠️ Only `1_solar.json` declares
  `missions`; in the other five, missions/cargo/credits are inert.
- **Load flow**:
  1. Emit `UNIVERSE_LOAD_REQUESTED` with `{ source: 'preset', url }`
  2. `GameController.handleUniverseLoadRequested` pauses and loads data
  3. `GameSetupController.buildWorldFromData` constructs new `UniverseModel`
  4. Emits `UNIVERSE_STATE_UPDATED` then `UNIVERSE_RELOAD_COMPLETED`

### World Preset Schema

JSON files in `assets/worlds/` can define:
- `physics.G`: Override for the gravitational constant (replaces `PHYSICS.G` from `constants.js`)
- `bodies[]`: Celestial bodies with `hasRings`, `atmosphere { exists, height, color }`.
  ⚠️ **An atmosphere must now be declared explicitly.** `CelestialBodyModel` used to fall back on the
  body's *name* (`name === 'Terre'`) when the preset said nothing — and no preset said anything. The
  default is `false` since 2026‑08‑25, and `1_solar.json` declares the Earth's atmosphere with the
  previously implicit values (`height: 0.1666` → 119.952, same colour). The other five worlds have
  no atmosphere, as before.
- `rocket.spawn`: Spawn location (hostName+angle OR position/velocity/angle). **Optional**: with no
  `spawn`, `buildWorldFromData` still resets the rocket and lands it on the first celestial body.
- `stations[]`: Stations anchored to bodies. An unknown `hostName` is kept in the model but is
  neither drawn nor refuelling — it now logs a warning.
- `asteroidBelts[]`: Procedural asteroid fields. `count: 0` is honoured (it used to fall back to the
  default, 1500).
- `starsConfig`: Background star generation. `count: 0` is honoured (it used to fall back to 800).
- `narratives`: Story elements — ⚠️ parsed and stored in `universeModel.narratives`, but read by NO
  view to this day (see CHANGELOG.md and TODO.md).
- `missions[]`: Available missions

## Physics & Matter.js

- **Engine**: Matter.js 0.19.0 with the matter-attractors plugin
- **Gravity**: Applied by the matter-attractors plugin during `Engine.update`. `PHYSICS.G` (**0.001**, overridable per preset) is the SINGLE source of truth: at init and on each world load, the code copies `PHYSICS.G` into the plugin's `gravityConstant`, so **real gravity = visualization = AI**. See [PHYSICS.md §2](PHYSICS.md).
- **Units pitfall**: the game passes `deltaTime` in **seconds** to `Engine.update`, while Matter assumes **milliseconds** (`_baseDelta = 1000/60`). Consequence: a body's `velocity` ≈ (units/second) × (1000/60). This is the root of most physics subtleties.
- **Read the rocket's velocity through `Matter.Body.getVelocity` / `getAngularVelocity`.** Inside the `collisionStart` handler, `body.velocity` is not yet rescaled (the event fires before `Engine._bodiesUpdateVelocities`), so the raw field is ~1000× too small there and consistent nowhere else. The accessors return the rescaled value from any point of the cycle. See [PHYSICS.md §1.6](PHYSICS.md).
- **Orbits are kinematic**: celestial bodies follow a prescribed `orbitSpeed` (not gravity), so a body's mass only affects the gravity felt by the rocket — never the bodies' own trajectories.
- **Collision categories**: Defined in `PHYSICS.COLLISION_CATEGORIES`
- **Thresholds**: Landing/crash/liftoff in `constants.js`

**Important**: Manual gravity calculations (`calculateGravityAccelerationAt`, etc.) are for visualization/debug/AI only, NOT for applying forces.

👉 **Precise physics reference (units, forces, takeoff, collision, sync, constants): [PHYSICS.md](PHYSICS.md). Read it before changing physics.**

## Constants & Configuration

**`constants.js`** is the single source of truth for all magic numbers:
- Physics constants (`PHYSICS.G`, thresholds, assisted controls)
- Rocket parameters (`ROCKET.THRUSTER_POWER`, `FUEL_CONSUMPTION`, `THRUSTER_EFFECTIVENESS`)
- Celestial body defaults (`CELESTIAL_BODY`) with per-planet/moon parameters
- Collision categories
- AI training parameters (`AI_TRAINING` with orbit, landing, navigation rewards, and safety limits)
- Station parameters (`STATIONS`)
- Rendering constants (`RENDER`)
- Particle constants (`PARTICLES`)

World-specific data (body masses, positions) should come from preset JSON files, not constants. When a preset is loaded, `GameSetupController.buildWorldFromData()` overrides relevant constants (e.g., `PHYSICS.G`) with values from the preset.

## Rendering System

**Rendering pipeline** (in `RenderingController.render()`):
1. Clear canvas
2. `universeView.render()`: Background, stars, celestial bodies, asteroid belts
3. `stationView.render()`: Station icons/labels anchored to bodies
4. `traceView.render()`: Trajectory trail
5. `particleView`: Thrust/explosion particles
6. `rocketView.render()`: Rocket with thrusters
7. Conditional: `vectorsView` (force vectors and/or gravity field arrows/equipotentials)
8. `uiView.render()`: HUD and modal screens

(The full scene is drawn **while paused too** — only the simulation stops; the pause veil is painted
over the frozen image. The older behaviour, where pause skipped straight to `uiView.render()`, made
the whole universe vanish behind the veil.)

**Visual features**:
- Day/night shadowing on planets oriented by central star
- Atmospheric rendering with shadows — ⚠️ only bodies whose preset declares `atmosphere.exists`
- Planetary rings rendered in two passes (back/front)
- Particle effects for thrust and explosions — thrust emitters follow the thruster's actual `power`,
  not just `fuel > 0` (a refuel used to revive a ghost plume on a thruster at 0)
- Force vectors (key `V`): thrust, velocity, `a=F/m`, mission start/target, and the resultant
  gravitational attraction (label `g`, magenta) — the last one was documented but never drawn before
  2026‑08‑25
- Gravity field visualization (key `G`: arrows or equipotential lines). ⚠️ The **arrow** mode encodes
  magnitude on a **log scale relative to the range actually present in the view**, not on absolute
  thresholds: the old thresholds were 2–7 orders of magnitude below real accelerations, so 100 % of
  arrows came out red and length-saturated at every zoom
- Culling (`UniverseView.renderCelestialBodies`) tests the **painted** extent, not `body.radius`:
  rings reach 2.1 R and an atmosphere reaches R + `height`

## AI System

The AI uses a **Double DQN** with TensorFlow.js (online net selects the next action, target net values it — `RocketAI.train`):

- **Agent**: `RocketAI.js` - Makes piloting decisions
- **Training**: `TrainingOrchestrator.js` - Manages episodes/rewards
- **Environment**: `HeadlessRocketEnvironment.js` - Fast simulation without rendering, includes imminent crash detection to accelerate training
- **Visualization**: `TrainingVisualizer.js` - Real-time training metrics with navigation point display
- **Model zoo**: `AIModelStore.js` - Named model persistence (IndexedDB + downloadable files + shippable `assets/models/`)
- **Reproducibility**: `SeededRandom.js` - mulberry32 seeded RNG (deterministic training + fixed eval set)

**In-game AI = pure inference (NPC posture)**: `RocketAI` NEVER learns in-game — `step()` and the hardcoded `calculateReward()` were removed, so there is a SINGLE reward definition (in `HeadlessRocketEnvironment`). In-game, `makeDecision()` runs the trained network's greedy policy **if a model was loaded** (`_modelLoaded`), else falls back to the `maintainOrbit` heuristic. Learning happens ONLY in headless training via `TrainingOrchestrator`.

> ⚠️ **`maintainOrbit` must emit a command on EVERY branch.** `ROCKET_SET_THRUSTER_POWER` is
> idempotent *and persistent*: a branch that emits nothing leaves the previous step's thruster
> burning. Two such holes were closed on 2026‑08‑25 — the nominal-orbit sub-branch (main thruster
> stayed at 1000 and destroyed the orbit it had just reached) and the **landed** case (the rocket is
> re-pinned every frame by `SynchronizationManager`, so steering does nothing while a lateral
> thruster stays lit: measured 3600 frames of `rotateLeft` for a strictly unchanged angle). The
> heuristic now cuts all four thrusters (`noAction`) when `rocketData.isLanded` — `update()` feeds
> `isLanded`/`landedOn` into the snapshot for that. No take-off sequence was added.

**Reproducibility**: pass `config.seed` (or the UI "Seed" field) to make the initial angle (per episode), the epsilon exploration AND the replay minibatch sampling deterministic. ⚠️ It does **not** seed the network's initial weights nor `model.fit()`'s internal shuffle, so a seeded run is not bit-for-bit replayable today (see TODO.md). The orchestrator sets the angle itself before every reset — `randomizeInitialAngle` must stay off for `navigate`, since it would re-overwrite that angle with an unseeded `Math.random()` inside `reset()`. Evaluation uses a **fixed angle set** derived from the seed, so scores compare across runs and models. `compareModels(a, b)` in `train.js` pits two zoo models on that fixed eval set.

**State vector** (`RocketAI.buildStateVector`, single source of truth): **12 dims, `STATE_VERSION 2`**. Scales live in `AI_TRAINING.STATE` (`constants.js`), NOT hardcoded. Dims 0-9 = rocket-vs-target (position delta, velocity, orientation sin/cos, angular vel, distance, radial velocity, heading alignment); dims **10-11 = target's own velocity** in u/s (0 only when the target is genuinely static). These are live on BOTH paths: in training via `missionConfig.movingTarget` (`intercept`), and in game via the mission target body's — or the reference body's — own velocity (`RocketAI.update`/`resolveMissionTarget`). They were structurally zero in game until 2026‑08‑25, which broke the training/inference parity the 12-dim vector exists for. Rocket velocity is stored in Matter scale and converted to u/s via the single point `PhysicsVectors.matterToGameVelocity` (see [PHYSICS.md §1.5](PHYSICS.md)). ⚠️ Changing `STATE_SIZE`/`STATE_VERSION` invalidates saved models — `AIModelStore` refuses incompatible ones at load.

**Model persistence** (`AIModelStore`, this is the bridge to future NPCs): models are named per role/objective and stored in **IndexedDB** (`indexeddb://pc-model-<name>`) with a JSON metadata registry in localStorage. `load(name)` falls back to `assets/models/<name>/model.json` (+ `meta.json`) so pretrained pilots can be committed to the repo and loaded at game start. `exportToFile`/`importFromFiles` move models via downloaded files. `RocketAI.saveModel(name)`/`loadModel(name)` delegate here; the old single-key `localstorage://rocket-ai-model` (v1, 10 dims) is obsolete and read-only-detected only to warn.

**Training objectives** (low-level):
- `navigate` - Point-to-point navigation (default): the rocket must fly from point A `(0,0)` to point B `(90000, 90000)` (~127k units diagonal), then **brake and stabilize** at point B. Success requires distance < 3000 AND speed < 30. Random initial angle forces the AI to learn orientation. Budget: **4000 steps** (~66s @ 1/60s — flight ~5× shorter; cruise target `VELOCITY_TARGET` ≈ 2500 u/s), infinite fuel.
- `orbit` - Achieve stable orbit at target altitude
- `land` - Soft landing on a celestial body
- `crash` - (used for crash avoidance training)

**Roles (NPC pilots)** — `AI_TRAINING.ROLES` in `constants.js`, resolved by `TrainingOrchestrator` into (objective + missionConfig). Pass `config.role` (or the UI "Rôle" dropdown):
- `race` - navigate + terminal bonus proportional to remaining step budget (fastest wins) + higher step penalty
- `intercept` - navigate to a **MOVING target** (`missionConfig.movingTarget`, pattern `linear`/`circular`); success = stay within `proximityRadius` for `proximitySteps` consecutive steps (`successMode: 'proximity'`). The moving target's velocity feeds state dims 10-11 (`getObservation` exposes `targetVX/VY`). In `proximity` mode the braking zone and the stabilisation bonus are **disabled**: both pay for standing still, whereas the success criterion requires matching a target that recedes at 800 u/s.
- `lander` - objective `land`; `orbiter` - objective `orbit`

**Curriculum / sequential runs**: `config.trainingRuns: [{ role, episodes, loadFrom?, saveAs }]` runs stages in sequence (`TrainingOrchestrator.runCurriculum`); `loadFrom` warm-starts from a zoo model (transfer, e.g. `race` from `navigate`). Emits `AI.CURRICULUM_STAGE_STARTED/COMPLETED`.

**Navigate reward system** (6 components, configured in `AI_TRAINING.NAVIGATE_REWARDS`):
1. **Delta Distance** (priority high): reward proportional to distance reduction, normalized by initial distance
2. **Heading Alignment** (priority high): dot product between rocket heading and direction to target
3. **Velocity Control** (priority medium): gaussian reward around adaptive speed target. In the **braking zone** (< 20% distance remaining, `BRAKE_ZONE_RATIO`), the target speed decreases linearly to 0
4. **Potential-Based Shaping** (priority low): `gamma * phi(s') - phi(s)` for theoretical convergence
5. **Progressive Zones** (priority medium): one-time bonuses when crossing distance thresholds (80%, 50%, 20%, 5%)
6. **Stabilization** (in last 10%, `STABILIZE_ZONE_RATIO`): strong reward for low speed near point B (`max(0, 1 - speed/STABILIZE_SPEED_REF) * DISTANCE_DELTA`)

> ⚠️ **Weights are calibrated on EPISODE SUMS, not per-step values** (rebalanced 2026‑08‑24 after an
> empirical audit). Delta-distance is a *telescoping* sum: its whole-episode total is mathematically
> capped by its own weight, so it can only rank "high" if that weight is comparable to the per-step
> components' episode totals — hence `DISTANCE_DELTA = 3000` against `HEADING_ALIGNMENT = 1`.
> Measured shares over a perfect approach (3320 steps): delta 35 % · heading 39 % · velocity 15 % ·
> zones 11 % · potential 0,2 % — i.e. the documented ordering. Before the rebalance the real shares
> were heading 85,7 % / delta **0,18 %**, because an unweighted leftover term
> (`(radialVelocity/100)*0.5`, scaled for a long-gone `VELOCITY_TARGET` of 30 u/s) alone accounted
> for 55 % of the return. That term came back through the 2026‑08‑24 merge and was removed again on
> 2026‑08‑25: at the current cruise target it paid ~12,5/step (up to 50 at `VELOCITY_MAX`) against
> `HEADING_ALIGNMENT`'s maximum of 1,0, making a yo-yo policy worth ~10⁵ against 1000 for actually
> succeeding. The legitimate radial bonus — scaled by `VELOCITY_TARGET` and switched off inside the
> braking zone — lives in `calculateVelocityReward`.
> **Do not tune one weight without re-measuring the episode-sum shares.**

> ⚠️ **Reaching the goal must beat loitering.** Success ends the episode and therefore forfeits the
> remaining per-step shaping, which used to exceed the terminal bonus: parking just outside the
> success radius paid **65 308** against **55 014** for succeeding. Success bonuses now add a
> `SUCCESS_TIME_CREDIT` (`constants.js`) proportional to the steps NOT used — success is worth
> ×1,17 the best loiter on `navigate`, ×4,1 on `orbit`. Any new per-step reward must stay below its
> objective's time credit, or loitering becomes optimal again.
> ⚠️ **The `navigate` branch actually paid `successReward` alone until 2026‑08‑25** — the credit was
> computed and dropped, i.e. exactly the case this mechanism exists for. Measured terminal bonus:
> 1000 before, **10 000** after (credit 9000), 10 750 with the `race` bonus on top. Episode-return
> magnitudes on `navigate` therefore changed: reward comparisons with earlier runs are void.

**Other reward configs** (`AI_TRAINING` in `constants.js`):
- `SUCCESS_TIME_CREDIT`: per-objective credit granted for the steps remaining at success (see above)
- `REWARDS`: Standard reward values for orbit, landing, and penalties
- `ORBIT`: Orbital parameters for the `orbit` objective, computed with G=0.001 (consistent with the real gravity since the gravity unification). ⚠️ Absolute speed calibration vs the simulation's velocity units should still be validated by training (see [PHYSICS.md §2](PHYSICS.md))

**Episode termination — `done` vs `truncated`**: the environment distinguishes a genuine terminal
state (success/crash) from a time-limit truncation. `RocketAI.train()` bootstraps
(`r + γ·max Q'`) on truncation and only uses `r` alone on a true terminal. Storing a timeout as
terminal injected a ~2000 discontinuity into the TD targets once per episode.

**State-vector scaling is task-dependent**: `RocketAI.buildStateVector` accepts a `positionScale`
(`RocketAI.positionScaleForBody(radius)`, or |B−A| for `navigate`). With the old fixed 150 000,
`orbit`/`land` positional features were pinned in `[0.005, 0.015]` while the angular ones were
O(1) — a ~200× conditioning imbalance upstream of the first normalisation layer.
**Dim 7 (distance to target) follows that same scale since 2026‑08‑25** (`STATE_SCALE_VERSION` 5): it
was still divided by the fixed `AI_TRAINING.STATE.DISTANCE_SCALE`, i.e. 67.6× off scale on
`orbit`/`land` and therefore near-constant over the whole flight domain. Measured amplitude ratio
`max(dim0,dim1)/dim7`: 67.57× before, **1.00×** after. `DISTANCE_SCALE` is no longer read.
**One rule for both paths**: `RocketAI.positionScaleForTask(objective, ctx)` is the single source —
the criterion is the OBJECTIVE, never the mere presence of a mission target. Before, any mission
(`1_solar` starts with "Terre → Lune" active) switched the game to 150 000 while training used 2220.
Parity is now exact on `orbit` and `land` (0 of 12 dims diverging). ⚠️ It is **not** exact on
`navigate`: `RocketAI._navigateTravelDistance` is assigned nowhere, so the game falls back to
150 000 against 127 279 in training (17.85 % gap on dims 0/1/7). Latent today — `setObjective` is
only called by `TrainingOrchestrator`, so in game `currentObjective` stays `'orbit'` and the
`navigate` branch is unreachable. See TODO.md.
⚠️ `RocketAI.STATE_SCALE_VERSION` documents the convention but is currently read by NO code:
`AIModelStore` validates `stateVersion`, `stateSize` and `actionCount` only. Bump it when the
normalisation changes, but be aware a model saved under an older scale convention will still load —
bump `AI_TRAINING.STATE.STATE_VERSION` too if you need the refusal. **That bump is still owed for
the dim‑7 change** (`STATE_VERSION` is still 2; see TODO.md).

**Training methods**:
1. Web interface: `training-interface.html` (recommended) - Full application with configuration, real-time performance charts, metrics, and trajectory visualization
2. Console: `train.js` scripts for quick training or benchmarking
3. Direct programming via `TrainingOrchestrator`

**Train & ship a model (deliver an NPC pilot)**: run `await trainAndDeliver({ role, episodes })` in the browser console (either page) — it trains headless, saves to the zoo, and downloads the 3 files to place under `assets/models/<name>/` (see `assets/models/README.md` for the exact rename steps). `deliverModel('<name>')` exports an already-trained zoo model. ⚠️ **Nothing in the game calls `loadModel()` yet**: `AIModelStore.load()` does fall back to `assets/models/<name>/`, but no game-side code invokes it, so a delivered pilot is not picked up at startup — `makeDecision()` stays on the `maintainOrbit` heuristic. Wiring that call is the remaining step to make NPC pilots real (see TODO.md).

**Training Interface Features** (`training-interface.html`):
- Configure training parameters (episodes, learning rate, etc.) **and the model name** (saved into the zoo)
- **Model Zoo panel**: list / load / export / import / delete saved models
- Real-time performance graphs
- Live metrics display (incl. **steps/s** and a rolling recent success rate; eval logs **median steps-to-success**)
- Trajectory visualization with navigation points (A - DEPART, B - ARRIVEE) and dashed connecting line
- Adaptive trajectory sampling: keeps full trajectory from start to end by dynamically reducing sample rate
- Start/stop/pause training controls
- Follow rocket / reset view (centers between A and B with auto-calculated zoom)
- TensorFlow.js fallback to CPU backend if WebGL fails

## Key Events Reference

Here are the most important events flowing through the `EventBus`:

| Event                        | Description                                             | Publisher                         | Consumer                            |
|------------------------------|---------------------------------------------------------|-----------------------------------|--------------------------------------|
| `INPUT_ROTATE_COMMAND`       | Continuous rotation input (gamepad axis)                | `InputController`                 | `RocketController`                   |
| `INPUT_ZOOM_COMMAND`         | Continuous zoom input                                   | `InputController`                 | `CameraController`                   |
| `RENDER_TOGGLE_VECTORS`      | Show/hide force vectors                                 | `InputController` (V key)         | `RenderingController`                |
| `RENDER_TOGGLE_TRACES`       | Toggle trajectory trace display                         | `InputController` (T key)         | `RenderingController`                |
| `RENDER_TOGGLE_GRAVITY_FIELD`| Cycle gravity field mode (off/arrows/lines)            | `InputController` (G key)         | `RenderingController`                |
| `ROCKET_LANDED`              | Rocket has landed                                       | `SynchronizationManager`          | `GameController`                     |
| `ROCKET_DESTROYED`           | Rocket destroyed (crash) — the real crash event         | `CollisionHandler`                | `GameController`, `ParticleController`, `RocketAI` |
| `ROCKET_SET_THRUSTER_POWER`  | Set thruster power (idempotent)                        | `RocketController`, `RocketAI`, `HeadlessRocketEnvironment` | `RocketController` |
| `AI_EPISODE_ENDED`           | A training episode has ended                           | `TrainingOrchestrator`, `HeadlessRocketEnvironment` | `TrainingVisualizer`   |
| `SIMULATION_UPDATED`         | Aggregated global simulation state                     | `GameController`                  | `RenderingController`, `ParticleController` |
| `UI_SHOW_*` / `UI_HIDE_*`    | UI screens (Loading, Pause, Game Over)                 | `GameController`                  | `UIView`                             |
| `UNIVERSE_LOAD_REQUESTED`    | Request universe load (preset)                          | Startup screen (`main.js`)        | `GameController`                     |
| `UNIVERSE_STATE_UPDATED`     | New universe state ready                               | `GameController`                  | `CameraController`, `SynchronizationManager`, `RenderingController`, `RocketAI` |
| `MISSION_COMPLETED`          | Mission success                                         | `GameController`                  | `ParticleController`, `RocketAI`     |
| `MISSION_FAILED`             | Mission failure                                         | `GameController`                  | `MissionManager`                     |
| `system:canvasResized`       | Canvas resize                                          | `RenderingController`             | Camera/Controllers                   |
| `particles:explosionCompleted`| Explosion animation finished                           | `ParticleController`              | `GameController`                     |

> ⚠️ **Événements émis SANS aucun consommateur** (re‑vérifié par balayage complet, 2026‑08‑25) :
> `STATION_DOCKED` / `STATION_REFUELED` (ravitaillement toujours totalement silencieux côté joueur —
> `REFUELED` n'est plus émis que si du carburant a réellement été ajouté, et porte `added`),
> `GAME_STATE_CHANGED`, `GAME_OVER_STATE`, `AI_CONTROL_CHANGED` (⇒ la touche `I` n'a aucun retour
> visuel), `AI_TRAINING_CHANGED`, `AI_CONTROL_ACTION`, `INPUT_KEYMAP_CHANGED` / `KEYMAP_RESET`.
>
> Deux entrées ont quitté cette liste : `UI_ASSISTED_CONTROLS_STATE_CHANGED` est désormais consommé
> par `UIView` (témoin 🤓 de l'aide au pilotage, touche `H`) ; `UNIVERSE_RELOAD_COMPLETED` l'était
> déjà par `main.js` (retrait du panneau de démarrage) — la liste se trompait sur ce point.
>
> ⚠️ **Handlers abonnés à des événements JAMAIS émis** (code mort) : `PHYSICS_TOGGLE_FORCES`,
> `AI_TOGGLE_TRAINING` (⇒ l'entraînement en jeu ne peut pas être activé), `PARTICLES_CREATE_EXPLOSION`,
> et `AI_START/STOP/PAUSE/RESUME_TRAINING` + `AI_UPDATE_CONFIG` (`training-interface.html` appelle
> directement les méthodes de `TrainingOrchestrator`). `ROCKET_CRASHED` et `ROCKET_LIFTOFF` ne sont
> ni émis ni écoutés — `ROCKET_LIFTOFF` n'existe même pas dans `EventTypes.js`.
>
> ⚠️ L'exemple de joker `eventBus.subscribe('PHYSICS.*', …)` plus haut ne peut rien matcher : les
> valeurs d'événements utilisent des underscores (`PHYSICS_UPDATED`), la regex générée est
> `/^PHYSICS\..*$/`. Aucun code n'utilise de joker aujourd'hui.

## Key Files Reference

### Models (Data State)
- `RocketModel.js` - Rocket state (CRITICAL)
- `UniverseModel.js` - Celestial bodies, stars, asteroids. Also stores `spawnInfo` from preset for rocket reset.
- `CameraModel.js` - Camera position/zoom/target
- `CelestialBodyModel.js` - Individual body properties
- `ParticleSystemModel.js` - Particle system state
- `ParticleModel.js` - Individual particle properties

### Controllers (Logic)
- `GameController.js` - Main orchestrator (CRITICAL)
- `GameSetupController.js` - Initialization and world building
- `PhysicsController.js` - Matter.js engine management
- `RocketController.js` - Rocket-specific logic
- `RenderingController.js` - View coordination (CRITICAL)
- `InputController.js` - Keyboard/mouse/gamepad/touch input (one-finger pan + two-finger pinch zoom on the canvas)
- `TouchControlsController.js` - On-screen touch buttons (HTML overlay `#commandesTactiles`, toggle ✋). Routes through `InputController.appuyerCommande` / `relacherCommande` / `executerActionPonctuelle` — the same path as the keyboard
- `CollisionHandler.js` - Collision detection and response
- `SynchronizationManager.js` - Physics ↔ Model sync
- `ThrusterPhysics.js` - Applies thrust forces
- `CameraController.js` - Camera logic
- `MissionManager.js` - Mission system
- `AudioManager.js` - Sound management
- `ParticleController.js` - Particle effects management
- `ControllerContainer.js` - Dependency injection container for controllers
- `PhysicsVectors.js` - Physics vector calculations for visualization (also `matterToGameVelocity`, the single Matter→u/s conversion point)
- `RocketCargo.js` - Rocket cargo management
- `AIModelStore.js` - AI model zoo: named persistence (IndexedDB), file export/import, `assets/models/` fallback
- `SeededRandom.js` - Deterministic RNG (mulberry32) for reproducible training and fixed eval sets

### Views (Rendering)
- `RocketView.js` - Draws the rocket with thrusters
- `UniverseView.js` - Background, stars (with twinkling), celestial bodies, asteroid belts
- `CelestialBodyView.js` - Individual body rendering with day/night shadows, atmosphere shadows, rings (back/front passes)
- `UIView.js` - HUD and modal screens (Loading, Pause, Game Over, Mission Success)
- `VectorsView.js` - Debug vectors (thrust, velocity, acceleration, attractions) and gravity field (arrows or equipotential lines)
- `TraceView.js` - Trajectory trail
- `ParticleView.js` - Particle effects
- `StationView.js` - Station icons/labels anchored to celestial bodies

### Factories
- `CelestialBodyFactory.js` - Creates celestial body models and Matter.js bodies
- `BodyFactory.js` - Creates generic Matter.js bodies (rocket, etc.)

## Development Guidelines

### Global Scope Pattern

Since the project doesn't use ES6 modules:
- All components are exposed on `window` object
- Event keys: `window.EVENTS`
- EventBus instance: `window.eventBus`
- Globals actually exposed: `window.EVENTS`, `window.eventBus`, `window.controllerContainer`,
  `window.audioManager`, `window.UI_STATE`, `window.HeadlessRocketEnvironment` (+ the `train.js`
  helpers). Note: **`window.gameController` is NOT assigned** — `main.js` keeps it in a module-local
  `let`, so it is not reachable from the console.

### Code Conventions

- **Idempotent setters**: State setters should be safe for repeated calls
- **Fresh references**: After `UNIVERSE_STATE_UPDATED`, re-resolve model references (don't cache old ones)
- **Views are read-only**: Views NEVER modify state, only read and render
- **Physics is source of truth**: `SynchronizationManager` syncs models FROM physics, not the reverse

### Adding New Features

1. Define events in `EventTypes.js` and expose via `window.EVENTS`
2. Create/update model for state storage
3. Implement logic in appropriate controller
4. Subscribe to relevant events via EventBus
5. Create/update view for rendering
6. Register view in `RenderingController`

### Debugging

- **Toggle vectors**: Press `V` to show force vectors
- **Toggle gravity field**: Press `G` to cycle through visualization modes
- **Console access**: only the globals listed under "Global Scope Pattern" are on `window`
  (the controllers themselves are not)

## Common Pitfalls

1. **Script load order**: HTML script order is critical. Controllers depend on Models, Views depend on both.
2. **No ES6 modules**: Don't use `import`/`export`. Everything is global via `window`.
3. **Matter.js version warning**: The matter-attractors plugin shows a version warning with Matter.js 0.19.0, but it's tested and compatible.
4. **Thruster power values**: `thruster.power` is absolute value (not percentage). Use `power/maxPower` for ratios.
5. **Event subscription cleanup**: Controllers should clean up subscriptions on teardown to prevent memory leaks.
6. **TensorFlow.js tensors**: Always wrap in `tf.tidy()` and manually `dispose()` to prevent memory leaks.
7. **TensorFlow.js backend**: The training interface includes a fallback mechanism to switch to CPU backend if WebGL fails (prevents SIGILL errors on some systems).
8. **Landing detection**: Landing triggers mission completion checks. The `CollisionHandler` recalculates relative position upon landing to ensure correct attachment to the celestial body surface.

## File Structure

```
├── assets/
│   ├── image/          # Visual assets
│   ├── sound/          # Audio files (ambient/, effects/)
│   ├── video/          # Video assets
│   ├── worlds/         # Universe preset JSON files (6 worlds)
│   └── screenshots/    # Documentation images
├── controllers/        # All game logic and orchestration
├── models/            # Data structures (state only)
├── views/             # Canvas rendering components
├── constants.js       # Global constants and configuration
├── EventTypes.js      # EventBus event key definitions
├── index.html         # Main game entry point
├── main.js            # Initialization logic
├── training-interface.html  # AI training web interface
├── train.js           # AI training console scripts
├── favicon.ico        # Browser favicon
├── favicon.png        # High-res favicon
├── CLAUDE.md          # This file - architecture documentation for AI
└── README.md          # User documentation and controls
```

## UI Startup Flow

The game starts with a **startup screen** featuring:
- **World selector** on the left: choose from 6 available presets (1_solar, 2_kerbol, 3_outerwilds, 4_Tatoo, 5_Endor, 6_alien)
- **"Prêt !" button** on the right: starts the game with the selected world

After selection, `UNIVERSE_LOAD_REQUESTED` is emitted with the chosen preset URL.

**Fatal-error net**: `main.js`'s entry point installs the error overlay and the `error` /
`unhandledrejection` listeners **before** running `initialiserApplication()`, and an inline
capture-phase script placed before the CDN tags in `index.html` buffers early failures
(`window.__erreursPrecoces`, capped at 20 entries) for replay. A missing CDN, an absent `Matter` or
an unavailable EventBus now shows a message instead of a silent black page. Known gap: a missing
canvas still fails silently (the guard returns without throwing).

## Future Development Roadmap

Potential improvements and extensions:

- **Refactoring**: Split monolithic controllers (e.g., `GameController.js`) into smaller, specialized modules
- **Performance**: Consider optimized data structures (e.g., quad-tree) for gravity calculations as body count increases
- **Gamepad**: Create a dedicated `GamepadController` to centralize controller management
- **AI**: Explore advanced architectures (Actor-Critic, LSTM) and more complex training environments
- **Game Features**: Extend mission system, add resource management, more celestial bodies

## Additional Resources

- **Controls**: See `README.md` for full keyboard/mouse controls
- **World presets**: See `assets/worlds/*.json` for world configuration examples
