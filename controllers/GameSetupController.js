/**
 * @file GameSetupController.js
 * Orchestre l'initialisation et la configuration de tous les composants majeurs du jeu.
 * Assure que les modèles, vues, contrôleurs internes et l'agent IA sont prêts avant le démarrage de la boucle de jeu.
 */

/**
 * @class GameSetupController
 * @classdesc Gère l'initialisation et la configuration des composants du jeu.
 * Cette classe est responsable de la création et de la configuration initiales
 * des modèles de données (univers, fusée, particules), des vues associées,
 * des contrôleurs internes (physique, particules, fusée) et de l'agent IA.
 * Elle injecte les dépendances nécessaires et s'assure que tous les modules
 * sont prêts à l'emploi pour le `GameController`.
 */
class GameSetupController {
    /**
     * Crée une instance de GameSetupController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication entre modules.
     * @param {MissionManager} missionManager - Le gestionnaire de missions, essentiel pour la logique des missions et la configuration initiale de la cargaison.
     * @param {Object} externalControllers - Un objet contenant les contrôleurs externes requis.
     * @param {RenderingController} externalControllers.renderingController - Le contrôleur de rendu, nécessaire pour initialiser les vues et obtenir les dimensions du canvas.
     * @param {RocketAgent} [externalControllers.rocketAgent] - L'agent IA pour la fusée (optionnel). Si fourni, ses dépendances seront injectées ; sinon, un nouvel agent sera créé.
     */
    constructor(eventBus, missionManager, externalControllers) {
        this.eventBus = eventBus;
        this.missionManager = missionManager;
        this.renderingController = externalControllers.renderingController;
        this.rocketAgent = externalControllers.rocketAgent; // Peut être undefined

        this.celestialBodyFactory = new CelestialBodyFactory();
    }

    /**
     * Initialise tous les composants de base du jeu.
     * Cette méthode orchestre la création des modèles, des contrôleurs internes,
     * des vues et la configuration de la caméra.
     * L'ordre d'initialisation est crucial : Modèles > Contrôleurs Internes > Vues > Caméra.
     * @param {CameraModel} cameraModelInstance - L'instance du modèle de caméra, généralement fournie par `GameController`. Elle est configurée ici.
     * @returns {Object} Un objet contenant les instances des composants initialisés, prêts à être utilisés par `GameController`.
     * @property {RocketModel} rocketModel - Le modèle de la fusée initialisé.
     * @property {UniverseModel} universeModel - Le modèle de l'univers, peuplé de corps célestes.
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
     * @property {RocketAgent} rocketAgent - L'agent IA de la fusée (créé ou configuré).
     */
    initializeGameComponents(cameraModelInstance) {
        const models = this._setupModels();
        const internalControllers = this._setupInternalControllers(models.rocketModel, models.particleSystemModel, models.universeModel, cameraModelInstance);
        const views = this._setupViews();
        this._setupCamera(cameraModelInstance, models.rocketModel);

        // Retourne les composants initialisés pour que GameController puisse les stocker
        return {
            rocketModel: models.rocketModel,
            universeModel: models.universeModel,
            particleSystemModel: models.particleSystemModel,
            
            rocketView: views.rocketView,
            universeView: views.universeView,
            celestialBodyView: views.celestialBodyView,
            particleView: views.particleView,
            traceView: views.traceView,
            uiView: views.uiView,

            physicsController: internalControllers.physicsController,
            particleController: internalControllers.particleController,
            rocketController: internalControllers.rocketController,
            rocketAgent: internalControllers.rocketAgent
        };
    }

