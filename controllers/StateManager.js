/**
 * Gestionnaire des états du jeu.
 * @class
 */
class StateManager {
    /**
     * États possibles du jeu.
     * @readonly
     * @enum {string}
     */
    static STATES = {
        MENU: 'MENU',           // Affichage des instructions/menu initial
        PLAYING: 'PLAYING',       // Jeu en cours normal
        PAUSED: 'PAUSED',         // Jeu en pause
        GAME_OVER: 'GAME_OVER',   // Fusée détruite
        PLANET_MENU: 'PLANET_MENU', // Interaction sur une planète (options, marchand)
        AI_ACTIVE: 'AI_ACTIVE',   // (Futur) IA contrôle la fusée
        AI_TRAINING: 'AI_TRAINING' // (Futur) Mode d'entraînement IA
    };

    /**
     * Crée une instance de StateManager.
     * @param {EventBus} eventBus - L'instance de l'EventBus.
     */
    constructor(eventBus) {
        if (!eventBus) {
            throw new Error("[StateManager] EventBus instance is required.");
        }
        this.eventBus = eventBus;
        this.currentState = StateManager.STATES.MENU; // État initial
        this.previousState = null;
        console.log(`[StateManager] Initial state: ${this.currentState}`);
    }

    /**
     * Définit le nouvel état du jeu.
     * @param {string} newState - Le nouvel état (doit être une valeur de StateManager.STATES).
     */
    setState(newState) {
        if (!Object.values(StateManager.STATES).includes(newState)) {
            console.warn(`[StateManager] Attempted to set invalid state: ${newState}`);
            return;
        }

        if (newState !== this.currentState) {
            this.previousState = this.currentState;
            this.currentState = newState;
            console.log(`[StateManager] State changed from ${this.previousState} to ${this.currentState}`);
            this.eventBus.emit('gameStateChanged', { 
                newState: this.currentState, 
                previousState: this.previousState 
            });
        }
    }

    /**
     * Retourne l'état actuel du jeu.
     * @returns {string} L'état actuel.
     */
    getState() {
        return this.currentState;
    }

    /**
     * Vérifie si l'état actuel correspond à l'état donné.
     * @param {string} stateToCheck - L'état à vérifier (doit être une valeur de StateManager.STATES).
     * @returns {boolean} True si l'état actuel correspond.
     */
    isState(stateToCheck) {
        return this.currentState === stateToCheck;
    }

    /**
     * Retourne à l'état précédent (utile pour sortir de pause).
     */
    returnToPreviousState() {
        if (this.previousState) {
            this.setState(this.previousState);
        } else {
            // Fallback si pas d'état précédent (ne devrait pas arriver depuis PAUSE)
            this.setState(StateManager.STATES.PLAYING);
        }
    }
} 