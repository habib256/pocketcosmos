// import missionManager from './MissionManager.js'; // Supprimer cette ligne

/**
 * @file GameController.js
 * Gère la logique principale du jeu, la boucle de jeu, les états,
 * et la coordination entre les différents modèles, vues et contrôleurs.
 */

/**
 * @class GameController
 * @classdesc Contrôleur principal du jeu. Orchestre le déroulement du jeu,
 * gère les mises à jour des modèles, la boucle de jeu, les entrées utilisateur
 * via les événements, et la communication entre les différents composants.
 */
class GameController {
    /**
     * Crée une instance de GameController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication entre composants.
     * @param {MissionManager} missionManager - Le gestionnaire de missions.
     */
    constructor(eventBus, missionManager) {
        // EventBus
        this.eventBus = eventBus;
        this.missionManager = missionManager; // Utilise la variable passée en argument
        
        // Modèles - Seront initialisés par GameSetupController
        this.rocketModel = null;
        this.universeModel = null;
        this.particleSystemModel = null;
        /** @type {CameraModel} */
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
        this.rocketAI = null; // MODIFIÉ: rocketAgent -> rocketAI
        
        // Contrôleurs Internes (créés par GameSetupController)
        this.physicsController = null;
        this.particleController = null;
        this.rocketController = null;
        /** @type {CameraController} */
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

        this._lastRocketDestroyed = false;
    }
    
