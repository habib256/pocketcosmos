// TensorFlow.js est chargé globalement via le script dans index.html

class RocketAgent {
    constructor(eventBus) {
        // Référence à l'EventBus pour communiquer avec les autres composants
        this.eventBus = eventBus;
        
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
            epsilonDecay: 0.995,      // Décroissance du taux d'exploration
            batchSize: 32,            // Taille du batch d'entraînement
            replayBufferSize: 10000,  // Taille du buffer de replay
            updateFrequency: 1000,    // Fréquence de mise à jour du réseau cible
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
        
        // Couche d'entrée: 10 paramètres de l'état
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [10]
        }));
        
        // Couche cachée
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
        this.targetModel.setWeights(this.model.getWeights());
    }
    
    // S'abonner aux événements pertinents
    subscribeToEvents() {
        this.eventBus.subscribe(window.EVENTS.ROCKET.STATE_UPDATED, data => this.updateRocketData(data));
        this.eventBus.subscribe(window.EVENTS.AI.TOGGLE, () => this.toggleActive());
        this.eventBus.subscribe(window.EVENTS.AI.TOGGLE_TRAINING, () => this.toggleTraining());
        this.eventBus.subscribe(window.EVENTS.ROCKET.CRASHED, () => this.handleCrash());
        this.eventBus.subscribe(window.EVENTS.MISSION.COMPLETED, () => this.handleSuccess());
    }
    
    // Activer/désactiver l'agent
    toggleActive() {
        this.isActive = !this.isActive;
        console.log(`Agent IA ${this.isActive ? 'activé' : 'désactivé'}`);
        
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
        console.log(`Entraînement ${this.isTraining ? 'activé' : 'désactivé'}`);
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
            if (this.totalSteps % 10 === 0 && this.replayBuffer.length >= this.config.batchSize) {
                this.train();
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
        
        // Calculer la distance au corps céleste
        const dx = this.rocketData.x - this.celestialBodyData.x;
        const dy = this.rocketData.y - this.celestialBodyData.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
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
        
        // Construire le vecteur d'état (10 dimensions)
        return [
            dx / 1000,                   // Position relative X (normalisée)
            dy / 1000,                   // Position relative Y (normalisée)
            this.rocketData.vx / 10,     // Vitesse X (normalisée)
            this.rocketData.vy / 10,     // Vitesse Y (normalisée)
            this.rocketData.angle / Math.PI, // Angle de la fusée (normalisé entre -1 et 1)
            this.rocketData.angularVelocity / 0.1, // Vitesse angulaire (normalisée)
            distance / 1000,             // Distance au corps céleste (normalisée)
            angleDiff / Math.PI,         // Différence d'angle par rapport à la tangente (normalisée)
            radialVelocity / 10,         // Vitesse radiale (normalisée)
            tangentialVelocity / 10      // Vitesse tangentielle (normalisée)
        ];
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
        if (!this.rocketData || !this.celestialBodyData) return -1;
        
        // Calculer la distance au corps céleste
        const dx = this.rocketData.x - this.celestialBodyData.x;
        const dy = this.rocketData.y - this.celestialBodyData.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Distance orbitale cible
        const targetOrbitDistance = this.celestialBodyData.radius + this.thresholds.approach;
        
        // Récompense de base liée à la distance par rapport à l'orbite idéale
        let reward = -Math.abs(distance - targetOrbitDistance) / 100;
        
        // Angle tangent à l'orbite
        const angleToBody = Math.atan2(dy, dx);
        const tangentAngle = angleToBody + Math.PI / 2;
        
        // Pénalité pour une mauvaise orientation
        let angleDiff = (tangentAngle - this.rocketData.angle) % (2 * Math.PI);
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        
        reward -= Math.abs(angleDiff) * 2;
        
        // Pénalité pour une vitesse angulaire élevée
        reward -= Math.abs(this.rocketData.angularVelocity) * 5;
        
        // Bonus pour une orbite stable
        if (Math.abs(distance - targetOrbitDistance) < 20 && Math.abs(angleDiff) < 0.1) {
            reward += 10;
        }
        
        // Collision avec le corps céleste
        if (distance < this.celestialBodyData.radius) {
            reward = -100;  // Pénalité importante pour un crash
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
                this.train();
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
                this.train();
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
    train() {
        if (this.replayBuffer.length < this.config.batchSize) return;
        
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
        const states = batch.map(exp => exp.state);
        const nextStates = batch.map(exp => exp.nextState);
        
        // Prédire les valeurs Q pour les états actuels et futurs
        const qValues = tf.tidy(() => this.model.predict(tf.tensor2d(states, [this.config.batchSize, 10])));
        const nextQValues = tf.tidy(() => this.targetModel.predict(tf.tensor2d(nextStates, [this.config.batchSize, 10])));
        
        // Extraire les valeurs dans JavaScript
        const qValuesData = qValues.arraySync();
        const nextQValuesData = nextQValues.arraySync();
        
        // Libérer la mémoire tensor
        qValues.dispose();
        nextQValues.dispose();
        
        // Mettre à jour les valeurs Q cibles
        for (let i = 0; i < this.config.batchSize; i++) {
            const experience = batch[i];
            if (experience.done) {
                // État terminal, la valeur Q future est simplement la récompense
                qValuesData[i][experience.action] = experience.reward;
            } else {
                // État non terminal, mise à jour selon l'équation de Bellman
                const maxNextQ = Math.max(...nextQValuesData[i]);
                qValuesData[i][experience.action] = experience.reward + this.config.gamma * maxNextQ;
            }
        }
        
        // Entraîner le modèle
        const xs = tf.tensor2d(states, [this.config.batchSize, 10]);
        const ys = tf.tensor2d(qValuesData, [this.config.batchSize, this.actions.length]);
        
        this.model.fit(xs, ys, {
            epochs: 1,
            verbose: 0
        }).then(() => {
            // Libérer la mémoire tensor
            xs.dispose();
            ys.dispose();
            
            console.log(`Entraînement terminé: étape ${this.totalSteps}, epsilon ${this.config.epsilon.toFixed(3)}`);
        });
    }
    
    // Sauvegarder le modèle si nécessaire
    autoSaveIfNeeded() {
        if (this.totalSteps % this.config.saveFrequency === 0) {
            this.saveModel();
        }
    }
    
    // Sauvegarder le modèle
    async saveModel() {
        try {
            await this.model.save('localstorage://rocket-agent-model');
            console.log(`Modèle sauvegardé à l'étape ${this.totalSteps}`);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du modèle:', error);
        }
    }
    
    // Charger le modèle
    async loadModel() {
        try {
            this.model = await tf.loadLayersModel('localstorage://rocket-agent-model');
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            
            // Mettre à jour également le modèle cible
            this.updateTargetModel();
            
            console.log('Modèle chargé avec succès');
            return true;
        } catch (error) {
            console.warn('Aucun modèle trouvé à charger:', error);
            return false;
        }
    }
    
    // Définir un nouvel objectif
    setObjective(objective) {
        this.currentObjective = objective;
        console.log(`Agent IA: Nouvel objectif - ${objective}`);
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
    
    // Émettre une commande de contrôle (comme si c'était une entrée utilisateur)
    emitControl(action) {
        if (!this.isActive) return;
        
        // Émettre l'action comme si elle venait du contrôleur d'entrée
        this.eventBus.emit(window.EVENTS.INPUT.KEYDOWN, { action, key: 'AI' });
        
        // Émettre aussi un événement spécifique à l'IA pour affichage/débogage
        this.eventBus.emit(window.EVENTS.AI.CONTROL_ACTION, { action });
    }
    
    // Ajouter la méthode update appelée par GameController pour éviter l'erreur
    update(deltaTime) {
        // Rien à faire ici car updateRocketData gère déjà les décisions de l'agent
    }
}
