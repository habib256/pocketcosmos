class GameSetupController {
    constructor(eventBus, missionManager, externalControllers) {
        this.eventBus = eventBus;
        this.missionManager = missionManager;
        this.renderingController = externalControllers.renderingController; // Reçoit RenderingController
        this.rocketAgent = externalControllers.rocketAgent; // Reçoit RocketAgent

        // Modèles à créer
        this.rocketModel = null;
        this.universeModel = null;
        this.particleSystemModel = null;
        this.cameraModel = null; // Sera initialisé et passé par GameController

        // Vues à créer
        this.rocketView = null;
        this.universeView = null;
        this.celestialBodyView = null;
        this.particleView = null;
        this.traceView = null;
        this.uiView = null;

        // Contrôleurs internes à créer
        this.physicsController = null;
        this.particleController = null;
        this.rocketController = null;

        this.celestialBodyFactory = new CelestialBodyFactory();
    }

    initializeGameComponents(cameraModelInstance) {
        this.cameraModel = cameraModelInstance; // Utilise l'instance passée par GameController

        this._setupModels();
        this._setupInternalControllers(); // Doit être appelé APRÈS _setupModels et cameraModel est disponible
        this._setupViews(); // Doit être appelé APRÈS que renderingController soit prêt et que les modèles existent
        this._setupCamera(); // Doit être appelé APRÈS que renderingController et rocketModel soient prêts

        // Retourne les composants initialisés pour que GameController puisse les stocker
        return {
            rocketModel: this.rocketModel,
            universeModel: this.universeModel,
            particleSystemModel: this.particleSystemModel,
            // cameraModel est déjà géré par GameController
            
            rocketView: this.rocketView,
            universeView: this.universeView,
            celestialBodyView: this.celestialBodyView,
            particleView: this.particleView,
            traceView: this.traceView,
            uiView: this.uiView,

            physicsController: this.physicsController,
            particleController: this.particleController,
            rocketController: this.rocketController,
            rocketAgent: this.rocketAgent // Retourne rocketAgent (qu'il soit fourni ou créé ici)
        };
    }

    _setupModels() {
        try {
            this.universeModel = new UniverseModel();
            const bodies = this.celestialBodyFactory.createCelestialBodies();
            bodies.forEach(body => this.universeModel.addCelestialBody(body));

            this.rocketModel = new RocketModel();
            const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
            if (earth) {
                const sun = this.universeModel.celestialBodies.find(body => body.name === 'Soleil') || { position: { x: 0, y: 0 } }; // Fallback si Soleil non trouvé
                const angleVersSoleil = Math.atan2(earth.position.y - sun.position.y, 
                                                 earth.position.x - sun.position.x);
                const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                this.rocketModel.setPosition(rocketStartX, rocketStartY);
                this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
                this.rocketModel.setAngle(angleVersSoleil);
            } else {
                console.error("GameSetupController: La Terre n'a pas été trouvée pour positionner la fusée initialement.");
                this.rocketModel.setPosition(ROCKET.INITIAL_X, ROCKET.INITIAL_Y); 
            }
            
            this.particleSystemModel = new ParticleSystemModel();
            this.particleSystemModel.updateEmitterAngle('main', Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('rear', -Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('left', 0);
            this.particleSystemModel.updateEmitterAngle('right', Math.PI);

        } catch (error) {
            console.error("Erreur lors de l'initialisation des modèles (GameSetupController):", error);
        }
    }

    _setupViews() {
        this.rocketView = new RocketView();
        this.universeView = new UniverseView();
        this.celestialBodyView = new CelestialBodyView();
        this.particleView = new ParticleView();
        this.traceView = new TraceView();
        this.uiView = new UIView();
        
        if (this.renderingController) {
            this.renderingController.initViews(
                this.rocketView,
                this.universeView,
                this.celestialBodyView,
                this.particleView,
                this.traceView,
                this.uiView
            );
        } else {
            console.error("GameSetupController: RenderingController non disponible pour initialiser les vues.");
        }
    }

    _setupCamera() {
        if (!this.renderingController) {
            console.error("GameSetupController: RenderingController non disponible pour configurer la caméra.");
            return;
        }
        if (!this.cameraModel) {
            console.error("GameSetupController: CameraModel non disponible pour configurer la caméra.");
            return;
        }
         if (!this.rocketModel) {
            console.error("GameSetupController: RocketModel non disponible pour configurer la caméra.");
            return;
        }

        const canvasSize = this.renderingController.getCanvasDimensions();
        this.cameraModel.setTarget(this.rocketModel, 'rocket');
        this.cameraModel.offsetX = canvasSize.width / 2;
        this.cameraModel.offsetY = canvasSize.height / 2;
        this.cameraModel.width = canvasSize.width;
        this.cameraModel.height = canvasSize.height;
    }

    _setupInternalControllers() {
        if (!this.rocketModel || !this.particleSystemModel || !this.universeModel || !this.eventBus || !this.cameraModel || !this.missionManager) {
            console.error("GameSetupController: Dépendances manquantes pour initialiser les contrôleurs internes.", 
                {
                    rocketModel: !!this.rocketModel,
                    particleSystemModel: !!this.particleSystemModel,
                    universeModel: !!this.universeModel,
                    eventBus: !!this.eventBus,
                    cameraModel: !!this.cameraModel,
                    missionManager: !!this.missionManager
                }
            );
            return;
        }

        this.physicsController = new PhysicsController(this.eventBus);
        this.particleController = new ParticleController(this.particleSystemModel, this.eventBus);
        
        this.rocketController = new RocketController(
            this.eventBus, 
            this.rocketModel, 
            this.physicsController, 
            this.particleController, 
            this.cameraModel 
        );

        if (this.rocketController && typeof this.rocketController.subscribeToEvents === 'function') {
            this.rocketController.subscribeToEvents();
        } else {
            console.error("GameSetupController: RocketController est invalide ou n'a pas de méthode subscribeToEvents.");
        }

        if (!this.rocketAgent) {
             if (this.rocketModel && this.universeModel && this.physicsController && this.missionManager && this.rocketController) {
                console.log("GameSetupController: Création de RocketAgent car non fourni.");
                this.rocketAgent = new RocketAgent(this.eventBus, this.rocketModel, this.universeModel, this.physicsController, this.missionManager, this.rocketController);
            } else {
                console.warn("GameSetupController: RocketAgent non fourni et les dépendances ne sont pas prêtes pour le créer ici (Vérifier missionManager).");
            }
        } else {
             if (this.rocketAgent && typeof this.rocketAgent.setRocketController === 'function') {
                 // Potentiellement utile si RocketAgent a besoin d'une référence directe à rocketController post-instanciation.
                 // this.rocketAgent.setRocketController(this.rocketController);
             }
             // Si RocketAgent a été passé, on s'assure qu'il a toutes ses dépendances si ce n'est déjà fait
             // Cela suppose que RocketAgent a une méthode pour injecter les dépendances manquantes
             if (this.rocketAgent && typeof this.rocketAgent.injectDependencies === 'function') {
                this.rocketAgent.injectDependencies({
                    rocketModel: this.rocketModel,
                    universeModel: this.universeModel,
                    physicsController: this.physicsController,
                    missionManager: this.missionManager, // Assurez-vous que missionManager est disponible
                    rocketController: this.rocketController
                });
            }
        }

        this.eventBus.emit(window.EVENTS.SYSTEM.CONTROLLERS_SETUP, { 
            physicsController: this.physicsController, 
            rocketController: this.rocketController,
            rocketAgent: this.rocketAgent // Transmettre l'instance de rocketAgent
        });
    }
} 