/**
 * Classe représentant une mission
 */
class Mission {
    // Le constructeur n'est plus utilisé directement, l'objet est créé dans createMission
}

/**
 * Classe MissionManager - Gestion des missions du jeu
 * @class
 */
class MissionManager {
    /**
     * @type {Array<string>}
     * Liste des planètes possibles pour les missions aléatoires.
     * À adapter en fonction des corps célestes réellement présents dans le jeu.
     */
    static AVAILABLE_PLANETS = ["Terre", "Lune", "Mars"]; // Ajoutez d'autres planètes ici

    /**
     * @type {Array<string>}
     * Liste des types de cargaison possibles pour les missions aléatoires.
     */
    static AVAILABLE_CARGO_TYPES = ["🛢️", "🔧", "🧑‍🚀", "🪨", "🍎"]; // Émoticônes pour tous les types

    /**
     * Crée une instance de MissionManager
     * @constructor
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication
     * @param {UniverseModel} universeModel - L'instance du modèle de l'univers
     * @param {RocketModel} rocketModel - L'instance du modèle de la fusée
     */
    constructor(eventBus, universeModel, rocketModel) {
        /**
         * @type {EventBus}
         * Instance de l'EventBus
         */
        this.eventBus = eventBus;
        
        /**
         * @type {UniverseModel}
         * Instance du modèle de l'univers
         */
        this.universeModel = universeModel;
        
        /**
         * @type {RocketModel}
         * Instance du modèle de la fusée
         */
        this.rocketModel = rocketModel;

        /**
         * @type {Array<Mission>}
         * Liste des missions actives
         */
        this.missions = [];

        // S'abonner aux événements de succès et d'échec de mission
        this.subscribeToEvents();

        // Définir les planètes et cargaisons possibles (peut être surchargé par des constantes globales si besoin)
        this.availablePlanets = MissionManager.AVAILABLE_PLANETS;
        this.availableCargoTypes = MissionManager.AVAILABLE_CARGO_TYPES;
        
        // Constantes pour la détection de points
        this.POINT_ARRIVAL_DISTANCE_MARGIN = 10; // Marge de distance pour considérer un point atteint (en pixels/mètres)
        this.POINT_ARRIVAL_ANGLE_TOLERANCE = 0.1; // Tolérance angulaire (radians)
    }

    /**
     * S'abonne aux événements pertinents de l'EventBus.
     */
    subscribeToEvents() {
        if (!this.eventBus) {
            console.error("[MissionManager] EventBus non fourni au constructeur.");
            return;
        }
        // this.eventBus.subscribe('MISSION_SUCCESS', (data) => this.completeMission(data)); // SUPPRIMÉ
        this.eventBus.subscribe('MISSION_FAILED', (data) => this.failMission(data));
    }

    /**
     * Crée une nouvelle mission
     * @param {string} type - Type de mission ('delivery', 'goToPoint')
     * @param {object} details - Détails spécifiques au type de mission
     *        - Pour 'delivery': { from, to, requiredCargo, reward }
     *        - Pour 'goToPoint': { celestialBodyName, startPointId, endPointId, reward }
     * @returns {object | null} - La mission créée ou null en cas d'erreur
     */
    createMission(type, details) {
        const baseMission = {
            id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            status: "pending", // pending, stage1Complete (si goToPoint), completed, failed
            reward: details.reward || 0,
        };

        let mission = null;

        if (type === 'delivery') {
            if (!details.from || !details.to || !Array.isArray(details.requiredCargo) || details.requiredCargo.length === 0 || details.requiredCargo.some(item => !item.type || !item.quantity)) {
                console.error("[MissionManager] Détails invalides pour la mission de livraison.", details);
                return null;
            }
            mission = {
                ...baseMission,
                from: details.from,
                to: details.to,
                requiredCargo: details.requiredCargo,
            };
            const cargoString = details.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
            console.log(`[MissionManager] Création mission Livraison: ${mission.from} -> ${mission.to}, Cargaison: ${cargoString}, Récompense: ${mission.reward}`);

        } else if (type === 'goToPoint') {
            if (!details.celestialBodyName || !details.startPointId || !details.endPointId) {
                 console.error("[MissionManager] Détails invalides pour la mission goToPoint.", details);
                 return null;
            }
            mission = {
                ...baseMission,
                celestialBodyName: details.celestialBodyName,
                startPointId: details.startPointId,
                endPointId: details.endPointId,
                currentStage: 'startPoint', // 'startPoint' ou 'endPoint'
            };
             console.log(`[MissionManager] Création mission GoToPoint: ${mission.celestialBodyName} (Point ${mission.startPointId} -> ${mission.endPointId}), Récompense: ${mission.reward}`);

        } else {
            console.error(`[MissionManager] Type de mission inconnu: ${type}`);
            return null;
        }

        this.missions.push(mission);
        return mission;
    }

