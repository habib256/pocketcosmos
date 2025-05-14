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
        // this.canvas = null;
        // this.ctx = null;
        
        // Variables pour le glisser-déposer
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartRocketX = 0;
        this.dragStartRocketY = 0;

        // Crédits gagnés - Initialiser à 10 (ou valeur par défaut au reset)
        this.totalCreditsEarned = 10;

        // Initialiser la caméra - FAIT CI-DESSUS
        // this.cameraModel = new CameraModel();
        
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
                // if (this.isPaused && this.isRunning /* && il a été auto-paused */) {
                //     this.isPaused = false;
                //     this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
                //     console.log('[AUTO-RESUME] Jeu repris car l\'onglet est de nouveau actif.');
                // }
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
                // Effet désactivé : on ne veut plus de texte coloré au-dessus de la fusée
                // if (this.particleController && e.detail) {
                //     this.particleController.createMissionSuccessParticles(
                //         e.detail.x,
                //         e.detail.y,
                //         e.detail.message || 'Mission réussie'
                //     );
                // }
            });
        }

        this._lastRocketDestroyed = false;
    }
    
    // S'abonner aux événements de l'EventBus
    subscribeToEvents() {
        // Événements sémantiques pour les actions de la fusée - GÉRÉS PAR RocketController
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_START, () => this.handleThrustForwardStart()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_STOP, () => this.handleThrustForwardStop()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_START, () => this.handleThrustBackwardStart()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_STOP, () => this.handleThrustBackwardStop()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_START, () => this.handleRotateLeftStart()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_STOP, () => this.handleRotateLeftStop()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_START, () => this.handleRotateRightStart()));
        // window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_STOP, () => this.handleRotateRightStop()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => this.handleResetRocket())); // anciennement via 'resetRocket' keypress

        // NOUVEL ÉVÉNEMENT pour mettre à jour l'état global lorsque RocketController modifie la fusée
        const ROCKET_INTERNAL_STATE_CHANGED_EVENT = 'rocket:internalStateChanged'; // Doit correspondre à celui dans RocketController
        window.controllerContainer.track(this.eventBus.subscribe(ROCKET_INTERNAL_STATE_CHANGED_EVENT, () => this.emitUpdatedStates()));

        // Événements sémantiques pour la caméra
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_IN, () => this.handleZoomIn()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_OUT, () => this.handleZoomOut()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.CENTER_ON_ROCKET, () => this.handleCenterCamera())); // anciennement via 'centerCamera' keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.START_DRAG, (data) => this.handleCameraStartDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.DRAG, (data) => this.handleCameraDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.STOP_DRAG, () => this.handleCameraStopDrag()));


        // Événements sémantiques pour le jeu et l'UI
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.TOGGLE_PAUSE, () => this.handleTogglePause())); // anciennement via 'pauseGame' keyup/keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.GAME.RESUME_IF_PAUSED, () => this.handleResumeIfPaused())); // Pour reprendre avec flèches ou keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.UI.TOGGLE_ASSISTED_CONTROLS, () => this.handleToggleAssistedControlsFromUI())); // anciennement via click sur bouton UI

        // Événements pour les vecteurs et autres affichages (restent similaires car déjà assez sémantiques)
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_VECTORS, () => this.toggleVectors()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD, () => this.toggleGravityField()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_TRACES, () => this.toggleTraceVisibility())); // anciennement via 'toggleTraces' keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.PHYSICS.TOGGLE_FORCES, () => this.handleToggleForces())); // anciennement via 'toggleForces' keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.INCREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(2.0))); // anciennement via keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.DECREASE_THRUST_MULTIPLIER, () => this.adjustThrustMultiplier(0.5))); // anciennement via keypress
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.AI.TOGGLE_CONTROL, () => this.toggleAIControl())); // anciennement via 'toggleAI' keypress
        
        // Événement pour les mises à jour d'état de la fusée
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.STATE_UPDATED, (data) => this.handleRocketStateUpdated(data)));
        // Événement lorsque la fusée atterrit
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.LANDED, (data) => this.handleRocketLanded(data)));

        // --- Abonnements Joystick (devront aussi être mappés à des événements sémantiques par InputController) ---
        // Exemple: EVENTS.INPUT.JOYSTICK_AXIS_ROTATE, EVENTS.INPUT.JOYSTICK_BUTTON_THRUST_MAIN_PRESS, etc.
        // Pour l'instant, on garde les anciens gestionnaires, mais ils seront appelés par ces nouveaux événements sémantiques du joystick
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_CHANGED, (data) => this.handleJoystickAxisChanged(data))); // CORRIGÉ
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_HELD, (data) => this.handleJoystickAxisHeld(data)));         // CORRIGÉ
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.JOYSTICK_AXIS_RELEASED, (data) => this.handleJoystickAxisReleased(data))); // CORRIGÉ

        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.GAMEPAD_CONNECTED, () => { /* On pourrait afficher un message */ }));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.GAMEPAD_DISCONNECTED, () => { /* On pourrait afficher un message */ }));
        // --- Fin Abonnements Joystick ---

        // S'abonner à l'événement de redimensionnement du canvas
        // Assurez-vous que la constante d'événement (ex: EVENTS.SYSTEM.CANVAS_RESIZED) est définie
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
    // LES GESTIONNAIRES SUIVANTS SONT DÉPLACÉS VERS RocketController.js
    // handleThrustForwardStart() { ... }
    // handleThrustForwardStop() { ... }
    // handleThrustBackwardStart() { ... }
    // handleThrustBackwardStop() { ... }
    // handleRotateLeftStart() { ... }
    // handleRotateLeftStop() { ... }
    // handleRotateRightStart() { ... }
    // handleRotateRightStop() { ... }

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
            console.log("Jeu mis en pause (événement sémantique)");
            this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
        } else {
            console.log("Jeu repris (événement sémantique)");
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
        // Pas besoin d'emitUpdatedStates ici, la boucle de jeu gère le rendu en pause
    }

    handleResumeIfPaused() {
        if (this.isPaused) {
            this.isPaused = false;
            console.log("Jeu repris (par événement RESUME_IF_PAUSED)");
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }
    
    handleResetRocket() {
        this.resetRocket();
        // emitUpdatedStates est appelé dans resetRocket ou par la suite
    }

    handleCenterCamera() {
        if (this.isPaused) return;
        if (this.cameraModel && this.rocketModel) {
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
        }
        // emitUpdatedStates n'est pas critique ici, la caméra se mettra à jour
    }

    handleToggleForces() {
        if (this.isPaused) return;
        if (this.physicsController) {
            const showForces = this.physicsController.toggleForceVectors();
            console.log(`Affichage des forces: ${showForces ? 'activé' : 'désactivé'} (événement sémantique)`);
        }
    }

    // GESTION SOURIS (via événements sémantiques)
    handleCameraStartDrag(data) {
        if (this.isPaused) return;
        
        this.isDragging = true;
        this.dragStartX = data.x; // data contiendra { x, y }
        this.dragStartY = data.y;
        
        if (this.cameraModel) {
            this.dragStartCameraX = this.cameraModel.x;
            this.dragStartCameraY = this.cameraModel.y;
        }
    }
    
    handleCameraDrag(data) {
        if (!this.isDragging || this.isPaused) return;
        
        const dx = (data.x - this.dragStartX) / this.cameraModel.zoom; // data contiendra { x, y }
        const dy = (data.y - this.dragStartY) / this.cameraModel.zoom;
        
        if (this.cameraModel) {
            this.cameraModel.setPosition(
                this.dragStartCameraX - dx,
                this.dragStartCameraY - dy
            );
        }
        // emitUpdatedStates n'est pas critique ici, la caméra se mettra à jour
    }
    
    handleCameraStopDrag() { // data n'est plus nécessaire ici si on ne traite que l'arrêt
        this.isDragging = false;
        // La logique de clic sur le bouton des contrôles assistés doit être gérée par un événement UI spécifique
        // car handleMouseUp ne sera plus appelé directement avec les coordonnées du clic.
        // L'InputController devra détecter un clic sur ce bouton et émettre EVENTS.UI.TOGGLE_ASSISTED_CONTROLS
    }

    handleToggleAssistedControlsFromUI() { // Nouveau gestionnaire pour l'événement UI
         // console.log("Assisted controls button clicked (via event)!");
         this.toggleAssistedControls(); // Appeler la méthode pour basculer l'état
    }
    
    // Émettre un seul événement pour l'état complet de la simulation
    emitUpdatedStates() {
        // Calculs des vecteurs
        const gravityVector = this.calculateGravityVector(); // Est une ACCÉLÉRATION {x,y} ou null
        const thrustVectors = this.calculateThrustVectors(); // Informations sur les propulseurs individuels (pour affichage/info)
        const totalThrustVector = this.calculateTotalThrustVector(); // Appel corrigé SANS arguments. Est une FORCE totale {x,y} ou null
        
        const lunarAttraction = this.calculateLunarAttractionVector(); // Pour information (vecteur normalisé + distance)
        const earthAttraction = this.calculateEarthAttractionVector(); // Pour information (vecteur normalisé)

        let calculatedAccelerationX = 0;
        let calculatedAccelerationY = 0;

        // Ajouter l'accélération gravitationnelle (si elle existe)
        if (gravityVector) {
            calculatedAccelerationX += gravityVector.x;
            calculatedAccelerationY += gravityVector.y;
        }

        // Ajouter l'accélération due à la poussée (Force/Masse) (si elle existe)
        if (totalThrustVector && this.rocketModel && this.rocketModel.mass > 0) {
            calculatedAccelerationX += totalThrustVector.x / this.rocketModel.mass;
            calculatedAccelerationY += totalThrustVector.y / this.rocketModel.mass;
        }
        
        const accelerationVector = { x: calculatedAccelerationX, y: calculatedAccelerationY };

        // Préparer l'état complet de la simulation à émettre
        // S'assurer que this.rocketModel est valide avant de l'utiliser extensivement
        const rocketStateForEvent = this.rocketModel ? {
            ...this.rocketModel, // Copie les propriétés de base du modèle de fusée
            // Remplace ou ajoute les vecteurs calculés spécifiquement pour cet état
            gravityVector: gravityVector,
            thrustVectors: thrustVectors,
            totalThrustVector: totalThrustVector,
            accelerationVector: accelerationVector, // Le vecteur d'accélération résultant corrigé
            lunarAttraction: lunarAttraction,
            earthAttraction: earthAttraction
        } : { // Fournir un état par défaut si rocketModel est null pour éviter les erreurs
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
        
        // Émettre l'état complet pour que les vues et autres systèmes s'y abonnent
        this.eventBus.emit(EVENTS.SIMULATION.UPDATED, simulationState);
        
        // Réinitialiser le flag de mission réussie après l'avoir émis
        if (this.missionJustSucceededFlag) {
            this.missionJustSucceededFlag = false;
        }
    }
    
    // Calculer le vecteur de gravité pour le rendu
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
    
    // Calculer les vecteurs de poussée pour le rendu
    calculateThrustVectors() {
        if (!this.rocketModel) return null;
        
        const thrustVectors = {};
        
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            if (thruster.power > 0) {
                // On ignore les thrusters latéraux pour l'affichage des vecteurs de poussée
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
    
    // Calculer le vecteur de poussée totale
    calculateTotalThrustVector() {
        if (!this.rocketModel) return null;
        
        let totalX = 0;
        let totalY = 0;
        
        // Parcourir tous les propulseurs actifs
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            // Ne considérer que les propulseurs actifs
            if (thruster.power > 0) {
                // Récupérer la position du propulseur
                const position = ROCKET.THRUSTER_POSITIONS[thrusterName.toUpperCase()];
                if (!position) continue;
                
                // Calculer l'angle de poussée en fonction du type de propulseur
                let thrustAngle;
                
                if (thrusterName === 'left' || thrusterName === 'right') {
                    // Pour les propulseurs latéraux
                    const propAngle = Math.atan2(position.distance * Math.sin(position.angle), 
                                               position.distance * Math.cos(position.angle));
                    const perpDirection = thrusterName === 'left' ? Math.PI/2 : -Math.PI/2;
                    thrustAngle = this.rocketModel.angle + propAngle + perpDirection;
                } else {
                    // Pour les propulseurs principaux
                    switch (thrusterName) {
                        case 'main': 
                            thrustAngle = this.rocketModel.angle - Math.PI/2; // Vers le haut
                            break;
                        case 'rear':
                            thrustAngle = this.rocketModel.angle + Math.PI/2; // Vers le bas
                            break;
                        default:
                            thrustAngle = this.rocketModel.angle;
                    }
                }
                
                // Calculer la force en fonction de la puissance
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
                
                // Ajouter la contribution de ce propulseur
                totalX += Math.cos(thrustAngle) * thrustForce;
                totalY += Math.sin(thrustAngle) * thrustForce;
            }
        }
        
        // Si aucune poussée, retourner null
        if (Math.abs(totalX) < 0.001 && Math.abs(totalY) < 0.001) {
            return null;
        }
        
        return { x: totalX, y: totalY };
    }
    
    // Initialiser le jeu
    init(/*canvas*/) { // canvas n'est plus passé en argument
        // Créer et utiliser GameSetupController
        const gameSetupController = new GameSetupController(
            this.eventBus,
            this.missionManager,
            { // Contrôleurs externes à passer
                renderingController: this.renderingController,
                rocketAgent: this.rocketAgent // Peut être null si non encore fourni
            }
        );

        // Initialiser les composants du jeu via GameSetupController, en passant l'instance de cameraModel
        const components = gameSetupController.initializeGameComponents(this.cameraModel);

        // Récupérer les modèles initialisés
        this.rocketModel = components.rocketModel;
        this.universeModel = components.universeModel;
        this.particleSystemModel = components.particleSystemModel;
        // this.cameraModel est déjà initialisé et configuré par GameSetupController

        // Récupérer les vues initialisées
        this.rocketView = components.rocketView;
        this.universeView = components.universeView;
        this.celestialBodyView = components.celestialBodyView;
        this.particleView = components.particleView;
        this.traceView = components.traceView;
        this.uiView = components.uiView;

        // Récupérer les contrôleurs internes initialisés
        this.physicsController = components.physicsController;
        this.particleController = components.particleController;
        this.rocketController = components.rocketController;
        this.rocketAgent = components.rocketAgent; // Mettre à jour rocketAgent au cas où il a été créé/modifié par GameSetupController
        
        // Réinitialiser l'état de la fusée AVANT de démarrer la boucle
        this.resetRocket(); // S'assurer que resetRocket utilise les modèles/contrôleurs maintenant initialisés
        
        // Démarrer la boucle de jeu principale SEULEMENT après la réinitialisation
        this.start();
        
        console.log("GameController initialisé (via GameSetupController) et boucle démarrée.");
    }
    
    // Définir les contrôleurs (appelée depuis main.js)
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
    
    // Configurer les modèles
    // setupModels() { ... } // SUPPRIMÉ - Géré par GameSetupController
    
    // Configurer les vues
    // setupViews() { ... } // SUPPRIMÉ - Géré par GameSetupController
    
    // Configurer la caméra
    // setupCamera() { ... } // SUPPRIMÉ - Géré par GameSetupController
    
    // Configurer les contrôleurs
    // setupControllers() { ... } // SUPPRIMÉ - Géré par GameSetupController
    
    // Démarrer la boucle de jeu
    start() {
        if (!this.isRunning) { // Empêcher les démarrages multiples
            this.isRunning = true; // Marquer comme en cours d'exécution en premier
            this.lastTimestamp = performance.now(); // Initialiser lastTimestamp
            
            // Si this.isPaused est vrai ici, cela signifie que l'onglet était caché
            // lors de l'appel au constructeur, avant que les autres contrôleurs ne s'abonnent.
            // Émettre GAME_PAUSED maintenant pour que tous les auditeurs le reçoivent.
            if (this.isPaused) {
                console.log("GameController: Le jeu démarre en état de pause. Émission de GAME_PAUSED.");
                this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
                // Ne pas mettre this.isPaused = false ni émettre GAME_RESUMED.
                // Le jeu doit légitimement démarrer en pause.
            }

            requestAnimationFrame((timestamp) => this.gameLoop(timestamp));
            console.log("GameController started.");
        }
    }
    
    // Mettre le jeu en pause
    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            console.log(this.isPaused ? "Jeu mis en pause (appel direct togglePause)" : "Jeu repris (appel direct togglePause)");
            this.eventBus.emit(EVENTS.GAME.GAME_PAUSED);
        } else {
            this.eventBus.emit(EVENTS.GAME.GAME_RESUMED);
        }
    }
    
    // La boucle de jeu principale
    gameLoop(timestamp) {
        if (!this.isRunning) return;

        const deltaTime = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;
        this.elapsedTime += deltaTime;

        if (!this.isPaused) {
            this.update(deltaTime);
        }

        const activeMissionsForRender = this.missionManager ? this.missionManager.getActiveMissions() : [];
        const totalAccelerationForRender = this.physicsController && this.physicsController.physicsVectors 
            ? this.physicsController.physicsVectors.getTotalAcceleration() 
            : null;
        
        this.renderingController.render(
            this.elapsedTime,             // 1. time
            this.rocketModel,             // 2. rocketModel
            this.universeModel,           // 3. universeModel
            this.particleSystemModel,     // 4. particleSystemModel
            this.cameraModel,             // 5. camera
            activeMissionsForRender,      // 6. activeMissions
            this.totalCreditsEarned,      // 7. totalCreditsEarned
            this.missionJustSucceededFlag // 8. missionJustSucceeded
        );

        // Réinitialiser le flag APRÈS l'avoir utilisé pour le rendu
        if (this.missionJustSucceededFlag) {
            this.missionJustSucceededFlag = false;
        }

        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    // Réinitialiser la fusée
    resetRocket() {
        // Déclarer startLocation au début de la fonction
        let startLocation = 'Terre';
        
        // Effacer le timer de réinitialisation auto si présent
        if (this.crashResetTimer) {
            clearTimeout(this.crashResetTimer);
            this.crashResetTimer = null;
        }
        
        // Nettoyer les traces existantes
        // this.clearAllTraces(); // Supprimé car fait à la fin

        // Créer les modèles si nécessaire (ou juste réinitialiser)
        if (!this.rocketModel) {
            this.setupModels();
        } else {
            // Réinitialiser l'état de base du modèle (fuel, health, vitesse, etc.)
            this.rocketModel.reset();
            // Réinitialiser le cargo (VIDE initialement)
            this.rocketModel.cargo = new RocketCargo(); 
            // Réinitialiser les crédits à 10
            this.totalCreditsEarned = 10;

            // --- Repositionner la fusée sur Terre ---            
            const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
            // startLocation est déjà 'Terre', on le met à null seulement si Earth n'est pas trouvée
            if (earth) {
                const angleVersSoleil = Math.atan2(earth.position.y - this.universeModel.celestialBodies[0].position.y, 
                                                 earth.position.x - this.universeModel.celestialBodies[0].position.x);
                const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                this.rocketModel.setPosition(rocketStartX, rocketStartY);
                // Donner la vélocité de la Terre et orienter
                this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
                this.rocketModel.setAngle(angleVersSoleil); 
                this.rocketModel.isLanded = true; // Définir comme posé après repositionnement
                this.rocketModel.landedOn = 'Terre';

                // --- Mettre à jour la caméra --- 
                if (this.cameraModel) {
                    this.cameraModel.setPosition(rocketStartX, rocketStartY);
                }
                // Supprimer l'update de la trace ici, car elle est faite à la fin
                // if (this.traceView) {
                //    this.traceView.update(this.rocketModel.position, false, null); 
                // }
                // -----------------------------------------

            } else {
                console.error("Impossible de trouver la Terre pour repositionner la fusée.");
                startLocation = null; // Mettre à null si Earth n'est pas trouvée
            }
            // -----------------------------------------

            // Réinitialiser le système de particules lié à la fusée
            if (this.particleController) { // Vérifier si particleController existe
                this.particleController.reset(); 
            }
        }

        // Réinitialiser le moteur physique (positions, vitesses, etc.)
        if (this.physicsController) {
            this.physicsController.resetPhysics(this.rocketModel, this.universeModel); // Appeler la méthode resetPhysics du PhysicsController
        }

        // Réinitialiser le temps et l'état de pause
        this.lastTimestamp = performance.now();
        this.elapsedTime = 0;
        this.isPaused = false;

        // --- Nettoyer la trace et ajouter le premier point --- 
        if (this.traceView) {
            this.clearAllTraces(); // Effacer les anciennes traces
            // Ajouter le premier point de trace APRÈS que la position de la fusée soit définie
            this.traceView.update(this.rocketModel.position);
            console.log(`%c[GameController] resetRocket: Trace effacée et premier point ajouté à (${this.rocketModel.position.x.toFixed(2)}, ${this.rocketModel.position.y.toFixed(2)})`, 'color: green;');
        }
        // --------------------------------------------------

        // Réinitialiser les missions
        if (this.missionManager) {
            this.missionManager.resetMissions();
        }
        
        // CHARGER LE CARGO POUR LA MISSION AU POINT DE DÉPART
        // Vérifier que startLocation n'est pas null (au cas où Earth n'a pas été trouvée)
        if(startLocation){
            this.loadCargoForCurrentLocationMission(startLocation);
        }

        // ---- AJOUT ----
        // Rétablir le suivi de la caméra sur la fusée
        if (this.cameraModel && this.rocketModel) {
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
        }
        // -------------

        console.log("Fusée réinitialisée.");
        this._lastRocketDestroyed = false;
        this.emitUpdatedStates(); // Assurer que l'état (y compris les particules vides) est propagé immédiatement
    }
    
    // Nouvelle méthode pour encapsuler la logique de mise à jour du jeu
    update(deltaTime) {
        if (this.inputController) {
            this.inputController.update(); // Pour la gestion continue (ex: joystick)
        }

        if (this.universeModel) {
            this.universeModel.update(deltaTime); // Met à jour les orbites des corps célestes (modèles)
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
            this.rocketModel.update(deltaTime); // Contient la logique de carburant, etc.
        }

        if (this.cameraModel) {
            this.cameraModel.update(deltaTime);
        }

        // Mettre à jour la trace de la fusée avec sa nouvelle position
        this.updateTrace();

        // Logique de fin de mission (peut être gardée ici ou dans une méthode spécifique appelée par update)
        if (this.missionManager && this.rocketModel && !this.rocketModel.isDestroyed) {
            this.missionManager.checkMissionCompletion(this.rocketModel, this.universeModel);
        }
    }
    
    // Nettoyer les ressources
    cleanup() {
        this.isRunning = false;
        
        // Désabonner des événements
        if (this.eventBus) {
            // Les événements seront nettoyés par l'EventBus lui-même
        }
    }

    // Active ou désactive l'affichage des positions des propulseurs
    toggleThrusterPositions() {
        if (this.rocketView) {
            this.rocketView.setShowThrusterPositions(!this.rocketView.showThrusterPositions);
        }
    }

    // Ajuster le multiplicateur de poussée
    adjustThrustMultiplier(factor) {
        const currentMultiplier = PHYSICS.THRUST_MULTIPLIER;
        const newMultiplier = currentMultiplier * factor;
        
        // Limiter le multiplicateur à des valeurs raisonnables
        const minMultiplier = 0.1;
        const maxMultiplier = 1000;
        
        PHYSICS.THRUST_MULTIPLIER = Math.max(minMultiplier, Math.min(maxMultiplier, newMultiplier));
        
        console.log(`Multiplicateur de poussée: ${PHYSICS.THRUST_MULTIPLIER.toFixed(2)}x`);
        
        // Force une mise à jour de l'analyse des exigences de poussée
        if (this.physicsController) {
            this.physicsController._lastThrustCalculation = 0;
        }
    }

    // Activer/désactiver l'affichage de la trace
    toggleTraceVisibility() {
        if (this.renderingController) {
            this.renderingController.toggleTraceVisibility();
            // Le log est maintenant dans RenderingController, donc plus besoin ici.
            // console.log(`Affichage de la trace: ${this.traceView.isVisible ? 'activé' : 'désactivé'}`);
        }
    }

    // Activer/désactiver tous les vecteurs (gravité, poussée et vitesse)
    toggleVectors() {
        if (this.renderingController) {
            this.renderingController.toggleVectors();
        }
    }

    // Gérer les mises à jour d'état de la fusée
    handleRocketStateUpdated(data) {
        if (data.isDestroyed && !this._lastRocketDestroyed) {
            console.log("Fusée détruite - Appuyez sur R pour réinitialiser");
        }
        this._lastRocketDestroyed = !!data.isDestroyed;
    }

    // Mettre à jour la trace de la fusée
    updateTrace() {
        if (!this.rocketModel || !this.traceView) return;
        
        // Vérifier si la fusée est attachée à la lune (détruite ou simplement posée)
        const isAttachedToMoon = (this.rocketModel.isDestroyed && (this.rocketModel.attachedTo === 'Lune' || this.rocketModel.landedOn === 'Lune')) || 
                                  (this.rocketModel.landedOn === 'Lune');
        
        // Si la fusée est attachée à la lune, on a besoin de la position de la lune
        let moonPosition = null;
        if (isAttachedToMoon) {
            // Trouver la lune dans l'univers
            const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
            if (moon) {
                moonPosition = moon.position;
            }
        }
        
        // Ajouter le point à la trace avec l'information d'attachement à la lune
        this.traceView.update(this.rocketModel.position, isAttachedToMoon, moonPosition);
    }

    // Basculer les contrôles assistés
    toggleAssistedControls() {
        if (this.physicsController && this.uiView) {
            // Basculer l'état des contrôles assistés dans le contrôleur physique
            const assistedEnabled = this.physicsController.toggleAssistedControls();
            
            // Synchroniser l'état avec la vue UI
            this.uiView.assistedControlsActive = assistedEnabled;
            
            console.log(`Contrôles assistés: ${assistedEnabled ? 'activés' : 'désactivés'}`);
        }
    }

    // Nettoyer toutes les traces
    clearAllTraces() {
        if (this.traceView) {
            this.traceView.clear(true); // true = effacer toutes les traces
        }
    }

    // Calculer le vecteur d'attraction vers la Lune
    calculateLunarAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Lune dans les corps célestes
        const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
        if (!moon) return null;
        
        // Calculer le vecteur d'attraction
        const dx = moon.position.x - this.rocketModel.position.x;
        const dy = moon.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Retourner le vecteur et la distance
        return { 
            vector: { x: dx / distance, y: dy / distance }, // Vecteur normalisé
            distance: distance // Distance à la Lune
        };
    }

    // Méthode pour activer/désactiver le contrôle par IA
    toggleAIControl() {
        if (!this.rocketAgent) return;
        
        // Émettre l'événement pour activer/désactiver l'agent
        this.eventBus.emit(EVENTS.AI.TOGGLE, {});
        console.log('Basculement du contrôle IA');
    }

    // Calculer la distance à la Terre
    calculateEarthDistance() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Terre dans les corps célestes
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        // Calculer la distance entre la fusée et la Terre
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Soustraire le rayon de la Terre pour obtenir la distance à la surface
        const surfaceDistance = Math.max(0, distance - earth.radius);
        
        return surfaceDistance;
    }

    // Calculer le vecteur d'attraction vers la Terre
    calculateEarthAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Terre dans les corps célestes
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        // Calculer le vecteur d'attraction
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Retourner le vecteur normalisé qui pointe vers la Terre
        return { x: dx / distance, y: dy / distance };
    }

    // Gérer l'atterrissage de la fusée
    handleRocketLanded(data) {
        // VÉRIFICATION IMPORTANTE : Ne traiter que si la fusée est ACTUELLEMENT considérée comme posée.
        // Cela empêche le traitement multiple si l'événement est déclenché par erreur après une fausse détection de décollage.
        if (!this.rocketModel || !this.rocketModel.isLanded) { 
            console.log(`%c[GameController] Événement ROCKET_LANDED ignoré pour ${data.landedOn} car rocketModel.isLanded est false.`, 'color: orange;');
            return; 
        }

        console.log(`%c[GameController] Événement ROCKET_LANDED reçu pour: ${data.landedOn} (isLanded=${this.rocketModel.isLanded})`, 'color: #ADD8E6');
        
        // ----- Logique de mission et cargo exécutée IMMÉDIATEMENT -----
        // Re-vérifier rocketModel juste avant d'agir (sécurité)
        if (!this.rocketModel) return;

        // Vérifier et gérer la complétion de mission
        if (this.missionManager && this.rocketModel.cargo) {
            const completedMissions = this.missionManager.checkMissionCompletion(this.rocketModel.cargo, data.landedOn);
            
            // Traiter les conséquences du succès ICI
            if (completedMissions.length > 0) {
                console.log(`%c[GameController] ${completedMissions.length} mission(s) complétée(s) !`, 'color: lightgreen;');
                // Activer le flag pour l'affichage
                this.missionJustSucceededFlag = true; 
                completedMissions.forEach(mission => {
                    // Ajouter les récompenses au total
                    this.totalCreditsEarned += mission.reward;
                    console.log(`%c[GameController] +${mission.reward} crédits gagnés ! Total: ${this.totalCreditsEarned}`, 'color: gold;');
                    // Log déchargement du cargo
                    console.log(`%c[GameController] Cargo déchargé pour la mission ${mission.id}`, 'color: orange;');
                    // Émettre les événements de succès (si nécessaire pour l'UI ou autre)
                    this.eventBus.emit(EVENTS.UI.CREDITS_UPDATED, { reward: mission.reward }); 
                    this.eventBus.emit(EVENTS.MISSION.COMPLETED, { mission: mission }); // Passer la mission complétée
                });
            }
            // FIN MODIFICATION
            
            // TENTER DE CHARGER LE CARGO POUR LA PROCHAINE MISSION
            // S'assurer que rocketModel existe toujours
            if (this.rocketModel) { 
               this.loadCargoForCurrentLocationMission(data.landedOn);
            }
        }
        // -------------------------------------------------
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
            console.log(`%c[GameController] Détection de la mission suivante au départ de ${location}. Tentative de chargement du cargo requis.`, 'color: magenta;');
            
            // Vider le cargo actuel avant de charger celui de la mission
            this.rocketModel.cargo = new RocketCargo(); 
            let allLoaded = true;

            nextMission.requiredCargo.forEach(item => {
                const loaded = this.rocketModel.cargo.addCargo(item.type, item.quantity);
                if (!loaded) {
                    allLoaded = false;
                    console.warn(`[GameController] Échec du chargement de ${item.quantity} x ${item.type} pour la mission ${nextMission.id}. Capacité dépassée ?`);
                }
            });

            if (allLoaded) {
                const cargoString = nextMission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
                console.log(`%c[GameController] Cargo chargé pour la mission ${nextMission.id}: ${cargoString}`, 'color: lightblue;');
            }
             // L'affichage UI se met à jour via la boucle de rendu principale,
             // pas besoin d'un appel explicite ici.
             // if (this.uiView) {
             //    this.uiView.updateCargoDisplay(this.rocketModel.cargo.getCargoList());
             // }
        } else {
            console.log(`%c[GameController] Aucune mission active au départ de ${location} trouvée. Pas de chargement automatique de cargo.`, 'color: gray;');
        }
    }

    // --- Gestionnaires d'événements Joystick ---

    handleJoystickAxisChanged(data) {
        // Cet événement n'est déclenché qu'une fois lorsque l'axe change d'état (0 -> valeur ou valeur -> 0)
        if (!this.rocketModel || this.isPaused) return;

        const axisThreshold = this.inputController ? this.inputController.axisThreshold : 0.1;

        switch (data.action) {
            case 'rotate': // Mappé à l'axe horizontal (0) dans InputController
                 // La logique de rotation est bonne ici, car elle doit réagir au changement
                 // et s'arrêter quand l'axe revient à 0.
                const rotateValue = data.value;
                const power = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.RIGHT; // Utilise la puissance DROITE
              //  console.log(`%c[GC Joystick Rotate - CHANGED] Axe 0: ${rotateValue.toFixed(2)}`, 'color: purple');
                if (rotateValue < 0) { 
                    this.rocketModel.setThrusterPower('right', power); 
                    this.rocketModel.setThrusterPower('left', 0);
                    this.particleSystemModel.setEmitterActive('right', power > 0.1);
                    this.particleSystemModel.setEmitterActive('left', false);
                } else if (rotateValue > 0) { 
                    const powerLeft = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.LEFT; // Utilise la puissance GAUCHE
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

            // RETRAIT de la logique de zoom ici, elle est gérée par AXIS_HELD
            /*
            case 'zoomAxis': 
                // ... ancienne logique ...
                break;
            */
        }
        // Pas besoin d'emitUpdatedStates ici car AXIS_HELD le fera si nécessaire
        // this.emitUpdatedStates(); 
    }
    
    // NOUVELLE MÉTHODE : Gère les axes maintenus
    handleJoystickAxisHeld(data) {
         if (!this.cameraModel || this.isPaused) return;
         
         switch(data.action) {
             case 'zoomAxis': // Mappé à l'axe 3
                 const zoomValue = data.value; // Valeur ajustée (-1 à 1)
                 const zoomSpeedFactor = Math.abs(zoomValue) * RENDER.ZOOM_SPEED * 1.5; // Ajuster le *1.5 si besoin
                 
                 if (zoomValue < 0) { // Zoom In
                      // console.log(`%c[GC Joystick Zoom - HELD] Axe 3: ${zoomValue.toFixed(2)} -> Zoom In`, 'color: cyan'); // Spam
                      this.cameraModel.setZoom(this.cameraModel.zoom * (1 + zoomSpeedFactor * (60/1000))); // Appliquer proportionnellement au framerate (approx)
                 } else if (zoomValue > 0) { // Zoom Out
                     // console.log(`%c[GC Joystick Zoom - HELD] Axe 3: ${zoomValue.toFixed(2)} -> Zoom Out`, 'color: cyan'); // Spam
                     this.cameraModel.setZoom(this.cameraModel.zoom / (1 + zoomSpeedFactor * (60/1000))); // Appliquer proportionnellement au framerate (approx)
                 }
                 // Mettre à jour l'état ici car le zoom a changé
                 this.emitUpdatedStates(); 
                 break;
            // Gérer d'autres axes maintenus si nécessaire (ex: poussée analogique)
            /*
             case 'thrustAxis': // Si on avait un axe pour la poussée principale
                  const thrustPower = Math.abs(data.value) * ROCKET.THRUSTER_POWER.MAIN;
                  this.rocketModel.setThrusterPower('main', thrustPower);
                  this.particleSystemModel.setEmitterActive('main', thrustPower > 0.1);
                  this.emitUpdatedStates();
                  break;
            */
         }
    }
    
    // NOUVELLE MÉTHODE : Gère le relâchement d'un axe (optionnel)
    handleJoystickAxisReleased(data) {
        // Utile si on doit arrêter une action spécifique au relâchement
        // console.log(`%c[GC Joystick Axis Released] Action: ${data.action}, Axe: ${data.axis}`, 'color: brown;');
        switch(data.action) {
            case 'rotate': // Quand on relâche l'axe de rotation
                 // Normalement géré par AXIS_CHANGED avec valeur 0, mais sécurité supplémentaire
                 // this.rocketModel.setThrusterPower('left', 0);
                 // this.rocketModel.setThrusterPower('right', 0);
                 // this.particleSystemModel.setEmitterActive('left', false);
                 // this.particleSystemModel.setEmitterActive('right', false);
                 break;
             // Pas besoin de gérer 'zoomAxis' ici, s'arrête naturellement
        }
    }

    toggleGravityField() {
        if (this.renderingController && typeof this.renderingController.toggleGravityField === 'function') {
            this.renderingController.toggleGravityField();
        }
    }

    // NOUVELLE MÉTHODE pour gérer le redimensionnement du canvas
    handleCanvasResized(data) {
        if (this.cameraModel && data) {
            this.cameraModel.width = data.width;
            this.cameraModel.height = data.height;
            this.cameraModel.offsetX = data.width / 2;
            this.cameraModel.offsetY = data.height / 2;
            console.log(`[GameController] CameraModel dimensions updated due to canvas resize: ${data.width}x${data.height}`);

            // Si le jeu est en cours et n'est pas en pause, emitUpdatedStates sera appelé par la boucle de jeu.
            // Si le jeu est en pause, il faut s'assurer que l'UI est redessinée avec la nouvelle taille.
            // Un emitUpdatedStates pourrait être trop lourd si appelé à chaque pixel de resize.
            // Normalement, le RenderingController devrait gérer le redessin complet en pause.
            // Cependant, si des éléments de l'UI dépendent de CameraModel pour leur positionnement/taille
            // et que le jeu est en pause, il faut forcer un redessin.
            // Pour l'instant, on suppose que le prochain cycle de rendu (si actif) ou le render en pause du UIView suffira.
            // Si ce n'est pas le cas, un this.eventBus.emit(EVENTS.UI.NEEDS_REDRAW_STATIC) pourrait être une option plus ciblée.
        }
    }
} 