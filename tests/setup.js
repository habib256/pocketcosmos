/**
 * Configuration globale pour les tests Jest
 * Charge les bundles et configure l'environnement de test
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

// Charger tous les bundles dans l'ordre de dépendance
const bundles = [
    'core/core.bundle.js',
    'models/models.bundle.js',
    'physics/physics.bundle.js',
    'game/game.bundle.js',
    'input/input.bundle.js',
    'rendering/rendering.bundle.js',
    'ai/ai.bundle.js'
];

console.log('🧪 Chargement des bundles pour les tests...');

// Charger chaque bundle
bundles.forEach(bundlePath => {
    try {
        const fullPath = path.join(__dirname, '..', bundlePath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            eval(content);
            console.log(`✅ Bundle chargé: ${bundlePath}`);
        } else {
            console.warn(`⚠️ Bundle non trouvé: ${bundlePath}`);
        }
    } catch (error) {
        console.error(`❌ Erreur chargement ${bundlePath}:`, error.message);
    }
});

// Vérifier que les constantes sont disponibles et les exposer globalement si nécessaire
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
            MAIN: 1000,
            REAR: 200,
            LEFT: 50,
            RIGHT: 50
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

// Utilitaires de test communs
global.testUtils = {
    /**
     * Crée un mock d'EventBus pour les tests
     */
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
                // Alias pour emit
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
            }
        };
    },

    /**
     * Crée un mock de canvas pour les tests de rendu
     */
    createMockCanvas() {
        return {
            getContext: () => ({
                fillRect: jest.fn(),
                strokeRect: jest.fn(),
                arc: jest.fn(),
                fill: jest.fn(),
                stroke: jest.fn(),
                beginPath: jest.fn(),
                closePath: jest.fn(),
                moveTo: jest.fn(),
                lineTo: jest.fn(),
                save: jest.fn(),
                restore: jest.fn(),
                translate: jest.fn(),
                rotate: jest.fn(),
                scale: jest.fn(),
                clearRect: jest.fn(),
                drawImage: jest.fn(),
                fillText: jest.fn(),
                measureText: jest.fn(() => ({ width: 100 }))
            }),
            width: 800,
            height: 600
        };
    },

    /**
     * Crée un mock de PhysicsController pour les tests
     */
    createMockPhysicsController() {
        return {
            isRunning: false,
            timeScale: 1,
            lastUpdateTime: 0,
            bodies: [],
            eventBus: this.createMockEventBus(),
            
            start() { this.isRunning = true; },
            stop() { this.isRunning = false; },
            setTimeScale(scale) { this.timeScale = Math.max(0.1, Math.min(10, scale)); },
            update(deltaTime) {
                if (deltaTime > 0 && deltaTime < 1) {
                    this.lastUpdateTime += deltaTime;
                    // Émettre l'événement de mise à jour physique
                    this.eventBus.emit('physics.update', { deltaTime });
                }
            },
            addBody(body) { this.bodies.push(body); },
            removeBody(id) { 
                this.bodies = this.bodies.filter(body => body.id !== id);
            },
            getBody(id) { 
                return this.bodies.find(body => body.id === id) || null;
            },
            calculateGravitationalForce(body1, body2) {
                const dx = body2.position.x - body1.position.x;
                const dy = body2.position.y - body1.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const force = (body1.mass * body2.mass) / (distance * distance);
                const magnitude = force * 6.67430e-11;
                return {
                    x: (dx / distance) * magnitude,
                    y: (dy / distance) * magnitude,
                    magnitude
                };
            },
            applyForce(body, force) {
                if (!body.forces) body.forces = [];
                body.forces.push(force);
            },
            calculateAcceleration(body) {
                if (!body.forces || body.forces.length === 0) {
                    return { x: 0, y: 0 };
                }
                const totalForce = body.forces.reduce((sum, force) => ({
                    x: sum.x + force.x,
                    y: sum.y + force.y
                }), { x: 0, y: 0 });
                return {
                    x: totalForce.x / body.mass,
                    y: totalForce.y / body.mass
                };
            },
            integratePosition(body, deltaTime) {
                body.position.x += body.velocity.x * deltaTime;
                body.position.y += body.velocity.y * deltaTime;
            },
            integrateVelocity(body, deltaTime) {
                body.velocity.x += body.acceleration.x * deltaTime;
                body.velocity.y += body.acceleration.y * deltaTime;
            },
            checkCollision(body1, body2) {
                const dx = body2.position.x - body1.position.x;
                const dy = body2.position.y - body1.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return distance < (body1.radius + body2.radius);
            },
            resolveCollision(body1, body2) {
                // Collision élastique simple
                const temp = body1.velocity.x;
                body1.velocity.x = body2.velocity.x;
                body2.velocity.x = temp;
            },
            handleCollisionEvent(body1, body2) {
                this.eventBus.emit('physics.collision', { body1, body2 });
            }
        };
    },

    /**
     * Crée un mock de GameController pour les tests
     */
    createMockGameController() {
        return {
            isRunning: false,
            isPaused: false,
            gameTime: 0,
            frameCount: 0,
            eventBus: this.createMockEventBus(),
            canvas: this.createMockCanvas(),
            rocket: {
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                angle: 0,
                angularVelocity: 0,
                health: 100,
                fuel: 1000,
                isDestroyed: false,
                isLanded: false,
                landedOn: null,
                thrusters: {
                    main: { power: 0, maxPower: 1000 },
                    rear: { power: 0, maxPower: 200 },
                    left: { power: 0, maxPower: 50 },
                    right: { power: 0, maxPower: 50 }
                }
            },
            universe: {
                bodies: [],
                time: 0
            },
            camera: {
                position: { x: 0, y: 0 },
                target: null,
                zoom: 1
            },
            currentMission: null,
            
            start() { 
                this.isRunning = true; 
                this.eventBus.emit('game.started');
            },
            stop() { 
                this.isRunning = false; 
                this.isPaused = false;
            },
            pause() { this.isPaused = true; },
            resume() { this.isPaused = false; },
            reset() {
                this.gameTime = 0;
                this.frameCount = 0;
                this.isRunning = false;
                this.isPaused = false;
            },
            update(deltaTime) {
                if (!this.isRunning || this.isPaused) return;
                if (deltaTime > 0.1) deltaTime = 0.1; // Limiter deltaTime
                this.gameTime += deltaTime;
                this.frameCount++;
            },
            setRocketThruster(type, power) {
                if (this.rocket.thrusters[type]) {
                    this.rocket.thrusters[type].power = Math.max(0, Math.min(power, this.rocket.thrusters[type].maxPower));
                }
            },
            rotateRocket(speed) {
                this.rocket.angularVelocity = speed;
            },
            destroyRocket() {
                this.rocket.isDestroyed = true;
                this.rocket.health = 0;
            },
            landRocket(planet) {
                this.rocket.isLanded = true;
                this.rocket.landedOn = planet.name;
            },
            followRocketWithCamera() {
                this.camera.target = { ...this.rocket.position };
            },
            setCameraZoom(zoom) {
                this.camera.zoom = zoom;
            },
            setCameraPosition(x, y) {
                this.camera.position.x = x;
                this.camera.position.y = y;
            },
            startMission(config) {
                this.currentMission = { ...config };
            },
            completeMission(success) {
                if (success) {
                    this.eventBus.emit('mission.completed', this.currentMission);
                } else {
                    this.eventBus.emit('mission.failed', this.currentMission);
                }
                this.currentMission = null;
            },
            handleCollision(type1, type2) {
                this.eventBus.emit('game.collision', { type1, type2 });
            },
            saveGame() {
                return {
                    gameTime: this.gameTime,
                    rocket: { ...this.rocket }
                };
            },
            loadGame(saveData) {
                this.gameTime = saveData.gameTime;
                Object.assign(this.rocket, saveData.rocket);
            },
            getFPS() {
                return this.frameCount > 0 ? Math.min(60, 1000 / (this.gameTime * 1000 / this.frameCount)) : 0;
            },
            getLastRenderTime() {
                return Math.random() * 16; // Simuler temps de rendu
            }
        };
    },

    /**
     * Attend un nombre spécifique de millisecondes
     */
    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Vérifie si un objet a toutes les propriétés requises
     */
    hasRequiredProperties(obj, properties) {
        return properties.every(prop => obj.hasOwnProperty(prop));
    },

    /**
     * Crée un état de fusée de test
     */
    createTestRocketState() {
        return {
            position: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            angle: 0,
            angularVelocity: 0,
            fuel: 1000,
            health: 100,
            isDestroyed: false,
            isLanded: false
        };
    },

    /**
     * Crée un corps céleste de test
     */
    createTestCelestialBody(name = 'TestBody') {
        return {
            name,
            position: { x: 0, y: 0 },
            mass: 1000,
            radius: 50,
            color: '#FFFFFF'
        };
    }
};