    /**
     * S'abonne aux événements pertinents de l'EventBus.
     * @private
     */
    subscribeToEvents() {
        // Événements sémantiques pour les actions de la fusée - GÉRÉS PAR RocketController
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => this.handleResetRocket()));

        // NOUVEL ÉVÉNEMENT pour mettre à jour l'état global lorsque RocketController modifie la fusée
        const ROCKET_INTERNAL_STATE_CHANGED_EVENT = 'rocket:internalStateChanged'; // Doit correspondre à celui dans RocketController
        window.controllerContainer.track(this.eventBus.subscribe(ROCKET_INTERNAL_STATE_CHANGED_EVENT, () => this.emitUpdatedStates()));

        // Événements sémantiques pour le jeu et l'UI
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.TOGGLE_PAUSE, () => this.handleTogglePause()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.RESUME_IF_PAUSED, () => this.handleResumeIfPaused()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.UI.TOGGLE_ASSISTED_CONTROLS, () => {
            console.log('[GameController] Événement EVENTS.UI.TOGGLE_ASSISTED_CONTROLS reçu !');
            this.handleToggleAssistedControlsFromUI();
        }));

        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.PHYSICS.TOGGLE_FORCES, () => this.handleToggleForces()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.INCREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(2.0)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.DECREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(0.5)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.AI.TOGGLE_CONTROL, () => this.toggleAIControl()));
        
        // Événement pour les mises à jour d'état de la fusée
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.STATE_UPDATED, (data) => this.handleRocketStateUpdated(data)));
        // Événement lorsque la fusée atterrit
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.LANDED, (data) => this.handleRocketLanded(data)));

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
            // Déplacé vers CameraController
            // window.controllerContainer.track(
            //     this.eventBus.subscribe(canvasResizedEventName, (data) => this.handleCanvasResized(data))
            // );
        } else {
            // CameraController affichera cet avertissement s'il ne trouve pas l'événement.
            // console.warn("EVENTS.SYSTEM.CANVAS_RESIZED ou EVENTS.RENDER.CANVAS_RESIZED n'est pas défini. GameController ne s'abonnera pas à l'événement de redimensionnement du canvas.");
        }
    }
    
    // Gérer les événements d'entrée sémantiques
    // LES GESTIONNAIRES POUR THRUST/ROTATE SONT DANS RocketController.js

    /**
     * Gère le basculement de l'état de pause du jeu.
     * Émet les événements GAME_PAUSED ou GAME_RESUMED en conséquence.
     * @private
     */
    handleTogglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
        } else {
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }

    /**
     * Reprend le jeu s'il était en pause.
     * Émet l'événement GAME_RESUMED si le jeu reprend.
     * @private
     */
    handleResumeIfPaused() {
        if (this.isPaused) {
            this.isPaused = false;
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }
    
    /**
     * Gère la demande de réinitialisation de la fusée.
     * @private
     */
    handleResetRocket() {
        this.resetRocket();
    }

    /**
     * Gère le basculement de l'affichage des vecteurs de force.
     * @private
     */
    handleToggleForces() {
        if (this.physicsController) {
            this.physicsController.toggleForceVectors();
        }
    }

    /**
     * Gère la demande de basculement des contrôles assistés depuis l'UI.
     * @private
     */
    handleToggleAssistedControlsFromUI() {
         this.toggleAssistedControls();
    }
    
    /**
     * Collecte et émet l'état complet de la simulation via l'événement SIMULATION.UPDATED.
     * Cet état inclut les informations sur la fusée, l'univers, les particules, la caméra,
     * les missions actives, les crédits et un flag indiquant si une mission vient d'être réussie.
     */
    emitUpdatedStates() {
        // Assurez-vous que PhysicsVectors est accessible ici
        // Soit via import PhysicsVectors from './PhysicsVectors.js'; (si module ES6)
        // Soit si PhysicsVectors est global (ex: window.PhysicsVectors)
        // Ou si GameController a une instance, par exemple this.physicsVectorsInstance
        // Pour l'instant, on suppose que PhysicsVectors est une classe globale avec des méthodes statiques.

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
    
    /**
     * Initialise les composants du jeu en utilisant GameSetupController.
     * Configure les modèles, vues et contrôleurs internes.
     * Réinitialise la fusée et démarre la boucle de jeu.
     */
    init(canvas, initialConfig) {
        // console.log('[GameController.init] Canvas reçu initialement:', canvas); // SUPPRESSION DE LOG

        // 1. Initialiser le CameraModel avec les dimensions du canvas
        if (this.cameraModel && canvas) {
            this.cameraModel.width = canvas.width;
            this.cameraModel.height = canvas.height;
            this.cameraModel.offsetX = canvas.width / 2;
            this.cameraModel.offsetY = canvas.height / 2;
            // console.log('[GameController.init] CameraModel dimensions updated:', { 
            //     width: this.cameraModel.width, 
            //     height: this.cameraModel.height, 
            //     offsetX: this.cameraModel.offsetX, 
            //     offsetY: this.cameraModel.offsetY 
            // }); // SUPPRESSION DE LOG
        } else {
            console.warn('[GameController.init] CameraModel ou Canvas non disponible pour la mise à jour des dimensions.');
        }
        
        // 2. Initialiser GameSetupController
        const gameSetupController = new GameSetupController(this.eventBus, this.missionManager);

        // 3. Préparer les contrôleurs externes à passer à GameSetupController
        // Assurez-vous que tous les contrôleurs externes requis par GameSetupController sont bien initialisés
        // dans GameController AVANT cet appel (typiquement via setControllers).
        const externalControllers = {
            inputController: this.inputController,
            renderingController: this.renderingController,
            rocketAI: this.rocketAI, // MODIFIÉ: Utiliser this.rocketAI
            gameController: this,
            cameraController: this.cameraController
        };
        console.log('[GameController.init] Contrôleurs externes passés à GameSetupController:', externalControllers);


        // 4. Initialiser les composants du jeu via GameSetupController
        // GameSetupController est responsable de créer/configurer les modèles, vues, et contrôleurs internes.
        const components = gameSetupController.initializeGameComponents(
            initialConfig,
            canvas, // Toujours passer le canvas, GameSetupController le donnera à RenderingController
            externalControllers
        );

        // 5. Récupérer les composants initialisés depuis GameSetupController
        this.rocketModel = components.rocketModel;
        this.universeModel = components.universeModel;
        this.particleSystemModel = components.particleSystemModel;
        this.physicsController = components.physicsController;
        this.rocketController = components.rocketController;
        this.particleController = components.particleController;
        
        // Vues (si gérées et retournées par GameSetupController)
        this.rocketView = components.rocketView;
        this.universeView = components.universeView;
        this.particleView = components.particleView;
        this.celestialBodyView = components.celestialBodyView;
        this.traceView = components.traceView;
        this.uiView = components.uiView; // UIView est maintenant initialisé par GameSetupController

        // Important: S'assurer de récupérer l'instance de rocketAI (celle passée ou celle créée)
        this.rocketAI = components.rocketAI || this.rocketAI; // MODIFIÉ: S'assurer d'avoir la bonne instance
        console.log('[GameController.init] RocketAI instance après GameSetupController:', this.rocketAI);

        // Le RenderingController est maintenant supposé être initialisé par GameSetupController
        // et avoir reçu le canvas.

        // Autres initialisations spécifiques à GameController
        // this.missionManager.setModels(this.rocketModel, this.universeModel); // SUPPRIMÉ: MissionManager ne possède pas cette méthode
        // this.missionManager.loadMissions(initialConfig.missions); // COMMENTÉ: MissionManager ne possède pas cette méthode pour l'instant
        
        // Réinitialiser la fusée pour la positionner correctement, etc.
        this.resetRocket();
        
        console.log("GameController initialisé (via GameSetupController). Tentative de démarrage de la boucle..."); // LOG MODIFIÉ

        // Toujours appeler start() pour mettre isRunning = true.
        // Start() gérera le lancement de gameLoop en fonction de isPaused.
        this.start(); 
    }
    
    /**
     * Permet de définir les contrôleurs externes dont GameController dépend.
     * @param {object} controllers - Un objet contenant les instances des contrôleurs.
     * @param {InputController} [controllers.inputController] - Le contrôleur des entrées utilisateur.
     * @param {RenderingController} [controllers.renderingController] - Le contrôleur du rendu graphique.
     * @param {RocketAI} [controllers.rocketAI] - L'agent IA pour la fusée (optionnel).
     */
    setControllers(controllers) {
        this.inputController = controllers.inputController;
        this.renderingController = controllers.renderingController;
        this.rocketAI = controllers.rocketAI || null; // MODIFIÉ: Utiliser rocketAI
        console.log('[GameController.setControllers] RocketAI reçu:', this.rocketAI);

        // Si CameraController est créé ici ou dépend de contrôleurs externes, initialisez/mettez à jour ici.
        // Actuellement, CameraController est créé dans le constructeur de GameController.
        // Il a besoin de l'eventBus et du cameraModel, qui sont disponibles à ce moment-là.
        // Si RenderingController est nécessaire pour CameraController, assurez-vous de l'ordre.
        if (this.renderingController && this.cameraController) {
            // Supposons que CameraController a une méthode pour définir son RenderingController si nécessaire
            // this.cameraController.setRenderingController(this.renderingController);
        }
        if (this.inputController && this.cameraController) {
            // Supposons que CameraController a une méthode pour définir son InputController si nécessaire
            // this.cameraController.setInputController(this.inputController);
        }
    }
    
    /**
     * Démarre la boucle de jeu si elle n'est pas déjà en cours.
     * Si le jeu est en pause au démarrage, un événement GAME_PAUSED est émis.
     */
    start() {
        if (!this.isRunning) { // Empêche les démarrages multiples si déjà en cours
            // console.log('[GameController.start] Exécution de GameController.start(). isPaused initialement:', this.isPaused); // SUPPRESSION DE LOG
            this.isRunning = true;
            // this.isPaused = false; // Ne pas dé-pauser automatiquement ici, respecter l'état de pause actuel.
            this.lastTimestamp = performance.now();
            
            if (!this.isPaused) {
                // console.log('[GameController.start] Démarrage de la boucle de jeu (gameLoop)...'); // SUPPRESSION DE LOG
                this.gameLoop(performance.now());
                this.eventBus.emit(EVENTS.GAME.GAME_RESUMED); // Émettre RESUMED si on démarre non-pausé
            } else {
                // console.log('[GameController.start] Le jeu est en pause. La boucle de jeu ne démarrera pas immédiatement. Un événement GAME_PAUSED sera émis.'); // SUPPRESSION DE LOG
                // Émettre GAME_PAUSED si on démarre en étant déjà en pause (ex: par visibilityChange)
                this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
            }
            this.eventBus.emit(EVENTS.GAME.GAME_STARTED); // Signale que le jeu a "commencé" (même si en pause)
            // console.log("GameController started. isRunning:", this.isRunning, "isPaused:", this.isPaused); // SUPPRESSION DE LOG
        } else {
            // console.log('[GameController.start] Appel ignoré, le jeu est déjà en cours (isRunning est true).'); // SUPPRESSION DE LOG
        }
    }
    
    /**
     * La boucle principale du jeu. Appelée à chaque frame via requestAnimationFrame.
     * Calcule le deltaTime, met à jour l'état du jeu (si non en pause),
     * et déclenche le rendu.
     * @param {DOMHighResTimeStamp} timestamp - Le timestamp actuel fourni par requestAnimationFrame.
     * @private
     */
    gameLoop(timestamp) {
        // console.log('[GameController.gameLoop] Entrée dans gameLoop, timestamp:', timestamp); // SUPPRESSION DE LOG

        const deltaTime = (timestamp - this.lastTimestamp) / 1000; // deltaTime en secondes
        this.lastTimestamp = timestamp;
        this.elapsedTime += deltaTime;

        if (!this.isPaused) {
            // console.log('[GameController.gameLoop] Appel de this.update(), deltaTime:', deltaTime); // SUPPRESSION DE LOG
            this.update(deltaTime);
            // console.log('[GameController.gameLoop] Retour de this.update()'); // SUPPRESSION DE LOG
        }

        // console.log('[GameController.gameLoop] Appel de this.render()'); // SUPPRESSION DE LOG
        this.render(timestamp); // Appel de la méthode render de GameController

        // Rappeler gameLoop pour la prochaine frame d'animation
        if (this.isRunning) { // Seulement si le jeu est toujours censé tourner
            requestAnimationFrame((newTimestamp) => this.gameLoop(newTimestamp));
        } else {
            // console.log('[GameController.gameLoop] this.isRunning est false, arrêt de la boucle.'); // SUPPRESSION DE LOG
        }
    }
    
    /**
     * Réinitialise l'état de la fusée et les éléments associés du jeu.
     * Repositionne la fusée sur Terre, réinitialise sa vitesse, son angle,
     * son carburant, sa cargaison, les crédits, les particules, la physique,
     * la trace de rendu, les missions et la caméra.
     */
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
            const components = gameSetupController.initializeGameComponents(this.cameraModel);
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
                // console.log("[GameController.resetRocket] Avant cameraModel.setPosition:", 
                //     { rocketPos: { x: rocketStartX, y: rocketStartY }, camPos: { x: this.cameraModel.x, y: this.cameraModel.y } }); // SUPPRESSION DE LOG
                this.cameraModel.setPosition(rocketStartX, rocketStartY);
                // console.log("[GameController.resetRocket] Après cameraModel.setPosition:", 
                //     { camPos: { x: this.cameraModel.x, y: this.cameraModel.y } }); // SUPPRESSION DE LOG
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

        if (this.renderingController && this.rocketModel && this.rocketModel.position) {
            this.renderingController.resetTrace(this.rocketModel.position);
        } else if (this.renderingController) {
            // Si rocketModel ou sa position n'est pas encore défini, on efface quand même la trace.
            this.renderingController.resetTrace(null);
        }

        if (this.missionManager) {
            this.missionManager.resetMissions();
        }
        
        if(startLocation && this.missionManager){
            this.missionManager.loadCargoForCurrentLocationMission(startLocation, this.rocketModel);
        }

        if (this.cameraModel && this.rocketModel) {
            // console.log("[GameController.resetRocket] Avant cameraModel.setTarget:", 
            //     { target: this.cameraModel.target, mode: this.cameraModel.mode, rocketModelPos: this.rocketModel.position }); // SUPPRESSION DE LOG
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
            // console.log("[GameController.resetRocket] Après cameraModel.setTarget:", 
            //     { targetIsRocket: this.cameraModel.target === this.rocketModel, mode: this.cameraModel.mode }); // SUPPRESSION DE LOG
            
            // Forcer la position ici aussi pour être absolument sûr, même si setPosition a été appelé avant.
            if (this.rocketModel.position) {
                // console.log("[GameController.resetRocket] Forçage de la position caméra sur rocketModel.position après setTarget:", 
                //     { rocketPos: this.rocketModel.position, camPrevPos: {x: this.cameraModel.x, y: this.cameraModel.y}}); // SUPPRESSION DE LOG
                this.cameraModel.setPosition(this.rocketModel.position.x, this.rocketModel.position.y);
                // console.log("[GameController.resetRocket] Position caméra APRES forçage:", 
                //     { camFinalPos: {x: this.cameraModel.x, y: this.cameraModel.y}});  // SUPPRESSION DE LOG
            }
        }

        // console.log("Fusée réinitialisée."); // CONSERVER CE LOG ? Il est informatif.
        this._lastRocketDestroyed = false;
        this.emitUpdatedStates();
    }
    
    /**
     * Met à jour l'état de tous les composants actifs du jeu.
     * Appelée à chaque frame par la boucle de jeu si le jeu n'est pas en pause.
     * @param {number} deltaTime - Le temps écoulé (en secondes) depuis la dernière frame.
     * @private
     */
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

        if (this.rocketAI && this.rocketAI.isActive) {
             this.rocketAI.update(deltaTime);
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
        // Pour l'instant, les mises à jour de position/zoom sont événementielles.
        // Si un suivi continu est nécessaire (ex: smooth follow), CameraModel ou CameraController aurait une méthode update.

        // Aucune logique de caméra spécifique à mettre à jour ici pour le moment,
        // car les changements de caméra sont pilotés par des événements dans CameraController.

        if (this.missionManager && this.rocketModel && !this.rocketModel.isDestroyed) {
            this.missionManager.checkMissionCompletion(this.rocketModel, this.universeModel);
        }
    }
    
    /**
     * Nettoie les ressources et se désabonne des événements lorsque le jeu se termine
     * ou que le contrôleur est détruit.
     * S'appuie sur `window.controllerContainer.destroy()` pour le nettoyage global des abonnements.
     */
    cleanup() {
        // La désinscription des événements gérés par controllerContainer.track()
        // est gérée globalement par window.controllerContainer.destroy().

        // Appeler cleanup sur les contrôleurs internes qui pourraient en avoir besoin.
        if (this.physicsController && typeof this.physicsController.cleanup === 'function') {
            this.physicsController.cleanup();
        }
        if (this.particleController && typeof this.particleController.cleanup === 'function') {
            this.particleController.cleanup();
        }
        if (this.rocketController && typeof this.rocketController.cleanup === 'function') {
            this.rocketController.cleanup();
        }
        if (this.rocketAI && typeof this.rocketAI.cleanup === 'function') {
            this.rocketAI.cleanup();
        }
        if (this.cameraController && typeof this.cameraController.cleanup === 'function') { // AJOUT
            this.cameraController.cleanup();
        }

        // Important : Utiliser window.controllerContainer.destroy() pour nettoyer tous les abonnements suivis
        // Ceci est géré globalement par controllerContainer.
        // console.log("GameController cleanup executed.");
    }

    /**
     * Bascule l'affichage des positions des propulseurs sur la vue de la fusée.
     * (Méthode potentiellement utilisée pour le débogage ou des options d'affichage).
     */
    toggleThrusterPositions() {
        if (this.rocketView) {
            this.rocketView.setShowThrusterPositions(!this.rocketView.showThrusterPositions);
        }
    }

    /**
     * Ajuste le multiplicateur global de poussée des propulseurs.
     * @param {number} factor - Le facteur par lequel multiplier la poussée actuelle (ex: 2.0 pour doubler, 0.5 pour diviser par deux).
     */
    adjustThrustMultiplier(factor) {
        if (this.physicsController && typeof this.physicsController.adjustGlobalThrustMultiplier === 'function') {
            this.physicsController.adjustGlobalThrustMultiplier(factor);
        } else {
            console.warn("[GameController] physicsController.adjustGlobalThrustMultiplier n'est pas disponible.");
            // Fallback à l'ancienne logique si la méthode n'existe pas (pourrait être retiré plus tard)
            const currentMultiplier = PHYSICS.THRUST_MULTIPLIER;
            const newMultiplier = currentMultiplier * factor;
            const minMultiplier = 0.1;
            const maxMultiplier = 1000;
            PHYSICS.THRUST_MULTIPLIER = Math.max(minMultiplier, Math.min(maxMultiplier, newMultiplier));
            if (this.physicsController && this.physicsController.thrusterPhysics && this.physicsController.thrusterPhysics.hasOwnProperty('_lastThrustCalculation')) {
                 this.physicsController.thrusterPhysics._lastThrustCalculation = 0;
            }
        }
    }


    /**
     * Gère les mises à jour de l'état de la fusée, notamment sa destruction.
     * @param {object} data - Les données d'état de la fusée.
     * @param {boolean} data.isDestroyed - Indique si la fusée est détruite.
     * @private
     */
    handleRocketStateUpdated(data) {
        if (data.isDestroyed && !this._lastRocketDestroyed) {
            // Une action pourrait être déclenchée ici si la fusée est détruite,
            // comme afficher un message ou démarrer un timer de réinitialisation.
            // Pour l'instant, seul l'état _lastRocketDestroyed est mis à jour.
        }
        this._lastRocketDestroyed = !!data.isDestroyed;
    }

    /**
     * Bascule l'état des contrôles assistés (par exemple, assistance à la stabilisation).
     * Met à jour la vue UI en conséquence.
     */
    toggleAssistedControls() {
        console.log('[GameController] toggleAssistedControls appelé.');
        if (this.physicsController) {
            console.log('[GameController] physicsController existe. rocketBody:', this.physicsController.rocketBody);
            const assistedEnabled = this.physicsController.toggleAssistedControls();
            this.eventBus.emit(EVENTS.UI.ASSISTED_CONTROLS_STATE_CHANGED, { isActive: assistedEnabled });
        } else {
            console.warn('[GameController] Tentative de basculer les contrôles assistés, mais physicsController est null.');
        }
    }

    /**
     * Bascule le contrôle de la fusée par l'IA.
     * Émet un événement pour que RocketAI puisse prendre ou rendre le contrôle.
     */
    toggleAIControl() {
        // Cette méthode dans GameController peut-être utilisée pour une logique de plus haut niveau
        // si GameController doit réagir directement au changement de contrôle de l'IA.
        // Par exemple, pour mettre à jour l'UI ou changer certains comportements du jeu.
        
        // Actuellement, RocketAI s'abonne directement à EVENTS.AI.TOGGLE_CONTROL.
        // Si GameController a aussi besoin de savoir, il peut écouter cet événement.
        // Pour l'instant, on pourrait simplement logguer ici que l'événement a été reçu
        // ou le supprimer si GameController n'a pas de rôle direct à jouer dans ce basculement.

        // Exemple : si on voulait que GameController gère l'activation/désactivation de l'instance rocketAI
        if (this.rocketAI && typeof this.rocketAI.toggleActive === 'function') {
            // NE FAITES PAS CELA ICI SI ROCKETAI S'ABONNE DÉJÀ LUI-MEME. CELA CAUSERAIT UN DOUBLE APPEL.
            // this.rocketAI.toggleActive();
            console.log("[GameController] toggleAIControl: l'événement a été reçu. RocketAI gère son propre état.");
        } else {
            console.warn("[GameController] toggleAIControl: Pas d'instance de RocketAI ou de méthode toggleActive disponible.");
        }
    }

    /**
     * Gère l'événement d'atterrissage de la fusée.
     * Vérifie la complétion des missions, met à jour les crédits,
     * et charge une nouvelle cargaison pour la localisation actuelle.
     * @param {object} data - Données de l'événement d'atterrissage.
     * @param {string} data.landedOn - Le nom du corps céleste sur lequel la fusée a atterri.
     * @private
     */
    handleRocketLanded(data) {
        if (!this.rocketModel || !this.rocketModel.isLanded || !data || typeof data.landedOn !== 'string') { 
            console.warn("[GameController.handleRocketLanded] Conditions non remplies pour traiter l'atterrissage.", {
                rocketModelExists: !!this.rocketModel,
                isLanded: this.rocketModel ? this.rocketModel.isLanded : 'N/A',
                dataExists: !!data,
                landedOn: data ? data.landedOn : 'N/A'
            });
            return; 
        }
        
        // La vérification `!this.rocketModel` est déjà couverte par la condition ci-dessus.

        if (this.missionManager && this.rocketModel.cargo) {
            // Vérifie si des missions sont complétées avec la cargaison actuelle et le lieu d'atterrissage.
            const completedMissions = this.missionManager.checkMissionCompletion(this.rocketModel.cargo, data.landedOn);
            
            if (completedMissions.length > 0) {
                this.missionJustSucceededFlag = true; 
                completedMissions.forEach(mission => {
                    this.totalCreditsEarned += mission.reward;
                    // Émet un événement pour mettre à jour l'UI des crédits.
                    this.eventBus.emit(EVENTS.UI.CREDITS_UPDATED, { reward: mission.reward }); 
                    // Émet un événement pour signaler la complétion d'une mission.
                    this.eventBus.emit(EVENTS.MISSION.COMPLETED, { mission: mission });
                });
            }
            
            // Charge la cargaison pour la prochaine mission disponible à cet emplacement.
            // Ceci se fait que des missions aient été complétées ou non, pour préparer la suite.
            this.missionManager.loadCargoForCurrentLocationMission(data.landedOn, this.rocketModel);
        }
    }

    // La méthode handleCanvasResized(data) a été déplacée vers CameraController.js
    // et le code commenté correspondant a été supprimé.

    render(timestamp) {
        // console.log('[GameController.render] Entrée dans GameController.render'); // SUPPRESSION DE LOG
        // console.log('[GameController.render] Vérification de this.renderingController:', this.renderingController); // SUPPRESSION DE LOG

        if (this.renderingController) {
            // console.log('[GameController.render] Appel de this.renderingController.render()'); // Log déplacé dans RenderingController.render lui-même // SUPPRESSION DE LOG
            this.renderingController.render(
                this.elapsedTime,
                this.rocketModel,
                this.universeModel,
                this.particleSystemModel,
                this.cameraModel,
                this.missionManager ? this.missionManager.getActiveMissions() : [],
                this.totalCreditsEarned,
                this.missionJustSucceededFlag
            );
        } else {
            // console.warn('[GameController.render] this.renderingController est null ou undefined. Le rendu ne sera pas effectué.'); // CONSERVER CE WARN ? Il est utile.
        }
        // Réinitialiser le flag après le rendu
        if (this.missionJustSucceededFlag) {
            this.missionJustSucceededFlag = false;
        }
    }
}
