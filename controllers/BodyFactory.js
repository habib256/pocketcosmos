/**
 * Factory pour créer les corps physiques Matter.js (fusée, corps célestes).
 * Gère la configuration initiale des propriétés physiques, des filtres de collision
 * et des plugins (ex: attracteurs gravitationnels).
 */
class BodyFactory {
    /**
     * @param {Matter.Bodies} Bodies Référence au module Matter.Bodies.
     * @param {Matter.Body} Body Référence au module Matter.Body.
     * @param {MatterAttractors} Attractors Référence au plugin MatterAttractors.
     * @param {object} ROCKET Constantes de configuration de la fusée.
     * @param {object} PHYSICS Constantes physiques globales.
     */
    constructor(Bodies, Body, Attractors, ROCKET, PHYSICS) {
        this.Bodies = Bodies;
        this.Body = Body;
        this.Attractors = Attractors;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;

        // TODO: Déplacer les catégories de collision vers constants.js pour une meilleure centralisation.
        // Suppression de la définition locale, utilisation de this.PHYSICS.COLLISION_CATEGORIES
        /*
        this.COLLISION_CATEGORIES = {
            ROCKET: 0x0001,
            CELESTIAL: 0x0002,
            // Ajouter d'autres catégories si nécessaire
        };
        */
    }

    /**
     * Crée le corps physique Matter.js pour la fusée.
     * @param {RocketModel} rocketModel Le modèle de données de la fusée.
     * @returns {Matter.Body} Le corps physique de la fusée.
     */
    createRocketBody(rocketModel) {
        const rocketBody = this.Bodies.rectangle(
            rocketModel.position.x,
            rocketModel.position.y,
            this.ROCKET.WIDTH,
            this.ROCKET.HEIGHT,
            {
                mass: this.ROCKET.MASS,
                inertia: this.ROCKET.MASS * 1.5, // Inertie pour un rectangle plein
                friction: 0.8, // Friction standard
                restitution: 0.05, // Peu de rebond
                angle: rocketModel.angle,
                isStatic: false,
                label: 'rocket',
                frictionAir: 0.1, // Simule la résistance de l'air ou du vide spatial léger
                // L'amortissement angulaire est défini dynamiquement dans PhysicsController
                sleepThreshold: -1, // Empêche le corps de "s'endormir" et d'être exclu de la simulation
                collisionFilter: {
                    // Catégorie: ROCKET (0x0001)
                    category: this.PHYSICS.COLLISION_CATEGORIES.ROCKET,
                    // Masque: Collision avec TOUT (0xFFFFFFFF) par défaut
                    mask: 0xFFFFFFFF
                },
                plugin: {
                    attractors: [
                        // Applique l'attraction gravitationnelle standard (inverse carré)
                        // fournie par le plugin matter-attractors.
                        this.Attractors.Attractors.gravity
                    ]
                }
            }
        );

        // La synchronisation initiale (vélocité, angle) est gérée par PhysicsController
        // après l'ajout du corps au monde physique, pour assurer la cohérence.

        return rocketBody;
    }

    /**
     * Crée le corps physique Matter.js pour un corps céleste (planète, lune, etc.).
     * @param {CelestialBodyModel} bodyModel Le modèle de données du corps céleste.
     * @returns {Matter.Body} Le corps physique du corps céleste.
     */
    createCelestialBody(bodyModel) {
        const options = {
            mass: bodyModel.mass,
            isStatic: true, // Les corps célestes sont immobiles dans cette simulation
            label: bodyModel.name, // Nom du corps pour identification
            collisionFilter: {
                // Catégorie: CELESTIAL (0x0002)
                category: this.PHYSICS.COLLISION_CATEGORIES.CELESTIAL,
                // Masque: Collision UNIQUEMENT avec ROCKET (0x0001)
                mask: this.PHYSICS.COLLISION_CATEGORIES.ROCKET
            },
            restitution: this.PHYSICS.RESTITUTION, // Rebond global défini dans les constantes
            friction: 0.05, // Faible friction pour les collisions
            plugin: {
                attractors: [
                     // Applique l'attraction gravitationnelle standard (inverse carré)
                    // fournie par le plugin matter-attractors.
                    this.Attractors.Attractors.gravity
                ]
            }
        };

        const celestialBody = this.Bodies.circle(
            bodyModel.position.x,
            bodyModel.position.y,
            bodyModel.radius,
            options
        );

        return celestialBody;
    }
} 