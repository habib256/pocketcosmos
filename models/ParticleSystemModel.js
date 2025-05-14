/**
 * Modèle de données pour le système de particules de la fusée.
 * Stocke l'état des différents émetteurs (propulseurs) et des particules de débris.
 *
 * Ce modèle est principalement géré par `ParticleController` et utilisé par `ParticleView` pour le rendu.
 * Il dépend des constantes définies dans `constants.js` (PARTICLES, ROCKET).
 *
 * @important Ce modèle ne contient PAS la logique de création, mise à jour ou dessin des particules.
 * Il sert uniquement de conteneur d'état pour les émetteurs et les débris.
 */
class ParticleSystemModel {
    /**
     * Initialise le modèle du système de particules.
     */
    constructor() {
        /**
         * @private
         * @description Facteur global pour lier le nombre de particules générées à la consommation de carburant.
         * Utilisé pour calculer `particleCountPerEmit` pour chaque émetteur.
         * @type {number}
         */
        const PARTICLES_PER_FUEL_UNIT = 20;

        /**
         * @description Stocke la configuration et l'état de chaque émetteur de particules associé aux propulseurs.
         * Chaque clé (`main`, `left`, `right`, `rear`) représente un émetteur.
         * @type {Object<string, {position: {x: number, y: number}, angle: number, particles: Array<object>, isActive: boolean, particleSpeed: number, colorStart: string, colorEnd: string, particleLifetimeBase: number, particleCountPerEmit: number, spread: number, particleSpeedVar: number, particleLifetimeVar: number, powerLevel: number}>}
         */
        this.emitters = {
            main: {
                position: { x: 0, y: 0 }, // Position absolue (mise à jour par ParticleController)
                angle: Math.PI / 2,        // Angle absolu (mis à jour par ParticleController)
                particles: [],             // Liste des particules actives pour cet émetteur
                isActive: false,           // L'émetteur est-il en train d'émettre ?
                powerLevel: 100,           // Niveau de puissance (0-100), utilisé par ParticleController
                // --- Propriétés issues de constants.js --- //
                particleSpeed: PARTICLES.EMITTER.MAIN.SPEED,
                colorStart: PARTICLES.EMITTER.MAIN.COLOR_START,
                colorEnd: PARTICLES.EMITTER.MAIN.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.MAIN.LIFETIME,
                // Nombre de particules à émettre par tick (basé sur la conso. carburant)
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.MAIN * PARTICLES_PER_FUEL_UNIT)),
                spread: 0.4,               // Angle de dispersion des particules (radians)
                particleSpeedVar: 0.3,     // Variation aléatoire de la vitesse
                particleLifetimeVar: 0.5   // Variation aléatoire de la durée de vie
            },
            left: {
                position: { x: 0, y: 0 },
                angle: 0,
                particles: [],
                isActive: false,
                powerLevel: 100,
                particleSpeed: PARTICLES.EMITTER.LATERAL.SPEED,
                colorStart: PARTICLES.EMITTER.LATERAL.COLOR_START,
                colorEnd: PARTICLES.EMITTER.LATERAL.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.LATERAL.LIFETIME,
                // Divisé par 5 car la conso est plus faible (ajustement empirique)
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.LATERAL * PARTICLES_PER_FUEL_UNIT / 5)),
                spread: 0.3,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
            },
            right: {
                position: { x: 0, y: 0 },
                angle: Math.PI,
                particles: [],
                isActive: false,
                powerLevel: 100,
                particleSpeed: PARTICLES.EMITTER.LATERAL.SPEED,
                colorStart: PARTICLES.EMITTER.LATERAL.COLOR_START,
                colorEnd: PARTICLES.EMITTER.LATERAL.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.LATERAL.LIFETIME,
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.LATERAL * PARTICLES_PER_FUEL_UNIT / 5)),
                spread: 0.3,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
            },
            rear: {
                position: { x: 0, y: 0 },
                angle: -Math.PI / 2,
                particles: [],
                isActive: false,
                powerLevel: 100,
                particleSpeed: PARTICLES.EMITTER.REAR.SPEED,
                colorStart: PARTICLES.EMITTER.REAR.COLOR_START,
                colorEnd: PARTICLES.EMITTER.REAR.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.REAR.LIFETIME,
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.REAR * PARTICLES_PER_FUEL_UNIT / 5)),
                spread: 0.3,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
            }
        };

        /**
         * @description Stocke les particules de débris générées lors des collisions ou destructions.
         * Ces particules sont indépendantes des émetteurs de propulseurs.
         * @type {Array<object>}
         */
        this.debrisParticles = [];

        // La propriété `radius` a été supprimée car non utilisée dans ce modèle.
        // La propriété `powerLevel` est CONSERVÉE car elle est utilisée par ParticleController.
    }

    /**
     * Met à jour la position absolue d'un émetteur spécifique.
     * Appelé par `ParticleController` pour synchroniser avec la position de la fusée.
     * @param {string} emitterName - Nom de l'émetteur (`main`, `left`, `right`, `rear`).
     * @param {number} x - Nouvelle coordonnée X.
     * @param {number} y - Nouvelle coordonnée Y.
     */
    updateEmitterPosition(emitterName, x, y) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].position.x = x;
            this.emitters[emitterName].position.y = y;
        }
    }

    /**
     * Met à jour l'angle absolu d'un émetteur spécifique.
     * Appelé par `ParticleController` pour synchroniser avec l'orientation de la fusée.
     * @param {string} emitterName - Nom de l'émetteur.
     * @param {number} angle - Nouvel angle en radians.
     */
    updateEmitterAngle(emitterName, angle) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].angle = angle;
        }
    }

    /**
     * Active ou désactive un émetteur de particules.
     * @important Cette méthode vérifie l'état de la fusée (`rocketModel`) pour empêcher
     * l'activation si la fusée est détruite ou n'a plus de carburant.
     * Crée une dépendance avec `RocketModel`.
     *
     * @param {string} emitterName - Nom de l'émetteur.
     * @param {boolean} isActive - `true` pour activer, `false` pour désactiver.
     * @param {RocketModel|null} [rocketModel=null] - Le modèle actuel de la fusée pour vérifier son état (destruction, carburant).
     */
    setEmitterActive(emitterName, isActive, rocketModel = null) {
        if (!this.emitters[emitterName]) return; // Sécurité

        // Conditions pour forcer la désactivation
        const forceInactive = isActive && rocketModel && (rocketModel.isDestroyed || rocketModel.fuel <= 0);

        if (forceInactive) {
            this.emitters[emitterName].isActive = false;
        } else {
            this.emitters[emitterName].isActive = isActive;
        }
    }

    /**
     * Définit le niveau de puissance d'un émetteur spécifique.
     * Utilisé par `ParticleController` pour moduler l'émission de particules (nombre, vitesse, etc.).
     * @param {string} emitterName - Nom de l'émetteur.
     * @param {number} powerLevel - Niveau de puissance (0-100).
     */
    setEmitterPowerLevel(emitterName, powerLevel) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].powerLevel = Math.max(0, Math.min(100, powerLevel));
        }
    }

    /**
     * Ajoute une particule de débris à la liste.
     * Typiquement appelé par `ParticleController` suite à un événement de collision/destruction.
     * @param {object} particle - L'objet représentant la particule de débris (structure définie par ParticleController).
     */
    addDebrisParticle(particle) {
        this.debrisParticles.push(particle);
    }

    /**
     * Réinitialise l'état du système de particules.
     * Vide toutes les listes de particules (émetteurs et débris) et désactive tous les émetteurs.
     * Appelé typiquement au début d'une nouvelle partie ou lors d'un reset du jeu.
     */
    reset() {
        for (const emitterName in this.emitters) {
            this.emitters[emitterName].particles = [];
            this.emitters[emitterName].isActive = false;
        }
        this.debrisParticles = [];

        // Vider également les particules de texte et de célébration si elles existent
        if (this.textParticles) {
            this.textParticles = [];
        }
        if (this.celebrationParticles) {
            this.celebrationParticles = [];
        }
        // Réinitialiser l'état du texte de succès de mission
        if (this.missionSuccessText) {
            this.missionSuccessText.visible = false;
        }
    }

    // La méthode `clearAllParticles` a été supprimée car redondante avec `reset`.
} 