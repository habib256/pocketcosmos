/**
 * @file TrainingOrchestrator.js
 * Orchestrateur pour l'entraînement intensif de l'agent IA RocketAI
 * Utilise HeadlessRocketEnvironment pour un entraînement rapide sans rendu
 */

class TrainingOrchestrator {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.isTraining = false;
        this.isPaused = false;
        this._unsubs = [];
        
        // Configuration par défaut
        this.config = {
            maxEpisodes: 1000,
            maxStepsPerEpisode: 2000,
            targetSuccessRate: 0.8,
            evaluationInterval: 100,
            checkpointInterval: 500,
            patience: 200, // Early stopping
            
            // Hyperparamètres IA
            learningRate: 0.001,
            epsilon: 1.0,
            epsilonMin: 0.1,
            epsilonDecay: 0.98,
            gamma: 0.99,
            batchSize: 64,
            replayBufferSize: 50000,
            
            // Configuration environnement
            headlessMode: true,
            logInterval: 50,
            visualSpeed: 1, // Mode visuel : cadence de rendu (×1 = fluide … ×20 = avance rapide)

            // Nom du modèle dans le model zoo (AIModelStore). Si null, dérivé de
            // l'objectif au démarrage : '<objectif>-default'.
            modelName: null,

            // Seed de reproductibilité (null = non déterministe, Math.random). Quand défini :
            // angles initiaux + exploration epsilon reproductibles, et jeu d'éval fixe.
            seed: null,
            
            // Objectifs d'entraînement
            // CORRECTION (bug défaut objectif): la doc décrit 'navigate' comme objectif par
            // défaut. L'ancien défaut ['orbit','land','explore'] écrasait
            // trainingState.currentObjective='navigate' quand startTraining était appelé sans
            // objectives explicites. L'UI passe ses propres objectives, donc ce défaut ne
            // s'applique qu'en l'absence de configuration utilisateur.
            objectives: ['navigate']
        };
        
        // Métriques d'entraînement
        this.metrics = {
            episode: 0,             // Index 0-based de la boucle d'entraînement (PAS un compteur)
            episodesCompleted: 0,   // Nombre d'épisodes réellement terminés
            totalSteps: 0,
            totalReward: 0,
            bestAverageReward: -Infinity,
            successfulEpisodes: 0,
            averageRewards: [],
            losses: [],
            explorationRates: [],
            episodeLengths: [],
            lastEvaluationScore: 0,
            trainingStartTime: null,
            lastCheckpointTime: null,
            // Métriques de pilotage qualité (fenêtres glissantes)
            stepsPerSecond: 0,          // Vitesse réelle du pipeline (fenêtre 20 épisodes)
            recentSuccessRate: 0,       // Taux de succès (fenêtre 50 épisodes)
            medianStepsToSuccess: null, // Médiane des steps des épisodes d'éval réussis
            episodeDurations: [],       // ms, fenêtre pour stepsPerSecond
            recentSuccesses: []         // booléens, fenêtre pour recentSuccessRate
        };
        
        // État d'entraînement
        this.trainingState = {
            currentObjective: 'navigate', // CORRECTION: Premier objectif = navigation point à point sans planètes
            bestModelWeights: null,
            earlyStoppingCounter: 0,
            recentPerformance: []
        };
        
        // Environnements pour l'entraînement et l'évaluation
        this.trainingEnv = null;
        this.evaluationEnv = null;
        this.rocketAI = null;

        // CORRECTION (Stop puis Start rapproché) : compteur de "génération" de session. Il est
        // incrémenté à chaque startTraining() et capturé par les traitements de fin asynchrones
        // (finalizeTraining / cleanupAfterError). Ces derniers ne libèrent/annulent les champs
        // partagés (rocketAI, trainingEnv, evaluationEnv, isTraining) que si la génération n'a pas
        // changé entre-temps — sinon ils détruiraient les ressources du run SUIVANT.
        this._runGeneration = 0;

