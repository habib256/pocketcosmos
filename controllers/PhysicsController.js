class PhysicsController {
    constructor(eventBus) {
        this.eventBus = eventBus;

        // Récupérer les modules Matter.js
        this.Engine = Matter.Engine;
        this.Render = Matter.Render; // Gardé pour référence potentielle mais non utilisé ici
        this.Runner = Matter.Runner; // Gardé pour référence potentielle mais non utilisé ici
        this.Bodies = Matter.Bodies;
        this.Body = Matter.Body;
        this.Composite = Matter.Composite;
        this.Vector = Matter.Vector; // Gardé pour référence potentielle mais non utilisé ici
        this.Events = Matter.Events;
        this.Attractors = MatterAttractors; // Accès direct au plugin

        // Récupérer les constantes globales (suppose qu'elles sont disponibles)
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;
        this.RENDER = RENDER;

        // Créer le moteur physique
        this.engine = this.Engine.create({
            enableSleeping: false,
            constraintIterations: 4,
            positionIterations: 6,
            velocityIterations: 4
        });

        // Désactiver la gravité par défaut
        this.engine.gravity.x = 0;
        this.engine.gravity.y = 0;
        this.engine.gravity.scale = 0;

        // Références aux objets principaux
        this.rocketBody = null;
        this.celestialBodies = []; // Stocke { body: Matter.Body, model: CelestialBodyModel }
        this.gameController = null; // Sera défini via setGameController

        // Paramètres de simulation
        this.timeScale = 1.0;
        this.gravitationalConstant = this.PHYSICS.G; // Correction : utiliser la même constante que la simulation

        // Contrôles assistés (l'état est géré ici, la logique dans ThrusterPhysics)
        this.assistedControls = true;

        // Initialiser les modules de gestion spécifiques
        this.bodyFactory = new BodyFactory(this.Bodies, this.Body, this.Attractors, this.ROCKET, this.PHYSICS);
        this.collisionHandler = new CollisionHandler(this, this.engine, this.Events, this.Body, this.ROCKET, this.PHYSICS);
        this.thrusterPhysics = new ThrusterPhysics(this, this.Body, this.ROCKET, this.PHYSICS);
        this.synchronizationManager = new SynchronizationManager(this, this.eventBus, this.Body, this.ROCKET, this.PHYSICS);
        this.physicsVectors = new PhysicsVectors(this, this.RENDER);

        // Cache (gardé ici pour l'instant, pourrait être dans un module séparé)
        this.forceCache = new Map();
        this.cacheTimeout = 1000; // Durée de vie du cache en ms
        this.lastCacheClear = Date.now();

        // Calcul de la force gravitationnelle pour le debug (avant update)
        this.Events.on(this.engine, 'beforeUpdate', () => {
            this.calculateGravityForceForDebug();
        });
    }

    // Initialiser ou réinitialiser le monde physique
    initPhysics(rocketModel, universeModel) {
        console.log("Initialisation/Réinitialisation du moteur physique...");
        this.rocketModel = rocketModel;
        this.universeModel = universeModel;

        // Vider le monde précédent
        this.Composite.clear(this.engine.world);
        this.rocketBody = null;
        this.celestialBodies = [];
        this.collisionHandler.initTime = Date.now(); // Réinitialiser le délai de collision
        this.collisionHandler.collisionsEnabled = false;

        try {
            // Créer le corps de la fusée
            this.rocketBody = this.bodyFactory.createRocketBody(rocketModel);
            if (!this.rocketBody) {
                throw new Error("Échec de la création du corps physique de la fusée");
            }

            // Définir l'amortissement angulaire initial basé sur l'état actuel des contrôles assistés
            this.rocketBody.angularDamping = this.assistedControls
                ? this.thrusterPhysics.assistedAngularDamping
                : this.thrusterPhysics.angularDamping;

            // Ajouter la fusée au monde
            this.Composite.add(this.engine.world, this.rocketBody);
            console.log("Corps physique de la fusée créé et ajouté au monde");

            // Synchronisation initiale après ajout au monde
            this.synchronizationManager.syncPhysicsWithModel(rocketModel);

            // Créer les corps célestes
            for (const bodyModel of universeModel.celestialBodies) {
                const celestialBody = this.bodyFactory.createCelestialBody(bodyModel);
                if (celestialBody) {
                    this.Composite.add(this.engine.world, celestialBody);
                    this.celestialBodies.push({ body: celestialBody, model: bodyModel });
                } else {
                    console.error(`Échec de la création du corps physique pour ${bodyModel.name}`);
                }
            }
            console.log(`${this.celestialBodies.length} corps célestes créés.`);

            // Configurer les gestionnaires d'événements de collision
            this.collisionHandler.setupCollisionEvents();
            console.log("Gestionnaire de collisions configuré.");

            // Correction : forcer le calcul de l'accélération dès l'init
            this.calculateGravityForceForDebug();

        } catch (error) {
            console.error("Erreur majeure lors de l'initialisation de la physique:", error);
        }
    }

    // Méthode principale de mise à jour, appelée par GameController
    update(deltaTime) {
        this.clearCacheIfNeeded();

        if (!this.rocketModel || !this.rocketBody || !this.universeModel) return;

        // Calculer et stocker l'accélération gravitationnelle de la fusée (pour le rendering et l'IA)
        this.lastRocketAcceleration = this.calculateGravityAccelerationAt(this.rocketBody.position, this.universeModel);

        // 1. Mettre à jour les positions des corps célestes (orbites calculées dans UniverseModel.update)
        //    On synchronise maintenant le moteur physique AVANT son update.
        for (const celestialInfo of this.celestialBodies) {
            if (celestialInfo.model.parentBody) {
                // Mettre à jour la position du corps physique Matter.js
                this.Body.setPosition(celestialInfo.body, celestialInfo.model.position);
                // Mettre à jour la vélocité du corps physique Matter.js (calculée dans updateOrbit)
                this.Body.setVelocity(celestialInfo.body, celestialInfo.model.velocity);
                // Assurer que le corps ne s'endort pas
                celestialInfo.body.isSleeping = false;
            }
        }

        // 2. Gérer la position/état de la fusée si posée ou attachée (avant la physique principale)
        this.synchronizationManager.handleLandedOrAttachedRocket(this.rocketModel);

        // 3. Appliquer la stabilisation de rotation (si contrôles assistés actifs)
        this.thrusterPhysics.applyRotationStabilization(this.rocketModel);

        // 4. Appliquer les forces des propulseurs
        this.thrusterPhysics.updateThrusters(this.rocketModel);

        // 5. Mettre à jour le moteur Matter.js (calcule gravité via plugin, collisions, mouvement)
        this.Engine.update(this.engine, deltaTime * this.timeScale);

        // 6. Synchroniser le modèle de la fusée avec le résultat de la physique
        //    (Sauf si elle est gérée manuellement car posée/attachée sur un corps mobile ou sur la Terre)
        const isLandedOnTerre = this.rocketModel.isLanded && this.rocketModel.landedOn === 'Terre';

        const isOnMobileBody = (this.rocketModel.isLanded || this.rocketModel.isDestroyed) &&
                               (this.rocketModel.landedOn || this.rocketModel.attachedTo) &&
                               this.celestialBodies.some(cb =>
                                   (cb.model.name === this.rocketModel.landedOn || cb.model.name === this.rocketModel.attachedTo) &&
                                   typeof cb.model.updateOrbit === 'function'
                               );

        const isHandledManually = isLandedOnTerre || isOnMobileBody;

        if (!isHandledManually) {
            this.synchronizationManager.syncModelWithPhysics(this.rocketModel);
        }

        // 7. Vérification périodique de l'état d'atterrissage
        this.synchronizationManager.checkRocketLandedStatusPeriodically(this.rocketModel, this.universeModel);
    }

    // Calculer la force gravitationnelle totale pour la visualisation (debug)
    calculateGravityForceForDebug() {
        // Ajout log de debug
        if (!this.rocketBody) {
            console.warn('[PhysicsController] Pas de rocketBody pour calculer l\'accélération.');
        }
        if (!this.celestialBodies || this.celestialBodies.length === 0) {
            console.warn('[PhysicsController] Pas de corps célestes pour calculer l\'accélération.');
        }
        let totalForceX = 0;
        let totalForceY = 0;

        if (this.rocketBody && this.celestialBodies.length > 0) {
            for (const celestialInfo of this.celestialBodies) {
                const celestialBody = celestialInfo.body;
                const celestialModel = celestialInfo.model;

                const dx = celestialBody.position.x - this.rocketBody.position.x;
                const dy = celestialBody.position.y - this.rocketBody.position.y;
                const distanceSq = dx * dx + dy * dy;

                if (distanceSq > 1e-6) { // Éviter division par zéro
                    const distance = Math.sqrt(distanceSq);
                    // Utilise la constante définie dans ce contrôleur (peut différer du plugin)
                    const forceMagnitude = this.gravitationalConstant * celestialModel.mass * this.rocketBody.mass / distanceSq;
                    totalForceX += forceMagnitude * (dx / distance);
                    totalForceY += forceMagnitude * (dy / distance);
                }
            }
        }
        // Calculer l'accélération (a = F/m)
        let accX = 0;
        let accY = 0;
        if (this.rocketBody && this.rocketBody.mass) {
            accX = totalForceX / this.rocketBody.mass;
            accY = totalForceY / this.rocketBody.mass;
        }
        this.physicsVectors.setTotalAcceleration(accX, accY);
        // Ajout log pour debug accélération fusée
        if (typeof accX === 'number' && typeof accY === 'number') {
           // console.log(`[RocketAccel] a = {x: ${accX.toExponential(2)}, y: ${accY.toExponential(2)}} module = ${(Math.sqrt(accX*accX+accY*accY)).toExponential(2)}`);
        }
    }

    // Méthodes déléguées aux modules spécifiques
    toggleAssistedControls() {
        return this.thrusterPhysics.toggleAssistedControls();
    }

    toggleForceVectors() {
        return this.physicsVectors.toggleForceVectors();
    }

    drawForceVectors(ctx, camera) {
        this.physicsVectors.drawForceVectors(ctx, camera);
    }

    // Reset (utilise initPhysics)
    resetPhysics(rocketModel, universeModel) {
        this.initPhysics(rocketModel, universeModel);
    }

     // Garder la synchro pour une compatibilité externe potentielle?
     // Ou la supprimer si plus utilisée directement?
     syncPhysics(rocketModel, universeModel) {
         console.warn("`syncPhysics` est obsolète, utiliser `resetPhysics` ou `initPhysics`.");
         this.initPhysics(rocketModel, universeModel);
     }

    // Nettoyer le cache (gardé ici)
    clearCacheIfNeeded() {
        if (Date.now() - this.lastCacheClear > this.cacheTimeout) {
            this.forceCache.clear();
            this.lastCacheClear = Date.now();
        }
    }

    // Stocker la référence vers GameController
    setGameController(gameController) {
        this.gameController = gameController;
        // On pourrait passer gameController aux sous-modules si nécessaire
    }

    // Calcule l'accélération gravitationnelle totale en un point (x, y)
    calculateGravityAtPoint(x, y) {
        let ax = 0, ay = 0;
        for (const celestialInfo of this.celestialBodies) {
            const body = celestialInfo.body;
            const model = celestialInfo.model;
            const dx = body.position.x - x;
            const dy = body.position.y - y;
            const r2 = dx * dx + dy * dy;
            if (r2 < 1e-6) continue; // Ignore le centre
            const r = Math.sqrt(r2);
            const a = this.gravitationalConstant * model.mass / r2;
            ax += a * dx / r;
            ay += a * dy / r;
        }
        // Ajout log pour debug champ de gravité
        if (Math.abs(ax) > 0 || Math.abs(ay) > 0) {
           // console.log(`[GravityField] G@(${x.toFixed(0)},${y.toFixed(0)}) = {ax: ${ax.toExponential(2)}, ay: ${ay.toExponential(2)}}`);
        }
        return { ax, ay };
    }

    // Fonction pure : accélération gravitationnelle à une position donnée
    calculateGravityAccelerationAt(position, universeModel) {
        let ax = 0, ay = 0;
        if (!position) {
            console.warn('[DEBUG][PhysicsController] calculateGravityAccelerationAt: position manquante', position);
            return { x: 0, y: 0 };
        }
        if (!universeModel) {
            console.warn('[DEBUG][PhysicsController] calculateGravityAccelerationAt: universeModel manquant', universeModel);
            return { x: 0, y: 0 };
        }
        if (!universeModel.celestialBodies || universeModel.celestialBodies.length === 0) {
            console.warn('[DEBUG][PhysicsController] calculateGravityAccelerationAt: pas de corps célestes', universeModel.celestialBodies);
            return { x: 0, y: 0 };
        }
        for (const body of universeModel.celestialBodies) {
            const dx = body.position.x - position.x;
            const dy = body.position.y - position.y;
            const r2 = dx * dx + dy * dy;
            if (r2 < 1e-6) continue;
            const r = Math.sqrt(r2);
            const a = this.gravitationalConstant * body.mass / r2;
            ax += a * dx / r;
            ay += a * dy / r;
        }
        return { x: ax, y: ay };
    }

    // Retourne la liste des corps célestes (modèles) pour l'affichage
    getCelestialBodies() {
        // On retourne les modèles avec position et rayon
        return this.celestialBodies.map(cb => {
            return {
                x: cb.model.position.x,
                y: cb.model.position.y,
                radius: cb.model.radius
            };
        });
    }
} 