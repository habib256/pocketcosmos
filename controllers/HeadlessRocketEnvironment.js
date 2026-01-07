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
         }

        // Initialiser l'état interne de l'environnement
        this.currentStep = 0;
        this.totalRewardInEpisode = 0;
        this._missionAlreadyRewardedThisEpisode = false;

        this.reset();
    }

    /**
     * Réinitialise l'environnement à un état initial défini par la configuration ou une nouvelle config.
     * @param {object} [newConfig=null] - Optionnel, une nouvelle configuration pour cette réinitialisation.
     * @return {object} L'observation initiale après réinitialisation.
     */
    reset(newConfig = null) {
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
        
        // Créer les corps célestes si fournis dans la configuration
        if (this.config.universeConfig && this.config.universeConfig.celestialBodies) {
            for (const bodyConfig of this.config.universeConfig.celestialBodies) {
                const celestialBody = new CelestialBodyModel(
                    bodyConfig.name,
                    bodyConfig.mass,
                    bodyConfig.radius,
                    bodyConfig.position,
                    bodyConfig.color || '#FFFFFF',
                    null, // parentBody - pour l'instant pas de support d'orbites complexes
                    0,    // orbitDistance
                    0,    // initialOrbitAngle
                    0     // orbitSpeed
                );
                this.universeModel.addCelestialBody(celestialBody);
            }
        } else {
            // Configuration par défaut avec la Terre
            const earth = new CelestialBodyModel(
                'Terre',
                CELESTIAL_BODY.MASS,
                CELESTIAL_BODY.RADIUS,
                { x: 0, y: CELESTIAL_BODY.RADIUS + 100 }, // Fusée commence juste au-dessus de la surface
                '#1E88E5'
            );
            this.universeModel.addCelestialBody(earth);
        }
        
        // Réinitialiser les missions
        this.missionManager.resetMissions(); // Vide les missions existantes et crée les missions par défaut
        
        // Si une configuration de mission personnalisée est fournie, l'utiliser
        if (this.config.missionConfig) {
            // Vider d'abord les missions par défaut
            this.missionManager.missions = [];
            
            // Créer les missions selon la configuration
            if (this.config.missionConfig.objective) {
                switch (this.config.missionConfig.objective) {
                    case 'orbit':
                        // Mission d'orbite : pas de cargo requis, succès basé sur la performance
                        // Utiliser un cargo impossible à obtenir pour éviter la complétion automatique
                        this.missionManager.createMission("Terre", "Orbite", [{ type: "OrbitToken", quantity: 1 }], 100);
                        break;
                    case 'land':
                        // Mission d'atterrissage : atterrir sur un corps céleste
                        this.missionManager.createMission("Terre", "Lune", [{ type: "LandingToken", quantity: 1 }], 200);
                        break;
                    case 'explore':
                        // Mission d'exploration : visiter plusieurs corps célestes
                        this.missionManager.createMission("Terre", "Mars", [{ type: "ExploreToken", quantity: 1 }], 300);
                        break;
                    default:
                        // Mission par défaut
                        this.missionManager.createMission("Terre", "Lune", [{ type: "LandingToken", quantity: 1 }], 150);
                }
            } else if (this.config.missionConfig.missions) {
                // Missions personnalisées définies explicitement
                for (const missionConfig of this.config.missionConfig.missions) {
                    this.missionManager.createMission(
                        missionConfig.from || "Terre",
                        missionConfig.to || "Lune", 
                        missionConfig.requiredCargo || [{ type: "Fuel", quantity: 5 }],
                        missionConfig.reward || 100
                    );
                }
            }
        }

        // Réinitialiser le monde physique avec les modèles mis à jour
        this.physicsController.initPhysics(this.rocketModel, this.universeModel);

        this.currentStep = 0;
        this.totalRewardInEpisode = 0;
        this._missionAlreadyRewardedThisEpisode = false;
        
        // Réinitialiser les compteurs de succès spécifiques
        this.orbitSuccessCounter = 0;
        this.visitedBodies = new Set();
        
        // Émettre événement de début d'épisode
        this.eventBus.emit(this.EVENT_TYPES.AI.EPISODE_STARTED, {
            config: this.config,
            celestialBodies: this.universeModel.celestialBodies
        });
        
        return this.getObservation();
    }
    
    /**
     * Émettre les données pour la visualisation
     */
    emitVisualizationData() {
        // Émettre seulement si nécessaire (éviter le spam)
        if (this.currentStep % 2 === 0) { // Émettre tous les 2 pas pour réduire la charge
            this.eventBus.emit(this.EVENT_TYPES.AI.TRAINING_STEP, {
                rocket: {
                    position: { ...this.rocketModel.position },
                    velocity: { ...this.rocketModel.velocity },
                    angle: this.rocketModel.angle,
                    angularVelocity: this.rocketModel.angularVelocity,
                    fuel: this.rocketModel.fuel,
                    health: this.rocketModel.health,
                    isDestroyed: this.rocketModel.isDestroyed,
                    isLanded: this.rocketModel.isLanded,
                    landedOn: this.rocketModel.landedOn
                },
                celestialBodies: this.universeModel.celestialBodies.map(body => ({
                    name: body.name,
                    position: { ...body.position },
                    radius: body.radius,
                    mass: body.mass,
                    color: body.color
                })),
                step: this.currentStep,
                reward: this.totalRewardInEpisode
            });
        }
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

        // Émettre les données pour la visualisation (si activée)
        this.emitVisualizationData();

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
            
            // Émettre événement de fin d'épisode
            this.eventBus.emit(this.EVENT_TYPES.AI.EPISODE_ENDED, {
                reason: info.status,
                totalReward: this.totalRewardInEpisode,
                steps: this.currentStep
            });
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
        
        // Récompenses spécifiques selon l'objectif de mission
        const currentMission = this.missionManager.getCurrentMissionDetails();
        if (currentMission) {
            reward += this.calculateObjectiveSpecificReward(currentMission);
        }
        
        // Récompenses pour progression vers les objectifs
        if (this.config.missionConfig && this.config.missionConfig.objective) {
            switch (this.config.missionConfig.objective) {
                case 'orbit':
                    // Récompense progressive pour se rapprocher de l'orbite
                    const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
                    if (earth) {
                        const dx = this.rocketModel.position.x - earth.position.x;
                        const dy = this.rocketModel.position.y - earth.position.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const altitude = distance - earth.radius;
                        const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
                        
                        // Utiliser les constantes AI_TRAINING au lieu de valeurs hardcodées
                        const orbitConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.ORBIT : {
                            MIN_ALTITUDE: 100, MAX_ALTITUDE: 1500,
                            MIN_ORBITAL_SPEED: 100, MAX_ORBITAL_SPEED: 160
                        };
                        const rewardConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.REWARDS : {
                            ORBIT_GOOD: 0.5, ORBIT_PERFECT: 1.0, ORBIT_SUCCESS: 100.0
                        };
                        
                        // Récompense pour être dans la zone orbitale
                        if (altitude >= orbitConfig.MIN_ALTITUDE && altitude <= orbitConfig.MAX_ALTITUDE) {
                            reward += rewardConfig.ORBIT_GOOD;
                            // Bonus pour vitesse orbitale appropriée
                            if (speed >= orbitConfig.MIN_ORBITAL_SPEED && speed <= orbitConfig.MAX_ORBITAL_SPEED) {
                                reward += rewardConfig.ORBIT_PERFECT;
                            }
                        }
                        
                        // Grosse récompense pour succès d'orbite
                        if (this.checkOrbitSuccess() && !this._missionAlreadyRewardedThisEpisode) {
                            reward += rewardConfig.ORBIT_SUCCESS;
                            this._missionAlreadyRewardedThisEpisode = true;
                        }
                    }
                    break;
                    
                case 'land':
                    // Récompense pour se rapprocher de la Lune
                    const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
                    if (moon) {
                        const dx = this.rocketModel.position.x - moon.position.x;
                        const dy = this.rocketModel.position.y - moon.position.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const altitude = distance - moon.radius;
                        
                        // Récompense progressive pour approche
                        if (altitude < 1000) {
                            reward += 0.05;
                            if (altitude < 500) {
                                reward += 0.1;
                                if (altitude < 100) {
                                    reward += 0.2;
                                }
                            }
                        }
                        
                        // Grosse récompense pour atterrissage réussi
                        if (this.checkLandingSuccess() && !this._missionAlreadyRewardedThisEpisode) {
                            reward += 100;
                            this._missionAlreadyRewardedThisEpisode = true;
                        }
                    }
                    break;
                    
                case 'explore':
                    // Récompense pour mouvement et exploration
                    const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
                    if (speed > 5 && speed < 100) {
                        reward += 0.02; // Encourager le mouvement
                    }
                    
                    // Récompense pour visiter de nouveaux corps
                    if (this.rocketModel.isLanded && this.rocketModel.landedOn) {
                        if (!this.visitedBodies.has(this.rocketModel.landedOn)) {
                            reward += 10; // Bonus pour nouveau lieu
                        }
                    }
                    
                    // Grosse récompense pour exploration complète
                    if (this.checkExplorationSuccess() && !this._missionAlreadyRewardedThisEpisode) {
                        reward += 100;
                        this._missionAlreadyRewardedThisEpisode = true;
                    }
                    break;
            }
        }

        return reward;
    }

    /**
     * Calcule les récompenses spécifiques selon l'objectif de la mission
     * @param {object} mission - La mission actuelle
     * @return {number} La récompense spécifique à l'objectif
     */
    calculateObjectiveSpecificReward(mission) {
        let reward = 0;
        
        if (!this.rocketModel || !this.universeModel) return reward;
        
        // Déterminer l'objectif basé sur la destination de la mission
        const objective = mission.to === 'Orbite' ? 'orbit' : 
                         mission.to === 'Lune' || mission.to === 'Mars' ? 'land' : 'explore';
        
        switch (objective) {
            case 'orbit':
                reward += this.calculateOrbitReward();
                break;
            case 'land':
                reward += this.calculateLandingReward();
                break;
            case 'explore':
                reward += this.calculateExplorationReward();
                break;
        }
        
        return reward;
    }

    /**
     * Calcule la récompense pour l'objectif d'orbite
     * Utilise les constantes AI_TRAINING pour des valeurs cohérentes avec la physique du jeu
     */
    calculateOrbitReward() {
        let reward = 0;
        
        // Trouver le corps céleste le plus proche (généralement la Terre)
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return reward;
        
        const dx = this.rocketModel.position.x - earth.position.x;
        const dy = this.rocketModel.position.y - earth.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const altitude = distance - earth.radius;
        
        // Utiliser les constantes AI_TRAINING
        const orbitConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.ORBIT : {
            TARGET_ALTITUDE: 500, ALTITUDE_TOLERANCE: 200,
            TARGET_ORBITAL_SPEED: 128, SPEED_TOLERANCE: 30,
            MIN_ALTITUDE: 100, MAX_ALTITUDE: 1500
        };
        const rewardConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.REWARDS : {
            ORBIT_PERFECT: 1.0, ORBIT_GOOD: 0.5, TOO_CLOSE_PENALTY: -0.5, TOO_FAR_PENALTY: -0.2
        };
        const safetyConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.SAFETY : {
            MIN_SAFE_ALTITUDE: 50
        };
        
        // Récompense pour maintenir une altitude orbitale
        const altitudeDiff = Math.abs(altitude - orbitConfig.TARGET_ALTITUDE);
        
        if (altitudeDiff < orbitConfig.ALTITUDE_TOLERANCE / 2) {
            reward += 0.1; // Bonne altitude
        } else if (altitudeDiff < orbitConfig.ALTITUDE_TOLERANCE) {
            reward += 0.05; // Altitude acceptable
        }
        
        // Récompense pour vitesse orbitale appropriée
        const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
        const speedDiff = Math.abs(speed - orbitConfig.TARGET_ORBITAL_SPEED);
        
        if (speedDiff < orbitConfig.SPEED_TOLERANCE / 3) {
            reward += 0.1; // Bonne vitesse
        } else if (speedDiff < orbitConfig.SPEED_TOLERANCE) {
            reward += 0.05; // Vitesse acceptable
        }
        
        // Pénalité pour être trop proche ou trop loin
        if (altitude < safetyConfig.MIN_SAFE_ALTITUDE) {
            reward += rewardConfig.TOO_CLOSE_PENALTY; // Trop proche, risque de crash
        } else if (altitude > orbitConfig.MAX_ALTITUDE * 1.5) {
            reward += rewardConfig.TOO_FAR_PENALTY; // Trop loin, pas vraiment en orbite
        }
        
        return reward;
    }

    /**
     * Calcule la récompense pour l'objectif d'atterrissage
     */
    calculateLandingReward() {
        let reward = 0;
        
        // Récompense pour se rapprocher de la cible
        const targetBody = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
        if (targetBody) {
            const dx = this.rocketModel.position.x - targetBody.position.x;
            const dy = this.rocketModel.position.y - targetBody.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const altitude = distance - targetBody.radius;
            
            // Récompense progressive pour se rapprocher
            if (altitude < 100) {
                reward += 0.2; // Très proche
                
                // Récompense supplémentaire pour vitesse d'approche lente
                const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
                if (speed < 5) {
                    reward += 0.1; // Approche lente et contrôlée
                }
            } else if (altitude < 500) {
                reward += 0.1; // Proche
            } else if (altitude < 1000) {
                reward += 0.05; // En approche
            }
            
            // Grosse récompense pour atterrissage réussi
            if (this.rocketModel.isLanded && this.rocketModel.landedOn === targetBody.name) {
                reward += 1.0; // Atterrissage réussi !
            }
        }
        
        return reward;
    }

    /**
     * Calcule la récompense pour l'objectif d'exploration
     */
    calculateExplorationReward() {
        let reward = 0;
        
        // Récompense pour explorer différentes zones
        // (Implémentation simplifiée - pourrait être étendue)
        const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
        
        // Récompense pour mouvement (exploration active)
        if (speed > 10 && speed < 100) {
            reward += 0.05; // Mouvement d'exploration
        }
        
        // Récompense pour visiter différents corps célestes
        if (this.rocketModel.isLanded) {
            reward += 0.2; // Exploration d'un nouveau lieu
        }
        
        return reward;
    }

    /**
     * Vérifie si l'épisode actuel est terminé.
     * @return {boolean} True si l'épisode est terminé, false sinon.
     */
    isDone() {
        if (this.rocketModel.isDestroyed) return true;
        if (this.rocketModel.fuel <= 0) return true;
        if (this.currentStep >= this.maxStepsPerEpisode) return true;
        
        // CONDITION DE CRASH ANTICIPÉ : Terminer immédiatement si crash imminent sur une planète
        // Cela accélère l'entraînement en évitant d'attendre la détection de collision par Matter.js
        if (this.checkImminentCrash()) {
            // Marquer comme détruite pour cohérence
            this.rocketModel.isDestroyed = true;
            return true;
        }
        
        // Vérifier les conditions de succès spécifiques selon l'objectif
        if (this.config.missionConfig && this.config.missionConfig.objective) {
            switch (this.config.missionConfig.objective) {
                case 'orbit':
                    // Mission d'orbite réussie si altitude et vitesse appropriées pendant plusieurs pas
                    return this.checkOrbitSuccess();
                case 'land':
                    // Mission d'atterrissage réussie si atterri sur la cible
                    return this.checkLandingSuccess();
                case 'explore':
                    // Mission d'exploration réussie si certaines zones visitées
                    return this.checkExplorationSuccess();
            }
        }
        
        // Autres conditions (ex: sortie des limites de simulation si pertinent)
        return false;
    }
    
    /**
     * Vérifie si un crash est imminent (fusée trop proche de la surface avec vitesse trop élevée)
     * @return {boolean} True si un crash est imminent, false sinon
     */
    checkImminentCrash() {
        if (!this.rocketModel || !this.universeModel || this.rocketModel.isDestroyed) {
            return false;
        }
        
        // Vérifier chaque corps céleste
        for (const body of this.universeModel.celestialBodies) {
            if (!body.position || !body.radius) continue;
            
            // Calculer la distance au corps céleste
            const dx = this.rocketModel.position.x - body.position.x;
            const dy = this.rocketModel.position.y - body.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Distance à la surface (altitude)
            const altitude = distance - body.radius;
            
            // Vitesse actuelle
            const speed = Math.sqrt(
                this.rocketModel.velocity.x ** 2 + 
                this.rocketModel.velocity.y ** 2
            );
            
            // Utiliser les seuils de crash depuis PHYSICS (ou valeurs par défaut)
            const CRASH_SPEED_THRESHOLD = this.PHYSICS_CONSTS?.CRASH_SPEED_THRESHOLD || 10.0;
            const CRASH_PROXIMITY_THRESHOLD = 50; // Distance en mètres avant la surface
            
            // Crash imminent si :
            // 1. Très proche de la surface (moins de CRASH_PROXIMITY_THRESHOLD mètres)
            // 2. ET vitesse trop élevée (supérieure au seuil de crash)
            // 3. ET vitesse radiale vers le corps (approche, pas éloignement)
            if (altitude < CRASH_PROXIMITY_THRESHOLD && altitude > 0) {
                // Calculer la vitesse radiale (vers/depuis le corps)
                const directionX = dx / distance;
                const directionY = dy / distance;
                const radialVelocity = 
                    this.rocketModel.velocity.x * directionX + 
                    this.rocketModel.velocity.y * directionY;
                
                // Si vitesse radiale négative (vers le corps) et vitesse totale élevée = crash imminent
                if (radialVelocity < 0 && speed > CRASH_SPEED_THRESHOLD) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Vérifie si la mission d'orbite est réussie
     * Utilise les constantes AI_TRAINING pour des valeurs cohérentes avec la physique du jeu
     */
    checkOrbitSuccess() {
        if (!this.orbitSuccessCounter) this.orbitSuccessCounter = 0;
        
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return false;
        
        const dx = this.rocketModel.position.x - earth.position.x;
        const dy = this.rocketModel.position.y - earth.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const altitude = distance - earth.radius;
        
        const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
        
        // Utiliser les constantes AI_TRAINING
        const orbitConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.ORBIT : {
            MIN_ALTITUDE: 100, MAX_ALTITUDE: 1500,
            MIN_ORBITAL_SPEED: 100, MAX_ORBITAL_SPEED: 160,
            STABILITY_STEPS: 100
        };
        
        // Conditions d'orbite avec constantes calculées
        const inOrbit = (altitude >= orbitConfig.MIN_ALTITUDE && altitude <= orbitConfig.MAX_ALTITUDE) && 
                       (speed >= orbitConfig.MIN_ORBITAL_SPEED && speed <= orbitConfig.MAX_ORBITAL_SPEED);
        
        if (inOrbit) {
            this.orbitSuccessCounter++;
            // Succès si maintenu en orbite pendant STABILITY_STEPS pas
            return this.orbitSuccessCounter >= orbitConfig.STABILITY_STEPS;
        } else {
            this.orbitSuccessCounter = 0; // Reset si sort de l'orbite
            return false;
        }
    }

    /**
     * Vérifie si la mission d'atterrissage est réussie
     * Utilise les constantes AI_TRAINING pour des valeurs cohérentes
     */
    checkLandingSuccess() {
        // Utiliser les constantes AI_TRAINING
        const landingConfig = (typeof AI_TRAINING !== 'undefined') ? AI_TRAINING.LANDING : {
            MAX_LANDING_SPEED: 10
        };
        
        // Succès si atterri sur la Lune avec vitesse faible
        if (this.rocketModel.isLanded && this.rocketModel.landedOn === 'Lune') {
            const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
            return speed < landingConfig.MAX_LANDING_SPEED; // Atterrissage en douceur
        }
        return false;
    }

    /**
     * Vérifie si la mission d'exploration est réussie
     */
    checkExplorationSuccess() {
        if (!this.visitedBodies) this.visitedBodies = new Set();
        
        // Marquer les corps visités
        if (this.rocketModel.isLanded && this.rocketModel.landedOn) {
            this.visitedBodies.add(this.rocketModel.landedOn);
        }
        
        // Succès si au moins 2 corps différents visités
        return this.visitedBodies.size >= 2;
    }
}

// Pour rendre la classe accessible globalement si aucun système de module n'est utilisé :
// if (typeof window !== 'undefined') {
//     window.HeadlessRocketEnvironment = HeadlessRocketEnvironment;
// } 