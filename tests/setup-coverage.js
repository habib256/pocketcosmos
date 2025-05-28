/**
 * Configuration pour les tests avec couverture de code
 * Charge les sources originales au lieu des bundles pour une mesure précise de la couverture
 */

const fs = require('fs');
const path = require('path');

// Simuler l'environnement navigateur
global.window = global;
global.document = {};
global.navigator = {};

// Mock de Matter.js pour les tests de physique
global.Matter = {
    Engine: {
        create: jest.fn(() => ({
            world: { bodies: [] },
            timing: { timeScale: 1 }
        })),
        update: jest.fn(),
        run: jest.fn()
    },
    World: {
        add: jest.fn(),
        remove: jest.fn(),
        clear: jest.fn()
    },
    Bodies: {
        circle: jest.fn(() => ({ id: 'mock-body' })),
        rectangle: jest.fn(() => ({ id: 'mock-body' })),
        polygon: jest.fn(() => ({ id: 'mock-body' }))
    },
    Body: {
        setPosition: jest.fn(),
        setVelocity: jest.fn(),
        applyForce: jest.fn(),
        setAngle: jest.fn()
    },
    Vector: {
        create: jest.fn((x, y) => ({ x, y })),
        add: jest.fn((a, b) => ({ x: a.x + b.x, y: a.y + b.y })),
        sub: jest.fn((a, b) => ({ x: a.x - b.x, y: a.y - b.y })),
        mult: jest.fn((v, s) => ({ x: v.x * s, y: v.y * s })),
        magnitude: jest.fn((v) => Math.sqrt(v.x * v.x + v.y * v.y)),
        normalise: jest.fn((v) => {
            const mag = Math.sqrt(v.x * v.x + v.y * v.y);
            return mag > 0 ? { x: v.x / mag, y: v.y / mag } : { x: 0, y: 0 };
        })
    },
    Events: {
        on: jest.fn(),
        off: jest.fn(),
        trigger: jest.fn()
    }
};

// Liste des fichiers sources dans l'ordre de chargement
const sourceFiles = [
    // Core
    'core/constants.js',
    'core/EventTypes.js',
    'core/EventBus.js',
    'core/utils/MathUtils.js',
    'core/utils/DebugProfiler.js',
    
    // Models
    'models/core/UniverseModel.js',
    'models/core/CameraModel.js',
    'models/entities/CelestialBodyModel.js',
    'models/entities/RocketModel.js',
    'models/effects/ParticleModel.js',
    'models/effects/ParticleSystemModel.js',
    
    // Physics
    'physics/PhysicsVectors.js',
    'physics/factories/BodyFactory.js',
    'physics/factories/CelestialBodyFactory.js',
    'physics/handlers/CollisionHandler.js',
    'physics/handlers/ThrusterPhysics.js',
    'physics/SynchronizationManager.js',
    'physics/PhysicsController.js',
    
    // Game
    'game/missions/MissionManager.js',
    'game/rocket/RocketCargo.js',
    'game/rocket/RocketController.js',
    'game/particles/ParticleController.js',
    'game/camera/CameraController.js',
    'game/GameSetupController.js',
    'game/GameController.js',
    
    // Input
    'input/InputController.js',
    
    // Rendering
    'rendering/views/RocketView.js',
    'rendering/views/UniverseView.js',
    'rendering/views/CelestialBodyView.js',
    'rendering/views/ParticleView.js',
    'rendering/views/VectorsView.js',
    'rendering/views/TraceView.js',
    'rendering/views/UIView.js',
    'rendering/RenderingController.js',
    
    // AI
    'ai/scripts/ControllerContainer.js',
    'ai/RocketAI.js',
    'ai/training/HeadlessRocketEnvironment.js',
    'ai/training/TrainingOrchestrator.js',
    'ai/training/TrainingVisualizer.js'
];

console.log('🧪 Chargement des sources pour tests de couverture...');

// Charger chaque fichier source
sourceFiles.forEach(sourcePath => {
    try {
        const fullPath = path.join(__dirname, '..', sourcePath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            eval(content);
            console.log(`✅ Source chargée: ${sourcePath}`);
        } else {
            console.warn(`⚠️ Source non trouvée: ${sourcePath}`);
        }
    } catch (error) {
        console.error(`❌ Erreur chargement ${sourcePath}:`, error.message);
    }
});

// Le reste du setup est identique au fichier original
// Vérifier que les constantes sont disponibles
if (typeof ROCKET !== 'undefined') {
    global.ROCKET = ROCKET;
} else {
    console.warn('⚠️ ROCKET non défini, création de constantes de test');
    global.ROCKET = {
        FUEL_MAX: 1000,
        MAX_HEALTH: 100,
        MASS: 1000,
        WIDTH: 20,
        HEIGHT: 40,
        FRICTION: 0.99,
        THRUSTER_POWER: {
            MAIN: 100,
            REAR: 80,
            LEFT: 60,
            RIGHT: 60
        },
        THRUSTER_POSITIONS: {
            MAIN: { angle: -Math.PI/2, distance: 20 },
            REAR: { angle: Math.PI/2, distance: 20 },
            LEFT: { angle: 0, distance: 10 },
            RIGHT: { angle: Math.PI, distance: 10 }
        },
        FUEL_CONSUMPTION: {
            MAIN: 0.5,
            REAR: 0.2,
            LEFT: 0.1,
            RIGHT: 0.1,
            DEFAULT: 0.1
        }
    };
}

if (typeof PHYSICS !== 'undefined') {
    global.PHYSICS = PHYSICS;
} else {
    global.PHYSICS = {
        G: 6.67430e-11,
        MAX_COORDINATE: 10000
    };
}

