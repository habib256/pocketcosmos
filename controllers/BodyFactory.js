/**
 * Factory pour créer les corps physiques Matter.js (fusée, corps célestes).
 * Gère la configuration initiale des propriétés physiques, des filtres de collision
 * et des plugins (ex: attracteurs gravitationnels).
 * Utilise les constantes définies dans constants.js (ROCKET, PHYSICS).
 */
class BodyFactory {
    /**
     * @param {Matter.Bodies} Bodies Référence au module Matter.Bodies pour créer les formes.
     * @param {Matter.Body} Body Référence au module Matter.Body (conservée pour compatibilité d'appel, même si non utilisé directement ici).
     * @param {MatterAttractors} Attractors Référence au plugin MatterAttractors pour la gravité.
     * @param {object} ROCKET Constantes spécifiques à la fusée (masse, dimensions...).
     * @param {object} PHYSICS Constantes physiques globales (gravité, collisions...).
     */
    constructor(Bodies, Body, Attractors, ROCKET, PHYSICS) {
        this.Bodies = Bodies;
        this.Body = Body; // Référence conservée pour assurer la compatibilité de l'instanciation.
        this.Attractors = Attractors;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;
        // Le commentaire redondant sur l'injection des catégories de collision a été supprimé.
    }

    /**
     * Crée le corps physique Matter.js pour la fusée.
     * @param {RocketModel} rocketModel Le modèle de données de la fusée (pour position/angle initiaux).
     * @returns {Matter.Body} Le corps physique de la fusée.
     */
    createRocketBody(rocketModel) {
        const rocketBody = this.Bodies.rectangle(
            rocketModel.position.x,
            rocketModel.position.y,
            this.ROCKET.WIDTH,
            this.ROCKET.HEIGHT,
            {
                // --- Propriétés Physiques (tirées de constants.js) ---
                mass: this.ROCKET.MASS,
                // Moment d'inertie : Influence la facilité de rotation. Une valeur plus élevée
                // signifie plus de résistance au changement de vitesse angulaire (plus difficile à faire tourner ou à arrêter).
                // L'approximation ici (masse * 1.5) est une simplification pour un rectangle.
                inertia: this.ROCKET.MASS * 1.5,
                friction: 0.8, // Friction standard lors de contacts (utile pour l'atterrissage).
                restitution: 0.05, // Très peu de rebond lors des collisions (coefficients entre 0 et 1).
                frictionAir: 0.1, // Simule une légère résistance du milieu (air ou vide spatial). Ralentit le mouvement linéaire et la rotation.
                // L'amortissement angulaire ('angularDamping') est géré dynamiquement
                // par PhysicsController pour implémenter le mode de pilotage assisté.

                // --- État Initial ---
                angle: rocketModel.angle, // Angle initial basé sur le modèle logique.
                isStatic: false, // La fusée est dynamique : affectée par les forces et les collisions.
                label: 'rocket', // Étiquette pour identifier facilement ce corps dans les événements de collision, etc.

                // --- Optimisation & Stabilité de la Simulation ---
                // Empêche Matter.js de mettre le corps en "sommeil" (sleep) lorsque sa vitesse
                // est faible. Mettre sleepThreshold à -1 désactive cette mise en sommeil.
                // Ceci est CRUCIAL pour la fusée car elle doit pouvoir réagir en permanence
                // aux forces (gravité, commandes du joueur) même si elle dérive lentement dans l'espace.
                sleepThreshold: -1,

                // --- Interactions : Filtres de Collision ---
                collisionFilter: {
                    category: this.PHYSICS.COLLISION_CATEGORIES.ROCKET,
                    // Masque indiquant avec quelles *catégories* la fusée PEUT entrer en collision.
                    // 0xFFFFFFFF (tous les bits à 1) signifie "collision avec toutes les catégories".
                    mask: 0xFFFFFFFF // Peut collisionner avec tout par défaut.
                },

                // --- Interactions : Activation des Plugins ---
                plugin: {
                    // Active le plugin d'attraction gravitationnelle pour ce corps.
                    attractors: [
                        // Utilise la fonction de gravité standard (loi en carré inverse de la distance)
                        // fournie par le plugin 'matter-attractors'.
                        // La fusée sera ainsi attirée par les corps célestes (qui utilisent aussi ce plugin
                        // et ne sont pas 'isStatic').
                        this.Attractors.Attractors.gravity
                    ]
                }
            }
        );

        // Note importante : La vélocité initiale (linéaire et angulaire) n'est PAS définie ici
        // lors de la création du corps. Elle est appliquée plus tard par PhysicsController
        // après l'ajout du corps au monde physique (World). Ceci est fait pour assurer une
        // synchronisation correcte entre l'état logique (RocketModel) et l'état physique (Matter.Body)
        // au démarrage ou lors de changements d'état.

        return rocketBody;
    }

    /**
     * Crée le corps physique Matter.js pour un corps céleste (planète, lune, etc.).
     * @param {CelestialBodyModel} bodyModel Le modèle de données du corps céleste (masse, rayon, position).
     * @returns {Matter.Body} Le corps physique du corps céleste.
     */
    createCelestialBody(bodyModel) {
        const options = {
            // --- Propriétés Physiques (tirées du bodyModel et de constants.js) ---
            mass: bodyModel.mass, // Masse définie par le modèle du corps céleste. Crucial pour la gravité qu'il génère.
            // Les corps célestes sont définis comme 'isStatic: true'.
            // Conséquences :
            // 1. Immobiles : Ils ne sont pas affectés par les forces (gravité, collisions).
            // 2. Stabilité : Simplifie la simulation, pas besoin de calculer leur orbite complexe.
            // 3. Attraction Unidirectionnelle (avec le plugin) : Ils attirent les corps non-statiques (la fusée),
            //    mais ne sont pas attirés en retour par eux.
            isStatic: true,
            label: bodyModel.name, // Nom du corps pour identification facile (ex: 'Earth', 'Moon').
            restitution: this.PHYSICS.RESTITUTION, // Coefficient de rebond global (affecte la fusée si elle collisionne).
            friction: 0.05, // Faible friction (affecte la fusée si elle collisionne).

            // --- Interactions : Filtres de Collision ---
            collisionFilter: {
                // Identifie ce corps comme appartenant à la catégorie CELESTIAL (ex: 0x0002).
                category: this.PHYSICS.COLLISION_CATEGORIES.CELESTIAL,
                // Masque indiquant avec quelles catégories ce corps PEUT entrer en collision.
                // Ici, il ne peut collisionner QU'AVEC la catégorie ROCKET.
                // Empêche les collisions entre corps célestes (inutiles car statiques).
                mask: this.PHYSICS.COLLISION_CATEGORIES.ROCKET
            },

            // --- Interactions : Activation des Plugins ---
            plugin: {
                 // Active l'attraction gravitationnelle pour ce corps céleste.
                attractors: [
                    // Utilise la fonction de gravité standard. Ce corps statique va
                    // attirer les autres corps non-statiques qui ont aussi ce plugin (la fusée).
                    this.Attractors.Attractors.gravity
                ]
            }
        };

        // Crée un corps physique circulaire pour représenter le corps céleste.
        const celestialBody = this.Bodies.circle(
            bodyModel.position.x,
            bodyModel.position.y,
            bodyModel.radius,
            options // Applique toutes les options définies ci-dessus.
        );

        return celestialBody;
    }
} 