// import missionManager from './MissionManager.js'; // Supprimer cette ligne

class GameController {
    constructor(eventBus, missionManager) {
        // EventBus
        this.eventBus = eventBus;
        this.missionManager = missionManager; // Utilise la variable passée en argument
        
        // Modèles - Seront initialisés par GameSetupController
        this.rocketModel = null;
        this.universeModel = null;
        this.particleSystemModel = null;
        this.cameraModel = new CameraModel(); // CameraModel est créé ici et passé à GameSetupController
        
        // Vues - Seront initialisées par GameSetupController
        this.rocketView = null;
        this.universeView = null;
        this.particleView = null;
        this.celestialBodyView = null;
        this.traceView = null;
        this.uiView = null;
        
        // Contrôleurs Externes (fournis via setControllers)
        this.inputController = null;
        this.renderingController = null;
        this.rocketAgent = null; // Peut être fourni ou créé par GameSetupController
        
        // Contrôleurs Internes (créés par GameSetupController)
        this.physicsController = null;
        this.particleController = null;
        this.rocketController = null;
        
        // État du jeu
        this.isRunning = false;
        this.isPaused = false;
        this.lastTimestamp = 0;
        this.elapsedTime = 0;
        
        // Canvas et contexte (supprimés, car gérés par RenderingController)
        
        // Variables pour le glisser-déposer
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartRocketX = 0;
        this.dragStartRocketY = 0;

        // Crédits gagnés - Initialiser à 10 (ou valeur par défaut au reset)
        this.totalCreditsEarned = 10;

        // Initialiser la caméra - FAIT CI-DESSUS
        
        // Timer pour réinitialisation auto après crash
        this.crashResetTimer = null;
        
        // Ajout : Flag pour indiquer si une mission vient d'être réussie
        this.missionJustSucceededFlag = false;

        // S'abonner aux événements
        this.subscribeToEvents();

        // Ajout : pause automatique si l'utilisateur quitte l'onglet
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (!this.isPaused) { // Agir seulement si pas déjà en pause
                    this.isPaused = true;
                    console.log('[AUTO-PAUSE] Jeu mis en pause car l\'onglet n\'est plus actif (via visibilitychange).');
                    // Émettre l'événement seulement si le jeu est déjà en cours d'exécution.
                    // Si le jeu n'a pas encore démarré (this.isRunning est false), la méthode start()
                    // se chargera d'émettre GAME_PAUSED si this.isPaused est vrai.
                    if (this.isRunning) {
                        this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
                    }
                }
            } else {
                // Optionnel : gérer la reprise automatique si l'onglet redevient actif.
                // Pour l'instant, la reprise est manuelle.
            }
        });

        this.pauseKeyDown = false;

        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('ROCKET_CRASH_EXPLOSION', (e) => {
                if (this.particleController && e.detail) {
                    // Explosion massive : beaucoup de particules, couleurs vives, grande taille
                    this.particleController.createExplosion(
                        e.detail.x,
                        e.detail.y,
                        120, // nombre de particules
                        8,   // vitesse
                        10,  // taille
                        2.5, // durée de vie (secondes)
                        '#FFDD00', // couleur début (jaune vif)
                        '#FF3300'  // couleur fin (rouge/orange)
                    );
                }
            });

            // --- Effet Mission Réussie (particules texte) ---
            window.addEventListener('MISSION_SUCCESS_PARTICLES', (e) => {
                // Effet désactivé
            });
        }

        this._lastRocketDestroyed = false;
    }
    
    // S'abonner aux événements de l'EventBus
    subscribeToEvents() {
        // Événements sémantiques pour les actions de la fusée - GÉRÉS PAR RocketController
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => this.handleResetRocket()));

        // NOUVEL ÉVÉNEMENT pour mettre à jour l'état global lorsque RocketController modifie la fusée
        const ROCKET_INTERNAL_STATE_CHANGED_EVENT = 'rocket:internalStateChanged'; // Doit correspondre à celui dans RocketController
        window.controllerContainer.track(this.eventBus.subscribe(ROCKET_INTERNAL_STATE_CHANGED_EVENT, () => this.emitUpdatedStates()));

        // Événements sémantiques pour la caméra
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_IN, () => this.handleZoomIn()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_OUT, () => this.handleZoomOut()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.CENTER_ON_ROCKET, () => this.handleCenterCamera()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.START_DRAG, (data) => this.handleCameraStartDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.DRAG, (data) => this.handleCameraDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.STOP_DRAG, () => this.handleCameraStopDrag()));


        // Événements sémantiques pour le jeu et l'UI
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.TOGGLE_PAUSE, () => this.handleTogglePause()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.RESUME_IF_PAUSED, () => this.handleResumeIfPaused()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.UI.TOGGLE_ASSISTED_CONTROLS, () => this.handleToggleAssistedControlsFromUI()));

        // Événements pour les vecteurs et autres affichages
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_VECTORS, () => this.toggleVectors()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD, () => this.toggleGravityField()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_TRACES, () => this.toggleTraceVisibility()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.PHYSICS.TOGGLE_FORCES, () => this.handleToggleForces()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.INCREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(2.0)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.DECREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(0.5)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.AI.TOGGLE_CONTROL, () => this.toggleAIControl()));
        
        // Événement pour les mises à jour d'état de la fusée
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.STATE_UPDATED, (data) => this.handleRocketStateUpdated(data)));
        // Événement lorsque la fusée atterrit
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.LANDED, (data) => this.handleRocketLanded(data)));

        // --- Abonnements Joystick ---
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_CHANGED, (data) => this.handleJoystickAxisChanged(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_HELD, (data) => this.handleJoystickAxisHeld(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_RELEASED, (data) => this.handleJoystickAxisReleased(data)));

        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.GAMEPAD_CONNECTED, () => { /* On pourrait afficher un message */ }));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.GAMEPAD_DISCONNECTED, () => { /* On pourrait afficher un message */ }));
        // --- Fin Abonnements Joystick ---

        // S'abonner à l'événement de redimensionnement du canvas
        const canvasResizedEventName = (window.EVENTS && window.EVENTS.SYSTEM && window.EVENTS.SYSTEM.CANVAS_RESIZED)
            ? window.EVENTS.SYSTEM.CANVAS_RESIZED 
            : (window.EVENTS && window.EVENTS.RENDER && window.EVENTS.RENDER.CANVAS_RESIZED)
              ? window.EVENTS.RENDER.CANVAS_RESIZED
              : null;

        if (canvasResizedEventName) {
            window.controllerContainer.track(
                this.eventBus.subscribe(canvasResizedEventName, (data) => this.handleCanvasResized(data))
            );
        } else {
            console.warn("EVENTS.SYSTEM.CANVAS_RESIZED ou EVENTS.RENDER.CANVAS_RESIZED n'est pas défini. GameController ne s'abonnera pas à l'événement de redimensionnement du canvas.");
        }
    }
    
    // Gérer les événements d'entrée sémantiques
    // LES GESTIONNAIRES POUR THRUST/ROTATE SONT DANS RocketController.js

    handleZoomIn() {
        if (this.isPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
        this.emitUpdatedStates();
    }

    handleZoomOut() {
        if (this.isPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED));
        this.emitUpdatedStates();
    }
    
    handleTogglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
        } else {
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }

    handleResumeIfPaused() {
        if (this.isPaused) {
            this.isPaused = false;
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }
    
    handleResetRocket() {
        this.resetRocket();
    }

    handleCenterCamera() {
        if (this.isPaused) return;
        if (this.cameraModel && this.rocketModel) {
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
        }
    }

    handleToggleForces() {
        if (this.isPaused) return;
        if (this.physicsController) {
            this.physicsController.toggleForceVectors();
        }
    }

    // GESTION SOURIS (via événements sémantiques)
    handleCameraStartDrag(data) {
        if (this.isPaused) return;
        
        this.isDragging = true;
        this.dragStartX = data.x;
        this.dragStartY = data.y;
        
        if (this.cameraModel) {
            this.dragStartCameraX = this.cameraModel.x;
            this.dragStartCameraY = this.cameraModel.y;
        }
    }
    
    handleCameraDrag(data) {
        if (!this.isDragging || this.isPaused) return;
        
        const dx = (data.x - this.dragStartX) / this.cameraModel.zoom;
        const dy = (data.y - this.dragStartY) / this.cameraModel.zoom;
        
        if (this.cameraModel) {
            this.cameraModel.setPosition(
                this.dragStartCameraX - dx,
                this.dragStartCameraY - dy
            );
        }
    }
    
    handleCameraStopDrag() {
        this.isDragging = false;
    }

    handleToggleAssistedControlsFromUI() {
         this.toggleAssistedControls();
    }
    
    // Émettre un seul événement pour l'état complet de la simulation
    emitUpdatedStates() {
        const gravityVector = this.calculateGravityVector();
        const thrustVectors = this.calculateThrustVectors();
        const totalThrustVector = this.calculateTotalThrustVector();
        
        const lunarAttraction = this.calculateLunarAttractionVector();
        const earthAttraction = this.calculateEarthAttractionVector();

        let calculatedAccelerationX = 0;
        let calculatedAccelerationY = 0;

        if (gravityVector) {
            calculatedAccelerationX += gravityVector.x;
            calculatedAccelerationY += gravityVector.y;
        }

        if (totalThrustVector && this.rocketModel && this.rocketModel.mass > 0) {
            calculatedAccelerationX += totalThrustVector.x / this.rocketModel.mass;
            calculatedAccelerationY += totalThrustVector.y / this.rocketModel.mass;
        }
        
        const accelerationVector = { x: calculatedAccelerationX, y: calculatedAccelerationY };

        const rocketStateForEvent = this.rocketModel ? {
            ...this.rocketModel,
            gravityVector: gravityVector,
            thrustVectors: thrustVectors,
            totalThrustVector: totalThrustVector,
            accelerationVector: accelerationVector,
            lunarAttraction: lunarAttraction,
            earthAttraction: earthAttraction
        } : { 
            position: { x: 0, y: 0 }, angle: 0, velocity: { x: 0, y: 0 }, mass: 0,
            thrusters: {}, fuel: 0, health: 0, isLanded: false, isDestroyed: true,
            gravityVector: null, thrustVectors: null, totalThrustVector: null,
            accelerationVector: { x: 0, y: 0 }, lunarAttraction: null, earthAttraction: null
        };

        const simulationState = {
            rocket: rocketStateForEvent,
            universe: this.universeModel,
            particles: this.particleSystemModel,
            camera: this.cameraModel,
            missions: this.missionManager ? this.missionManager.getActiveMissions() : [],
            totalCredits: this.totalCreditsEarned,
            missionJustSucceeded: this.missionJustSucceededFlag
        };
        
        this.eventBus.emit(EVENTS.SIMULATION.UPDATED, simulationState);
        
        if (this.missionJustSucceededFlag) {
            this.missionJustSucceededFlag = false;
        }
    }
    
    calculateGravityVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        let totalGravityX = 0;
        let totalGravityY = 0;
        
        for (const body of this.universeModel.celestialBodies) {
            const dx = body.position.x - this.rocketModel.position.x;
            const dy = body.position.y - this.rocketModel.position.y;
            const distanceSquared = dx * dx + dy * dy;
            const distance = Math.sqrt(distanceSquared);
            
            const forceMagnitude = PHYSICS.G * body.mass * this.rocketModel.mass / distanceSquared;
            
            const forceX = forceMagnitude * (dx / distance);
            const forceY = forceMagnitude * (dy / distance);
            
            totalGravityX += forceX / this.rocketModel.mass;
            totalGravityY += forceY / this.rocketModel.mass;
        }
        
        return { x: totalGravityX, y: totalGravityY };
    }
    
    calculateThrustVectors() {
        if (!this.rocketModel) return null;
        
        const thrustVectors = {};
        
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            if (thruster.power > 0) {
                if (thrusterName === 'left' || thrusterName === 'right') {
                    continue;
                }
                let thrustAngle = 0;
                let thrustMagnitude = 0;
                
                switch (thrusterName) {
                    case 'main':
                        thrustAngle = this.rocketModel.angle + Math.PI/2;
                        thrustMagnitude = PHYSICS.MAIN_THRUST * (thruster.power / thruster.maxPower);
                        break;
                    case 'rear':
                        thrustAngle = this.rocketModel.angle - Math.PI/2;
                        thrustMagnitude = PHYSICS.REAR_THRUST * (thruster.power / thruster.maxPower);
                        break;
                }
                
                thrustVectors[thrusterName] = {
                    position: { 
                        x: thruster.position.x, 
                        y: thruster.position.y 
                    },
                    x: -Math.cos(thrustAngle),
                    y: -Math.sin(thrustAngle),
                    magnitude: thrustMagnitude
                };
            }
        }
        
        return thrustVectors;
    }
    
    calculateTotalThrustVector() {
        if (!this.rocketModel) return null;
        
        let totalX = 0;
        let totalY = 0;
        
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            if (thruster.power > 0) {
                const position = ROCKET.THRUSTER_POSITIONS[thrusterName.toUpperCase()];
                if (!position) continue;
                
                let thrustAngle;
                
                if (thrusterName === 'left' || thrusterName === 'right') {
                    const propAngle = Math.atan2(position.distance * Math.sin(position.angle), 
                                               position.distance * Math.cos(position.angle));
                    const perpDirection = thrusterName === 'left' ? Math.PI/2 : -Math.PI/2;
                    thrustAngle = this.rocketModel.angle + propAngle + perpDirection;
                } else {
                    switch (thrusterName) {
                        case 'main': 
                            thrustAngle = this.rocketModel.angle - Math.PI/2;
                            break;
                        case 'rear':
                            thrustAngle = this.rocketModel.angle + Math.PI/2;
                            break;
                        default:
                            thrustAngle = this.rocketModel.angle;
                    }
                }
                
                let thrustForce;
                switch (thrusterName) {
                    case 'main': 
                        thrustForce = ROCKET.MAIN_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    case 'rear': 
                        thrustForce = ROCKET.REAR_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    case 'left':
                    case 'right': 
                        thrustForce = ROCKET.LATERAL_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    default:
                        thrustForce = 0;
                }
                
                totalX += Math.cos(thrustAngle) * thrustForce;
                totalY += Math.sin(thrustAngle) * thrustForce;
            }
        }
        
        if (Math.abs(totalX) < 0.001 && Math.abs(totalY) < 0.001) {
            return null;
        }
        
        return { x: totalX, y: totalY };
    }
    
    init() {
        const gameSetupController = new GameSetupController(
            this.eventBus,
            this.missionManager,
            {
                renderingController: this.renderingController,
                rocketAgent: this.rocketAgent
            }
        );

        const components = gameSetupController.initializeGameComponents(this.cameraModel);

        this.rocketModel = components.rocketModel;
        this.universeModel = components.universeModel;
        this.particleSystemModel = components.particleSystemModel;

        this.rocketView = components.rocketView;
        this.universeView = components.universeView;
        this.celestialBodyView = components.celestialBodyView;
        this.particleView = components.particleView;
        this.traceView = components.traceView;
        this.uiView = components.uiView;

        this.physicsController = components.physicsController;
        this.particleController = components.particleController;
        this.rocketController = components.rocketController;
        this.rocketAgent = components.rocketAgent;
        
        this.resetRocket();
        
        this.start();
        
        console.log("GameController initialisé (via GameSetupController) et boucle démarrée.");
    }
    
    setControllers(controllers) {
        if (controllers.inputController) {
            this.inputController = controllers.inputController;
        }
        if (controllers.renderingController) {
            this.renderingController = controllers.renderingController;
        }
        if (controllers.rocketAgent) {
            this.rocketAgent = controllers.rocketAgent;
        }
    }
    
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastTimestamp = performance.now();
            
            if (this.isPaused) {
                this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
            }

            requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
            console.log("GameController started.");
        }
    }
    
    togglePause() { // Ce togglePause est appelé par l'événement, conservez-le
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
        } else {
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }
    
    gameLoop(timestamp) {
        if (!this.isRunning) return;

        const deltaTime = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        this.elapsedTime += deltaTime;

        if (!this.isPaused) {
            this.update(deltaTime);
        }

        const activeMissionsForRender = this.missionManager ? this.missionManager.getActiveMissions() : [];
        // const totalAccelerationForRender = this.physicsController && this.physicsController.physicsVectors 
        //     ? this.physicsController.physicsVectors.getTotalAcceleration() 
        //     : null; // Semble inutilisé par renderingController.render
        
        this.renderingController.render(
            this.elapsedTime,
            this.rocketModel,
            this.universeModel,
            this.particleSystemModel,
            this.cameraModel,
            activeMissionsForRender,
            this.totalCreditsEarned,
            this.missionJustSucceededFlag
        );

        if (this.missionJustSucceededFlag) {
            this.missionJustSucceededFlag = false;
        }

        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    resetRocket() {
        let startLocation = 'Terre';
        
        if (this.crashResetTimer) {
            clearTimeout(this.crashResetTimer);
            this.crashResetTimer = null;
        }
        
        if (!this.rocketModel) {
            // Ceci ne devrait plus arriver car GameSetupController initialise les modèles
            console.error("GameController.resetRocket: rocketModel n'est pas initialisé avant reset.");
            const gameSetupController = new GameSetupController(this.eventBus, this.missionManager, {});
            const components = gameSetupController.initializeGameComponents(this.cameraModel); // Tenter une réinitialisation
            this.rocketModel = components.rocketModel;
            this.universeModel = components.universeModel; // S'assurer que universeModel est aussi prêt
            if (!this.rocketModel) return; // Si toujours pas de rocketModel, abandonner
        }
        
        this.rocketModel.reset();
        this.rocketModel.cargo = new RocketCargo(); 
        this.totalCreditsEarned = 10;

        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (earth) {
            const angleVersSoleil = Math.atan2(earth.position.y - this.universeModel.celestialBodies[0].position.y, 
                                             earth.position.x - this.universeModel.celestialBodies[0].position.x);
            const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
            const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
            this.rocketModel.setPosition(rocketStartX, rocketStartY);
            this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
            this.rocketModel.setAngle(angleVersSoleil); 
            this.rocketModel.isLanded = true;
            this.rocketModel.landedOn = 'Terre';

            if (this.cameraModel) {
                this.cameraModel.setPosition(rocketStartX, rocketStartY);
            }
        } else {
            console.error("Impossible de trouver la Terre pour repositionner la fusée.");
            startLocation = null;
        }

        if (this.particleController) {
            this.particleController.reset(); 
        }

        if (this.physicsController) {
            this.physicsController.resetPhysics(this.rocketModel, this.universeModel);
        }

        this.lastTimestamp = performance.now();
        this.elapsedTime = 0;
        this.isPaused = false; // Le jeu reprend après un reset

        if (this.traceView) {
            this.clearAllTraces();
            this.traceView.update(this.rocketModel.position);
        }

        if (this.missionManager) {
            this.missionManager.resetMissions();
        }
        
        if(startLocation){
            this.loadCargoForCurrentLocationMission(startLocation);
        }

        if (this.cameraModel && this.rocketModel) {
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
        }

        console.log("Fusée réinitialisée.");
        this._lastRocketDestroyed = false;
        this.emitUpdatedStates();
    }
    
    update(deltaTime) {
        if (this.inputController) {
            this.inputController.update();
        }

        if (this.universeModel) {
            this.universeModel.update(deltaTime);
        }

        if (this.physicsController) {
            this.physicsController.update(deltaTime);
        }
        
        if (this.rocketController) {
            this.rocketController.update(deltaTime);
        }

        if (this.rocketAgent && this.rocketAgent.isControlling) {
            const currentState = this.rocketAgent.getCurrentState(this.rocketModel, this.universeModel, this.missionManager);
            this.rocketAgent.act(currentState);
        }

        if (this.particleController) {
            this.particleController.update(deltaTime, this.rocketModel);
        }
        
        if (this.rocketModel) {
            this.rocketModel.update(deltaTime);
        }

        if (this.cameraModel) {
            this.cameraModel.update(deltaTime);
        }

        this.updateTrace();

        if (this.missionManager && this.rocketModel && !this.rocketModel.isDestroyed) {
            this.missionManager.checkMissionCompletion(this.rocketModel, this.universeModel);
        }
    }
    
    cleanup() {
        this.isRunning = false;
        // Le nettoyage des abonnements est géré par l'EventBus
    }

    toggleThrusterPositions() {
        if (this.rocketView) {
            this.rocketView.setShowThrusterPositions(!this.rocketView.showThrusterPositions);
        }
    }

    adjustThrustMultiplier(factor) {
        const currentMultiplier = PHYSICS.THRUST_MULTIPLIER;
        const newMultiplier = currentMultiplier * factor;
        
        const minMultiplier = 0.1;
        const maxMultiplier = 1000;
        
        PHYSICS.THRUST_MULTIPLIER = Math.max(minMultiplier, Math.min(maxMultiplier, newMultiplier));
        
        if (this.physicsController) {
            this.physicsController._lastThrustCalculation = 0;
        }
    }

    toggleTraceVisibility() {
        if (this.renderingController) {
            this.renderingController.toggleTraceVisibility();
        }
    }

    toggleVectors() {
        if (this.renderingController) {
            this.renderingController.toggleVectors();
        }
    }

    handleRocketStateUpdated(data) {
        if (data.isDestroyed && !this._lastRocketDestroyed) {
            // console.log("Fusée détruite - Appuyez sur R pour réinitialiser"); // Optionnel
        }
        this._lastRocketDestroyed = !!data.isDestroyed;
    }

    updateTrace() {
        if (!this.rocketModel || !this.traceView) return;
        
        const isAttachedToMoon = (this.rocketModel.isDestroyed && (this.rocketModel.attachedTo === 'Lune' || this.rocketModel.landedOn === 'Lune')) || 
                                  (this.rocketModel.landedOn === 'Lune');
        
        let moonPosition = null;
        if (isAttachedToMoon) {
            const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
            if (moon) {
                moonPosition = moon.position;
            }
        }
        
        this.traceView.update(this.rocketModel.position, isAttachedToMoon, moonPosition);
    }

    toggleAssistedControls() {
        if (this.physicsController && this.uiView) {
            const assistedEnabled = this.physicsController.toggleAssistedControls();
            this.uiView.assistedControlsActive = assistedEnabled;
        }
    }

    clearAllTraces() {
        if (this.traceView) {
            this.traceView.clear(true);
        }
    }

    calculateLunarAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
        if (!moon) return null;
        
        const dx = moon.position.x - this.rocketModel.position.x;
        const dy = moon.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        return { 
            vector: { x: dx / distance, y: dy / distance },
            distance: distance
        };
    }

    toggleAIControl() {
        if (!this.rocketAgent) return;
        this.eventBus.emit(EVENTS.AI.TOGGLE, {});
    }

    calculateEarthDistance() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const surfaceDistance = Math.max(0, distance - earth.radius);
        
        return surfaceDistance;
    }

    calculateEarthAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        return { x: dx / distance, y: dy / distance };
    }

    handleRocketLanded(data) {
        if (!this.rocketModel || !this.rocketModel.isLanded) { 
            return; 
        }
        
        if (!this.rocketModel) return;

        if (this.missionManager && this.rocketModel.cargo) {
            const completedMissions = this.missionManager.checkMissionCompletion(this.rocketModel.cargo, data.landedOn);
            
            if (completedMissions.length > 0) {
                this.missionJustSucceededFlag = true; 
                completedMissions.forEach(mission => {
                    this.totalCreditsEarned += mission.reward;
                    this.eventBus.emit(EVENTS.UI.CREDITS_UPDATED, { reward: mission.reward }); 
                    this.eventBus.emit(EVENTS.MISSION.COMPLETED, { mission: mission });
                });
            }
            
            if (this.rocketModel) { 
               this.loadCargoForCurrentLocationMission(data.landedOn);
            }
        }
    }

    /**
     * Charge le cargo nécessaire pour la première mission active partant de la localisation donnée.
     * @param {string} location - Le nom de la planète/lune où se trouve la fusée.
     */
    loadCargoForCurrentLocationMission(location) {
        if (!this.missionManager || !this.rocketModel) return;

        const activeMissions = this.missionManager.getActiveMissions();
        const nextMission = activeMissions.find(m => m.from === location);

        if (nextMission) {
            this.rocketModel.cargo = new RocketCargo(); 
            let allLoaded = true;

            nextMission.requiredCargo.forEach(item => {
                const loaded = this.rocketModel.cargo.addCargo(item.type, item.quantity);
                if (!loaded) {
                    allLoaded = false;
                    // console.warn(`[GameController] Échec du chargement de ${item.quantity} x ${item.type} pour la mission ${nextMission.id}.`); // Log optionnel
                }
            });

            // if (allLoaded) { // Log optionnel
            //     const cargoString = nextMission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
            //     console.log(`%c[GameController] Cargo chargé pour la mission ${nextMission.id}: ${cargoString}`, 'color: lightblue;');
            // }
        } else {
            // console.log(`%c[GameController] Aucune mission active au départ de ${location} trouvée.`, 'color: gray;'); // Log optionnel
        }
    }

    // --- Gestionnaires d'événements Joystick ---

    handleJoystickAxisChanged(data) {
        if (!this.rocketModel || this.isPaused) return;

        // const axisThreshold = this.inputController ? this.inputController.axisThreshold : 0.1; // Semble inutilisé

        switch (data.action) {
            case 'rotate':
                const rotateValue = data.value;
                const power = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.RIGHT;
                if (rotateValue < 0) { 
                    this.rocketModel.setThrusterPower('right', power); 
                    this.rocketModel.setThrusterPower('left', 0);
                    this.particleSystemModel.setEmitterActive('right', power > 0.1);
                    this.particleSystemModel.setEmitterActive('left', false);
                } else if (rotateValue > 0) { 
                    const powerLeft = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.LEFT;
                    this.rocketModel.setThrusterPower('left', powerLeft); 
                    this.rocketModel.setThrusterPower('right', 0);
                    this.particleSystemModel.setEmitterActive('left', powerLeft > 0.1);
                    this.particleSystemModel.setEmitterActive('right', false);
                } else { 
                    this.rocketModel.setThrusterPower('left', 0);
                    this.rocketModel.setThrusterPower('right', 0);
                    this.particleSystemModel.setEmitterActive('left', false);
                    this.particleSystemModel.setEmitterActive('right', false);
                }
                break;
        }
    }
    
    handleJoystickAxisHeld(data) {
         if (!this.cameraModel || this.isPaused) return;
         
         switch(data.action) {
             case 'zoomAxis':
                 const zoomValue = data.value;
                 const zoomSpeedFactor = Math.abs(zoomValue) * RENDER.ZOOM_SPEED * 1.5;
                 
                 if (zoomValue < 0) {
                      this.cameraModel.setZoom(this.cameraModel.zoom * (1 + zoomSpeedFactor * (60/1000)));
                 } else if (zoomValue > 0) {
                     this.cameraModel.setZoom(this.cameraModel.zoom / (1 + zoomSpeedFactor * (60/1000)));
                 }
                 this.emitUpdatedStates(); 
                 break;
         }
    }
    
    handleJoystickAxisReleased(data) {
        // Peut être utilisé pour des actions spécifiques au relâchement si nécessaire
        // switch(data.action) {
        //     case 'rotate':
        //          break;
        // }
    }

    toggleGravityField() {
        if (this.renderingController && typeof this.renderingController.toggleGravityField === 'function') {
            this.renderingController.toggleGravityField();
        }
    }

    handleCanvasResized(data) {
        if (this.cameraModel && data) {
            this.cameraModel.width = data.width;
            this.cameraModel.height = data.height;
            this.cameraModel.offsetX = data.width / 2;
            this.cameraModel.offsetY = data.height / 2;
            // console.log(`[GameController] CameraModel dimensions updated: ${data.width}x${data.height}`); // Log optionnel
        }
    }
} 