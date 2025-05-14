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
        this.cameraModel = new CameraModel(this); // MODIFIÉ: Passer this (GameController)
        
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
        this.cameraController = new CameraController(this.eventBus, this.cameraModel, this); // Ajout du CameraController
        
        // État du jeu
        this.isRunning = false;
        this.isPaused = false;
        this.lastTimestamp = 0;
        this.elapsedTime = 0;
        
        // Canvas et contexte (supprimés, car gérés par RenderingController)
        
        // Variables pour le glisser-déposer - SUPPRIMÉES (gérées par CameraController)
        // this.isDragging = false;
        // this.dragStartX = 0;
        // this.dragStartY = 0;
        // this.dragStartRocketX = 0; // Note: Celles-ci semblaient liées à un drag de la fusée, pas caméra. À vérifier.
        // this.dragStartRocketY = 0; // Si c'était pour la caméra, c'est bien supprimé.

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

        // --- Abonnements Joystick (Supprimés et remplacés par des commandes sémantiques) ---
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_CHANGED, (data) => this.handleJoystickAxisChanged(data)));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_HELD, (data) => this.handleJoystickAxisHeld(data)));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_RELEASED, (data) => this.handleJoystickAxisReleased(data)));

        // +++ Nouveaux Abonnements aux commandes sémantiques d'InputController +++
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.ROTATE_COMMAND, (data) => this.handleRotateCommand(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.ZOOM_COMMAND, (data) => this.handleZoomCommand(data)));

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

    handleToggleForces() {
        if (this.physicsController) {
            this.physicsController.toggleForceVectors();
        }
    }

    handleToggleAssistedControlsFromUI() {
         this.toggleAssistedControls();
    }
    
    // Émettre un seul événement pour l'état complet de la simulation
    emitUpdatedStates() {
        // Assurez-vous que PhysicsVectors est accessible ici
        // Soit via import PhysicsVectors from './PhysicsVectors.js'; (si module ES6)
        // Soit si PhysicsVectors est global (ex: window.PhysicsVectors)

        const gravityVector = PhysicsVectors.calculateGravityVector(this.rocketModel, this.universeModel, PHYSICS.G);
        const thrustVectors = PhysicsVectors.calculateThrustVectors(this.rocketModel, PHYSICS); // PHYSICS contient MAIN_THRUST, REAR_THRUST
        const totalThrustVector = PhysicsVectors.calculateTotalThrustVector(this.rocketModel, ROCKET, PHYSICS); // ROCKET et PHYSICS contiennent les constantes nécessaires

        const lunarAttraction = PhysicsVectors.calculateLunarAttractionVector(this.rocketModel, this.universeModel);
        const earthAttraction = PhysicsVectors.calculateEarthAttractionVector(this.rocketModel, this.universeModel);
        // calculateEarthDistance n'est pas directement utilisé dans emitUpdatedStates, donc pas d'appel ici.

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
        
        // S'assurer que CameraModel a les dimensions correctes du canvas après initialisation
        if (this.renderingController && this.cameraModel) {
            const dims = this.renderingController.getCanvasDimensions();
            if (dims) {
                console.log("[GameController.init] Mise à jour initiale de CameraModel avec les dimensions du canvas:", dims);
                this.cameraModel.width = dims.width;
                this.cameraModel.height = dims.height;
                this.cameraModel.offsetX = dims.width / 2;
                this.cameraModel.offsetY = dims.height / 2;
            } else {
                console.warn("[GameController.init] Impossible d'obtenir les dimensions du canvas depuis RenderingController pour CameraModel.");
            }
        }
        
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
                console.log("[GameController.resetRocket] Avant cameraModel.setPosition:", 
                    { rocketPos: { x: rocketStartX, y: rocketStartY }, camPos: { x: this.cameraModel.x, y: this.cameraModel.y } });
                this.cameraModel.setPosition(rocketStartX, rocketStartY);
                console.log("[GameController.resetRocket] Après cameraModel.setPosition:", 
                    { camPos: { x: this.cameraModel.x, y: this.cameraModel.y } });
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
        
        if(startLocation && this.missionManager){
            this.missionManager.loadCargoForCurrentLocationMission(startLocation, this.rocketModel);
        }

        if (this.cameraModel && this.rocketModel) {
            console.log("[GameController.resetRocket] Avant cameraModel.setTarget:", 
                { target: this.cameraModel.target, mode: this.cameraModel.mode, rocketModelPos: this.rocketModel.position });
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
            console.log("[GameController.resetRocket] Après cameraModel.setTarget:", 
                { targetIsRocket: this.cameraModel.target === this.rocketModel, mode: this.cameraModel.mode });
            
            // Forcer la position ici aussi pour être absolument sûr, même si setPosition a été appelé avant.
            if (this.rocketModel.position) {
                console.log("[GameController.resetRocket] Forçage de la position caméra sur rocketModel.position après setTarget:", 
                    { rocketPos: this.rocketModel.position, camPrevPos: {x: this.cameraModel.x, y: this.cameraModel.y}});
                this.cameraModel.setPosition(this.rocketModel.position.x, this.rocketModel.position.y);
                console.log("[GameController.resetRocket] Position caméra APRES forçage:", 
                    { camFinalPos: {x: this.cameraModel.x, y: this.cameraModel.y}}); 
            }
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

        if (this.rocketAgent && this.rocketAgent.isActive) {
             this.rocketAgent.update(deltaTime);
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

        // Mise à jour de la caméra (suivi, etc.)
        // Si CameraModel a une méthode update, elle devrait être appelée ici ou dans RenderingController.
        // Pour l'instant, les mises à jour de position/zoom sont événementielles.
        // Si un suivi continu est nécessaire (ex: smooth follow), CameraModel ou CameraController aurait une méthode update.

        // Aucune logique de caméra spécifique à mettre à jour ici pour le moment,
        // car les changements de caméra sont pilotés par des événements dans CameraController.

        this.updateTrace();

        if (this.missionManager && this.rocketModel && !this.rocketModel.isDestroyed) {
            this.missionManager.checkMissionCompletion(this.rocketModel, this.universeModel);
        }
    }
    
    cleanup() {
        // Code pour se désabonner des événements et nettoyer les ressources
        // Par exemple, si EventBus a une méthode pour se désabonner de tous les événements
        // this.eventBus.unsubscribeAll(this); // Exemple conceptuel

        // Appeler cleanup sur les contrôleurs qui en ont un
        if (this.physicsController && typeof this.physicsController.cleanup === 'function') {
            this.physicsController.cleanup();
        }
        if (this.particleController && typeof this.particleController.cleanup === 'function') {
            this.particleController.cleanup();
        }
        if (this.rocketController && typeof this.rocketController.cleanup === 'function') {
            this.rocketController.cleanup();
        }
        if (this.rocketAgent && typeof this.rocketAgent.cleanup === 'function') {
            this.rocketAgent.cleanup();
        }
        if (this.cameraController && typeof this.cameraController.cleanup === 'function') { // AJOUT
            this.cameraController.cleanup();
        }

        // Important : Utiliser window.controllerContainer.destroy() pour nettoyer tous les abonnements suivis
        // Ceci est géré globalement par controllerContainer.
        // console.log("GameController cleanup executed.");
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

    toggleAIControl() {
        if (!this.rocketAgent) return;
        this.eventBus.emit(EVENTS.AI.TOGGLE, {});
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
               this.missionManager.loadCargoForCurrentLocationMission(data.landedOn, this.rocketModel);
            }
        }
    }

    // --- Gestionnaires d'événements Joystick (Supprimés) ---

    // handleJoystickAxisChanged(data) { ... }
    // handleJoystickAxisHeld(data) { ... }
    // handleJoystickAxisReleased(data) { ... }

    // +++ Nouveaux Gestionnaires pour commandes sémantiques +++
    handleRotateCommand(data) {
        if (!this.rocketModel || this.isPaused) return;

        const rotateValue = data.value;
        // La logique de rotation de la fusée est typiquement dans RocketController.
        // GameController pourrait ici relayer une commande plus abstraite à RocketController
        // ou directement interagir avec rocketModel si c'est sa responsabilité.
        // Pour l'instant, on garde la logique ici comme dans l'ancien handleJoystickAxisChanged.

        // On suppose que ROCKET.THRUSTER_POWER.RIGHT et ROCKET.THRUSTER_POWER.LEFT sont accessibles
        // et que particleSystemModel est aussi accessible.
        // Il serait préférable que RocketController gère cela en réponse à un événement plus générique.

        if (rotateValue < 0) { // rotation vers la droite (physiquement, propulseur droit)
            const power = Math.abs(rotateValue) * (ROCKET.THRUSTER_POWER.RIGHT || ROCKET.DEFAULT_ROTATION_THRUST); // Valeur par défaut si non défini
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: power });
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: 0 });
            if (this.particleSystemModel) {
                this.particleSystemModel.setEmitterActive('right', power > 0.1);
                this.particleSystemModel.setEmitterActive('left', false);
            }
        } else if (rotateValue > 0) { // rotation vers la gauche (physiquement, propulseur gauche)
            const power = Math.abs(rotateValue) * (ROCKET.THRUSTER_POWER.LEFT || ROCKET.DEFAULT_ROTATION_THRUST);
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: power });
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: 0 });
            if (this.particleSystemModel) {
                this.particleSystemModel.setEmitterActive('left', power > 0.1);
                this.particleSystemModel.setEmitterActive('right', false);
            }
        } else { // rotateValue === 0 ou proche de zéro (relâchement)
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: 0 });
            this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: 0 });
            if (this.particleSystemModel) {
                this.particleSystemModel.setEmitterActive('left', false);
                this.particleSystemModel.setEmitterActive('right', false);
            }
        }
        // Note: L'émission de EVENTS.ROCKET.SET_THRUSTER_POWER est une meilleure approche
        // si RocketController écoute ces événements pour changer l'état de rocketModel.
        // Si ce n'est pas le cas, il faudrait modifier rocketModel directement ici :
        // this.rocketModel.setThrusterPower('right', powerRight);
        // this.rocketModel.setThrusterPower('left', powerLeft);
    }
    
    handleZoomCommand(data) {
         if (!this.cameraModel || this.isPaused) return;
         
         const zoomValue = data.value; // Valeur brute de l'axe du joystick
         const zoomSpeedFactor = Math.abs(zoomValue) * (RENDER.ZOOM_SPEED || 0.01) * 1.5; 

         // Si zoomValue < 0 (généralement joystick vers le HAUT), on veut ZOOMER (facteur > 1)
         // Si zoomValue > 0 (généralement joystick vers le BAS), on veut DÉZOOMER (facteur < 1)
         if (zoomValue < 0) { 
              this.eventBus.emit(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, { factor: 1 + zoomSpeedFactor });
         } else if (zoomValue > 0) { 
             this.eventBus.emit(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, { factor: 1 / (1 + zoomSpeedFactor) });
         }
         // Pas d'action si zoomValue est 0 (ou dans la zone morte, déjà géré par InputController)
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