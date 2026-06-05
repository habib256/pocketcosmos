// TensorFlow.js est chargé globalement via le script dans index.html

class RocketAI {
    // CORRECTION (bug #4) : dimension unique du vecteur d'état, partagée par le builder
    // (buildStateVector), la construction du modèle (inputShape) et le replay buffer.
    // Toute modification de cette valeur reste cohérente partout via cette constante.
    static get STATE_SIZE() { return 10; }

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
            targetUpdateFrequency: 500, // Synchronisation du target network (DQN) : nettement plus rare que l'entraînement pour stabiliser la cible.
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
        this.modelReady = false;
        this.initModel().then(() => {
            this.modelReady = true;
        }).catch(error => {
            console.error('[RocketAI] Impossible d\'initialiser les modèles:', error);
        });
        this.replayBuffer = [];
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        this.totalSteps = 0;
        
        // Flag pour éviter les appels concurrents à train()
        this.isTrainingInProgress = false;
        
        // Flag pour tracker si les modèles ont été disposés
        this.isDisposed = false;
        
        // Métriques de concurrence pour monitoring
        this.concurrencyMetrics = {
            totalTrainingCalls: 0,
            blockedCalls: 0,
            successfulTrainings: 0,
            averageTrainingDuration: 0,
            lastTrainingTime: 0,
            lastLoss: 0
        };
        
