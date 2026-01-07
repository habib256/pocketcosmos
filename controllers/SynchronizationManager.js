class SynchronizationManager {
    constructor(physicsController, eventBus, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketBody, celestialBodies, etc.
        this.eventBus = eventBus; // Stocker l'eventBus
        this.Body = Body;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;
        this._lastLandedCheck = null;

        // Je me connecte aux events Matter.js pour rendre le manager autonome
        this.engine = this.physicsController.engine;
        this.world = this.engine.world;
        this.Events = this.physicsController.Events;

        // Synchronisation réactive des corps mobiles avant chaque update
        this.Events.on(this.engine, 'beforeUpdate', () => {
            this.syncMovingBodyPositions();
            // Ne pas forcer la synchronisation du rocketModel vers physique en vol (éviter d'écraser la stabilisation)
            const rocketModel = this.physicsController.rocketModel;
            if (!rocketModel) return;
            
            // CORRECTION: Ne pas synchroniser si:
            // 1. La fusée n'est pas atterrie (en vol)
            // 2. Le délai de grâce est actif (décollage récent)
            // 3. Le propulseur principal est actif (tentative de décollage)
            const isInGracePeriod = rocketModel._liftoffGracePeriodEnd !== null && 
                                    Date.now() < rocketModel._liftoffGracePeriodEnd;
            const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
            const isThrusterActive = main && main.maxPower > 0 && 
                                     (main.power / main.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT;
            
            // Ne synchroniser que si la fusée est vraiment posée (pas en décollage)
            if ((rocketModel.isLanded || rocketModel.isDestroyed) && !isInGracePeriod && !isThrusterActive) {
                this.syncPhysicsWithModel(rocketModel);
            } else if (isInGracePeriod || isThrusterActive) {
                // Log de debug pour tracer les cas où on évite la synchronisation
                // console.log(`[beforeUpdate] Évite sync: gracePeriod=${isInGracePeriod}, thrusterActive=${isThrusterActive}`);
            }
        });

        // Synchronisation réactive Physics → Model après chaque update (écouter l'engine, pas le world)
        this.Events.on(this.engine, 'afterUpdate', () => {
            this.syncModelWithPhysics(this.physicsController.rocketModel);
        });

        // CORRECTION: S'abonner à UNIVERSE_STATE_UPDATED pour réinitialiser les références après rechargement
        if (this.eventBus && window.EVENTS && window.EVENTS.UNIVERSE && window.EVENTS.UNIVERSE.STATE_UPDATED) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.UNIVERSE.STATE_UPDATED, () => {
                    // Les références seront automatiquement mises à jour via physicsController.celestialBodies
                    // Mais on peut forcer une réinitialisation si nécessaire
                    console.log('[SynchronizationManager] Univers mis à jour, références seront réinitialisées au prochain update');
                })
            );
        }

        // Détection d'atterrissage gérée périodiquement via checkRocketLandedStatusPeriodically et CollisionHandler
    }

    // Synchronise le modèle logique avec les données du corps physique
    syncModelWithPhysics(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketBody || !rocketModel || rocketModel.isDestroyed) return;

        rocketModel.position.x = rocketBody.position.x;
        rocketModel.position.y = rocketBody.position.y;
        rocketModel.angle = rocketBody.angle;
        rocketModel.velocity.x = rocketBody.velocity.x;
        rocketModel.velocity.y = rocketBody.velocity.y;
        rocketModel.angularVelocity = rocketBody.angularVelocity;
    }

    // Synchronise le corps physique avec les données du modèle logique
    syncPhysicsWithModel(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketBody || !rocketModel) return;

        this.Body.setPosition(rocketBody, {
            x: rocketModel.position.x,
            y: rocketModel.position.y
        });
        this.Body.setAngle(rocketBody, rocketModel.angle);
        this.Body.setVelocity(rocketBody, {
            x: rocketModel.velocity.x,
            y: rocketModel.velocity.y
        });
        this.Body.setAngularVelocity(rocketBody, rocketModel.angularVelocity);
    }

    // Met à jour la position des corps physiques (y compris ceux qui orbitent/tournent) pour correspondre à leur modèle
    syncMovingBodyPositions() {
        const celestialBodies = this.physicsController.celestialBodies; // Accès via physicsController
        for (const celestialInfo of celestialBodies) {
            // Synchroniser si le modèle et le corps physique existent et le modèle a une position
            if (celestialInfo.model && celestialInfo.model.position && celestialInfo.body) {
                // La mise à jour de la position du *modèle* (ex: celestialInfo.model.updateMoon(deltaTime))
                // est supposée avoir été faite ailleurs (dans GameController ou UniverseModel)

                // Mettre à jour la position du corps physique pour correspondre au modèle
                this.Body.setPosition(celestialInfo.body, {
                    x: celestialInfo.model.position.x,
                    y: celestialInfo.model.position.y
                });
                
                // Optionnel: Synchroniser l'angle si le modèle en a un (pour rotation)
                if (typeof celestialInfo.model.angle === 'number') {
                    this.Body.setAngle(celestialInfo.body, celestialInfo.model.angle);
                }
                
                // Optionnel: Synchroniser la vitesse si elle est calculée dans le modèle
                // if (celestialInfo.model.velocity) {
                //     this.Body.setVelocity(celestialInfo.body, celestialInfo.model.velocity);
                // }
            }
        }
    }

    /**
     * Calcule l'angle correct pour aligner un objet perpendiculairement à la surface d'un corps céleste.
     * @param {Matter.Body} rocketBody - Le corps physique de la fusée/débris
     * @param {object} celestialBodyModel - Le modèle du corps céleste
     * @returns {number} L'angle correct en radians
     * @private
     */
    _calculateCorrectAngleToBody(rocketBody, celestialBodyModel) {
        const angleToBody = Math.atan2(
            rocketBody.position.y - celestialBodyModel.position.y,
            rocketBody.position.x - celestialBodyModel.position.x
        );
        return angleToBody + Math.PI / 2; // Perpendiculaire à la surface
    }

    // Gère la position et l'orientation de la fusée lorsqu'elle est posée ou attachée
    handleLandedOrAttachedRocket(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        const celestialBodies = this.physicsController.celestialBodies;

        if (!rocketBody || !rocketModel) return;

        // IMPORTANT: Vérifier d'abord si la fusée essaie de décoller AVANT de vérifier isLanded
        // Cela évite que la stabilisation ne s'applique même si isLanded est encore true
        const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
        if (main && main.maxPower > 0) {
            const mainThrusterPercent = (main.power / main.maxPower) * 100;
            // Log de diagnostic: tracer le pourcentage de poussée à chaque frame
            // Log de diagnostic désactivé (trop verbeux - 60 fois/seconde)
            // if (mainThrusterPercent > 0) {
            //     console.log(`[DECOLLAGE] Frame: poussée=${mainThrusterPercent.toFixed(1)}%, seuil=${this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT}%, isLanded=${rocketModel.isLanded}, power=${main.power}, maxPower=${main.maxPower}`);
            // }
                if (mainThrusterPercent > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
                // La fusée essaie activement de décoller, forcer isLanded à false et retourner
                if (rocketModel.isLanded) {
                    console.log(`[DECOLLAGE] Détection précoce: poussée=${mainThrusterPercent.toFixed(1)}%, forçant isLanded=false`);
                    // IMPORTANT: Sauvegarder landedOn AVANT de le mettre à null pour le repositionnement
                    const savedLandedOn = rocketModel.landedOn;
                    rocketModel.isLanded = false;
                    rocketModel.landedOn = null;
                    rocketModel.relativePosition = null;
                    // Démarrer le délai de grâce pour empêcher isLanded d'être remis à true trop vite
                    rocketModel.startLiftoffGracePeriod(500);
                    // Appeler handleLiftoff pour l'impulsion, en passant le nom du corps sauvegardé
                    if (this.physicsController && this.physicsController.thrusterPhysics && this.physicsController.rocketBody) {
                        this.physicsController.thrusterPhysics.handleLiftoff(rocketModel, this.physicsController.rocketBody, savedLandedOn);
                    }
                }
                return; // Ne pas appliquer la stabilisation si on essaie de décoller
            }
        }

        // CAS 1: Fusée posée sur un corps
        if (rocketModel.isLanded && rocketModel.landedOn) {
            // CORRECTION: Vérifier que model existe avant d'accéder à model.name
            const landedOnInfo = celestialBodies.find(cb => cb.model && cb.model.name === rocketModel.landedOn);
            const landedOnModel = landedOnInfo && landedOnInfo.model ? landedOnInfo.model : null;

            if (landedOnModel) {
                // NOTE: La vérification de décollage est déjà faite au début de la fonction
                // Si on arrive ici, c'est que la fusée n'essaie PAS de décoller (ou n'a pas de propulseur)
                // On peut donc appliquer la stabilisation en toute sécurité
                    // --- STABILISATION ACTIVE (Pas de tentative de décollage) ---
                    // Détecter si le corps est mobile (orbite)
                    const isMobile = landedOnModel.parentBody !== null;
                    const parentVelocity = isMobile ? landedOnModel.velocity : { x: 0, y: 0 }; // Obtenir la vélocité du corps parent (ou zéro si statique)

                    // 1. Forcer les vitesses (Physique)
                    // Faire suivre la vélocité du corps parent pour les corps mobiles
                    this.Body.setVelocity(rocketBody, parentVelocity);
                    this.Body.setAngularVelocity(rocketBody, 0);

                    // 2. Calculer et forcer l'angle correct par rapport à la surface (Physique ET Modèle)
                    //    Utiliser la position PHYSIQUE actuelle pour le calcul de l'angle, car c'est elle qu'on stabilise.
                    const correctAngle = this._calculateCorrectAngleToBody(rocketBody, landedOnModel);
                    this.Body.setAngle(rocketBody, correctAngle);
                    // La synchro modèle se fera à la fin avec syncModelWithPhysics

                    // 3. Gérer la position (Physique)
                    if (isMobile) {
                        // Corps mobile: Suivre la position du corps parent
                        if (!rocketModel.relativePosition) {
                            // Première frame posée sur mobile OU après un recalcul: calculer relative.
                            rocketModel.updateRelativePosition(landedOnModel);
                            console.log(`[SyncManager] Position relative sur ${landedOnModel.name} calculée/recalculée.`);
                        }
                        // Toujours mettre à jour la position absolue du MODÈLE en utilisant la position actuelle du parent
                       // console.log(`[SyncManager] Calling updateAbsolutePosition for ${rocketModel.landedOn}. Model:`, landedOnModel);
                        rocketModel.updateAbsolutePosition(landedOnModel);
                        // Forcer la position PHYSIQUE à correspondre au modèle mis à jour
                        this.Body.setPosition(rocketBody, rocketModel.position);
                        // Forcer l'angle à chaque frame
                        const correctAngleMobile = this._calculateCorrectAngleToBody(rocketBody, landedOnModel);
                        this.Body.setAngle(rocketBody, correctAngleMobile);
                        // Forcer la vélocité à chaque frame
                        this.Body.setVelocity(rocketBody, parentVelocity);
                        this.Body.setAngularVelocity(rocketBody, 0);
                        // Log de debug si la position relative est absente
                        if (!rocketModel.relativePosition) {
                            console.warn(`[SyncManager] Attention: relativePosition absente pour ${rocketModel.landedOn}`);
                        }
                    } else {
                        // Corps statique (ex: Soleil ou si Terre est statique): Maintenir la position où l'atterrissage s'est produit.
                        // La position physique ne devrait pas changer si les vitesses sont nulles.
                        // Pas besoin de forcer la position physique, la vélocité nulle suffit.
                        if (!rocketModel.relativePosition) {
                           // Stocker la position absolue au moment de l'atterrissage si nécessaire
                           rocketModel.updateRelativePosition(landedOnModel);
                        }
                    }
                    // Synchroniser le modèle avec l'état physique stabilisé (position, angle, vélocité du parent)
                    this.syncModelWithPhysics(rocketModel);
                    // Forcer la vélocité du modèle à correspondre à celle du parent après synchro
                    // pour garantir qu'elle reflète le mouvement orbital.
                    rocketModel.velocity.x = parentVelocity.x;
                    rocketModel.velocity.y = parentVelocity.y;
            } else {
                 // CORRECTION: Cas où landedOn est défini mais le corps n'est pas trouvé ou modèle absent
                 if (landedOnInfo && !landedOnInfo.model) {
                     console.warn(`[SynchronizationManager] Corps ${rocketModel.landedOn} trouvé mais modèle absent`);
                 } else {
                     console.warn(`[SynchronizationManager] Corps ${rocketModel.landedOn} non trouvé pour la stabilisation.`);
                 }
                 rocketModel.isLanded = false; // Forcer le décollage pour éviter blocage
                 rocketModel.landedOn = null;
                 rocketModel.relativePosition = null;
            }
        } // fin if(rocketModel.isLanded)

        // CAS 2: Fusée détruite et attachée (logique existante semble correcte)
        if (rocketModel.isDestroyed && rocketModel.attachedTo) {
            // CORRECTION: Vérifier que model existe avant d'accéder à model.name
            const attachedToInfo = celestialBodies.find(cb => cb.model && cb.model.name === rocketModel.attachedTo);
            const attachedToModel = attachedToInfo && attachedToInfo.model ? attachedToInfo.model : null;

            // Vérifier si le corps est mobile (orbite) - Correction du test ici
            const isAttachedToMobile = attachedToModel && attachedToModel.parentBody !== null;
            const parentVelocity = isAttachedToMobile ? attachedToModel.velocity : { x: 0, y: 0 };

            if (isAttachedToMobile) {
                // Calculer la position relative si pas encore fait
                if (!rocketModel.relativePosition) {
                    // Utiliser l'angle actuel des débris pour calculer la position relative initiale
                    rocketModel.updateRelativePosition(attachedToModel);
                    console.log(`Position relative initiale des débris sur ${rocketModel.attachedTo} calculée.`);
                }

                // Mettre à jour la position absolue des débris
                rocketModel.updateAbsolutePosition(attachedToModel);

                // Mettre à jour la position ET l'angle du corps physique des débris
                this.Body.setPosition(rocketBody, rocketModel.position);
                // Aligner l'angle perpendiculairement à la surface du corps
                const correctDebrisAngle = this._calculateCorrectAngleToBody(rocketBody, attachedToModel);
                this.Body.setAngle(rocketBody, correctDebrisAngle);

                // Les débris attachés devraient aussi suivre la vélocité du parent
                this.Body.setVelocity(rocketBody, parentVelocity);
                this.Body.setAngularVelocity(rocketBody, 0);

                 // Synchroniser le modèle une dernière fois pour être sûr
                 this.syncModelWithPhysics(rocketModel);
                 // Forcer la vélocité du modèle à correspondre à celle du parent après synchro
                 rocketModel.velocity.x = parentVelocity.x;
                 rocketModel.velocity.y = parentVelocity.y;
            } else if (attachedToModel) {
                 // Attaché à un corps statique: s'assurer que la physique ne bouge pas
                 this.Body.setVelocity(rocketBody, { x: 0, y: 0 });
                 this.Body.setAngularVelocity(rocketBody, 0);
                 // S'assurer que la position physique correspond au modèle (qui ne devrait pas changer)
                 this.Body.setPosition(rocketBody, rocketModel.position);
                 // Aligner l'angle perpendiculairement à la surface
                 const correctStaticDebrisAngle = this._calculateCorrectAngleToBody(rocketBody, attachedToModel);
                 this.Body.setAngle(rocketBody, correctStaticDebrisAngle);
            }
        } // fin if(rocketModel.isDestroyed)
    }

    // Vérifier périodiquement l'état d'atterrissage de la fusée
    checkRocketLandedStatusPeriodically(rocketModel, universeModel) {
        // Ne vérifier que toutes les ~100ms et si la fusée n'est pas détruite
        // Augmenter légèrement le délai pour éviter les vérifications trop fréquentes
        if (rocketModel.isDestroyed || (this._lastLandedCheck && Date.now() - this._lastLandedCheck < 150)) {
            return;
        }
        this._lastLandedCheck = Date.now();

        const rocketBody = this.physicsController.rocketBody;
        const collisionHandler = this.physicsController.collisionHandler; // Besoin pour isRocketLanded
        if (!rocketBody || !collisionHandler || !universeModel || !universeModel.celestialBodies) return;

        // Sauvegarder l'état initial du modèle pour cette vérification
        const initialModelIsLanded = rocketModel.isLanded;
        const initialModelLandedOn = rocketModel.landedOn;

        let isNowConsideredLanded = false;
        let currentLandedOnBody = null;

        for (const bodyModel of universeModel.celestialBodies) {
            // Créer un objet simulé pour isRocketLanded
            const bodyToCheck = {
                 position: bodyModel.position,
                 radius: bodyModel.radius,
                 label: bodyModel.name,
                 circleRadius: bodyModel.radius // Simuler pour la fonction
            };

            // Calculer la distance pour un test rapide
            const dx = bodyToCheck.position.x - rocketModel.position.x; // Utiliser la position du modèle de fusée ici
            const dy = bodyToCheck.position.y - rocketModel.position.y;
            const distanceSquared = dx * dx + dy * dy;
            const checkRadius = bodyToCheck.radius + this.ROCKET.HEIGHT * 1.5; // Marge suffisante
            const maxDistanceCheckSq = checkRadius * checkRadius;

            if (distanceSquared <= maxDistanceCheckSq) {
                // IMPORTANT: Vérifier d'abord si la fusée essaie de décoller avant d'appeler isRocketLanded
                // Cela évite que isRocketLanded retourne true à cause de isLanded=true même si on essaie de décoller
                const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
                const isTryingToLiftOff = main && main.maxPower > 0 
                    ? (main.power / main.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT
                    : false;
                
                // Si la fusée essaie de décoller, ne pas considérer qu'elle est atterrie
                if (!isTryingToLiftOff) {
                    // Utiliser la méthode isRocketLanded de CollisionHandler
                    if (collisionHandler.isRocketLanded(rocketModel, bodyToCheck)) {
                         isNowConsideredLanded = true;
                         currentLandedOnBody = bodyToCheck.label;
                         break; // Trouvé un corps sur lequel on est posé
                    }
                }
            }
        }

        // --- MISE À JOUR DE L'ÉTAT ET ÉMISSION D'ÉVÉNEMENT ---

        if (isNowConsideredLanded) {
            // La fusée est physiquement considérée comme posée
            // CORRECTION: Protéger contre division par zéro
            // Comparer en pourcentage réel de la poussée principale
            const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
            if (!main) {
                return; // Pas de propulseur principal, ne pas traiter
            }
            const mainThrusterPercent = main.maxPower > 0 
                ? (main.power / main.maxPower) * 100 
                : 0;
            
            // IMPORTANT: Ne pas remettre isLanded à true si la fusée essaie activement de décoller
            // Cela empêche le conflit avec handleLiftoff
            if (mainThrusterPercent <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
                // Et la poussée est faible (atterrissage stable)
                
                // Vérifier le délai de grâce avant de mettre isLanded à true
                if (!rocketModel.canSetLanded()) {
                    console.log(`[SyncManager] Atterrissage détecté sur ${currentLandedOnBody} mais délai de grâce actif, ignoré`);
                    return;
                }
                
                // Mettre à jour le modèle de manière cohérente
                rocketModel.isLanded = true;
                rocketModel.landedOn = currentLandedOnBody;
                // rocketModel.relativePosition = null; // Sera recalculé dans handleLandedOrAttachedRocket si besoin

                // Si c'est un NOUVEL atterrissage (on n'était pas posé, ou sur un autre corps)
                // OU si le modèle a été mis à jour par CollisionHandler mais que l'événement n'a pas encore été envoyé pour CET atterrissage
                if (!initialModelIsLanded || initialModelLandedOn !== currentLandedOnBody) {
                    console.log(`État d'atterrissage DÉTECTÉ et CONFIRMÉ (périodique) sur ${currentLandedOnBody}.`);
                    // Appeler handleLandedOrAttachedRocket pour appliquer la stabilisation immédiatement
                    // et recalculer relativePosition si nécessaire.
                    // NOTE: handleLandedOrAttachedRocket vérifiera si la fusée essaie de décoller et retournera immédiatement
                    this.handleLandedOrAttachedRocket(rocketModel);
                    // Vérifier à nouveau isLanded après handleLandedOrAttachedRocket (il peut avoir changé si décollage détecté)
                    if (rocketModel.isLanded) {
                        // Forcer les vitesses à zéro immédiatement dans le modèle aussi pour cohérence
                        // (handleLandedOrAttachedRocket devrait déjà s'en charger pour la physique et le modèle)
                        rocketModel.setVelocity(0, 0); 
                        rocketModel.setAngularVelocity(0);

                        // Émettre l'événement ROCKET_LANDED
                        this.eventBus.emit(EVENTS.ROCKET.LANDED, { landedOn: currentLandedOnBody });
                    }
                } else if (initialModelIsLanded && initialModelLandedOn === currentLandedOnBody) {
                    // On était déjà posé sur ce corps selon le modèle au début de la fonction.
                    // On s'assure juste que la stabilisation est appliquée si elle ne l'était pas.
                    // NOTE: handleLandedOrAttachedRocket vérifiera si la fusée essaie de décoller et retournera immédiatement
                    this.handleLandedOrAttachedRocket(rocketModel);
                }
            } else {
                // Poussée active : atterrissage non stable, ne pas traiter comme un atterrissage finalisé.
                // console.log(`[SyncManager] Détection d'atterrissage sur ${currentLandedOnBody} ignorée (poussée principale active: ${rocketModel.thrusters.main.power}%).`);
                // Si on était précédemment considéré comme posé (initialModelIsLanded), et que la poussée est forte,
                // cela a déjà été géré par handleLandedOrAttachedRocket qui met isLanded à false.
            }
        } else {
            // Pas considéré comme posé actuellement par la vérification physique.
            if (initialModelIsLanded) { // Si le modèle disait qu'on était posé au début de cette fonction
                 // CORRECTION: Protéger contre division par zéro
                 // Vérifier si ce n'est pas dû à une tentative de décollage en cours (poussée faible mais pas de contact)
                 const mainThrusterPercent = rocketModel.thrusters.main.maxPower > 0 
                     ? (rocketModel.thrusters.main.power / rocketModel.thrusters.main.maxPower) * 100 
                     : 0;
                 if (mainThrusterPercent <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
                     console.log(`État de décollage confirmé (périodique) de ${initialModelLandedOn} (plus de contact détecté).`);
                     rocketModel.isLanded = false;
                     rocketModel.landedOn = null;
                     rocketModel.relativePosition = null;
                 } else {
                     // Décollage actif (géré par handleLandedOrAttachedRocket et la logique de poussée).
                     // Ne rien faire ici pour éviter les conflits.
                 }
            }
            // Si on n'était pas posé (initialModelIsLanded = false) et la vérification confirme (isNowConsideredLanded = false), ne rien faire.
        }
    }
} 