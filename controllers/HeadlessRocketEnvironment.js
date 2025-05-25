/**
 * @file HeadlessRocketEnvironment.js
 * Implémente un environnement de simulation de fusée sans interface graphique (headless)
 * pour l'entraînement d'agents IA comme RocketAgent.js.
 */

// Dépendances (supposées être disponibles globalement ou via un chargeur de modules si adapté)
// const EventBus = window.EventBus; // Exemple si global
// const RocketModel = window.RocketModel;
// const UniverseModel = window.UniverseModel;
// const MissionManager = window.MissionManager;
// const PhysicsController = window.PhysicsController;
// const RocketController = window.RocketController;
// const ROCKET_CONSTANTS = window.ROCKET; // Accès aux constantes ROCKET
// const PHYSICS_CONSTANTS = window.PHYSICS; // Accès aux constantes PHYSICS
// const EVENT_TYPES = window.EVENTS; // Accès aux types d'événements

class HeadlessRocketEnvironment {
    /**
     * Construit l'environnement de simulation headless.
     * @param {object} [config={}] - Configuration initiale de la simulation.
     * @param {object} [config.rocketInitialState] - État initial de la fusée.
     * @param {object} [config.universeConfig] - Configuration de l'univers.
     * @param {object} [config.missionConfig] - Configuration de la mission.
     * @param {number} [config.maxStepsPerEpisode=10000] - Nombre maximum de pas par épisode.
     * @param {object} [config.constants] - Permet de surcharger les constantes (ROCKET, PHYSICS).
     */
    constructor(config = {}) {
        console.log("HeadlessRocketEnvironment: Initialisation...");

        this.config = config;
        this.maxStepsPerEpisode = config.maxStepsPerEpisode || 10000;
        
        // Utiliser les constantes fournies ou celles globales
        this.ROCKET_CONSTS = (config.constants && config.constants.ROCKET) || ROCKET;
        this.PHYSICS_CONSTS = (config.constants && config.constants.PHYSICS) || PHYSICS;
        this.EVENT_TYPES = (config.constants && config.constants.EVENTS) || EVENTS;

        // EventBus peut être partagé ou une nouvelle instance
        this.eventBus = new EventBus();

        // Initialisation des modèles de base
        this.rocketModel = new RocketModel(); // Pas d'args pour RocketModel
        this.universeModel = new UniverseModel(); // Pas d'args pour UniverseModel
        
        // Initialisation des contrôleurs essentiels
        // Le constructeur de PhysicsController attend (eventBus, options)
        this.physicsController = new PhysicsController(this.eventBus, { isHeadless: true });
        
        // Le constructeur de RocketController attend (eventBus, rocketModel, physicsController, particleController, cameraModel)
        this.rocketController = new RocketController(
            this.eventBus,
            this.rocketModel,
            this.physicsController,
            null, // Pas de ParticleController en mode headless
            null  // Pas de CameraModel en mode headless
        );
        
        // MissionManager attend (eventBus)
        this.missionManager = new MissionManager(this.eventBus);

        // S'assurer que les contrôleurs s'abonnent aux événements nécessaires
        // RocketController a sa propre méthode subscribeToEvents.
        // Il est crucial que les événements d'action (venant de this.step) soient bien émis
        // et que RocketController y soit abonné.
         if (typeof this.rocketController.subscribeToEvents === 'function') {
            this.rocketController.subscribeToEvents();
         } else {
            console.warn("HeadlessRocketEnvironment: rocketController.subscribeToEvents() n'est pas une fonction.");
         }

        // Initialiser l'état interne de l'environnement
        this.currentStep = 0;
        this.totalRewardInEpisode = 0;
        this._missionAlreadyRewardedThisEpisode = false;

        console.log("HeadlessRocketEnvironment: Initialisation terminée.");
        this.reset(); // Effectuer une première réinitialisation pour mettre en place le monde.
    }

