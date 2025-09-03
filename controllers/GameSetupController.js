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
            // Fallback supprimé: l'univers est désormais chargé via JSON (buildWorldFromData)
            universeModel = new UniverseModel();
            rocketModel = new RocketModel();
            particleSystemModel = new ParticleSystemModel();
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
            }

            // Appliquer les stations si fournies dans les données
            if (data && Array.isArray(data.stations)) {
                for (const st of data.stations) {
                    if (st && typeof st.hostName === 'string' && typeof st.angle === 'number' && typeof st.name === 'string') {
                        universeModel.addStation(st.hostName, st.angle, st.name, st.color);
                    }
                }
            }

            // Appliquer les étoiles si fournies (x, y, brightness)
            if (data && Array.isArray(data.stars)) {
                universeModel.stars = [];
                for (const s of data.stars) {
                    if (s && typeof s.x === 'number' && typeof s.y === 'number') {
                        universeModel.stars.push({
                            x: s.x,
                            y: s.y,
                            brightness: typeof s.brightness === 'number' ? s.brightness : PARTICLES.STAR_BRIGHTNESS_BASE
                        });
                    }
                }
            } else if (data && data.starsConfig) {
                // Générer les étoiles à partir d'une configuration compacte
                const cfg = data.starsConfig;
                const count = Math.max(1, Math.min(20000, cfg.count || PARTICLES.STAR_COUNT));
                const radius = Math.max(1, cfg.radius || PARTICLES.VISIBLE_RADIUS);
                const seed = (typeof cfg.seed === 'number' ? cfg.seed : (Date.now() % 2147483647)) >>> 0;
                let state = seed || 1;
                const rnd = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
                universeModel.stars = [];
                for (let i = 0; i < count; i++) {
                    const angle = rnd() * Math.PI * 2;
                    const dist = Math.sqrt(rnd()) * radius;
                    universeModel.stars.push({
                        x: Math.cos(angle) * dist,
                        y: Math.sin(angle) * dist,
                        brightness: PARTICLES.STAR_BRIGHTNESS_BASE + rnd() * PARTICLES.STAR_BRIGHTNESS_RANGE
                    });
                }
            } else {
                // Si non fourni, garde la génération par défaut de UniverseModel.initializeStars()
            }

            // Appliquer des particules d'astéroïdes si fournies
            if (data && Array.isArray(data.asteroids)) {
                universeModel.asteroids = [];
                for (const a of data.asteroids) {
                    if (a && typeof a.x === 'number' && typeof a.y === 'number') {
                        universeModel.asteroids.push({
                            x: a.x,
                            y: a.y,
                            size: typeof a.size === 'number' ? a.size : 2,
                            color: a.color || '#888888',
                            brightness: typeof a.brightness === 'number' ? a.brightness : 1.0
                        });
                    }
                }
            } else if (data && Array.isArray(data.asteroidBelts)) {
                // Plusieurs ceintures
                universeModel.asteroids = [];
                for (const belt of data.asteroidBelts) {
                    try {
                        const gen = this._generateAsteroidBeltFromConfig(belt, universeModel) || [];
                        universeModel.asteroids.push(...gen);
                    } catch (e) {
                        console.warn('[GameSetupController] Échec génération ceinture (liste):', e);
                    }
                }
            } else if (data && data.asteroidBelt) {
                // Générer une ceinture d'astéroïdes à partir d'une configuration compacte
                try {
                    universeModel.asteroids = this._generateAsteroidBeltFromConfig(data.asteroidBelt, universeModel);
                } catch (e) {
                    console.warn('[GameSetupController] Échec génération ceinture astéroïdes:', e);
                }
            }

            // Repositionner la fusée si demandé
            if (existingRocketModel) {
                if (data && data.rocket && data.rocket.spawn && existingRocketModel.setPosition) {
                    const spawn = data.rocket.spawn;
                    // Mode 1: hostName + angle (spécifie l'astre de départ et l'angle à la surface)
                    if (spawn.hostName && typeof spawn.angle === 'number') {
                        const host = universeModel.celestialBodies.find(b => b.name === spawn.hostName);
                        if (host && host.position && typeof host.radius === 'number') {
                            const r = host.radius + ROCKET.HEIGHT / 2 + 1;
                            const x = host.position.x + Math.cos(spawn.angle) * r;
                            const y = host.position.y + Math.sin(spawn.angle) * r;
                            existingRocketModel.setPosition(x, y);
                            existingRocketModel.setVelocity(host.velocity?.x || 0, host.velocity?.y || 0);
                            existingRocketModel.setAngle(spawn.angle);
                            existingRocketModel.isLanded = true;
                            existingRocketModel.landedOn = host.name;
                        }
                    }
                    // Mode 2: position/velocity/angle absolus
                    if (spawn.position) {
                        existingRocketModel.setPosition(spawn.position.x || 0, spawn.position.y || 0);
                        existingRocketModel.isLanded = false;
                        existingRocketModel.landedOn = null;
                    }
                    if (spawn.velocity && existingRocketModel.setVelocity) {
                        existingRocketModel.setVelocity(spawn.velocity.x || 0, spawn.velocity.y || 0);
                    }
                    if (typeof spawn.angle === 'number' && existingRocketModel.setAngle) {
                        existingRocketModel.setAngle(spawn.angle);
                    }
                    existingRocketModel.isDestroyed = false;
                }
            }
        } catch (e) {
            console.error('[GameSetupController.buildWorldFromData] Erreur de construction:', e);
        }
        return { universeModel };
    }

    /**
     * Génère une ceinture d'astéroïdes (particules non physiques) entre deux rayons.
     * @param {{innerRadius:number, outerRadius:number, count:number, seed?:number, center?:{x:number,y:number}, sizeRange?:{min:number,max:number}, color?:string, brightness?:number}} cfg
     * @param {UniverseModel} universeModel
     * @returns {Array<{x:number,y:number,size:number,color:string,brightness:number}>}
     */
    _generateAsteroidBeltFromConfig(cfg, universeModel) {
        const innerR = Math.max(1, cfg.innerRadius || 32000);
        const outerR = Math.max(innerR + 1, cfg.outerRadius || 44000);
        const count = Math.max(1, Math.min(20000, cfg.count || 1500));
        const seed = (typeof cfg.seed === 'number' ? cfg.seed : (Date.now() % 2147483647)) >>> 0;
        const center = cfg.center || { x: 0, y: 0 };
        const sizeMin = (cfg.sizeRange && cfg.sizeRange.min) ? cfg.sizeRange.min : 1;
        const sizeMax = (cfg.sizeRange && cfg.sizeRange.max) ? cfg.sizeRange.max : 3;
        const color = cfg.color || '#9aa3a7';
        const brightness = typeof cfg.brightness === 'number' ? cfg.brightness : 0.9;

        // PRNG simple (LCG)
        let randState = seed || 1;
        const rand = () => (randState = (randState * 1664525 + 1013904223) >>> 0) / 4294967296;

        const asteroids = [];
        for (let i = 0; i < count; i++) {
            const t = rand();
            // Angle uniforme [0, 2PI)
            const angle = t * Math.PI * 2 + rand() * 0.02; // léger bruit
            // Rayon biaisé pour remplir l'anneau (racine pour homogénéité visuelle)
            const r = Math.sqrt(innerR * innerR + (outerR * outerR - innerR * innerR) * rand());
            const x = center.x + Math.cos(angle) * r;
            const y = center.y + Math.sin(angle) * r;
            const size = sizeMin + (sizeMax - sizeMin) * rand();
            asteroids.push({ x, y, size, color, brightness });
        }
        return asteroids;
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