// TensorFlow.js est chargé globalement via le script dans index.html

class RocketAI {
    constructor(eventBus) {
        // Référence à l'EventBus pour communiquer avec les autres composants
        this.eventBus = eventBus;
        
        // Dépendances qui seront injectées ou configurées plus tard
        this.rocketModel = null;
        this.universeModel = null;
        this.physicsController = null;
        this.missionManager = null;
        this.rocketController = null;
        
        // État de l'agent
        this.isActive = false;
        this.isTraining = false;
        
        // Seuils pour la prise de décision
        this.thresholds = {
            stability: 0.1,           // Seuil pour considérer la fusée stable
            approach: 500,            // Distance d'approche en mode orbite
            altitude: 50,             // Altitude minimale de sécurité
            velocity: 2.0,            // Vitesse maximale d'approche
            angularVelocity: 0.05     // Vitesse angulaire maximale
        };
        
        // Données du modèle
        this.rocketData = null;
        this.celestialBodyData = null;

        // Objectif actuel de l'agent
        this.currentObjective = 'orbit'; // 'orbit', 'land', 'takeoff'
        
        // Configuration du modèle DQN
        this.config = {
            learningRate: 0.001,
            gamma: 0.99,              // Facteur de décompte
            epsilon: 1.0,             // Taux d'exploration
            epsilonMin: 0.1,          // Taux d'exploration minimum
            epsilonDecay: 0.98,       // CORRECTION : Décroissance plus rapide (0.98 au lieu de 0.995)
            batchSize: 32,            // Taille du batch d'entraînement
            replayBufferSize: 10000,  // Taille du buffer de replay
            updateFrequency: 4,       // CORRECTION CRITIQUE : 4 pas au lieu de 32 pour plus d'entraînements
            saveFrequency: 5000       // Fréquence de sauvegarde
        };
        
        // Actions possibles
        this.actions = [
            'thrustForward',
            'thrustBackward',
            'rotateLeft',
            'rotateRight',
            'noAction'
        ];
        
        // Initialisation du modèle et du replay buffer
        this.initModel();
        this.replayBuffer = [];
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        this.totalSteps = 0;
        
        // Flag pour éviter les appels concurrents à train()
        this.isTrainingInProgress = false;
        
        // Métriques de concurrence pour monitoring
        this.concurrencyMetrics = {
            totalTrainingCalls: 0,
            blockedCalls: 0,
            successfulTrainings: 0,
            averageTrainingDuration: 0,
            lastTrainingTime: 0,
            lastLoss: 0
        };
        
        // S'abonner aux événements nécessaires
        this.subscribeToEvents();
    }
    
    // Initialisation du modèle TensorFlow.js
    initModel() {
        // Modèle principal (Q-network)
        this.model = this.createModel();
        
        // Modèle cible pour la stabilité de l'apprentissage
        this.targetModel = this.createModel();
        this.updateTargetModel();
        
        // Compiler le modèle
        this.model.compile({
            optimizer: tf.train.adam(this.config.learningRate),
            loss: 'meanSquaredError'
        });
    }
    
