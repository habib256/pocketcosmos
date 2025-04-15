class ParticleSystemModel {
    constructor() {
        // Facteur pour convertir la consommation en nombre de particules
        const PARTICLES_PER_FUEL_UNIT = 20; 
        
        // Émetteurs de particules
        this.emitters = {
            main: {
                position: { x: 0, y: 0 },
                angle: Math.PI/2,
                particles: [],
                isActive: false,
                powerLevel: 100,
                particleSpeed: PARTICLES.EMITTER.MAIN.SPEED,
                colorStart: PARTICLES.EMITTER.MAIN.COLOR_START,
                colorEnd: PARTICLES.EMITTER.MAIN.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.MAIN.LIFETIME,
                // Calcul basé sur la consommation
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.MAIN * PARTICLES_PER_FUEL_UNIT)), 
                spread: 0.4,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
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
                 // Calcul basé sur la consommation (divisé par 5)
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
                 // Calcul basé sur la consommation (divisé par 5)
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.LATERAL * PARTICLES_PER_FUEL_UNIT / 5)),
                spread: 0.3,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
            },
            rear: {
                position: { x: 0, y: 0 },
                angle: -Math.PI/2,
                particles: [],
                isActive: false,
                powerLevel: 100,
                particleSpeed: PARTICLES.EMITTER.REAR.SPEED,
                colorStart: PARTICLES.EMITTER.REAR.COLOR_START,
                colorEnd: PARTICLES.EMITTER.REAR.COLOR_END,
                particleLifetimeBase: PARTICLES.EMITTER.REAR.LIFETIME,
                 // Calcul basé sur la consommation (divisé par 5)
                particleCountPerEmit: Math.max(1, Math.round(ROCKET.FUEL_CONSUMPTION.REAR * PARTICLES_PER_FUEL_UNIT / 5)),
                spread: 0.3,
                particleSpeedVar: 0.3,
                particleLifetimeVar: 0.5
            }
        };
        
        // Particules de débris pour les collisions
        this.debrisParticles = [];
        
        // Rayon de la fusée pour le positionnement des émetteurs
        this.radius = ROCKET.WIDTH / 2;
    }
    
    // Mettre à jour la position d'un émetteur
    updateEmitterPosition(emitterName, x, y) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].position.x = x;
            this.emitters[emitterName].position.y = y;
        }
    }
    
    // Mettre à jour l'angle d'un émetteur
    updateEmitterAngle(emitterName, angle) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].angle = angle;
        }
    }
    
    // Activer/désactiver un émetteur
    setEmitterActive(emitterName, isActive, rocketModel = null) {
        // Si la fusée est détruite, on ne doit pas activer l'émetteur
        if (isActive && rocketModel && rocketModel.isDestroyed) {
            if (this.emitters[emitterName]) {
                this.emitters[emitterName].isActive = false;
            }
            return;
        }
        // AJOUT : Si plus d'essence, désactiver l'émetteur
        if (isActive && rocketModel && rocketModel.fuel !== undefined && rocketModel.fuel <= 0) {
            if (this.emitters[emitterName]) {
                this.emitters[emitterName].isActive = false;
            }
            return;
        }
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].isActive = isActive;
        }
    }
    
    // Régler le niveau de puissance d'un émetteur
    setEmitterPowerLevel(emitterName, powerLevel) {
        if (this.emitters[emitterName]) {
            this.emitters[emitterName].powerLevel = Math.max(0, Math.min(100, powerLevel));
        }
    }
    
    // Ajouter une particule de débris
    addDebrisParticle(particle) {
        this.debrisParticles.push(particle);
    }
    
    // Supprimer toutes les particules
    reset() {
        // Vider toutes les particules
        for (const emitterName in this.emitters) {
            this.emitters[emitterName].particles = [];
            this.emitters[emitterName].isActive = false;
        }
        
        // Vider les particules de débris
        this.debrisParticles = [];
    }
    
    // Effacer toutes les particules
    clearAllParticles() {
        this.particles = [];
        
        // Désactiver tous les émetteurs
        for (const emitterName in this.emitters) {
            if (this.emitters.hasOwnProperty(emitterName)) {
                this.emitters[emitterName].isActive = false;
            }
        }
    }
} 