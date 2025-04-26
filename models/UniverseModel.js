/**
 * Représente l'état global de l'univers simulé.
 * Contient les collections de corps célestes et d'étoiles d'arrière-plan,
 * ainsi que les propriétés physiques globales comme la constante gravitationnelle.
 * Cette classe fait partie du Modèle dans l'architecture MVC.
 * Elle dépend fortement des valeurs définies dans `constants.js`.
 */
class UniverseModel {
    /**
     * Initialise le modèle de l'univers.
     * Définit les dimensions (potentiellement pour des limites ou des optimisations),
     * la constante gravitationnelle, et initialise les étoiles d'arrière-plan.
     */
    constructor() {
        /**
         * @type {Array<object>} Liste des modèles de données des corps célestes (planètes, lunes, soleil).
         * Chaque objet doit avoir au minimum une propriété `position` et une méthode `updateOrbit`.
         */
        this.celestialBodies = [];

        /**
         * @type {Array<object>} Liste des étoiles d'arrière-plan pour l'effet visuel.
         * Chaque objet contient des propriétés `x`, `y`, `brightness`, `twinkleSpeed`.
         */
        this.stars = [];

        /**
         * @type {number} Largeur théorique de l'univers, basée sur MAX_COORDINATE.
         * Pourrait être utilisée pour définir des limites ou optimiser le rendu.
         */
        this.width = PHYSICS.MAX_COORDINATE * 2;
        /**
         * @type {number} Hauteur théorique de l'univers, basée sur MAX_COORDINATE.
         * Pourrait être utilisée pour définir des limites ou optimiser le rendu.
         */
        this.height = PHYSICS.MAX_COORDINATE * 2;
        /**
         * @type {number} Nombre d'étoiles à générer pour l'arrière-plan. Provient de `constants.js`.
         */
        this.starCount = PARTICLES.STAR_COUNT;

        /**
         * @type {number} Constante gravitationnelle G, utilisée pour les calculs de gravité. Provient de `constants.js`.
         */
        this.gravitationalConstant = PHYSICS.G;

        /**
         * @type {number} Temps écoulé depuis le début de la simulation (ou depuis la création de l'instance), utilisé pour animer le scintillement des étoiles. Mis à jour dans la méthode `update`.
         * Initialisé à 0 ici pour plus de clarté.
         */
        this.elapsedTime = 0;

        // Génération initiale des étoiles d'arrière-plan
        this.initializeStars();
    }

    /**
     * Crée et stocke les étoiles d'arrière-plan avec des positions et des vitesses
     * de scintillement aléatoires, basées sur les constantes définies dans `PARTICLES`.
     * @private
     */
    initializeStars() {
        // Créer les étoiles
        for (let i = 0; i < this.starCount; i++) {
            // Position aléatoire dans un cercle autour de l'origine (0,0)
            const angle = Math.random() * Math.PI * 2;
            // Le rayon visible détermine jusqu'où les étoiles peuvent apparaître
            const distance = Math.random() * PARTICLES.VISIBLE_RADIUS;

            this.stars.push({
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                // Luminosité de base + variation aléatoire pour un aspect plus naturel
                brightness: PARTICLES.STAR_BRIGHTNESS_BASE + Math.random() * PARTICLES.STAR_BRIGHTNESS_RANGE,
                // Vitesse individuelle de scintillement pour chaque étoile
                twinkleSpeed: Math.random() * PARTICLES.STAR_TWINKLE_FACTOR
            });
        }
    }

    /**
     * Met à jour la luminosité des étoiles pour créer un effet de scintillement.
     * Utilise le temps écoulé (`elapsedTime`) pour faire varier la luminosité de manière sinusoïdale.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière mise à jour (non utilisé directement ici, mais pourrait l'être pour une animation plus complexe).
     * @private
     */
    updateStars(deltaTime) {
        // Mettre à jour la luminosité des étoiles pour l'effet de scintillement
        for (const star of this.stars) {
            // La fonction sinus crée une oscillation douce de la luminosité autour de la valeur de base.
            star.brightness = PARTICLES.STAR_BRIGHTNESS_BASE +
                Math.sin(this.elapsedTime * star.twinkleSpeed) * PARTICLES.STAR_BRIGHTNESS_RANGE;
        }
    }

    // La méthode getRandomStarColor a été supprimée car elle n'était pas utilisée.

    /**
     * Ajoute un nouveau corps céleste (modèle de données) à la simulation.
     * @param {object} body - Le modèle de données du corps céleste à ajouter.
     */
    addCelestialBody(body) {
        this.celestialBodies.push(body);
    }

    /**
     * Supprime un corps céleste de la simulation.
     * @param {object} body - Le modèle de données du corps céleste à supprimer.
     */
    removeCelestialBody(body) {
        const index = this.celestialBodies.indexOf(body);
        if (index !== -1) {
            this.celestialBodies.splice(index, 1);
        }
    }

    /**
     * Trouve le corps céleste le plus proche d'une position donnée dans l'univers.
     * Utile pour déterminer la principale influence gravitationnelle ou pour d'autres logiques de proximité.
     * @param {{x: number, y: number}} position - La position {x, y} à partir de laquelle chercher.
     * @param {object|null} [excludeBody=null] - Un corps céleste optionnel à exclure de la recherche (par exemple, lui-même).
     * @returns {{body: object|null, distance: number}} Un objet contenant le corps le plus proche (`body`) et sa distance (`distance`). `body` est null si aucun corps n'est trouvé ou si la liste est vide.
     */
    findNearestBody(position, excludeBody = null) {
        let nearestBody = null;
        let minDistance = Infinity;

        for (const body of this.celestialBodies) {
            // Si ce corps est celui à exclure, on passe au suivant
            if (body === excludeBody) continue;

            const dx = body.position.x - position.x;
            const dy = body.position.y - position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                nearestBody = body;
            }
        }

        return { body: nearestBody, distance: minDistance };
    }

    /**
     * Met à jour l'état de l'univers pour une frame donnée.
     * Incrémente le temps écoulé, met à jour l'animation des étoiles,
     * et met à jour la position orbitale de chaque corps céleste.
     * @param {number} deltaTime - Le temps (en secondes ou millisecondes, selon la convention de la boucle de jeu) écoulé depuis la dernière frame.
     */
    update(deltaTime) {
        // Mettre à jour le temps total écoulé pour les animations dépendantes du temps
        this.elapsedTime += deltaTime;

        // Mettre à jour l'animation de scintillement des étoiles
        this.updateStars(deltaTime);

        // Mettre à jour la position de chaque corps céleste en fonction de son orbite
        for (const body of this.celestialBodies) {
            // Chaque corps céleste est responsable de la mise à jour de sa propre position orbitale.
            // Voir la classe/l'objet qui définit 'body' pour l'implémentation de updateOrbit.
            body.updateOrbit(deltaTime);

            // Le code commenté pour body.update(deltaTime) et updateMoon a été supprimé car il semblait obsolète
            // ou redondant avec updateOrbit. Si une logique de mise à jour plus générale est nécessaire
            // pour les corps célestes au-delà de l'orbite, elle devrait être gérée de manière cohérente.
        }
    }
} 