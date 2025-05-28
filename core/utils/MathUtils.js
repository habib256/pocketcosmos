/**
 * Utilitaires mathématiques pour PocketCosmos
 */

const MathUtils = {
    /**
     * Calcule la distance entre deux points
     * Peut accepter soit 4 paramètres (x1, y1, x2, y2) soit 2 objets {x, y}
     */
    distance(x1, y1, x2, y2) {
        // Si le premier paramètre est un objet avec x et y
        if (typeof x1 === 'object' && x1.hasOwnProperty('x') && x1.hasOwnProperty('y')) {
            const point1 = x1;
            const point2 = y1; // Le deuxième paramètre est le deuxième point
            const dx = point2.x - point1.x;
            const dy = point2.y - point1.y;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        // Sinon, utiliser les 4 paramètres séparés
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Normalise un angle entre -π et π
     */
    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    },

    /**
     * Convertit des degrés en radians
     */
    degToRad(degrees) {
        return degrees * Math.PI / 180;
    },

    /**
     * Convertit des radians en degrés
     */
    radToDeg(radians) {
        return radians * 180 / Math.PI;
    },

    /**
     * Clamp une valeur entre min et max
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
};

// Rendre disponible globalement
window.MathUtils = MathUtils; 