// (ne pas utiliser import RocketAgent ...)

class AIController {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.rocketAgent = new RocketAgent(eventBus);

        // Écoute les commandes d'activation/désactivation IA
        this.eventBus.subscribe('TOGGLE_AI_CONTROL', () => this.toggleAI());
        this.eventBus.subscribe('TOGGLE_TRAINING', () => {
            console.log('[AIController] Réception de TOGGLE_TRAINING');
            this.toggleTraining();
        });
        // (Optionnel) expose d'autres méthodes ou écoute d'autres événements
    }

    toggleAI() {
        this.rocketAgent.toggleActive();
    }

    toggleTraining() {
        this.rocketAgent.toggleTraining();
    }

    // (Optionnel) méthodes pour sauvegarder/charger le modèle
    saveModel() {
        this.rocketAgent.saveModel();
    }

    loadModel() {
        this.rocketAgent.loadModel();
    }

    // (Optionnel) méthode pour changer d'objectif
    setObjective(obj) {
        this.rocketAgent.setObjective(obj);
    }
}

window.AIController = AIController;
// (ne rien exporter) 