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
1. `InputController` detects keypress
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

The universe can be loaded from JSON presets or generated procedurally:

- **Preset files**: `assets/worlds/*.json` (6 worlds available)
- **Load flow**:
  1. Emit `UNIVERSE_LOAD_REQUESTED` with `{ source: 'preset'|'random', url?, seed? }`
  2. `GameController.handleUniverseLoadRequested` pauses and loads data
  3. `GameSetupController.buildWorldFromData` constructs new `UniverseModel`
  4. Emits `UNIVERSE_STATE_UPDATED` then `UNIVERSE_RELOAD_COMPLETED`

### World Preset Schema

JSON files in `assets/worlds/` can define:
- `physics.G`: Override for the gravitational constant (replaces `PHYSICS.G` from `constants.js`)
- `bodies[]`: Celestial bodies with `hasRings`, `atmosphere { exists, height, color }`
- `rocket.spawn`: Spawn location (hostName+angle OR position/velocity/angle)
- `stations[]`: Stations anchored to bodies
- `asteroidBelts[]`: Procedural asteroid fields
- `starsConfig`: Background star generation
- `narratives`: Story elements
- `missions[]`: Available missions

## Physics & Matter.js

- **Engine**: Matter.js 0.19.0 with the matter-attractors plugin
- **Gravity**: Applied by the matter-attractors plugin during `Engine.update`. `PHYSICS.G` (**0.001**, overridable per preset) is the SINGLE source of truth: at init and on each world load, the code copies `PHYSICS.G` into the plugin's `gravityConstant`, so **real gravity = visualization = AI**. See [PHYSICS.md §2](PHYSICS.md).
- **Units pitfall**: the game passes `deltaTime` in **seconds** to `Engine.update`, while Matter assumes **milliseconds** (`_baseDelta = 1000/60`). Consequence: a body's `velocity` ≈ (units/second) × (1000/60). This is the root of most physics subtleties.
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

(When paused, only `uiView.render()` runs.)

**Visual features**:
- Day/night shadowing on planets oriented by central star
- Atmospheric rendering with shadows
- Planetary rings rendered in two passes (back/front)
- Particle effects for thrust and explosions
- Gravity field visualization (arrows or equipotential lines)

## AI System

The AI uses Deep Q-Network (DQN) with TensorFlow.js:

- **Agent**: `RocketAI.js` - Makes piloting decisions
- **Training**: `TrainingOrchestrator.js` - Manages episodes/rewards
- **Environment**: `HeadlessRocketEnvironment.js` - Fast simulation without rendering, includes imminent crash detection to accelerate training
- **Visualization**: `TrainingVisualizer.js` - Real-time training metrics with navigation point display

**Training objectives**:
- `navigate` - Point-to-point navigation (default): the rocket must fly from point A `(0,0)` to point B `(90000, 90000)` (~127k units diagonal), then **brake and stabilize** at point B. Success requires distance < 3000 AND speed < 30. Random initial angle forces the AI to learn orientation. Budget: **4000 steps** (~66s @ 1/60s — flight ~5× shorter; cruise target `VELOCITY_TARGET` ≈ 2500 u/s), infinite fuel.
- `orbit` - Achieve stable orbit at target altitude
- `land` - Soft landing on a celestial body
- `crash` - (used for crash avoidance training)

**Navigate reward system** (6 components, configured in `AI_TRAINING.NAVIGATE_REWARDS`):
1. **Delta Distance** (priority high): reward proportional to distance reduction, normalized by initial distance
2. **Heading Alignment** (priority high): dot product between rocket heading and direction to target
3. **Velocity Control** (priority medium): gaussian reward around adaptive speed target. In the **braking zone** (< 20% distance remaining, `BRAKE_ZONE_RATIO`), the target speed decreases linearly to 0
4. **Potential-Based Shaping** (priority low): `gamma * phi(s') - phi(s)` for theoretical convergence
5. **Progressive Zones** (priority medium): one-time bonuses when crossing distance thresholds (80%, 50%, 20%, 5%)
6. **Stabilization** (in last 10%, `STABILIZE_ZONE_RATIO`): strong reward for low speed near point B (`max(0, 1 - speed/STABILIZE_SPEED_REF) * DISTANCE_DELTA`)

**Other reward configs** (`AI_TRAINING` in `constants.js`):
- `REWARDS`: Standard reward values for orbit, landing, and penalties
- `ORBIT`: Orbital parameters for the `orbit` objective, computed with G=0.001 (consistent with the real gravity since the gravity unification). ⚠️ Absolute speed calibration vs the simulation's velocity units should still be validated by training (see [PHYSICS.md §2](PHYSICS.md))

