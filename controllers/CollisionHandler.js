/**
 * Gère la détection et la logique des collisions pour la fusée dans le moteur physique.
 * S'occupe de déterminer les atterrissages, les crashs, et d'appliquer les dégâts.
 */
class CollisionHandler {
    /**
     * Crée une instance de CollisionHandler.
     * @param {object} physicsController - Le contrôleur de physique, donnant accès au modèle de la fusée et au corps physique.
     * @param {Matter.Engine} engine - L'instance du moteur physique Matter.js.
     * @param {Matter.Events} Events - Le module Events de Matter.js pour s'abonner aux événements de collision.
     * @param {Matter.Body} Body - Le module Body de Matter.js pour interagir avec les propriétés des corps physiques.
     * @param {object} ROCKET - Les constantes de configuration de la fusée.
     * @param {object} PHYSICS - Les constantes de configuration physique (seuils de collision, etc.).
     */
    constructor(physicsController, engine, Events, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketModel, rocketBody, etc.
        this.engine = engine;
        this.Events = Events;
        this.Body = Body;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;

        /** @type {boolean} - Indique si la détection des collisions est active. Initialisée à false et activée après un délai. */
        this.collisionsEnabled = false;
        /** @type {number} - Timestamp de l'initialisation du gestionnaire de collision, utilisé pour le délai d'activation. */
        this.initTime = Date.now();
        /** @type {Object.<string, boolean>} - Stocke le dernier état d'atterrissage connu pour chaque corps céleste (par leur label). */
        this._lastLandedState = {};

        // Suppression: la célébration mission est gérée de façon découplée par ParticleController (abonnement à EVENTS.MISSION.COMPLETED)
    }

