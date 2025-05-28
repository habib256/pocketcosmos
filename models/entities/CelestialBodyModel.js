/**
 * Représente l'état d'un corps céleste (planète, lune, soleil) dans la simulation.
 * Contient ses propriétés physiques, orbitales, et son apparence.
 * Le mouvement orbital est géré par la méthode `updateOrbit` basée sur les constantes
 * définies dans `constants.js` et le corps parent.
 */
class CelestialBodyModel {
    /**
     * @param {object} options Options de configuration pour le corps céleste
     * @param {string} options.name Nom unique du corps céleste (ex: "Terre", "Lune").
     * @param {number} options.mass Masse du corps en kg.
     * @param {number} options.radius Rayon du corps en mètres (pour l'affichage et potentiellement la physique).
     * @param {{x: number, y: number}} options.position Position initiale (peut être écrasée par le calcul orbital si un parent est défini).
     * @param {string} options.color Couleur hexadécimale pour le rendu.
     * @param {string} options.type Type de corps céleste ('star', 'planet', 'moon').
     * @param {CelestialBodyModel|null} options.parentBody Le corps autour duquel celui-ci orbite (null pour le corps central, ex: Soleil).
     * @param {number} options.orbitDistance Distance orbitale moyenne par rapport au centre du parentBody.
     * @param {number} options.initialOrbitAngle Angle initial sur l'orbite en radians (0 = axe positif X).
     * @param {number} options.orbitSpeed Vitesse angulaire orbitale en radians par seconde.
     */
    constructor(options = {}) {
        // Support pour l'ancienne signature (rétrocompatibilité)
        if (typeof options === 'string') {
            const [name, mass, radius, position, color, parentBody, orbitDistance, initialOrbitAngle, orbitSpeed] = arguments;
            options = { name, mass, radius, position, color, parentBody, orbitDistance, initialOrbitAngle, orbitSpeed };
        }
        
        // Identité
        /** @type {string} */
        this.name = options.name || 'Corps céleste';
        /** @type {string} */
        this.type = options.type || 'generic';
        
        // Propriétés physiques (avec validation)
        /** @type {number} */
        this.mass = Math.max(0, options.mass || 100); // kg
        /** @type {number} */
        this.radius = Math.max(1, options.radius || 10); // m
        /** @type {number} Utilise la constante globale de constants.js */
        this.gravitationalConstant = PHYSICS.G;
        
        // Position et mouvement
        /** @type {{x: number, y: number}} Position actuelle, mise à jour par `updateOrbit`. */
        this.position = options.position || { x: 0, y: 0 };
        /**
         * @type {{x: number, y: number}} Vélocité instantanée calculée dans `updateOrbit`.
         * Représente le mouvement tangentiel dû à l'orbite + la vélocité du parent.
         * Initialisée ici mais recalculée à chaque frame dans `updateOrbit`.
         */
        this.velocity = { x: 0, y: 0 };
        
        // Apparence
        /** @type {string} Couleur pour le rendu. */
        this.color = options.color || '#CCCCCC';
        /** @type {boolean} */
        this.isVisible = true;
        
        // Propriétés dérivées calculées
        /** @type {number} */
        this.gravitationalInfluence = this.getSphereOfInfluence();
        
        /**
         * @type {{exists: boolean, height: number, color: string}}
         * Propriétés de l'atmosphère pour le rendu. La logique d'existence
         * est actuellement spécifique au nom, mais pourrait être généralisée.
         */
        this.atmosphere = {
            exists: this.name === 'Terre',
            height: this.radius * CELESTIAL_BODY.ATMOSPHERE_RATIO, // Hauteur de l'atmosphère
            color: 'rgba(25, 35, 80, 0.4)'  // Bleu très sombre semi-transparent
        };
        
        // Caractéristiques orbitales
        /** @type {CelestialBodyModel|null} Référence au corps parent autour duquel orbiter. */
        this.parentBody = options.parentBody || null;
        /** @type {number} Distance orbitale par rapport au parent. */
        this.orbitDistance = options.orbitDistance || 0;
        /** @type {number} Angle initial sur l'orbite (radians). */
        this.initialOrbitAngle = options.initialOrbitAngle || 0;
        /** @type {number} Angle actuel sur l'orbite (radians), mis à jour par `updateOrbit`. */
        this.currentOrbitAngle = this.initialOrbitAngle;
        /** @type {number} Vitesse angulaire orbitale (radians par seconde). */
        this.orbitSpeed = options.orbitSpeed || 0;
        
        // La propriété 'satellites' et la méthode 'addSatellite' ont été supprimées car non utilisées.
        // La hiérarchie est gérée par `parentBody`.
    }
    
