/**
 * Classe RocketCargo - Gestion de la cargaison de la fusée
 * @class
 */
class RocketCargo {
    /**
     * Crée une instance de RocketCargo
     * @constructor
     */
    constructor() {
        /**
         * @type {Array<{type: string, quantity: number}>}
         * Liste des éléments de cargaison
         */
        this.cargoItems = [];
        /**
         * @type {number}
         * Capacité maximale du cargo (depuis constants.js)
         */
        this.maxCapacity = ROCKET.CARGO_CAPACITY;
    }

    /**
     * Retourne la charge actuelle du cargo (somme des quantités).
     * @returns {number}
     */
    getCurrentLoad() {
        return this.cargoItems.reduce((total, item) => total + item.quantity, 0);
    }

    /**
     * Retourne la capacité maximale du cargo.
     * @returns {number}
     */
    getMaxCapacity() {
        return this.maxCapacity;
    }

    /**
     * Ajoute un élément à la cargaison, en respectant la capacité maximale.
     * @param {string} type - Type de cargo (ex: "Fuel", "Supplies")
     * @param {number} quantity - Quantité à ajouter
     * @returns {boolean} - True si l'ajout (partiel ou total) a réussi, false si impossible (déjà plein).
     */
    addCargo(type, quantity) {
        const currentLoad = this.getCurrentLoad();
        const availableSpace = this.maxCapacity - currentLoad;

        if (availableSpace <= 0) {
            console.warn(`[RocketCargo] Impossible d'ajouter ${type}. Cargo plein (${currentLoad}/${this.maxCapacity}).`);
            return false; // Cargo déjà plein
        }

        const quantityToAdd = Math.min(quantity, availableSpace);

        if (quantityToAdd <= 0) {
             console.warn(`[RocketCargo] Espace insuffisant pour ajouter ${type}. Espace disponible: ${availableSpace}.`);
             return false; // Pas assez d'espace pour ajouter quoi que ce soit
        }

        const existingItem = this.cargoItems.find(item => item.type === type);
        if (existingItem) {
            existingItem.quantity += quantityToAdd;
        } else {
            this.cargoItems.push({ type, quantity: quantityToAdd });
        }

        if (quantityToAdd < quantity) {
            console.log(`%c[RocketCargo] Ajout partiel de ${type}: ${quantityToAdd}/${quantity} ajouté(s). Capacité atteinte (${this.getCurrentLoad()}/${this.maxCapacity}).`, 'color: orange;');
        } else {
             console.log(`%c[RocketCargo] Ajout de ${type}: ${quantityToAdd} unité(s). Charge actuelle: ${this.getCurrentLoad()}/${this.maxCapacity}.`, 'color: green;');
        }
        
        return true; // Ajout (au moins partiel) réussi
    }

    /**
     * Retire un élément de la cargaison
     * @param {string} type - Type de cargo à retirer
     * @param {number} quantity - Quantité à retirer
     * @returns {boolean} - True si le retrait a réussi, false sinon
     */
    removeCargo(type, quantity) {
        const itemIndex = this.cargoItems.findIndex(item => item.type === type);
        if (itemIndex === -1) return false;

        const item = this.cargoItems[itemIndex];
        if (item.quantity < quantity) return false;

        item.quantity -= quantity;
        if (item.quantity === 0) {
            this.cargoItems.splice(itemIndex, 1);
        }
        return true;
    }

    /**
     * Calcule la masse totale de la cargaison
     * @returns {number} - Masse totale en kg (1 unité = 10kg)
     */
    getTotalMass() {
        return this.cargoItems.reduce((total, item) => total + (item.quantity * 10), 0);
    }

    /**
     * Retourne la liste complète de la cargaison
     * @returns {Array<{type: string, quantity: number}>}
     */
    getCargoList() {
        return [...this.cargoItems];
    }

    /**
     * Vide entièrement la cargaison de la fusée.
     */
    clearCargo() {
        this.cargoItems = [];
        // Optionnel: log pour confirmer que l'action a eu lieu.
        // console.log("%c[RocketCargo] Cargaison vidée.", 'color: yellow;');
    }
}

// export default RocketCargo; // Supprimé car le script est chargé globalement 