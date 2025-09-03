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
     * @param {Object} [externalControllers={}] - Un objet contenant les contrôleurs externes requis. (Ce paramètre n'est plus utilisé par le constructeur directement, les dépendances sont passées à initializeGameComponents)
     */
    constructor(eventBus, missionManager, externalControllers = {}) { // externalControllers rendu optionnel et avec valeur par défaut
        this.eventBus = eventBus;
        this.missionManager = missionManager;
        // this.renderingController = externalControllers.renderingController; // Plus initialisé ici
        // this.rocketAI = externalControllers.rocketAI; // Plus initialisé ici

        this.celestialBodyFactory = new CelestialBodyFactory();
    }

    /**
     * Initialise tous les composants de base du jeu.
     * @param {Object} initialConfig - La configuration initiale du jeu (ex: missions, paramètres spécifiques).
     * @param {HTMLCanvasElement} canvas - L'élément canvas pour le rendu.
     * @param {Object} externalControllers - Un objet contenant les contrôleurs et modèles externes.
     * @param {RenderingController} externalControllers.renderingController - Le contrôleur de rendu.
     * @param {RocketAI} [externalControllers.rocketAI] - L'agent IA optionnel.
     * @param {CameraController} [externalControllers.cameraController] - Le contrôleur de caméra (qui contient le CameraModel).
     * @returns {Object} Un objet contenant les instances des composants initialisés.
     */
    initializeGameComponents(initialConfig, canvas, externalControllers) { // MODIFIÉ: Signature mise à jour
        
        // console.log('[GameSetupController.initializeGameComponents] Canvas reçu:', canvas); // SUPPRESSION DE LOG
        const renderingController = externalControllers.renderingController; // Récupérer depuis les arguments
        const cameraController = externalControllers.cameraController; // Récupérer depuis les arguments
        const cameraModelInstance = cameraController ? cameraController.cameraModel : null; // MODIFIÉ: Accès direct à la propriété

        if (!renderingController) {
            // console.error("GameSetupController: RenderingController est manquant dans externalControllers.");
            // Gérer l'erreur ou retourner des composants vides/null
            return { /* ... composants null ... */ };
        }
        if (!cameraModelInstance) {
            // console.error("GameSetupController: CameraModelInstance n'a pas pu être obtenu depuis CameraController.");
            return { /* ... composants null ... */ };
        }
        
        const models = this._setupModels(initialConfig); // Passer initialConfig si nécessaire pour les modèles
        
        // Passer renderingController à _setupInternalControllers s'il est nécessaire pour la création des vues à l'intérieur,
        // ou s'assurer que les vues sont créées après les contrôleurs et ont accès à renderingController.
        // Actuellement, _setupInternalControllers ne semble pas l'utiliser directement.
        const internalControllers = this._setupInternalControllers(
            models.rocketModel, 
            models.particleSystemModel, 
            models.universeModel, 
            cameraModelInstance, 
            externalControllers.rocketAI, // MODIFIÉ: Passer rocketAI explicitement
            renderingController // Passer renderingController pour que _setupViews puisse l'utiliser si appelé depuis _setupInternalControllers
        );
        
        // _setupViews a besoin de renderingController.
        // Il est plus logique d'appeler _setupViews après que renderingController soit clairement défini.
        const views = this._setupViews(renderingController, canvas); // MODIFIÉ: Passer renderingController et canvas

        // _setupCamera a besoin de renderingController et cameraModelInstance.
        this._setupCamera(cameraModelInstance, models.rocketModel, renderingController, canvas); // MODIFIÉ: Passer renderingController et canvas

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
            rocketAI: internalControllers.rocketAI
        };
    }

    /**
     * @private
     * Initialise les modèles de données du jeu (Univers, Fusée, Particules).
     * Positionne la fusée initialement par rapport à la Terre et au Soleil.
     * Configure les émetteurs de particules.
     * @param {Object} initialConfig - La configuration initiale du jeu (ex: missions, paramètres spécifiques).
     * @returns {{rocketModel: RocketModel, universeModel: UniverseModel, particleSystemModel: ParticleSystemModel}} Un objet contenant les modèles initialisés.
     */
    _setupModels(initialConfig) {
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
                // console.error("GameSetupController: La Terre n'a pas été trouvée pour positionner la fusée initialement. Utilisation des positions par défaut.");
                rocketModel.setPosition(ROCKET.INITIAL_X, ROCKET.INITIAL_Y); 
            }
            
            particleSystemModel = new ParticleSystemModel();
            // Ajouter quelques stations par défaut sur des angles précis (ex: Terre et Lune)
            try {
                universeModel.addStation('Terre', Math.PI / 6, 'Terre-Station-A');
                universeModel.addStation('Terre', Math.PI, 'Terre-Station-B');
                universeModel.addStation('Lune', Math.PI / 3, 'Lune-Alpha');
                universeModel.addStation('Mars', Math.PI * 0.8, 'Mars-Delta');
                universeModel.addStation('Mercure', Math.PI / 2, 'Mercure-Alpha');
                universeModel.addStation('Vénus', Math.PI * 1.2, 'Vénus-Station');
                universeModel.addStation('Ganymède', Math.PI * 0.25, 'Ganymède-1');
                universeModel.addStation('Io', Math.PI * 1.75, 'Io-1');
                universeModel.addStation('Uranus', Math.PI * 0.6, 'Uranus-Station');
                universeModel.addStation('Neptune', Math.PI * 1.4, 'Neptune-Station');
                universeModel.addStation('Titan', Math.PI * 0.9, 'Titan-Station');
            } catch (e) {
                // Sécuriser au cas où addStation ne serait pas dispo
                console.warn('Ajout des stations par défaut a échoué:', e);
            }
            // Configuration initiale des angles des émetteurs de particules.
            // Ces valeurs pourraient être définies comme constantes ou dans la configuration du ParticleSystemModel.
            particleSystemModel.updateEmitterAngle('main', Math.PI/2); // Vers le "haut" de la fusée
            particleSystemModel.updateEmitterAngle('rear', -Math.PI/2); // Vers le "bas" de la fusée
            particleSystemModel.updateEmitterAngle('left', 0); // Vers la "gauche" de la fusée (relativement à son orientation)
            particleSystemModel.updateEmitterAngle('right', Math.PI); // Vers la "droite" de la fusée

        } catch (error) {
            // console.error("Erreur lors de l'initialisation des modèles (GameSetupController):", error);
            // Assurer que les modèles retournés sont au moins `null` ou des instances vides en cas d'erreur critique
            rocketModel = rocketModel || null;
            universeModel = universeModel || null;
            particleSystemModel = particleSystemModel || null;
        }
        return { rocketModel, universeModel, particleSystemModel };
    }

    /**
     * Construit un nouvel UniverseModel et (optionnellement) repositionne la fusée à partir de données.
     * @param {object} data - Données de monde, ex: { physics, bodies: [], rocket: { spawn: ... } }
     * @param {RocketModel} [existingRocketModel] - Modèle de fusée à réutiliser/repositionner.
     * @returns {{universeModel: UniverseModel}}
     */
    buildWorldFromData(data, existingRocketModel) {
        // Appliquer les paramètres physiques spécifiques au monde avant de créer UniverseModel
        try {
            if (data && data.physics && typeof data.physics.G === 'number') {
                PHYSICS.G = data.physics.G;
            }
        } catch (e) {
            console.warn('[GameSetupController.buildWorldFromData] Impossible d\'appliquer physics.G depuis data:', e);
        }

        const universeModel = new UniverseModel();

        try {
            // Appliquer les corps célestes depuis data.bodies si présent
            if (data && Array.isArray(data.bodies) && data.bodies.length > 0) {
                // Permettre à la factory d'accepter des configs en entrée
                const bodies = this.celestialBodyFactory.createCelestialBodiesFromConfigs(data.bodies);
                bodies.forEach(body => universeModel.addCelestialBody(body));
            } else {
                // Fallback: créer les corps par défaut
                const bodies = this.celestialBodyFactory.createCelestialBodies();
                bodies.forEach(body => universeModel.addCelestialBody(body));
            }

            // Appliquer les stations si fournies dans les données
            if (data && Array.isArray(data.stations)) {
                for (const st of data.stations) {
                    if (st && typeof st.hostName === 'string' && typeof st.angle === 'number' && typeof st.name === 'string') {
                        universeModel.addStation(st.hostName, st.angle, st.name, st.color);
                    }
                }
            }

            // Repositionner la fusée si demandé
            if (existingRocketModel) {
                if (data && data.rocket && data.rocket.spawn && existingRocketModel.setPosition) {
                    const spawn = data.rocket.spawn;
                    if (spawn.position) {
                        existingRocketModel.setPosition(spawn.position.x || 0, spawn.position.y || 0);
                    }
                    if (spawn.velocity && existingRocketModel.setVelocity) {
                        existingRocketModel.setVelocity(spawn.velocity.x || 0, spawn.velocity.y || 0);
                    }
                    if (typeof spawn.angle === 'number' && existingRocketModel.setAngle) {
                        existingRocketModel.setAngle(spawn.angle);
                    }
                    existingRocketModel.isLanded = false;
                    existingRocketModel.isDestroyed = false;
                } else {
                    // Si pas de spawn fourni, utiliser la logique par défaut de _setupModels pour la position initiale relative à la Terre
                    const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
                    if (earth) {
                        const sun = universeModel.celestialBodies.find(body => body.name === 'Soleil') || { position: { x: 0, y: 0 } };
                        const angleVersSoleil = Math.atan2(earth.position.y - sun.position.y, earth.position.x - sun.position.x);
                        const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                        const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                        existingRocketModel.setPosition(rocketStartX, rocketStartY);
                        existingRocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
                        existingRocketModel.setAngle(angleVersSoleil);
                        existingRocketModel.isLanded = true;
                        existingRocketModel.landedOn = 'Terre';
                    }
                }
            }
        } catch (e) {
            console.error('[GameSetupController.buildWorldFromData] Erreur de construction:', e);
        }
        return { universeModel };
    }

    /**
     * @private
     * Initialise les vues du jeu et les enregistre auprès du `RenderingController`.
     * Nécessite que le `RenderingController` soit disponible.
     * @param {RenderingController} renderingController - L'instance du contrôleur de rendu.
     * @param {HTMLCanvasElement} canvas - L'élément canvas (utilisé par UIView).
     * @returns {{rocketView: RocketView, universeView: UniverseView, celestialBodyView: CelestialBodyView, particleView: ParticleView, traceView: TraceView, uiView: UIView}} Un objet contenant les vues initialisées.
     */
    _setupViews(renderingController, canvas) { // MODIFIÉ: Accepter renderingController et canvas
        // console.log('[GameSetupController._setupViews] Début de la configuration des vues. RenderingController reçu:', renderingController); // SUPPRESSION DE LOG

        const rocketView = new RocketView();
        const universeView = new UniverseView();
        const celestialBodyView = new CelestialBodyView();
        const particleView = new ParticleView();
        const traceView = new TraceView();
        const uiView = new UIView(this.eventBus, canvas); // UIView peut prendre le canvas directement
        
        if (renderingController) {
            // console.log('[GameSetupController._setupViews] Appel de renderingController.initViews avec les vues suivantes:', {  // SUPPRESSION DE LOG
            //     rocketView,
            //     universeView,
            //     celestialBodyView,
            //     particleView,
            //     traceView,
            //     uiView
            // }); // SUPPRESSION DE LOG
            renderingController.initViews(
                rocketView,
                universeView,
                celestialBodyView,
                particleView,
                traceView,
                uiView
            );
        } else {
            // console.error("GameSetupController: RenderingController non disponible pour initialiser les vues.");
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
     * @param {RenderingController} renderingController - L'instance du contrôleur de rendu.
     * @param {HTMLCanvasElement} canvas - L'élément canvas pour obtenir ses dimensions.
     */
    _setupCamera(cameraModelInstance, rocketModelInstance, renderingController, canvas) { // MODIFIÉ: Accepter renderingController et canvas
        
        // console.log('[GameSetupController._setupCamera] Canvas reçu:', canvas); // SUPPRESSION DE LOG
        if (!renderingController) {
            // console.error("GameSetupController: RenderingController non disponible pour configurer la caméra.");
            return;
        }
        if (!cameraModelInstance) {
            // console.error("GameSetupController: CameraModelInstance non disponible pour configurer la caméra.");
            return;
        }
         if (!rocketModelInstance) {
            // console.error("GameSetupController: RocketModelInstance non disponible pour configurer la caméra.");
            return;
        }

        // const canvasSize = renderingController.getCanvasDimensions(); // RenderingController pourrait ne pas avoir le canvas lui-même
        if (canvas && typeof canvas.width === 'number' && typeof canvas.height === 'number') { // Utiliser directement les dimensions du canvas
            cameraModelInstance.setTarget(rocketModelInstance, 'rocket');
            // Forcer la position initiale de la caméra pour correspondre à la fusée immédiatement
            if (rocketModelInstance && rocketModelInstance.position) {
                cameraModelInstance.setPosition(rocketModelInstance.position.x, rocketModelInstance.position.y);
            }
            cameraModelInstance.offsetX = canvas.width / 2;
            cameraModelInstance.offsetY = canvas.height / 2;
            cameraModelInstance.width = canvas.width;
            cameraModelInstance.height = canvas.height;
            // console.log('[GameSetupController._setupCamera] CameraModel configuré avec les dimensions du canvas:', {width: canvas.width, height: canvas.height}); // SUPPRESSION DE LOG
        } else {
            // console.error("GameSetupController: Dimensions du canvas non valides ou canvas non fourni.", canvas);
        }
    }

    /**
     * @private
     * Initialise les contrôleurs internes du jeu (Physique, Particules, Fusée) et configure l'agent IA (`RocketAI`).
     * Gère la création de `RocketAI` s'il n'est pas fourni, ou l'injection de dépendances s'il est fourni.
     * Émet un événement `EVENTS.SYSTEM.CONTROLLERS_SETUP` lorsque la configuration est terminée.
     * Nécessite que les modèles de données, l'EventBus, le `CameraModel` et le `MissionManager` soient disponibles.
     * @param {RocketModel} rocketModel - Le modèle de la fusée.
     * @param {ParticleSystemModel} particleSystemModel - Le modèle du système de particules.
     * @param {UniverseModel} universeModel - Le modèle de l'univers.
     * @param {CameraModel} cameraModel - Le modèle de la caméra.
     * @param {RocketAI} [providedRocketAI] - L'instance optionnelle de RocketAI fournie par GameController.
     * @param {RenderingController} renderingController - Le contrôleur de rendu (nécessaire pour UIView, passé à travers).
     * @returns {{physicsController: PhysicsController, particleController: ParticleController, rocketController: RocketController, rocketAI: RocketAI}} Un objet contenant les contrôleurs et l'agent initialisés.
     */
    _setupInternalControllers(rocketModel, particleSystemModel, universeModel, cameraModel, providedRocketAI, renderingController) { // MODIFIÉ: Accepter providedRocketAI et renderingController
        // Vérification des dépendances cruciales avant d'initialiser les contrôleurs
        if (!rocketModel || !particleSystemModel || !universeModel || !this.eventBus || !cameraModel || !this.missionManager || !renderingController) { // Ajout de renderingController dans la vérification
            // console.error("GameSetupController: Dépendances manquantes pour initialiser les contrôleurs internes.", 
            //     {
            //         rocketModel: !!rocketModel,
            //         particleSystemModel: !!particleSystemModel,
            //         universeModel: !!universeModel,
            //         eventBus: !!this.eventBus,
            //         cameraModel: !!cameraModel,
            //         missionManager: !!this.missionManager,
            //         renderingController: !!renderingController
            //     }
            // );
            // Retourner des objets vides ou null pour éviter des erreurs en aval si possible, bien que la situation soit critique.
            return { physicsController: null, particleController: null, rocketController: null, rocketAI: providedRocketAI || null };
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
            // console.error("GameSetupController: RocketController est invalide ou n'a pas de méthode subscribeToEvents.");
        }

        let currentRocketAI = providedRocketAI; // MODIFIÉ: Utiliser l'agent fourni via les paramètres

        // Gestion de RocketAI : création ou configuration
        if (!currentRocketAI) {
            // console.log("GameSetupController: Création de RocketAI car non fourni.");
            currentRocketAI = new RocketAI(this.eventBus);
        }

        // Après la création ou l'obtention de l'agent IA, injecter les dépendances
        if (currentRocketAI && typeof currentRocketAI.injectDependencies === 'function') {
            currentRocketAI.injectDependencies({
                rocketModel,
                universeModel,
                physicsController,
                missionManager: this.missionManager,
                rocketController 
            });
        } else {
            // console.error("GameSetupController: RocketAI est invalide ou n'a pas de méthode injectDependencies.");
        }

        // Émettre un événement pour signaler que les contrôleurs sont prêts.
        this.eventBus.emit(EVENTS.SYSTEM.CONTROLLERS_SETUP, {
            physicsController,
            particleController,
            rocketController,
            rocketAI: currentRocketAI
        });

        return { physicsController, particleController, rocketController, rocketAI: currentRocketAI };
    }
} 