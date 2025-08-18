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
            currentObjective: 'orbit',
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
            console.warn('Entraînement déjà en cours');
            return;
        }
        
        try {
                    // Fusionner la configuration utilisateur avec la configuration par défaut
        this.config = { ...this.config, ...userConfig };
        
        // Mettre à jour l'objectif actuel si fourni
        if (this.config.objectives && this.config.objectives.length > 0) {
            this.trainingState.currentObjective = this.config.objectives[0];
        }
        
        console.log('[TrainingOrchestrator] Démarrage de l\'entraînement...', this.config);
        console.log('[TrainingOrchestrator] Objectif d\'entraînement:', this.trainingState.currentObjective);
        this.metrics.trainingStartTime = Date.now();
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
            console.error('[TrainingOrchestrator] Erreur lors du démarrage:', error);
            this.isTraining = false;
            this.eventBus.emit(window.EVENTS.AI.TRAINING_ERROR, { error: error.message });
        }
    }
    
    /**
     * Initialise les environnements d'entraînement et d'évaluation
     */
    async initializeEnvironments() {
        console.log('[TrainingOrchestrator] Initialisation des environnements...');
        
        // Configuration pour l'environnement d'entraînement (avec Terre et Lune)
        const trainingConfig = {
            maxStepsPerEpisode: this.config.maxStepsPerEpisode,
            rocketInitialState: {
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                fuel: ROCKET.FUEL_MAX,
                health: 100
            },
            universeConfig: {
                // Configuration avec Terre et Lune pour l'entraînement
                celestialBodies: [
                    {
                        name: 'Terre',
                        mass: 5.972e24,
                        radius: 6371000,
                        position: { x: 0, y: 6471000 },
                        color: '#1E88E5'
                    },
                    {
                        name: 'Lune',
                        mass: 7.342e22,
                        radius: 1737000,
                        position: { x: 384400000, y: 6471000 },
                        color: '#CCCCCC'
                    }
                ]
            },
            missionConfig: {
                objective: this.trainingState.currentObjective
            }
        };
        
        // Configuration pour l'environnement d'évaluation (plus réaliste)
        const evaluationConfig = {
            ...trainingConfig,
            universeConfig: {
                // Configuration complète pour l'évaluation
                celestialBodies: [
                    {
                        name: 'Terre',
                        mass: 5.972e24,
                        radius: 6371000,
                        position: { x: 0, y: 6471000 }
                    },
                    {
                        name: 'Lune',
                        mass: 7.342e22,
                        radius: 1737000,
                        position: { x: 384400000, y: 6471000 }
                    }
                ]
            }
        };
        
        // Créer les environnements avec l'EventBus partagé
        this.trainingEnv = new HeadlessRocketEnvironment(trainingConfig);
        this.trainingEnv.eventBus = this.eventBus; // Utiliser l'EventBus partagé
        
        // Réinitialiser les abonnements aux événements avec le nouvel EventBus
        this.trainingEnv.rocketController.eventBus = this.eventBus;
        this.trainingEnv.physicsController.eventBus = this.eventBus;
        this.trainingEnv.missionManager.eventBus = this.eventBus;
        
        // S'assurer que les constantes EVENTS sont disponibles globalement
        if (typeof window.EVENTS === 'undefined') {
            window.EVENTS = this.trainingEnv.EVENT_TYPES;
        }
        
        // Re-souscrire aux événements avec le bon EventBus
        if (typeof this.trainingEnv.rocketController.subscribeToEvents === 'function') {
            this.trainingEnv.rocketController.subscribeToEvents();
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
        
        console.log('[TrainingOrchestrator] Environnements initialisés');
    }
    
    /**
     * Initialise et configure l'agent IA
     */
    async initializeAgent() {
        console.log('[TrainingOrchestrator] Initialisation de l\'agent IA...');
        
        // Créer une nouvelle instance ou utiliser l'existante
        this.rocketAI = new RocketAI(this.eventBus);
        
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
        
        console.log('[TrainingOrchestrator] Agent IA configuré avec dépendances injectées');
    }
    
    /**
     * Boucle d'entraînement principale
     */
    async trainingLoop() {
        console.log('[TrainingOrchestrator] Démarrage de la boucle d\'entraînement');
        
        for (let episode = 0; episode < this.config.maxEpisodes && this.isTraining; episode++) {
            if (this.isPaused) {
                await this.waitForResume();
            }
            
            this.metrics.episode = episode;
            
            // Exécuter un épisode d'entraînement
            const episodeResult = await this.runTrainingEpisode();
            
            // Mettre à jour les métriques
            this.updateMetrics(episodeResult);
            
            // Log périodique
            if (episode % this.config.logInterval === 0) {
                this.logProgress();
            }
            
            // Évaluation périodique
            if (episode % this.config.evaluationInterval === 0) {
                await this.evaluateAgent();
            }
            
            // Sauvegarde périodique
            if (episode % this.config.checkpointInterval === 0) {
                await this.saveCheckpoint();
            }
            
            // Vérification de convergence
            if (this.checkConvergence()) {
                console.log('[TrainingOrchestrator] Convergence atteinte, arrêt de l\'entraînement');
                break;
            }
            
            // Early stopping
            if (this.checkEarlyStopping()) {
                console.log('[TrainingOrchestrator] Early stopping déclenché');
                break;
            }
            
            // Émission d'événement de progression
            this.eventBus.emit(window.EVENTS.AI.TRAINING_PROGRESS, {
                episode,
                metrics: this.metrics,
                config: this.config
            });
        }
        
        // Finaliser l'entraînement
        await this.finalizeTraining();
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
        
        while (!done && steps < this.config.maxStepsPerEpisode) {
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
            
            // Entraîner le modèle si suffisamment d'expériences
            if (this.rocketAI.replayBuffer.length >= this.config.batchSize && steps % this.rocketAI.config.updateFrequency === 0) {
                await this.rocketAI.train();
            }
            
            state = result.observation;
            totalReward += result.reward;
            done = result.done;
            steps++;
        }
        
        // CORRECTION : Appliquer la décroissance d'epsilon après chaque épisode
        if (this.rocketAI.config.epsilon > this.rocketAI.config.epsilonMin) {
            this.rocketAI.config.epsilon *= this.rocketAI.config.epsilonDecay;
        }
        
        const episodeDuration = Date.now() - startTime;
        
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
            console.warn('[TrainingOrchestrator] État d\'environnement invalide, utilisation d\'un état par défaut');
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
        const cleanState = rawState.map((val, index) => {
            if (typeof val !== 'number' || !isFinite(val)) {
                console.warn(`[TrainingOrchestrator] Valeur d'état invalide à l'index ${index}: ${val}, remplacement par 0`);
                return 0;
            }
            // Borner les valeurs entre -10 et 10 pour éviter les valeurs extrêmes
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
        console.log('[TrainingOrchestrator] Évaluation de l\'agent...');
        
        const numEvaluationEpisodes = 10;
        let totalScore = 0;
        let successCount = 0;
        
        // Sauvegarder l'état d'entraînement
        const wasTraining = this.rocketAI.isTraining;
        this.rocketAI.isTraining = false; // Désactiver l'exploration
        
        for (let i = 0; i < numEvaluationEpisodes; i++) {
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
            }
            
            totalScore += episodeReward;
            if (this.isEpisodeSuccessful(episodeReward, steps)) {
                successCount++;
            }
        }
        
        // Restaurer l'état d'entraînement
        this.rocketAI.isTraining = wasTraining;
        
        const averageScore = totalScore / numEvaluationEpisodes;
        const successRate = successCount / numEvaluationEpisodes;
        
        this.metrics.lastEvaluationScore = averageScore;
        this.trainingState.recentPerformance.push(averageScore);
        
        // Conserver seulement les 10 dernières évaluations
        if (this.trainingState.recentPerformance.length > 10) {
            this.trainingState.recentPerformance.shift();
        }
        
        console.log(`[TrainingOrchestrator] Évaluation: Score moyen=${averageScore.toFixed(2)}, Taux de succès=${(successRate * 100).toFixed(1)}%`);
        
        // Sauvegarder le meilleur modèle
        if (averageScore > this.metrics.bestAverageReward) {
            this.metrics.bestAverageReward = averageScore;
            this.trainingState.bestModelWeights = await this.rocketAI.model.getWeights();
            console.log('[TrainingOrchestrator] Nouveau meilleur modèle sauvegardé');
        }
        
        this.eventBus.emit(window.EVENTS.AI.EVALUATION_COMPLETED, {
            episode: this.metrics.episode,
            averageScore,
            successRate,
            bestScore: this.metrics.bestAverageReward
        });
    }
    
    /**
     * Détermine si un épisode est réussi
     */
    isEpisodeSuccessful(reward, steps) {
        // Critères de succès : récompense positive et durée raisonnable
        return reward > 0 && steps < this.config.maxStepsPerEpisode * 0.8;
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
        this.metrics.explorationRates.push(this.rocketAI.config.epsilon);
        
        // Limiter la taille des tableaux de métriques
        const maxLength = 100;
        if (this.metrics.averageRewards.length > maxLength) {
            this.metrics.averageRewards.shift();
            this.metrics.episodeLengths.shift();
            this.metrics.explorationRates.shift();
        }
    }
    
    /**
     * Log des progrès d'entraînement
     */
    logProgress() {
        const avgReward = this.metrics.averageRewards.length > 0 ? 
            this.metrics.averageRewards.reduce((a, b) => a + b, 0) / this.metrics.averageRewards.length : 0;
        
        const successRate = this.metrics.successfulEpisodes / Math.max(this.metrics.episode, 1);
        
        console.log(`[TrainingOrchestrator] Épisode ${this.metrics.episode}: ` +
                   `Récompense moy=${avgReward.toFixed(2)}, ` +
                   `Succès=${(successRate * 100).toFixed(1)}%, ` +
                   `ε=${this.rocketAI.config.epsilon.toFixed(3)}`);
    }
    
    /**
     * Vérifie la convergence de l'entraînement
     */
    checkConvergence() {
        if (this.metrics.episode < this.config.evaluationInterval) return false;
        
        const successRate = this.metrics.successfulEpisodes / this.metrics.episode;
        return successRate >= this.config.targetSuccessRate;
    }
    
    /**
     * Vérifie l'early stopping
     */
    checkEarlyStopping() {
        if (this.trainingState.recentPerformance.length < 5) return false;
        
        // Vérifier si les performances n'augmentent plus
        const recent = this.trainingState.recentPerformance.slice(-5);
        const isStagnant = recent.every(score => score <= this.metrics.bestAverageReward * 0.95);
        
        if (isStagnant) {
            this.trainingState.earlyStoppingCounter++;
        } else {
            this.trainingState.earlyStoppingCounter = 0;
        }
        
        return this.trainingState.earlyStoppingCounter >= this.config.patience / this.config.evaluationInterval;
    }
    
    /**
     * Sauvegarde un checkpoint
     */
    async saveCheckpoint() {
        try {
            await this.rocketAI.saveModel();
            this.metrics.lastCheckpointTime = Date.now();
            console.log(`[TrainingOrchestrator] Checkpoint sauvegardé à l'épisode ${this.metrics.episode}`);
        } catch (error) {
            console.error('[TrainingOrchestrator] Erreur lors de la sauvegarde:', error);
        }
    }
    
    /**
     * Finalise l'entraînement
     */
    async finalizeTraining() {
        console.log('[TrainingOrchestrator] Finalisation de l\'entraînement...');
        
        this.isTraining = false;
        
        // Restaurer le meilleur modèle
        if (this.trainingState.bestModelWeights) {
            await this.rocketAI.model.setWeights(this.trainingState.bestModelWeights);
            console.log('[TrainingOrchestrator] Meilleur modèle restauré');
        }
        
        // Sauvegarde finale
        await this.saveCheckpoint();
        
        // Calcul des statistiques finales
        const trainingDuration = Date.now() - this.metrics.trainingStartTime;
        const finalSuccessRate = this.metrics.successfulEpisodes / this.metrics.episode;
        
        const finalStats = {
            episodes: this.metrics.episode,
            totalSteps: this.metrics.totalSteps,
            trainingDuration,
            finalSuccessRate,
            bestAverageReward: this.metrics.bestAverageReward,
            averageEpisodeLength: this.metrics.episodeLengths.reduce((a, b) => a + b, 0) / this.metrics.episodeLengths.length
        };
        
        console.log('[TrainingOrchestrator] Entraînement terminé:', finalStats);
        
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
        console.log('[TrainingOrchestrator] Entraînement arrêté');
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
        console.log('[TrainingOrchestrator] Entraînement mis en pause');
        this.eventBus.emit(window.EVENTS.AI.TRAINING_PAUSED, this.metrics);
    }
    
    /**
     * Reprend l'entraînement
     */
    resumeTraining() {
        this.isPaused = false;
        console.log('[TrainingOrchestrator] Entraînement repris');
        this.eventBus.emit(window.EVENTS.AI.TRAINING_RESUMED, this.metrics);
    }
    
    /**
     * Met à jour la configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[TrainingOrchestrator] Configuration mise à jour:', newConfig);
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