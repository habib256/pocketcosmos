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
            console.log(`HeadlessRocketEnvironment: ${this.config.universeConfig.celestialBodies.length} corps célestes créés.`);
        } else {
            // Configuration par défaut avec la Terre
            const earth = new CelestialBodyModel(
                'Terre',
                CELESTIAL_BODY.MASS,
                CELESTIAL_BODY.RADIUS,
                { x: 0, y: 0 }, // Position normale de la Terre au centre
                '#1E88E5'
            );
            this.universeModel.addCelestialBody(earth);
            console.log("HeadlessRocketEnvironment: Corps céleste par défaut (Terre) créé.");
            
            // Positionner la fusée à 2 fois la hauteur du rayon de la Terre au-dessus de la surface
            const rocketStartX = earth.position.x;
            const rocketStartY = earth.position.y + (earth.radius * 3); // 3 * rayon = surface + 2 * rayon
            this.rocketModel.setPosition(rocketStartX, rocketStartY);
            this.rocketModel.setVelocity(0, 0); // Vitesse initiale nulle
            this.rocketModel.setAngle(0); // Orientation initiale
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
            console.log(`HeadlessRocketEnvironment: ${this.missionManager.missions.length} mission(s) configurée(s) selon missionConfig.`);
        } else {
            console.log(`HeadlessRocketEnvironment: ${this.missionManager.missions.length} mission(s) par défaut créée(s).`);
        }

        // Réinitialiser le monde physique avec les modèles mis à jour
        this.physicsController.initializeRocket(this.rocketModel);
        this.physicsController.initializeCelestialBodies(this.universeModel.celestialBodies);

        this.currentStep = 0;
        this.totalRewardInEpisode = 0;
        this._missionAlreadyRewardedThisEpisode = false;
        
        // Réinitialiser les compteurs de succès spécifiques
        this.orbitSuccessCounter = 0;
        this.visitedBodies = new Set();
        
        console.log("HeadlessRocketEnvironment: Épisode réinitialisé.");
        
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
        // Convertir deltaTime en millisecondes pour PhysicsController
        const deltaTimeMilliseconds = deltaTime * 1000;
        
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

        // 1. Appliquer l'action (ex: modifier la puissance des propulseurs)
        if (action && typeof action === 'object') {
            // Action peut contenir { mainThruster: 0.8, leftThruster: 0.2, rightThruster: 0.0, rearThruster: 0.0 }
            if (action.mainThruster !== undefined) {
                this.rocketModel.setThrusterPower('main', action.mainThruster);
            }
            if (action.leftThruster !== undefined) {
                this.rocketModel.setThrusterPower('left', action.leftThruster);
            }
            if (action.rightThruster !== undefined) {
                this.rocketModel.setThrusterPower('right', action.rightThruster);
            }
            if (action.rearThruster !== undefined) {
                this.rocketModel.setThrusterPower('rear', action.rearThruster);
            }
        }

        // S'assurer que les propulseurs non spécifiés dans l'action sont à 0 si l'action est complète
        // (ex: si action ne contient que mainThruster, les autres doivent-ils être coupés ?)
        // Cela dépend de la définition de l'espace d'action de l'agent.

        // 2. Mettre à jour les composants de la simulation (ordre inspiré de GameController.update)
        this.universeModel.update(deltaTime); // Mouvements orbitaux en secondes
        // this.rocketController.update(deltaTime); // Normalement gère les réponses aux événements, pas de logique continue ici.
        this.physicsController.update(deltaTimeMilliseconds);  // Cœur de la simulation physique en millisecondes
        this.missionManager.update(deltaTime, this.rocketModel, this.universeModel); // Logique des missions en secondes

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
            console.log(`HeadlessRocketEnvironment: Épisode terminé. Raison: ${info.status}, Récompense totale: ${this.totalRewardInEpisode.toFixed(2)}, Pas: ${this.currentStep}`);
            
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
                        
                        // Récompense pour être dans la zone orbitale
                        if (altitude >= 200 && altitude <= 800) {
                            reward += 0.1;
                            // Bonus pour vitesse orbitale appropriée
                            if (speed >= 30 && speed <= 70) {
                                reward += 0.2;
                            }
                        }
                        
                        // Grosse récompense pour succès d'orbite
                        if (this.checkOrbitSuccess() && !this._missionAlreadyRewardedThisEpisode) {
                            reward += 100;
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
        
        // Récompense pour maintenir une altitude orbitale (entre 100 et 1000 unités)
        const targetAltitude = 500;
        const altitudeDiff = Math.abs(altitude - targetAltitude);
        
        if (altitudeDiff < 100) {
            reward += 0.1; // Bonne altitude
        } else if (altitudeDiff < 300) {
            reward += 0.05; // Altitude acceptable
        }
        
        // Récompense pour vitesse orbitale appropriée
        const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
        const targetSpeed = 50; // Vitesse orbitale cible
        const speedDiff = Math.abs(speed - targetSpeed);
        
        if (speedDiff < 10) {
            reward += 0.1; // Bonne vitesse
        } else if (speedDiff < 25) {
            reward += 0.05; // Vitesse acceptable
        }
        
        // Pénalité pour être trop proche ou trop loin
        if (altitude < 50) {
            reward -= 0.5; // Trop proche, risque de crash
        } else if (altitude > 2000) {
            reward -= 0.2; // Trop loin, pas vraiment en orbite
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
     * Vérifie si la mission d'orbite est réussie
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
        
        // Conditions d'orbite : altitude entre 200-800 et vitesse entre 30-70
        const inOrbit = (altitude >= 200 && altitude <= 800) && (speed >= 30 && speed <= 70);
        
        if (inOrbit) {
            this.orbitSuccessCounter++;
            // Succès si maintenu en orbite pendant 100 pas (environ 1.67 secondes)
            return this.orbitSuccessCounter >= 100;
        } else {
            this.orbitSuccessCounter = 0; // Reset si sort de l'orbite
            return false;
        }
    }

    /**
     * Vérifie si la mission d'atterrissage est réussie
     */
    checkLandingSuccess() {
        // Succès si atterri sur la Lune avec vitesse faible
        if (this.rocketModel.isLanded && this.rocketModel.landedOn === 'Lune') {
            const speed = Math.sqrt(this.rocketModel.velocity.x ** 2 + this.rocketModel.velocity.y ** 2);
            return speed < 10; // Atterrissage en douceur
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