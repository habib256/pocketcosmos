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
     * Crée une instance de MissionManager
     * @constructor
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication
     */
    constructor(eventBus) {
        /**
         * @type {EventBus}
         * Instance de l'EventBus
         */
        this.eventBus = eventBus;

        /**
         * @type {Array<Mission>}
         * Liste des missions actives
         */
        this.missions = [];

        // S'abonner aux événements de succès et d'échec de mission
        this.subscribeToEvents();
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
        this.eventBus.subscribe(EVENTS.MISSION.FAILED, data => this.failMission(data));
    }

    /**
     * Crée une nouvelle mission
     * @param {string} from - Planète de départ
     * @param {string} to - Planète de destination
     * @param {Array<{type: string, quantity: number}>} requiredCargo - Liste des cargaisons requises
     * @param {number} reward - Récompense en crédits
     * @returns {object} - La mission créée
     */
    createMission(from, to, requiredCargo, reward) {
        // Validation simple de requiredCargo
        if (!Array.isArray(requiredCargo) || requiredCargo.length === 0 || requiredCargo.some(item => !item.type || !item.quantity)) {
            console.error("[MissionManager] Tentative de création de mission avec requiredCargo invalide.", requiredCargo);
            return null;
        }
        
        const mission = {
            id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            from,
            to,
            requiredCargo, // Utiliser le tableau directement
            reward,
            status: "pending" // Suppression de deliveredQuantity
        };
        this.missions.push(mission);
        const cargoString = requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
        return mission;
    }

    /**
     * Vérifie si une mission est complétée. 
     * La complétion nécessite que TOUS les items requis soient présents à destination.
     * La livraison est désormais tout ou rien.
     * @param {RocketCargo} rocketCargo - Cargo de la fusée
     * @param {string} currentLocation - Position actuelle de la fusée
     * @returns {Array<object>} - Liste des missions complétées
     */
    checkMissionCompletion(rocketCargo, currentLocation) {
        const completedMissions = [];
        // const missionsToUpdate = []; // Plus nécessaire sans livraison partielle

        for (const mission of this.missions) {
            if (mission.status !== "pending") continue;

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
                } 
            }
            // Suppression de la logique de rechargement (liée à deliveredQuantity et mission Fuel unique)
        }

        return completedMissions;
    }

    /**
     * Retourne la liste des missions actives
     * @returns {Array<object>}
     */
    getActiveMissions() {
        return this.missions.filter(mission => mission.status === "pending");
    }

    /**
     * Retourne les détails de la première mission active (en attente).
     * @returns {object|null} La première mission active, ou null si aucune.
     */
    getCurrentMissionDetails() {
        const activeMissions = this.getActiveMissions();
        return activeMissions.length > 0 ? activeMissions[0] : null;
    }

    /**
     * Réinitialise les missions à leur état initial.
     */
    resetMissions() {
        this.missions = []; // Vider les missions actuelles
        // Mission 1: Terre -> Lune, 10 Fuel
        this.createMission("Terre", "Lune", [{ type: "Fuel", quantity: 10 }], 100); 
        // Mission 2: Lune -> Terre, 10 Wrench (Clés à molette)
        this.createMission("Lune", "Terre", [{ type: "Wrench", quantity: 10 }], 150);
        // Mission 3: Terre -> Mars, 5 Fuel ET 5 Wrench
        this.createMission("Terre", "Mars", [{ type: "Fuel", quantity: 5 }, { type: "Wrench", quantity: 5 }], 300);
        // Mission 4: Mars -> Terre, 10 Humains
        this.createMission("Mars", "Terre", [{ type: "🧑‍🚀", quantity: 10 }], 500); 
    }

    /**
     * Gère l'échec d'une mission.
     * @param {object} data - Données de l'événement contenant la mission.
     */
    failMission(data) {
        const mission = this.missions.find(m => m.id === data.mission.id && m.status === 'pending');
        if (mission) {
            mission.status = "failed";
            console.log(`❌ Mission échouée : ${mission.from} → ${mission.to}. Fusée détruite ou problème en route.`);
            // TODO: Remettre la cargaison à zéro (nécessite une référence à RocketCargo)
            
            // Optionnel: Publier un événement pour l'UI ou autre logique
            this.eventBus.emit(EVENTS.MISSION.FAILED, { mission });
        }
    }

    /**
     * Charge le cargo nécessaire pour la première mission active partant de la localisation donnée.
     * @param {string} location - Le nom de la planète/lune où se trouve la fusée.
     * @param {RocketModel} rocketModel - Le modèle de la fusée pour accéder à son cargo.
     */
    loadCargoForCurrentLocationMission(location, rocketModel) {
        if (!rocketModel) return;

        const activeMissions = this.getActiveMissions();
        const nextMission = activeMissions.find(m => m.from === location);

        if (nextMission) {
            // Assurez-vous que rocketModel.cargo est initialisé.
            // Normalement, RocketModel devrait initialiser son propre cargo.
            // Si ce n'est pas le cas, il faudrait le faire ici ou s'assurer qu'il l'est ailleurs.
            if (!rocketModel.cargo) {
                rocketModel.cargo = new RocketCargo(); 
            }
            // Vider le cargo actuel avant de charger celui de la nouvelle mission
            rocketModel.cargo.cargoItems = [];

            let allLoaded = true;

            nextMission.requiredCargo.forEach(item => {
                const loaded = rocketModel.cargo.addCargo(item.type, item.quantity);
                if (!loaded) {
                    allLoaded = false;
                    // console.warn(`[MissionManager] Échec du chargement de ${item.quantity} x ${item.type} pour la mission ${nextMission.id}.`); 
                }
            });

            // if (allLoaded) { // Log optionnel
            //     const cargoString = nextMission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
            //     console.log(`%c[MissionManager] Cargo chargé pour la mission ${nextMission.id}: ${cargoString}`, 'color: lightblue;');
            // }
        } else {
            // console.log(`%c[MissionManager] Aucune mission active au départ de ${location} trouvée.`, 'color: gray;');
            if (rocketModel.cargo) {
                 rocketModel.cargo.cargoItems = []; // Vider le cargo s'il n'y a pas de mission
            }
        }
    }
}

// Supprimer l'instanciation globale et l'initialisation ici
// const missionManager = new MissionManager(); 
// missionManager.resetMissions();

// Supprimer l'exportation par défaut si elle existe
// export default missionManager; 