    /**
     * Réinitialise l'environnement à un état initial défini par la configuration ou une nouvelle config.
     * @param {object} [newConfig=null] - Optionnel, une nouvelle configuration pour cette réinitialisation.
     * @return {object} L'observation initiale après réinitialisation.
     */
    reset(newConfig = null) {
        console.log("HeadlessRocketEnvironment: Réinitialisation de l'épisode...");
        if (newConfig) {
            this.config = { ...this.config, ...newConfig };
            // Ré-appliquer les constantes si elles ont changé
            this.ROCKET_CONSTS = (this.config.constants && this.config.constants.ROCKET) || (typeof ROCKET !== 'undefined' ? ROCKET : {});
            this.PHYSICS_CONSTS = (this.config.constants && this.config.constants.PHYSICS) || (typeof PHYSICS !== 'undefined' ? PHYSICS : {});
        }

        // Réinitialiser les modèles à un état de base ou selon la config
        this.rocketModel.reset(); // RocketModel.reset() ne prend pas d'arguments
        if (this.config.rocketInitialState) {
            // Appliquer l'état initial après le reset
            Object.keys(this.config.rocketInitialState).forEach(key => {
                if (this.rocketModel.hasOwnProperty(key)) {
                    // Gérer les objets de manière récursive simple pour position, velocity etc.
                    if (typeof this.rocketModel[key] === 'object' && this.rocketModel[key] !== null &&
                        typeof this.config.rocketInitialState[key] === 'object' && this.config.rocketInitialState[key] !== null) {
                        Object.assign(this.rocketModel[key], this.config.rocketInitialState[key]);
                    } else {
                        this.rocketModel[key] = this.config.rocketInitialState[key];
                    }
                }
            });
        }

        this.universeModel.reset(this.config.universeConfig || {}); // UniverseModel.reset accepte une config
        
        // MissionManager.resetMissions() ne prend pas d'argument pour le moment.
        // Si missionConfig doit être utilisé, resetMissions doit être adapté.
        this.missionManager.resetMissions(); 
        if (this.config.missionConfig) {
            // Potentiellement, passer missionConfig à une méthode de setup sur missionManager
            // ou modifier resetMissions pour l'accepter.
            console.warn("HeadlessRocketEnvironment: missionConfig fourni mais resetMissions() ne l'utilise pas actuellement.");
        }

        // Réinitialiser le monde physique avec les modèles mis à jour
        this.physicsController.initPhysics(this.rocketModel, this.universeModel);

        this.currentStep = 0;
        this.totalRewardInEpisode = 0;
        
        console.log("HeadlessRocketEnvironment: Épisode réinitialisé.");
        return this.getObservation();
    }

