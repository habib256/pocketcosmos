/**
 * Classe représentant une mission
 */
class Mission {
    // Le constructeur n'est plus utilisé directement, l'objet est créé dans createMission
}

/**
 * @typedef {object} MissionObjet
 * @property {string} id - Identifiant unique de la mission.
 * @property {string} from - Lieu de départ de la mission.
 * @property {string} to - Lieu de destination de la mission.
 * @property {Array<{type: string, quantity: number}>} requiredCargo - Liste des cargaisons requises pour la mission.
 * @property {number} reward - Récompense pour l'accomplissement de la mission.
 * @property {string} status - Statut actuel de la mission ("pending", "completed", "failed").
 */

/**
 * Classe MissionManager - Gestion des missions du jeu.
 * Orchestre la création, le suivi, la complétion et l'échec des missions.
 * @class
 */
class MissionManager {
    /**
     * Crée une instance de MissionManager.
     * @constructor
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication inter-modules.
     */
    constructor(eventBus) {
        /**
         * Instance de l'EventBus pour la communication.
         * @type {EventBus}
         */
        this.eventBus = eventBus;

        /**
         * Liste des missions actives et en attente.
         * @type {Array<MissionObjet>}
         */
        this.missions = [];

        this.subscribeToEvents();
    }

    /**
     * S'abonne aux événements pertinents de l'EventBus, notamment pour gérer l'échec des missions.
     */
    subscribeToEvents() {
        if (!this.eventBus) {
            console.error("[MissionManager] EventBus non fourni au constructeur.");
            return;
        }
        this.eventBus.subscribe(EVENTS.MISSION.FAILED, data => this.failMission(data));
    }

    /**
     * Crée une nouvelle mission et l'ajoute à la liste des missions.
     * @param {string} from - Planète ou lieu de départ de la mission.
     * @param {string} to - Planète ou lieu de destination de la mission.
     * @param {Array<{type: string, quantity: number}>} requiredCargo - Tableau d'objets décrivant les types et quantités de cargaison requis.
     * @param {number} reward - Récompense numérique (par exemple, crédits) offerte pour la complétion de la mission.
     * @returns {MissionObjet|null} L'objet mission créé, ou null si la validation de `requiredCargo` échoue.
     */
    createMission(from, to, requiredCargo, reward) {
        if (!Array.isArray(requiredCargo) || requiredCargo.length === 0 || requiredCargo.some(item => !item.type || typeof item.quantity !== 'number' || item.quantity <= 0)) {
            console.error("[MissionManager] Tentative de création de mission avec requiredCargo invalide (doit être un tableau non vide avec type et quantité positive).", requiredCargo);
            return null;
        }
        
        const mission = {
            id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            from,
            to,
            requiredCargo,
            reward,
            status: "pending"
        };
        this.missions.push(mission);
        // const cargoString = requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', '); // Variable non utilisée
        return mission;
    }

    /**
     * Vérifie si des missions en attente peuvent être complétées en fonction du cargo de la fusée et de sa localisation actuelle.
     * La complétion d'une mission est "tout ou rien" : tous les items requis doivent être présents.
     * Si une mission est complétée, les cargaisons correspondantes sont retirées de la fusée.
     * @param {RocketCargo} rocketCargo - L'instance du gestionnaire de cargo de la fusée.
     * @param {string} currentLocation - Le nom de la localisation actuelle de la fusée (planète, station, etc.).
     * @returns {Array<MissionObjet>} Une liste des missions qui ont été complétées lors de cet appel. Peut être vide.
     */
    checkMissionCompletion(rocketCargo, currentLocation) {
        const completedMissions = [];

        for (const mission of this.missions) {
            if (mission.status !== "pending") continue;

            if (mission.to === currentLocation) {
                let canComplete = true;
                const cargoList = rocketCargo.getCargoList();

                for (const requiredItem of mission.requiredCargo) {
                    const cargoItem = cargoList.find(item => item.type === requiredItem.type);
                    if (!cargoItem || cargoItem.quantity < requiredItem.quantity) {
                        canComplete = false;
                        break; 
                    }
                }
                
                if (canComplete) {
                    mission.requiredCargo.forEach(requiredItem => {
                         rocketCargo.removeCargo(requiredItem.type, requiredItem.quantity); 
                    });
                    // const cargoString = mission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', '); // Variable non utilisée
                    
                    mission.status = "completed";
                    mission.completedAt = Date.now();
                    completedMissions.push(mission);
                } 
            }
        }

        return completedMissions;
    }

    /**
     * Retourne une liste de toutes les missions actuellement en attente ("pending").
     * @returns {Array<MissionObjet>} Liste des missions actives.
     */
    getActiveMissions() {
        return this.missions.filter(mission => mission.status === "pending");
    }

    /**
     * Retourne la dernière mission complétée (selon timestamp) si disponible.
     * @returns {MissionObjet|null}
     */
    getLastCompletedMission() {
        const completed = this.missions.filter(m => m.status === 'completed' && typeof m.completedAt === 'number');
        if (completed.length === 0) return null;
        completed.sort((a, b) => b.completedAt - a.completedAt);
        return completed[0];
    }

