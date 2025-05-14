/**
 * @file GameSetupController.js
 * @class GameSetupController
 * @description Gère l'initialisation et la configuration de tous les composants majeurs du jeu
 * (modèles, vues, contrôleurs internes, agent IA) avant le démarrage de la boucle de jeu principale.
 * Il s'assure que toutes les dépendances sont correctement injectées et que les objets sont prêts à l'emploi.
 */
class GameSetupController {
    /**
     * Crée une instance de GameSetupController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication entre modules.
     * @param {MissionManager} missionManager - Le gestionnaire de missions.
     * @param {Object} externalControllers - Un objet contenant les contrôleurs externes requis.
     * @param {RenderingController} externalControllers.renderingController - Le contrôleur de rendu.
     * @param {RocketAgent} [externalControllers.rocketAgent] - L'agent IA pour la fusée (optionnel).
     */
    constructor(eventBus, missionManager, externalControllers) {
        this.eventBus = eventBus;
        this.missionManager = missionManager;
        this.renderingController = externalControllers.renderingController; // Reçoit RenderingController
        this.rocketAgent = externalControllers.rocketAgent; // Reçoit RocketAgent (peut être undefined)

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

    /**
     * Initialise tous les composants de base du jeu.
     * Cette méthode orchestre la création des modèles, des contrôleurs internes, des vues et la configuration de la caméra.
     * @param {CameraModel} cameraModelInstance - L'instance du modèle de caméra, généralement fournie par GameController.
     * @returns {Object} Un objet contenant les instances des composants initialisés.
     * @property {RocketModel} rocketModel - Le modèle de la fusée.
     * @property {UniverseModel} universeModel - Le modèle de l'univers.
     * @property {ParticleSystemModel} particleSystemModel - Le modèle du système de particules.
     * @property {RocketView} rocketView - La vue de la fusée.
     * @property {UniverseView} universeView - La vue de l'univers.
     * @property {CelestialBodyView} celestialBodyView - La vue des corps célestes.
     * @property {ParticleView} particleView - La vue des particules.
     * @property {TraceView} traceView - La vue de la trace de la fusée.
     * @property {UIView} uiView - La vue de l'interface utilisateur.
     * @property {PhysicsController} physicsController - Le contrôleur de physique.
     * @property {ParticleController} particleController - Le contrôleur de particules.
     * @property {RocketController} rocketController - Le contrôleur de la fusée.
     * @property {RocketAgent} rocketAgent - L'agent IA de la fusée (créé ou fourni).
     */
    initializeGameComponents(cameraModelInstance) {
        this.cameraModel = cameraModelInstance; // Utilise l'instance passée par GameController

        this._setupModels();
        this._setupInternalControllers(); // Doit être appelé APRÈS _setupModels et que cameraModel est disponible
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

    /**
     * @private
     * Initialise les modèles de données du jeu (Univers, Fusée, Particules).
     * Positionne la fusée initialement par rapport à la Terre et au Soleil.
     */
    _setupModels() {
        try {
            this.universeModel = new UniverseModel();
            const bodies = this.celestialBodyFactory.createCelestialBodies();
            bodies.forEach(body => this.universeModel.addCelestialBody(body));

            this.rocketModel = new RocketModel();
            const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
            
            // Positionnement initial de la fusée :
            // La fusée est placée sur la "face éclairée" de la Terre, légèrement au-dessus de sa surface.
            if (earth) {
                const sun = this.universeModel.celestialBodies.find(body => body.name === 'Soleil') || { position: { x: 0, y: 0 } }; // Fallback si Soleil non trouvé
                // Calcul de l'angle entre la Terre et le Soleil pour déterminer le côté "éclairé"
                const angleVersSoleil = Math.atan2(earth.position.y - sun.position.y, 
                                                 earth.position.x - sun.position.x);
                // Positionne la fusée à l'extérieur du rayon terrestre, sur l'axe Terre-Soleil
                const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                
                this.rocketModel.setPosition(rocketStartX, rocketStartY);
                this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y); // Vitesse initiale de la fusée = vitesse de la Terre
                this.rocketModel.setAngle(angleVersSoleil); // Oriente la fusée vers le Soleil
            } else {
                console.error("GameSetupController: La Terre n'a pas été trouvée pour positionner la fusée initialement. Utilisation des positions par défaut.");
                this.rocketModel.setPosition(ROCKET.INITIAL_X, ROCKET.INITIAL_Y); 
            }
            
            this.particleSystemModel = new ParticleSystemModel();
            // Configuration initiale des angles des émetteurs de particules (pourraient être des valeurs par défaut dans ParticleSystemModel)
            this.particleSystemModel.updateEmitterAngle('main', Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('rear', -Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('left', 0);
            this.particleSystemModel.updateEmitterAngle('right', Math.PI);

        } catch (error) {
            console.error("Erreur lors de l'initialisation des modèles (GameSetupController):", error);
        }
    }

    /**
     * @private
     * Initialise les vues du jeu et les enregistre auprès du RenderingController.
     * Nécessite que le RenderingController et les modèles de données soient déjà initialisés.
     */
    _setupViews() {
        this.rocketView = new RocketView();
        this.universeView = new UniverseView();
        this.celestialBodyView = new CelestialBodyView();
        this.particleView = new ParticleView();
        this.traceView = new TraceView();
        this.uiView = new UIView(this.eventBus);
        
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

    /**
     * @private
     * Configure la caméra du jeu.
     * Définit la cible de la caméra (la fusée) et ajuste ses dimensions et son décalage
     * en fonction de la taille du canvas fournie par le RenderingController.
     * Nécessite que RenderingController, CameraModel et RocketModel soient prêts.
     */
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

    /**
     * @private
     * Initialise les contrôleurs internes du jeu (Physique, Particules, Fusée) et configure l'agent IA (RocketAgent).
     * Gère la création de RocketAgent s'il n'est pas fourni, ou l'injection de dépendances s'il est fourni.
     * Émet un événement lorsque la configuration des contrôleurs est terminée.
     * Nécessite que les modèles de données, l'EventBus, le CameraModel et le MissionManager soient disponibles.
     */
    _setupInternalControllers() {
        // Vérification des dépendances cruciales avant d'initialiser les contrôleurs
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

        // Gestion de RocketAgent : création ou configuration
        if (!this.rocketAgent) {
             // Si RocketAgent n'a pas été fourni, on tente de le créer.
             if (this.rocketModel && this.universeModel && this.physicsController && this.missionManager && this.rocketController) {
                console.log("GameSetupController: Création de RocketAgent car non fourni.");
                this.rocketAgent = new RocketAgent(this.eventBus, this.rocketModel, this.universeModel, this.physicsController, this.missionManager, this.rocketController);
            } else {
                // Avertissement si les dépendances ne sont pas prêtes pour créer RocketAgent ici.
                // Cela peut arriver si missionManager, par exemple, n'est pas encore initialisé ou fourni correctement.
                console.warn("GameSetupController: RocketAgent non fourni et les dépendances ne sont pas prêtes pour le créer ici (Vérifier missionManager).");
            }
        } else {
             // Si RocketAgent a été fourni, on s'assure qu'il a toutes ses dépendances.
             // Cela suppose que RocketAgent a une méthode pour injecter les dépendances manquantes ou les mettre à jour.
             if (this.rocketAgent && typeof this.rocketAgent.injectDependencies === 'function') {
                this.rocketAgent.injectDependencies({
                    rocketModel: this.rocketModel,
                    universeModel: this.universeModel,
                    physicsController: this.physicsController,
                    missionManager: this.missionManager, 
                    rocketController: this.rocketController
                });
            }
        }

        // Émission d'un événement pour signaler que les contrôleurs principaux sont prêts.
        this.eventBus.emit(window.EVENTS.SYSTEM.CONTROLLERS_SETUP, { 
            physicsController: this.physicsController, 
            rocketController: this.rocketController,
            rocketAgent: this.rocketAgent // Transmettre l'instance de rocketAgent (créée ou fournie)
        });
    }
} 