        // Budget de pas par épisode RÉELLEMENT utilisé par le run courant (peut différer de
        // config.maxStepsPerEpisode pour l'objectif 'navigate'). Voir initializeEnvironments().
        this.effectiveMaxStepsPerEpisode = null;

        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Helper d'abonnement avec tracking/cleanup
        const trackSub = (eventType, handler) => {
            const unsub = this.eventBus.subscribe(eventType, handler);
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(unsub);
            } else {
                this._unsubs.push(unsub);
            }
        };

        // Écouter les commandes d'entraînement
        trackSub(window.EVENTS.AI.START_TRAINING, (data) => this.startTraining(data));
        trackSub(window.EVENTS.AI.STOP_TRAINING, () => this.stopTraining());
        trackSub(window.EVENTS.AI.PAUSE_TRAINING, () => this.pauseTraining());
        trackSub(window.EVENTS.AI.RESUME_TRAINING, () => this.resumeTraining());
        trackSub(window.EVENTS.AI.UPDATE_CONFIG, (config) => this.updateConfig(config));
    }
    
    /**
     * Démarre l'entraînement avec la configuration fournie
     */
    /**
     * Budget de pas par épisode RÉELLEMENT utilisé par le run courant.
     * RESTAURÉE lors de la fusion : appelée par la boucle d'épisode et par l'évaluation, sa
     * définition se trouvait dans un bloc écarté. Le budget vit dans un champ dédié plutôt que
     * réécrit dans `this.config` : sinon un run 'navigate' (4000 pas) contaminait le run suivant
     * d'un autre objectif, qui héritait silencieusement de 4000 au lieu de 2000.
     * @returns {number}
     */
    getMaxStepsPerEpisode() {
        return this.effectiveMaxStepsPerEpisode || this.config.maxStepsPerEpisode;
    }

    async startTraining(userConfig = {}) {
        if (this.isTraining) {
            return;
        }

        // FILE DE RUNS (curriculum) : si userConfig.trainingRuns est fourni, exécuter les étapes
        // en séquence (chacune = un entraînement complet), avec warm-start optionnel entre elles.
        if (userConfig.trainingRuns && userConfig.trainingRuns.length > 0) {
            return this.runCurriculum(userConfig);
        }

        try {
        // Identifiant de CE run. Les gardes de génération (cleanupAfterError, trainingLoop,
        // runTrainingEpisode, evaluateAgent, finalizeTraining) le comparent à this._runGeneration
        // pour ignorer les callbacks d'un run précédent quand on enchaîne Stop puis Start.
        // Sans cette déclaration, les trois usages plus bas lèvent une ReferenceError (mode strict)
        // et AUCUN entraînement ne peut démarrer.
        this._runGeneration = (this._runGeneration || 0) + 1;
        const runId = this._runGeneration;

        // Fusionner la configuration utilisateur avec la configuration par défaut
        this.config = { ...this.config, ...userConfig };
        
        // CORRECTION: S'assurer que maxEpisodes est bien défini et valide
        if (!this.config.maxEpisodes || this.config.maxEpisodes < 1) {
            this.config.maxEpisodes = 1000; // Valeur par défaut
        }
        
        // Résolution du RÔLE (facultatif) : un rôle (race/intercept/lander/orbiter) définit un
        // objectif de base + des paramètres de mission (cible mobile, mode de succès, bonus…).
        // Priorité au rôle ; sinon on retombe sur config.objectives[0] (rétrocompat).
        this.trainingState.roleParams = this._resolveRole(this.config.role);
        if (this.trainingState.roleParams) {
            this.trainingState.currentObjective = this.trainingState.roleParams.objective;
        } else if (this.config.objectives && this.config.objectives.length > 0) {
            this.trainingState.currentObjective = this.config.objectives[0];
        }

        // Nom du modèle dans le zoo : défaut dérivé du rôle ('race-default') ou de l'objectif.
        if (!this.config.modelName) {
            const base = this.config.role || this.trainingState.currentObjective;
            this.config.modelName = base + '-default';
        }

        // RNG de reproductibilité. Flux séparés : entraînement (this.rng) vs évaluation
        // (jeu d'angles fixe), pour que l'éval reste comparable quelle que soit la
        // consommation d'aléa de l'entraînement.
        const hasSeed = (this.config.seed !== null && this.config.seed !== undefined);
        this.rng = hasSeed ? SeededRandom.mulberry32(this.config.seed >>> 0) : Math.random;
        const evalSeed = hasSeed ? SeededRandom.derive(this.config.seed >>> 0, 0x5EED) : ((Math.random() * 0xFFFFFFFF) >>> 0);
        this._evalAngles = SeededRandom.angleSet(evalSeed, 10); // 10 = numEvaluationEpisodes

        // CORRECTION: Réinitialiser les métriques au début de l'entraînement
        this.metrics.episode = 0;
        this.metrics.episodesCompleted = 0; // Nombre d'épisodes RÉELLEMENT terminés (voir updateMetrics)
        this.metrics.totalSteps = 0;
        this.metrics.totalReward = 0;
        this.metrics.successfulEpisodes = 0; // CORRECTION: Réinitialiser le compteur de succès
        this.metrics.averageRewards = [];
        this.metrics.losses = [];
        this.metrics.explorationRates = [];
        this.metrics.episodeLengths = [];
        this.metrics.lastEvaluationScore = 0;
        this.metrics.bestAverageReward = -Infinity;
        this.metrics.trainingStartTime = Date.now();
        this.metrics.lastCheckpointTime = null;
        this.metrics.stepsPerSecond = 0;
        this.metrics.recentSuccessRate = 0;
        this.metrics.medianStepsToSuccess = null;
        this.metrics.episodeDurations = [];
        this.metrics.recentSuccesses = [];
        // État de l'arrêt anticipé : à remettre à zéro AVEC les métriques. Il ne l'était pas, si
        // bien qu'une étape de curriculum démarrait avec jusqu'à 10 scores d'évaluation de
        // l'étape précédente — un autre objectif, sur une autre échelle de récompense — et un
        // compteur de patience non nul, ce qui pouvait déclencher l'arrêt anticipé presque
        // immédiatement.
        this.trainingState.recentPerformance = [];
        this.trainingState.earlyStoppingCounter = 0;
        this.isTraining = true;
            
            // Initialiser les environnements
            await this.initializeEnvironments();
            
            // Initialiser l'agent IA
            await this.initializeAgent();
            
            // Émettre l'événement de début d'entraînement
            this.eventBus.emit(window.EVENTS.AI.TRAINING_STARTED, {
                config: this.config,
                timestamp: this.metrics.trainingStartTime
            });
            
            // Démarrer la boucle d'entraînement (elle porte l'identifiant de CE run)
            await this.trainingLoop(runId);

        } catch (error) {
            // Ignorer silencieusement les erreurs "disposed" car c'est un comportement attendu lors du cleanup
            const isDisposedError = error.message && error.message.includes('disposed');
            
            // Erreurs ignorées silencieusement (dont "disposed")
            
            // Nettoyer les ressources en cas d'erreur (uniquement celles de CE run)
            await this.cleanupAfterError(runId);

            // N'émettre l'événement d'erreur que pour les vraies erreurs, et seulement si un
            // nouveau run n'a pas déjà démarré entre-temps (sinon l'UI afficherait "Erreur
            // d'entraînement" alors que la session courante tourne normalement).
            if (!isDisposedError && this._runGeneration === runId) {
                this.eventBus.emit(window.EVENTS.AI.TRAINING_ERROR, { error: error.message });
            }
        }
    }

    /**
     * Exécute une FILE DE RUNS séquentiels (curriculum / rôles). Chaque étape est un entraînement
     * complet indépendant, avec warm-start optionnel depuis le zoo (transfert entre étapes).
     * @param {object} userConfig - config globale, contient trainingRuns:
     *   [{ role?, objective?, episodes?, loadFrom?, saveAs?, seed? }]
     *   - role/objective : rôle ou objectif de l'étape
     *   - episodes       : nombre d'épisodes (défaut : userConfig.maxEpisodes)
     *   - loadFrom       : nom d'un modèle du zoo à charger avant d'entraîner (warm-start)
     *   - saveAs         : nom sous lequel sauvegarder (défaut : '<role|objective>-vN')
     */
    async runCurriculum(userConfig = {}) {
        const runs = userConfig.trainingRuns || [];
        const base = { ...userConfig };
        delete base.trainingRuns; // éviter la récursion infinie dans startTraining

        // Remise à zéro AVANT la boucle : stopTraining() lève ce drapeau pour n'importe quel run,
        // curriculum ou non. Un simple arrêt manuel d'un entraînement ordinaire faisait donc
        // avorter le curriculum suivant dès la fin de sa première étape.
        this._curriculumAborted = false;

        for (let i = 0; i < runs.length; i++) {
            const stage = runs[i] || {};
            this.eventBus.emit(window.EVENTS.AI.CURRICULUM_STAGE_STARTED, {
                index: i, total: runs.length, stage
            });

            // Une étape qui déclare explicitement un `objective` sans `role` ne doit PAS hériter
            // du rôle global : _resolveRole a priorité sur `objectives`, si bien qu'une étape
            // {objective:'orbit'} sous un role:'race' global entraînait 'navigate' en course.
            const roleEtape = stage.role || (stage.objective ? null : (base.role || null));

            const stageConfig = {
                ...base,
                role: roleEtape,
                objectives: stage.objective ? [stage.objective] : base.objectives,
                maxEpisodes: stage.episodes || base.maxEpisodes,
                loadFrom: stage.loadFrom || null,
                // Défaut '<rôle|objectif>-v<n>' comme documenté ci-dessus. L'ancien `null`
                // retombait sur '<rôle|objectif>-default' dans startTraining : deux étapes
                // successives sur le même rôle s'écrasaient silencieusement dans le zoo.
                modelName: stage.saveAs || ((roleEtape || stage.objective || 'run') + '-v' + (i + 1)),
                seed: (stage.seed !== undefined) ? stage.seed : base.seed
            };

            // startTraining remet isTraining à false via finalizeTraining ; on peut donc
            // enchaîner. (trainingRuns absent de stageConfig → run unique.)
            await this.startTraining(stageConfig);

            // Si l'utilisateur a stoppé en cours, ne pas enchaîner les étapes suivantes.
            this.eventBus.emit(window.EVENTS.AI.CURRICULUM_STAGE_COMPLETED, {
                index: i, total: runs.length, stage, modelName: this.config.modelName
            });
            if (this._curriculumAborted) break;
        }

        this._curriculumAborted = false;
        this.eventBus.emit(window.EVENTS.AI.CURRICULUM_COMPLETED, { stages: runs.length });
    }

    /**
     * Nettoie les ressources après une erreur pour permettre un nouveau démarrage
     */
    async cleanupAfterError(runId = this._runGeneration) {
        // CORRECTION (Stop/Start rapproché) : ce nettoyage est asynchrone (attente de 350 ms). Si
        // un nouveau run a démarré pendant l'attente, il ne faut PAS toucher à ses ressources.
        if (this._runGeneration !== runId) return;

        this.isTraining = false;
        this.isPaused = false;

        // Nettoyer l'agent IA avec un délai suffisant pour que les opérations async s'arrêtent
        const agent = this.rocketAI;
        if (agent) {
            try {
                // Appeler cleanup d'abord pour marquer comme disposé
                if (typeof agent.cleanup === 'function') {
                    agent.cleanup();
                }

                // Attendre que les opérations en cours se terminent et que cleanup() dispose les modèles
                await new Promise(resolve => setTimeout(resolve, 350));

            } catch (e) { /* ignore */ }
            if (this._runGeneration !== runId) return;
            this.rocketAI = null;
        }

        if (this._runGeneration !== runId) return;

        // Réinitialiser les environnements
        this.trainingEnv = null;
        this.evaluationEnv = null;
    }
    
    /**
     * Résout un nom de rôle en ses paramètres (AI_TRAINING.ROLES). Renvoie null si aucun rôle.
     * @param {string} [roleName]
     * @return {object|null} copie des params du rôle (objective + params de mission)
     */
    _resolveRole(roleName) {
        if (!roleName) return null;
        const roles = (typeof AI_TRAINING !== 'undefined' && AI_TRAINING.ROLES) ? AI_TRAINING.ROLES : {};
        const r = roles[roleName];
        if (!r) {
            if (globalThis.DEBUG) console.warn(`[TrainingOrchestrator] Rôle inconnu: ${roleName}`);
            return null;
        }
        return { ...r };
    }

    /**
     * Injecte les paramètres du rôle courant dans un objet missionConfig (cible mobile, mode de
     * succès, bonus de course…). Ne touche pas à objective/targetPoint déjà posés.
     * @param {object} missionConfig
     * @return {object} le missionConfig enrichi
     */
    _applyRoleToMissionConfig(missionConfig) {
        const rp = this.trainingState.roleParams;
        if (!rp) return missionConfig;
        if (rp.movingTarget) missionConfig.movingTarget = { ...rp.movingTarget };
        if (rp.successMode) missionConfig.successMode = rp.successMode;
        if (rp.proximityRadius != null) missionConfig.proximityRadius = rp.proximityRadius;
        if (rp.proximitySteps != null) missionConfig.proximitySteps = rp.proximitySteps;
        if (rp.raceTimeBonus) missionConfig.raceTimeBonus = true;
        if (rp.stepPenaltyFactor != null) missionConfig.stepPenaltyFactor = rp.stepPenaltyFactor;
        return missionConfig;
    }

    /**
     * Initialise les environnements d'entraînement et d'évaluation
     */
    async initializeEnvironments() {
        
        // CORRECTION: Définir aiEnvConfig avant le if/else pour qu'il soit disponible partout
        const aiEnvConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.ENVIRONMENT : {
            EARTH_POSITION: { x: 0, y: 0 },
            ROCKET_INITIAL_OFFSET: 50
        };
        
        // CORRECTION: Configuration différente selon l'objectif d'entraînement
        let trainingConfig;
        
        if (this.trainingState.currentObjective === 'navigate') {
            // Objectif 'navigate' : navigation point à point sans planètes
            const pointA = { x: 0, y: 0 };
            const pointB = { x: 90000, y: 90000 }; // ~127k unités (diagonale)

            // Angle initial aléatoire pour forcer l'IA à s'orienter.
            // CORRECTION: l'angle n'est plus figé pour tout le run — `randomizeInitialAngle`
            // demande à HeadlessRocketEnvironment.reset() d'en tirer un NOUVEAU à chaque épisode
            // (entraînement ET évaluation, evaluationConfig étant une copie de trainingConfig).
            // La valeur ci-dessous ne sert donc que d'angle du tout premier reset.
            const rocketInitialAngle = (this.rng ? this.rng() : Math.random()) * Math.PI * 2;

            // Budget de steps réduit ~5× (vol plus court A→B). Distance ~127k unités, croisière
            // cible ~2500 u/s → ~51s → ~3000 steps de croisière + freinage ⇒ 4000 steps (66s @ 1/60s).
            const navigateMaxSteps = Math.max(this.config.maxStepsPerEpisode, 4000);

            // CORRECTION (fuite de configuration entre deux runs) : on n'écrit PLUS ce budget dans
            // this.config (persistant et seulement fusionné par startTraining) — un run 'orbit' ou
            // 'land' lancé ensuite héritait silencieusement des 4000 pas/épisode de 'navigate'.
            // Le budget effectif du run est porté par un champ dédié, lu via getMaxStepsPerEpisode().
            this.effectiveMaxStepsPerEpisode = navigateMaxSteps;

            trainingConfig = {
                maxStepsPerEpisode: navigateMaxSteps,
                infiniteFuel: true,
                // PAS de randomizeInitialAngle ici : l'orchestrateur pose lui-même l'angle avant
                // CHAQUE reset — _applyInitialAngle(env, this.rng) pour l'entraînement (seedé,
                // donc reproductible) et _applyFixedEvalAngle(env, i) pour l'évaluation (jeu de
                // 10 angles fixes, ce qui rend les scores comparables entre évaluations, entre
                // runs et entre modèles : c'est la prémisse de compareModels). Laisser le drapeau
                // actif faisait ré-écraser cet angle par un Math.random() non seedé dans reset(),
                // ce qui annulait à la fois la reproductibilité et le jeu d'éval fixe.
                rng: this.rng,
                rocketInitialState: {
                    position: { ...pointA },
                    velocity: { x: 0, y: 0 },
                    angle: rocketInitialAngle,
                    fuel: ROCKET.FUEL_MAX,
                    health: 100,
                    isLanded: false,
                    landedOn: null
                },
                universeConfig: {
                    celestialBodies: [],
                    targetPoint: pointB
                },
                missionConfig: this._applyRoleToMissionConfig({
                    objective: 'navigate',
                    targetPoint: pointB
                })
            };
        } else {
            // Configuration par défaut avec Terre et Lune
            // Position initiale de la fusée : sur la surface de la Terre, côté +Y
            const rocketStartY = aiEnvConfig.EARTH_POSITION.y + CELESTIAL_BODY.RADIUS + aiEnvConfig.ROCKET_INITIAL_OFFSET;
            // CORRECTION : l'angle de départ était -π/2, annoncé « pointant vers le haut ». Faux :
            // le nez / l'axe de poussée principale est (sin a, -cos a) (cf. ThrusterPhysics), donc
            // à -π/2 le nez pointe (-1, 0), strictement HORIZONTAL — alors que la fusée apparaît en
            // (0, R+50), c'est-à-dire côté +Y, où « le haut » est +Y. Mesuré : plein gaz depuis cet
            // angle -> crash au pas 30 (altitude max 49,9) ; avec π -> altitude 217 320.
            // À π : nez = (sin π, -cos π) = (0, +1) = vers le haut depuis la surface côté +Y.
            const rocketInitialAngle = Math.PI; // Nez vers +Y (à l'opposé du centre) pour décoller

            // Budget effectif du run = celui demandé par la configuration utilisateur.
            this.effectiveMaxStepsPerEpisode = this.config.maxStepsPerEpisode;

            trainingConfig = {
                maxStepsPerEpisode: this.config.maxStepsPerEpisode,
                rocketInitialState: {
                    position: { x: aiEnvConfig.EARTH_POSITION.x, y: rocketStartY },
                    velocity: { x: 0, y: 0 },
                    angle: rocketInitialAngle,
                    fuel: ROCKET.FUEL_MAX,
                    health: 100,
                    isLanded: true,
                    landedOn: 'Terre'
                },
                universeConfig: {
                    celestialBodies: [
                        {
                            name: 'Terre',
                            mass: CELESTIAL_BODY.MASS,
                            radius: CELESTIAL_BODY.RADIUS,
                            position: { ...aiEnvConfig.EARTH_POSITION },
                            color: '#1E88E5'
                        },
                        {
                            name: 'Lune',
                            mass: CELESTIAL_BODY.MOON.MASS,
                            radius: CELESTIAL_BODY.MOON.RADIUS,
                            position: { x: CELESTIAL_BODY.MOON.ORBIT_DISTANCE, y: aiEnvConfig.EARTH_POSITION.y },
                            color: '#CCCCCC'
                        }
                    ]
                },
                missionConfig: this._applyRoleToMissionConfig({
                    objective: this.trainingState.currentObjective
                })
            };
        }
        
        // Configuration pour l'environnement d'évaluation
        // CORRECTION: Utiliser la même configuration que l'entraînement pour cohérence
        // Pour 'navigate', utiliser la même config (sans planètes)
        // Pour les autres objectifs, utiliser la config avec Terre et Lune
        // Propager le mode headless à l'environnement : il s'en sert pour ne PAS construire le
        // payload de visualisation (copies profondes tous les 2 pas) quand personne ne l'affiche.
        trainingConfig.headlessMode = (this.config.headlessMode === true);

        const evaluationConfig = {
            ...trainingConfig,
            // Cloner rocketInitialState : sans ça, le spread partage la MÊME référence que
            // trainingConfig, et l'angle initial seedé par épisode (entraînement) écraserait
            // le jeu d'angles fixe de l'évaluation (et inversement). Voir _applyInitialAngle /
            // _applyFixedEvalAngle.
            rocketInitialState: trainingConfig.rocketInitialState
                ? { ...trainingConfig.rocketInitialState,
                    position: trainingConfig.rocketInitialState.position
                        ? { ...trainingConfig.rocketInitialState.position } : undefined,
                    velocity: trainingConfig.rocketInitialState.velocity
                        ? { ...trainingConfig.rocketInitialState.velocity } : undefined }
                : undefined
        };

        // Créer les environnements avec l'EventBus partagé
        this.trainingEnv = new HeadlessRocketEnvironment(trainingConfig);
        this.trainingEnv.eventBus = this.eventBus; // Utiliser l'EventBus partagé
        
        // Réinitialiser les abonnements aux événements avec le nouvel EventBus.
        // On réassigne l'EventBus partagé (nécessaire : HeadlessRocketEnvironment émet
        // AI.TRAINING_STEP / AI.EPISODE_ENDED sur this.eventBus, écouté par le visualizer/UI).
        this.trainingEnv.rocketController.eventBus = this.eventBus;
        this.trainingEnv.physicsController.eventBus = this.eventBus;
        this.trainingEnv.missionManager.eventBus = this.eventBus;


        // Re-souscrire aux événements avec le bon EventBus.
        // subscribeToEvents() est désormais idempotent : il désabonne d'abord les anciens
        // handlers du bus privé jeté avant de se ré-abonner sur le bus partagé, ce qui
        // évite les abonnements orphelins (fuite mémoire) et le double-binding.
        if (typeof this.trainingEnv.rocketController.subscribeToEvents === 'function') {
            this.trainingEnv.rocketController.subscribeToEvents();
        }
        // CORRECTION: Re-souscrire aussi missionManager si la méthode existe
        if (this.trainingEnv.missionManager && typeof this.trainingEnv.missionManager.subscribeToEvents === 'function') {
            this.trainingEnv.missionManager.subscribeToEvents();
        }
        
        this.evaluationEnv = new HeadlessRocketEnvironment(evaluationConfig);
        this.evaluationEnv.eventBus = this.eventBus; // Utiliser l'EventBus partagé
        
        // Réinitialiser les abonnements aux événements avec le nouvel EventBus.
        // (Même rationale que pour trainingEnv : bus partagé requis pour AI.*/UI events.)
        this.evaluationEnv.rocketController.eventBus = this.eventBus;
        this.evaluationEnv.physicsController.eventBus = this.eventBus;
        this.evaluationEnv.missionManager.eventBus = this.eventBus;

        // Re-souscrire aux événements avec le bon EventBus.
        // subscribeToEvents() idempotent : nettoie les abonnements orphelins du bus jeté.
        if (typeof this.evaluationEnv.rocketController.subscribeToEvents === 'function') {
            this.evaluationEnv.rocketController.subscribeToEvents();
        }
        // CORRECTION: Re-souscrire aussi missionManager si la méthode existe
        if (this.evaluationEnv.missionManager && typeof this.evaluationEnv.missionManager.subscribeToEvents === 'function') {
            this.evaluationEnv.missionManager.subscribeToEvents();
        }
    }
    
    /**
     * Initialise et configure l'agent IA
     */
    async initializeAgent() {
        
        // Nettoyer l'ancien agent IA s'il existe pour éviter les fuites mémoire TensorFlow
        if (this.rocketAI) {
            try {
                // Marquer comme disposé d'abord
                if (typeof this.rocketAI.cleanup === 'function') {
                    this.rocketAI.cleanup();
                }
                
                // Attendre un délai suffisant pour que :
                // 1. Les opérations async en cours voient le flag isDisposed
                // 2. Le setTimeout dans cleanup() ait le temps de disposer les modèles
                await new Promise(resolve => setTimeout(resolve, 300));
                
            } catch (e) { /* ignore */ }
            this.rocketAI = null;
        }
        
        // Créer une nouvelle instance
        this.rocketAI = new RocketAI(this.eventBus);
        
        // Attendre que le modèle soit initialisé (important pour éviter les erreurs SIGILL)
        if (typeof this.rocketAI.waitForReady === 'function') {
            await this.rocketAI.waitForReady();
        }
        
        // Injecter les dépendances depuis l'environnement d'entraînement
        if (this.trainingEnv) {
            this.rocketAI.injectDependencies({
                rocketModel: this.trainingEnv.rocketModel,
                universeModel: this.trainingEnv.universeModel,
                physicsController: this.trainingEnv.physicsController,
                missionManager: this.trainingEnv.missionManager,
                rocketController: this.trainingEnv.rocketController
            });
        }
        
        // Configurer les hyperparamètres
        this.rocketAI.config.learningRate = this.config.learningRate;
        this.rocketAI.config.epsilon = this.config.epsilon;
        this.rocketAI.config.epsilonMin = this.config.epsilonMin;
        this.rocketAI.config.epsilonDecay = this.config.epsilonDecay;
        this.rocketAI.config.gamma = this.config.gamma;
        this.rocketAI.config.batchSize = this.config.batchSize;
        this.rocketAI.config.replayBufferSize = this.config.replayBufferSize;
        // runTrainingEpisode() lit this.rocketAI.config.updateFrequency, pas this.config : sans
        // cette recopie, le champ « Fréquence de mise à jour » de l'interface reste sans effet
        // (l'agent conserve son défaut de 4).
        if (typeof this.config.updateFrequency === 'number' && this.config.updateFrequency >= 1) {
            this.rocketAI.config.updateFrequency = Math.floor(this.config.updateFrequency);
        }


        // Objectif et nom de modèle (zoo) : utilisés par saveModel() pour les métadonnées
        this.rocketAI.setObjective(this.trainingState.currentObjective);
        this.rocketAI.modelName = this.config.modelName;

        // Injecter le RNG seedé pour que l'exploration epsilon soit reproductible.
        if (this.rng) {
            this.rocketAI.rng = this.rng;
        }

        // WARM-START (curriculum) : si config.loadFrom est défini, charger les poids d'un modèle
        // existant du zoo dans l'agent neuf avant d'entraîner (transfert, ex: race depuis navigate).
        // Le chargement valide la compatibilité (12 dims) ; en cas d'échec on démarre à froid.
        if (this.config.loadFrom) {
            try {
                const ok = await this.rocketAI.loadModel(this.config.loadFrom);
                if (ok && globalThis.DEBUG) console.warn(`[TrainingOrchestrator] warm-start depuis "${this.config.loadFrom}"`);
            } catch (e) { /* démarrage à froid si incompatible/absent */ }
        }

        // Activer le mode entraînement
        this.rocketAI.isTraining = true;
        // L'orchestrateur gère lui-même la décroissance d'epsilon (une fois par épisode, timeouts
        // compris) -> empêcher RocketAI.handleCrash/handleSuccess de la dupliquer.
        this.rocketAI.epsilonDecayManagedExternally = true;
        
        // Recompiler le modèle avec les nouveaux paramètres
        if (this.rocketAI.model) {
            this.rocketAI.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
        }
    }
    
    /**
     * Boucle d'entraînement principale
     */
    async trainingLoop(runId = this._runGeneration) {
        // CORRECTION: S'assurer que maxEpisodes est bien défini et > 0
        const maxEpisodes = Math.max(1, this.config.maxEpisodes || 1000);

        // CORRECTION (Stop puis Start rapproché) : `runId` identifie CE run. Si l'utilisateur
        // relance un entraînement pendant qu'on est encore dans un await, la génération change :
        // cette boucle (et sa finalisation) doivent alors rendre la main sans rien toucher, sinon
        // elles piloteraient/libéreraient les environnements du run suivant.
        const isCurrentRun = () => this._runGeneration === runId;

        for (let episode = 0; episode < maxEpisodes && this.isTraining && isCurrentRun(); episode++) {
            // Vérifier que l'entraînement n'a pas été arrêté
            if (!this.isTraining) {
                break;
            }

            if (this.isPaused) {
                await this.waitForResume();
            }

            if (!isCurrentRun()) return;

            this.metrics.episode = episode;

            // Exécuter un épisode d'entraînement
            const episodeResult = await this.runTrainingEpisode(runId);

            // Un nouveau run a pris la main pendant l'épisode : abandonner sans finaliser.
            if (!isCurrentRun()) return;

            // Vérifier à nouveau après l'épisode (au cas où runTrainingEpisode aurait modifié isTraining)
            if (!this.isTraining) {
                break;
            }

            // Mettre à jour les métriques
            this.updateMetrics(episodeResult);

            // CORRECTION (dernier épisode jamais affiché) : la progression était émise TOUT À LA
            // FIN de l'itération, donc après les `break` de convergence et d'early stopping —
            // l'affichage restait figé un épisode en arrière quand le run s'arrêtait ainsi.
            // On l'émet désormais dès que les métriques de l'épisode sont à jour.
            this.eventBus.emit(window.EVENTS.AI.TRAINING_PROGRESS, {
                episode: episode + 1, // CORRECTION: Afficher le numéro d'épisode commençant à 1 pour l'interface
                totalEpisodes: maxEpisodes,
                metrics: this.metrics,
                config: this.config
            });

            // Log périodique
            if (episode % this.config.logInterval === 0) {
                this.logProgress();
            }
            
            // Évaluation périodique (avec protection contre les erreurs)
            if (episode % this.config.evaluationInterval === 0 && episode > 0) {
                try {
                    await this.evaluateAgent(runId);
                } catch (error) {
                    // Ignorer les erreurs d'évaluation pour ne pas arrêter l'entraînement
                }
                if (!isCurrentRun()) return;
            }

            // Sauvegarde périodique (avec protection contre les erreurs)
            if (episode % this.config.checkpointInterval === 0 && episode > 0) {
                try {
                    await this.saveCheckpoint();
                } catch (error) {
                    // Ignorer les erreurs de sauvegarde pour ne pas arrêter l'entraînement
                }
                if (!isCurrentRun()) return;
            }

            // CORRECTION: Vérification de convergence (seulement après PLUS de 100 épisodes)
            // Utiliser > au lieu de >= pour permettre au moins 100 épisodes complets
            if (episode > this.config.evaluationInterval && this.checkConvergence()) {
                break;
            }
            
            // Early stopping (seulement après un minimum d'épisodes)
            if (episode >= this.config.evaluationInterval * 2 && this.checkEarlyStopping()) {
                break;
            }

            // IMPORTANT: Céder le contrôle au navigateur pour que l'UI reste réactive
            // Utiliser requestAnimationFrame pour synchroniser avec le rafraîchissement écran
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        // Un run plus récent a démarré : c'est lui qui possède désormais l'agent et les
        // environnements, on ne finalise rien (sinon on les libérerait sous ses pieds).
        if (!isCurrentRun()) return;

        // Finaliser l'entraînement.
        if (this.isTraining) {
            // Fin normale (budget d'épisodes atteint, convergence ou early stopping)
            await this.finalizeTraining(false, runId);
        } else if (this._stopRequested) {
            // CORRECTION : un arrêt demandé par l'utilisateur passait AUTREFOIS à côté de toute
            // la finalisation (le garde `if (this.isTraining)` était faux) : les meilleurs poids
            // (trainingState.bestModelWeights) étaient perdus, aucun checkpoint final n'était
            // écrit et les environnements/l'agent restaient vivants. On finalise donc aussi ici,
            // sans émettre TRAINING_COMPLETED (TRAINING_STOPPED a déjà été émis par stopTraining).
            this._stopRequested = false;
            await this.finalizeTraining(true, runId);
        }
    }
    
    /**
     * Exécute un épisode d'entraînement
     */
    async runTrainingEpisode(runId = this._runGeneration) {
        const startTime = Date.now();

        // Angle initial seedé PAR ÉPISODE (navigate) : diversité d'orientation reproductible
        // (via this.rng) plutôt qu'un angle unique figé pour tout le run.
        this._applyInitialAngle(this.trainingEnv, this.rng);

        // Réinitialiser l'environnement
        let state = this.trainingEnv.reset();
        let done = false;
        let totalReward = 0;
        let steps = 0;
        
        // Émettre l'événement de début d'épisode pour la visualisation
        const celestialBodiesData = (this.trainingEnv.universeModel && this.trainingEnv.universeModel.celestialBodies) 
            ? this.trainingEnv.universeModel.celestialBodies.map(body => ({
                name: body.name,
                position: body.position ? { x: body.position.x, y: body.position.y } : { x: 0, y: 0 },
                radius: body.radius,
                mass: body.mass,
                color: body.color
            })) 
            : [];
        
        this.eventBus.emit(window.EVENTS.AI.EPISODE_STARTED, {
            episode: this.metrics.episode,
            celestialBodies: celestialBodiesData
        });
        
        while (!done && steps < this.getMaxStepsPerEpisode() && this.isTraining) {
            // Vérifier que l'agent est toujours disponible
            if (!this.rocketAI || this.rocketAI.isDisposed) {
                break;
            }

            // Un nouveau run a démarré pendant un await : cet épisode appartient à un run mort,
            // il ne doit plus piloter les environnements (qui sont maintenant ceux du run suivant).
            if (this._runGeneration !== runId) {
                break;
            }
            
            // L'agent choisit une action (sur l'environnement d'entraînement)
            const action = this.getActionFromState(state, this.trainingEnv);

            // Exécuter l'action dans l'environnement
            const result = this.trainingEnv.step(action);

            // Stocker l'expérience pour l'apprentissage
            if (this.rocketAI.isTraining) {
                // Convertir les états au format attendu par RocketAI
                // CORRECTION (bug #2) : cible B résolue sur l'env d'entraînement.
                const aiState = this.buildAIState(state, this.trainingEnv);
                const nextAIState = this.buildAIState(result.observation, this.trainingEnv);
                
                // CORRECTION (item 8) : `done` sert à piloter la boucle, mais l'apprentissage doit
                // distinguer un état ABSORBANT (crash, panne sèche, objectif atteint) d'une simple
                // TRONCATURE par le budget de pas. `truncated` est propagé jusqu'à RocketAI.train(),
                // qui continue de bootstrapper (γ·maxQ') sur une troncature au lieu d'enseigner
                // Q = récompense du dernier pas.
                this.rocketAI.replayBuffer.push({
                    state: aiState,
                    action: this.getActionIndex(action),
                    reward: result.reward,
                    nextState: nextAIState,
                    done: result.done,
                    truncated: !!(result.truncated || (result.info && result.info.truncated))
                });

                // Borne le replay buffer pour éviter une croissance mémoire illimitée
                // (l'orchestrateur pousse directement ici, sans passer par RocketAI.remember()).
                const _maxBuf = this.rocketAI.config.replayBufferSize || 50000;
                if (this.rocketAI.replayBuffer.length > _maxBuf + 1000) {
                    this.rocketAI.replayBuffer.splice(0, this.rocketAI.replayBuffer.length - _maxBuf);
                }
            }
            
            // Entraîner le modèle si suffisamment d'expériences (et si pas dispose)
            if (this.rocketAI && !this.rocketAI.isDisposed &&
                this.rocketAI.replayBuffer.length >= this.config.batchSize &&
                steps % this.rocketAI.config.updateFrequency === 0) {
                // Trace de diagnostic (silencieuse par défaut, activable via window.DEBUG_AI = true).
                const _nowT = Date.now();
                if (typeof window !== 'undefined' && window.DEBUG_AI &&
                    (!this._lastTrainCallDiag || _nowT - this._lastTrainCallDiag > 2000)) {
                    this._lastTrainCallDiag = _nowT;
                    try { console.warn(`[Orchestrator] -> appel train() successfulTrainings=${this.rocketAI.concurrencyMetrics ? this.rocketAI.concurrencyMetrics.successfulTrainings : '?'}`); } catch (e) {}
                }
                try {
                    await this.rocketAI.train();
                } catch (trainError) {
                    const _m = (trainError && trainError.message) ? trainError.message : String(trainError);
                    if (!this._lastTrainErrDiag || _nowT - this._lastTrainErrDiag > 2000) {
                        this._lastTrainErrDiag = _nowT;
                        try { console.error('[Orchestrator] train() a levé une exception:', _m); } catch (e) {}
                    }
                }
            }
            
            state = result.observation;
            totalReward += result.reward;
            done = result.done;
            steps++;

            // Trace de diagnostic (silencieuse par défaut, activable via window.DEBUG_AI = true).
            if (typeof window !== 'undefined' && window.DEBUG_AI) {
                const _nowDiag = Date.now();
                if (!this._lastEpDiag || _nowDiag - this._lastEpDiag > 2000) {
                    this._lastEpDiag = _nowDiag;
                    try {
                        console.warn(`[Orchestrator] ep=${this.metrics.episode} steps=${steps} buffer=${this.rocketAI.replayBuffer.length}/${this.config.batchSize} aiTraining=${this.rocketAI.isTraining}`);
                    } catch (e) {}
                }
            }

            // IMPORTANT: Céder le contrôle au navigateur périodiquement pour garder l'UI réactive.
            // Headless : on cède rarement (rapide). Visuel : la cadence dépend du curseur de vitesse
            // (×1 = fluide ; ×N = on saute N fois plus de steps entre deux rendus -> avance rapide).
            const _speed = Math.max(1, this.config.visualSpeed || 1);
            const _yieldEvery = this.config.headlessMode ? 500 : Math.min(500, 50 * _speed);
            if (steps % _yieldEvery === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            // CORRECTION (double flux TRAINING_STEP) : l'orchestrateur émettait ici un SECOND flux
            // de steps, en plus de celui de HeadlessRocketEnvironment.emitVisualizationData()
            // (tous les 2 pas). Le visualiseur — seul abonné — recevait donc chaque trajectoire en
            // double : trafic d'événements doublé et trajectorySampleRate divisé deux fois plus
            // vite que prévu. On conserve UN SEUL flux, celui de l'environnement, dont le payload
            // est le plus riche (il porte targetPoint/startPoint, nécessaires au cadrage caméra).
            // Aucune métrique n'est perdue : le payload supprimé ne contenait que des champs déjà
            // présents dans celui de l'environnement (step, rocket, celestialBodies).
        }
        
        // CORRECTION : Appliquer la décroissance d'epsilon après chaque épisode (avec protection).
        // Passe par RocketAI.decayEpsilon() : logique unique, bornée par epsilonMin, partagée avec
        // le chemin en jeu (qui décrémente sur crash/succès quand aucun orchestrateur ne pilote).
        if (this.rocketAI && !this.rocketAI.isDisposed) {
            this.rocketAI.decayEpsilon();
        }
        
        const episodeDuration = Date.now() - startTime;
        
        // CORRECTION: Récupérer la loss pour l'événement
        let currentLoss = 0;
        if (this.rocketAI && !this.rocketAI.isDisposed) {
            try {
                const concurrencyMetrics = this.rocketAI.getConcurrencyMetrics();
                currentLoss = concurrencyMetrics.lastLoss || 0;
            } catch (error) {
                // Ignorer les erreurs si l'agent est disposé entre-temps
                currentLoss = 0;
            }
        }
        
        // Émettre l'événement de fin d'épisode pour la visualisation
        this.eventBus.emit(window.EVENTS.AI.EPISODE_ENDED, {
            episode: this.metrics.episode,
            totalReward,
            steps,
            duration: episodeDuration,
            success: this.isEpisodeSuccessful(totalReward, steps),
            loss: currentLoss
        });
        
        return {
            totalReward,
            steps,
            duration: episodeDuration,
            success: this.isEpisodeSuccessful(totalReward, steps)
        };
    }
    
    /**
     * Convertit l'observation en action via l'agent IA
     */
    getActionFromState(state, env = this.trainingEnv) {
        // Construire l'état pour l'agent IA (format attendu par RocketAI)
        // CORRECTION (bug #2) : propager l'environnement courant pour résoudre la cible B.
        const aiState = this.buildAIState(state, env);
        
        // Vérifier que l'agent est disponible et non dispose
        if (!this.rocketAI || this.rocketAI.isDisposed) {
            // Action par défaut (noAction) si l'agent n'est pas disponible
            return this.convertActionIndexToEnvironmentAction(4);
        }
        
        // Obtenir l'index d'action de l'agent
        const actionIndex = this.rocketAI.act(aiState);
        
        // Convertir l'index d'action en commandes pour l'environnement
        return this.convertActionIndexToEnvironmentAction(actionIndex);
    }
    
    /**
     * Écrit un angle initial (radians) dans la config d'un environnement, pour l'objectif
     * 'navigate' uniquement (les autres objectifs démarrent posés à un angle fixe). L'angle
     * sera appliqué à la fusée au prochain reset() de l'environnement.
     * @param {HeadlessRocketEnvironment} env
     * @param {function(): number} rng - générateur [0,1)
     */
    _applyInitialAngle(env, rng) {
        if (!env || this.trainingState.currentObjective !== 'navigate') return;
        if (!env.config || !env.config.rocketInitialState) return;
        env.config.rocketInitialState.angle = (rng ? rng() : Math.random()) * Math.PI * 2;
    }

    /**
     * Applique l'angle d'éval fixe n°i (jeu déterministe this._evalAngles), navigate uniquement.
     * @param {HeadlessRocketEnvironment} env
     * @param {number} i - index de l'épisode d'évaluation
     */
    _applyFixedEvalAngle(env, i) {
        if (!env || this.trainingState.currentObjective !== 'navigate') return;
        if (!env.config || !env.config.rocketInitialState) return;
        if (!this._evalAngles || this._evalAngles.length === 0) return;
        env.config.rocketInitialState.angle = this._evalAngles[i % this._evalAngles.length];
    }

    /**
     * Construit l'état au format attendu par RocketAI
     * CORRECTION (bug #4) : délègue à la source de vérité unique RocketAI.buildStateVector
     * pour garantir une normalisation et une dimension (12, STATE_VERSION 2) IDENTIQUES entre
     * entraînement, évaluation et inférence. L'état est CONSCIENT DE LA CIBLE B (pour 'navigate'), sinon
     * la cible vaut (0,0) (corps de référence à l'origine pour les autres objectifs headless).
     * CORRECTION (bug #2) : la cible B est lue sur l'ENVIRONNEMENT COURANT passé en argument
     * (trainingEnv en apprentissage, evaluationEnv en évaluation), et non plus toujours sur
     * this.trainingEnv. this.config ne contient jamais missionConfig, c'est l'env qui le porte.
     * @param {object} environmentState - L'observation brute renvoyée par l'environnement
     * @param {HeadlessRocketEnvironment} [env] - L'environnement courant (défaut: trainingEnv)
     */
    buildAIState(environmentState, env = this.trainingEnv) {
        const STATE_SIZE = (typeof RocketAI !== 'undefined' && RocketAI.STATE_SIZE) ? RocketAI.STATE_SIZE : 12;

        // Vérifier que environmentState existe
        if (!environmentState || typeof environmentState !== 'object') {
            return Array(STATE_SIZE).fill(0);
        }

        // Cible : PRIORITÉ à l'observation (position + vitesse VIVANTES, exposées par getObservation,
        // qui suivent une cible mobile pour le rôle 'intercept'). Repli sur la config (cible fixe),
        // puis origine (0,0) pour les objectifs sans cible. targetVX/VY sont en u/s (dims 10-11).
        const hasObsTarget = (typeof environmentState.targetX === 'number');
        const targetPoint = hasObsTarget
            ? { x: environmentState.targetX, y: environmentState.targetY }
            : ((env && env.config?.missionConfig?.targetPoint) || { x: 0, y: 0 });

        return RocketAI.buildStateVector({
            positionScale: this.getPositionScale(env),
            x: environmentState.rocketX || 0,
            y: environmentState.rocketY || 0,
            vx: environmentState.rocketVX || 0,
            vy: environmentState.rocketVY || 0,
            angle: environmentState.rocketAngle || 0,
            angularVelocity: environmentState.rocketAngularVelocity || 0,
            targetX: targetPoint.x,
            targetY: targetPoint.y,
            targetVx: hasObsTarget ? (environmentState.targetVX || 0) : 0,
            targetVy: hasObsTarget ? (environmentState.targetVY || 0) : 0
        });
    }

    /**
     * CORRECTION (item 9) : échelle de normalisation des features positionnelles, adaptée à
     * l'OBJECTIF de l'environnement courant.
     * - 'navigate' : distance initiale A→B (~127k unités) -> features 0/1/7/8 dans [0, ~1].
     * - autres objectifs (orbit/land/crash_moon/explore) : la fusée évolue entre le rayon du corps
     *   de référence et l'altitude orbitale max (820 à 2220 unités). Avec l'échelle fixe de 150000
     *   ces features restaient dans [0,005 ; 0,015] alors que les features 4/5/9 sont d'ordre 1.
     * @param {HeadlessRocketEnvironment} [env] - L'environnement courant.
     * @return {number} Échelle positionnelle strictement positive.
     */
    getPositionScale(env = this.trainingEnv) {
        const objective = env && env.config?.missionConfig?.objective;

        if (objective === 'navigate') {
            const target = env.config?.missionConfig?.targetPoint;
            const start = env.config?.rocketInitialState?.position;
            if (target && start) {
                const d = Math.hypot(target.x - start.x, target.y - start.y);
                if (isFinite(d) && d > 0) return d;
            }
            return RocketAI.DEFAULT_POSITION_SCALE;
        }

        // Corps de référence : celui qui porte la cible (origine en headless), sinon le premier.
        const bodies = (env && env.universeModel && env.universeModel.celestialBodies) || [];
        const reference = bodies.find(b => b && b.name === 'Terre') || bodies[0];
        return RocketAI.positionScaleForBody(reference ? reference.radius : 0);
    }

    /**
     * Convertit l'index d'action en commandes pour l'environnement
     */
    // CORRECTION (divergence entraînement/jeu + propulseurs collés) : l'action envoyée à
    // l'environnement est désormais dérivée de la TABLE D'ACTIONS CANONIQUE
    // (RocketAI.ACTION_THRUSTERS), la MÊME que celle appliquée en jeu par RocketAI.emitControl().
    // Chaque action spécifie les QUATRE propulseurs (HeadlessRocketEnvironment.step() ne touche
    // que les propulseurs présents dans l'objet : un 'thrustBackward' laissait sinon l'arrière à
    // MAX pour tout le reste de l'épisode, et 'noAction' ne le coupait pas).
    // On n'émet plus `rotationInput` : left/right sont pilotés explicitement, ce qui est
    // strictement équivalent (RocketController.handleRotateCommand mappe +1 -> gauche, -1 -> droite).
    convertActionIndexToEnvironmentAction(actionIndex) {
        const names = (typeof RocketAI !== 'undefined' && RocketAI.ACTION_NAMES)
            ? RocketAI.ACTION_NAMES
            : ['thrustForward', 'thrustBackward', 'rotateLeft', 'rotateRight', 'noAction'];
        const name = names[actionIndex] || 'noAction';
        const table = (typeof RocketAI !== 'undefined' && RocketAI.ACTION_THRUSTERS) ? RocketAI.ACTION_THRUSTERS : null;
        const t = (table && table[name]) || { main: 0, rear: 0, left: 0, right: 0 };

        return {
            mainThruster: t.main,
            rearThruster: t.rear,
            leftThruster: t.left,
            rightThruster: t.right
        };
    }

    /**
     * Obtient l'index d'action à partir de l'action
     */
    getActionIndex(action) {
        if (!action) return 4;
        if (action.mainThruster > 0.5) return 0;
        if (action.rearThruster > 0.5) return 1;
        if (action.leftThruster > 0.5) return 2;   // index 2 = rotateLeft (propulseur gauche)
        if (action.rightThruster > 0.5) return 3;  // index 3 = rotateRight (propulseur droit)
        // Rétro-compatibilité : anciennes actions exprimées via rotationInput
        if (action.rotationInput > 0.5) return 2;
        if (action.rotationInput < -0.5) return 3;
        return 4;
    }
    
    /**
     * Évalue les performances de l'agent
     */
    async evaluateAgent(runId = this._runGeneration) {
        // Protection: vérifier que l'agent est disponible et non disposé
        if (!this.rocketAI || this.rocketAI.isDisposed || !this.rocketAI.model) {
            return;
        }
        
        const numEvaluationEpisodes = 10;
        let totalScore = 0;
        let successCount = 0;
        // Nombre d'épisodes d'éval RÉELLEMENT terminés : sert à détecter une évaluation
        // interrompue (stop/pause) plus bas. Sans cette déclaration, l'incrément lève une
        // ReferenceError avalée par les catch silencieux : l'évaluation n'aboutit jamais
        // (bestAverageReward reste -Infinity, aucun meilleur modèle n'est mémorisé).
        let evaluatedEpisodes = 0;
        const stepsToSuccess = []; // steps des épisodes d'éval réussis (pour la médiane)
        
        // Sauvegarder l'état d'entraînement
        const wasTraining = this.rocketAI.isTraining;
        this.rocketAI.isTraining = false; // Désactiver l'exploration
        
        try {
            for (let i = 0; i < numEvaluationEpisodes; i++) {
                // Vérifier à chaque itération que l'agent est toujours disponible
                if (!this.rocketAI || this.rocketAI.isDisposed) {
                    break;
                }

                // Un nouveau run a démarré entre-temps : cette évaluation appartient au run
                // précédent, ses scores ne doivent pas polluer les métriques du run courant.
                if (this._runGeneration !== runId) {
                    break;
                }

                // Jeu d'angles FIXE pour l'éval (navigate) : mêmes conditions initiales à chaque
                // évaluation et entre modèles → scores comparables (cf. compareModels).
                this._applyFixedEvalAngle(this.evaluationEnv, i);

                let state = this.evaluationEnv.reset();
                let episodeReward = 0;
                let done = false;
                let steps = 0;
                
                // Sortie immédiate si l'entraînement est arrêté ou mis en pause (cf. ci-dessus).
                while (!done && steps < this.getMaxStepsPerEpisode() && this.isTraining && !this.isPaused
                       && this._runGeneration === runId) {
                    // CORRECTION (bug #2) : cible B résolue sur l'env d'évaluation.
                    const action = this.getActionFromState(state, this.evaluationEnv);
                    const result = this.evaluationEnv.step(action);
                    
                    state = result.observation;
                    episodeReward += result.reward;
                    done = result.done;
                    steps++;
                    
                    // Céder le contrôle au navigateur périodiquement
                    if (steps % 100 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
                
                totalScore += episodeReward;
                evaluatedEpisodes++;
                // CORRECTION (bug eval): évaluer le succès sur l'environnement d'évaluation
                if (this.isEpisodeSuccessful(episodeReward, steps, this.evaluationEnv)) {
                    successCount++;
                    stepsToSuccess.push(steps);
                }
                
                // Céder le contrôle au navigateur entre les épisodes d'évaluation
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            // Restaurer l'état d'entraînement (si l'agent existe encore)
            if (this.rocketAI && !this.rocketAI.isDisposed) {
                this.rocketAI.isTraining = wasTraining;
            }

            // Évaluation interrompue (stop/pause) : les scores partiels ne sont pas représentatifs,
            // on ne les enregistre pas (ils fausseraient bestAverageReward et l'early stopping).
            if (evaluatedEpisodes < numEvaluationEpisodes) {
                return;
            }

            const averageScore = totalScore / numEvaluationEpisodes;
            const successRate = successCount / numEvaluationEpisodes;

            // Médiane des steps jusqu'au succès (null si aucun succès à cette éval)
            let medianStepsToSuccess = null;
            if (stepsToSuccess.length > 0) {
                stepsToSuccess.sort((a, b) => a - b);
                const mid = Math.floor(stepsToSuccess.length / 2);
                medianStepsToSuccess = (stepsToSuccess.length % 2 === 0)
                    ? Math.round((stepsToSuccess[mid - 1] + stepsToSuccess[mid]) / 2)
                    : stepsToSuccess[mid];
            }
            this.metrics.medianStepsToSuccess = medianStepsToSuccess;

            this.metrics.lastEvaluationScore = averageScore;
            this.trainingState.recentPerformance.push(averageScore);
            
            // Conserver seulement les 10 dernières évaluations
            if (this.trainingState.recentPerformance.length > 10) {
                this.trainingState.recentPerformance.shift();
            }
            
            // Sauvegarder le meilleur modèle (avec protection)
            if (averageScore > this.metrics.bestAverageReward && 
                this.rocketAI && !this.rocketAI.isDisposed && this.rocketAI.model) {
                this.metrics.bestAverageReward = averageScore;
                
                // CORRECTION MEMORY LEAK: Dispose les anciens clones avant de stocker les nouveaux.
                // (Ce sont des clones indépendants — voir ci-dessous — donc les disposer ne touche
                //  jamais aux poids vivants du modèle.)
                if (this.trainingState.bestModelWeights) {
                    this.trainingState.bestModelWeights.forEach(w => {
                        if (w && typeof w.dispose === 'function') {
                            try { w.dispose(); } catch (e) { /* ignore */ }
                        }
                    });
                }

                try {
                    // getWeights() renvoie les tenseurs VIVANTS des variables du modèle (PAS des copies).
                    // On en stocke des CLONES indépendants : ainsi les dispose() ultérieurs libèrent les
                    // clones et JAMAIS les poids vivants du modèle (sinon model.fit()/predict() échouerait
                    // avec "LayersVariable ... is already disposed").
                    this.trainingState.bestModelWeights = this.rocketAI.model.getWeights().map(w => w.clone());
                } catch (weightsError) {
                    // Ignorer les erreurs si le modèle a été disposé entre-temps
                    if (!weightsError.message.includes('disposed')) {
                        throw weightsError;
                    }
                }
            }
            
            this.eventBus.emit(window.EVENTS.AI.EVALUATION_COMPLETED, {
                episode: this.metrics.episode,
                averageScore,
                successRate,
                medianStepsToSuccess,
                bestScore: this.metrics.bestAverageReward
            });
            
        } catch (error) {
            // Restaurer l'état d'entraînement même en cas d'erreur
            if (this.rocketAI && !this.rocketAI.isDisposed) {
                this.rocketAI.isTraining = wasTraining;
            }
        }
    }
    
    /**
     * Détermine si un épisode est réussi
     * @param {number} reward - Récompense cumulée de l'épisode
     * @param {number} steps - Nombre de pas effectués
     * @param {HeadlessRocketEnvironment} [env] - CORRECTION (bug eval): l'environnement réellement
     *   utilisé pour l'épisode (trainingEnv en apprentissage, evaluationEnv en évaluation).
     *   Le succès doit être évalué sur CET environnement, sinon le taux de succès d'évaluation
     *   est calculé sur l'état du mauvais environnement.
     */
    isEpisodeSuccessful(reward, steps, env = this.trainingEnv) {
        // Pour l'objectif 'navigate', déléguer à l'environnement pour garantir
        // une définition unique du succès (distance ET vitesse de stabilisation).
        if (this.trainingState.currentObjective === 'navigate') {
            if (env && typeof env.checkNavigateSuccess === 'function') {
                return env.checkNavigateSuccess();
            }
            return false;
        }

        // CORRECTION: Pour l'objectif 'crash_moon', vérifier si la fusée s'est crashée sur la Lune
        if (this.trainingState.currentObjective === 'crash_moon') {
            if (env) {
                const rocketModel = env.rocketModel;
                if (rocketModel && rocketModel.isDestroyed) {
                    // Vérifier si le crash a eu lieu sur la Lune
                    const moon = env.universeModel?.celestialBodies?.find(body => body.name === 'Lune');
                    if (moon) {
                        // Calculer la distance pour confirmer le crash sur la Lune
                        const dx = rocketModel.position.x - moon.position.x;
                        const dy = rocketModel.position.y - moon.position.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const altitude = distance - moon.radius;
                        
                        // Crash sur la Lune = succès pour cet objectif (très proche de la surface)
                        if (altitude < 100 && (rocketModel.landedOn === 'Lune' || rocketModel.attachedTo === 'Lune')) {
                            return true;
                        }
                    }
                }
            }
            // Pour 'crash_moon', si pas de crash sur la Lune, ce n'est pas un succès
            return false;
        }
        
        // Critères de succès par défaut : récompense positive significative et durée raisonnable
        // CORRECTION: Être plus strict sur la récompense (au moins 10 points)
        return reward >= 10 && steps < this.getMaxStepsPerEpisode() * 0.8;
    }
    
    /**
     * Met à jour les métriques d'entraînement
     */
    updateMetrics(episodeResult) {
        this.metrics.totalSteps += episodeResult.steps;
        this.metrics.totalReward += episodeResult.totalReward;
        // CORRECTION (comptage): metrics.episode est l'index 0-based de la boucle ; il vaut donc
        // toujours "nombre d'épisodes terminés - 1". On maintient un compteur explicite pour les
        // taux de succès et les statistiques finales.
        this.metrics.episodesCompleted = (this.metrics.episodesCompleted || 0) + 1;

        if (episodeResult.success) {
            this.metrics.successfulEpisodes++;
        }

        // Métriques moyennes (sur les 100 derniers épisodes)
        this.metrics.averageRewards.push(episodeResult.totalReward);
        this.metrics.episodeLengths.push(episodeResult.steps);

        // Vitesse réelle du pipeline : steps/s sur une fenêtre glissante de 20 épisodes
        // (durée = simulation + apprentissage, c'est bien le débit utile qu'on mesure).
        this.metrics.episodeDurations.push({ steps: episodeResult.steps, durationMs: episodeResult.duration });
        if (this.metrics.episodeDurations.length > 20) {
            this.metrics.episodeDurations.shift();
        }
        const totalSteps = this.metrics.episodeDurations.reduce((s, e) => s + e.steps, 0);
        const totalMs = this.metrics.episodeDurations.reduce((s, e) => s + e.durationMs, 0);
        this.metrics.stepsPerSecond = totalMs > 0 ? Math.round(totalSteps / (totalMs / 1000)) : 0;

        // Taux de succès récent : fenêtre glissante de 50 épisodes (le taux global
        // successfulEpisodes/episode masque la progression en fin d'entraînement).
        this.metrics.recentSuccesses.push(!!episodeResult.success);
        if (this.metrics.recentSuccesses.length > 50) {
            this.metrics.recentSuccesses.shift();
        }
        this.metrics.recentSuccessRate =
            this.metrics.recentSuccesses.filter(Boolean).length / this.metrics.recentSuccesses.length;

        // Protection : vérifier que l'agent existe et n'est pas disposé
        const currentEpsilon = (this.rocketAI && !this.rocketAI.isDisposed)
            ? this.rocketAI.config.epsilon
            : this.config.epsilonMin;
        this.metrics.explorationRates.push(currentEpsilon);

        // CORRECTION: Collecter la loss depuis RocketAI
        let currentLoss = 0;
        if (this.rocketAI && !this.rocketAI.isDisposed) {
            try {
                const concurrencyMetrics = this.rocketAI.getConcurrencyMetrics();
                currentLoss = concurrencyMetrics.lastLoss || 0;
            } catch (error) {
                // Ignorer les erreurs si l'agent est disposé entre-temps
                currentLoss = 0;
            }
        }
        this.metrics.losses.push(currentLoss);

        // Limiter la taille des tableaux de métriques
        const maxLength = 100;
        if (this.metrics.averageRewards.length > maxLength) {
            this.metrics.averageRewards.shift();
            this.metrics.episodeLengths.shift();
            this.metrics.explorationRates.shift();
            this.metrics.losses.shift();
        }
    }
    
    /**
     * Log des progrès d'entraînement (silencieux sauf en DEBUG)
     */
    logProgress() {
        // Logs désactivés pour réduire le bruit
    }
    
    /**
     * Vérifie la convergence de l'entraînement
     */
    checkConvergence() {
        // CORRECTION: Ne pas activer la convergence trop tôt
        // Utiliser > au lieu de >= pour permettre au moins 100 épisodes complets
        if (this.metrics.episode <= this.config.evaluationInterval) return false;
        if (this.metrics.episode <= 100) return false; // Minimum 100 épisodes avant convergence
        
        // CORRECTION (comptage): diviser par le nombre d'épisodes RÉELLEMENT terminés
        // (metrics.episode est l'index 0-based de la boucle -> une unité de moins, ce qui
        // surestimait légèrement le taux de succès).
        const episodesCompleted = this.metrics.episodesCompleted || 0;
        // Protection contre division par zéro
        if (episodesCompleted === 0) return false;

        const successRate = this.metrics.successfulEpisodes / episodesCompleted;
        return successRate >= this.config.targetSuccessRate;
    }
    
    /**
     * Vérifie l'early stopping
     */
    checkEarlyStopping() {
        // CORRECTION: Ne pas activer l'early stopping trop tôt
        if (this.trainingState.recentPerformance.length < 5) return false;
        if (this.metrics.episode < 200) return false; // Minimum 200 épisodes avant early stopping
        
        // Vérifier si les performances n'augmentent plus.
        // CORRECTION (test non cohérent en signe) : `best * 0.95` est SUPÉRIEUR à `best` quand
        // `best` est négatif (cas normal en début d'entraînement) -> la condition était vraie par
        // construction et l'early stopping se déclenchait mécaniquement vers l'épisode ~300,
        // quels que soient les progrès. On utilise une marge d'amélioration en valeur absolue,
        // valable pour les deux signes : stagnation si aucun score récent ne dépasse
        // best - |best| * 5 %.
        const best = this.metrics.bestAverageReward;
        if (!isFinite(best)) return false;
        const stagnationThreshold = best - Math.abs(best) * 0.05;
        const recent = this.trainingState.recentPerformance.slice(-5);
        const isStagnant = recent.every(score => score <= stagnationThreshold);

        if (isStagnant) {
            this.trainingState.earlyStoppingCounter++;
        } else {
            this.trainingState.earlyStoppingCounter = 0;
        }
        
        // CORRECTION: Calculer le seuil correctement
        const patienceThreshold = Math.ceil(this.config.patience / this.config.evaluationInterval);
        return this.trainingState.earlyStoppingCounter >= patienceThreshold;
    }
    
    /**
     * Sauvegarde un checkpoint
     */
    async saveCheckpoint() {
        // Vérifier que l'agent existe et n'est pas disposé avant de sauvegarder
        if (!this.rocketAI || this.rocketAI.isDisposed) {
            return;
        }

        try {
            // Sauvegarde dans le model zoo avec métadonnées d'entraînement à jour
            const saved = await this.rocketAI.saveModel(this.config.modelName, {
                objective: this.trainingState.currentObjective,
                episodes: this.metrics.episode,
                bestEvalScore: isFinite(this.metrics.bestAverageReward) ? this.metrics.bestAverageReward : null,
                successRate: this.metrics.recentSuccessRate
            });
            if (saved) {
                this.metrics.lastCheckpointTime = Date.now();
            } else {
                this._signalerEchecSauvegarde(this.config.modelName, 'saveModel a renvoyé false');
            }
        } catch (error) {
            // NE PAS ignorer : quota IndexedDB dépassé, navigation privée, stockage refusé… Un run
            // entier pouvait se terminer sans avoir rien persisté pendant que l'interface affichait
            // une session parfaitement saine.
            this._signalerEchecSauvegarde(this.config.modelName, (error && error.message) || String(error));
        }
    }

    /**
     * Remonte un échec de sauvegarde à l'utilisateur (console + EventBus). Les points de
     * sauvegarde échouaient en silence : ni journal, ni événement, aucun moyen de s'en apercevoir
     * avant de constater un zoo vide en fin d'entraînement.
     * @param {string} nomModele
     * @param {string} raison
     * @private
     */
    _signalerEchecSauvegarde(nomModele, raison) {
        console.warn(`[TrainingOrchestrator] Échec du point de sauvegarde "${nomModele}" : ${raison}`);
        try {
            if (window.EVENTS && window.EVENTS.AI && window.EVENTS.AI.MODEL_SAVE_FAILED) {
                this.eventBus.emit(window.EVENTS.AI.MODEL_SAVE_FAILED, { name: nomModele, reason: raison });
            }
        } catch (e) { /* l'échec de la notification ne doit pas interrompre l'entraînement */ }
    }
    
    /**
     * Finalise l'entraînement
     * @param {boolean} [userStopped=false] - true si la finalisation fait suite à un arrêt demandé
     *   par l'utilisateur (stopTraining). Dans ce cas on restaure/sauvegarde exactement comme pour
     *   une fin normale, mais on n'émet pas TRAINING_COMPLETED (TRAINING_STOPPED l'a déjà été) et
     *   on libère les ressources lourdes (environnements + agent) puisque la session est close.
     * @param {number} [runId] - Génération du run à finaliser (capturée par startTraining). Toute
     *   libération est annulée si une session plus récente a démarré entre-temps.
     */
    async finalizeTraining(userStopped = false, runId = this._runGeneration) {
        // CORRECTION (Stop puis Start en < 300 ms) : cette finalisation est ASYNCHRONE
        // (setWeights + saveCheckpoint). Pendant ces await, l'utilisateur pouvait relancer un
        // entraînement (stopTraining() a déjà réactivé le bouton Démarrer) : la queue de cette
        // fonction remettait alors isTraining à false et surtout mettait à null rocketAI /
        // trainingEnv / evaluationEnv du run TOUT NEUF -> TypeError sur trainingEnv.reset() et
        // "Erreur d'entraînement". On capture la génération courante et on n'agit sur les champs
        // partagés que tant qu'elle n'a pas changé. `runId` est celui capturé au DÉMARRAGE du run
        // (startTraining) et propagé par trainingLoop : le capturer ici aurait été trop tard, la
        // relance ayant pu se produire avant même l'entrée dans cette fonction.
        const isCurrentRun = () => this._runGeneration === runId;

        if (!isCurrentRun()) return;
        this.isTraining = false;

        // Restaurer le meilleur modèle (avec protection)
        if (this.trainingState.bestModelWeights &&
            this.rocketAI && !this.rocketAI.isDisposed && this.rocketAI.model) {
            try {
                await this.rocketAI.model.setWeights(this.trainingState.bestModelWeights);
            } catch (error) {
                // Ignorer silencieusement
            }
        }

        if (!isCurrentRun()) return;

        // CORRECTION MEMORY LEAK: Libérer les tensors de bestModelWeights
        if (this.trainingState.bestModelWeights) {
            this.trainingState.bestModelWeights.forEach(w => {
                if (w && typeof w.dispose === 'function') {
                    try { w.dispose(); } catch (e) { /* ignore */ }
                }
            });
            this.trainingState.bestModelWeights = null;
        }

        // Sauvegarde finale (avec protection)
        if (this.rocketAI && !this.rocketAI.isDisposed) {
            await this.saveCheckpoint();
        }

        // Un nouveau run a pu démarrer pendant la sauvegarde : ne rien libérer ni annoncer.
        if (!isCurrentRun()) return;

        // Calcul des statistiques finales
        const trainingDuration = Date.now() - this.metrics.trainingStartTime;
        // CORRECTION (comptage): metrics.episode est l'INDEX de boucle (0-based) ; on utilise
        // episodesCompleted, incrémenté une fois par épisode réellement terminé.
        const episodesCompleted = this.metrics.episodesCompleted || 0;
        // CORRECTION: Protection contre division par zéro
        const finalSuccessRate = (episodesCompleted > 0)
            ? this.metrics.successfulEpisodes / episodesCompleted
            : 0;

        // ⚠️ Ce n'est PAS la moyenne sur tout l'entraînement : episodeLengths est borné aux 100
        // derniers épisodes (cf. updateMetrics), donc c'est une moyenne glissante de fin de run.
        const lengths = this.metrics.episodeLengths;
        const averageEpisodeLengthLast100 = (lengths && lengths.length > 0)
            ? lengths.reduce((a, b) => a + b, 0) / lengths.length
            : 0;

        const finalStats = {
            episodes: episodesCompleted,
            totalSteps: this.metrics.totalSteps,
            trainingDuration,
            finalSuccessRate,
            bestAverageReward: this.metrics.bestAverageReward,
            // Nom historique conservé (lu par train.js) mais c'est bien la moyenne des 100 derniers
            // épisodes ; utiliser de préférence averageEpisodeLengthLast100, explicite.
            averageEpisodeLength: averageEpisodeLengthLast100,
            averageEpisodeLengthLast100
        };

        if (userStopped) {
            // Arrêt utilisateur : la session est terminée. Le meilleur modèle vient d'être
            // restauré puis sauvegardé en localStorage juste au-dessus.
            // Les modèles TensorFlow de l'agent SONT réellement libérés (cleanup dispose les
            // tenseurs et désabonne l'agent).
            if (this.rocketAI && typeof this.rocketAI.cleanup === 'function') {
                try { this.rocketAI.cleanup(); } catch (e) { /* ignore */ }
            }
            this.rocketAI = null;

            // ⚠️ Les environnements, eux, ne sont ici que DÉRÉFÉRENCÉS, pas libérés :
            // HeadlessRocketEnvironment n'expose aucun cleanup(), et ses sous-contrôleurs
            // (RocketController, MissionManager) restent abonnés au bus PARTAGÉ tandis que
            // SynchronizationManager garde ses écouteurs beforeUpdate/afterUpdate sur son moteur
            // Matter. Ces fermetures maintiennent les deux environnements en vie : après N
            // cycles arrêt/relance, chaque SET_THRUSTER_POWER est distribué aux contrôleurs des
            // environnements morts en plus des vivants. Fuite ANTÉRIEURE à ce correctif, non
            // résolue ici (elle demande un vrai cleanup() côté environnement) — cf. TODO.md.
            this.trainingEnv = null;
            this.evaluationEnv = null;
            return;
        }

        this.eventBus.emit(window.EVENTS.AI.TRAINING_COMPLETED, finalStats);
    }
    
    /**
     * Attend la reprise de l'entraînement
     */
    async waitForResume() {
        return new Promise((resolve) => {
            const checkResume = () => {
                if (!this.isPaused) {
                    resolve();
                } else {
                    setTimeout(checkResume, 100);
                }
            };
            checkResume();
        });
    }
    
    /**
     * Arrête l'entraînement
     */
    stopTraining() {
        // _stopRequested indique à trainingLoop() qu'il doit finaliser malgré la sortie anticipée
        // (restauration des meilleurs poids + checkpoint final + libération des ressources).
        // La finalisation est faite par la boucle elle-même : elle est encore en train de tourner
        // au moment où ce gestionnaire d'événement s'exécute.
        if (this.isTraining) {
            this._stopRequested = true;
        }
        this.isTraining = false;
        this.isPaused = false;
        this._curriculumAborted = true; // interrompt aussi une file de runs (curriculum) en cours
        this.eventBus.emit(window.EVENTS.AI.TRAINING_STOPPED, this.metrics);
    }

    /**
     * Nettoie proprement les abonnements et références pour éviter les fuites
     */
    cleanup() {
        try {
            if (this.isTraining) {
                this.stopTraining();
            }
        } catch (e) {}

        // Désabonner les listeners enregistrés localement si ControllerContainer indisponible
        if (this._unsubs && this._unsubs.length > 0) {
            for (const unsub of this._unsubs) {
                try { typeof unsub === 'function' && unsub(); } catch (e) {}
            }
            this._unsubs = [];
        }

        // Dispose les tensors de poids stockés
        if (this.trainingState && this.trainingState.bestModelWeights) {
            try {
                this.trainingState.bestModelWeights.forEach(w => {
                    if (w && typeof w.dispose === 'function') {
                        w.dispose();
                    }
                });
                this.trainingState.bestModelWeights = null;
            } catch (e) { /* ignore */ }
        }

        // Nettoyer l'agent IA si disponible
        if (this.rocketAI && typeof this.rocketAI.cleanup === 'function') {
            try {
                this.rocketAI.cleanup();
            } catch (e) { /* ignore */ }
        }

        // Libérer les références lourdes
        this.trainingEnv = null;
        this.evaluationEnv = null;
        this.rocketAI = null;
    }
    
    /**
     * Met en pause l'entraînement
     */
    pauseTraining() {
        this.isPaused = true;
        this.eventBus.emit(window.EVENTS.AI.TRAINING_PAUSED, this.metrics);
    }
    
    /**
     * Reprend l'entraînement
     */
    resumeTraining() {
        this.isPaused = false;
        this.eventBus.emit(window.EVENTS.AI.TRAINING_RESUMED, this.metrics);
    }
    
    /**
     * Met à jour la configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    /**
     * Obtient les métriques actuelles
     */
    getMetrics() {
        return { ...this.metrics };
    }
    
    /**
     * Obtient la configuration actuelle
     */
    getConfig() {
        return { ...this.config };
    }
} 