    /**
     * Configure les écouteurs d'événements pour les collisions de Matter.js.
     * Gère 'collisionStart', 'collisionActive', et 'collisionEnd'.
     */
    setupCollisionEvents() {
        const rocketModel = this.physicsController.rocketModel;

        // Événement déclenché au début d'une collision
        this.Events.on(this.engine, 'collisionStart', (event) => {
            // Vérifier si les collisions sont actives et si le délai d'initialisation est écoulé.
            // CORRECTION: Activer les collisions AVANT de traiter la collision pour éviter les race conditions
            if (!this.collisionsEnabled) {
                if (Date.now() - this.initTime < this.PHYSICS.COLLISION_DELAY) {
                    return; // Ignorer les collisions pendant le délai d'initialisation.
                }
                // Activer les collisions avant de traiter cette collision
                this.collisionsEnabled = true;
                console.log("Collisions activées après le délai d'initialisation");
                // Continuer le traitement de cette collision maintenant que les collisions sont activées
            }

            const pairs = event.pairs;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const rocketBody = this.physicsController.rocketBody;

                // S'assurer que les deux corps de la paire et le corps de la fusée existent.
                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                // Vérifier si la fusée est l'un des corps impliqués dans la collision.
                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;

                    if (!otherBody) continue; // Vérification supplémentaire pour l'autre corps.

                    // Calculer la vitesse d'impact relative entre la fusée et l'autre corps.
                    const relVelX = rocketBody.velocity.x - (otherBody.isStatic ? 0 : otherBody.velocity.x);
                    const relVelY = rocketBody.velocity.y - (otherBody.isStatic ? 0 : otherBody.velocity.y);
                    const impactVelocity = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
                    const COLLISION_THRESHOLD = 2.5; // m/s, seuil pour différencier un contact léger d'un impact notable.

                    // CORRECTION: Vérifier si le propulseur principal est actif (tentative de décollage)
                    const mainStart = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
                    const isTryingToLiftOffStart = mainStart && mainStart.maxPower > 0 
                        ? (mainStart.power / mainStart.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT
                        : false;

                    // Tenter de détecter un atterrissage en utilisant la logique de `isRocketLanded`.
                    // CORRECTION: Ne pas considérer comme atterrissage si en train de décoller ou si délai de grâce actif
                    if (otherBody.label !== 'rocket' && !isTryingToLiftOffStart && this.isRocketLanded(rocketModel, otherBody)) {
                        // Vérifier le délai de grâce avant de mettre isLanded à true
                        if (!rocketModel.canSetLanded()) {
                            console.log(`[CollisionStart] Atterrissage détecté sur ${otherBody.label} mais délai de grâce actif, ignoré`);
                            continue;
                        }
                        rocketModel.isLanded = true;
                        rocketModel.landedOn = otherBody.label; // Enregistrer sur quel corps la fusée a atterri.

                        // Ajuster l'angle de la fusée pour qu'elle soit perpendiculaire à la surface du corps.
                        const angleToBody = Math.atan2(
                            rocketModel.position.y - otherBody.position.y,
                            rocketModel.position.x - otherBody.position.x
                        );
                        const correctAngle = angleToBody + Math.PI/2;
                        rocketModel.angle = correctAngle;
                        // La synchronisation de l'état physique (position, angle) est gérée par SynchronizationManager.

                        if (!this._lastLandedState[otherBody.label] && rocketModel.isLanded) {
                            console.log(`Atterrissage réussi sur ${otherBody.label}`);
                        }
                        this._lastLandedState[otherBody.label] = !!rocketModel.isLanded;
                    } else {
                        // Gérer une collision normale (pas un atterrissage en douceur).
                        // Cette section est atteinte si isRocketLanded retourne false (soit c'est un crash, soit un contact non-atterrissage).
                        // Si c'est un crash, rocketModel.isDestroyed sera déjà true à cause de la logique dans isRocketLanded.
                        const impactDamage = impactVelocity * this.PHYSICS.IMPACT_DAMAGE_FACTOR;

                        if (otherBody.label !== 'rocket' && impactVelocity > COLLISION_THRESHOLD) {
                            // Collision significative.
                            if (!rocketModel.isDestroyed) { // Ce bloc ne sera PAS atteint si isRocketLanded a déjà détruit la fusée.
                                rocketModel.landedOn = otherBody.label;
                                console.log(`[CollisionHandler] Avant applyDamage (collision non-fatale). rocketModel.isDestroyed: ${rocketModel.isDestroyed}, impactDamage: ${impactDamage.toFixed(2)}`);
                                const wasJustDestroyedByNonFatal = rocketModel.applyDamage(impactDamage);
                                console.log(`[CollisionHandler] Après applyDamage (collision non-fatale). wasJustDestroyed: ${wasJustDestroyedByNonFatal}, rocketModel.isDestroyed: ${rocketModel.isDestroyed}`);
                                
                                this.playCollisionSound(impactVelocity); 
                                console.log(`Collision IMPORTANTE (non-fatale) avec ${otherBody.label}: Vitesse d'impact=${impactVelocity.toFixed(2)}, Dégâts=${impactDamage.toFixed(2)}`);

                                if (wasJustDestroyedByNonFatal) { 
                                    console.log('[CollisionHandler] Condition wasJustDestroyedByNonFatal est VRAIE (collision devenue fatale ici).');
                                    if (this.physicsController && this.physicsController.eventBus) {
                                        console.log('[CollisionHandler] Emitting ROCKET.DESTROYED event (collision devenue fatale).');
                                        this.physicsController.eventBus.emit(window.EVENTS.ROCKET.DESTROYED, {
                                            position: { ...rocketModel.position },
                                            velocity: { ...rocketModel.velocity },
                                            impactVelocity: impactVelocity,
                                            destroyedOn: otherBody.label
                                        });
                                    } else {
                                        console.warn('[CollisionHandler] eventBus non disponible, impossible de publier ROCKET.DESTROYED.');
                                    }
                                } else {
                                    console.log('[CollisionHandler] Condition wasJustDestroyedByNonFatal est FAUSSE.');
                                }
                            } else {
                                // Ce log est celui que vous voyez : la fusée a été détruite par isRocketLanded.
                                console.log(`[CollisionHandler] Collision avec ${otherBody.label} mais fusée déjà détruite (probablement par isRocketLanded). Pas de dégâts supplémentaires ni d'événement depuis collisionStart.`);
                            }
                        } else if (otherBody.label !== 'rocket') {
                            // Collision légère, pas de dégâts.
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
                        // CORRECTION: Vérifier si le propulseur principal est actif (tentative de décollage)
                        const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
                        const isTryingToLiftOff = main && main.maxPower > 0 
                            ? (main.power / main.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT
                            : false;
                        
                        // Log de diagnostic désactivé (trop verbeux - 60 fois/seconde)
                        // if (main && main.power > 0) {
                        //     console.log(`[CollisionActive] Contact avec ${otherBody.label}: isTryingToLiftOff=${isTryingToLiftOff}, power=${main.power}, maxPower=${main.maxPower}, isLanded=${rocketModel.isLanded}`);
                        // }
                        
                        // Si la fusée essaie de décoller, NE PAS la considérer comme atterrie
                        if (isTryingToLiftOff) {
                            // Log désactivé (trop verbeux)
                            // console.log(`[CollisionActive] Décollage en cours, ignorant atterrissage sur ${otherBody.label}`);
                            continue; // Passer au prochain pair
                        }
                        
                        // Si la fusée n'est pas détruite, pas encore atterrie, et pas en train de décoller
                        if (!rocketModel.isDestroyed && !rocketModel.isLanded && this.isRocketLanded(rocketModel, otherBody)) {
                            // Vérifier le délai de grâce avant de mettre isLanded à true
                            if (!rocketModel.canSetLanded()) {
                                console.log(`[CollisionActive] Atterrissage détecté sur ${otherBody.label} mais délai de grâce actif, ignoré`);
                                continue;
                            }
                            rocketModel.isLanded = true;
                            rocketModel.landedOn = otherBody.label;
                            console.log(`Fusée posée sur ${otherBody.label}`);
                            
                            // Mettre à jour le modèle de la fusée pour refléter l'atterrissage.
                            // La vitesse et la vélocité angulaire sont mises à zéro dans le modèle.
                            rocketModel.setVelocity(0, 0);
                            rocketModel.setAngularVelocity(0);
                            
                            // Ajuster l'angle du modèle pour être perpendiculaire à la surface.
                            const angleToBody = Math.atan2(
                                rocketModel.position.y - otherBody.position.y,
                                rocketModel.position.x - otherBody.position.x
                            );
                            const correctAngle = angleToBody + Math.PI/2;
                            rocketModel.angle = correctAngle;
                            
                            // Mettre à jour la position relative de la fusée par rapport au corps sur lequel elle a atterri.
                            const cbModel = this.physicsController.celestialBodies.find(cb => cb.model.name === otherBody.label)?.model;
                            if (cbModel) {
                                rocketModel.updateRelativePosition(cbModel);
                            }
                        }

                        // Si la fusée est considérée comme atterrie sur ce corps,
                        // SynchronizationManager s'occupera de maintenir sa position/orientation, surtout pour les corps mobiles.
                        // Aucune action directe sur le corps physique ici pour éviter les conflits.
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
                    // Si la fusée était atterrie sur cet 'otherBody' et que la collision se termine.
                    if ((otherBody.label !== 'rocket') && rocketModel.isLanded) {
                        if (this._lastLandedState[otherBody.label]) {
                            console.log(`Décollage de ${otherBody.label} détecté (fin de contact)`);
                        }
                        this._lastLandedState[otherBody.label] = false;
                        // La logique de confirmation du décollage (passage de isLanded à false)
                        // est gérée par SynchronizationManager, qui vérifie si la fusée s'éloigne activement.
                        console.log(`CollisionEnd avec ${otherBody.label} alors que isLanded=${rocketModel.isLanded}. Confirmation du décollage via SynchronizationManager.`);
                    }
                }
            }
        });
    }

    /**
     * Joue un son de collision, avec un volume ajusté en fonction de la vélocité de l'impact.
     * @param {number} impactVelocity - La vélocité de l'impact.
     */
    playCollisionSound(impactVelocity) {
        if (!window.audioManager) return;
        window.audioManager.preload('collision', 'assets/sound/collision.mp3', { volume: 0.6 });
        window.audioManager.play('collision');
    }

    /**
     * Détermine si la fusée est considérée comme atterrie sur un autre corps.
     * Cette fonction vérifie la proximité, la vitesse, l'angle d'atterrissage et la vitesse angulaire.
     * Elle gère également la détection de crash si les conditions d'atterrissage ne sont pas respectées.
     * @param {RocketModel} rocketModel - Le modèle de la fusée.
     * @param {Matter.Body} otherBody - Le corps physique Matter.js avec lequel la collision est vérifiée.
     * @returns {boolean} True si la fusée est considérée comme atterrie, false sinon (y compris en cas de crash).
     */
    isRocketLanded(rocketModel, otherBody) {
        const rocketBody = this.physicsController.rocketBody;
        // Vérifications initiales pour s'assurer que tous les objets nécessaires et leurs propriétés existent.
        if (!rocketBody || !otherBody || !otherBody.position || (otherBody.circleRadius === undefined && otherBody.radius === undefined) || !rocketModel) {
            console.warn("[isRocketLanded] Vérification annulée: rocketBody, otherBody ou leurs propriétés sont indéfinis.", { rocketBody, otherBody, rocketModel });
            return false;
        }

        // Si le modèle indique déjà un atterrissage sur ce corps, on considère que c'est toujours le cas.
        // Cela évite des calculs redondants ou des changements d'état rapides.
        if (rocketModel.isLanded && rocketModel.landedOn === otherBody.label) {
            return true;
        }

        // --- Calculs géométriques et cinématiques ---
        const rocketX = rocketBody.position.x;
        const rocketY = rocketBody.position.y;
        const bodyX = otherBody.position.x;
        const bodyY = otherBody.position.y;
        const dx = rocketX - bodyX;
        const dy = rocketY - bodyY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // CORRECTION: Vérifier que distance est valide avant utilisation
        if (!isFinite(distance) || distance <= 0) {
            console.warn(`[isRocketLanded] Distance invalide: ${distance} (dx=${dx}, dy=${dy})`);
            return false;
        }
        
        const bodyRadius = otherBody.circleRadius ?? otherBody.radius; // Utilise circleRadius (Matter.js) ou radius (modèle)
        if (bodyRadius === undefined) {
            console.warn(`[isRocketLanded] Rayon de '${otherBody.label}' indéfini.`);
            return false;
        }
        
        const rocketEffectiveRadius = this.ROCKET.HEIGHT / 2; // Approximation du "rayon" de la fusée pour contact.
        const distanceToSurface = distance - bodyRadius - rocketEffectiveRadius;
        const proximityThreshold = 15; // Pixels. Seuil de proximité pour considérer un contact potentiel.
        const isCloseToSurface = Math.abs(isNaN(distanceToSurface) ? Infinity : distanceToSurface) < proximityThreshold;


        const velocity = rocketBody.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const angularVelocity = Math.abs(rocketBody.angularVelocity);

        // Calcul de l'angle d'orientation de la fusée par rapport à la normale à la surface du corps céleste.
        const surfaceAngle = Math.atan2(dy, dx); // Angle du vecteur allant du centre du corps vers la fusée.
        let rocketOrientation = rocketBody.angle; // Angle actuel de la fusée.
        // Normaliser l'orientation de la fusée entre -PI et PI.
        while (rocketOrientation <= -Math.PI) rocketOrientation += 2 * Math.PI;
        while (rocketOrientation > Math.PI) rocketOrientation -= 2 * Math.PI;
        
        // L'orientation correcte pour un atterrissage est perpendiculaire au rayon (tangente + PI/2).
        let correctOrientation = surfaceAngle + Math.PI / 2;
        // Normaliser l'orientation correcte entre -PI et PI.
        while (correctOrientation <= -Math.PI) correctOrientation += 2 * Math.PI;
        while (correctOrientation > Math.PI) correctOrientation -= 2 * Math.PI;
        
        // Différence absolue entre l'angle de la fusée et l'angle idéal d'atterrissage.
        let angleDiff = Math.abs(rocketOrientation - correctOrientation);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff; // Assurer que la différence est le plus petit angle.
        const angleDiffDeg = angleDiff * (180 / Math.PI);

        // Conversion des seuils d'angle (définis en degrés dans les constantes) en radians pour comparaison.
        const landingAngleThresholdRad = this.PHYSICS.LANDING_MAX_ANGLE_DEG * (Math.PI / 180);
        const crashAngleThresholdRad = this.PHYSICS.CRASH_ANGLE_DEG * (Math.PI / 180);

        // --- Log de débogage conditionnel (désactivé pour réduire le bruit) --- 
        // if (isCloseToSurface && !rocketModel.isDestroyed) {
        //     console.log(`isRocketLanded Check (${otherBody.label}): ` +
        //                 `Close=${isCloseToSurface}, DistToSurf=${distanceToSurface.toFixed(2)}, Speed=${speed.toFixed(2)}, ` +
        //                 `AngleDiff=${angleDiffDeg.toFixed(1)}°, AngVel=${angularVelocity.toFixed(3)}`);
        // }

        // --- Logique de décision : CRASH ou ATTERRISSAGE --- 
        // Un crash ne peut se produire que si les collisions sont activées (après le délai initial).
        const canCrash = this.collisionsEnabled;

        // 1. Vérifier les conditions de CRASH (si proche de la surface et collisions activées)
        if (isCloseToSurface && canCrash && !rocketModel.isDestroyed) {
            let crashReason = null;
            if (speed >= this.PHYSICS.CRASH_SPEED_THRESHOLD) {
                crashReason = `Vitesse trop élevée (actuelle: ${speed.toFixed(2)} m/s, max: ${this.PHYSICS.CRASH_SPEED_THRESHOLD} m/s)`;
            } else if (angleDiff > crashAngleThresholdRad) {
                crashReason = `Angle d'atterrissage incorrect (actuel: ${angleDiffDeg.toFixed(1)}°, max: ${this.PHYSICS.CRASH_ANGLE_DEG}°)`;
            } else if (angularVelocity > this.PHYSICS.CRASH_ANGULAR_VELOCITY) {
                crashReason = `Vitesse angulaire trop élevée (actuelle: ${angularVelocity.toFixed(3)} rad/s, max: ${this.PHYSICS.CRASH_ANGULAR_VELOCITY} rad/s)`;
            }

            if (crashReason) {
                console.error(`CRASH DÉTECTÉ sur ${otherBody.label}! Cause: ${crashReason}`);
                console.log(`   Détails - Vitesse: ${speed.toFixed(2)}, Angle: ${angleDiffDeg.toFixed(1)}°, Rotation: ${angularVelocity.toFixed(3)}`);
                rocketModel.landedOn = otherBody.label; // Indique le contact, même si c'est un crash.
                rocketModel.attachedTo = otherBody.label; // Similaire à landedOn pour la logique de suivi.
                
                // Appliquer des dégâts fatals SI la fusée n'est pas déjà détruite.
                let wasJustDestroyedByCrash = false;
                if (!rocketModel.isDestroyed) {
                    console.log(`[CollisionHandler.isRocketLanded] Crash détecté. Application de dégâts fatals.`);
                    wasJustDestroyedByCrash = rocketModel.applyDamage(this.ROCKET.MAX_HEALTH + 1); 
                    console.log(`[CollisionHandler.isRocketLanded] Après applyDamage (crash). wasJustDestroyedByCrash: ${wasJustDestroyedByCrash}, rocketModel.isDestroyed: ${rocketModel.isDestroyed}`);
                } else {
                    console.log(`[CollisionHandler.isRocketLanded] Crash détecté, mais la fusée était déjà détruite avant cet appel à applyDamage.`);
                }
                
                this.playCollisionSound(50); // Jouer un son de gros impact (valeur de vélocité arbitraire élevée).

                // Publier l'événement ROCKET.DESTROYED si la fusée vient d'être détruite par ce crash.
                if (wasJustDestroyedByCrash) {
                    console.log('[CollisionHandler.isRocketLanded] Fusée vient d\'être détruite par crash. Publication de ROCKET.DESTROYED via EventBus.');
                    if (this.physicsController && this.physicsController.eventBus && window.EVENTS && window.EVENTS.ROCKET && window.EVENTS.ROCKET.DESTROYED) {
                        this.physicsController.eventBus.emit(window.EVENTS.ROCKET.DESTROYED, {
                            position: { x: rocketBody.position.x, y: rocketBody.position.y }, // Utiliser la position du corps physique au moment du crash
                            velocity: { ...rocketBody.velocity }, // Utiliser la vélocité du corps physique
                            impactVelocity: speed, 
                            destroyedOn: otherBody.label
                        });
                    } else {
                        console.warn('[CollisionHandler.isRocketLanded] eventBus ou EVENTS.ROCKET.DESTROYED non disponible, impossible de publier l\'événement.');
                    }
                }
                
                // L'ancien CustomEvent ROCKET_CRASH_EXPLOSION. Peut être redondant si EventBus fonctionne.
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    console.log('[CollisionHandler.isRocketLanded] Dispatching native CustomEvent ROCKET_CRASH_EXPLOSION.');
                    window.dispatchEvent(new CustomEvent('ROCKET_CRASH_EXPLOSION', {
                        detail: {
                            x: rocketBody.position.x,
                            y: rocketBody.position.y
                        }
                    }));
                }
                // Simuler l'enfoncement de la fusée dans le sol pour un effet visuel de crash.
                // CORRECTION: Vérifier distance avant division pour éviter NaN/Infinity
                if (otherBody.position && bodyRadius !== undefined) {
                    // Vérifier que distance est valide avant toute utilisation
                    if (distance <= 0 || !isFinite(distance)) {
                        console.warn(`[CollisionHandler] Distance invalide lors du crash: ${distance} (dx=${dx}, dy=${dy})`);
                        return false; // Ne pas traiter le crash si distance invalide
                    }
                    
                    const CRASH_SINK_DEPTH = 40; // Profondeur d'enfoncement en pixels.
                    const directionX = dx / distance; // Vecteur direction normalisé.
                    const directionY = dy / distance;
                    // Nouvelle position : sur la surface moins la moitié de la hauteur de la fusée, plus la profondeur d'enfoncement.
                    const newDist = bodyRadius + (this.ROCKET.HEIGHT / 2) - CRASH_SINK_DEPTH;
                    
                    rocketModel.position.x = otherBody.position.x + directionX * newDist;
                    rocketModel.position.y = otherBody.position.y + directionY * newDist;
                    
                    // NOTE: Body.setPosition() est utilisé ici uniquement pour l'effet visuel de crash.
                    // Normalement, SynchronizationManager gère la synchronisation physique ↔ modèle.
                    // Ce cas spécial est nécessaire pour forcer la position lors d'un crash.
                    if (this.Body && rocketBody) {
                        this.Body.setPosition(rocketBody, { x: rocketModel.position.x, y: rocketModel.position.y });
                    }
                }
                return false; // CRASH a eu lieu, donc pas un atterrissage réussi.
            }
        }

        // 2. Vérifier les conditions d'ATTERRISSAGE STABLE (si proche de la surface)
        if (isCloseToSurface) {
            const isStableSpeed = speed < this.PHYSICS.LANDING_MAX_SPEED;
            const isStableAngle = angleDiff <= landingAngleThresholdRad;
            const isStableAngularVelocity = angularVelocity <= this.PHYSICS.LANDING_MAX_ANGULAR_VELOCITY;

            if (isStableSpeed && isStableAngle && isStableAngularVelocity) {
                // Toutes les conditions pour un atterrissage en douceur sont remplies.
                return true; // ATTERRISSAGE réussi.
            }
        }

        // 3. Si ni proche, ni crashé, ni atterri de manière stable : la fusée n'est pas considérée comme posée.
        return false;
    }
} 