    /**
     * Calcule la surface du corps céleste.
     * @returns {number} La surface en unités carrées.
     */
    getSurfaceArea() {
        return Math.PI * this.radius * this.radius;
    }
    
    /**
     * Calcule la densité du corps céleste.
     * @returns {number} La densité en kg/m³.
     */
    getDensity() {
        const volume = (4/3) * Math.PI * Math.pow(this.radius, 3);
        return this.mass / volume;
    }
    
    /**
     * Calcule la vitesse d'évasion du corps céleste.
     * @returns {number} La vitesse d'évasion en m/s.
     */
    getEscapeVelocity() {
        // v = sqrt(2 * G * M / r)
        return Math.sqrt(2 * this.gravitationalConstant * this.mass / this.radius);
    }
    
    /**
     * Calcule la distance entre ce corps céleste et un point donné.
     * @param {{x: number, y: number}} point Le point de référence.
     * @returns {number} La distance en unités de jeu.
     */
    getDistanceFromPoint(point) {
        const dx = this.position.x - point.x;
        const dy = this.position.y - point.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Calcule la force gravitationnelle exercée par ce corps sur une masse donnée à une distance donnée.
     * @param {number} otherMass La masse de l'autre objet.
     * @param {number} distance La distance entre les deux objets.
     * @returns {number} La force gravitationnelle.
     */
    getGravitationalForce(otherMass, distance) {
        if (distance === 0) return 0; // Éviter la division par zéro
        return (this.gravitationalConstant * this.mass * otherMass) / (distance * distance);
    }
    
    /**
     * Calcule la sphère d'influence gravitationnelle de ce corps céleste.
     * @returns {number} Le rayon de la sphère d'influence.
     */
    getSphereOfInfluence() {
        // Formule simplifiée : sphère d'influence = 2.5 * rayon
        return this.radius * 2.5;
    }
    
    /**
     * Met à jour l'état du corps céleste.
     * @param {number} deltaTime Le temps écoulé en secondes.
     */
    update(deltaTime) {
        this.updateOrbit(deltaTime);
        // Mettre à jour la sphère d'influence gravitationnelle
        this.gravitationalInfluence = this.getSphereOfInfluence();
        // Autres mises à jour peuvent être ajoutées ici si nécessaire
    }
    
    /**
     * Clone ce corps céleste.
     * @returns {CelestialBodyModel} Une copie indépendante de ce corps céleste.
     */
    clone() {
        return new CelestialBodyModel({
            name: this.name,
            type: this.type,
            mass: this.mass,
            radius: this.radius,
            position: { x: this.position.x, y: this.position.y },
            color: this.color,
            parentBody: this.parentBody, // Note: référence partagée
            orbitDistance: this.orbitDistance,
            initialOrbitAngle: this.initialOrbitAngle,
            orbitSpeed: this.orbitSpeed
        });
    }
    
    /**
     * Retourne les informations complètes du corps céleste.
     * @returns {object} Un objet contenant toutes les informations importantes.
     */
    getInfo() {
        return {
            name: this.name,
            type: this.type,
            mass: this.mass,
            radius: this.radius,
            position: { ...this.position },
            velocity: { ...this.velocity },
            color: this.color,
            isVisible: this.isVisible,
            orbitDistance: this.orbitDistance,
            orbitSpeed: this.orbitSpeed,
            currentOrbitAngle: this.currentOrbitAngle,
            parentBody: this.parentBody ? this.parentBody.name : null,
            surfaceArea: this.getSurfaceArea(),
            density: this.getDensity(),
            escapeVelocity: this.getEscapeVelocity(),
            gravitationalInfluence: this.gravitationalInfluence
        };
    }
    
    /**
     * Retourne une représentation textuelle du corps céleste.
     * @returns {string} Description textuelle.
     */
    toString() {
        return `${this.name} (${this.type}) - Mass: ${this.mass}, Radius: ${this.radius}, Position: (${this.position.x.toFixed(1)}, ${this.position.y.toFixed(1)})`;
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

// Rendre disponible globalement
window.CelestialBodyModel = CelestialBodyModel; 