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
            
            // Objectifs d'entraînement
            objectives: ['orbit', 'land', 'explore']
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
            lastCheckpointTime: null
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
        
        try {
        // Fusionner la configuration utilisateur avec la configuration par défaut
        this.config = { ...this.config, ...userConfig };
        
        // CORRECTION: S'assurer que maxEpisodes est bien défini et valide
        if (!this.config.maxEpisodes || this.config.maxEpisodes < 1) {
            this.config.maxEpisodes = 1000; // Valeur par défaut
        }
        
        // Mettre à jour l'objectif actuel si fourni
        if (this.config.objectives && this.config.objectives.length > 0) {
            this.trainingState.currentObjective = this.config.objectives[0];
        }
        
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
            // CORRECTION: Portée doublée - distance augmentée
            const pointA = { x: 0, y: 0 };
            const pointB = { x: 100000, y: 100000 }; // CORRECTION: Portée doublée - ~141km (diagonale)
            
            // Angle initial pointant vers le point B
            const dx = pointB.x - pointA.x;
            const dy = pointB.y - pointA.y;
            const rocketInitialAngle = Math.atan2(dy, dx);
            
            // CORRECTION: Augmenter significativement le nombre de steps pour l'objectif 'navigate'
            // La simulation DOIT durer 3 fois plus longtemps pour que la fusée atteigne le point rouge
            const navigateMaxSteps = Math.max(this.config.maxStepsPerEpisode, 150000); // Augmenté à 150000 steps (3x plus long)
            
            trainingConfig = {
                maxStepsPerEpisode: navigateMaxSteps,
                infiniteFuel: true, // CORRECTION: Carburant infini pour l'objectif 'navigate'
                rocketInitialState: {
                    position: { ...pointA },
                    velocity: { x: 0, y: 0 },
                    angle: rocketInitialAngle, // Pointant vers le point B
                    fuel: ROCKET.FUEL_MAX * 6, // CORRECTION: Carburant multiplié par 6 pour la portée doublée (36000)
                    health: 100,
                    isLanded: false, // Pas de planète, donc pas d'atterrissage
                    landedOn: null
                },
                universeConfig: {
                    // Pas de planètes pour cet objectif
                    celestialBodies: [],
                    // Point cible pour la navigation
                    targetPoint: pointB
                },
                missionConfig: {
                    objective: 'navigate',
                    targetPoint: pointB
                }
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
                missionConfig: {
                    objective: this.trainingState.currentObjective
                }
            };
        }
        
        // Configuration pour l'environnement d'évaluation
        // CORRECTION: Utiliser la même configuration que l'entraînement pour cohérence
        // Pour 'navigate', utiliser la même config (sans planètes)
        // Pour les autres objectifs, utiliser la config avec Terre et Lune
        const evaluationConfig = {
            ...trainingConfig,
            // Pour l'évaluation, on peut utiliser la même config que l'entraînement
            // ou adapter selon les besoins (pour l'instant, on copie simplement)
        };
        
        // Créer les environnements avec l'EventBus partagé
        this.trainingEnv = new HeadlessRocketEnvironment(trainingConfig);
        this.trainingEnv.eventBus = this.eventBus; // Utiliser l'EventBus partagé
        
        // Réinitialiser les abonnements aux événements avec le nouvel EventBus
        this.trainingEnv.rocketController.eventBus = this.eventBus;
        this.trainingEnv.physicsController.eventBus = this.eventBus;
        this.trainingEnv.missionManager.eventBus = this.eventBus;
        
        
        // Re-souscrire aux événements avec le bon EventBus
        if (typeof this.trainingEnv.rocketController.subscribeToEvents === 'function') {
            this.trainingEnv.rocketController.subscribeToEvents();
        }
        // CORRECTION: Re-souscrire aussi missionManager si la méthode existe
        if (this.trainingEnv.missionManager && typeof this.trainingEnv.missionManager.subscribeToEvents === 'function') {
            this.trainingEnv.missionManager.subscribeToEvents();
        }
        
        this.evaluationEnv = new HeadlessRocketEnvironment(evaluationConfig);
        this.evaluationEnv.eventBus = this.eventBus; // Utiliser l'EventBus partagé
        
        // Réinitialiser les abonnements aux événements avec le nouvel EventBus
        this.evaluationEnv.rocketController.eventBus = this.eventBus;
        this.evaluationEnv.physicsController.eventBus = this.eventBus;
        this.evaluationEnv.missionManager.eventBus = this.eventBus;
        
        // Re-souscrire aux événements avec le bon EventBus
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
            
            // L'agent choisit une action
            const action = this.getActionFromState(state);
            
            // Exécuter l'action dans l'environnement
            const result = this.trainingEnv.step(action);
            
            // Stocker l'expérience pour l'apprentissage
            if (this.rocketAI.isTraining) {
                // Convertir les états au format attendu par RocketAI
                const aiState = this.buildAIState(state);
                const nextAIState = this.buildAIState(result.observation);
                
                this.rocketAI.replayBuffer.push({
                    state: aiState,
                    action: this.getActionIndex(action),
                    reward: result.reward,
                    nextState: nextAIState,
                    done: result.done
                });
            }
            
            // Entraîner le modèle si suffisamment d'expériences (et si pas dispose)
            if (this.rocketAI && !this.rocketAI.isDisposed &&
                this.rocketAI.replayBuffer.length >= this.config.batchSize &&
                steps % this.rocketAI.config.updateFrequency === 0) {
                try {
                    await this.rocketAI.train();
                } catch (trainError) {
                    // Ignorer silencieusement
                }
            }
            
            state = result.observation;
            totalReward += result.reward;
            done = result.done;
            steps++;
            
            // IMPORTANT: Céder le contrôle au navigateur périodiquement pour garder l'UI réactive
            // Toutes les 50 steps pour un bon équilibre performance/réactivité
            if (steps % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            // Émettre l'événement de step pour la visualisation (toutes les 10 étapes pour les performances)
            if (steps % 10 === 0 && this.trainingEnv.rocketModel) {
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
                        position: { 
                            x: this.trainingEnv.rocketModel.x, 
                            y: this.trainingEnv.rocketModel.y 
                        },
                        velocity: { 
                            x: this.trainingEnv.rocketModel.vx, 
                            y: this.trainingEnv.rocketModel.vy 
                        },
                        angle: this.trainingEnv.rocketModel.angle,
                        fuel: this.trainingEnv.rocketModel.fuel,
                        isLanded: this.trainingEnv.rocketModel.isLanded,
                        isDestroyed: this.trainingEnv.rocketModel.isCrashed
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
    getActionFromState(state) {
        // Construire l'état pour l'agent IA (format attendu par RocketAI)
        const aiState = this.buildAIState(state);
        
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
     * Construit l'état au format attendu par RocketAI
     */
    buildAIState(environmentState) {
        // Vérifier que environmentState existe
        if (!environmentState || typeof environmentState !== 'object') {
            return Array(10).fill(0);
        }
        
        // Adapter l'état de l'environnement au format RocketAI
        // (position, vitesse, angle, etc. normalisés)
        const rawState = [
            (environmentState.rocketX || 0) / 100000,  // Position X normalisée
            (environmentState.rocketY || 0) / 100000,  // Position Y normalisée
            (environmentState.rocketVX || 0) / 100,    // Vitesse X normalisée
            (environmentState.rocketVY || 0) / 100,    // Vitesse Y normalisée
            (environmentState.rocketAngle || 0) / (2 * Math.PI), // Angle normalisé
            (environmentState.rocketAngularVelocity || 0) / 10,  // Vitesse angulaire normalisée
            (environmentState.rocketFuel || 0) / (ROCKET?.FUEL_MAX || 1000), // Carburant normalisé
            (environmentState.rocketHealth || 100) / 100,       // Santé normalisée
            // Distance au corps céleste le plus proche (approximative avec la position)
            Math.min(Math.sqrt((environmentState.rocketX || 0)**2 + (environmentState.rocketY || 0)**2) / 10000, 1),
            // Angle vers le corps céleste (approximatif)
            Math.atan2(environmentState.rocketY || 0, environmentState.rocketX || 0) / (2 * Math.PI)
        ];
        
        // Vérifier et nettoyer l'état pour s'assurer que tous les éléments sont des nombres finis
        const cleanState = rawState.map((val) => {
            if (typeof val !== 'number' || !isFinite(val)) {
                return 0;
            }
            return Math.max(-10, Math.min(10, val));
        });
        
        return cleanState;
    }
    
    /**
     * Convertit l'index d'action en commandes pour l'environnement
     */
    convertActionIndexToEnvironmentAction(actionIndex) {
        const actions = [
            { mainThruster: 1.0, rotationInput: 0 },    // Poussée avant
            { mainThruster: 0, rearThruster: 1.0, rotationInput: 0 }, // Poussée arrière
            { mainThruster: 0, rotationInput: -1.0 },   // Rotation droite
            { mainThruster: 0, rotationInput: 1.0 },    // Rotation gauche
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
        if (action.rotationInput < -0.5) return 2;
        if (action.rotationInput > 0.5) return 3;
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
        
        // Sauvegarder l'état d'entraînement
        const wasTraining = this.rocketAI.isTraining;
        this.rocketAI.isTraining = false; // Désactiver l'exploration
        
        try {
            for (let i = 0; i < numEvaluationEpisodes; i++) {
                // Vérifier à chaque itération que l'agent est toujours disponible
                if (!this.rocketAI || this.rocketAI.isDisposed) {
                    break;
                }
                
                let state = this.evaluationEnv.reset();
                let episodeReward = 0;
                let done = false;
                let steps = 0;
                
                while (!done && steps < this.config.maxStepsPerEpisode) {
                    const action = this.getActionFromState(state);
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
                if (this.isEpisodeSuccessful(episodeReward, steps)) {
                    successCount++;
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
                
                // CORRECTION MEMORY LEAK: Dispose les anciens poids avant de stocker les nouveaux
                if (this.trainingState.bestModelWeights) {
                    this.trainingState.bestModelWeights.forEach(w => {
                        if (w && typeof w.dispose === 'function') {
                            try { w.dispose(); } catch (e) { /* ignore */ }
                        }
                    });
                }
                
                try {
                    this.trainingState.bestModelWeights = await this.rocketAI.model.getWeights();
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
     */
    isEpisodeSuccessful(reward, steps) {
        // CORRECTION: Pour l'objectif 'navigate', vérifier si le point cible est atteint
        if (this.trainingState.currentObjective === 'navigate') {
            if (this.trainingEnv) {
                const targetPoint = this.trainingEnv.config?.missionConfig?.targetPoint;
                if (targetPoint) {
                    const rocketModel = this.trainingEnv.rocketModel;
                    if (rocketModel) {
                        const dx = rocketModel.position.x - targetPoint.x;
                        const dy = rocketModel.position.y - targetPoint.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // Succès si très proche du point cible (dans un rayon de 5000 mètres)
                        if (distance < 5000) {
                            return true;
                        }
                    }
                }
            }
            // Pour 'navigate', si le point n'est pas atteint, ce n'est pas un succès
            return false;
        }
        
        // CORRECTION: Pour l'objectif 'crash_moon', vérifier si la fusée s'est crashée sur la Lune
        if (this.trainingState.currentObjective === 'crash_moon') {
            if (this.trainingEnv) {
                const rocketModel = this.trainingEnv.rocketModel;
                if (rocketModel && rocketModel.isDestroyed) {
                    // Vérifier si le crash a eu lieu sur la Lune
                    const moon = this.trainingEnv.universeModel?.celestialBodies?.find(body => body.name === 'Lune');
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
            const saved = await this.rocketAI.saveModel();
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