    /**
     * Retourne le lieu d'arrivée de la dernière mission complétée ou null.
     * @returns {string|null}
     */
    getLastCompletedDestination() {
        const last = this.getLastCompletedMission();
        return last ? last.to : null;
    }

    /**
     * Charge une liste de missions depuis des données (ex: JSON du monde) et remplace les missions courantes.
     * @param {Array<{id?:string, from:string, to:string, requiredCargo:Array<{type:string,quantity:number}>, reward:number, description?:string}>} missionsData
     */
    loadFromData(missionsData) {
        if (!Array.isArray(missionsData)) {
            console.warn("[MissionManager] loadFromData appelé sans tableau de missions valide.");
            return;
        }
        this.missions = [];
        for (const m of missionsData) {
            if (!m || typeof m.from !== 'string' || typeof m.to !== 'string' || !Array.isArray(m.requiredCargo) || typeof m.reward !== 'number') {
                console.warn('[MissionManager] Mission invalide ignorée:', m);
                continue;
            }
            const sanitized = m.requiredCargo.filter(it => it && typeof it.type === 'string' && typeof it.quantity === 'number' && it.quantity > 0);
            if (sanitized.length === 0) {
                console.warn('[MissionManager] requiredCargo vide/invalid pour mission, ignorée:', m);
                continue;
            }
            this.missions.push({
                id: typeof m.id === 'string' ? m.id : `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                from: m.from,
                to: m.to,
                requiredCargo: sanitized,
                reward: m.reward,
                description: typeof m.description === 'string' ? m.description : undefined,
                status: 'pending'
            });
        }
        // console.log(`[MissionManager] ${this.missions.length} mission(s) chargée(s) depuis les données.`);
    }

    /**
     * Retourne les détails de la première mission active (statut "pending") dans la liste.
     * Utile pour afficher des informations sur la mission en cours.
     * @returns {MissionObjet|null} La première mission active trouvée, ou null si aucune mission n'est en attente.
     */
    getCurrentMissionDetails() {
        const activeMissions = this.getActiveMissions();
        return activeMissions.length > 0 ? activeMissions[0] : null;
    }

    /**
     * Vérifie si au moins une mission dans la liste a le statut "completed".
     * Utilisé par HeadlessRocketEnvironment pour déterminer si une récompense de mission doit être donnée
     * ou si l'épisode doit se terminer.
     * @returns {boolean} True si au moins une mission est complétée, false sinon.
     */
    isCurrentMissionSuccessful() {
        return this.missions.some(mission => mission.status === "completed");
    }

    /**
     * Réinitialise la liste des missions à un état prédéfini.
     * Vide les missions existantes et en crée de nouvelles (par exemple, pour démarrer une nouvelle partie).
     */
    resetMissions() {
        this.missions = []; 
        // Exemples de missions initiales :
        this.createMission("Terre", "Lune", [{ type: "Fuel", quantity: 10 }], 100); 
        this.createMission("Lune", "Terre", [{ type: "Wrench", quantity: 10 }], 150);
        this.createMission("Terre", "Mars", [{ type: "Fuel", quantity: 5 }, { type: "Wrench", quantity: 5 }], 300);
        this.createMission("Mars", "Terre", [{ type: "🧑‍🚀", quantity: 10 }], 500); 
    }

    /**
     * Gère l'échec d'une mission, généralement suite à un événement reçu via l'EventBus.
     * Met à jour le statut de la mission à "failed".
     * @param {{mission: MissionObjet}} data - Données de l'événement contenant l'objet mission concerné.
     *                                     L'objet `data` doit avoir une propriété `mission` qui est une `MissionObjet`.
     */
    failMission(data) {
        if (!data || !data.mission || !data.mission.id) {
            console.error("[MissionManager] Tentative d'échec de mission avec des données invalides.", data);
            return;
        }
        const mission = this.missions.find(m => m.id === data.mission.id && m.status === 'pending');
        if (mission) {
            mission.status = "failed";
            console.log(`❌ Mission échouée : ${mission.from} → ${mission.to} (ID: ${mission.id}). Raison probable : fusée détruite ou problème en route.`);
            // TODO: Remettre la cargaison à zéro si la mission échoue (nécessite une référence claire ou un événement pour RocketCargo).
            
            // Optionnel: Publier un événement pour notifier d'autres systèmes (UI, etc.) que la mission a spécifiquement échoué ici.
            // Note : L'événement EVENTS.MISSION.FAILED est déjà émis par la source de l'échec (ex: CollisionHandler),
            // cette ré-émission pourrait être redondante ou servir à une logique spécifique post-échec ici.
            // Pour l'instant, on considère que l'abonnement initial à EVENTS.MISSION.FAILED suffit.
            // this.eventBus.emit(EVENTS.MISSION.FAILED_PROCESSED, { mission }); // Exemple de nouvel événement si nécessaire
        }
    }

    /**
     * Charge le cargo nécessaire dans la fusée pour la première mission active partant de la localisation spécifiée.
     * Si une mission correspondante est trouvée, le cargo actuel de la fusée est d'abord vidé,
     * puis les items requis pour la mission sont ajoutés.
     * @param {string} location - Le nom de la planète/lune où se trouve la fusée et d'où la mission doit partir.
     * @param {RocketModel} rocketModel - Le modèle de la fusée, utilisé pour accéder et modifier son cargo.
     *                                  Doit posséder une propriété `cargo` de type `RocketCargo`.
     */
    loadCargoForCurrentLocationMission(location, rocketModel) {
        if (!rocketModel || !rocketModel.cargo) {
            // console.warn("[MissionManager] rocketModel ou rocketModel.cargo non fourni pour loadCargoForCurrentLocationMission."); // Commentaire interne utile au debug
            return;
        }

        const activeMissions = this.getActiveMissions();
        const nextMission = activeMissions.find(m => m.from === location);

        // Vider le cargo actuel de la fusée avant tout, qu'une mission soit trouvée ou non pour ce lieu.
        rocketModel.cargo.clearCargo(); // Supposant que RocketCargo a une méthode clearCargo() ou on réassigne cargoItems

        if (nextMission) {
            // Tenter de charger chaque item requis pour la mission.
            // La méthode addCargo de RocketCargo devrait retourner un booléen indiquant le succès.
            nextMission.requiredCargo.forEach(item => {
                const loaded = rocketModel.cargo.addCargo(item.type, item.quantity);
                if (!loaded) {
                    // Gérer l'échec de chargement d'un item si nécessaire (par ex. log, ou annuler le chargement partiel)
                    // Pour l'instant, on continue de charger les autres items.
                    console.warn(`[MissionManager] Échec du chargement de ${item.quantity} x ${item.type} pour la mission ${nextMission.id}. Cargo plein ou item inconnu?`); 
                }
            });
            // Log optionnel si tout s'est bien passé (ou partiellement)
            // const cargoString = nextMission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
            // console.log(`%c[MissionManager] Cargaison pour mission ${nextMission.id} (${cargoString}) traitée. Vérifiez le cargo de la fusée.`, 'color: lightblue;');
        } else {
            // Aucune mission active trouvée partant de cette localisation. Le cargo a déjà été vidé.
            // console.log(`%c[MissionManager] Aucune mission active au départ de ${location} trouvée. Cargo de la fusée vidé.`, 'color: gray;');
        }
    }

    /**
     * Met à jour le gestionnaire de missions à chaque pas de temps.
     * Cette méthode est appelée par HeadlessRocketEnvironment et GameController
     * pour traiter la logique des missions en temps réel.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière mise à jour en secondes
     * @param {RocketModel} rocketModel - Le modèle de la fusée
     * @param {UniverseModel} universeModel - Le modèle de l'univers
     */
    update(deltaTime, rocketModel, universeModel) {
        // Pour l'instant, cette méthode peut être vide ou contenir une logique minimale
        // Elle pourra être étendue plus tard pour:
        // - Vérifier automatiquement la complétion des missions
        // - Gérer les timeouts de missions
        // - Mettre à jour les objectifs dynamiques
        
        if (!rocketModel || !universeModel) {
            return;
        }

        // Exemple de logique future: vérifier automatiquement la complétion des missions
        // si la fusée est atterrie quelque part
        if (rocketModel.isLanded && rocketModel.landedOn && rocketModel.cargo) {
            // Vérifier la complétion des missions pour la localisation actuelle
            const completedMissions = this.checkMissionCompletion(rocketModel.cargo, rocketModel.landedOn);
            if (completedMissions.length > 0) {
                // Les missions ont été automatiquement marquées comme complétées dans checkMissionCompletion
                console.log(`[MissionManager] ${completedMissions.length} mission(s) complétée(s) sur ${rocketModel.landedOn}`);
            }
        }
    }

    /**
     * Retourne le statut de la mission courante pour les systèmes externes.
     * @returns {object} Un objet contenant les informations de statut des missions
     */
    getCurrentMissionStatus() {
        const activeMissions = this.getActiveMissions();
        const completedMissions = this.missions.filter(mission => mission.status === "completed");
        const failedMissions = this.missions.filter(mission => mission.status === "failed");
        
        return {
            total: this.missions.length,
            active: activeMissions.length,
            completed: completedMissions.length,
            failed: failedMissions.length,
            currentMission: activeMissions.length > 0 ? activeMissions[0] : null,
            hasCompletedMission: completedMissions.length > 0,
            hasFailedMission: failedMissions.length > 0
        };
    }
}

// L'instanciation globale et l'initialisation (resetMissions) sont gérées ailleurs (ex: GameSetupController ou main.js)
// const missionManager = new MissionManager(); 
// missionManager.resetMissions();

// Pas d'exportation par défaut ici, la classe MissionManager sera instanciée où nécessaire.
// export default missionManager; 