    /**
     * @private
     * Initialise les modèles de données du jeu (Univers, Fusée, Particules).
     * Positionne la fusée initialement par rapport à la Terre et au Soleil.
     * Configure les émetteurs de particules.
     * @returns {{rocketModel: RocketModel, universeModel: UniverseModel, particleSystemModel: ParticleSystemModel}} Un objet contenant les modèles initialisés.
     */
    _setupModels() {
        let rocketModel, universeModel, particleSystemModel;
        try {
            universeModel = new UniverseModel();
            const bodies = this.celestialBodyFactory.createCelestialBodies();
            bodies.forEach(body => universeModel.addCelestialBody(body));

            rocketModel = new RocketModel();
            const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
            
            // Positionnement initial de la fusée :
            // La fusée est placée sur la "face éclairée" de la Terre (face au Soleil),
            // légèrement au-dessus de sa surface.
            if (earth) {
                const sun = universeModel.celestialBodies.find(body => body.name === 'Soleil') || { position: { x: 0, y: 0 } }; // Fallback si Soleil non trouvé
                // Calcul de l'angle entre la Terre et le Soleil pour déterminer le côté "éclairé"
                const angleVersSoleil = Math.atan2(earth.position.y - sun.position.y, 
                                                 earth.position.x - sun.position.x);
                // Positionne la fusée à l'extérieur du rayon terrestre, sur l'axe Terre-Soleil
                const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                
                rocketModel.setPosition(rocketStartX, rocketStartY);
                rocketModel.setVelocity(earth.velocity.x, earth.velocity.y); // Vitesse initiale de la fusée = vitesse de la Terre
                rocketModel.setAngle(angleVersSoleil); // Oriente la fusée vers le Soleil (ou l'extérieur de la Terre)
            } else {
                console.error("GameSetupController: La Terre n'a pas été trouvée pour positionner la fusée initialement. Utilisation des positions par défaut.");
                rocketModel.setPosition(ROCKET.INITIAL_X, ROCKET.INITIAL_Y); 
            }
            
            particleSystemModel = new ParticleSystemModel();
            // Configuration initiale des angles des émetteurs de particules.
            // Ces valeurs pourraient être définies comme constantes ou dans la configuration du ParticleSystemModel.
            particleSystemModel.updateEmitterAngle('main', Math.PI/2); // Vers le "haut" de la fusée
            particleSystemModel.updateEmitterAngle('rear', -Math.PI/2); // Vers le "bas" de la fusée
            particleSystemModel.updateEmitterAngle('left', 0); // Vers la "gauche" de la fusée (relativement à son orientation)
            particleSystemModel.updateEmitterAngle('right', Math.PI); // Vers la "droite" de la fusée

        } catch (error) {
            console.error("Erreur lors de l'initialisation des modèles (GameSetupController):", error);
            // Assurer que les modèles retournés sont au moins `null` ou des instances vides en cas d'erreur critique
            rocketModel = rocketModel || null;
            universeModel = universeModel || null;
            particleSystemModel = particleSystemModel || null;
        }
        return { rocketModel, universeModel, particleSystemModel };
    }

    /**
     * @private
     * Initialise les vues du jeu et les enregistre auprès du `RenderingController`.
     * Nécessite que le `RenderingController` soit disponible.
     * @returns {{rocketView: RocketView, universeView: UniverseView, celestialBodyView: CelestialBodyView, particleView: ParticleView, traceView: TraceView, uiView: UIView}} Un objet contenant les vues initialisées.
     */
    _setupViews() {
        const rocketView = new RocketView();
        const universeView = new UniverseView();
        const celestialBodyView = new CelestialBodyView();
        const particleView = new ParticleView();
        const traceView = new TraceView();
        const uiView = new UIView(this.eventBus);
        
        if (this.renderingController) {
            this.renderingController.initViews(
                rocketView,
                universeView,
                celestialBodyView,
                particleView,
                traceView,
                uiView
            );
        } else {
            console.error("GameSetupController: RenderingController non disponible pour initialiser les vues.");
            // Les vues sont créées mais ne seront pas enregistrées, ce qui causera des problèmes de rendu.
        }
        return { rocketView, universeView, celestialBodyView, particleView, traceView, uiView };
    }

    /**
     * @private
     * Configure la caméra du jeu.
     * Définit la cible de la caméra (la fusée) et ajuste ses dimensions et son décalage
     * en fonction de la taille du canvas fournie par le `RenderingController`.
     * Nécessite que `RenderingController`, `CameraModel` et `RocketModel` soient prêts et valides.
     * @param {CameraModel} cameraModelInstance - L'instance du modèle de caméra à configurer.
     * @param {RocketModel} rocketModelInstance - Le modèle de la fusée qui servira de cible à la caméra.
     */
    _setupCamera(cameraModelInstance, rocketModelInstance) {
        if (!this.renderingController) {
            console.error("GameSetupController: RenderingController non disponible pour configurer la caméra.");
            return;
        }
        if (!cameraModelInstance) {
            console.error("GameSetupController: CameraModelInstance non disponible pour configurer la caméra.");
            return;
        }
         if (!rocketModelInstance) {
            console.error("GameSetupController: RocketModelInstance non disponible pour configurer la caméra.");
            return;
        }

        const canvasSize = this.renderingController.getCanvasDimensions();
        if (canvasSize && typeof canvasSize.width === 'number' && typeof canvasSize.height === 'number') {
            cameraModelInstance.setTarget(rocketModelInstance, 'rocket');
            cameraModelInstance.offsetX = canvasSize.width / 2;
            cameraModelInstance.offsetY = canvasSize.height / 2;
            cameraModelInstance.width = canvasSize.width;
            cameraModelInstance.height = canvasSize.height;
        } else {
            console.error("GameSetupController: Dimensions du canvas non valides reçues de RenderingController.", canvasSize);
        }
    }