    /**
     * Exécute un pas de temps dans l'environnement avec l'action fournie.
     * @param {object} action - L'action prise par l'agent IA. 
     *                          Format à définir, ex: { mainThruster: 0.7, leftThruster: 0, rightThruster: 0.1, rearThruster: 0 }
     * @param {number} [deltaTime=1/60] - La durée du pas de temps en secondes.
     * @return {{observation: object, reward: number, done: boolean, info: object}} 
     *         L'observation, la récompense, si l'épisode est terminé, et des infos de debug.
     */
    step(action, deltaTime = 1 / 60) {
        if (this.isDone()) {
            // Si l'épisode était déjà terminé, ne rien faire et retourner l'état final.
            // console.warn("HeadlessRocketEnvironment: step() appelé sur un épisode terminé.");
            return { 
                observation: this.getObservation(), 
                reward: 0, 
                done: true, 
                info: { status: 'Episode already ended' } 
            };
        }

        // 1. Traduire l'action de l'agent en commandes pour RocketController (via EventBus)
        // Exemple: Si action = { mainThruster: 0.5, rotationInput: -0.1 (pour tourner à droite) }
        if (action.hasOwnProperty('mainThruster')) {
            this.eventBus.emit(this.EVENT_TYPES.ROCKET.SET_THRUSTER_POWER, { 
                thrusterId: 'main', 
                power: action.mainThruster * (this.ROCKET_CONSTS.THRUSTER_POWER?.MAIN || 1000)
            });
        }
        if (action.hasOwnProperty('rearThruster')) {
            this.eventBus.emit(this.EVENT_TYPES.ROCKET.SET_THRUSTER_POWER, { 
                thrusterId: 'rear', 
                power: action.rearThruster * (this.ROCKET_CONSTS.THRUSTER_POWER?.REAR || 200)
            });
        }
        // Pour la rotation, on peut émettre ROTATE_COMMAND ou directement SET_THRUSTER_POWER pour left/right
        // Si on utilise ROTATE_COMMAND, RocketController le traduira.
        if (action.hasOwnProperty('rotationInput')) { // rotationInput: -1 (droite) à 1 (gauche)
            this.eventBus.emit(this.EVENT_TYPES.INPUT.ROTATE_COMMAND, { value: action.rotationInput });
        } else {
            // Si l'agent contrôle directement les propulseurs latéraux
            if (action.hasOwnProperty('leftThruster')) {
                this.eventBus.emit(this.EVENT_TYPES.ROCKET.SET_THRUSTER_POWER, { 
                    thrusterId: 'left', 
                    power: action.leftThruster * (this.ROCKET_CONSTS.THRUSTER_POWER?.LEFT || 20)
                });
            }
            if (action.hasOwnProperty('rightThruster')) {
                this.eventBus.emit(this.EVENT_TYPES.ROCKET.SET_THRUSTER_POWER, { 
                    thrusterId: 'right', 
                    power: action.rightThruster * (this.ROCKET_CONSTS.THRUSTER_POWER?.RIGHT || 20)
                });
            }
        }
        // S'assurer que les propulseurs non spécifiés dans l'action sont à 0 si l'action est complète
        // (ex: si action ne contient que mainThruster, les autres doivent-ils être coupés ?)
        // Cela dépend de la définition de l'espace d'action de l'agent.

        // 2. Mettre à jour les composants de la simulation (ordre inspiré de GameController.update)
        this.universeModel.update(deltaTime); // Mouvements orbitaux, etc.
        // this.rocketController.update(deltaTime); // Normalement gère les réponses aux événements, pas de logique continue ici.
        this.physicsController.update(deltaTime);  // Cœur de la simulation physique
        this.missionManager.update(deltaTime, this.rocketModel, this.universeModel); // Logique des missions

        // 3. Obtenir les résultats pour ce pas
        const observation = this.getObservation();
        const reward = this.calculateReward();
        const done = this.isDone();
        
        this.totalRewardInEpisode += reward;
        this.currentStep++;

        const info = { 
            currentStep: this.currentStep, 
            totalReward: this.totalRewardInEpisode,
            fuel: this.rocketModel.fuel,
            health: this.rocketModel.health,
            isLanded: this.rocketModel.isLanded,
            landedOn: this.rocketModel.landedOn,
            missionStatus: this.missionManager.getCurrentMissionStatus() // Supposer une telle méthode
        };
        if (done) {
            info.status = this.rocketModel.isDestroyed ? 'crashed' : 
                          this.rocketModel.fuel <= 0 ? 'out_of_fuel' :
                          this.missionManager.isCurrentMissionSuccessful() ? 'mission_success' :
                          this.currentStep >= this.maxStepsPerEpisode ? 'max_steps_reached' : 'unknown_done_reason';
            console.log(`HeadlessRocketEnvironment: Épisode terminé. Raison: ${info.status}, Récompense totale: ${this.totalRewardInEpisode.toFixed(2)}, Pas: ${this.currentStep}`);
        }

        return { observation, reward, done, info };
    }

