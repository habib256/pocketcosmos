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

        // Synchronisation réactive des corps mobiles avant chaque update
        Matter.Events.on(this.engine, 'beforeUpdate', () => {
            this.syncMovingBodyPositions();
            // Ne pas forcer la synchronisation du rocketModel vers physique en vol (éviter d'écraser la stabilisation)
            const rocketModel = this.physicsController.rocketModel;
            if (rocketModel && (rocketModel.isLanded || rocketModel.isDestroyed)) {
                this.syncPhysicsWithModel(rocketModel);
            }
        });

        // Synchronisation réactive Physics → Model après chaque update
        Matter.Events.on(this.engine, 'afterUpdate', () => {
            const rocketModel = this.physicsController.rocketModel;
            if (rocketModel) {
                this.syncModelWithPhysics(rocketModel);
            }
        });

        // Détection d'atterrissage gérée périodiquement via checkRocketLandedStatusPeriodically et CollisionHandler
    }

    // Synchronise le modèle logique avec les données du corps physique
    syncModelWithPhysics(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketBody || !rocketModel || rocketModel.isDestroyed) return;

        // Diagnostic temporaire : enregistrer les changements de position
        const oldPos = { x: rocketModel.position.x, y: rocketModel.position.y };
        
        rocketModel.position.x = rocketBody.position.x;
        rocketModel.position.y = rocketBody.position.y;
        rocketModel.angle = rocketBody.angle;
        rocketModel.velocity.x = rocketBody.velocity.x;
        rocketModel.velocity.y = rocketBody.velocity.y;
        rocketModel.angularVelocity = rocketBody.angularVelocity;
        
        // Log si la position a changé de manière significative
        const posChange = Math.abs(rocketModel.position.x - oldPos.x) + Math.abs(rocketModel.position.y - oldPos.y);
        if (posChange > 0.1) {
            console.log(`🔄 SYNC Model->Physics: Position changé de ${posChange.toFixed(2)}`);
            console.log(`   Physics: x=${rocketBody.position.x.toFixed(1)}, y=${rocketBody.position.y.toFixed(1)}`);
            console.log(`   Model:   x=${rocketModel.position.x.toFixed(1)}, y=${rocketModel.position.y.toFixed(1)}`);
        }
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

    // Gère la position et l'orientation de la fusée lorsqu'elle est posée ou attachée
    handleLandedOrAttachedRocket(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        const celestialBodies = this.physicsController.celestialBodies;

        if (!rocketBody || !rocketModel) return;

        // CAS 1: Fusée posée sur un corps
        if (rocketModel.isLanded && rocketModel.landedOn) {
            const landedOnInfo = celestialBodies.find(cb => cb.model.name === rocketModel.landedOn);
            const landedOnModel = landedOnInfo ? landedOnInfo.model : null;

            if (landedOnModel) {
                const mainThrusterPower = rocketModel.thrusters.main.power;
                // Définir un seuil clair pour le décollage
                const isTryingToLiftOff = mainThrusterPower > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT;

                if (isTryingToLiftOff) {
                    // --- TENTATIVE DE DÉCOLLAGE ---
                    console.log(`[SyncManager] *** DÉCOLLAGE DÉTECTÉ *** de ${rocketModel.landedOn} (Poussée: ${mainThrusterPower.toFixed(0)}%)`);
                    rocketModel.isLanded = false;
                    rocketModel.landedOn = null;
                    rocketModel.relativePosition = null; // Important pour arrêter le suivi de position
                    
                    console.log(`[SyncManager] État après décollage - isLanded: ${rocketModel.isLanded}, landedOn: ${rocketModel.landedOn}`);
                    
                    // IMPORTANT: Sortir immédiatement pour ne pas forcer la position au sol
                    // ThrusterPhysics va gérer l'impulsion de décollage
                    return;
                } else {
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
                    const angleToBody = Math.atan2(
                        rocketBody.position.y - landedOnModel.position.y, // Utiliser la position physique pour le calcul de l'angle
                        rocketBody.position.x - landedOnModel.position.x
                    );
                    const correctAngle = angleToBody + Math.PI / 2; // Perpendiculaire à la surface
                    this.Body.setAngle(rocketBody, correctAngle);
                    // La synchro modèle se fera à la fin avec syncModelWithPhysics

                    // 3. Gérer la position (Physique)
                    if (isMobile) {
                        // Corps mobile: Suivre la position du corps parent
                        if (!rocketModel.relativePosition) {
                            // Première frame posée sur mobile OU après un recalcul: calculer relative.
                            rocketModel.updateRelativePosition(landedOnModel);
                            // console.log(`[SyncManager] Position relative sur ${landedOnModel.name} calculée/recalculée.`);
                        }
                        // Toujours mettre à jour la position absolue du MODÈLE en utilisant la position actuelle du parent
                       // console.log(`[SyncManager] Calling updateAbsolutePosition for ${rocketModel.landedOn}. Model:`, landedOnModel);
                        rocketModel.updateAbsolutePosition(landedOnModel);
                        // Forcer la position PHYSIQUE à correspondre au modèle mis à jour
                        this.Body.setPosition(rocketBody, rocketModel.position);
                        // Forcer l'angle à chaque frame
                        const angleToBody = Math.atan2(
                            rocketBody.position.y - landedOnModel.position.y,
                            rocketBody.position.x - landedOnModel.position.x
                        );
                        const correctAngle = angleToBody + Math.PI / 2;
                        this.Body.setAngle(rocketBody, correctAngle);
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
                } // Fin else (Stabilisation active)

            } else {
                 // Cas où landedOn est défini mais le corps n'est pas trouvé (ne devrait pas arriver)
                 console.warn(`Corps ${rocketModel.landedOn} non trouvé pour la stabilisation.`);
                 rocketModel.isLanded = false; // Forcer le décollage pour éviter blocage
                 rocketModel.landedOn = null;
                 rocketModel.relativePosition = null;
            }
        } // fin if(rocketModel.isLanded)

        // CAS 2: Fusée détruite et attachée (logique existante semble correcte)
        else if (rocketModel.isDestroyed && rocketModel.attachedTo) {
            const attachedToInfo = celestialBodies.find(cb => cb.model.name === rocketModel.attachedTo);
            const attachedToModel = attachedToInfo ? attachedToInfo.model : null;

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
                this.Body.setAngle(rocketBody, rocketModel.angle);

                // Les débris attachés devraient aussi suivre la vélocité du parent
                this.Body.setVelocity(rocketBody, parentVelocity);
                this.Body.setAngularVelocity(rocketBody, 0);

                 // Synchroniser le modèle une dernière fois pour être sûr
                 this.syncModelWithPhysics(rocketModel);
                 // Forcer la vélocité du modèle à correspondre à celle du parent après synchro
                 rocketModel.velocity.x = parentVelocity.x;
                 rocketModel.velocity.y = parentVelocity.y;
            } else if (attachedToModel) {
                 // Attaché à un corps statique: juste s'assurer que la physique ne bouge pas
                 this.Body.setVelocity(rocketBody, { x: 0, y: 0 });
                 this.Body.setAngularVelocity(rocketBody, 0);
                 // S'assurer que la position physique correspond au modèle (qui ne devrait pas changer)
                 this.Body.setPosition(rocketBody, rocketModel.position);
                 this.Body.setAngle(rocketBody, rocketModel.angle);
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
                // Utiliser la méthode isRocketLanded de CollisionHandler
                if (collisionHandler.isRocketLanded(rocketModel, bodyToCheck)) {
                     isNowConsideredLanded = true;
                     currentLandedOnBody = bodyToCheck.label;
                     break; // Trouvé un corps sur lequel on est posé
                }
            }
        }

        // --- MISE À JOUR DE L'ÉTAT ET ÉMISSION D'ÉVÉNEMENT ---

        if (isNowConsideredLanded) {
            // La fusée est physiquement considérée comme posée
            if (rocketModel.thrusters.main.power <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
                // Et la poussée est faible (atterrissage stable)
                
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
                    this.handleLandedOrAttachedRocket(rocketModel);
                    // Forcer les vitesses à zéro immédiatement dans le modèle aussi pour cohérence
                    // (handleLandedOrAttachedRocket devrait déjà s'en charger pour la physique et le modèle)
                    rocketModel.setVelocity(0, 0); 
                    rocketModel.setAngularVelocity(0);

                    // Émettre l'événement ROCKET_LANDED
                    this.eventBus.emit(EVENTS.ROCKET.LANDED, { landedOn: currentLandedOnBody });
                } else if (initialModelIsLanded && initialModelLandedOn === currentLandedOnBody) {
                    // On était déjà posé sur ce corps selon le modèle au début de la fonction.
                    // On s'assure juste que la stabilisation est appliquée si elle ne l'était pas.
                    // console.log(`[SyncManager] Atterrissage confirmé sur ${currentLandedOnBody}, état déjà connu.`);
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
                 // Vérifier si ce n'est pas dû à une tentative de décollage en cours (poussée faible mais pas de contact)
                 if (rocketModel.thrusters.main.power <= this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT) {
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
    
    // Méthode appelée par PhysicsController.update pour synchroniser les modèles avec la physique
    synchronizeFromPhysics() {
        const rocketModel = this.physicsController.rocketModel;
        if (rocketModel && !rocketModel.isDestroyed) {
            // Synchroniser le modèle de fusée avec la physique
            this.syncModelWithPhysics(rocketModel);
            
            // Gérer les cas spéciaux SEULEMENT si la fusée est réellement posée ou attachée
            const shouldCallHandler = (rocketModel.isLanded && rocketModel.landedOn) || (rocketModel.isDestroyed && rocketModel.attachedTo);
            
            if (shouldCallHandler) {
                // Supprimer le log excessif qui spammait la console à chaque frame
                this.handleLandedOrAttachedRocket(rocketModel);
            } else {
                // Log seulement occasionnellement pour éviter le spam
                if (Math.random() < 0.01) { // 1% de chance
                    console.log(`[SyncManager] synchronizeFromPhysics SKIP handleLandedOrAttachedRocket - isLanded: ${rocketModel.isLanded}, landedOn: ${rocketModel.landedOn}, isDestroyed: ${rocketModel.isDestroyed}, attachedTo: ${rocketModel.attachedTo}`);
                }
            }
        }
    }
} 