// Mock des APIs navigateur spécifiques
global.performance = {
    now: jest.fn(() => Date.now())
};

global.requestAnimationFrame = jest.fn(callback => {
    setTimeout(callback, 16); // Simuler 60 FPS
});

global.cancelAnimationFrame = jest.fn();

// Mock de localStorage
global.localStorage = {
    store: {},
    getItem: jest.fn(key => global.localStorage.store[key] || null),
    setItem: jest.fn((key, value) => {
        global.localStorage.store[key] = value;
    }),
    removeItem: jest.fn(key => {
        delete global.localStorage.store[key];
    }),
    clear: jest.fn(() => {
        global.localStorage.store = {};
    })
};

console.log('🎯 Configuration des tests terminée');
console.log(`📊 Classes disponibles: ${Object.keys(global).filter(key => 
    typeof global[key] === 'function' && key[0] === key[0].toUpperCase()
).length}`);

// Vérifier que les classes principales sont disponibles
const requiredClasses = [
    'EventBus', 'MathUtils', 'DebugProfiler',
    'UniverseModel', 'RocketModel', 'CelestialBodyModel'
];

const missingClasses = requiredClasses.filter(className => 
    typeof global[className] === 'undefined'
);

if (missingClasses.length > 0) {
    console.warn('⚠️ Classes manquantes:', missingClasses);
} else {
    console.log('✅ Toutes les classes principales sont disponibles');
} 