    /**
     * Récupère l'état observable actuel de l'environnement, formaté pour l'agent IA.
     * @return {object} L'observation (devrait être un vecteur/objet de nombres normalisés).
     */
    getObservation() {
        // TODO: Implémenter la collecte et la normalisation des observations
        // Inspiré de ce qui était discuté précédemment (état fusée, univers, mission, physique)
        const obs = {
            // Rocket State
            rocketX: this.rocketModel.position.x,
            rocketY: this.rocketModel.position.y,
            rocketVX: this.rocketModel.velocity.x,
            rocketVY: this.rocketModel.velocity.y,
            rocketAngle: this.rocketModel.angle,
            rocketAngularVelocity: this.rocketModel.angularVelocity,
            rocketFuel: this.rocketModel.fuel,
            rocketHealth: this.rocketModel.health,
            isLanded: this.rocketModel.isLanded ? 1 : 0,
            // Physics State (directement depuis physicsController)
            rocketAccX: this.physicsController.lastRocketAcceleration ? this.physicsController.lastRocketAcceleration.x : 0,
            rocketAccY: this.physicsController.lastRocketAcceleration ? this.physicsController.lastRocketAcceleration.y : 0,
            
            // Mission State (exemple simplifié)
            // targetX, targetY (position de la cible de la mission)
            // distanceToTarget
            
            // Universe State (positions relatives des corps importants)
        };
        // !! IMPORTANT: Normaliser ces valeurs entre -1 et 1 ou 0 et 1 si possible.
        return obs;
    }

    /**
     * Calcule la récompense pour l'état/action du dernier pas.
     * @return {number} La récompense.
     */
    calculateReward() {
        let reward = 0;
        const FUEL_PENALTY_FACTOR = 0.005; // Facteur de pénalité pour la consommation de carburant

        // Pénalité de base pour chaque pas (pour encourager l'efficacité)
        reward -= 0.01; 

        // Pénalité pour la consommation de carburant (proportionnelle à la puissance des propulseurs)
        let normalizedPowerSum = 0;
        if (this.rocketModel && this.rocketModel.thrusters) {
            for (const thruster of Object.values(this.rocketModel.thrusters)) {
                if (thruster.maxPower > 0) { // Éviter la division par zéro si maxPower est 0
                    normalizedPowerSum += (thruster.power / thruster.maxPower);
                }
            }
        }
        reward -= (normalizedPowerSum * FUEL_PENALTY_FACTOR);

        // Grosse pénalité pour crash
        if (this.rocketModel.isDestroyed) {
            reward -= 100; 
        }
        
        // Grosse récompense pour mission réussie (une seule fois par épisode)
        // Note: this.missionManager.isCurrentMissionSuccessful() doit être implémentée dans MissionManager.js
        if (this.missionManager.isCurrentMissionSuccessful && typeof this.missionManager.isCurrentMissionSuccessful === 'function') {
            if (this.missionManager.isCurrentMissionSuccessful()) { 
                if (!this._missionAlreadyRewardedThisEpisode) {
                    reward += 200; 
                    this._missionAlreadyRewardedThisEpisode = true; 
                }
            }
        } else {
            // Ce message peut être bruyant, envisagez un log unique ou conditionnel
            // console.warn("HeadlessRocketEnvironment: missionManager.isCurrentMissionSuccessful() n'est pas disponible ou n'est pas une fonction.");
        }
        
        // TODO: Ajouter d'autres sources de récompense/pénalité (shaping rewards)
        // - Se rapprocher de la cible
        // - Atterrissage réussi (si ce n'est pas la condition de mission)
        // - Éviter des zones dangereuses

        return reward;
    }

    /**
     * Vérifie si l'épisode actuel est terminé.
     * @return {boolean} True si l'épisode est terminé, false sinon.
     */
    isDone() {
        if (this.rocketModel.isDestroyed) return true;
        if (this.rocketModel.fuel <= 0) return true;
        if (this.missionManager.isCurrentMissionSuccessful()) return true; 
        if (this.currentStep >= this.maxStepsPerEpisode) return true;
        // Autres conditions (ex: sortie des limites de simulation si pertinent)
        return false;
    }
}

// Pour rendre la classe accessible globalement si aucun système de module n'est utilisé :
// if (typeof window !== 'undefined') {
//     window.HeadlessRocketEnvironment = HeadlessRocketEnvironment;
// } 