    /**
     * Vérifie si une mission de LIVRAISON est complétée.
     * La complétion nécessite que TOUS les items requis soient présents à destination.
     * La livraison est désormais tout ou rien.
     * @param {RocketCargo} rocketCargo - Cargo de la fusée
     * @param {string} currentLocation - Position actuelle de la fusée
     * @returns {Array<object>} - Liste des missions complétées
     */
    checkDeliveryCompletion(rocketCargo, currentLocation) {
        const completedMissions = [];

        for (const mission of this.missions) {
            // Ne vérifier que les missions de livraison en attente
            if (mission.type !== 'delivery' || mission.status !== "pending") continue;

            // Vérifier si la destination est atteinte
            if (mission.to === currentLocation) {
                let canComplete = true;
                const cargoList = rocketCargo.getCargoList();

                // Vérifier si TOUS les items requis sont présents en quantité suffisante
                for (const requiredItem of mission.requiredCargo) {
                    const cargoItem = cargoList.find(item => item.type === requiredItem.type);
                    if (!cargoItem || cargoItem.quantity < requiredItem.quantity) {
                        canComplete = false;
                        break; // Inutile de vérifier les autres items si un manque
                    }
                }
                
                // Si tous les items sont présents
                if (canComplete) {
                    // Retirer TOUS les cargos livrés de la fusée
                    mission.requiredCargo.forEach(requiredItem => {
                         // La méthode removeCargo gère déjà les erreurs si l'item n'existe pas ou quantité insuffisante, mais on a déjà vérifié
                         rocketCargo.removeCargo(requiredItem.type, requiredItem.quantity); 
                    });

                    const cargoString = mission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
                    
                    // Marquer la mission comme complétée
                    mission.status = "completed";
                    completedMissions.push(mission);
                    // Publier un événement pour la complétion
                    this.eventBus.emit('MISSION_COMPLETED', { mission, reward: mission.reward });
                    console.log(`✅ Mission de livraison terminée : ${mission.from} -> ${mission.to} (${cargoString}). Récompense : ${mission.reward}`);
                } 
            }
        }

        return completedMissions;
    }

    /**
     * Vérifie si la fusée a atteint un point cible pour les missions 'goToPoint'.
     * Appelée à chaque frame par la boucle de jeu.
     */
    checkPointArrival() {
        if (!this.rocketModel || !this.universeModel) {
             console.warn("[MissionManager] rocketModel ou universeModel non disponible pour checkPointArrival.");
             return;
        }

        const rocketPos = this.rocketModel.position;

        for (const mission of this.missions) {
            // Ne vérifier que les missions goToPoint en attente ou à l'étape 1
            if (mission.type !== 'goToPoint' || !['pending', 'stage1Complete'].includes(mission.status)) continue;

            const targetBody = this.universeModel.celestialBodies.find(body => body.name === mission.celestialBodyName);
            if (!targetBody) {
                console.warn(`[MissionManager] Corps céleste ${mission.celestialBodyName} non trouvé pour la mission ${mission.id}.`);
                continue;
            }

            const targetPointId = (mission.status === 'pending') ? mission.startPointId : mission.endPointId;
            const targetPoint = targetBody.targetPoints.find(p => p.id === targetPointId);

            if (!targetPoint) {
                console.warn(`[MissionManager] Point cible ${targetPointId} non trouvé sur ${targetBody.name} pour la mission ${mission.id}.`);
                continue;
            }

            const bodyPos = targetBody.position;
            const dx = rocketPos.x - bodyPos.x;
            const dy = rocketPos.y - bodyPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Normaliser l'angle cible et l'angle actuel pour la comparaison
            const targetAngle = (targetPoint.angle + 2 * Math.PI) % (2 * Math.PI);
            const currentAngle = (angle + 2 * Math.PI) % (2 * Math.PI);
            
            // Vérifier la proximité en distance (proche de la surface)
            const isNearDistance = Math.abs(distance - targetBody.radius) < this.POINT_ARRIVAL_DISTANCE_MARGIN;

            // Vérifier la proximité angulaire (gestion du passage par 0/2PI)
            let angleDifference = Math.abs(currentAngle - targetAngle);
            if (angleDifference > Math.PI) {
                angleDifference = 2 * Math.PI - angleDifference; // Prendre le chemin le plus court
            }
            const isNearAngle = angleDifference < this.POINT_ARRIVAL_ANGLE_TOLERANCE;

            if (isNearDistance && isNearAngle) {
                if (mission.status === 'pending' && targetPointId === mission.startPointId) {
                    mission.status = 'stage1Complete'; // Marquer la première étape comme atteinte
                    this.eventBus.emit('MISSION_STAGE_COMPLETE', { mission, stage: 1, pointId: targetPointId });
                    console.log(`🚩 Mission ${mission.id}: Étape 1 atteinte (Point ${targetPointId} sur ${targetBody.name})`);
                } else if (mission.status === 'stage1Complete' && targetPointId === mission.endPointId) {
                    mission.status = 'completed'; // Mission terminée
                    this.eventBus.emit('MISSION_COMPLETED', { mission, reward: mission.reward });
                    console.log(`✅ Mission GoToPoint terminée : ${targetBody.name} (Point ${mission.startPointId} -> ${mission.endPointId}). Récompense : ${mission.reward}`);
                }
            }
        }
    }