    /**
     * @private
     * Initialise les contrôleurs internes du jeu (Physique, Particules, Fusée) et configure l'agent IA (`RocketAgent`).
     * Gère la création de `RocketAgent` s'il n'est pas fourni, ou l'injection de dépendances s'il est fourni.
     * Émet un événement `EVENTS.SYSTEM.CONTROLLERS_SETUP` lorsque la configuration est terminée.
     * Nécessite que les modèles de données, l'EventBus, le `CameraModel` et le `MissionManager` soient disponibles.
     * @param {RocketModel} rocketModel - Le modèle de la fusée.
     * @param {ParticleSystemModel} particleSystemModel - Le modèle du système de particules.
     * @param {UniverseModel} universeModel - Le modèle de l'univers.
     * @param {CameraModel} cameraModel - Le modèle de la caméra.
     * @returns {{physicsController: PhysicsController, particleController: ParticleController, rocketController: RocketController, rocketAgent: RocketAgent}} Un objet contenant les contrôleurs et l'agent initialisés.
     */
    _setupInternalControllers(rocketModel, particleSystemModel, universeModel, cameraModel) {
        // Vérification des dépendances cruciales avant d'initialiser les contrôleurs
        if (!rocketModel || !particleSystemModel || !universeModel || !this.eventBus || !cameraModel || !this.missionManager) {
            console.error("GameSetupController: Dépendances manquantes pour initialiser les contrôleurs internes.", 
                {
                    rocketModel: !!rocketModel,
                    particleSystemModel: !!particleSystemModel,
                    universeModel: !!universeModel,
                    eventBus: !!this.eventBus,
                    cameraModel: !!cameraModel,
                    missionManager: !!this.missionManager
                }
            );
            // Retourner des objets vides ou null pour éviter des erreurs en aval si possible, bien que la situation soit critique.
            return { physicsController: null, particleController: null, rocketController: null, rocketAgent: this.rocketAgent || null };
        }

        const physicsController = new PhysicsController(this.eventBus);
        const particleController = new ParticleController(particleSystemModel, this.eventBus);
        
        const rocketController = new RocketController(
            this.eventBus, 
            rocketModel, 
            physicsController, 
            particleController, 
            cameraModel 
        );

        if (rocketController && typeof rocketController.subscribeToEvents === 'function') {
            rocketController.subscribeToEvents();
        } else {
            console.error("GameSetupController: RocketController est invalide ou n'a pas de méthode subscribeToEvents.");
        }

        let currentRocketAgent = this.rocketAgent; // Utilise l'agent fourni s'il existe

        // Gestion de RocketAgent : création ou configuration
        if (!currentRocketAgent) {
             // Si RocketAgent n'a pas été fourni, on tente de le créer.
             // S'assurer que toutes les dépendances pour la création de RocketAgent sont présentes.
             if (rocketModel && universeModel && physicsController && this.missionManager && rocketController) {
                console.log("GameSetupController: Création de RocketAgent car non fourni.");
                currentRocketAgent = new RocketAgent(this.eventBus, rocketModel, universeModel, physicsController, this.missionManager, rocketController);
            } else {
                // Avertissement si les dépendances ne sont pas prêtes pour créer RocketAgent ici.
                console.warn("GameSetupController: RocketAgent non fourni et les dépendances (rocketModel, universeModel, physicsController, missionManager, rocketController) ne sont pas toutes prêtes pour le créer ici.");
            }
        } else {
             // Si RocketAgent a été fourni, on s'assure qu'il a toutes ses dépendances via injectDependencies.
             // Utile si l'agent a été créé en amont avec des dépendances partielles ou nulles.
             if (currentRocketAgent && typeof currentRocketAgent.injectDependencies === 'function') {
                currentRocketAgent.injectDependencies({
                    rocketModel: rocketModel,
                    universeModel: universeModel,
                    physicsController: physicsController,
                    missionManager: this.missionManager, 
                    rocketController: rocketController
                });
            } else if (currentRocketAgent) {
                console.warn("GameSetupController: RocketAgent fourni ne dispose pas d'une méthode injectDependencies. Les dépendances n'ont pas été mises à jour.");
            }
        }

        // Émission d'un événement pour signaler que les contrôleurs principaux sont prêts.
        // Cet événement peut être utilisé par d'autres modules pour finaliser leur propre initialisation
        // ou pour savoir quand ils peuvent interagir en toute sécurité avec ces contrôleurs.
        this.eventBus.emit(window.EVENTS.SYSTEM.CONTROLLERS_SETUP, { 
            physicsController: physicsController, 
            rocketController: rocketController,
            rocketAgent: currentRocketAgent // Transmettre l'instance de rocketAgent (créée ou configurée)
        });

        return { physicsController, particleController, rocketController, rocketAgent: currentRocketAgent };
    }
} 