        // S'abonner aux événements nécessaires (si controllerContainer disponible)
        this.subscribeToEvents();
    }
    
    // Initialisation du modèle TensorFlow.js
    async initModel() {
        // S'assurer qu'on n'est pas en état dispose
        this.isDisposed = false;
        
        try {
            // Attendre que TensorFlow.js soit prêt
            await tf.ready();
            
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
        } catch (error) {
            console.error('[RocketAI] Erreur lors de l\'initialisation du modèle:', error);
            
            // Tenter de basculer vers le backend CPU si l'erreur est liée au backend
            if (error.message && (error.message.includes('SIGILL') || error.message.includes('backend'))) {
                try {
                    await tf.setBackend('cpu');
                    await tf.ready();
                    
                    // Réessayer la création des modèles
                    this.model = this.createModel();
                    this.targetModel = this.createModel();
                    this.updateTargetModel();
                    
                    this.model.compile({
                        optimizer: tf.train.adam(this.config.learningRate),
                        loss: 'meanSquaredError'
                    });
                } catch (fallbackError) {
                    throw fallbackError;
                }
            } else {
                throw error;
            }
        }
    }
    
    // Création du modèle de réseau de neurones
    createModel() {
        const model = tf.sequential();
        
        // Couche d'entrée: STATE_SIZE paramètres de l'état - AUGMENTÉ de 64 à 128 neurones
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu',
            inputShape: [RocketAI.STATE_SIZE]
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
        // Vérifier que les modèles existent et ne sont pas disposés
        if (!this.model || !this.targetModel || this.isDisposed) {
            return;
        }
        
        try {
            // getWeights() renvoie les tenseurs VIVANTS des variables des modèles (PAS des copies) ;
            // setWeights() recopie leurs valeurs dans les variables de la cible. Il ne faut donc PAS
            // les disposer : le faire libérait les poids des modèles eux-mêmes, d'où l'erreur
            // "LayersVariable dense_Dense1/kernel is already disposed" qui faisait échouer model.fit()
            // à CHAQUE appel (successfulTrainings restait à 0 -> aucun apprentissage).
            this.targetModel.setWeights(this.model.getWeights());
        } catch (error) {
            // Ignorer les erreurs silencieusement
        }
    }
    
    // S'abonner aux événements pertinents
    subscribeToEvents() {
        // Helper pour tracker les souscriptions avec ou sans controllerContainer
        const trackSub = (unsub) => {
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(unsub);
            } else {
                // Stocker les unsubscribe functions pour cleanup manuel
                if (!this._eventUnsubscribers) {
                    this._eventUnsubscribers = [];
                }
                this._eventUnsubscribers.push(unsub);
            }
        };
        
        // Vérifier que eventBus et EVENTS existent
        if (!this.eventBus || !window.EVENTS) {
            return;
        }
        
        trackSub(this.eventBus.subscribe(window.EVENTS.ROCKET.STATE_UPDATED, data => this.updateRocketData(data)));
        trackSub(this.eventBus.subscribe(window.EVENTS.AI.TOGGLE_CONTROL, () => this.toggleActive()));
        trackSub(this.eventBus.subscribe(window.EVENTS.AI.TOGGLE_TRAINING, () => this.toggleTraining()));
        // ROCKET.CRASHED n'est jamais émis (le crash passe par ROCKET.DESTROYED) -> abonnement retiré.
        trackSub(this.eventBus.subscribe(window.EVENTS.ROCKET.DESTROYED, () => this.handleCrash()));
        trackSub(this.eventBus.subscribe(window.EVENTS.MISSION.COMPLETED, () => this.handleSuccess()));

        // CORRECTION (bug #5) : après un changement de monde, le UniverseModel (et le
        // RocketModel) sont recréés. Sans réabonnement, this.universeModel reste obsolète.
        // Le payload de UNIVERSE.STATE_UPDATED est { universeModel, rocketModel }.
        if (window.EVENTS.UNIVERSE && window.EVENTS.UNIVERSE.STATE_UPDATED) {
            trackSub(this.eventBus.subscribe(window.EVENTS.UNIVERSE.STATE_UPDATED, (data) => {
                if (data && data.universeModel) {
                    this.universeModel = data.universeModel;
                }
                if (data && data.rocketModel) {
                    this.rocketModel = data.rocketModel;
                }
            }));
        }
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
            
            // Entraîner le modèle périodiquement (ignorer silencieusement si disposed)
            if (this.totalSteps % this.config.updateFrequency === 0 && this.replayBuffer.length >= this.config.batchSize && !this.isDisposed) {
                this.train().catch(() => {});
            }
            
            // Mettre à jour le modèle cible périodiquement (cadence indépendante de l'entraînement pour la stabilité DQN)
            if (this.totalSteps % this.config.targetUpdateFrequency === 0) {
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
    
    // CORRECTION (bug #4 - état incohérent training/inférence) :
    // SOURCE DE VÉRITÉ UNIQUE pour la construction du vecteur d'état (10 dimensions).
    // Cette fonction statique est appelée par :
    //   - RocketAI.buildState() (inférence en jeu)
    //   - TrainingOrchestrator.buildAIState() (apprentissage / évaluation)
    //   - train.js (diagnostics)
    // Le vecteur est CONSCIENT DE LA CIBLE (target) : pour 'navigate' on passe le point B,
    // sinon on passe la position du corps céleste de référence. Les dimensions et les
    // échelles sont IDENTIQUES quel que soit l'appelant, garantissant la cohérence
    // entre entraînement et inférence (10 dims = inputShape du DQN).
    //
    // @param {object} p - { x, y, vx, vy, angle, angularVelocity, targetX, targetY }
    // @return {number[]} Vecteur d'état de dimension RocketAI.STATE_SIZE (10)
    static buildStateVector(p) {
        const STATE_SIZE = RocketAI.STATE_SIZE;
        if (!p) return Array(STATE_SIZE).fill(0);

        // Échelles de normalisation (cohérentes pour tous les appelants)
        const POSITION_SCALE = 150000;     // ~150k unités (couvre la diagonale A-B ~127k sans saturer)
        const VELOCITY_SCALE = 1000;       // 1000 unités/s
        const ANGULAR_VEL_SCALE = 10;      // ±10 rad/s
        const DISTANCE_SCALE = 150000;     // même échelle que POSITION_SCALE (distance non saturée)

        // Sécurisation des entrées
        const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
        const x = num(p.x);
        const y = num(p.y);
        // Le modèle stocke la vélocité en échelle Matter (≈ u/s × 1000/60). On la ramène en u/s
        // (cohérent avec VELOCITY_SCALE) pour ne plus saturer : auparavant clampée à ±2000 puis
        // /1000 -> toujours ±2, le réseau ne "voyait" jamais la magnitude de vitesse réelle.
        const VK = (typeof PHYSICS !== 'undefined' && PHYSICS.MATTER_BASE_DELTA) ? PHYSICS.MATTER_BASE_DELTA : (1000 / 60);
        const vx = Math.max(-3000, Math.min(3000, num(p.vx) / VK));
        const vy = Math.max(-3000, Math.min(3000, num(p.vy) / VK));
        const angle = num(p.angle);
        const angularVelocity = Math.max(-50, Math.min(50, num(p.angularVelocity)));
        const targetX = num(p.targetX);
        const targetY = num(p.targetY);

        // Vecteur vers la cible
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Direction vers la cible (normalisée) - sûre si distance nulle
        const dirX = distance > 0 ? dx / distance : 0;
        const dirY = distance > 0 ? dy / distance : 0;

        // Cap de la fusée (heading) et alignement avec la direction vers la cible
        const headX = Math.cos(angle);
        const headY = Math.sin(angle);
        const headingAlignment = (distance > 0) ? (headX * dirX + headY * dirY) : 0; // [-1, 1]

        // Vitesse radiale vers la cible (positif = rapprochement)
        const radialVelocity = vx * dirX + vy * dirY;

        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        const state = [
            clamp(dx / POSITION_SCALE, -10, 10),                 // 0: dx vers cible
            clamp(dy / POSITION_SCALE, -10, 10),                 // 1: dy vers cible
            clamp(vx / VELOCITY_SCALE, -2, 2),                   // 2: vitesse X
            clamp(vy / VELOCITY_SCALE, -2, 2),                   // 3: vitesse Y
            Math.sin(angle),                                      // 4: orientation (sin) [-1, 1]
            Math.cos(angle),                                      // 5: orientation (cos) [-1, 1]
            clamp(angularVelocity / ANGULAR_VEL_SCALE, -5, 5),   // 6: vitesse angulaire
            clamp(distance / DISTANCE_SCALE, 0, 10),             // 7: distance à la cible (non saturée)
            clamp(radialVelocity / VELOCITY_SCALE, -2, 2),       // 8: vitesse radiale vers cible
            clamp(headingAlignment, -1, 1)                       // 9: alignement du cap vers la cible
        ];

        // Validation finale (toute valeur aberrante => état neutre)
        for (let i = 0; i < state.length; i++) {
            if (!isFinite(state[i]) || Math.abs(state[i]) > 10) {
                return Array(STATE_SIZE).fill(0);
            }
        }

        return state;
    }

    // Construire le vecteur d'état à partir des données de la fusée (inférence en jeu)
    // CORRECTION (bug #4) : délègue à la source de vérité unique RocketAI.buildStateVector.
    buildState() {
        if (!this.rocketData || !this.celestialBodyData) {
            return Array(RocketAI.STATE_SIZE).fill(0);
        }

        // Cible : en navigation on viserait le point B ; en jeu (orbite/atterrissage),
        // la cible de référence est le corps céleste courant.
        const targetX = (typeof this.rocketData.targetX === 'number')
            ? this.rocketData.targetX : this.celestialBodyData.x;
        const targetY = (typeof this.rocketData.targetY === 'number')
            ? this.rocketData.targetY : this.celestialBodyData.y;

        return RocketAI.buildStateVector({
            x: this.rocketData.x,
            y: this.rocketData.y,
            vx: this.rocketData.vx,
            vy: this.rocketData.vy,
            angle: this.rocketData.angle,
            angularVelocity: this.rocketData.angularVelocity,
            targetX,
            targetY
        });
    }
    
    // Choisir une action en fonction de l'état courant
    act(state) {
        // Vérifier que le modèle existe, n'est pas dispose et est prêt
        if (!this.model || this.isDisposed || !this.modelReady) {
            // Action aléatoire si pas de modèle, modèle dispose ou pas encore prêt
            return Math.floor(Math.random() * this.actions.length);
        }
        
        // Stratégie epsilon-greedy
        if (Math.random() < this.config.epsilon) {
            // Exploration: action aléatoire
            return Math.floor(Math.random() * this.actions.length);
        } else {
            // Exploitation: meilleure action selon le modèle
            try {
                return tf.tidy(() => {
                    const stateTensor = tf.tensor2d([state], [1, RocketAI.STATE_SIZE]);
                    const prediction = this.model.predict(stateTensor);
                    return prediction.argMax(1).dataSync()[0];
                });
            } catch (error) {
                return Math.floor(Math.random() * this.actions.length);
            }
        }
    }
    
    // Calculer la récompense en fonction de l'état actuel
    calculateReward() {
        // CORRECTION (bug #9) : cette fonction implémente une récompense ORBITE codée en dur.
        // Elle n'est utilisée qu'en mode jeu (step()). Pour ne pas tromper l'agent lorsqu'un
        // autre objectif est actif (ex: 'navigate'), on ne l'applique QUE si currentObjective
        // est 'orbit'. Pour les autres objectifs, l'entraînement réel passe par
        // HeadlessRocketEnvironment.calculateReward (récompense spécifique à l'objectif),
        // donc ici on renvoie une récompense neutre.
        if (this.currentObjective !== 'orbit') {
            return 0;
        }

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
        if (!this.isActive || !this.isTraining || this.isDisposed) return;
        
        // Si nous avons un état et une action précédents, ajouter une expérience terminale
        if (this.lastState !== null && this.lastAction !== null) {
            // Forte pénalité pour un crash
            this.replayBuffer.push({
                state: this.lastState,
                action: this.lastAction,
                reward: -100,
                nextState: Array(RocketAI.STATE_SIZE).fill(0),  // État terminal
                done: true
            });
            
            // Entraîner immédiatement (ignorer silencieusement si disposed)
            if (this.replayBuffer.length >= this.config.batchSize && !this.isDisposed) {
                this.train().catch(() => {});
            }
        }
        
        // Réinitialiser l'état
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        
        // NOTE: la décroissance d'epsilon est gérée UNE seule fois par épisode par
        // TrainingOrchestrator (couvre crash/succès/timeout). Ne pas la dupliquer ici
        // (sinon double décroissance par épisode -> exploration coupée trop tôt).
    }
    
    // Gestion d'un succès
    handleSuccess() {
        if (!this.isActive || !this.isTraining || this.isDisposed) return;
        
        // Si nous avons un état et une action précédents, ajouter une expérience terminale
        if (this.lastState !== null && this.lastAction !== null) {
            // Forte récompense pour un succès
            this.replayBuffer.push({
                state: this.lastState,
                action: this.lastAction,
                reward: 100,
                nextState: Array(RocketAI.STATE_SIZE).fill(0),  // État terminal
                done: true
            });
            
            // Entraîner immédiatement (ignorer silencieusement si disposed)
            if (this.replayBuffer.length >= this.config.batchSize && !this.isDisposed) {
                this.train().catch(() => {});
            }
        }
        
        // Réinitialiser l'état
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
        
        // NOTE: la décroissance d'epsilon est gérée UNE seule fois par épisode par
        // TrainingOrchestrator (couvre crash/succès/timeout). Ne pas la dupliquer ici
        // (sinon double décroissance par épisode -> exploration coupée trop tôt).
    }
    
    // Entraîner le modèle avec un batch du replay buffer
    async train() {
        const startTime = Date.now();
        this.concurrencyMetrics.totalTrainingCalls++;
        
        // Vérifier que les modèles existent, ne sont pas disposés et sont prêts
        if (!this.model || !this.targetModel || this.isDisposed || !this.modelReady) {
            this._diagTrain('guard', `model=${!!this.model} targetModel=${!!this.targetModel} disposed=${this.isDisposed} ready=${this.modelReady}`);
            return;
        }
        
        if (this.replayBuffer.length < this.config.batchSize) {
            this._diagTrain('buffer', `replayBuffer=${this.replayBuffer.length} < batchSize=${this.config.batchSize} (jamais assez d'expériences)`);
            return;
        }

        // Éviter les appels concurrents
        if (this.isTrainingInProgress) {
            this.concurrencyMetrics.blockedCalls++;
            this._diagTrain('inprogress', `appel réentrant bloqué (blockedCalls=${this.concurrencyMetrics.blockedCalls}) — un fit() précédent ne se termine pas ?`);
            return;
        }
        
        this.isTrainingInProgress = true;
        
        // Variables pour le finally
        let xs = null;
        let ys = null;
        let qValues = null;
        let nextQValues = null;
        
        try {
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
            const STATE_SIZE = RocketAI.STATE_SIZE;
            const states = batch.map(exp => {
                if (!Array.isArray(exp.state) || exp.state.length !== STATE_SIZE) {
                    return Array(STATE_SIZE).fill(0);
                }
                return exp.state.map(val => (typeof val !== 'number' || !isFinite(val)) ? 0 : val);
            });

            const nextStates = batch.map(exp => {
                if (!Array.isArray(exp.nextState) || exp.nextState.length !== STATE_SIZE) {
                    return Array(STATE_SIZE).fill(0);
                }
                return exp.nextState.map(val => (typeof val !== 'number' || !isFinite(val)) ? 0 : val);
            });
            
            // Vérifications de validité
            if (states.length !== this.config.batchSize || nextStates.length !== this.config.batchSize) {
                this._diagTrain('shape-len', `states=${states.length} next=${nextStates.length} batchSize=${this.config.batchSize}`);
                return;
            }
            
            const totalStateValues = states.reduce((sum, state) => sum + state.length, 0);
            const totalNextStateValues = nextStates.reduce((sum, state) => sum + state.length, 0);
            
            if (totalStateValues !== this.config.batchSize * STATE_SIZE || totalNextStateValues !== this.config.batchSize * STATE_SIZE) {
                this._diagTrain('shape-tot', `tot=${totalStateValues}/${totalNextStateValues} attendu=${this.config.batchSize * STATE_SIZE}`);
                return;
            }
            
            // PROTECTION CRITIQUE : Vérifier à nouveau avant les opérations TensorFlow
            if (this.isDisposed || !this.model || !this.targetModel) {
                this._diagTrain('disp-pre', `disposed=${this.isDisposed} model=${!!this.model} target=${!!this.targetModel}`);
                return;
            }
            
            // Prédire les valeurs Q pour les états actuels et futurs
            // Utiliser des références locales pour éviter les race conditions
            const localModel = this.model;
            const localTargetModel = this.targetModel;
            
            qValues = tf.tidy(() => localModel.predict(tf.tensor2d(states, [this.config.batchSize, STATE_SIZE])));
            
            // Vérifier après la première opération
            if (this.isDisposed) {
                if (qValues) { try { qValues.dispose(); } catch (e) {} }
                this._diagTrain('disp-post', 'isDisposed juste après predict');
                return;
            }
            
            nextQValues = tf.tidy(() => localTargetModel.predict(tf.tensor2d(nextStates, [this.config.batchSize, STATE_SIZE])));
            
            // Extraire les valeurs dans JavaScript
            const qValuesData = qValues.arraySync();
            const nextQValuesData = nextQValues.arraySync();
            
            // Libérer immédiatement les tenseurs de prédiction
            qValues.dispose();
            qValues = null;
            nextQValues.dispose();
            nextQValues = null;
            
            // Créer les cibles Q
            const qTargets = qValuesData.map(qRow => [...qRow]);
            
            // Mettre à jour les valeurs Q pour les actions prises
            for (let i = 0; i < this.config.batchSize; i++) {
                const experience = batch[i];
                if (experience.done) {
                    qTargets[i][experience.action] = experience.reward;
                } else {
                    const maxNextQ = Math.max(...nextQValuesData[i]);
                    qTargets[i][experience.action] = experience.reward + this.config.gamma * maxNextQ;
                }
            }
            
            // PROTECTION CRITIQUE : Vérifier avant l'entraînement
            if (this.isDisposed || !this.model) {
                this._diagTrain('disp-fit', `disposed=${this.isDisposed} model=${!!this.model}`);
                return;
            }
            
            // Créer les tenseurs d'entraînement
            xs = tf.tensor2d(states, [this.config.batchSize, STATE_SIZE]);
            ys = tf.tensor2d(qTargets, [this.config.batchSize, this.actions.length]);
            
            // Entraîner le modèle avec la référence locale
            this._diagTrain('fit-start', `appel model.fit (batch=${this.config.batchSize}) — si aucun 'ok' ne suit, fit() ne revient jamais (backend bloqué)`);
            const history = await localModel.fit(xs, ys, {
                epochs: 1,
                verbose: 0
            });
            
            // Vérifier si dispose pendant l'entraînement
            if (this.isDisposed) {
                return;
            }
            
            // Capturer le loss pour monitoring
            const currentLoss = history.history.loss[0];
            
            // Mettre à jour les métriques de succès
            this.concurrencyMetrics.successfulTrainings++;
            this.concurrencyMetrics.lastLoss = currentLoss;
            
            const trainingDuration = Date.now() - startTime;
            this.concurrencyMetrics.lastTrainingTime = trainingDuration;
            this.concurrencyMetrics.averageTrainingDuration = 
                (this.concurrencyMetrics.averageTrainingDuration * (this.concurrencyMetrics.successfulTrainings - 1) + trainingDuration) / 
                this.concurrencyMetrics.successfulTrainings;
            this._diagTrain('ok', `apprentissage OK — successfulTrainings=${this.concurrencyMetrics.successfulTrainings}, loss=${(typeof currentLoss === 'number') ? currentLoss.toFixed(5) : currentLoss}`);

        } catch (error) {
            // Surfacer les VRAIES erreurs d'entraînement (throttlé) — ne JAMAIS les ré-avaler en
            // silence (ce silence avait masqué le bug "kernel is already disposed"). Les erreurs
            // "dispose" attendues lors d'un teardown restent silencieuses.
            const _msg = (error && error.message) ? error.message : String(error);
            if (!/dispos/i.test(_msg)) {
                const _now = Date.now();
                if (!this._lastFitErrLog || _now - this._lastFitErrLog > 2000) {
                    this._lastFitErrLog = _now;
                    try { console.warn('[RocketAI.train] erreur model.fit :', _msg); } catch (e) {}
                }
            }
        } finally {
            // Libérer la mémoire tensor (si les tenseurs existent)
            if (xs) { try { xs.dispose(); } catch (e) {} }
            if (ys) { try { ys.dispose(); } catch (e) {} }
            if (qValues) { try { qValues.dispose(); } catch (e) {} }
            if (nextQValues) { try { nextQValues.dispose(); } catch (e) {} }
            
            // Toujours libérer le flag de concurrence
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
     */
    monitorMemory() {
        // Monitoring silencieux - on peut ajouter des actions correctives si nécessaire
    }
    
    /**
     * Nettoie les ressources TensorFlow.js pour éviter les fuites mémoire.
     * Doit être appelé lors de la destruction de l'agent.
     * IMPORTANT: Cette méthode est synchrone mais marque l'agent comme disposé
     * immédiatement pour que les opérations async en cours s'arrêtent proprement.
     */
    cleanup() {
        // Éviter les doubles cleanup
        if (this.isDisposed) {
            return;
        }
        
        // CRITIQUE: Marquer comme disposé EN PREMIER pour que toutes les opérations
        // async vérifient ce flag et s'arrêtent proprement
        this.isDisposed = true;
        
        // Désactiver immédiatement pour éviter de nouvelles opérations
        this.isActive = false;
        this.isTraining = false;
        
        // Désabonner les événements stockés localement
        if (this._eventUnsubscribers && this._eventUnsubscribers.length > 0) {
            for (const unsub of this._eventUnsubscribers) {
                try {
                    if (typeof unsub === 'function') {
                        unsub();
                    }
                } catch (e) { /* ignore */ }
            }
            this._eventUnsubscribers = [];
        }
        
        // Note: On ne peut pas attendre isTrainingInProgress de façon synchrone,
        // mais on a marqué isDisposed=true, donc train() va s'arrêter proprement.
        // Utiliser un petit délai via setTimeout pour laisser le temps aux opérations
        // en cours de voir le flag isDisposed avant de disposer les modèles.
        const disposeModels = () => {
            try {
                if (this.model) {
                    this.model.dispose();
                    this.model = null;
                }
            } catch (error) {
                // Ignorer si déjà dispose
            }
            
            try {
                if (this.targetModel) {
                    this.targetModel.dispose();
                    this.targetModel = null;
                }
            } catch (error) {
                // Ignorer si déjà dispose
            }
            
            this.replayBuffer = [];
            this.isTrainingInProgress = false;
        };
        
        // Si un entraînement est en cours, attendre un peu avant de disposer
        if (this.isTrainingInProgress) {
            setTimeout(disposeModels, 200);
        } else {
            disposeModels();
        }
    }
    
    // Sauvegarder le modèle
    async saveModel() {
        // Vérifier que le modèle existe et n'est pas disposé avant de sauvegarder
        if (!this.model || this.isDisposed) {
            // Ne pas logger si c'est un cas attendu (dispose)
            return false;
        }
        
        try {
            await this.model.save('localstorage://rocket-ai-model');
            return true;
        } catch (error) {
            // Ignorer silencieusement
            return false;
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
    
    // Diagnostic verbeux de train() (guard/buffer/fit-start/ok/…). Silencieux par défaut,
    // activable via window.DEBUG_AI = true. Throttlé à 1 log / 2 s par catégorie.
    _diagTrain(tag, msg) {
        if (!(typeof window !== 'undefined' && window.DEBUG_AI)) return;
        const now = Date.now();
        if (!this._trainDiag) this._trainDiag = {};
        if (now - (this._trainDiag[tag] || 0) > 2000) {
            this._trainDiag[tag] = now;
            try { console.warn('[RocketAI.train] ' + tag + ' : ' + msg); } catch (e) {}
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
     * Attendre que le modèle soit initialisé et prêt
     * @returns {Promise} Résolu quand le modèle est prêt
     */
    async waitForReady() {
        if (this.modelReady) return;
        
        // Attendre jusqu'à 10 secondes que le modèle soit prêt
        const maxWait = 10000;
        const checkInterval = 100;
        let waited = 0;
        
        while (!this.modelReady && waited < maxWait) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        if (!this.modelReady) {
            throw new Error('[RocketAI] Timeout en attendant l\'initialisation du modèle');
        }
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