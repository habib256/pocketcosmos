class CollisionHandler {
    constructor(physicsController, engine, Events, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketModel, rocketBody, etc.
        this.engine = engine;
        this.Events = Events;
        this.Body = Body;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;

        this.collisionsEnabled = false;
        this.initTime = Date.now();
        this._lastLandedState = {};

        // --- Ajout pour détection mission accomplie ---
        if (this.physicsController.eventBus) {
            this.physicsController.eventBus.subscribe('MISSION_COMPLETED', () => {
                // Déclencher la célébration Mission Réussie (texte doré + explosion festive)
                const gameController = window.gameController;
                if (gameController && gameController.particleController && gameController.canvas) {
                    gameController.particleController.createMissionSuccessCelebration(
                        gameController.canvas.width,
                        gameController.canvas.height
                    );
                }
                // Déclencher l'affichage du texte dans l'UI
                window._missionSuccessTextTime = Date.now();
                // Déclencher l'effet particules à la position de la fusée
                const rocketModel = this.physicsController.rocketModel;
                if (typeof window !== 'undefined' && window.dispatchEvent && rocketModel) {
                    window.dispatchEvent(new CustomEvent('MISSION_SUCCESS_PARTICLES', {
                        detail: {
                            x: rocketModel.position.x,
                            y: rocketModel.position.y,
                            message: "Mission réussie"
                        }
                    }));
                }
                // Optionnel : log pour debug
                console.log('[CollisionHandler] Mission accomplie détectée, célébration Mission Réussie déclenchée');
            });
        } else {
            console.warn('[CollisionHandler] eventBus non trouvé sur physicsController, impossible de s\'abonner à MISSION_COMPLETED');
        }
    }

    setupCollisionEvents() {
        // Variable locale pour stocker la référence au modèle de la fusée
        const rocketModel = this.physicsController.rocketModel;

        // Événement déclenché au début d'une collision
        this.Events.on(this.engine, 'collisionStart', (event) => {
            // Vérifier si les collisions sont actives
            if (!this.collisionsEnabled) {
                // Vérifier si le délai d'initialisation est écoulé
                if (Date.now() - this.initTime < this.PHYSICS.COLLISION_DELAY) {
                    return; // Ignorer les collisions pendant le délai d'initialisation
                } else {
                    this.collisionsEnabled = true;
                    console.log("Collisions activées après le délai d'initialisation");
                }
            }

            const pairs = event.pairs;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const rocketBody = this.physicsController.rocketBody;

                // Vérifier si la fusée est impliquée dans la collision
                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue; // Ignorer si un des corps ou la fusée n'existe pas

                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;

                    if (!otherBody) continue; // Vérification supplémentaire

                    // Calculer la vitesse d'impact
                    const relVelX = rocketBody.velocity.x - (otherBody.isStatic ? 0 : otherBody.velocity.x);
                    const relVelY = rocketBody.velocity.y - (otherBody.isStatic ? 0 : otherBody.velocity.y);
                    const impactVelocity = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
                    const COLLISION_THRESHOLD = 2.5; // m/s

                    // Détecter un atterrissage en douceur (vitesse faible)
                    if (otherBody.label !== 'rocket' && this.isRocketLanded(rocketModel, otherBody)) {
                        rocketModel.isLanded = true;
                        rocketModel.landedOn = otherBody.label; // Indiquer le corps sur lequel on a atterri

                        const angleToBody = Math.atan2(
                            rocketModel.position.y - otherBody.position.y,
                            rocketModel.position.x - otherBody.position.x
                        );
                        const correctAngle = angleToBody + Math.PI/2;
                        rocketModel.angle = correctAngle;
                        // La synchro est gérée par SynchronizationManager
                        // this.physicsController.synchronizationManager.syncPhysicsWithModel(rocketModel); // Supprimé, géré ailleurs

                        if (!this._lastLandedState[otherBody.label] && rocketModel.isLanded) {
                            console.log(`Atterrissage réussi sur ${otherBody.label}`);
                        }
                        this._lastLandedState[otherBody.label] = !!rocketModel.isLanded;
                    } else {
                        // Collision normale
                        const impactDamage = impactVelocity * this.PHYSICS.IMPACT_DAMAGE_FACTOR;

                        if (otherBody.label !== 'rocket' && impactVelocity > COLLISION_THRESHOLD) {
                            if (!rocketModel.isDestroyed) {
                                rocketModel.landedOn = otherBody.label;
                                rocketModel.applyDamage(impactDamage);
                                this.playCollisionSound(impactVelocity);
                                console.log(`Collision IMPORTANTE avec ${otherBody.label}: Vitesse d'impact=${impactVelocity.toFixed(2)}, Dégâts=${impactDamage.toFixed(2)}`);
                            }
                        } else if (otherBody.label !== 'rocket') {
                            if (!rocketModel.isDestroyed) {
                                console.log(`Collision avec ${otherBody.label}: Vitesse d'impact=${impactVelocity.toFixed(2)}, Pas de dégâts`);
                            }
                        }
                    }
                }
            }
        });

        // Événement pour les collisions actives (contact continu)
        this.Events.on(this.engine, 'collisionActive', (event) => {
            const pairs = event.pairs;
            const rocketBody = this.physicsController.rocketBody;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];

                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;

                    if (otherBody.label !== 'rocket') {
                        if (!rocketModel.isDestroyed && !rocketModel.isLanded && this.isRocketLanded(rocketModel, otherBody)) {
                            rocketModel.isLanded = true;
                            rocketModel.landedOn = otherBody.label;
                            console.log(`Fusée posée sur ${otherBody.label}`);
                            
                            // Fixer explicitement la position et la vitesse à zéro
                            rocketModel.setVelocity(0, 0);
                            rocketModel.setAngularVelocity(0);
                            // Suppression du forçage direct des vitesses physiques ici
                            // this.Body.setVelocity(rocketBody, { x: 0, y: 0 });
                            // this.Body.setAngularVelocity(rocketBody, 0);
                            
                            // Fixer l'angle perpendiculaire à la surface
                            const angleToBody = Math.atan2(
                                rocketModel.position.y - otherBody.position.y,
                                rocketModel.position.x - otherBody.position.x
                            );
                            const correctAngle = angleToBody + Math.PI/2;
                            rocketModel.angle = correctAngle;
                            // Suppression du forçage direct de l'angle physique ici
                            // this.Body.setAngle(rocketBody, correctAngle);
                            
                            // Calculer la position relative pour n'importe quel corps céleste
                            const cbModel = this.physicsController.celestialBodies.find(cb => cb.model.name === otherBody.label)?.model;
                            if (cbModel) {
                                rocketModel.updateRelativePosition(cbModel);
                            }
                        }

                        // Si la fusée est posée sur un corps, fixer sa position et orientation
                        if (rocketModel.isLanded && rocketModel.landedOn === otherBody.label) {
                            // Maintenir la vitesse à zéro pour éviter tout mouvement indésirable
                            // La logique de stabilisation est maintenant centralisée dans SynchronizationManager
                            // this.Body.setVelocity(rocketBody, { x: 0, y: 0 });
                            // this.Body.setAngularVelocity(rocketBody, 0);

                            // Déplacer cette logique dans SynchronizationManager pour les corps mobiles
                            // if (otherBody.label !== 'Terre') { // Commenté/Supprimé car géré dans SyncManager
                            //     this.physicsController.synchronizationManager.handleLandedOrAttachedRocket(rocketModel);
                            // }
                        }
                    }
                }
            }
        });

        // Événement de fin de collision
        this.Events.on(this.engine, 'collisionEnd', (event) => {
            const pairs = event.pairs;
            const rocketBody = this.physicsController.rocketBody;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;
                    if ((otherBody.label !== 'rocket') && rocketModel.isLanded) {
                        if (this._lastLandedState[otherBody.label]) {
                            console.log(`Décollage de ${otherBody.label} détecté`);
                        }
                        this._lastLandedState[otherBody.label] = false;
                        console.log(`CollisionEnd avec ${otherBody.label} alors que isLanded=${rocketModel.isLanded}. La confirmation du décollage est gérée par SynchronizationManager.`);
                    }
                }
            }
        });
    }

    playCollisionSound(impactVelocity) {
        if (this.physicsController.rocketModel && this.physicsController.rocketModel.isDestroyed) {
            return;
        }
        try {
            const collisionSound = new Audio('assets/sound/collision.mp3');
            const maxVolume = 1.0;
            const minVolume = 0.3;
            const volumeScale = Math.min((impactVelocity - 2.5) / 10, 1); // Normaliser entre 0 et 1
            collisionSound.volume = minVolume + volumeScale * (maxVolume - minVolume);
            collisionSound.play().catch(error => {
                console.error("Erreur lors de la lecture du son de collision:", error);
            });
        } catch (error) {
            console.error("Erreur lors de la lecture du fichier collision.mp3:", error);
        }
    }

    // Note: otherBody ici peut être le corps physique ou un objet modèle simulé
    // Logique d'atterrissage/crash basée sur vitesse, angle et rotation
    isRocketLanded(rocketModel, otherBody) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketBody || !otherBody || !otherBody.position || (otherBody.circleRadius === undefined && otherBody.radius === undefined) || !rocketModel) {
            return false;
        }

        if (rocketModel.isLanded && rocketModel.landedOn === otherBody.label) {
            return true;
        }

        // --- Calculs --- 
        const rocketX = rocketBody.position.x;
        const rocketY = rocketBody.position.y;
        const bodyX = otherBody.position.x;
        const bodyY = otherBody.position.y;
        const dx = rocketX - bodyX;
        const dy = rocketY - bodyY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const bodyRadius = otherBody.circleRadius ?? otherBody.radius;
        if (bodyRadius === undefined) return false;
        const rocketEffectiveRadius = this.ROCKET.HEIGHT / 2;
        const distanceToSurface = distance - bodyRadius - rocketEffectiveRadius;
        const proximityThreshold = 15;
        const isCloseToSurface = Math.abs(isNaN(distanceToSurface) ? 0 : distanceToSurface) < proximityThreshold;

        const velocity = rocketBody.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const angularVelocity = Math.abs(rocketBody.angularVelocity);

        // Calcul de l'angle par rapport à la surface
        const surfaceAngle = Math.atan2(dy, dx);
        let rocketOrientation = rocketBody.angle;
        while (rocketOrientation <= -Math.PI) rocketOrientation += 2 * Math.PI;
        while (rocketOrientation > Math.PI) rocketOrientation -= 2 * Math.PI;
        let correctOrientation = surfaceAngle + Math.PI / 2;
        while (correctOrientation <= -Math.PI) correctOrientation += 2 * Math.PI;
        while (correctOrientation > Math.PI) correctOrientation -= 2 * Math.PI;
        let angleDiff = Math.abs(rocketOrientation - correctOrientation);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const angleDiffDeg = angleDiff * (180 / Math.PI);

        // Conversion des seuils d'angle en radians pour comparaison
        const landingAngleThresholdRad = this.PHYSICS.LANDING_MAX_ANGLE_DEG * (Math.PI / 180);
        const crashAngleThresholdRad = this.PHYSICS.CRASH_ANGLE_DEG * (Math.PI / 180);

        // --- Log de débogage --- 
        if (isCloseToSurface && !rocketModel.isDestroyed) {
            console.log(`isRocketLanded Check (${otherBody.label}): ` +
                        `Close=${isCloseToSurface}, Speed=${speed.toFixed(2)}, ` +
                        `Angle=${angleDiffDeg.toFixed(1)}°, AngVel=${angularVelocity.toFixed(3)}`);
        }

        // --- Logique de décision --- 
        const canCrash = this.collisionsEnabled;

        // 1. Vérifier les conditions de CRASH (si proche et collisions activées)
        if (isCloseToSurface && canCrash && !rocketModel.isDestroyed) {
            let crashReason = null;
            if (speed >= this.PHYSICS.CRASH_SPEED_THRESHOLD) {
                crashReason = `Vitesse trop élevée (>= ${this.PHYSICS.CRASH_SPEED_THRESHOLD})`;
            } else if (angleDiff > crashAngleThresholdRad) {
                crashReason = `Angle trop élevé (> ${this.PHYSICS.CRASH_ANGLE_DEG}°)`;
            } else if (angularVelocity > this.PHYSICS.CRASH_ANGULAR_VELOCITY) {
                crashReason = `Rotation trop rapide (> ${this.PHYSICS.CRASH_ANGULAR_VELOCITY} rad/s)`;
            }

            if (crashReason) {
                console.error(`CRASH DÉTECTÉ sur ${otherBody.label}! Cause: ${crashReason}`);
                console.log(`   Détails - Vitesse: ${speed.toFixed(2)}, Angle: ${angleDiffDeg.toFixed(1)}°, Rotation: ${angularVelocity.toFixed(3)}`);
                rocketModel.crashedOn = otherBody.label;
                rocketModel.landedOn = otherBody.label;
                rocketModel.attachedTo = otherBody.label;
                rocketModel.applyDamage(this.ROCKET.MAX_HEALTH + 1);
                this.playCollisionSound(50); // Son de gros impact
                // Déclencher l'explosion de particules
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('ROCKET_CRASH_EXPLOSION', {
                        detail: {
                            x: rocketBody.position.x,
                            y: rocketBody.position.y
                        }
                    }));
                }
                // --- Enfoncer la fusée dans la planète de 40 pixels ---
                if (otherBody.position && (otherBody.circleRadius || otherBody.radius)) {
                    const bodyRadius = otherBody.circleRadius ?? otherBody.radius;
                    const dx = rocketBody.position.x - otherBody.position.x;
                    const dy = rocketBody.position.y - otherBody.position.y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    const newDist = bodyRadius + (this.ROCKET.HEIGHT / 2) - 40; // 40 px plus près du centre
                    rocketModel.position.x = otherBody.position.x + dx / dist * newDist;
                    rocketModel.position.y = otherBody.position.y + dy / dist * newDist;
                    // Synchroniser le corps physique si besoin
                    if (this.Body && rocketBody) {
                        this.Body.setPosition(rocketBody, { x: rocketModel.position.x, y: rocketModel.position.y });
                    }
                }
                return false; // CRASH
            }
        }

        // 2. Vérifier les conditions d'ATTERRISSAGE STABLE (si proche)
        if (isCloseToSurface) {
            const isStableSpeed = speed < this.PHYSICS.LANDING_MAX_SPEED;
            const isStableAngle = angleDiff <= landingAngleThresholdRad;
            const isStableAngularVelocity = angularVelocity <= this.PHYSICS.LANDING_MAX_ANGULAR_VELOCITY;

            if (isStableSpeed && isStableAngle && isStableAngularVelocity) {
                 // console.log(`Conditions d'atterrissage stables remplies`);
                return true; // ATTERRISSAGE
            }
        }

        // 3. Sinon (pas proche, ou proche mais ni crash ni stable)
        return false; // PAS POSÉ
    }
} 