if (typeof CELESTIAL_BODY !== 'undefined') {
    global.CELESTIAL_BODY = CELESTIAL_BODY;
} else {
    global.CELESTIAL_BODY = {
        MASS: 5.972e24,
        RADIUS: 6371000,
        ATMOSPHERE_RATIO: 0.1
    };
}

if (typeof PARTICLES !== 'undefined') {
    global.PARTICLES = PARTICLES;
} else {
    global.PARTICLES = {
        STAR_COUNT: 100,
        VISIBLE_RADIUS: 5000,
        STAR_BRIGHTNESS_BASE: 0.5,
        STAR_BRIGHTNESS_RANGE: 0.3,
        STAR_TWINKLE_FACTOR: 2
    };
}

if (typeof EVENTS !== 'undefined') {
    global.EVENTS = EVENTS;
} else {
    global.EVENTS = {
        ROCKET: {
            SET_THRUSTER_POWER: 'rocket.setThrusterPower'
        },
        INPUT: {
            ROTATE_COMMAND: 'input.rotateCommand'
        },
        AI: {
            EPISODE_STARTED: 'ai.episodeStarted',
            EPISODE_ENDED: 'ai.episodeEnded',
            TRAINING_STEP: 'ai.trainingStep'
        }
    };
}

// Utilitaires de test communs (copiés du setup original)
global.testUtils = {
    createMockEventBus() {
        return {
            events: new Map(),
            subscribe(event, callback) {
                if (!this.events.has(event)) {
                    this.events.set(event, []);
                }
                this.events.get(event).push(callback);
            },
            emit(event, data) {
                if (this.events.has(event)) {
                    this.events.get(event).forEach(callback => callback(data));
                }
            },
            publish(event, data) {
                this.emit(event, data);
            },
            unsubscribe(event, callback) {
                if (this.events.has(event)) {
                    const callbacks = this.events.get(event);
                    const index = callbacks.indexOf(callback);
                    if (index > -1) {
                        callbacks.splice(index, 1);
                    }
                }
            },
            clear() {
                this.events.clear();
            }
        };
    },

    createMockCanvas() {
        return {
            width: 800,
            height: 600,
            getContext: jest.fn(() => ({
                fillStyle: '',
                strokeStyle: '',
                lineWidth: 1,
                globalAlpha: 1,
                fillRect: jest.fn(),
                strokeRect: jest.fn(),
                clearRect: jest.fn(),
                beginPath: jest.fn(),
                closePath: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                arc: jest.fn(),
                fill: jest.fn(),
                stroke: jest.fn(),
                save: jest.fn(),
                restore: jest.fn(),
                translate: jest.fn(),
                rotate: jest.fn(),
                scale: jest.fn(),
                setTransform: jest.fn(),
                drawImage: jest.fn(),
                fillText: jest.fn(),
                measureText: jest.fn(() => ({ width: 100 }))
            }))
        };
    },

    createMockPhysicsController() {
        return {
            isRunning: false,
            timeScale: 1,
            bodies: [],
            start() { this.isRunning = true; },
            stop() { this.isRunning = false; },
            setTimeScale(scale) { this.timeScale = Math.max(0.1, Math.min(10, scale)); },
            update(deltaTime) {
                if (!this.isRunning || deltaTime <= 0) return;
                // Simulation simplifiée pour les tests
            },
            addBody(body) { this.bodies.push(body); },
            removeBody(id) { 
                this.bodies = this.bodies.filter(body => body.id !== id);
            },
            getBody(id) { 
                return this.bodies.find(body => body.id === id) || null;
            }
        };
    },

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    hasRequiredProperties(obj, properties) {
        return properties.every(prop => obj.hasOwnProperty(prop));
    },

    createTestRocketState() {
        return {
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            angle: 0,
            fuel: 1000,
            health: 100,
            isDestroyed: false,
            landedOn: null,
            thrusters: {
                main: { power: 0, isActive: false },
                rear: { power: 0, isActive: false },
                left: { power: 0, isActive: false },
                right: { power: 0, isActive: false }
            }
        };
    },

    createTestCelestialBody(name = 'TestBody') {
        return {
            name,
            mass: 1e24,
            radius: 1000,
            position: { x: 0, y: 0 },
            color: '#FFFFFF',
            type: 'planet'
        };
    }
};

console.log('🎯 Configuration des tests de couverture terminée');

// Compter les classes disponibles
const classes = [];
if (typeof EventBus !== 'undefined') classes.push('EventBus');
if (typeof MathUtils !== 'undefined') classes.push('MathUtils');
if (typeof RocketModel !== 'undefined') classes.push('RocketModel');
if (typeof CelestialBodyModel !== 'undefined') classes.push('CelestialBodyModel');
if (typeof UniverseModel !== 'undefined') classes.push('UniverseModel');
if (typeof CameraModel !== 'undefined') classes.push('CameraModel');
if (typeof ParticleModel !== 'undefined') classes.push('ParticleModel');
if (typeof ParticleSystemModel !== 'undefined') classes.push('ParticleSystemModel');
if (typeof PhysicsController !== 'undefined') classes.push('PhysicsController');
if (typeof InputController !== 'undefined') classes.push('InputController');
if (typeof GameController !== 'undefined') classes.push('GameController');
if (typeof RocketController !== 'undefined') classes.push('RocketController');

console.log(`📊 Classes disponibles pour couverture: ${classes.length}`);

if (classes.length >= 10) {
    console.log('✅ Toutes les classes principales sont chargées pour la couverture');
} else {
    console.warn('⚠️ Certaines classes manquent pour la couverture');
} 