    // Création du modèle de réseau de neurones
    createModel() {
        const model = tf.sequential();
        
        // Couche d'entrée: 10 paramètres de l'état - AUGMENTÉ de 64 à 128 neurones
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [10]
        }));
        
        // Normalisation par couches pour stabiliser l'apprentissage
        model.add(tf.layers.layerNormalization());
        
        // Première couche cachée - AUGMENTÉ de 64 à 128 neurones
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu'
        }));
        
        // Normalisation par couches
        model.add(tf.layers.layerNormalization());
        
        // Deuxième couche cachée - NOUVELLE COUCHE ajoutée
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu'
        }));
        
        // Couche de sortie: 5 actions possibles
        model.add(tf.layers.dense({
            units: this.actions.length,
            activation: 'linear'
        }));
        
        return model;
    }
    
    // Mettre à jour le modèle cible
    updateTargetModel() {
        // CORRECTION MEMORY LEAK: Dispose les anciens poids avant de les remplacer
        const oldWeights = this.targetModel.getWeights();
        const newWeights = this.model.getWeights();
        this.targetModel.setWeights(newWeights);
        // Libérer les anciens poids
        oldWeights.forEach(w => w.dispose());
        // Note: newWeights sont maintenant référencés par targetModel, ne pas les dispose
    }
    
    // S'abonner aux événements pertinents
    subscribeToEvents() {
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.ROCKET.STATE_UPDATED, data => this.updateRocketData(data)));
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.AI.TOGGLE_CONTROL, () => this.toggleActive()));
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.AI.TOGGLE_TRAINING, () => this.toggleTraining()));
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.ROCKET.CRASHED, () => this.handleCrash()));
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.ROCKET.DESTROYED, () => this.handleCrash()));
        window.controllerContainer.track(this.eventBus.subscribe(window.EVENTS.MISSION.COMPLETED, () => this.handleSuccess()));
    }
    
    // Activer/désactiver l'agent
    toggleActive() {
        this.isActive = !this.isActive;
        
        // Publier l'état de l'agent
        this.eventBus.emit(window.EVENTS.AI.CONTROL_CHANGED, { active: this.isActive });
        
        // Réinitialiser l'état si l'agent est activé
        if (this.isActive) {
            this.lastState = null;
            this.lastAction = null;
            this.episodeSteps = 0;
        }
    }
    
    // Activer/désactiver l'entraînement
    toggleTraining() {
        this.isTraining = !this.isTraining;
        this.eventBus.emit(window.EVENTS.AI.TRAINING_CHANGED, { active: this.isTraining });
    }
    
    // Mettre à jour les données de l'état de la fusée
    updateRocketData(data) {
        this.rocketData = data.rocket;
        this.celestialBodyData = data.celestialBody;
        
        // Si l'agent est actif, prendre une décision
        if (this.isActive && this.rocketData) {
            if (this.isTraining) {
                // Mode apprentissage par renforcement
                this.step();
            } else {
                // Mode manuel ou prédiction sans apprentissage
                this.makeDecision();
            }
        }
    }
    
    // Vérifier que toutes les dépendances sont disponibles
    checkDependencies() {
        const missing = [];
        if (!this.rocketModel) missing.push('rocketModel');
        if (!this.universeModel) missing.push('universeModel');
        if (!this.physicsController) missing.push('physicsController');
        if (!this.missionManager) missing.push('missionManager');
        if (!this.rocketController) missing.push('rocketController');
        
        if (missing.length > 0) {
            if (globalThis.DEBUG) console.warn(`[RocketAI] Dépendances manquantes: ${missing.join(', ')}`);
            return false;
        }
        return true;
    }
    
    // Étape d'apprentissage par renforcement
    step() {
        // Construire l'état actuel
        const currentState = this.buildState();
        
        // Si nous avons un état précédent et une action, calculer la récompense
        if (this.lastState !== null && this.lastAction !== null) {
            const reward = this.calculateReward();
            
            // Stocker l'expérience dans le replay buffer
            this.replayBuffer.push({
                state: this.lastState,
                action: this.lastAction,
                reward: reward,
                nextState: currentState,
                done: false
            });
            
            // Limiter la taille du replay buffer
            if (this.replayBuffer.length > this.config.replayBufferSize) {
                this.replayBuffer.shift();
            }
            
            // Entraîner le modèle périodiquement
            if (this.totalSteps % this.config.updateFrequency === 0 && this.replayBuffer.length >= this.config.batchSize) {
                this.train().catch(error => {
                    console.error('[RocketAI] Erreur lors de l\'entraînement périodique:', error);
                });
            }
            
            // Mettre à jour le modèle cible périodiquement
            if (this.totalSteps % this.config.updateFrequency === 0) {
                this.updateTargetModel();
            }
            
            // Sauvegarder le modèle périodiquement
            this.autoSaveIfNeeded();
        }
        
        // Choisir une action pour l'état actuel
        const actionIndex = this.act(currentState);
        const action = this.actions[actionIndex];
        
        // Exécuter l'action
        this.emitControl(action);
        
        // Mettre à jour l'état et l'action précédents
        this.lastState = currentState;
        this.lastAction = actionIndex;
        
        // Incrémenter les compteurs
        this.episodeSteps++;
        this.totalSteps++;
    }
    
    // Construire le vecteur d'état à partir des données de la fusée
    buildState() {
        if (!this.rocketData || !this.celestialBodyData) {
            return Array(10).fill(0);
        }
        
        // Vérifier que les propriétés nécessaires existent
        const requiredRocketProps = ['x', 'y', 'vx', 'vy', 'angle', 'angularVelocity'];
        const requiredBodyProps = ['x', 'y'];
        
        for (const prop of requiredRocketProps) {
            if (typeof this.rocketData[prop] !== 'number' || !isFinite(this.rocketData[prop])) {
                return Array(10).fill(0);
            }
        }
        
        for (const prop of requiredBodyProps) {
            if (typeof this.celestialBodyData[prop] !== 'number' || !isFinite(this.celestialBodyData[prop])) {
                return Array(10).fill(0);
            }
        }
        
        // Calculer la distance au corps céleste
        const dx = this.rocketData.x - this.celestialBodyData.x;
        const dy = this.rocketData.y - this.celestialBodyData.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Vérifier que la distance est valide et non nulle
        if (!isFinite(distance) || distance === 0) {
            return Array(10).fill(0);
        }
        
        // Calculer l'angle entre la fusée et le corps céleste
        const angleToBody = Math.atan2(dy, dx);
        
        // Calculer la différence d'angle par rapport à l'angle tangent à l'orbite
        const tangentAngle = angleToBody + Math.PI / 2;
        let angleDiff = (tangentAngle - this.rocketData.angle) % (2 * Math.PI);
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Calculer la vitesse radiale et tangentielle
        const radialVelocity = (this.rocketData.vx * dx / distance) + (this.rocketData.vy * dy / distance);
        const tangentialVelocity = (this.rocketData.vx * -dy / distance) + (this.rocketData.vy * dx / distance);
        
        // Construire le vecteur d'état (10 dimensions) avec normalisation sécurisée
        // CORRECTION CRITIQUE : Normalisation physiquement cohérente pour éviter gradients explosifs
        const POSITION_SCALE = 100000;     // 100 km max
        const VELOCITY_SCALE = 1000;       // 1000 m/s max (3.6 km/h)
        const ANGLE_SCALE = Math.PI;       // ±π radians
        const ANGULAR_VEL_SCALE = 10;      // ±10 rad/s max
        const DISTANCE_SCALE = 100000;     // 100 km max
        
        // CORRECTION : Sécurisation des valeurs d'entrée AVANT normalisation
        const safeDistance = Math.max(100, Math.min(distance, 1000000)); // Entre 100m et 1000km
        const safeDx = Math.max(-500000, Math.min(500000, dx)); // ±500km max
        const safeDy = Math.max(-500000, Math.min(500000, dy)); // ±500km max
        const safeVx = Math.max(-2000, Math.min(2000, this.rocketData.vx)); // ±2000 m/s max
        const safeVy = Math.max(-2000, Math.min(2000, this.rocketData.vy)); // ±2000 m/s max
        const safeAngle = ((this.rocketData.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // [0, 2π]
        const safeAngularVel = Math.max(-50, Math.min(50, this.rocketData.angularVelocity)); // ±50 rad/s max
        
        const state = [
            safeDx / POSITION_SCALE,                              // Position relative X [-5, +5]
            safeDy / POSITION_SCALE,                              // Position relative Y [-5, +5]
            safeVx / VELOCITY_SCALE,                              // Vitesse X [-2, +2]
            safeVy / VELOCITY_SCALE,                              // Vitesse Y [-2, +2]
            (safeAngle - Math.PI) / ANGLE_SCALE,                  // Angle normalisé [-1, +1]
            safeAngularVel / ANGULAR_VEL_SCALE,                   // Vitesse angulaire [-5, +5]
            Math.min(10, safeDistance / DISTANCE_SCALE),          // Distance [0, 10]
            Math.max(-1, Math.min(1, angleDiff / ANGLE_SCALE)),   // Angle vers cible [-1, +1]
            Math.max(-2, Math.min(2, radialVelocity / VELOCITY_SCALE)),     // Vitesse radiale [-2, +2]
            Math.max(-2, Math.min(2, tangentialVelocity / VELOCITY_SCALE))  // Vitesse tangentielle [-2, +2]
        ];
        
        // Validation renforcée avec détection de valeurs aberrantes
        for (let i = 0; i < state.length; i++) {
            if (!isFinite(state[i]) || Math.abs(state[i]) > 10) {
                return Array(10).fill(0);
            }
        }
        
        return state;
    }
    
    // Choisir une action en fonction de l'état courant
    act(state) {
        // Stratégie epsilon-greedy
        if (Math.random() < this.config.epsilon) {
            // Exploration: action aléatoire
            return Math.floor(Math.random() * this.actions.length);
        } else {
            // Exploitation: meilleure action selon le modèle
            return tf.tidy(() => {
                const stateTensor = tf.tensor2d([state], [1, 10]);
                const prediction = this.model.predict(stateTensor);
                return prediction.argMax(1).dataSync()[0];
            });
        }
    }
    
    // Calculer la récompense en fonction de l'état actuel
    calculateReward() {
        // Vérifier que les données nécessaires sont disponibles
        if (!this.rocketData || !this.celestialBodyData) {
            return -1;
        }
        
        // Vérifier que les propriétés nécessaires existent
        if (typeof this.rocketData.x !== 'number' || typeof this.rocketData.y !== 'number' ||
            typeof this.celestialBodyData.x !== 'number' || typeof this.celestialBodyData.y !== 'number') {
            return -1;
        }
        
        // Calculer la distance au corps céleste
        const dx = this.rocketData.x - this.celestialBodyData.x;
        const dy = this.rocketData.y - this.celestialBodyData.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Vérifier que la distance est valide
        if (!isFinite(distance) || distance < 0) {
            return -10;
        }
        
        // Distance orbitale cible (surface + altitude sécuritaire)
        const targetOrbitDistance = (this.celestialBodyData.radius || 6371000) + 100000; // 100km au-dessus
        const distanceFromTarget = Math.abs(distance - targetOrbitDistance);
        const relativeError = distanceFromTarget / targetOrbitDistance;
        
        // CORRECTION CRITIQUE : Reward shaping MASSIF avec signaux positifs forts
        let reward = 0;
        
        // Zone parfaite : récompense énorme pour encourager l'apprentissage
        if (relativeError < 0.01) {
            reward = 100.0;  // ÉNORME récompense pour orbite parfaite
        } else if (relativeError < 0.02) {
            reward = 50.0;   // Très grosse récompense pour zone excellente
        } else if (relativeError < 0.05) {
            reward = 20.0;   // Grosse récompense pour zone bonne
        } else if (relativeError < 0.1) {
            reward = 5.0;    // Récompense modérée pour zone acceptable
        } else if (relativeError < 0.2) {
            reward = 1.0;    // Petite récompense pour zone approchante
        } else if (relativeError < 0.5) {
            reward = 0.0;    // Neutre pour zone éloignée
        } else {
            reward = -5.0;   // Pénalité pour être très loin
        }
        
        // Bonus pour stabilité supplémentaire
        if (typeof this.rocketData.angle === 'number' && typeof this.rocketData.angularVelocity === 'number') {
            // Angle tangent à l'orbite
            const angleToBody = Math.atan2(dy, dx);
            const tangentAngle = angleToBody + Math.PI / 2;
            
            // Calculer la différence d'angle
            let angleDiff = (tangentAngle - this.rocketData.angle) % (2 * Math.PI);
            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // GROS bonus pour orientation parfaite
            if (relativeError < 0.05 && Math.abs(angleDiff) < 0.1) {
                reward += 25.0;  // GROS bonus pour bonne orientation + position
            } else if (relativeError < 0.1 && Math.abs(angleDiff) < 0.2) {
                reward += 10.0;  // Bonus modéré
            }
            
            // Bonus pour vitesse angulaire stable
            if (Math.abs(this.rocketData.angularVelocity) < 0.05) {
                reward += 5.0;   // Bonus pour stabilité rotationnelle
            }
        }
        
        // Collision avec le corps céleste : pénalité terminale
        const bodyRadius = this.celestialBodyData.radius || 6371000;
        if (distance < bodyRadius * 1.01) { // Légère marge
            return -1000;  // Pénalité massive pour crash
        }
        
        // Éjection très loin : pénalité progressive
        if (distance > targetOrbitDistance * 5) {
            return -50;  // Pénalité pour éjection
        }
        
        // Bonus de survie pour encourager les épisodes longs
        reward += 0.1;
        
        // S'assurer que la récompense est un nombre fini
        if (!isFinite(reward)) {
            return -1;
        }
        
        return reward;
    }
    
    // Gestion d'un crash
    handleCrash() {
        if (!this.isActive || !this.isTraining) return;
        
        // Si nous avons un état et une action précédents, ajouter une expérience terminale
        if (this.lastState !== null && this.lastAction !== null) {
            // Forte pénalité pour un crash
            this.replayBuffer.push({
                state: this.lastState,
                action: this.lastAction,
                reward: -100,
                nextState: Array(10).fill(0),  // État terminal
                done: true
            });
            
            // Entraîner immédiatement
            if (this.replayBuffer.length >= this.config.batchSize) {
                this.train().catch(error => {
                    console.error('[RocketAI] Erreur lors de l\'entraînement après crash:', error);
                });
            }
        }
        
        // Réinitialiser l'état
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        
        // Décrémenter epsilon pour réduire l'exploration au fil du temps
        if (this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }
    }
    
    // Gestion d'un succès
    handleSuccess() {
        if (!this.isActive || !this.isTraining) return;
        
        // Si nous avons un état et une action précédents, ajouter une expérience terminale
        if (this.lastState !== null && this.lastAction !== null) {
            // Forte récompense pour un succès
            this.replayBuffer.push({
                state: this.lastState,
                action: this.lastAction,
                reward: 100,
                nextState: Array(10).fill(0),  // État terminal
                done: true
            });
            
            // Entraîner immédiatement
            if (this.replayBuffer.length >= this.config.batchSize) {
                this.train().catch(error => {
                    console.error('[RocketAI] Erreur lors de l\'entraînement après succès:', error);
                });
            }
        }
        
        // Réinitialiser l'état
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        
        // Décrémenter epsilon pour réduire l'exploration au fil du temps
        if (this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon *= this.config.epsilonDecay;
        }
    }
    
    // Entraîner le modèle avec un batch du replay buffer
    async train() {
        const startTime = Date.now();
        this.concurrencyMetrics.totalTrainingCalls++;
        
        if (this.replayBuffer.length < this.config.batchSize) return;
        
        // Éviter les appels concurrents
        if (this.isTrainingInProgress) {
            this.concurrencyMetrics.blockedCalls++;
            return;
        }
        
        this.isTrainingInProgress = true;
        
        // Sélectionner un batch aléatoire du replay buffer
        const batch = [];
        const indices = new Set();
        
        while (indices.size < this.config.batchSize) {
            indices.add(Math.floor(Math.random() * this.replayBuffer.length));
        }
        
        indices.forEach(index => {
            batch.push(this.replayBuffer[index]);
        });
        
        // Extraire les états, actions, récompenses, etc. du batch
        // Vérifier et normaliser les états pour s'assurer qu'ils ont tous 10 dimensions
        const states = batch.map(exp => {
            if (!Array.isArray(exp.state) || exp.state.length !== 10) {
                return Array(10).fill(0);
            }
            return exp.state.map(val => (typeof val !== 'number' || !isFinite(val)) ? 0 : val);
        });
        
        const nextStates = batch.map(exp => {
            if (!Array.isArray(exp.nextState) || exp.nextState.length !== 10) {
                return Array(10).fill(0);
            }
            return exp.nextState.map(val => (typeof val !== 'number' || !isFinite(val)) ? 0 : val);
        });
        
        // Vérifier que nous avons exactement le bon nombre d'états
        if (states.length !== this.config.batchSize || nextStates.length !== this.config.batchSize) {
            return;
        }
        
        // Vérifier que chaque état a exactement 10 dimensions
        const totalStateValues = states.reduce((sum, state) => sum + state.length, 0);
        const totalNextStateValues = nextStates.reduce((sum, state) => sum + state.length, 0);
        
        if (totalStateValues !== this.config.batchSize * 10 || totalNextStateValues !== this.config.batchSize * 10) {
            return;
        }
        
        // Prédire les valeurs Q pour les états actuels et futurs
        const qValues = tf.tidy(() => this.model.predict(tf.tensor2d(states, [this.config.batchSize, 10])));
        const nextQValues = tf.tidy(() => this.targetModel.predict(tf.tensor2d(nextStates, [this.config.batchSize, 10])));
        
        // CORRECTION CRITIQUE : Extraire les valeurs dans JavaScript ET calculer les cibles correctement
        const qValuesData = qValues.arraySync();
        const nextQValuesData = nextQValues.arraySync();
        
        // Libérer la mémoire tensor des prédictions
        qValues.dispose();
        nextQValues.dispose();
        
        // CORRECTION : Créer les cibles Q correctement - on ne modifie QUE l'action prise
        const qTargets = qValuesData.map(qRow => [...qRow]); // Copie profonde
        
        // Mettre à jour SEULEMENT les valeurs Q pour les actions prises
        for (let i = 0; i < this.config.batchSize; i++) {
            const experience = batch[i];
            if (experience.done) {
                // État terminal, la valeur Q future est simplement la récompense
                qTargets[i][experience.action] = experience.reward;
            } else {
                // État non terminal, mise à jour selon l'équation de Bellman
                const maxNextQ = Math.max(...nextQValuesData[i]);
                qTargets[i][experience.action] = experience.reward + this.config.gamma * maxNextQ;
            }
        }
        
        // Entraîner le modèle
        const xs = tf.tensor2d(states, [this.config.batchSize, 10]);
        const ys = tf.tensor2d(qTargets, [this.config.batchSize, this.actions.length]);
        
        try {
            const history = await this.model.fit(xs, ys, {
                epochs: 1,
                verbose: 0
            });
            
            // CORRECTION : Capturer et stocker le loss pour monitoring
            const currentLoss = history.history.loss[0];
            
                // Diagnostic des gradients (seulement en mode DEBUG)
                if ((currentLoss === 0 || !isFinite(currentLoss)) && globalThis.DEBUG) {
                    try {
                        const testXs = tf.tensor2d(states.slice(0, 2), [2, 10]);
                        const testYs = tf.tensor2d(qTargets.slice(0, 2), [2, this.actions.length]);
                        
                        const diagnosticResult = tf.tidy(() => {
                            const f = () => {
                                const pred = this.model.apply(testXs, { training: true });
                                return tf.losses.meanSquaredError(testYs, pred);
                            };
                            const grads = tf.variableGrads(f);
                            let totalGradNorm = 0, nanGrads = 0, zeroGrads = 0;
                            Object.values(grads.grads).forEach(grad => {
                                grad.dataSync().forEach(val => {
                                    if (isNaN(val)) nanGrads++;
                                    else if (val === 0) zeroGrads++;
                                    else totalGradNorm += Math.abs(val);
                                });
                            });
                            return { totalGradNorm, nanGrads, zeroGrads };
                        });
                        
                        if (diagnosticResult.nanGrads > 0 || diagnosticResult.totalGradNorm < 1e-8) {
                            console.warn(`[RocketAI] Gradient issue: NaN=${diagnosticResult.nanGrads}, norm=${diagnosticResult.totalGradNorm.toFixed(6)}`);
                        }
                        
                        testXs.dispose();
                        testYs.dispose();
                    } catch (e) { /* ignore diagnostic errors */ }
                }
            
            // Mettre à jour les métriques de succès avec loss
            this.concurrencyMetrics.successfulTrainings++;
            this.concurrencyMetrics.lastLoss = currentLoss;
            
            const trainingDuration = Date.now() - startTime;
            this.concurrencyMetrics.lastTrainingTime = trainingDuration;
            this.concurrencyMetrics.averageTrainingDuration = 
                (this.concurrencyMetrics.averageTrainingDuration * (this.concurrencyMetrics.successfulTrainings - 1) + trainingDuration) / 
                this.concurrencyMetrics.successfulTrainings;
            
            
        } catch (error) {
            console.error('[RocketAI] Erreur lors de l\'entraînement:', error);
            
            // CORRECTION : Diagnostics d'erreur avancés
            console.error('[RocketAI] Détails de l\'erreur:', {
                batchSize: this.config.batchSize,
                statesShape: states.length > 0 ? `${states.length}x${states[0].length}` : 'vide',
                qTargetsShape: qTargets.length > 0 ? `${qTargets.length}x${qTargets[0].length}` : 'vide',
                replayBufferSize: this.replayBuffer.length,
                updateFrequency: this.config.updateFrequency,
                totalSteps: this.totalSteps
            });
            
        } finally {
            // Libérer la mémoire tensor
            xs.dispose();
            ys.dispose();
            
            // Libérer le flag de concurrence
            this.isTrainingInProgress = false;
        }
    }
    
    // Sauvegarder le modèle si nécessaire
    autoSaveIfNeeded() {
        if (this.totalSteps % this.config.saveFrequency === 0) {
            this.saveModel();
        }
        // Monitoring mémoire périodique
        this.monitorMemory();
    }
    
    /**
     * Monitore l'utilisation mémoire de TensorFlow.js.
     * Log seulement en mode DEBUG ou si problème détecté.
     */
    monitorMemory() {
        if (this.totalSteps % 500 !== 0 || this.totalSteps === 0) return;
        
        const memInfo = tf.memory();
        // Avertissement seulement si problème détecté
        if (memInfo.numTensors > 1000 || memInfo.numBytes > 500 * 1024 * 1024) {
            console.warn(`[RocketAI] Memory warning: ${memInfo.numTensors} tensors, ${(memInfo.numBytes / 1024 / 1024).toFixed(2)} MB`);
        }
    }
    
    /**
     * Nettoie les ressources TensorFlow.js pour éviter les fuites mémoire.
     * Doit être appelé lors de la destruction de l'agent.
     */
    cleanup() {
        try {
            if (this.model) {
                this.model.dispose();
                this.model = null;
            }
            if (this.targetModel) {
                this.targetModel.dispose();
                this.targetModel = null;
            }
            this.replayBuffer = [];
        } catch (error) {
            console.error('[RocketAI] Cleanup error:', error);
        }
    }
    
    // Sauvegarder le modèle
    async saveModel() {
        try {
            await this.model.save('localstorage://rocket-ai-model');
        } catch (error) {
            console.error('[RocketAI] Save error:', error);
        }
    }
    
    // Charger le modèle
    async loadModel() {
        try {
            this.model = await tf.loadLayersModel('localstorage://rocket-ai-model');
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            this.updateTargetModel();
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Obtenir les métriques de concurrence
    getConcurrencyMetrics() {
        return {
            ...this.concurrencyMetrics,
            blockingRate: this.concurrencyMetrics.totalTrainingCalls > 0 ? 
                (this.concurrencyMetrics.blockedCalls / this.concurrencyMetrics.totalTrainingCalls * 100).toFixed(2) + '%' : '0%',
            successRate: this.concurrencyMetrics.totalTrainingCalls > 0 ? 
                (this.concurrencyMetrics.successfulTrainings / this.concurrencyMetrics.totalTrainingCalls * 100).toFixed(2) + '%' : '0%',
            lastLoss: this.concurrencyMetrics.lastLoss || 0  // CORRECTION : Exposer la dernière valeur de loss
        };
    }
    
    // Réinitialiser les métriques de concurrence
    resetConcurrencyMetrics() {
        this.concurrencyMetrics = {
            totalTrainingCalls: 0,
            blockedCalls: 0,
            successfulTrainings: 0,
            averageTrainingDuration: 0,
            lastTrainingTime: 0,
            lastLoss: 0
        };
    }
    
    // Définir un nouvel objectif
    setObjective(objective) {
        this.currentObjective = objective;
    }
    
    // Algorithme de prise de décision principal (pour le mode non-entraînement)
    makeDecision() {
        switch (this.currentObjective) {
            case 'orbit':
                this.maintainOrbit();
                break;
            default:
                this.maintainOrbit();
        }
    }
    
    // Logique pour maintenir une orbite stable
    maintainOrbit() {
        if (!this.rocketData || !this.celestialBodyData) return;
        
        // Calculer la distance au corps céleste
        const dx = this.rocketData.x - this.celestialBodyData.x;
        const dy = this.rocketData.y - this.celestialBodyData.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Calculer l'angle entre la fusée et le corps céleste
        const angleToBody = Math.atan2(dy, dx);
        
        // Calculer l'angle tangent à l'orbite (perpendiculaire à angleToBody)
        const tangentAngle = angleToBody + Math.PI / 2;
        
        // Calculer l'angle actuel de la fusée
        const rocketAngle = this.rocketData.angle;
        
        // Calculer la différence d'angle (normaliser entre -PI et PI)
        let angleDiff = (tangentAngle - rocketAngle) % (2 * Math.PI);
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        // Décider de la rotation
        if (angleDiff > this.thresholds.stability) {
            this.emitControl('rotateLeft');
        } else if (angleDiff < -this.thresholds.stability) {
            this.emitControl('rotateRight');
        } else {
            // Stabilité angulaire atteinte, gérer la propulsion
            
            // Calculer la différence par rapport à l'orbite idéale
            const targetOrbitDistance = this.celestialBodyData.radius + this.thresholds.approach;
            const distanceDiff = distance - targetOrbitDistance;
            
            // Calculer la vitesse radiale (vers/depuis le corps céleste)
            const radialVelocity = (this.rocketData.vx * dx / distance) + (this.rocketData.vy * dy / distance);
            
            // Appliquer la propulsion appropriée
            if (distanceDiff < -50 || (distanceDiff < 0 && radialVelocity < -this.thresholds.velocity)) {
                // Trop proche ou approche trop rapidement, s'éloigner
                this.emitControl('thrustForward');
            } else if (distanceDiff > 50 || (distanceDiff > 0 && radialVelocity > this.thresholds.velocity)) {
                // Trop loin ou s'éloigne trop rapidement, se rapprocher
                this.emitControl('thrustBackward');
            } else {
                // Distance orbitale correcte, maintenir la trajectoire tangentielle
                const tangentialSpeed = Math.abs((this.rocketData.vx * -dy / distance) + (this.rocketData.vy * dx / distance));
                
                if (tangentialSpeed < Math.sqrt(PHYSICS.G * this.celestialBodyData.mass / distance) * 0.9) {
                    // Vitesse orbitale trop faible, accélérer
                    this.emitControl('thrustForward');
                }
            }
        }
    }
    
    // Émettre une commande de contrôle mappée vers des événements sémantiques
    emitControl(action) {
        if (!this.isActive || !this.eventBus || !window.EVENTS) return;

        // Par défaut, on remet à zéro les propulseurs continus non ciblés (sécurité)
        const resetContinuousThrusters = () => {
            this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'main', power: 0 });
            this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'rear', power: 0 });
            this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: 0 });
            this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: 0 });
        };

        switch (action) {
            case 'thrustForward':
                // Utiliser SET_THRUSTER_POWER pour être idempotent et éviter les START/STOP multiples
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'main', power: ROCKET.THRUSTER_POWER.MAIN });
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'rear', power: 0 });
                break;
            case 'thrustBackward':
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'rear', power: ROCKET.THRUSTER_POWER.REAR });
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'main', power: 0 });
                break;
            case 'rotateLeft': {
                const power = ROCKET.THRUSTER_POWER.LEFT;
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power });
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: 0 });
                break;
            }
            case 'rotateRight': {
                const power = ROCKET.THRUSTER_POWER.RIGHT;
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power });
                this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: 0 });
                break;
            }
            case 'noAction':
            default:
                resetContinuousThrusters();
                break;
        }

        // Événement d'audit/débogage
        this.eventBus.emit(window.EVENTS.AI.CONTROL_ACTION, { action });
    }
    
    // Ajouter la méthode update appelée par GameController pour éviter l'erreur
    update(deltaTime) {
        // Rien à faire ici car updateRocketData gère déjà les décisions de l'agent
    }

    /**
     * Injecte ou met à jour les dépendances essentielles pour l'agent.
     * Cette méthode est appelée par GameSetupController si l'agent est fourni
     * de l'extérieur ou pour s'assurer que toutes les dépendances sont à jour.
     * @param {Object} dependencies - Un objet contenant les dépendances.
     * @param {RocketModel} dependencies.rocketModel - Le modèle de la fusée.
     * @param {UniverseModel} dependencies.universeModel - Le modèle de l'univers.
     * @param {PhysicsController} dependencies.physicsController - Le contrôleur physique.
     * @param {MissionManager} dependencies.missionManager - Le gestionnaire de missions.
     * @param {RocketController} dependencies.rocketController - Le contrôleur de la fusée.
     */
    injectDependencies({ rocketModel, universeModel, physicsController, missionManager, rocketController }) {
        this.rocketModel = rocketModel || this.rocketModel;
        this.universeModel = universeModel || this.universeModel;
        this.physicsController = physicsController || this.physicsController;
        this.missionManager = missionManager || this.missionManager;
        this.rocketController = rocketController || this.rocketController;
    }
} 