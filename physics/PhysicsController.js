/**
 * Contrôleur principal de la physique - Matter.js
 * Gère la simulation physique, les corps célestes et les interactions
 */

class PhysicsController {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.engine = null;
        this.world = null;
        this.runner = null;
        this.isRunning = false;
        
        // Configuration
        this.config = {
            enableSleeping: false,
            gravity: { x: 0, y: 0, scale: 0 }, // Pas de gravité globale
            constraintIterations: 2,
            positionIterations: 6,
            velocityIterations: 4,
            enableAttractors: true
        };
        
        // Constante gravitationnelle
        this.gravitationalConstant = window.PHYSICS ? window.PHYSICS.G : 0.0001;
        
        // Gestionnaires spécialisés
        this.bodyFactory = null;
        this.collisionHandler = null;
        this.thrusterPhysics = null;
        this.synchronizationManager = null;
        this.physicsVectors = null;
        
        // État
        this.bodies = new Map();
        this.constraints = new Map();
        this.lastUpdate = 0;
        this.deltaTime = 0;
        
        // Corps célestes - initialisation pour éviter l'erreur "not iterable"
        this.celestialBodies = [];
        
        this.init();
    }
    
    init() {
        try {
            // Créer le moteur Matter.js
            this.engine = Matter.Engine.create();
            this.world = this.engine.world;
            
            // Configuration du moteur
            this.engine.enableSleeping = this.config.enableSleeping;
            this.engine.world.gravity = this.config.gravity;
            this.engine.constraintIterations = this.config.constraintIterations;
            this.engine.positionIterations = this.config.positionIterations;
            this.engine.velocityIterations = this.config.velocityIterations;
            
            // Activer le plugin Attractors si disponible
            if (this.config.enableAttractors && typeof MatterAttractors !== 'undefined') {
                Matter.use(MatterAttractors);
                console.log('Plugin Matter Attractors activé');
            }
            
            // Initialiser les gestionnaires spécialisés
            this.initializeHandlers();
            
            // Configurer les événements de collision
            this.setupCollisionEvents();
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_INITIALIZED, {
                engine: this.engine,
                world: this.world
            });
            
            console.log('PhysicsController initialisé avec succès');
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du PhysicsController:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
    
    initializeHandlers() {
        // Initialiser les gestionnaires avec injection de dépendances
        this.bodyFactory = new BodyFactory(Matter.Bodies, Matter.Body, MatterAttractors, window.ROCKET, window.PHYSICS);
        this.collisionHandler = new CollisionHandler(this, this.engine, Matter.Events, Matter.Body, window.ROCKET, window.PHYSICS);
        this.thrusterPhysics = new ThrusterPhysics(this, Matter.Body, window.ROCKET, window.PHYSICS);
        this.synchronizationManager = new SynchronizationManager(this, this.eventBus, Matter.Body, window.ROCKET, window.PHYSICS);
        this.physicsVectors = new PhysicsVectors(this, window.RENDER);
    }
    
    /**
     * Initialise le corps physique de la fusée
     * @param {RocketModel} rocketModel - Le modèle de la fusée
     */
    initializeRocket(rocketModel) {
        if (!this.bodyFactory || !rocketModel) {
            console.error('PhysicsController: Impossible d\'initialiser la fusée - bodyFactory ou rocketModel manquant');
            return;
        }
        
        try {
            // Créer le corps physique de la fusée
            this.rocketBody = this.bodyFactory.createRocketBody(rocketModel);
            this.rocketModel = rocketModel;
            
            // Ajouter le corps au monde physique
            const rocketBodyId = this.addBody(this.rocketBody, 'rocket');
            
            // Synchroniser l'état initial
            if (this.synchronizationManager) {
                this.synchronizationManager.syncPhysicsWithModel(rocketModel);
            }
            
            console.log('PhysicsController: Corps physique de la fusée initialisé avec succès');
            
            this.eventBus.publish(window.EVENTS.PHYSICS.BODY_ADDED, {
                bodyId: rocketBodyId,
                body: this.rocketBody,
                type: 'rocket'
            });
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du corps de la fusée:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
    
    setupCollisionEvents() {
        // Événements de collision Matter.js
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            this.collisionHandler.handleCollisionStart(event);
        });
        
        Matter.Events.on(this.engine, 'collisionActive', (event) => {
            this.collisionHandler.handleCollisionActive(event);
        });
        
        Matter.Events.on(this.engine, 'collisionEnd', (event) => {
            this.collisionHandler.handleCollisionEnd(event);
        });
        
        // Événements avant/après mise à jour
        Matter.Events.on(this.engine, 'beforeUpdate', (event) => {
            this.handleBeforeUpdate(event);
        });
        
        Matter.Events.on(this.engine, 'afterUpdate', (event) => {
            this.handleAfterUpdate(event);
        });
    }
    
    start() {
        if (this.isRunning) return;
        
        try {
            // NE PAS utiliser Matter.Runner car nous contrôlons manuellement le moteur via update()
            // this.runner = Matter.Runner.create();
            // Matter.Runner.run(this.runner, this.engine);
            
            this.isRunning = true;
            this.lastUpdate = performance.now();
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_STARTED, {
                timestamp: this.lastUpdate
            });
            
            console.log('Moteur physique démarré');
            
        } catch (error) {
            console.error('Erreur lors du démarrage du moteur physique:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
    
    stop() {
        if (!this.isRunning) return;
        
        try {
            // Plus besoin d'arrêter Matter.Runner puisque nous le n'utilisons plus
            // if (this.runner) {
            //     Matter.Runner.stop(this.runner);
            //     this.runner = null;
            // }
            
            this.isRunning = false;
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_STOPPED, {
                timestamp: performance.now()
            });
            
            console.log('Moteur physique arrêté');
            
        } catch (error) {
            console.error('Erreur lors de l\'arrêt du moteur physique:', error);
        }
    }
    
    resumeSimulation() {
        if (this.isRunning) return;
        
        try {
            this.start();
            console.log('Simulation physique reprise');
            
        } catch (error) {
            console.error('Erreur lors de la reprise de la simulation:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }

    pauseSimulation() {
        if (!this.isRunning) return;
        
        try {
            this.isRunning = false;
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_PAUSED, {
                timestamp: performance.now()
            });
            
            console.log('Simulation physique mise en pause');
            
        } catch (error) {
            console.error('Erreur lors de la mise en pause de la simulation:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }

    stopSimulation() {
        if (!this.isRunning) return;
        
        try {
            this.stop();
            console.log('Simulation physique arrêtée');
            
        } catch (error) {
            console.error('Erreur lors de l\'arrêt de la simulation:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
    
    update(deltaTime) {
        if (!this.isRunning || !this.engine) return;
        
        const now = performance.now();
        
        // Utiliser le deltaTime reçu (en millisecondes) avec une valeur par défaut raisonnable
        this.deltaTime = deltaTime || 16.667; // Défaut à 16.667ms (60fps) si non fourni
        
        // Limiter deltaTime pour éviter les gros sauts temporels qui causent des instabilités
        this.deltaTime = Math.min(this.deltaTime, 33.333); // Max 33ms (30fps minimum)
        
        // Log de diagnostic réduit (très occasionnel)
        if (Math.random() < 0.001) { // 0.1% de chance seulement
            console.log(`🕒 deltaTime utilisé: ${this.deltaTime.toFixed(2)}ms`);
        }
        
        this.lastUpdate = now;
        
        try {
            // Diagnostic spécifique pour Matter.Engine.update() (très réduit)
            const beforeUpdate = this.rocketBody ? {
                x: this.rocketBody.position.x,
                y: this.rocketBody.position.y,
                vx: this.rocketBody.velocity.x,
                vy: this.rocketBody.velocity.y
            } : null;
            
            // 1. Mise à jour des gestionnaires spécialisés (application des forces)
            this.thrusterPhysics.update(this.deltaTime);
            this.physicsVectors.update(this.deltaTime);
            
            // 2. *** CRUCIAL *** : Faire tourner le moteur physique Matter.js pour calculer les nouvelles positions
            // Log supprimé pour éviter le spam - décommentez pour debug spécifique
            // console.log(`⚙️ Matter.Engine.update() appelé avec deltaTime=${this.deltaTime.toFixed(2)}ms`);
            Matter.Engine.update(this.engine, this.deltaTime);
            
            // Diagnostic après Matter.Engine.update() (très réduit)
            if (beforeUpdate && this.rocketBody && Math.random() < 0.01) { // 1% de chance seulement
                const afterUpdate = {
                    x: this.rocketBody.position.x,
                    y: this.rocketBody.position.y,
                    vx: this.rocketBody.velocity.x,
                    vy: this.rocketBody.velocity.y
                };
                
                const posChange = Math.abs(afterUpdate.x - beforeUpdate.x) + Math.abs(afterUpdate.y - beforeUpdate.y);
                const velChange = Math.abs(afterUpdate.vx - beforeUpdate.vx) + Math.abs(afterUpdate.vy - beforeUpdate.vy);
                
                // Seulement si un changement significatif est détecté
                if (posChange > 1.0 || velChange > 1.0) {
                    console.log(`⚙️ Matter.Engine.update() RÉSULTAT NOTABLE :`);
                    console.log(`   Position: ${beforeUpdate.x.toFixed(1)},${beforeUpdate.y.toFixed(1)} → ${afterUpdate.x.toFixed(1)},${afterUpdate.y.toFixed(1)} (Δ=${posChange.toFixed(2)})`);
                    console.log(`   Vitesse:  ${beforeUpdate.vx.toFixed(1)},${beforeUpdate.vy.toFixed(1)} → ${afterUpdate.vx.toFixed(1)},${afterUpdate.vy.toFixed(1)} (Δ=${velChange.toFixed(2)})`);
                }
            }
            
            // 3. Synchronisation des modèles APRÈS que Matter.js ait calculé les nouvelles positions
            this.synchronizationManager.synchronizeFromPhysics();
            
            // 4. Émission de l'événement pour notifier que la physique a été mise à jour
            this.eventBus.emit(window.EVENTS.PHYSICS.ENGINE_UPDATED, {
                deltaTime: this.deltaTime,
                timestamp: now,
                engine: this.engine
            });
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la physique:', error);
        }
    }
    
    handleBeforeUpdate(event) {
        // Logique avant mise à jour physique
        this.eventBus.publish(window.EVENTS.PHYSICS.BEFORE_UPDATE, {
            timestamp: event.timestamp,
            deltaTime: this.deltaTime
        });
    }
    
    handleAfterUpdate(event) {
        // Logique après mise à jour physique
        this.eventBus.publish(window.EVENTS.PHYSICS.AFTER_UPDATE, {
            timestamp: event.timestamp,
            deltaTime: this.deltaTime
        });
    }
    
    addBody(body, id = null) {
        if (!body || !this.world) return null;
        
        try {
            Matter.World.add(this.world, body);
            
            const bodyId = id || body.id || `body_${Date.now()}`;
            this.bodies.set(bodyId, body);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.BODY_ADDED, {
                bodyId,
                body,
                position: body.position,
                mass: body.mass
            });
            
            return bodyId;
            
        } catch (error) {
            console.error('Erreur lors de l\'ajout du corps:', error);
            return null;
        }
    }
    
    removeBody(bodyId) {
        const body = this.bodies.get(bodyId);
        if (!body || !this.world) return false;
        
        try {
            Matter.World.remove(this.world, body);
            this.bodies.delete(bodyId);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.BODY_REMOVED, {
                bodyId,
                body
            });
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors de la suppression du corps:', error);
            return false;
        }
    }
    
    getBody(bodyId) {
        return this.bodies.get(bodyId);
    }
    
    getAllBodies() {
        return Array.from(this.bodies.values());
    }
    
    addConstraint(constraint, id = null) {
        if (!constraint || !this.world) return null;
        
        try {
            Matter.World.add(this.world, constraint);
            
            const constraintId = id || `constraint_${Date.now()}`;
            this.constraints.set(constraintId, constraint);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.CONSTRAINT_ADDED, {
                constraintId,
                constraint
            });
            
            return constraintId;
            
        } catch (error) {
            console.error('Erreur lors de l\'ajout de la contrainte:', error);
            return null;
        }
    }
    
    removeConstraint(constraintId) {
        const constraint = this.constraints.get(constraintId);
        if (!constraint || !this.world) return false;
        
        try {
            Matter.World.remove(this.world, constraint);
            this.constraints.delete(constraintId);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.CONSTRAINT_REMOVED, {
                constraintId,
                constraint
            });
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors de la suppression de la contrainte:', error);
            return false;
        }
    }
    
    applyForce(bodyId, force, point = null) {
        const body = this.bodies.get(bodyId);
        if (!body) return false;
        
        try {
            const forcePoint = point || body.position;
            Matter.Body.applyForce(body, forcePoint, force);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.FORCE_APPLIED, {
                bodyId,
                force,
                point: forcePoint
            });
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors de l\'application de la force:', error);
            return false;
        }
    }
    
    setPosition(bodyId, position) {
        const body = this.bodies.get(bodyId);
        if (!body) return false;
        
        try {
            Matter.Body.setPosition(body, position);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.BODY_MOVED, {
                bodyId,
                position,
                body
            });
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors du déplacement du corps:', error);
            return false;
        }
    }
    
    setVelocity(bodyId, velocity) {
        const body = this.bodies.get(bodyId);
        if (!body) return false;
        
        try {
            Matter.Body.setVelocity(body, velocity);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.VELOCITY_CHANGED, {
                bodyId,
                velocity,
                body
            });
            
            return true;
            
        } catch (error) {
            console.error('Erreur lors du changement de vélocité:', error);
            return false;
        }
    }
    
    getStats() {
        if (!this.engine || !this.world) return null;
        
        return {
            isRunning: this.isRunning,
            bodyCount: this.world.bodies.length,
            constraintCount: this.world.constraints.length,
            deltaTime: this.deltaTime,
            lastUpdate: this.lastUpdate,
            engineTiming: this.engine.timing
        };
    }
    
    reset() {
        try {
            // Arrêter le moteur
            this.stop();
            
            // Nettoyer le monde
            if (this.world) {
                Matter.World.clear(this.world);
                Matter.Engine.clear(this.engine);
            }
            
            // Réinitialiser les collections
            this.bodies.clear();
            this.constraints.clear();
            
            // Réinitialiser l'état
            this.lastUpdate = 0;
            this.deltaTime = 0;
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_RESET, {
                timestamp: performance.now()
            });
            
            console.log('Moteur physique réinitialisé');
            
        } catch (error) {
            console.error('Erreur lors de la réinitialisation:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
    
    destroy() {
        try {
            this.stop();
            this.reset();
            
            // Nettoyer les gestionnaires
            if (this.bodyFactory) this.bodyFactory.destroy?.();
            if (this.collisionHandler) this.collisionHandler.destroy?.();
            if (this.thrusterPhysics) this.thrusterPhysics.destroy?.();
            if (this.synchronizationManager) this.synchronizationManager.destroy?.();
            if (this.physicsVectors) this.physicsVectors.destroy?.();
            
            // Nettoyer les références
            this.engine = null;
            this.world = null;
            this.runner = null;
            
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_DESTROYED, {
                timestamp: performance.now()
            });
            
            console.log('PhysicsController détruit');
            
        } catch (error) {
            console.error('Erreur lors de la destruction:', error);
        }
    }
    
    /**
     * Initialise les corps célestes dans le moteur physique
     * @param {Array} celestialBodyModels - Tableau des modèles de corps célestes
     */
    initializeCelestialBodies(celestialBodyModels) {
        try {
            // Nettoyer les corps célestes existants
            this.celestialBodies = [];
            
            // Créer les corps physiques pour chaque modèle
            for (const bodyModel of celestialBodyModels) {
                const physicsBody = this.bodyFactory.createCelestialBody(bodyModel);
                
                // Ajouter le corps au monde physique
                const bodyId = this.addBody(physicsBody, `celestial_${bodyModel.name}`);
                
                // Stocker la référence avec le modèle
                this.celestialBodies.push({
                    model: bodyModel,
                    body: physicsBody,
                    id: bodyId
                });
            }
            
            console.log(`PhysicsController: ${this.celestialBodies.length} corps célestes initialisés`);
            
            this.eventBus.publish(window.EVENTS.PHYSICS.CELESTIAL_BODIES_INITIALIZED, {
                count: this.celestialBodies.length,
                bodies: this.celestialBodies
            });
            
        } catch (error) {
            console.error('Erreur lors de l\'initialisation des corps célestes:', error);
            this.eventBus.publish(window.EVENTS.PHYSICS.ENGINE_ERROR, { error });
        }
    }
}

// Rendre disponible globalement
window.PhysicsController = PhysicsController; 