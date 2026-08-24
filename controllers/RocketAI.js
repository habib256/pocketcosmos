// TensorFlow.js est chargé globalement via le script dans index.html

class RocketAI {
    // CORRECTION (bug #4) : dimension unique du vecteur d'état, partagée par le builder
    // (buildStateVector), la construction du modèle (inputShape) et le replay buffer.
    // La valeur vit dans AI_TRAINING.STATE (constants.js), source unique des échelles.
    static get STATE_SIZE() {
        return (typeof AI_TRAINING !== 'undefined' && AI_TRAINING.STATE) ? AI_TRAINING.STATE.STATE_SIZE : 12;
    }

    // TABLE D'ACTIONS CANONIQUE (source unique, partagée jeu <-> entraînement).
    // L'index dans ACTION_NAMES est l'index de sortie du DQN ; ACTION_THRUSTERS donne, pour
    // CHAQUE action, l'état COMPLET des quatre propulseurs (ratio de puissance 0..1 appliqué à
    // ROCKET.THRUSTER_POWER.*). Toute action spécifie les quatre propulseurs :
    //
    //   idx | action         | main | rear | left | right
    //   ----+----------------+------+------+------+------
    //    0  | thrustForward  |  1   |  0   |  0   |  0
    //    1  | thrustBackward |  0   |  1   |  0   |  0
    //    2  | rotateLeft     |  0   |  0   |  1   |  0
    //    3  | rotateRight    |  0   |  0   |  0   |  1
    //    4  | noAction       |  0   |  0   |  0   |  0
    //
    // CORRECTION (divergence entraînement/jeu) : auparavant l'entraînement
    // (TrainingOrchestrator.convertActionIndexToEnvironmentAction) n'envoyait qu'un sous-ensemble
    // de propulseurs et HeadlessRocketEnvironment.step() ne touchait QUE ceux présents dans
    // l'action -> le propulseur arrière restait bloqué à MAX jusqu'à la fin de l'épisode après un
    // seul 'thrustBackward' (espace d'action corrompu), 'noAction' ne coupait pas l'arrière et
    // 'rotate' coupait le principal en entraînement mais pas en jeu. Les deux chemins lisent
    // désormais cette table.
    static get ACTION_NAMES() {
        return ['thrustForward', 'thrustBackward', 'rotateLeft', 'rotateRight', 'noAction'];
    }

    static get ACTION_THRUSTERS() {
        return {
            thrustForward:  { main: 1, rear: 0, left: 0, right: 0 },
            thrustBackward: { main: 0, rear: 1, left: 0, right: 0 },
            rotateLeft:     { main: 0, rear: 0, left: 1, right: 0 },
            rotateRight:    { main: 0, rear: 0, left: 0, right: 1 },
            noAction:       { main: 0, rear: 0, left: 0, right: 0 }
        };
    }

    // Clés de stockage du modèle + version d'échelle des features (cf. loadModel/saveModel).
    static get MODEL_STORAGE_KEY() { return 'rocket-ai-model'; }
    static get MODEL_META_KEY() { return 'rocket-ai-model-meta'; }
    // ⚠️ À INCRÉMENTER à chaque changement de normalisation du vecteur d'état : les poids
    // sauvegardés deviennent silencieusement invalides. Version 2 = VELOCITY_SCALE passée de
    // 1000 à 5000 dans buildStateVector (les modèles d'avant ce changement sont périmés).
    // v3 : recalibrage de la feature de vitesse angulaire (plage observable portée de ±50 à
    // ±CRASH_ANGULAR_VELOCITY). Tout modèle sauvegardé avec une version antérieure a été entraîné
    // sur une normalisation différente et est refusé au chargement.
    // v4 : échelle positionnelle (features 0/1/7/8) devenue DÉPENDANTE DE LA TÂCHE via
    // `positionScale` (cf. buildStateVector / positionScaleForBody) — un modèle entraîné avec
    // l'échelle fixe de 150000 voit des entrées ~200× différentes sur orbit/land.
    static get STATE_SCALE_VERSION() { return 4; }

    // Échelle positionnelle par défaut (objectifs longue distance type 'navigate' : la diagonale
    // A→B fait ~127k unités). Utilisée quand l'appelant ne fournit pas de `positionScale`.
    static get DEFAULT_POSITION_SCALE() { return 150000; }

