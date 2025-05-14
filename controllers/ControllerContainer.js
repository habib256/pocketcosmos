class ControllerContainer {
    constructor() {
        this.subscriptions = [];
        console.log("ControllerContainer instancié.");
    }

    /**
     * Suit une fonction de désabonnement.
     * @param {Function} unsubscribeFn - La fonction à appeler pour se désabonner.
     */
    track(unsubscribeFn) {
        if (typeof unsubscribeFn === 'function') {
            this.subscriptions.push(unsubscribeFn);
        } else {
            console.warn("ControllerContainer.track a reçu quelque chose qui n'est pas une fonction:", unsubscribeFn);
        }
    }

    /**
     * Exécute toutes les fonctions de désabonnement stockées et vide la liste.
     * Devrait également nettoyer l'EventBus si c'est sa responsabilité.
     */
    cleanup() {
        console.log(`ControllerContainer: Nettoyage de ${this.subscriptions.length} abonnements.`);
        this.subscriptions.forEach(unsub => {
            try {
                unsub();
            } catch (e) {
                console.error("Erreur lors du désabonnement via ControllerContainer:", e);
            }
        });
        this.subscriptions = [];

        // Si EventBus a une méthode pour se nettoyer complètement
        if (window.eventBus && typeof window.eventBus.clearAllSubscribers === 'function') {
            console.log("ControllerContainer: Nettoyage de tous les abonnés de l'EventBus.");
            window.eventBus.clearAllSubscribers();
        } else if (window.eventBus && typeof window.eventBus.clear === 'function') { // Fallback pour une méthode 'clear'
             console.log("ControllerContainer: Appel de EventBus.clear().");
             window.eventBus.clear();
        }
    }
} 