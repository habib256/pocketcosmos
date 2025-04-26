/**
 * Factory pour créer les corps physiques Matter.js (fusée, corps célestes).
 * Gère la configuration initiale des propriétés physiques, des filtres de collision
 * et des plugins (ex: attracteurs gravitationnels).
 * Utilise les constantes définies dans constants.js (ROCKET, PHYSICS).
 */
class BodyFactory {
    /**
     * @param {Matter.Bodies} Bodies Référence au module Matter.Bodies pour créer les formes.
     * @param {Matter.Body} Body Référence au module Matter.Body (moins utilisé ici, mais potentiellement utile).
     * @param {MatterAttractors} Attractors Référence au plugin MatterAttractors pour la gravité.
     * @param {object} ROCKET Constantes spécifiques à la fusée (masse, dimensions...).
     * @param {object} PHYSICS Constantes physiques globales (gravité, collisions...).
     */
    constructor(Bodies, Body, Attractors, ROCKET, PHYSICS) {
        this.Bodies = Bodies;
        this.Body = Body; // Référence conservée si besoin futur d'accéder à Matter.Body
        this.Attractors = Attractors;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;
        // Les catégories de collision (this.PHYSICS.COLLISION_CATEGORIES) sont maintenant
        // correctement récupérées depuis l'objet PHYSICS injecté via constants.js.
        // La définition locale précédente a été supprimée.
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
                // Approximation de l'inertie rotationnelle pour un rectangle plein.
                // Une valeur plus élevée rend la rotation plus difficile à initier/arrêter.
                inertia: this.ROCKET.MASS * 1.5,
                friction: 0.8, // Friction standard lors de contacts (utile pour atterrissage).
                restitution: 0.05, // Très peu de rebond lors des collisions (coefficients entre 0 et 1).
                frictionAir: 0.1, // Simule une légère résistance du milieu (air ou vide spatial). Ralentit le mouvement linéaire et la rotation.
                // L'amortissement angulaire ('angularDamping') est géré dynamiquement
                // par PhysicsController pour implémenter le mode de pilotage assisté.

                // --- État Initial ---
                angle: rocketModel.angle, // Angle initial basé sur le modèle logique.
                isStatic: false, // La fusée est dynamique : affectée par les forces et les collisions.
                label: 'rocket', // Étiquette pour identifier facilement ce corps dans les événements de collision, etc.

                // --- Optimisation & Stabilité de la Simulation ---
                // Empêche Matter.js de mettre le corps en "sommeil" (désactivation
                // temporaire pour l'optimisation) quand il bouge peu ou pas.
                // Crucial pour que la fusée réagisse toujours aux forces (gravité, commandes).
                sleepThreshold: -1, // Valeur spéciale pour désactiver la mise en sommeil.

                // --- Interactions : Filtres de Collision ---
                // Définit avec quels autres objets physiques cette fusée peut entrer en collision.
                collisionFilter: {
                    // Identifie ce corps comme appartenant à la catégorie ROCKET (un bitmask, ex: 0x0001).
                    category: this.PHYSICS.COLLISION_CATEGORIES.ROCKET,
                    // Masque indiquant avec quelles *catégories* la fusée PEUT entrer en collision.
                    // 0xFFFFFFFF (tous les bits à 1) signifie "collision avec toutes les catégories".
                    mask: 0xFFFFFFFF
                },

                // --- Interactions : Activation des Plugins ---
                plugin: {
                    // Active le plugin d'attraction gravitationnelle pour ce corps.
                    attractors: [
                        // Utilise la fonction de gravité standard (loi en carré inverse de la distance)
                        // fournie par le plugin 'matter-attractors'.
                        // La fusée sera ainsi attirée par les corps célestes (qui utilisent aussi ce plugin).
                        this.Attractors.Attractors.gravity
                    ]
                }
            }
        );

        // Note importante : La vélocité initiale (linéaire et angulaire) n'est pas définie ici.
        // Elle est synchronisée par PhysicsController *après* que le corps a été ajouté
        // au monde physique (World) pour assurer la cohérence avec l'état du modèle logique.

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
            // Les corps célestes sont statiques : ils ne bougent pas et ne sont pas affectés
            // par les forces (y compris la gravité des autres corps) ou les collisions dans la simulation physique.
            // C'est un choix de conception pour simplifier la simulation du système solaire/planétaire.
            isStatic: true,
            label: bodyModel.name, // Nom du corps pour identification facile (ex: 'Earth', 'Moon').
            restitution: this.PHYSICS.RESTITUTION, // Coefficient de rebond global (affecte la fusée si elle collisionne).
            friction: 0.05, // Faible friction (affecte la fusée si elle collisionne).

            // --- Interactions : Filtres de Collision ---
            collisionFilter: {
                // Identifie ce corps comme appartenant à la catégorie CELESTIAL (ex: 0x0002).
                category: this.PHYSICS.COLLISION_CATEGORIES.CELESTIAL,
                // Masque indiquant avec quelles catégories ce corps PEUT entrer en collision.
                // Ici, spécifie que ce corps céleste ne peut entrer en collision QU'AVEC la catégorie ROCKET.
                // Cela empêche les collisions entre corps célestes (qui sont statiques de toute façon)
                // et potentiellement d'autres catégories futures si elles étaient ajoutées.
                mask: this.PHYSICS.COLLISION_CATEGORIES.ROCKET
            },

            // --- Interactions : Activation des Plugins ---
            plugin: {
                 // Active l'attraction gravitationnelle pour ce corps.
                attractors: [
                    // Utilise la fonction de gravité standard. Ce corps céleste statique
                    // va attirer les autres corps non-statiques qui ont aussi ce plugin (comme la fusée).
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