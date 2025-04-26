/**
 * Représente l'état d'un corps céleste (planète, lune, soleil) dans la simulation.
 * Contient ses propriétés physiques, orbitales, et son apparence.
 * Le mouvement orbital est géré par la méthode `updateOrbit` basée sur les constantes
 * définies dans `constants.js` et le corps parent.
 */
class CelestialBodyModel {
    /**
     * @param {string} name Nom unique du corps céleste (ex: "Terre", "Lune").
     * @param {number} mass Masse du corps en kg.
     * @param {number} radius Rayon du corps en mètres (pour l'affichage et potentiellement la physique).
     * @param {{x: number, y: number}} position Position initiale (peut être écrasée par le calcul orbital si un parent est défini).
     * @param {string} color Couleur hexadécimale pour le rendu.
     * @param {CelestialBodyModel|null} parentBody Le corps autour duquel celui-ci orbite (null pour le corps central, ex: Soleil).
     * @param {number} orbitDistance Distance orbitale moyenne par rapport au centre du parentBody.
     * @param {number} initialOrbitAngle Angle initial sur l'orbite en radians (0 = axe positif X).
     * @param {number} orbitSpeed Vitesse angulaire orbitale en radians par seconde.
     */
    constructor(name, mass, radius, position, color, parentBody = null, orbitDistance = 0, initialOrbitAngle = 0, orbitSpeed = 0) {
        // Identité
        /** @type {string} */
        this.name = name;
        
        // Propriétés physiques
        /** @type {number} */
        this.mass = mass; // kg
        /** @type {number} */
        this.radius = radius; // m
        /** @type {number} Utilise la constante globale de constants.js */
        this.gravitationalConstant = PHYSICS.G;
        
        // Position et mouvement
        /** @type {{x: number, y: number}} Position actuelle, mise à jour par `updateOrbit`. */
        this.position = position || { x: 0, y: 0 };
        /**
         * @type {{x: number, y: number}} Vélocité instantanée calculée dans `updateOrbit`.
         * Représente le mouvement tangentiel dû à l'orbite + la vélocité du parent.
         * Initialisée ici mais recalculée à chaque frame dans `updateOrbit`.
         */
        this.velocity = { x: 0, y: 0 };
        
        // Apparence
        /** @type {string} Couleur pour le rendu. */
        this.color = color || '#FFFFFF';
        /**
         * @type {{exists: boolean, height: number, color: string}}
         * Propriétés de l'atmosphère pour le rendu. La logique d'existence
         * est actuellement spécifique au nom, mais pourrait être généralisée.
         */
        this.atmosphere = {
            exists: name === 'Terre',
            height: radius * CELESTIAL_BODY.ATMOSPHERE_RATIO, // Hauteur de l'atmosphère
            color: 'rgba(25, 35, 80, 0.4)'  // Bleu très sombre semi-transparent
        };
        
        // Caractéristiques orbitales
        /** @type {CelestialBodyModel|null} Référence au corps parent autour duquel orbiter. */
        this.parentBody = parentBody;
        /** @type {number} Distance orbitale par rapport au parent. */
        this.orbitDistance = orbitDistance;
        /** @type {number} Angle initial sur l'orbite (radians). */
        this.initialOrbitAngle = initialOrbitAngle;
        /** @type {number} Angle actuel sur l'orbite (radians), mis à jour par `updateOrbit`. */
        this.currentOrbitAngle = initialOrbitAngle;
        /** @type {number} Vitesse angulaire orbitale (radians par seconde). */
        this.orbitSpeed = orbitSpeed;
        
        // La propriété 'satellites' et la méthode 'addSatellite' ont été supprimées car non utilisées.
        // La hiérarchie est gérée par `parentBody`.
    }
    
    // La méthode `setVelocity` a été supprimée car la vélocité est entièrement gérée par `updateOrbit`.
    
    // La méthode `calculateGravitationalForce` a été supprimée. La gravité entre corps célestes
    // est implicitement gérée par la mécanique orbitale définie ici, ou par
    // MatterAttractors dans PhysicsController pour l'interaction avec la fusée.
    
    /**
     * Met à jour la position et la vélocité du corps céleste en fonction de son orbite
     * autour de son `parentBody`. Si `parentBody` est null, la position n'est pas modifiée par cette méthode.
     * @param {number} deltaTime Le temps écoulé depuis la dernière mise à jour (en secondes ou fraction de tick).
     */
    updateOrbit(deltaTime) {
        if (!this.parentBody) {
            // Si pas de parent, le corps est statique ou son mouvement est géré ailleurs.
            // On pourrait potentiellement mettre à jour sa vélocité propre ici s'il en avait une.
            // this.position.x += this.velocity.x * deltaTime; // Exemple si mouvement non orbital
            // this.position.y += this.velocity.y * deltaTime;
            return;
        }

        // Mettre à jour l'angle orbital basé sur la vitesse orbitale et le deltaTime.
        this.currentOrbitAngle += this.orbitSpeed * deltaTime;
        // Garder l'angle dans [0, 2*PI] pour éviter des valeurs trop grandes (optionnel mais propre)
        this.currentOrbitAngle %= (2 * Math.PI);

        // Calculer la nouvelle position relative à la position actuelle du parent.
        const relativeX = Math.cos(this.currentOrbitAngle) * this.orbitDistance;
        const relativeY = Math.sin(this.currentOrbitAngle) * this.orbitDistance;

        this.position = {
            x: this.parentBody.position.x + relativeX,
            y: this.parentBody.position.y + relativeY
        };

        // Calculer la vélocité orbitale instantanée (tangentielle à l'orbite).
        // La vitesse tangentielle est V = ω * r (vitesse angulaire * rayon/distance).
        const tangentSpeed = this.orbitSpeed * this.orbitDistance;
        // La direction de la vitesse est perpendiculaire au rayon orbital.
        const velocityX_orbital = -Math.sin(this.currentOrbitAngle) * tangentSpeed;
        const velocityY_orbital = Math.cos(this.currentOrbitAngle) * tangentSpeed;

        // La vélocité totale est la vélocité orbitale + la vélocité du parent.
        // Ceci assure que les lunes bougent correctement avec leur planète.
        this.velocity = {
             x: velocityX_orbital + (this.parentBody.velocity?.x || 0), // Utilise la vélocité du parent si elle existe
             y: velocityY_orbital + (this.parentBody.velocity?.y || 0)
        };
    }
} 