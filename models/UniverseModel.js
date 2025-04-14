class UniverseModel {
    constructor() {
        // Collections d'objets
        this.celestialBodies = [];
        this.stars = [];
        
        // Propriétés de l'univers
        this.width = PHYSICS.MAX_COORDINATE * 2;
        this.height = PHYSICS.MAX_COORDINATE * 2;
        this.starCount = PARTICLES.STAR_COUNT;
        
        // Propriétés physiques
        this.gravitationalConstant = PHYSICS.G;
        
        // Génération des étoiles d'arrière-plan
        this.initializeStars();
    }
    
    initializeStars() {
        // Créer les étoiles
        for (let i = 0; i < PARTICLES.STAR_COUNT; i++) {
            // Position aléatoire dans un cercle autour de l'origine
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * PARTICLES.VISIBLE_RADIUS;
            
            this.stars.push({
                x: Math.cos(angle) * distance,
                y: Math.sin(angle) * distance,
                brightness: PARTICLES.STAR_BRIGHTNESS_BASE + Math.random() * PARTICLES.STAR_BRIGHTNESS_RANGE,
                twinkleSpeed: Math.random() * PARTICLES.STAR_TWINKLE_FACTOR
            });
        }
    }
    
    updateStars(deltaTime) {
        // Mettre à jour la luminosité des étoiles pour l'effet de scintillement
        for (const star of this.stars) {
            star.brightness = PARTICLES.STAR_BRIGHTNESS_BASE + 
                Math.sin(this.elapsedTime * star.twinkleSpeed) * PARTICLES.STAR_BRIGHTNESS_RANGE;
        }
    }
    
    getRandomStarColor() {
        const colors = [
            '#FFFFFF', // Blanc
            '#FFD700', // Jaune doré
            '#87CEEB', // Bleu ciel
            '#FF4500', // Rouge orangé
            '#E6E6FA'  // Lavande
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    addCelestialBody(body) {
        this.celestialBodies.push(body);
    }
    
    removeCelestialBody(body) {
        const index = this.celestialBodies.indexOf(body);
        if (index !== -1) {
            this.celestialBodies.splice(index, 1);
        }
    }
    
    // Trouve le corps céleste le plus proche d'une position donnée
    findNearestBody(position, excludeBody = null) {
        let nearestBody = null;
        let minDistance = Infinity;
        
        for (const body of this.celestialBodies) {
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
    
    update(deltaTime) {
        this.elapsedTime = (this.elapsedTime || 0) + deltaTime;
        this.updateStars(deltaTime);
        
        // Mettre à jour les corps célestes (orbites)
        for (const body of this.celestialBodies) {
            // Met à jour la position basée sur l'orbite si applicable
            body.updateOrbit(deltaTime);
            
            // Conserver body.update(deltaTime) si d'autres logiques de mise à jour existent dans CelestialBodyModel
            // if (body.update) {
            //     body.update(deltaTime);
            // }
            
            // La logique spécifique à updateMoon est supprimée.
            // if (body.moon && body.updateMoon) { ... }
        }
    }
} 