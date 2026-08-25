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
     * Plafond du nombre d'étoiles de fond (tableau `stars` explicite ET `starsConfig.count`).
     * Les 6 mondes livrés en déclarent au plus 1000 ; 20 000 laisse une très large marge tout
     * en bornant la mémoire et le coût de `updateStars` (parcours complet à chaque frame).
     */
    static get MAX_ETOILES() { return 20000; }

    /**
     * Plafond du NOMBRE de ceintures d'astéroïdes. Le compte de chaque ceinture était borné
     * mais pas leur nombre : 2000 ceintures × 20 000 = 40 M d'astéroïdes ont consommé 2 Go et
     * 28 s de génération (processus OOM). Les mondes livrés en déclarent 1 ou 2.
     */
    static get MAX_CEINTURES() { return 16; }

    /**
     * Plafond du nombre TOTAL d'astéroïdes (toutes ceintures + tableau `asteroids` explicite).
     * Les astéroïdes ne sont pas des corps physiques, mais ils sont parcourus à chaque frame
     * au rendu. Les mondes livrés en comptent au plus 1000 ; 60 000 = 3 ceintures pleines.
     */
    static get MAX_ASTEROIDES() { return 60000; }

    /**
     * Vrai si `valeur` est un nombre FINI. `typeof x === 'number'` ne suffit pas : NaN et
     * Infinity le satisfont, et une seule de ces valeurs appliquée à la fusée (spawn) ou à la
     * gravité empoisonne tout le monde Matter en une frame. Les chaînes numériques sont
     * rejetées : dans Matter elles produisent des CONCATÉNATIONS de chaînes, pas des additions.
     * @param {*} valeur
     * @returns {boolean}
     */
    static estNombreFini(valeur) {
        return typeof valeur === 'number' && isFinite(valeur);
    }

    /**
     * Décrit une valeur pour un message d'erreur (JSON.stringify écrirait `null` pour
     * NaN et Infinity, ce qui rendrait le message trompeur).
     * @private
     */
    static _decrire(valeur) {
        if (typeof valeur === 'number') return String(valeur);
        try { return JSON.stringify(valeur); } catch (e) { return String(valeur); }
    }

    /**
     * Lit un couple {x, y} en exigeant deux nombres FINIS.
     * @private
     * @returns {{x:number,y:number}|null} null si invalide (l'appelant décide du repli).
     */
    static _lirePointFini(valeur, champ) {
        if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
            console.error(`[GameSetupController] ${champ} invalide (${Array.isArray(valeur) ? 'tableau' : typeof valeur} ${GameSetupController._decrire(valeur)}) : un objet {x, y} est attendu.`);
            return null;
        }
        if (!GameSetupController.estNombreFini(valeur.x) || !GameSetupController.estNombreFini(valeur.y)) {
            console.error(`[GameSetupController] ${champ} non fini (x=${GameSetupController._decrire(valeur.x)}, y=${GameSetupController._decrire(valeur.y)}) : deux nombres finis sont attendus.`);
            return null;
        }
        return { x: valeur.x, y: valeur.y };
    }

    /**
     * Lit un nombre de configuration en exigeant un nombre fini STRICTEMENT POSITIF.
     * Absent => défaut silencieux ; présent mais invalide => avertissement nommant le champ,
     * puis défaut. On préfère un monde cohérent et bruyant à un monde vide en silence
     * (`count: "abc"` produisait 0 étoile / 0 astéroïde sans le moindre message).
     * @private
     */
    static _lireNombrePositif(valeur, defaut, champ) {
        if (valeur === undefined || valeur === null) return defaut;
        if (GameSetupController.estNombreFini(valeur) && valeur > 0) return valeur;
        console.warn(`[GameSetupController] Champ '${champ}' invalide (${typeof valeur} ${GameSetupController._decrire(valeur)}) : un nombre fini strictement positif est attendu. Valeur ${defaut} utilisée.`);
        return defaut;
    }

    /**
     * Lit un COMPTE de configuration : comme `_lireNombrePositif`, mais `0` est une valeur
     * LÉGITIME (ciel sans étoiles, ceinture neutralisée sans supprimer l'entrée). Rejette
     * toujours NaN/Infinity/chaîne/négatif.
     * @private
     */
    static _lireCompte(valeur, defaut, champ) {
        if (valeur === undefined || valeur === null) return defaut;
        if (GameSetupController.estNombreFini(valeur) && valeur >= 0) return Math.floor(valeur);
        console.warn(`[GameSetupController] Champ '${champ}' invalide (${typeof valeur} ${GameSetupController._decrire(valeur)}) : un nombre fini positif ou nul est attendu. Valeur ${defaut} utilisée.`);
        return defaut;
    }

    /**
     * Pose la fusée à la surface d'un corps céleste, à l'angle donné.
     * Chemin partagé par le spawn nominal (hostName) et par le repli (premier corps
     * disponible) afin que les deux restent rigoureusement identiques.
     * @private
     */
    static _poserFuseeSurCorps(rocketModel, host, angle) {
        const r = host.radius + ROCKET.HEIGHT / 2 + 1;
        const x = host.position.x + Math.cos(angle) * r;
        const y = host.position.y + Math.sin(angle) * r;
        rocketModel.setPosition(x, y);
        // Vélocité héritée du corps hôte à l'échelle Matter (u/s × 1000/60), cohérente
        // avec la stabilisation au sol et le décollage. Voir PHYSICS.md §1.
        rocketModel.setVelocity((host.velocity?.x || 0) * PHYSICS.MATTER_BASE_DELTA, (host.velocity?.y || 0) * PHYSICS.MATTER_BASE_DELTA);
        rocketModel.setAngle(angle);
        rocketModel.isLanded = true;
        rocketModel.landedOn = host.name;
    }

    /**
     * Repli commun : pose la fusée sur le premier corps céleste disponible.
     * Appelé quand aucun mode de spawn n'a pu être appliqué ET quand le preset ne déclare
     * AUCUN `rocket.spawn` : `reset()` remet la fusée à (0,0), c'est-à-dire À L'INTÉRIEUR de
     * l'étoile centrale des six mondes livrés.
     * @private
     */
    static _poserFuseeEnRepli(rocketModel, universeModel, angle) {
        const fallbackHost = universeModel.celestialBodies[0];
        if (fallbackHost && fallbackHost.position && GameSetupController.estNombreFini(fallbackHost.radius)) {
            console.warn(`[GameSetupController.buildWorldFromData] Utilisation du fallback: '${fallbackHost.name}'`);
            GameSetupController._poserFuseeSurCorps(rocketModel, fallbackHost, GameSetupController.estNombreFini(angle) ? angle : 0);
        } else {
            console.error('[GameSetupController.buildWorldFromData] Aucun corps céleste disponible pour le spawn, fusée positionnée à (0,0)');
            rocketModel.setPosition(0, 0);
            rocketModel.isLanded = false;
            rocketModel.landedOn = null;
        }
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
        // CORRECTION: Validation des propriétés requises du JSON
        if (!data) {
            throw new Error('[GameSetupController.buildWorldFromData] data est requis');
        }
        if (!data.bodies || !Array.isArray(data.bodies)) {
            throw new Error('[GameSetupController.buildWorldFromData] data.bodies doit être un tableau');
        }
        if (data.bodies.length === 0) {
            console.warn('[GameSetupController.buildWorldFromData] data.bodies est vide, aucun corps céleste ne sera créé');
        }
        if (existingRocketModel && (!data.rocket || !data.rocket.spawn)) {
            console.warn('[GameSetupController.buildWorldFromData] data.rocket.spawn est absent, la fusée sera réinitialisée et posée sur le premier corps céleste');
        }

        // Capturer une seule fois la valeur par défaut de PHYSICS.G (issue de constants.js)
        // afin de pouvoir la restaurer quand un preset ne définit pas physics.G.
        if (GameSetupController._defaultPhysicsG === undefined && typeof PHYSICS !== 'undefined' && typeof PHYSICS.G === 'number') {
            GameSetupController._defaultPhysicsG = PHYSICS.G;
        }

        // VALIDATION DE physics.G (hors du try/catch ci-dessous, qui n'émettait qu'un warn).
        // `typeof === 'number'` laissait passer Infinity et NaN : la fusée devenait NaN dès la
        // première frame et même la touche R ne récupérait rien (le NaN revient en ~30 frames).
        // Il n'existe aucune reprise raisonnable — G définit toute la physique du monde — donc
        // on LÈVE : resetWorld renvoie false, UNIVERSE.LOAD_FAILED est émis et l'écran de
        // démarrage se réarme avec un message. Mieux vaut un échec bruyant qu'un monde injouable.
        let gDuPreset = null; // null => conserver/restaurer la valeur par défaut
        if (data.physics && data.physics.G !== undefined && data.physics.G !== null) {
            const gBrut = data.physics.G;
            if (typeof gBrut !== 'number') {
                console.warn(`[GameSetupController.buildWorldFromData] physics.G n'est pas un nombre (${typeof gBrut} ${JSON.stringify(gBrut)}) : valeur par défaut ${GameSetupController._defaultPhysicsG} utilisée.`);
            } else if (!isFinite(gBrut)) {
                throw new Error(`[GameSetupController.buildWorldFromData] physics.G non fini (${gBrut}) : le monde serait injouable (fusée NaN dès la première frame, irrécupérable). Chargement abandonné.`);
            } else if (gBrut <= 0) {
                console.error(`[GameSetupController.buildWorldFromData] physics.G doit être strictement positif (reçu ${gBrut}) : gravité nulle ou répulsive. Valeur par défaut ${GameSetupController._defaultPhysicsG} utilisée.`);
            } else {
                gDuPreset = gBrut;
            }
        }

        // Appliquer les paramètres physiques spécifiques au monde avant de créer UniverseModel
        try {
            if (gDuPreset !== null) {
                PHYSICS.G = gDuPreset;
            } else if (typeof GameSetupController._defaultPhysicsG === 'number') {
                // Aucun G dans le preset : restaurer la valeur par défaut (évite la persistance
                // du G d'un monde précédent).
                PHYSICS.G = GameSetupController._defaultPhysicsG;
            }
            // SOURCE UNIQUE DE GRAVITÉ : aligner la gravité RÉELLE (plugin matter-attractors) sur
            // PHYSICS.G, pour que gravité réelle = visualisation = IA. Voir PHYSICS.md §2.
            if (typeof MatterAttractors !== 'undefined' && MatterAttractors.Attractors) {
                MatterAttractors.Attractors.gravityConstant = PHYSICS.G;
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
            if (data && data.stations !== undefined && data.stations !== null && !Array.isArray(data.stations)) {
                console.warn(`[GameSetupController] 'stations' n'est pas un tableau (${typeof data.stations}) : aucune station créée.`);
            }
            if (data && Array.isArray(data.stations)) {
                for (let i = 0; i < data.stations.length; i++) {
                    const st = data.stations[i];
                    if (st && typeof st.hostName === 'string' && GameSetupController.estNombreFini(st.angle) && typeof st.name === 'string') {
                        // L'hôte doit exister : sinon la station est ajoutée au modèle mais
                        // RenderingController l'écarte par un `continue` muet et le ravitaillement
                        // ne la trouve jamais. Même diagnostic que `parentName` (CelestialBodyFactory)
                        // et `centerName` (ceintures).
                        if (!universeModel.celestialBodies.some(b => b && b.name === st.hostName)) {
                            console.warn(`[GameSetupController] Station '${st.name}': hostName '${st.hostName}' introuvable (typo ou corps ignoré). La station ne sera ni dessinée ni ravitaillante.`);
                        }
                        universeModel.addStation(st.hostName, st.angle, st.name, st.color);
                    } else {
                        // Auparavant la station était écartée EN SILENCE (un `angle` en chaîne
                        // suffisait) : le joueur ne pouvait ni la voir ni comprendre pourquoi.
                        console.warn(`[GameSetupController] stations[${i}] ignorée : hostName (chaîne), angle (nombre fini) et name (chaîne) sont requis. Reçu hostName=${GameSetupController._decrire(st && st.hostName)}, angle=${GameSetupController._decrire(st && st.angle)}, name=${GameSetupController._decrire(st && st.name)}.`);
                    }
                }
            }

            // Narratives par corps
            if (data && data.narratives && typeof data.narratives === 'object') {
                universeModel.narratives = {};
                for (const [name, value] of Object.entries(data.narratives)) {
                    if (value && typeof value.text === 'string') {
                        universeModel.narratives[name] = {
                            title: typeof value.title === 'string' ? value.title : undefined,
                            text: value.text
                        };
                    }
                }
            }

            // Appliquer les étoiles si fournies (x, y, brightness)
            if (data && Array.isArray(data.stars)) {
                universeModel.stars = [];
                // Un tableau `stars` explicite n'avait AUCUN plafond (contrairement à
                // starsConfig.count) : un preset pouvait en déclarer des millions.
                let listeEtoiles = data.stars;
                if (listeEtoiles.length > GameSetupController.MAX_ETOILES) {
                    console.warn(`[GameSetupController] 'stars' contient ${listeEtoiles.length} entrées : TRONQUÉ à ${GameSetupController.MAX_ETOILES} (même plafond que starsConfig.count).`);
                    listeEtoiles = listeEtoiles.slice(0, GameSetupController.MAX_ETOILES);
                }
                let etoilesRejetees = 0;
                for (const s of listeEtoiles) {
                    // Finitude exigée : une étoile NaN se propage en brightness NaN à chaque frame.
                    if (s && GameSetupController.estNombreFini(s.x) && GameSetupController.estNombreFini(s.y)) {
                        universeModel.stars.push({
                            x: s.x,
                            y: s.y,
                            brightness: GameSetupController.estNombreFini(s.brightness) ? s.brightness : RENDER.STAR_BRIGHTNESS_BASE,
                            // `twinkleSpeed` est obligatoire : UniverseModel.updateStars l'utilise
                            // à chaque frame et son absence produisait brightness = NaN.
                            twinkleSpeed: GameSetupController.estNombreFini(s.twinkleSpeed)
                                ? s.twinkleSpeed
                                : Math.random() * RENDER.STAR_TWINKLE_FACTOR
                        });
                    } else {
                        etoilesRejetees++;
                    }
                }
                if (etoilesRejetees > 0) {
                    console.warn(`[GameSetupController] ${etoilesRejetees} étoile(s) de 'stars' ignorée(s) : x et y doivent être des nombres finis.`);
                }
            } else if (data && data.starsConfig) {
                // Générer les étoiles à partir d'une configuration compacte
                const cfg = (typeof data.starsConfig === 'object' && !Array.isArray(data.starsConfig)) ? data.starsConfig : {};
                if (cfg !== data.starsConfig) {
                    console.warn(`[GameSetupController] 'starsConfig' n'est pas un objet (${typeof data.starsConfig}) : configuration par défaut utilisée.`);
                }
                // count/radius devaient être des nombres finis > 0 : une chaîne ("abc") donnait
                // NaN puis ZÉRO étoile, sans aucun message (ciel vide inexpliqué).
                const count = Math.max(0, Math.min(GameSetupController.MAX_ETOILES,
                    GameSetupController._lireCompte(cfg.count, PARTICLES.STAR_COUNT, 'starsConfig.count')));
                const radius = Math.max(1, GameSetupController._lireNombrePositif(cfg.radius, PARTICLES.VISIBLE_RADIUS, 'starsConfig.radius'));
                const seed = (GameSetupController.estNombreFini(cfg.seed) ? cfg.seed : (Date.now() % 2147483647)) >>> 0;
                if (cfg.seed !== undefined && !GameSetupController.estNombreFini(cfg.seed)) {
                    console.warn(`[GameSetupController] 'starsConfig.seed' invalide (${GameSetupController._decrire(cfg.seed)}) : graine aléatoire utilisée (ciel non reproductible).`);
                }
                let state = seed || 1;
                const rnd = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
                universeModel.stars = [];
                for (let i = 0; i < count; i++) {
                    const angle = rnd() * Math.PI * 2;
                    const dist = Math.sqrt(rnd()) * radius;
                    universeModel.stars.push({
                        x: Math.cos(angle) * dist,
                        y: Math.sin(angle) * dist,
                        brightness: RENDER.STAR_BRIGHTNESS_BASE + rnd() * RENDER.STAR_BRIGHTNESS_RANGE,
                        // Idem : sans twinkleSpeed, updateStars produit brightness = NaN.
                        // Tiré du même générateur pseudo-aléatoire seedé, pour rester déterministe.
                        twinkleSpeed: rnd() * RENDER.STAR_TWINKLE_FACTOR
                    });
                }
            } else {
                // Si non fourni, garde la génération par défaut de UniverseModel.initializeStars()
            }

            // Appliquer des particules d'astéroïdes si fournies
            if (data && Array.isArray(data.asteroids)) {
                universeModel.asteroids = [];
                // Un tableau `asteroids` explicite n'avait aucun plafond.
                let listeAsteroides = data.asteroids;
                if (listeAsteroides.length > GameSetupController.MAX_ASTEROIDES) {
                    console.warn(`[GameSetupController] 'asteroids' contient ${listeAsteroides.length} entrées : TRONQUÉ à ${GameSetupController.MAX_ASTEROIDES}.`);
                    listeAsteroides = listeAsteroides.slice(0, GameSetupController.MAX_ASTEROIDES);
                }
                let asteroidesRejetes = 0;
                for (const a of listeAsteroides) {
                    if (a && GameSetupController.estNombreFini(a.x) && GameSetupController.estNombreFini(a.y)) {
                        universeModel.asteroids.push({
                            x: a.x,
                            y: a.y,
                            size: GameSetupController.estNombreFini(a.size) ? a.size : 2,
                            color: a.color || '#888888',
                            brightness: GameSetupController.estNombreFini(a.brightness) ? a.brightness : 1.0
                        });
                    } else {
                        asteroidesRejetes++;
                    }
                }
                if (asteroidesRejetes > 0) {
                    console.warn(`[GameSetupController] ${asteroidesRejetes} astéroïde(s) de 'asteroids' ignoré(s) : x et y doivent être des nombres finis.`);
                }
            } else if (data && Array.isArray(data.asteroidBelts)) {
                // Plusieurs ceintures
                universeModel.asteroids = [];
                let ceintures = data.asteroidBelts;
                if (ceintures.length > GameSetupController.MAX_CEINTURES) {
                    console.warn(`[GameSetupController] ${ceintures.length} ceintures d'astéroïdes déclarées : TRONQUÉ à ${GameSetupController.MAX_CEINTURES}. Le compte de chaque ceinture était borné, mais pas leur nombre (2000 × 20 000 = 40 M d'astéroïdes = 2 Go).`);
                    ceintures = ceintures.slice(0, GameSetupController.MAX_CEINTURES);
                }
                for (const belt of ceintures) {
                    // Budget global restant : plafonne le TOTAL, pas seulement chaque ceinture.
                    const restant = GameSetupController.MAX_ASTEROIDES - universeModel.asteroids.length;
                    if (restant <= 0) {
                        console.warn(`[GameSetupController] Plafond de ${GameSetupController.MAX_ASTEROIDES} astéroïdes atteint : les ceintures restantes ne sont PAS générées.`);
                        break;
                    }
                    try {
                        const gen = this._generateAsteroidBeltFromConfig(belt, universeModel, restant) || [];
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

            // Stocker l'info de spawn et repositionner la fusée si demandé
            if (existingRocketModel) {
                // RELOAD SÛR : repartir d'un état fusée PROPRE avant d'appliquer le spawn.
                // Sans cela, un décollage/atterrissage en cours au moment du reload "fuit" dans le
                // nouveau monde : propulseurs encore actifs -> redécollage immédiat ;
                // relativePosition/attachedTo périmés -> téléport ; période de grâce active ->
                // atterrissage non détecté. reset() coupe les propulseurs, efface
                // grâce/relativePosition/attachedTo/destruction et restaure carburant/santé.
                // Inconditionnel : sans spawn dans le preset, l'épave d'un crash antérieur
                // survivait au changement de monde (le jeu rebasculait aussitôt en
                // CRASH_ANIMATION, sans explosion ni écran de game over) et les propulseurs
                // restaient allumés.
                if (typeof existingRocketModel.reset === 'function') {
                    existingRocketModel.reset();
                }
                if (data && data.rocket && data.rocket.spawn && existingRocketModel.setPosition) {
                    const spawn = data.rocket.spawn;
                    if (typeof spawn !== 'object' || Array.isArray(spawn)) {
                        console.error(`[GameSetupController.buildWorldFromData] rocket.spawn n'est pas un objet (${Array.isArray(spawn) ? 'tableau' : typeof spawn}) : aucun mode de spawn exploitable, repli sur le premier corps céleste.`);
                    }
                    universeModel.spawnInfo = JSON.parse(JSON.stringify(spawn));

                    // `angle` doit être un nombre FINI : une chaîne ("0.3") ne correspondait à
                    // AUCUN des deux modes ci-dessous, la fusée restait donc à (0,0) — c'est-à-dire
                    // DANS l'étoile centrale des six mondes — et se faisait éjecter à |v| ≈ 1,1e5.
                    const angleValide = GameSetupController.estNombreFini(spawn.angle);
                    // Le nom d'hôte est normalisé comme les noms de corps (CelestialBodyFactory
                    // convertit un `name` numérique en chaîne) pour que l'appariement tienne.
                    let nomHote = null;
                    if (typeof spawn.hostName === 'string' && spawn.hostName.length > 0) {
                        nomHote = spawn.hostName;
                    } else if (GameSetupController.estNombreFini(spawn.hostName)) {
                        nomHote = String(spawn.hostName);
                    } else if (spawn.hostName !== undefined && spawn.hostName !== null) {
                        console.warn(`[GameSetupController.buildWorldFromData] rocket.spawn.hostName invalide (${typeof spawn.hostName} ${GameSetupController._decrire(spawn.hostName)}) : une chaîne est attendue.`);
                    }

                    // `spawnApplique` recense si l'UN des modes a effectivement placé la fusée.
                    // Sans ce suivi, un spawn ne correspondant à aucun mode laissait la fusée à
                    // l'origine sans le moindre message (l'avertissement "spawn absent" ne se
                    // déclenche pas puisque `spawn` existe bel et bien).
                    let spawnApplique = false;

                    // Mode 1: hostName + angle (spécifie l'astre de départ et l'angle à la surface)
                    if (nomHote !== null && angleValide) {
                        const host = universeModel.celestialBodies.find(b => b.name === nomHote);
                        // CORRECTION: Valider que le corps hôte existe avant de l'utiliser
                        if (!host) {
                            console.error(`[GameSetupController.buildWorldFromData] Corps hôte '${nomHote}' non trouvé pour le spawn. Recherche d'un fallback...`);
                        } else if (host.position && GameSetupController.estNombreFini(host.radius)) {
                            GameSetupController._poserFuseeSurCorps(existingRocketModel, host, spawn.angle);
                            spawnApplique = true;
                        } else {
                            console.error(`[GameSetupController.buildWorldFromData] Corps hôte '${nomHote}' invalide (position ou radius manquant)`);
                        }
                    }
                    // Mode 2: position/velocity/angle absolus.
                    // EXCLUSIF du mode "hostName" : sans ce `else`, un preset déclarant les deux
                    // écrasait la vitesse orbitale héritée du corps hôte par celle du JSON.
                    // La condition doit être l'exacte NÉGATION de celle du mode 1, sinon un preset
                    // déclarant `hostName` sans `angle` numérique ET une `position` ne serait traité
                    // par AUCUN des deux modes ici, alors que GameController.resetRocket (touche R)
                    // appliquerait sa position : chargement du monde et respawn divergeraient.
                    const modeHote = (nomHote !== null && angleValide);
                    if (!modeHote && spawn.position !== undefined && spawn.position !== null) {
                        // Validation d'ENSEMBLE (et non composante par composante) : avec
                        // `spawn.position.x || 0`, un `x` en chaîne donnait une position Matter
                        // devenant une chaîne concaténée, et un `x` Infinity donnait NaN.
                        // Une position invalide passe donc au repli ci-dessous plutôt que de
                        // poser la fusée à (0,0), c'est-à-dire dans l'étoile centrale.
                        const p = GameSetupController._lirePointFini(spawn.position, 'rocket.spawn.position');
                        if (p) {
                            existingRocketModel.setPosition(p.x, p.y);
                            existingRocketModel.isLanded = false;
                            existingRocketModel.landedOn = null;
                            spawnApplique = true;
                        }
                    }
                    if (!modeHote && spawn.velocity !== undefined && spawn.velocity !== null && existingRocketModel.setVelocity) {
                        // La vélocité du preset est en unités/seconde ; le modèle stocke une
                        // vélocité en échelle Matter (× MATTER_BASE_DELTA), comme le fait déjà le
                        // mode "hostName" ci-dessus. Sans cette conversion un spawn en mode absolu
                        // démarrait ~16,7× trop lentement par rapport au JSON.
                        const v = GameSetupController._lirePointFini(spawn.velocity, 'rocket.spawn.velocity');
                        if (v) {
                            existingRocketModel.setVelocity(
                                v.x * PHYSICS.MATTER_BASE_DELTA,
                                v.y * PHYSICS.MATTER_BASE_DELTA
                            );
                        } else {
                            console.warn('[GameSetupController.buildWorldFromData] rocket.spawn.velocity ignorée (vélocité nulle conservée).');
                        }
                    }
                    if (angleValide && existingRocketModel.setAngle) {
                        existingRocketModel.setAngle(spawn.angle);
                    } else if (spawn.angle !== undefined && spawn.angle !== null) {
                        console.error(`[GameSetupController.buildWorldFromData] rocket.spawn.angle invalide (${typeof spawn.angle} ${GameSetupController._decrire(spawn.angle)}) : un nombre fini (radians) est attendu.`);
                    }

                    // REPLI : aucun mode n'a placé la fusée (hôte introuvable/invalide, angle mal
                    // typé, position non finie, spawn vide...). On la pose sur le premier corps
                    // céleste disponible plutôt que de la laisser à l'origine, où elle se trouve
                    // à l'intérieur de l'étoile centrale dans les six mondes livrés.
                    if (!spawnApplique) {
                        // Un mode a-t-il seulement été RECONNU ? Si oui, la cause exacte de
                        // l'échec a déjà été journalisée juste au-dessus (hôte introuvable,
                        // position non finie...) : inutile de prétendre qu'aucun mode ne
                        // correspondait.
                        const modeReconnu = modeHote || (spawn.position !== undefined && spawn.position !== null);
                        if (!modeReconnu) {
                            console.error('[GameSetupController.buildWorldFromData] rocket.spawn ne correspond à AUCUN mode valide (hostName + angle numérique, ou position {x,y} finie).');
                        }
                        console.error('[GameSetupController.buildWorldFromData] Spawn non appliqué : repli sur le premier corps céleste (sans cela la fusée resterait à (0,0), c\'est-à-dire dans l\'étoile centrale).');
                        GameSetupController._poserFuseeEnRepli(existingRocketModel, universeModel, angleValide ? spawn.angle : 0);
                    }
                } else {
                    // Preset sans `rocket.spawn` : même repli que ci-dessus (cf. GameController.resetRocket).
                    GameSetupController._poserFuseeEnRepli(existingRocketModel, universeModel, 0);
                }
                existingRocketModel.isDestroyed = false;
            }
        } catch (e) {
            // NE PAS avaler l'erreur : la relayer à l'appelant. Auparavant elle n'était que
            // journalisée et l'univers partiellement construit était renvoyé comme un SUCCÈS —
            // `resetWorld` émettait RELOAD_COMPLETED, l'écran de démarrage disparaissait, et le
            // joueur se retrouvait dans un vide sans corps ni gravité, la touche R sans effet.
            // Un simple `null` égaré dans `bodies`, ou un `parentName` valant "constructor",
            // suffisait à déclencher ce scénario.
            console.error('[GameSetupController.buildWorldFromData] Erreur de construction:', e);
            throw e;
        }
        // Charger les missions si présentes
        try {
            // Toujours (re)charger, même quand le monde ne déclare AUCUNE mission : sinon les
            // missions du monde précédent survivaient au changement d'univers (elles restaient
            // affichées, impossibles à accomplir car leurs corps n'existent plus, et
            // `_lastLoadedMissions` les réinjectait au reset de la fusée).
            if (this.missionManager && typeof this.missionManager.loadFromData === 'function') {
                // `missions` fourni mais pas sous forme de tableau (objet, chaîne...) : le monde
                // se chargeait SANS AUCUNE mission et sans le moindre message.
                if (data && data.missions !== undefined && data.missions !== null && !Array.isArray(data.missions)) {
                    console.warn(`[GameSetupController] 'missions' n'est pas un tableau (${typeof data.missions}) : aucune mission chargée pour ce monde.`);
                }
                const missionsData = (data && Array.isArray(data.missions)) ? data.missions : [];
                this.missionManager.loadFromData(missionsData);
            }
        } catch (e) {
            console.warn('[GameSetupController] Échec chargement missions depuis data:', e);
        }

        return { universeModel };
    }

    /**
     * Génère une ceinture d'astéroïdes (particules non physiques) entre deux rayons.
     *
     * Ancrage optionnel sur un corps céleste : si `cfg.centerName` est fourni et que le corps
     * correspondant existe dans `universeModel.celestialBodies`, la ceinture est centrée sur la
     * position COURANTE de ce corps. Chaque astéroïde mémorise alors `centerName` ainsi que son
     * offset (`offsetX`, `offsetY`) relatif au centre de l'hôte, ce qui permet à la vue de
     * recentrer la ceinture à chaque frame sur la position courante de l'hôte (corps en orbite).
     * Sans `centerName`, on retombe sur `cfg.center || {x:0,y:0}` (comportement mondes 1-4).
     *
     * @param {{innerRadius:number, outerRadius:number, count:number, seed?:number, center?:{x:number,y:number}, centerName?:string, sizeRange?:{min:number,max:number}, color?:string, brightness?:number}} cfg
     * @param {UniverseModel} universeModel
     * @param {number} [budget] Nombre maximal d'astéroïdes autorisés pour CETTE ceinture
     *        (reste du plafond global MAX_ASTEROIDES).
     * @returns {Array<{x:number,y:number,size:number,color:string,brightness:number,centerName?:string,offsetX?:number,offsetY?:number}>}
     */
    _generateAsteroidBeltFromConfig(cfg, universeModel, budget) {
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
            console.warn(`[GameSetupController] Ceinture ignorée : configuration invalide (${GameSetupController._decrire(cfg)}).`);
            return [];
        }
        // Rayons/compte devaient être des nombres finis > 0 : une chaîne ("abc") donnait NaN,
        // donc ZÉRO astéroïde généré, sans le moindre message.
        const innerR = Math.max(1, GameSetupController._lireNombrePositif(cfg.innerRadius, 32000, 'asteroidBelt.innerRadius'));
        const outerRDemande = GameSetupController._lireNombrePositif(cfg.outerRadius, 44000, 'asteroidBelt.outerRadius');
        const outerR = Math.max(innerR + 1, outerRDemande);
        let count = Math.max(0, Math.min(GameSetupController.MAX_ASTEROIDES,
            GameSetupController._lireCompte(cfg.count, 1500, 'asteroidBelt.count')));
        if (GameSetupController.estNombreFini(budget) && count > budget) {
            console.warn(`[GameSetupController] Ceinture tronquée à ${budget} astéroïdes (au lieu de ${count}) : plafond global de ${GameSetupController.MAX_ASTEROIDES} astéroïdes.`);
            count = Math.max(0, Math.floor(budget));
        }
        const seed = (GameSetupController.estNombreFini(cfg.seed) ? cfg.seed : (Date.now() % 2147483647)) >>> 0;
        if (cfg.seed !== undefined && !GameSetupController.estNombreFini(cfg.seed)) {
            console.warn(`[GameSetupController] 'asteroidBelt.seed' invalide (${GameSetupController._decrire(cfg.seed)}) : graine aléatoire utilisée (ceinture non reproductible).`);
        }

        // Ancrage optionnel sur un corps céleste nommé. Si introuvable, log + fallback statique.
        let host = null;
        if (cfg.centerName && universeModel && Array.isArray(universeModel.celestialBodies)) {
            host = universeModel.celestialBodies.find(b => b && b.name === cfg.centerName) || null;
            if (!host) {
                console.warn(`[GameSetupController] Ceinture: corps hôte '${cfg.centerName}' introuvable, ancrage ignoré (centre statique).`);
            }
        }
        // Centre de génération : position courante de l'hôte si ancré, sinon center statique.
        // `cfg.center` doit être un couple de nombres FINIS : sinon toute la ceinture serait
        // générée en NaN (astéroïdes invisibles, aucune erreur).
        let center = { x: 0, y: 0 };
        if (host && host.position) {
            center = { x: host.position.x, y: host.position.y };
        } else if (cfg.center !== undefined && cfg.center !== null) {
            center = GameSetupController._lirePointFini(cfg.center, 'asteroidBelt.center') || { x: 0, y: 0 };
        }
        const centerName = host ? host.name : null;

        const sizeMin = GameSetupController._lireNombrePositif(cfg.sizeRange && cfg.sizeRange.min, 1, 'asteroidBelt.sizeRange.min');
        const sizeMax = GameSetupController._lireNombrePositif(cfg.sizeRange && cfg.sizeRange.max, 3, 'asteroidBelt.sizeRange.max');
        const color = typeof cfg.color === 'string' ? cfg.color : '#9aa3a7';
        const brightness = GameSetupController.estNombreFini(cfg.brightness) ? cfg.brightness : 0.9;

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
            // Offset relatif au centre (= au centre de l'hôte si ancré).
            const offsetX = Math.cos(angle) * r;
            const offsetY = Math.sin(angle) * r;
            const x = center.x + offsetX;
            const y = center.y + offsetY;
            const size = sizeMin + (sizeMax - sizeMin) * rand();
            const asteroid = { x, y, size, color, brightness };
            // Si ancré : conserver de quoi recentrer chaque frame sur l'hôte courant (vue).
            if (centerName) {
                asteroid.centerName = centerName;
                asteroid.offsetX = offsetX;
                asteroid.offsetY = offsetY;
            }
            asteroids.push(asteroid);
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
            console.log(`[GameSetupController] Appel de rocketController.subscribeToEvents()`);
            rocketController.subscribeToEvents();
        } else {
            console.error(`[GameSetupController] ❌ RocketController invalide ou subscribeToEvents n'est pas une fonction!`, rocketController);
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