    /**
     * Échelle positionnelle adaptée à un objectif « autour d'un corps céleste » (orbit, land,
     * crash_moon, explore) : rayon du corps + altitude orbitale maximale, soit la plage réellement
     * parcourue par la fusée. Les features de position/distance couvrent alors [0, ~1] au lieu de
     * [0,005 ; 0,015] avec l'échelle « navigate » de 150000.
     * @param {number} radius - Rayon du corps de référence.
     * @return {number} Échelle strictement positive.
     */
    static positionScaleForBody(radius) {
        const r = (typeof radius === 'number' && isFinite(radius) && radius > 0) ? radius : 0;
        const maxAltitude = (typeof AI_TRAINING !== 'undefined' && AI_TRAINING.ORBIT &&
                             typeof AI_TRAINING.ORBIT.MAX_ALTITUDE === 'number')
            ? AI_TRAINING.ORBIT.MAX_ALTITUDE
            : 1500;
        return Math.max(1, r + maxAltitude);
    }

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

        // Nom du modèle courant dans le model zoo (AIModelStore). Utilisé par la
        // sauvegarde automatique et comme défaut de saveModel()/loadModel().
        this.modelName = 'default';

        // Un modèle entraîné a-t-il été explicitement chargé ? Tant que non, le pilotage en
        // jeu utilise l'heuristique maintainOrbit (le réseau à poids aléatoires ne pilote pas).
        // Après loadModel(), l'inférence réseau prend le relais (posture PNJ).
        this._modelLoaded = false;

