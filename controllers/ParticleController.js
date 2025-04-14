class ParticleController {
    constructor(particleSystemModel) {
        if (!particleSystemModel) {
            throw new Error('ParticleSystemModel est requis pour initialiser ParticleController');
        }
        this.particleSystemModel = particleSystemModel;
        //console.log('ParticleController initialisé avec:', this.particleSystemModel);
        //console.log('Émetteurs:', this.particleSystemModel.emitters);
        
        this.particlePool = [];
        this.maxParticles = 1000; // Limite maximale de particules
        this.initializeParticlePool();
    }
    
    // Initialiser le pool de particules
    initializeParticlePool() {
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool.push({
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                life: 0,
                maxLife: 0,
                size: 0,
                color: '',
                isActive: false
            });
        }
    }
    
    // Obtenir une particule du pool
    getParticle() {
        for (let particle of this.particlePool) {
            if (!particle.isActive) {
                particle.isActive = true;
                return particle;
            }
        }
        return null; // Pool plein
    }
    
    // Mettre à jour les particules et créer de nouvelles particules si nécessaire
    update(deltaTime) {
        if (!this.particleSystemModel || !this.particleSystemModel.emitters) {
            console.error('Erreur: ParticleSystemModel non initialisé correctement');
            return;
        }
        
        // Mettre à jour chaque émetteur
        for (const emitterName in this.particleSystemModel.emitters) {
            const emitter = this.particleSystemModel.emitters[emitterName];
            
            // Si l'émetteur est actif, créer de nouvelles particules
            if (emitter.isActive) {
                this.emitParticles(emitter);
            }
            
            // Mettre à jour les particules existantes
            this.updateParticles(emitter.particles, deltaTime);
        }
        
        // Mettre à jour les particules de débris
        this.updateParticles(this.particleSystemModel.debrisParticles, deltaTime);
    }
    
    // Mettre à jour les positions et l'état des particules
    updateParticles(particles, deltaTime) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            const isAlive = particle.update();
            
            if (!isAlive) {
                particles.splice(i, 1);
            }
        }
    }
    
    // Émettre des particules
    emitParticles(emitter) {
        // Calculer le nombre de particules à émettre en fonction du niveau de puissance
        const particleCount = Math.max(1, Math.floor(emitter.particleCountPerEmit * (emitter.powerLevel / 100)));
        
        for (let i = 0; i < particleCount; i++) {
            // Calculer l'angle avec dispersion aléatoire
            const particleAngle = emitter.angle + (Math.random() * emitter.spread * 2 - emitter.spread);
            
            // Calculer la vitesse avec variation aléatoire, ajustée par le niveau de puissance
            const speedMultiplier = 0.5 + (emitter.powerLevel / 100) * 0.5; // 0.5 à 1.0 selon la puissance
            const particleSpeed = (emitter.particleSpeed + Math.random() * emitter.particleSpeedVar) * speedMultiplier;
            
            // Calculer les composantes de vitesse
            const vx = Math.cos(particleAngle) * particleSpeed;
            const vy = Math.sin(particleAngle) * particleSpeed;
            
            // Calculer la durée de vie ajustée par le niveau de puissance
            const lifetimeMultiplier = 0.7 + (emitter.powerLevel / 100) * 0.6; // 0.7 à 1.3 selon la puissance
            const lifetime = (emitter.particleLifetimeBase + Math.random() * emitter.particleLifetimeVar) * lifetimeMultiplier * 60; // Conversion en frames
            
            // Calculer la taille de la particule
            const size = 2 + Math.random() * 2 * (emitter.powerLevel / 100);
            
            // Créer une nouvelle particule avec ParticleModel
            const particle = new ParticleModel(
                emitter.position.x,
                emitter.position.y,
                vx,
                vy,
                size,
                lifetime,
                emitter.colorStart,
                emitter.colorEnd
            );
            
            emitter.particles.push(particle);
        }
    }
    
    // Créer une explosion de particules à une position donnée
    createExplosion(x, y, count, speed, size, lifetime, colorStart, colorEnd) {
        for (let i = 0; i < count; i++) {
            // Calculer un angle aléatoire
            const angle = Math.random() * Math.PI * 2;
            
            // Calculer une vitesse aléatoire
            const particleSpeed = speed * (0.5 + Math.random() * 0.5);
            
            // Calculer les composantes de vitesse
            const vx = Math.cos(angle) * particleSpeed;
            const vy = Math.sin(angle) * particleSpeed;
            
            // Calculer une taille aléatoire
            const particleSize = size * (0.5 + Math.random() * 0.5);
            
            // Calculer une durée de vie aléatoire
            const particleLifetime = lifetime * (0.7 + Math.random() * 0.3) * 60; // Conversion en frames
            
            // Créer une nouvelle particule
            const particle = new ParticleModel(
                x,
                y,
                vx,
                vy,
                particleSize,
                particleLifetime,
                colorStart,
                colorEnd
            );
            
            // Ajouter la particule aux débris
            this.particleSystemModel.debrisParticles.push(particle);
        }
    }
    
    // Mettre à jour les positions des émetteurs en fonction de la position de la fusée
    updateEmitterPositions(rocketModel) {
        if (!rocketModel || !this.particleSystemModel || !this.particleSystemModel.emitters) {
            console.error('Erreur: Modèles non initialisés correctement');
            return;
        }
        
        const pos = rocketModel.position;
        const angle = rocketModel.angle;
        const radius = this.particleSystemModel.radius;
        
        // Vérifier que les émetteurs existent avant de les mettre à jour
        if (this.particleSystemModel.emitters.main) {
            this.particleSystemModel.updateEmitterPosition('main', pos.x - Math.sin(angle) * 30, pos.y + Math.cos(angle) * 30);
            this.particleSystemModel.updateEmitterAngle('main', angle + Math.PI/2);
        }
        
        if (this.particleSystemModel.emitters.rear) {
            this.particleSystemModel.updateEmitterPosition('rear', pos.x + Math.sin(angle) * 30, pos.y - Math.cos(angle) * 30);
            this.particleSystemModel.updateEmitterAngle('rear', angle - Math.PI/2);
        }
        
        if (this.particleSystemModel.emitters.left) {
            this.particleSystemModel.updateEmitterPosition('left', pos.x - Math.cos(angle) * radius, pos.y - Math.sin(angle) * radius);
            this.particleSystemModel.updateEmitterAngle('left', angle + Math.PI);
        }
        
        if (this.particleSystemModel.emitters.right) {
            this.particleSystemModel.updateEmitterPosition('right', pos.x + Math.cos(angle) * radius, pos.y + Math.sin(angle) * radius);
            this.particleSystemModel.updateEmitterAngle('right', angle);
        }
    }
} 