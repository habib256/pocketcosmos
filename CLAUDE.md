# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pocket Cosmos is an interactive 2D rocket simulation with realistic physics using Matter.js. It features a mission system, cargo management, optional AI (TensorFlow.js), and procedural universe generation. The project uses a modular MVC-extended architecture with an EventBus for decoupled communication.

## Running the Project

This is a browser-based application with no build step:

1. **Start a local server**: `python -m http.server 8000` or any local web server
2. **Open in browser**: Navigate to `http://localhost:8000/index.html`
3. **Training interface**: Open `training-interface.html` for the AI training interface

**Important**: All scripts are loaded via `<script>` tags in HTML files. The project does NOT use ES6 modules (`import`/`export`). Load order in HTML is critical.

## Key Commands

Since this is a browser-based project with no build tooling:
- **No npm/package.json**: All dependencies are loaded via CDN in the HTML files
- **No tests**: Manual testing only (see TODO.md for test scenarios)
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

**Game Loop** (60 FPS):
1. `gameController.update()` called
2. `physicsController.update()` advances Matter.js
3. `synchronizationManager.sync()` updates models from physics
4. Other controllers update their logic
5. `renderingController.render()` draws current state

**Collision Handling**:
1. Matter.js detects collision
2. `CollisionHandler` analyzes impact (speed, angle)
3. Updates `rocketModel.isLanded` or `rocketModel.isCrashed`
4. `SynchronizationManager` creates physical constraint to "attach" rocket

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
- `bodies[]`: Celestial bodies with `hasRings`, `atmosphere { exists, height, color }`
- `rocket.spawn`: Spawn location (hostName+angle OR position/velocity/angle)
- `stations[]`: Stations anchored to bodies
- `asteroidBelts[]`: Procedural asteroid fields
- `starsConfig`: Background star generation
- `narratives`: Story elements
- `missions[]`: Available missions

## Physics & Matter.js

- **Engine**: Matter.js 0.19.0 with matter-attractors plugin
- **Gravity**: Applied by matter-attractors plugin during physics update
- **Collision categories**: Defined in `PHYSICS.COLLISION_CATEGORIES` to control what collides
- **Thresholds**: Landing/crash/liftoff speeds in `constants.js`

**Important**: Manual gravity calculations (like `calculateGravityAccelerationAt`) are for visualization/debug only, NOT for applying forces.

## Constants & Configuration

**`constants.js`** is the single source of truth for all magic numbers:
- Physics constants (`PHYSICS.G`, thresholds)
- Rocket parameters (`ROCKET.THRUSTER_POWER`, `FUEL_EFFICIENCY`)
- Universe defaults (`UNIVERSE`)
- Collision categories
- AI training parameters

World-specific data (body masses, positions) should come from preset JSON files, not constants.

## Rendering System

**Rendering pipeline** (in `RenderingController.render()`):
1. Clear canvas
2. `universeView.render()`: Background, stars, celestial bodies
3. `rocketView.render()`: Rocket with thrusters
4. Conditional views: `traceView`, `vectorsView`, `gravityFieldView`
5. `uiView.render()`: UI overlays

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
- **Environment**: `HeadlessRocketEnvironment.js` - Fast simulation without rendering
- **Visualization**: `TrainingVisualizer.js` - Real-time training metrics

**Training methods**:
1. Web interface: `training-interface.html` (recommended)
2. Console: `train.js` scripts
3. Direct programming via `TrainingOrchestrator`

**Known issues** (see TODO.md):
- AI emits wrong event types (uses `INPUT.KEYDOWN` instead of semantic events)
- Thruster power scaling inconsistency
- Training constants use unrealistic Earth/Moon values
- Memory leaks in TensorFlow gradient calculations

## Key Files Reference

### Models (Data State)
- `RocketModel.js` - Rocket state (CRITICAL)
- `UniverseModel.js` - Celestial bodies, stars, asteroids
- `CameraModel.js` - Camera position/zoom/target
- `CelestialBodyModel.js` - Individual body properties

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

### Views (Rendering)
- `RocketView.js` - Draws the rocket
- `UniverseView.js` - Background and celestial bodies
- `CelestialBodyView.js` - Individual body rendering with shadows/atmosphere
- `UIView.js` - HUD and modal screens
- `VectorsView.js` - Debug vectors and gravity field
- `TraceView.js` - Trajectory trail
- `ParticleView.js` - Particle effects
- `StationView.js` - Station icons on bodies

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

## File Structure

```
├── assets/
│   ├── image/          # Visual assets
│   ├── sound/          # Audio files (ambient/, effects/)
│   ├── video/          # Video assets
│   ├── worlds/         # Universe preset JSON files
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
└── codefilelist.md    # Detailed architecture documentation
```

## Additional Resources

- **Architecture deep-dive**: See `codefilelist.md` for comprehensive documentation
- **Known issues**: See `TODO.md` for bugs and planned improvements
- **Controls**: See README.md for full keyboard/mouse controls