        // Générateur aléatoire injectable (reproductibilité). Défaut : Math.random.
        // TrainingOrchestrator injecte un RNG seedé quand config.seed est défini.
        this.rng = Math.random;
        
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
            targetUpdateFrequency: 500, // Synchronisation du target network (DQN), comptée en MISES À JOUR train() réussies (pas en pas de simulation) : c'est le seul compteur partagé par le chemin orchestré et le chemin en jeu.
            saveFrequency: 5000       // Fréquence de sauvegarde
        };
        
        // Actions possibles (ordre = index de sortie du DQN, cf. RocketAI.ACTION_NAMES)
        this.actions = RocketAI.ACTION_NAMES.slice();
        
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
        // Compteur de mises à jour train() réussies : pilote la synchro du target network.
        // Unique point de synchro (chemin orchestré ET chemin en jeu passent tous deux par train()).
        this.trainUpdateCounter = 0;
        // Quand un TrainingOrchestrator pilote l'agent, c'est LUI qui décrémente epsilon une fois
        // par épisode (il couvre aussi les fins par timeout). Ce flag évite la double décroissance.
        this.epsilonDecayManagedExternally = false;
        
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
            // CORRECTION : ne plus avaler l'erreur en silence — une désynchronisation du target
            // network (ex: architectures incompatibles après un loadModel) rendait l'apprentissage
            // muet et indébogable. Throttlé à 1 log / 2 s.
            const _now = Date.now();
            if (!this._lastTargetSyncErrLog || _now - this._lastTargetSyncErrLog > 2000) {
                this._lastTargetSyncErrLog = _now;
                const _msg = (error && error.message) ? error.message : String(error);
                try { console.warn('[RocketAI.updateTargetModel] synchronisation du target network impossible :', _msg); } catch (e) {}
            }
        }
    }
    
    // S'abonner aux événements pertinents
    subscribeToEvents() {
        // Helper pour tracker les souscriptions.
        // CORRECTION (fuite d'abonnements) : l'agent conserve TOUJOURS ses propres unsubscribe.
        // Avant, dès qu'un window.controllerContainer existait (c'est le cas de
        // training-interface.html), _eventUnsubscribers restait vide et cleanup() ne désabonnait
        // rien : chaque startTraining() créait un nouvel agent en laissant les agents disposés
        // abonnés (dont à UNIVERSE.STATE_UPDATED, qui maintenait leurs références vivantes).
        // Le tracking dans le container reste fait en plus (filet de sécurité au teardown global) ;
        // les unsubscribe sont idempotents (double appel sans effet).
        const trackSub = (unsub) => {
            if (typeof unsub !== 'function') return;
            if (!this._eventUnsubscribers) {
                this._eventUnsubscribers = [];
            }
            this._eventUnsubscribers.push(unsub);
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(unsub);
            }
        };
        
        // Vérifier que eventBus et EVENTS existent
        if (!this.eventBus || !window.EVENTS) {
            return;
        }
        
        // NOTE: ROCKET.STATE_UPDATED n'est JAMAIS émis -> l'ancien abonnement qui pilotait
        // updateRocketData() ne se déclenchait jamais (IA inerte en jeu). Le pilotage en jeu
        // passe désormais par update(deltaTime), appelé chaque frame par GameController quand
        // this.isActive. updateRocketData() reste utilisable (appelée depuis update()).
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
        } else {
            // CORRECTION : à la désactivation, remettre TOUS les propulseurs à zéro. emitControl()
            // sort immédiatement quand isActive est faux, donc plus rien n'aurait coupé la dernière
            // commande de l'IA : le joueur récupérait une fusée poussant/tournant toute seule.
            this._emitAllThrustersOff();
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

        // En jeu, RocketAI fait UNIQUEMENT de l'inférence (posture PNJ) : il n'apprend jamais
        // en direct. L'apprentissage se fait exclusivement dans HeadlessRocketEnvironment via
        // TrainingOrchestrator, avec la récompense unique de l'environnement. On délègue donc
        // toujours à la politique gloutonne du réseau (buildState -> act -> emitControl).
        if (this.isActive && this.rocketData) {
            this.makeDecision();
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
    
    // NOTE: l'ancienne méthode step() (boucle d'apprentissage par renforcement EN JEU) et
    // calculateReward() (récompense d'orbite codée en dur, divergente de celle de
    // l'environnement) ont été SUPPRIMÉES. L'IA en jeu est désormais en inférence pure
    // (posture PNJ). L'apprentissage se fait exclusivement dans HeadlessRocketEnvironment
    // via TrainingOrchestrator, avec la récompense UNIQUE de l'environnement (plus de double
    // définition de récompense). Voir CHANGELOG (phase 2).

    // CORRECTION (bug #4 - état incohérent training/inférence) :
    // SOURCE DE VÉRITÉ UNIQUE pour la construction du vecteur d'état (12 dimensions,
    // STATE_VERSION 2 — dimensions et échelles dans AI_TRAINING.STATE).
    // Cette fonction statique est appelée par :
    //   - RocketAI.buildState() (inférence en jeu)
    //   - TrainingOrchestrator.buildAIState() (apprentissage / évaluation)
    //   - train.js (diagnostics)
    // Le vecteur est CONSCIENT DE LA CIBLE (target) : pour 'navigate' on passe le point B,
    // sinon on passe la position du corps céleste de référence. Les dimensions et les
    // échelles sont IDENTIQUES quel que soit l'appelant, garantissant la cohérence
    // entre entraînement et inférence (12 dims = inputShape du DQN).
    //
    // CONVENTION D'UNITÉS : p.vx/p.vy sont en échelle Matter (≈ u/s × 1000/60, tels que
    // stockés dans rocketModel.velocity) ; p.targetVx/p.targetVy sont en u/s (vélocités
    // cinématiques des corps/points cibles, déjà en u/s dans les modèles). Les dims 10-11
    // encodent la vitesse PROPRE de la cible : exactement 0 pour une cible fixe (point B,
    // corps immobile), donc sans effet sur l'entraînement navigate actuel, mais prêtes pour
    // les cibles mobiles (intercept/escorte) sans nouvelle rupture de compatibilité.
    //
    // @param {object} p - { x, y, vx, vy, angle, angularVelocity, targetX, targetY,
    //                       targetVx?, targetVy? }
    // @return {number[]} Vecteur d'état de dimension RocketAI.STATE_SIZE (12)
    static buildStateVector(p) {
        const STATE_SIZE = RocketAI.STATE_SIZE;
        if (!p) return Array(STATE_SIZE).fill(0);

        // Échelles de normalisation — source unique AI_TRAINING.STATE (constants.js)
        const S = (typeof AI_TRAINING !== 'undefined' && AI_TRAINING.STATE) ? AI_TRAINING.STATE : {};
        const POSITION_SCALE = S.POSITION_SCALE || 150000;
        const VELOCITY_SCALE = S.VELOCITY_SCALE || 2500;
        const VELOCITY_CLAMP = S.VELOCITY_CLAMP || 4;
        const ANGULAR_VEL_SCALE = S.ANGULAR_VEL_SCALE || 80;
        // Pré-clamp de la vitesse angulaire, calibré sur le seuil de crash (même échelle Matter).
        // Défini ici car référencé plus bas : sans lui, buildStateVector lève une ReferenceError
        // à CHAQUE pas de l'IA.
        const ANGULAR_VEL_LIMIT = (typeof PHYSICS !== 'undefined' && PHYSICS.CRASH_ANGULAR_VELOCITY)
            ? PHYSICS.CRASH_ANGULAR_VELOCITY
            : 400;
        const DISTANCE_SCALE = S.DISTANCE_SCALE || 150000;
        const TARGET_VEL_SCALE = S.TARGET_VEL_SCALE || 2500;

        // Sécurisation des entrées
        const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
        const x = num(p.x);
        const y = num(p.y);
        // Le modèle stocke la vélocité en échelle Matter (≈ u/s × 1000/60). On la ramène en u/s
        // via le point de conversion unique (PhysicsVectors.matterToGameVelocity). Le clamp brut
        // couvre VELOCITY_CLAMP × VELOCITY_SCALE (= ±10000 u/s = VELOCITY_MAX) : plus de
        // saturation à la vitesse de croisière (2500 u/s ≈ 1.0 après normalisation).
        const vMaxRaw = VELOCITY_CLAMP * VELOCITY_SCALE;
        const vx = Math.max(-vMaxRaw, Math.min(vMaxRaw, PhysicsVectors.matterToGameVelocity(num(p.vx))));
        const vy = Math.max(-vMaxRaw, Math.min(vMaxRaw, PhysicsVectors.matterToGameVelocity(num(p.vy))));
        const angle = num(p.angle);
        const angularVelocity = Math.max(-ANGULAR_VEL_LIMIT, Math.min(ANGULAR_VEL_LIMIT, num(p.angularVelocity)));
        const targetX = num(p.targetX);
        const targetY = num(p.targetY);
        // Vitesse propre de la cible (u/s, PAS en échelle Matter — cf. convention ci-dessus)
        const targetVx = num(p.targetVx);
        const targetVy = num(p.targetVy);

        // Vecteur vers la cible
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Direction vers la cible (normalisée) - sûre si distance nulle
        const dirX = distance > 0 ? dx / distance : 0;
        const dirY = distance > 0 ? dy / distance : 0;

        // Cap de la fusée (heading) : le nez / l'axe de poussée principale est à (angle - π/2)
        // (cf. ROCKET.THRUSTER_POSITIONS.MAIN et ThrusterPhysics), PAS à `angle`.
        // cos(angle - π/2) = sin(angle) ; sin(angle - π/2) = -cos(angle).
        const headX = Math.sin(angle);
        const headY = -Math.cos(angle);
        const headingAlignment = (distance > 0) ? (headX * dirX + headY * dirY) : 0; // [-1, 1]

        // Vitesse radiale vers la cible (positif = rapprochement)
        const radialVelocity = vx * dirX + vy * dirY;

        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const VC = VELOCITY_CLAMP;

        const state = [
            clamp(dx / POSITION_SCALE, -10, 10),                 // 0: dx vers cible
            clamp(dy / POSITION_SCALE, -10, 10),                 // 1: dy vers cible
            clamp(vx / VELOCITY_SCALE, -VC, VC),                 // 2: vitesse X
            clamp(vy / VELOCITY_SCALE, -VC, VC),                 // 3: vitesse Y
            Math.sin(angle),                                      // 4: orientation (sin) [-1, 1]
            Math.cos(angle),                                      // 5: orientation (cos) [-1, 1]
            clamp(angularVelocity / ANGULAR_VEL_SCALE, -5, 5),   // 6: vitesse angulaire
            clamp(distance / DISTANCE_SCALE, 0, 10),             // 7: distance à la cible (non saturée)
            clamp(radialVelocity / VELOCITY_SCALE, -VC, VC),     // 8: vitesse radiale vers cible
            clamp(headingAlignment, -1, 1),                      // 9: alignement du cap vers la cible
            clamp(targetVx / TARGET_VEL_SCALE, -VC, VC),         // 10: vitesse propre cible X (0 si fixe)
            clamp(targetVy / TARGET_VEL_SCALE, -VC, VC)          // 11: vitesse propre cible Y (0 si fixe)
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

        // Échelle positionnelle adaptée à la tâche (cf. STATE_SCALE_VERSION v4) : en jeu la
        // référence est le corps céleste courant (orbite/atterrissage), sauf si une cible de
        // navigation lointaine est explicitement fournie (rocketData.targetX/Y).
        const positionScale = (typeof this.rocketData.targetX === 'number')
            ? RocketAI.DEFAULT_POSITION_SCALE
            : RocketAI.positionScaleForBody(this.celestialBodyData.radius);

        return RocketAI.buildStateVector({
            x: this.rocketData.x,
            y: this.rocketData.y,
            vx: this.rocketData.vx,
            vy: this.rocketData.vy,
            angle: this.rocketData.angle,
            angularVelocity: this.rocketData.angularVelocity,
            targetX,
            targetY,
            positionScale
        });
    }
    
    // Choisir une action en fonction de l'état courant.
    // Les tirages aléatoires utilisent this.rng (seedable) pour la reproductibilité.
    /**
     * Décroissance d'epsilon (exploration) en fin d'épisode, bornée par `epsilonMin`.
     *
     * RÉTABLIE lors de la fusion : `TrainingOrchestrator` l'appelle à chaque fin d'épisode
     * (`this.rocketAI.decayEpsilon()`). Sans elle, l'appel lève une TypeError et l'agent reste
     * à epsilon = 1.0, c'est-à-dire 100 % d'actions aléatoires pour tout l'entraînement.
     * Le drapeau `epsilonDecayManagedExternally` existe pour éviter une double décroissance si un
     * autre chemin venait à la déclencher aussi.
     */
    decayEpsilon() {
        if (this.isDisposed) return;
        if (this.config.epsilon > this.config.epsilonMin) {
            this.config.epsilon = Math.max(
                this.config.epsilonMin,
                this.config.epsilon * this.config.epsilonDecay
            );
        }
    }

    act(state) {
        // Vérifier que le modèle existe, n'est pas dispose et est prêt
        if (!this.model || this.isDisposed || !this.modelReady) {
            // Action aléatoire si pas de modèle, modèle dispose ou pas encore prêt
            return Math.floor(this.rng() * this.actions.length);
        }

        // Stratégie epsilon-greedy
        // N'explorer (action aléatoire) QUE pendant l'entraînement. En évaluation/inférence
        // (isTraining === false), on force la politique gloutonne pour mesurer la vraie
        // performance et sélectionner les bons poids "best".
        if (this.isTraining && this.rng() < this.config.epsilon) {
            // Exploration: action aléatoire
            return Math.floor(this.rng() * this.actions.length);
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
    
    
    // Gestion d'un crash / d'un succès (en jeu). L'apprentissage in-game ayant été retiré
    // (IA = inférence pure, cf. suppression de step()/calculateReward), ces handlers ne
    // poussent plus d'expériences terminales ni ne déclenchent train() : ils se contentent de
    // réinitialiser l'état d'inférence. L'apprentissage sur les transitions terminales se fait
    // uniquement dans HeadlessRocketEnvironment/TrainingOrchestrator (done propagé par l'env).
    handleCrash() {
        this._resetEpisodeState();
    }

    handleSuccess() {
        this._resetEpisodeState();
    }

    _resetEpisodeState() {
        this.lastState = null;
        this.lastAction = null;
        this.episodeSteps = 0;
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
        let nextQValuesOnline = null; // Double DQN : Q(next) du modèle ONLINE pour l'argmax
        
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
            
            // DOUBLE DQN : l'ACTION du prochain état est choisie par le modèle ONLINE (argmax),
            // mais sa VALEUR est lue sur le modèle TARGET. Cela découple sélection et évaluation
            // et réduit la surestimation systématique du max du DQN standard (qui utilise le même
            // réseau pour les deux). Coût : une prédiction supplémentaire par batch (négligeable
            // devant model.fit).
            nextQValues = tf.tidy(() => localTargetModel.predict(tf.tensor2d(nextStates, [this.config.batchSize, STATE_SIZE])));
            nextQValuesOnline = tf.tidy(() => localModel.predict(tf.tensor2d(nextStates, [this.config.batchSize, STATE_SIZE])));

            // Extraire les valeurs dans JavaScript
            const qValuesData = qValues.arraySync();
            const nextQValuesData = nextQValues.arraySync();          // valeurs (target)
            const nextQValuesOnlineData = nextQValuesOnline.arraySync(); // pour l'argmax (online)

            // Libérer immédiatement les tenseurs de prédiction
            qValues.dispose();
            qValues = null;
            nextQValues.dispose();
            nextQValues = null;
            nextQValuesOnline.dispose();
            nextQValuesOnline = null;

            // Créer les cibles Q
            const qTargets = qValuesData.map(qRow => [...qRow]);

            // Mettre à jour les valeurs Q pour les actions prises
            for (let i = 0; i < this.config.batchSize; i++) {
                const experience = batch[i];
                const isAbsorbing = experience.done && !experience.truncated;
                if (isAbsorbing) {
                    qTargets[i][experience.action] = experience.reward;
                } else {
                    // argmax_a' Q_online(next, a')  →  puis valeur Q_target(next, a*)
                    const online = nextQValuesOnlineData[i];
                    let bestA = 0;
                    for (let a = 1; a < online.length; a++) {
                        if (online[a] > online[bestA]) bestA = a;
                    }
                    const doubleQ = nextQValuesData[i][bestA];
                    qTargets[i][experience.action] = experience.reward + this.config.gamma * doubleQ;
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

            // Synchronisation périodique du target network (DQN). CORRECTION : c'est le SEUL
            // point de synchro. Avant, elle vivait dans step(), jamais appelé par
            // TrainingOrchestrator (qui pilote via act()/train()) -> la cible n'était jamais
            // resynchronisée en entraînement orchestré. Le compteur est incrémenté ici,
            // donc les deux chemins (jeu et orchestré) synchronisent exactement une fois
            // toutes les targetUpdateFrequency mises à jour, sans double synchro.
            this.trainUpdateCounter++;
            if (this.trainUpdateCounter % this.config.targetUpdateFrequency === 0) {
                this.updateTargetModel();
            }
            
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
            if (nextQValuesOnline) { try { nextQValuesOnline.dispose(); } catch (e) {} }
            
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
    
    // Sauvegarder le modèle dans le model zoo (AIModelStore, IndexedDB + registre).
    // @param {string} [name] - Nom dans le zoo (défaut : this.modelName)
    // @param {object} [metadata] - Métadonnées à jour (episodes, bestEvalScore, successRate…)
    async saveModel(name = this.modelName, metadata = {}) {
        // Vérifier que le modèle existe et n'est pas disposé avant de sauvegarder
        if (!this.model || this.isDisposed) {
            // Ne pas logger si c'est un cas attendu (dispose)
            return false;
        }

        try {
            const entry = await AIModelStore.save(this.model, name, {
                objective: this.currentObjective,
                ...metadata
            });
            this.modelName = entry.name;
            if (this.eventBus && window.EVENTS) {
                this.eventBus.emit(window.EVENTS.AI.MODEL_SAVED, { name: entry.name, metadata: entry });
            }
            return true;
        } catch (error) {
            console.warn('[RocketAI] Échec de sauvegarde du modèle :', (error && error.message) || error);
            return false;
        }
    }

    // Charger un modèle du model zoo (IndexedDB, sinon assets/models/<nom>/).
    // La compatibilité (stateVersion/stateSize) est validée par AIModelStore ; un modèle
    // incompatible est refusé. L'ancien scheme v1 (localstorage://rocket-ai-model, 10 dims)
    // est détecté pour avertir qu'il est obsolète, mais jamais chargé.
    async loadModel(name = this.modelName) {
        try {
            const { model, metadata } = await AIModelStore.load(name);
            // Disposer le modèle existant avant de le remplacer pour éviter de fuiter
            // ses variables/tenseurs de poids dans TF.js.
            if (this.model && !this.isDisposed) { try { this.model.dispose(); } catch (e) {} }
            this.model = model;
            this.model.compile({
                optimizer: tf.train.adam(this.config.learningRate),
                loss: 'meanSquaredError'
            });
            if (previousModel && previousModel !== loaded) { try { previousModel.dispose(); } catch (e) {} }

            // 4. Reconstruire le target network : setWeights() échoue si l'ancien target a une
            //    architecture différente, et un target obsolète fausserait toutes les cibles Q.
            try {
                if (this.targetModel) { this.targetModel.dispose(); }
            } catch (e) { /* déjà disposé */ }
            this.targetModel = this.createModel();
            this.updateTargetModel();
            this.modelName = name;
            this._modelLoaded = true; // le réseau entraîné pilote désormais l'inférence en jeu
            if (this.eventBus && window.EVENTS) {
                this.eventBus.emit(window.EVENTS.AI.MODEL_LOADED, { name, metadata });
            }
            return true;
        } catch (error) {
            // Fallback informatif : signaler un éventuel modèle v1 (lecture seule, obsolète).
            try {
                const legacy = await tf.loadLayersModel('localstorage://rocket-ai-model');
                const shape = legacy.inputs[0].shape;
                const inSize = shape[shape.length - 1];
                legacy.dispose();
                console.warn(`[RocketAI] Un modèle v1 (localstorage://rocket-ai-model, ${inSize} dims) existe mais est obsolète depuis STATE_VERSION 2 (${RocketAI.STATE_SIZE} dims). Ré-entraînez puis sauvegardez sous un nom via le model zoo.`);
            } catch (e) { /* pas de modèle v1 */ }
            console.warn('[RocketAI] Chargement du modèle échoué :', (error && error.message) || error);
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
    
    // Prise de décision en jeu (inférence pure — aucun apprentissage).
    // Si un modèle entraîné a été chargé, la politique gloutonne du réseau pilote (posture PNJ).
    // Sinon, repli sur l'heuristique maintainOrbit (le réseau à poids aléatoires ne pilote pas).
    makeDecision() {
        if (this._modelLoaded && this.model && this.modelReady && !this.isDisposed) {
            // act() force le glouton hors entraînement (isTraining === false en jeu).
            const state = this.buildState();
            const actionIndex = this.act(state);
            this.emitControl(this.actions[actionIndex]);
            return;
        }
        // Repli heuristique (aucun modèle chargé)
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

        // Garde anti division-par-zéro : si la fusée coïncide avec le centre du corps
        // (distance ~0), les calculs de vitesse radiale plus bas produiraient des NaN.
        // Ce chemin est désormais atteignable en jeu (update() pilote maintainOrbit).
        if (!isFinite(distance) || distance <= 0) return;

        // Calculer l'angle entre la fusée et le corps céleste
        const angleToBody = Math.atan2(dy, dx);

        // Direction tangente à l'orbite (perpendiculaire à angleToBody)
        const tangentAngle = angleToBody + Math.PI / 2;

        // CORRECTION (convention d'angle) : le nez / l'axe de poussée principale est à
        // (angle - π/2) (cf. ROCKET.THRUSTER_POSITIONS.MAIN et ThrusterPhysics), PAS à `angle`.
        // Pour que le NEZ pointe le long de la tangente il faut donc viser
        // angle = tangentAngle + π/2 (même convention que buildStateVector).
        const targetRocketAngle = tangentAngle + Math.PI / 2;

        // Calculer l'angle actuel de la fusée
        const rocketAngle = this.rocketData.angle;

        // Calculer la différence d'angle (normaliser entre -PI et PI)
        let angleDiff = (targetRocketAngle - rocketAngle) % (2 * Math.PI);
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
            
            // CORRECTION (unités) : rocketData.vx/vy arrivent en échelle Matter
            // (≈ u/s × MATTER_BASE_DELTA, cf. PHYSICS.md §1) car update() les passe BRUTS pour
            // rester en parité avec l'entraînement. Or les seuils comparés ci-dessous
            // (thresholds.velocity, sqrt(G·M/d)) sont en unités/seconde : sans conversion la
            // comparaison était fausse d'un facteur ~16,67.
            const VK = (typeof PHYSICS !== 'undefined' && PHYSICS.MATTER_BASE_DELTA) ? PHYSICS.MATTER_BASE_DELTA : (1000 / 60);
            const vxUnits = (this.rocketData.vx || 0) / VK;   // u/s
            const vyUnits = (this.rocketData.vy || 0) / VK;   // u/s

            // Calculer la vitesse radiale (vers/depuis le corps céleste), en u/s
            const radialVelocity = (vxUnits * dx / distance) + (vyUnits * dy / distance);

            // Appliquer la propulsion appropriée
            if (distanceDiff < -50 || (distanceDiff < 0 && radialVelocity < -this.thresholds.velocity)) {
                // Trop proche ou approche trop rapidement, s'éloigner
                this.emitControl('thrustForward');
            } else if (distanceDiff > 50 || (distanceDiff > 0 && radialVelocity > this.thresholds.velocity)) {
                // Trop loin ou s'éloigne trop rapidement, se rapprocher
                this.emitControl('thrustBackward');
            } else {
                // Distance orbitale correcte, maintenir la trajectoire tangentielle
                // u/s (même conversion que radialVelocity ci-dessus)
                const tangentialSpeed = Math.abs((vxUnits * -dy / distance) + (vyUnits * dx / distance));

                if (tangentialSpeed < Math.sqrt(PHYSICS.G * this.celestialBodyData.mass / distance) * 0.9) {
                    // Vitesse orbitale trop faible, accélérer
                    this.emitControl('thrustForward');
                }
            }
        }
    }
    
    // Émettre une commande de contrôle mappée vers des événements sémantiques.
    // Applique la TABLE D'ACTIONS CANONIQUE (RocketAI.ACTION_THRUSTERS) : chaque action fixe
    // EXPLICITEMENT les quatre propulseurs, exactement comme le fait l'entraînement headless
    // (TrainingOrchestrator.convertActionIndexToEnvironmentAction) -> aucune divergence de
    // sémantique entre le jeu et l'apprentissage, aucun propulseur qui reste "collé".
    emitControl(action) {
        if (!this.isActive || !this.eventBus || !window.EVENTS) return;

        const ratios = RocketAI.ACTION_THRUSTERS[action] || RocketAI.ACTION_THRUSTERS.noAction;
        const maxPower = ROCKET.THRUSTER_POWER;

        // Utiliser SET_THRUSTER_POWER (idempotent) plutôt que START/STOP.
        this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'main', power: ratios.main * maxPower.MAIN });
        this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'rear', power: ratios.rear * maxPower.REAR });
        this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: ratios.left * maxPower.LEFT });
        this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: ratios.right * maxPower.RIGHT });

        // Événement d'audit/débogage
        this.eventBus.emit(window.EVENTS.AI.CONTROL_ACTION, { action });
    }

    // Coupe les quatre propulseurs SANS passer par la garde `isActive` d'emitControl.
    // Nécessaire à la désactivation de l'IA : sinon la dernière commande émise (ex: propulseur
    // principal à fond) restait appliquée et le joueur reprenait une fusée qui poussait toute seule.
    _emitAllThrustersOff() {
        if (!this.eventBus || !window.EVENTS || !window.EVENTS.ROCKET) return;
        for (const thrusterId of ['main', 'rear', 'left', 'right']) {
            this.eventBus.emit(window.EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId, power: 0 });
        }
    }
    
    // Hook de pilotage en jeu : appelé chaque frame par GameController quand this.isActive.
    // (Auparavant un no-op : l'IA était inerte en jeu car elle attendait ROCKET.STATE_UPDATED,
    //  événement jamais émis.) On construit ici un instantané de l'état réel à partir des
    //  modèles vivants puis on délègue à updateRocketData() -> makeDecision() (inférence ;
    //  step() uniquement si this.isTraining, ce qui n'est pas le cas du pilotage en jeu).
    update(deltaTime) {
        // Sécurité : ne rien faire si inactif ou disposé.
        if (!this.isActive || this.isDisposed) return;

        // checkDependencies() exige rocketModel/universeModel/physicsController/missionManager/
        // rocketController. Le pilotage n'a strictement besoin que de rocketModel + universeModel,
        // mais on respecte le contrat demandé : on ne pilote que si tout est câblé.
        if (!this.checkDependencies()) return;

        const rm = this.rocketModel;
        const pos = rm.position || { x: 0, y: 0 };
        const vel = rm.velocity || { x: 0, y: 0 };

        // PARITÉ D'UNITÉS (critique) : en entraînement, HeadlessRocketEnvironment.getObservation()
        // expose rocketVX/VY = rocketModel.velocity.x/y BRUT (échelle Matter ≈ u/s × MATTER_BASE_DELTA),
        // et c'est RocketAI.buildStateVector qui convertit en u/s (via le point de conversion unique
        // PhysicsVectors.matterToGameVelocity). On reproduit EXACTEMENT ce chemin : on passe ici la
        // vitesse BRUTE (non convertie) pour que buildStateVector applique la même conversion qu'à
        // l'entraînement (sinon double division -> vitesses 16,7× trop petites, état hors-distribution).
        const rocket = {
            x: pos.x,
            y: pos.y,
            vx: vel.x,                      // brut (échelle Matter), comme à l'entraînement
            vy: vel.y,                      // brut (échelle Matter), comme à l'entraînement
            angle: rm.angle,
            angularVelocity: rm.angularVelocity,
            fuel: rm.fuel
        };

        // Corps céleste de référence : le PLUS PROCHE de la fusée, comme la logique de proximité
        // gravitationnelle (UniverseModel.findNearestBody). On aplatit position -> x/y car les
        // consommateurs (buildState/calculateReward/maintainOrbit) attendent celestialBody.x/.y.
        let celestialBody = null;
        if (this.universeModel && typeof this.universeModel.findNearestBody === 'function') {
            const nearest = this.universeModel.findNearestBody(pos);
            const body = nearest && nearest.body;
            if (body && body.position) {
                celestialBody = {
                    x: body.position.x,
                    y: body.position.y,
                    radius: body.radius,
                    mass: body.mass,
                    name: body.name
                };
            }
        }

        // Sans corps de référence, buildState() renverrait un état neutre : inutile de décider.
        if (!celestialBody) return;

        // Cible : si une mission active désigne un corps céleste par son nom (mission.to), viser
        // sa position ; sinon, laisser targetX/targetY indéfinis pour que le fallback existant de
        // buildState (targetX = celestialBody.x) s'applique.
        const missionTarget = this.resolveMissionTarget();
        if (missionTarget) {
            rocket.targetX = missionTarget.x;
            rocket.targetY = missionTarget.y;
        }

        // Un seul chemin de code : updateRocketData() affecte rocketData/celestialBodyData puis
        // appelle makeDecision() (inférence) — ou step() si this.isTraining (entraînement en jeu).
        this.updateRocketData({ rocket, celestialBody });
    }

    // Résout la cible de la mission active (mission.to est un NOM de corps/station) vers une
    // position {x, y} en cherchant le corps céleste correspondant dans l'univers. Renvoie null
    // si aucune mission active, pas de missionManager, ou nom introuvable.
    resolveMissionTarget() {
        if (!this.missionManager || typeof this.missionManager.getCurrentMissionDetails !== 'function') {
            return null;
        }
        const mission = this.missionManager.getCurrentMissionDetails();
        if (!mission || typeof mission.to !== 'string') return null;
        if (!this.universeModel || !Array.isArray(this.universeModel.celestialBodies)) return null;

        const body = this.universeModel.celestialBodies.find(b => b && b.name === mission.to);
        if (body && body.position) {
            return { x: body.position.x, y: body.position.y };
        }
        return null;
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