class CelestialBodyModel {
    constructor(name, mass, radius, position, color, parentBody = null, orbitDistance = 0, initialOrbitAngle = 0, orbitSpeed = 0) {
        // Identité
        this.name = name;
        
        // Propriétés physiques
        this.mass = mass; // kg
        this.radius = radius; // m
        this.gravitationalConstant = PHYSICS.G; // Utiliser la constante du fichier constants.js
        
        // Position et mouvement
        this.position = position || { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 }; // Gardé pour d'autres usages potentiels (ex: corps non en orbite)
        
        // Apparence
        this.color = color || '#FFFFFF';
        this.atmosphere = {
            // L'atmosphère pourrait être rendue plus générique aussi, mais on garde la logique actuelle pour l'instant
            exists: name === 'Terre',
            height: radius * CELESTIAL_BODY.ATMOSPHERE_RATIO, // Hauteur de l'atmosphère
            color: 'rgba(25, 35, 80, 0.4)'  // Bleu très sombre semi-transparent
        };
        
        // Caractéristiques orbitales
        this.parentBody = parentBody; // Référence au corps parent autour duquel orbiter
        this.orbitDistance = orbitDistance; // Distance orbitale par rapport au parent
        this.initialOrbitAngle = initialOrbitAngle; // Angle initial sur l'orbite (radians)
        this.currentOrbitAngle = initialOrbitAngle; // Angle actuel sur l'orbite (radians)
        this.orbitSpeed = orbitSpeed; // Vitesse angulaire orbitale (radians par seconde)
        
        // Caractéristiques supplémentaires (généralisées)
        this.satellites = []; // Peut toujours contenir des satellites si nécessaire pour la logique du jeu
        // La propriété 'moon' est supprimée
        
        // Points cibles pour les missions (ex: points d'atterrissage ou de passage)
        // Chaque point est un objet: { id: string, angle: number, missionId: string }
        this.targetPoints = []; 
    }
    
    setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
    }
    
    addSatellite(satellite) {
        this.satellites.push(satellite);
        // On pourrait ajouter une logique pour définir le parentBody du satellite ici
        satellite.parentBody = this;
    }
    
    // Calcule la force gravitationnelle exercée sur un autre corps
    calculateGravitationalForce(otherBody) {
        const dx = this.position.x - otherBody.position.x;
        const dy = this.position.y - otherBody.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // NOTE: La formule de gravité personnalisée (1/r) utilisée ici est pour le calcul manuel,
        // le plugin MatterAttractors utilise 1/r² par défaut. S'assurer de la cohérence si nécessaire.
        // Si la gravité entre corps célestes est gérée par les orbites, cette fonction est peut-être moins utile.
        const forceMagnitude = this.gravitationalConstant * this.mass * otherBody.mass / distance;
        
        // Direction de la force (vecteur unitaire)
        const forceX = forceMagnitude * (dx / distance);
        const forceY = forceMagnitude * (dy / distance);
        
        return { x: forceX, y: forceY };
    }
    
    // Mise à jour de la position orbitale
    updateOrbit(deltaTime) {
        if (!this.parentBody) {
            // Si pas de parent, le corps ne bouge pas via cette méthode
            // (pourrait avoir une vélocité propre définie ailleurs si nécessaire)
            return;
        }

        // Mettre à jour l'angle orbital
        this.currentOrbitAngle += this.orbitSpeed * deltaTime;

        // Calculer la nouvelle position basée sur l'orbite autour du parent
        this.position = {
            x: this.parentBody.position.x + Math.cos(this.currentOrbitAngle) * this.orbitDistance,
            y: this.parentBody.position.y + Math.sin(this.currentOrbitAngle) * this.orbitDistance
        };

        // Optionnel: Calculer la vélocité instantanée (utile pour la physique/collisions)
        const tangentSpeed = this.orbitSpeed * this.orbitDistance;
        this.velocity = {
             x: -Math.sin(this.currentOrbitAngle) * tangentSpeed,
             y: Math.cos(this.currentOrbitAngle) * tangentSpeed
        };
         // Ajouter la vélocité du parent si celui-ci orbite aussi
         if (this.parentBody.velocity) {
            this.velocity.x += this.parentBody.velocity.x;
            this.velocity.y += this.parentBody.velocity.y;
         }
    }
} 