    /**
     * Retourne la liste des missions actives (pending ou stage1Complete)
     * @returns {Array<object>}
     */
    getActiveMissions() {
        return this.missions.filter(mission => ['pending', 'stage1Complete'].includes(mission.status));
    }

    /**
     * Crée une nouvelle mission aléatoire (type delivery uniquement pour l'instant).
     * @returns {object | null} - La mission aléatoire créée ou null en cas d'erreur.
     */
    createRandomMission() {
        if (this.availablePlanets.length < 2 || this.availableCargoTypes.length === 0) {
            console.error("[MissionManager] Impossible de créer une mission aléatoire : pas assez de planètes ou de types de cargaison définis.");
            return null;
        }

        // Choix aléatoire des planètes (différentes)
        let from, to;
        do {
            from = this.availablePlanets[Math.floor(Math.random() * this.availablePlanets.length)];
            to = this.availablePlanets[Math.floor(Math.random() * this.availablePlanets.length)];
        } while (from === to);

        // Choix aléatoire du type de cargaison et de la quantité
        const cargoType = this.availableCargoTypes[Math.floor(Math.random() * this.availableCargoTypes.length)];
        const quantity = Math.floor(Math.random() * 15) + 5; // Quantité entre 5 et 20

        // Pour l'instant, une seule cargaison par mission aléatoire
        const requiredCargo = [{ type: cargoType, quantity: quantity }];

        // Calcul simple de la récompense (à affiner)
        const baseReward = 50;
        const rewardPerItem = 10; // Ajustez selon la valeur de chaque item
        const reward = baseReward + quantity * rewardPerItem; 

        console.log(`[MissionManager] Création mission aléatoire: ${from} -> ${to}, ${quantity} x ${cargoType}, Récompense: ${reward}`);
        return this.createMission('delivery', { from, to, requiredCargo, reward });
    }

    /**
     * Réinitialise les missions à leur état initial.
     * Ajoute également un nombre défini de missions aléatoires.
     * @param {number} [numRandomMissions=5] - Nombre de missions aléatoires à générer. Par défaut 5.
     */
    resetMissions(numRandomMissions = 5) { // Augmenté la valeur par défaut à 5
        this.missions = []; // Vider les missions actuelles

        console.log("[MissionManager] Réinitialisation des missions...");

        // --- Missions Prédéfinies (Exemple GoToPoint) ---
        // !! Assurez-vous que les points 'poleNord', 'equateurEst' existent sur la Lune dans votre initialisation !!
        // this.createMission('goToPoint', {
        //     celestialBodyName: 'Lune',
        //     startPointId: 'poleNord',
        //     endPointId: 'equateurEst',
        //     reward: 250
        // });

        // --- Missions Aléatoires (Type Delivery) ---
        console.log(`[MissionManager] Création de ${numRandomMissions} mission(s) aléatoire(s) de livraison...`);
        for (let i = 0; i < numRandomMissions; i++) {
            this.createRandomMission();
        }
        console.log("[MissionManager] Missions initialisées avec uniquement des missions aléatoires.");
    }

    /**
     * Gère l'échec d'une mission.
     * @param {object} data - Données de l'événement contenant la mission.
     */
    failMission(data) {
        const mission = this.missions.find(m => m.id === data.mission.id && ['pending', 'stage1Complete'].includes(m.status));
        if (mission) {
            const initialStatus = mission.status;
            mission.status = "failed";
            console.log(`❌ Mission échouée (ID: ${mission.id}, Type: ${mission.type}) pendant l'étape '${initialStatus}'.`);
            // TODO: Gérer la cargaison si nécessaire pour les missions de livraison échouées

            // Optionnel: Publier un événement pour l'UI ou autre logique
            this.eventBus.emit('MISSION_ABORTED', { mission });
        }
    }
}

// Supprimer l'instanciation globale et l'initialisation ici
// const missionManager = new MissionManager();
// missionManager.resetMissions();

// Supprimer l'exportation par défaut si elle existe
// export default missionManager; 