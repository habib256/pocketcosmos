class ParticleController {
    constructor(particleSystemModel, eventBus) {
        if (!particleSystemModel) {
            throw new Error('ParticleSystemModel est requis pour initialiser ParticleController');
        }
        this.particleSystemModel = particleSystemModel;
        this.eventBus = eventBus;
        this.isSystemPaused = false;
        this.rocketModel = null;
        
        this.particlePool = [];
        this.maxParticles = 1000; // Limite maximale de particules
        this.initializeParticlePool();

        // S'abonner aux événements de pause du jeu
        if (this.eventBus && window.EVENTS && window.EVENTS.GAME) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_PAUSED, () => {
                    this.isSystemPaused = true;
                    // console.log("ParticleController: PAUSED");
                })
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_RESUMED, () => {
                    this.isSystemPaused = false;
                    // console.log("ParticleController: RESUMED");
                })
            );
        } else {
            // Ne pas faire d'erreur fatale ici si eventBus n'est pas passé, 
            // car certains contextes d'initialisation pourraient ne pas le fournir (tests, etc.)
            // Mais loguer un avertissement si window.EVENTS.GAME est disponible, 
            // car cela suggère une intégration incomplète.
            if (window.EVENTS && window.EVENTS.GAME) {
                 console.warn("ParticleController: EventBus non fourni, la gestion de la pause sera inactive.");
            }
        }
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
    update(deltaTime, rocketModel) {
        if (this.isSystemPaused) {
            return; // Ne pas mettre à jour si le jeu est en pause
        }

        if (!this.particleSystemModel || !this.particleSystemModel.emitters) {
            console.error('Erreur: ParticleSystemModel non initialisé correctement');
            return;
        }

        // Mettre à jour la référence interne de rocketModel si fournie
        if (rocketModel) {
            this.rocketModel = rocketModel;
        }

        // S'assurer que this.rocketModel est disponible avant de mettre à jour les positions
        if (this.rocketModel) {
            this.updateEmitterPositions(this.rocketModel);
        } else {
            // Optionnel: loguer un avertissement si rocketModel n'a jamais été fourni
            // console.warn("ParticleController.update: rocketModel non disponible, les positions des émetteurs ne seront pas mises à jour.");
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

        // Mettre à jour les particules de texte (si elles existent et ont une méthode update)
        if (this.particleSystemModel.textParticles && this.particleSystemModel.textParticles.length > 0) {
            this.updateParticles(this.particleSystemModel.textParticles, deltaTime);
        }

        // Mettre à jour les particules de célébration (si elles existent et ont une méthode update)
        if (this.particleSystemModel.celebrationParticles && this.particleSystemModel.celebrationParticles.length > 0) {
            this.updateParticles(this.particleSystemModel.celebrationParticles, deltaTime);
        }
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
        // Récupérer la demi-largeur directement depuis les constantes, car 'radius' n'est plus dans le modèle.
        const halfRocketWidth = ROCKET.WIDTH / 2;
        
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
            this.particleSystemModel.updateEmitterPosition('left', pos.x - Math.cos(angle) * halfRocketWidth, pos.y - Math.sin(angle) * halfRocketWidth);
            this.particleSystemModel.updateEmitterAngle('left', angle + Math.PI);
        }
        
        if (this.particleSystemModel.emitters.right) {
            this.particleSystemModel.updateEmitterPosition('right', pos.x + Math.cos(angle) * halfRocketWidth, pos.y + Math.sin(angle) * halfRocketWidth);
            this.particleSystemModel.updateEmitterAngle('right', angle);
        }
    }

    // --- Effet Mission Réussie (particules texte qui tombent) ---
    createMissionSuccessParticles(x, y, message) {
        // Nombre de lettres à émettre (une particule par lettre, plusieurs vagues)
        const chars = message.split('');
        const waves = 5; // Nombre de vagues
        const delayBetweenWaves = 350; // ms
        const baseY = y - 80; // Décaler un peu au-dessus de la fusée
        for (let w = 0; w < waves; w++) {
            setTimeout(() => {
                chars.forEach((char, i) => {
                    // Position de départ aléatoire autour de x
                    const startX = x - (chars.length * 16) / 2 + i * 16 + (Math.random() - 0.5) * 20;
                    const startY = baseY + (Math.random() - 0.5) * 20;
                    // Vitesse de chute aléatoire
                    const vy = 1.5 + Math.random() * 1.5;
                    const vx = (Math.random() - 0.5) * 0.7;
                    // Durée de vie
                    const lifetime = 2.5 + Math.random() * 1.2;
                    // Couleur festive
                    const colors = ['#FFD700', '#FF69B4', '#00E5FF', '#FF3300', '#00FF66', '#FF00CC'];
                    const color = colors[Math.floor(Math.random() * colors.length)];
                    // Créer une particule texte personnalisée
                    this.createTextParticle(startX, startY, vx, vy, char, color, lifetime);
                });
            }, w * delayBetweenWaves);
        }
    }

    // Créer une particule texte personnalisée
    createTextParticle(x, y, vx, vy, char, color, lifetime) {
        // On suppose que la vue de particules sait dessiner ce type de particule (sinon il faudra l'ajouter)
        const particle = {
            x,
            y,
            vx,
            vy,
            char,
            color,
            size: 28 + Math.random() * 8,
            alpha: 1,
            age: 0,
            lifetime: lifetime * 60, // en frames
            isActive: true,
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.age++;
                // Fondu progressif
                this.alpha = 1 - this.age / this.lifetime;
                if (this.alpha < 0) this.alpha = 0;
                return this.age < this.lifetime;
            }
        };
        // On stocke dans un tableau spécial pour les particules texte
        if (!this.particleSystemModel.textParticles) {
            this.particleSystemModel.textParticles = [];
        }
        this.particleSystemModel.textParticles.push(particle);
    }

    // --- Effet Mission Réussie : texte doré + explosion de particules festives ---
    createMissionSuccessCelebration(canvasWidth, canvasHeight) {
        // 1. Afficher le texte "Mission réussie" en haut du canvas
        this.particleSystemModel.missionSuccessText = {
            visible: true,
            time: Date.now(),
            duration: 2500, // ms
            x: canvasWidth / 2,
            y: 80,
            color: '#FFD700',
            font: 'bold 48px Impact, Arial, sans-serif',
            shadow: true
        };
        // 2. Explosion de particules festives autour du texte
        const centerX = canvasWidth / 2;
        const centerY = 80;
        const count = 120;
        const colors = ['#FFD700', '#FF69B4', '#00E5FF', '#FF3300', '#00FF66', '#FF00CC', '#FFFACD', '#FFA500'];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            // Vitesse pour remplir le canvas
            const speed = 4 + Math.random() * 7;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = 6 + Math.random() * 10;
            const lifetime = 1.8 + Math.random() * 1.5; // en secondes
            const color = colors[Math.floor(Math.random() * colors.length)];
            // Utiliser le même modèle que les thrusters/crash (cercle plein)
            const particle = {
                x: centerX,
                y: centerY,
                vx,
                vy,
                size,
                color,
                alpha: 1,
                age: 0,
                lifetime: lifetime * 60, // en frames
                isActive: true,
                update() {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.vx *= 0.98; // Légère friction
                    this.vy *= 0.98;
                    this.age++;
                    this.alpha = 1 - this.age / this.lifetime;
                    if (this.alpha < 0) this.alpha = 0;
                    return this.age < this.lifetime;
                }
            };
            if (!this.particleSystemModel.celebrationParticles) {
                this.particleSystemModel.celebrationParticles = [];
            }
            this.particleSystemModel.celebrationParticles.push(particle);
        }
    }

    reset() {
        // Réinitialiser le modèle de système de particules
        if (this.particleSystemModel) {
            this.particleSystemModel.reset(); // Cela vide déjà les listes de particules actives et de débris
        }

        // Marquer toutes les particules du pool comme inactives
        for (let particle of this.particlePool) {
            particle.isActive = false;
            // Optionnel: réinitialiser d'autres propriétés si nécessaire (life, velocity, etc.)
            // particle.life = 0; 
            // particle.velocity = { x: 0, y: 0 };
        }
        this.isSystemPaused = false; // S'assurer que le système de particules n'est pas en pause
        console.log("ParticleController: Système de particules réinitialisé.");
    }
} 