**Training methods**:
1. Web interface: `training-interface.html` (recommended) - Full application with configuration, real-time performance charts, metrics, and trajectory visualization
2. Console: `train.js` scripts for quick training or benchmarking
3. Direct programming via `TrainingOrchestrator`

**Training Interface Features** (`training-interface.html`):
- Configure training parameters (episodes, learning rate, etc.)
- Real-time performance graphs
- Live metrics display
- Trajectory visualization with navigation points (A - DEPART, B - ARRIVEE) and dashed connecting line
- Adaptive trajectory sampling: keeps full trajectory from start to end by dynamically reducing sample rate
- Start/stop/pause training controls
- Follow rocket / reset view (centers between A and B with auto-calculated zoom)
- TensorFlow.js fallback to CPU backend if WebGL fails

## Key Events Reference

Here are the most important events flowing through the `EventBus`:

| Event                        | Description                                             | Publisher                         | Consumer                            |
|------------------------------|---------------------------------------------------------|-----------------------------------|--------------------------------------|
| `INPUT_ROTATE_COMMAND` / `INPUT_ZOOM_COMMAND` | Continuous rotation/zoom inputs               | `InputController`                 | `RocketController`, `CameraController` |
| `RENDER_TOGGLE_VECTORS`      | Show/hide force vectors                                 | `InputController` (V key)         | `RenderingController`                |
| `RENDER_TOGGLE_TRACES`       | Toggle trajectory trace display                         | `InputController` (T key)         | `RenderingController`                |
| `RENDER_TOGGLE_GRAVITY_FIELD`| Cycle gravity field mode (off/arrows/lines)            | `InputController` (G key)         | `RenderingController`                |
| `ROCKET_LANDED` / `ROCKET_CRASHED` | Rocket has landed or crashed                      | `CollisionHandler`                | `GameController`, `AudioManager`     |
| `ROCKET_LIFTOFF`             | Rocket has lifted off                                   | `SynchronizationManager`          | `AudioManager`                       |
| `ROCKET_SET_THRUSTER_POWER`  | Set thruster power (idempotent)                        | `InputController`, `RocketAI`     | `RocketController`                   |
| `AI_START_TRAINING`          | Start an AI training session                           | `training-interface.html` (UI)    | `TrainingOrchestrator`               |
| `AI_EPISODE_ENDED`           | A training episode has ended                           | `TrainingOrchestrator`            | `TrainingVisualizer`, UI             |
| `AI_CONTROL_ACTION`          | AI action trace/diagnostic                             | `RocketAI`                        | UI / Logs                            |
| `SIMULATION_UPDATED`         | Aggregated global simulation state                     | `GameController`                  | `RenderingController`, UI            |
| `GAME_STATE_CHANGED`         | Game state change (FSM)                                | `GameController`                  | UI                                   |
| `UI_SHOW_*` / `UI_HIDE_*`    | UI screens (Loading, Pause, Game Over)                 | `GameController`                  | `UIView`                             |
| `UNIVERSE_LOAD_REQUESTED`    | Request universe load (preset/procedural)              | UI/Debug/AI                       | `GameController`                     |
| `UNIVERSE_STATE_UPDATED`     | New universe state ready                               | `GameController`/Setup            | Views/Controllers                    |
| `UNIVERSE_RELOAD_COMPLETED`  | Reload finished and synchronized                       | `GameController`                  | All                                  |
| `MISSION_COMPLETED` / `MISSION_FAILED` | Mission success or failure                    | `MissionManager`                  | `GameController`, UI                 |
| `STATION_DOCKED` / `STATION_REFUELED` | Docking and refueling at a station             | `GameController`                  | UI/Audio                             |
| `system:canvasResized`       | Canvas resize                                          | `RenderingController`             | Camera/Controllers                   |
| `particles:explosionCompleted`| Explosion animation finished                           | `ParticleController`              | `GameController`                     |

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
- `InputController.js` - Keyboard/mouse/gamepad input
- `CollisionHandler.js` - Collision detection and response
- `SynchronizationManager.js` - Physics ↔ Model sync
- `ThrusterPhysics.js` - Applies thrust forces
- `CameraController.js` - Camera logic
- `MissionManager.js` - Mission system
- `AudioManager.js` - Sound management
- `ParticleController.js` - Particle effects management
- `ControllerContainer.js` - Dependency injection container for controllers
- `PhysicsVectors.js` - Physics vector calculations for visualization
- `RocketCargo.js` - Rocket cargo management

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
- Controllers: `window.gameController`, etc.

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
- **Console access**: All major objects available on `window` for inspection

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
