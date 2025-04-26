/**
 * EventBus implémente un système de messagerie publish/subscribe simple.
 * Il permet aux différents modules de l'application de communiquer de manière découplée
 * en s'abonnant à des types d'événements spécifiques et en émettant des événements.
 * Ceci est central pour coordonner les actions entre les contrôleurs, les modèles et les vues.
 *
 * Contexte d'utilisation :
 * - InputController émet des événements pour les entrées utilisateur (clavier, souris, joystick).
 * - PhysicsController peut émettre des événements liés aux collisions ou à l'état physique.
 * - GameController s'abonne aux entrées et à d'autres événements pour orchestrer le jeu.
 * - RenderingController s'abonne aux mises à jour d'état pour redessiner les éléments.
 * - D'autres modules (MissionManager, RocketAgent) utilisent l'EventBus pour la logique métier.
 */
class EventBus {
    /**
     * Initialise une nouvelle instance de EventBus.
     * Crée une Map pour stocker les auditeurs d'événements.
     */
    constructor() {
        /**
         * @private
         * @type {Map<string, Set<Function>>}
         * Stocke les callbacks (auditeurs) pour chaque type d'événement.
         * La clé est le nom du type d'événement (string).
         * La valeur est un Set de fonctions callback associées à ce type.
         * Utiliser un Set garantit que chaque callback n'est enregistré qu'une seule fois par type d'événement.
         */
        this.listeners = new Map();
    }
    
    /**
     * Abonne une fonction callback à un type d'événement spécifique.
     * Lorsque l'événement spécifié est émis via `emit`, le callback sera exécuté.
     *
     * @param {string} eventType - Le nom unique du type d'événement auquel s'abonner (ex: 'INPUT_KEYDOWN', 'ROCKET_CRASHED').
     * @param {Function} callback - La fonction à exécuter lorsque l'événement est émis. Cette fonction recevra les données passées à `emit`.
     * @returns {Function} Une fonction qui, lorsqu'elle est appelée, désabonne le callback de cet événement. Utile pour nettoyer les abonnements.
     * @example
     * const unsubscribeKeydown = eventBus.subscribe('INPUT_KEYDOWN', (data) => console.log('Touche pressée:', data.key));
     * // ... plus tard ...
     * unsubscribeKeydown(); // Se désabonne de l'événement INPUT_KEYDOWN
     */
    subscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);
        
        // Retourner une fonction pour se désabonner facilement
        return () => this.unsubscribe(eventType, callback);
    }
    
    // Alias pour subscribe, compatible avec la syntaxe utilisée dans PhysicsController
    on(eventType, callback) {
        return this.subscribe(eventType, callback);
    }
    
    /**
     * Désabonne une fonction callback spécifique d'un type d'événement.
     * Empêche le callback d'être exécuté lors des prochaines émissions de cet événement.
     * C'est la méthode appelée par la fonction de désabonnement retournée par `subscribe`.
     * Il est généralement préférable d'utiliser la fonction retournée par `subscribe` pour se désabonner.
     *
     * @param {string} eventType - Le nom du type d'événement duquel se désabonner.
     * @param {Function} callback - La fonction callback exacte à supprimer de l'abonnement.
     */
    unsubscribe(eventType, callback) {
        if (this.listeners.has(eventType)) {
            const listenersForEvent = this.listeners.get(eventType);
            listenersForEvent.delete(callback);

            // Optionnel: si plus aucun auditeur pour ce type, supprimer l'entrée de la map pour économiser de la mémoire.
            if (listenersForEvent.size === 0) {
                this.listeners.delete(eventType);
            }
        }
    }
    
    // Alias pour unsubscribe, compatible avec la syntaxe utilisée dans PhysicsController
    off(eventType, callback) {
        this.unsubscribe(eventType, callback);
    }
    
    /**
     * Émet (déclenche) un événement d'un type donné, en passant éventuellement des données aux auditeurs.
     * Tous les callbacks abonnés à ce `eventType` seront exécutés avec les `data` fournies.
     *
     * @param {string} eventType - Le nom du type d'événement à émettre.
     * @param {*} [data] - Données optionnelles à passer à chaque fonction callback abonnée.
     * @example
     * eventBus.emit('ROCKET_STATE_UPDATED', { position: new Vector(10, 20), fuel: 500 });
     */
    emit(eventType, data) {
        if (this.listeners.has(eventType)) {
            // Utiliser [...spread] pour cloner le Set permet d'éviter des problèmes si un callback
            // modifie la liste des auditeurs (subscribe/unsubscribe) pendant l'itération.
            const listenersToNotify = [...this.listeners.get(eventType)];
            for (const callback of listenersToNotify) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Erreur dans un callback EventBus pour l'événement "${eventType}":`, error);
                    // Selon la criticité, on pourrait vouloir arrêter ou juste logguer.
                }
            }
        }
    }
    
    /**
     * Supprime tous les auditeurs pour tous les types d'événements.
     * Utile pour réinitialiser l'état de l'EventBus, par exemple lors du redémarrage
     * d'une partie ou du nettoyage de ressources.
     */
    clear() {
        this.listeners.clear();
    }
} 