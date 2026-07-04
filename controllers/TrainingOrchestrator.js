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
            episode: 0,
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
            
            // Démarrer la boucle d'entraînement
            await this.trainingLoop();
            
        } catch (error) {
            // Ignorer silencieusement les erreurs "disposed" car c'est un comportement attendu lors du cleanup
            const isDisposedError = error.message && error.message.includes('disposed');
            
            // Erreurs ignorées silencieusement (dont "disposed")
            
            // Nettoyer les ressources en cas d'erreur
            await this.cleanupAfterError();
            
            // N'émettre l'événement d'erreur que pour les vraies erreurs
            if (!isDisposedError) {
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

        for (let i = 0; i < runs.length; i++) {
            const stage = runs[i] || {};
            this.eventBus.emit(window.EVENTS.AI.CURRICULUM_STAGE_STARTED, {
                index: i, total: runs.length, stage
            });

            const stageConfig = {
                ...base,
                role: stage.role || base.role || null,
                objectives: stage.objective ? [stage.objective] : base.objectives,
                maxEpisodes: stage.episodes || base.maxEpisodes,
                loadFrom: stage.loadFrom || null,
                modelName: stage.saveAs || null, // null → défaut dérivé du rôle/objectif
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
    async cleanupAfterError() {
        this.isTraining = false;
        this.isPaused = false;
        
        // Nettoyer l'agent IA avec un délai suffisant pour que les opérations async s'arrêtent
        if (this.rocketAI) {
            try {
                // Appeler cleanup d'abord pour marquer comme disposé
                if (typeof this.rocketAI.cleanup === 'function') {
                    this.rocketAI.cleanup();
                }
                
                // Attendre que les opérations en cours se terminent et que cleanup() dispose les modèles
                await new Promise(resolve => setTimeout(resolve, 350));
                
            } catch (e) { /* ignore */ }
            this.rocketAI = null;
        }
        
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

            // Angle initial aléatoire pour forcer l'IA à s'orienter
            const rocketInitialAngle = Math.random() * Math.PI * 2;

            // Budget de steps réduit ~5× (vol plus court A→B). Distance ~127k unités, croisière
            // cible ~2500 u/s → ~51s → ~3000 steps de croisière + freinage ⇒ 4000 steps (66s @ 1/60s).
            const navigateMaxSteps = Math.max(this.config.maxStepsPerEpisode, 4000);

            // IMPORTANT: Mettre à jour this.config pour que la boucle d'entraînement (runEpisode)
            // utilise aussi cette limite, pas seulement l'environnement
            this.config.maxStepsPerEpisode = navigateMaxSteps;

            trainingConfig = {
                maxStepsPerEpisode: navigateMaxSteps,
                infiniteFuel: true,
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
            const rocketInitialAngle = -Math.PI / 2; // Pointant vers le haut pour décoller
            
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
    async trainingLoop() {
        // CORRECTION: S'assurer que maxEpisodes est bien défini et > 0
        const maxEpisodes = Math.max(1, this.config.maxEpisodes || 1000);
        
        for (let episode = 0; episode < maxEpisodes && this.isTraining; episode++) {
            // Vérifier que l'entraînement n'a pas été arrêté
            if (!this.isTraining) {
                break;
            }
            
            if (this.isPaused) {
                await this.waitForResume();
            }
            
            this.metrics.episode = episode;
            
            // Exécuter un épisode d'entraînement
            const episodeResult = await this.runTrainingEpisode();
            
            // Vérifier à nouveau après l'épisode (au cas où runTrainingEpisode aurait modifié isTraining)
            if (!this.isTraining) {
                break;
            }
            
            // Mettre à jour les métriques
            this.updateMetrics(episodeResult);
            
            // Log périodique
            if (episode % this.config.logInterval === 0) {
                this.logProgress();
            }
            
            // Évaluation périodique (avec protection contre les erreurs)
            if (episode % this.config.evaluationInterval === 0 && episode > 0) {
                try {
                    await this.evaluateAgent();
                } catch (error) {
                    // Ignorer les erreurs d'évaluation pour ne pas arrêter l'entraînement
                }
            }
            
            // Sauvegarde périodique (avec protection contre les erreurs)
            if (episode % this.config.checkpointInterval === 0 && episode > 0) {
                try {
                    await this.saveCheckpoint();
                } catch (error) {
                    // Ignorer les erreurs de sauvegarde pour ne pas arrêter l'entraînement
                }
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
            
            // Émission d'événement de progression
            this.eventBus.emit(window.EVENTS.AI.TRAINING_PROGRESS, {
                episode: episode + 1, // CORRECTION: Afficher le numéro d'épisode commençant à 1 pour l'interface
                totalEpisodes: maxEpisodes,
                metrics: this.metrics,
                config: this.config
            });
            
            // IMPORTANT: Céder le contrôle au navigateur pour que l'UI reste réactive
            // Utiliser requestAnimationFrame pour synchroniser avec le rafraîchissement écran
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        // Finaliser l'entraînement seulement si on a atteint la fin normale
        if (this.isTraining) {
            await this.finalizeTraining();
        }
    }
    
    /**
     * Exécute un épisode d'entraînement
     */
    async runTrainingEpisode() {
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
        
        while (!done && steps < this.config.maxStepsPerEpisode && this.isTraining) {
            // Vérifier que l'agent est toujours disponible
            if (!this.rocketAI || this.rocketAI.isDisposed) {
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
                
                this.rocketAI.replayBuffer.push({
                    state: aiState,
                    action: this.getActionIndex(action),
                    reward: result.reward,
                    nextState: nextAIState,
                    done: result.done
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

            // Émettre l'événement de step pour la visualisation. Inutile en headless ; en visuel on
            // rend tous les (10 × vitesse) steps -> plus la vitesse est haute, moins on rend (= rapide).
            if (!this.config.headlessMode && steps % (10 * _speed) === 0 && this.trainingEnv.rocketModel) {
                const stepCelestialBodies = (this.trainingEnv.universeModel && this.trainingEnv.universeModel.celestialBodies) 
                    ? this.trainingEnv.universeModel.celestialBodies.map(body => ({
                        name: body.name,
                        position: body.position ? { x: body.position.x, y: body.position.y } : { x: 0, y: 0 },
                        radius: body.radius,
                        mass: body.mass,
                        color: body.color
                    })) 
                    : [];
                
                this.eventBus.emit(window.EVENTS.AI.TRAINING_STEP, {
                    step: steps,
                    episode: this.metrics.episode,
                    rocket: {
                        // CORRECTION: RocketModel expose position/velocity (objets) et isDestroyed,
                        // pas .x/.y/.vx/.vy/.isCrashed (qui valaient undefined -> NaN dans le tracé).
                        position: {
                            x: this.trainingEnv.rocketModel.position.x,
                            y: this.trainingEnv.rocketModel.position.y
                        },
                        velocity: {
                            x: this.trainingEnv.rocketModel.velocity.x,
                            y: this.trainingEnv.rocketModel.velocity.y
                        },
                        angle: this.trainingEnv.rocketModel.angle,
                        fuel: this.trainingEnv.rocketModel.fuel,
                        isLanded: this.trainingEnv.rocketModel.isLanded,
                        isDestroyed: this.trainingEnv.rocketModel.isDestroyed
                    },
                    celestialBodies: stepCelestialBodies
                });
            }
        }
        
        // CORRECTION : Appliquer la décroissance d'epsilon après chaque épisode (avec protection)
        if (this.rocketAI && !this.rocketAI.isDisposed && 
            this.rocketAI.config.epsilon > this.rocketAI.config.epsilonMin) {
            this.rocketAI.config.epsilon *= this.rocketAI.config.epsilonDecay;
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
     * Convertit l'index d'action en commandes pour l'environnement
     */
    convertActionIndexToEnvironmentAction(actionIndex) {
        const actions = [
            { mainThruster: 1.0, rotationInput: 0 },    // Poussée avant
            { mainThruster: 0, rearThruster: 1.0, rotationInput: 0 }, // Poussée arrière
            { mainThruster: 0, rotationInput: 1.0 },    // index 2 = Rotation gauche (rotateLeft -> propulseur gauche)
            { mainThruster: 0, rotationInput: -1.0 },   // index 3 = Rotation droite (rotateRight -> propulseur droit)
            { mainThruster: 0, rotationInput: 0 }       // Aucune action
        ];
        
        return actions[actionIndex] || actions[4]; // Action par défaut
    }
    
    /**
     * Obtient l'index d'action à partir de l'action
     */
    getActionIndex(action) {
        if (action.mainThruster > 0.5) return 0;
        if (action.rearThruster > 0.5) return 1;
        if (action.rotationInput > 0.5) return 2;  // index 2 = rotateLeft (rotationInput +1.0)
        if (action.rotationInput < -0.5) return 3; // index 3 = rotateRight (rotationInput -1.0)
        return 4;
    }
    
    /**
     * Évalue les performances de l'agent
     */
    async evaluateAgent() {
        // Protection: vérifier que l'agent est disponible et non disposé
        if (!this.rocketAI || this.rocketAI.isDisposed || !this.rocketAI.model) {
            return;
        }
        
        const numEvaluationEpisodes = 10;
        let totalScore = 0;
        let successCount = 0;
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
                
                // Jeu d'angles FIXE pour l'éval (navigate) : mêmes conditions initiales à chaque
                // évaluation et entre modèles → scores comparables (cf. compareModels).
                this._applyFixedEvalAngle(this.evaluationEnv, i);

                let state = this.evaluationEnv.reset();
                let episodeReward = 0;
                let done = false;
                let steps = 0;
                
                while (!done && steps < this.config.maxStepsPerEpisode) {
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
        return reward >= 10 && steps < this.config.maxStepsPerEpisode * 0.8;
    }
    
    /**
     * Met à jour les métriques d'entraînement
     */
    updateMetrics(episodeResult) {
        this.metrics.totalSteps += episodeResult.steps;
        this.metrics.totalReward += episodeResult.totalReward;

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
        
        // Protection contre division par zéro
        if (this.metrics.episode === 0) return false;
        
        const successRate = this.metrics.successfulEpisodes / this.metrics.episode;
        return successRate >= this.config.targetSuccessRate;
    }
    
    /**
     * Vérifie l'early stopping
     */
    checkEarlyStopping() {
        // CORRECTION: Ne pas activer l'early stopping trop tôt
        if (this.trainingState.recentPerformance.length < 5) return false;
        if (this.metrics.episode < 200) return false; // Minimum 200 épisodes avant early stopping
        
        // Vérifier si les performances n'augmentent plus
        const recent = this.trainingState.recentPerformance.slice(-5);
        const isStagnant = recent.every(score => score <= this.metrics.bestAverageReward * 0.95);
        
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
            }
        } catch (error) {
            // Ignorer silencieusement
        }
    }
    
    /**
     * Finalise l'entraînement
     */
    async finalizeTraining() {
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
        
        // Calcul des statistiques finales
        const trainingDuration = Date.now() - this.metrics.trainingStartTime;
        // CORRECTION: Protection contre division par zéro
        const finalSuccessRate = (this.metrics.episode > 0) 
            ? this.metrics.successfulEpisodes / this.metrics.episode 
            : 0;
        
        const finalStats = {
            episodes: this.metrics.episode,
            totalSteps: this.metrics.totalSteps,
            trainingDuration,
            finalSuccessRate,
            bestAverageReward: this.metrics.bestAverageReward,
            averageEpisodeLength: this.metrics.episodeLengths.reduce((a, b) => a + b, 0) / this.metrics.episodeLengths.length
        };
        
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