/**
 * @file Gère la logique de création, mise à jour et suppression des particules pour les effets visuels.
 * S'interface avec ParticleSystemModel pour stocker l'état des particules et des émetteurs.
 * Répond aux événements du jeu tels que la pause/reprise et peut générer des effets spécifiques
 * comme les explosions.
 */
class ParticleController {
    /**
     * Crée une instance de ParticleController.
     * @param {ParticleSystemModel} particleSystemModel - Le modèle de système de particules qui stocke l'état des particules.
     * @param {EventBus} eventBus - Le bus d'événements pour la communication inter-modules.
     * @throws {Error} Si ParticleSystemModel n'est pas fourni.
     */
    constructor(particleSystemModel, eventBus) {
        if (!particleSystemModel) {
            throw new Error('ParticleSystemModel est requis pour initialiser ParticleController');
        }
        this.particleSystemModel = particleSystemModel;
        this.eventBus = eventBus;
        this.isSystemPaused = false;
        this.rocketModel = null; // Référence au modèle de la fusée, mise à jour via la méthode update()

        // S'abonner aux événements de pause et de reprise du jeu via l'EventBus.
        if (this.eventBus && window.EVENTS && window.EVENTS.GAME) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_PAUSED, () => {
                    this.isSystemPaused = true;
                })
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_RESUMED, () => {
                    this.isSystemPaused = false;
                })
            );
            // S'abonner à l'événement de crash de la fusée pour générer une explosion.
            // Cet événement doit être émis par le CollisionHandler ou un gestionnaire similaire.
            if (window.EVENTS && window.EVENTS.ROCKET && window.EVENTS.ROCKET.DESTROYED) {
                 console.log('[ParticleController] Subscribing to ROCKET.DESTROYED event. Event key:', window.EVENTS.ROCKET.DESTROYED);
                 window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.ROCKET.DESTROYED, (eventDetail) => {
                        console.log('[ParticleController] ROCKET.DESTROYED event received. Detail:', eventDetail);
                        if (eventDetail && eventDetail.position) {
                            console.log('[ParticleController] Calling createExplosion with position:', eventDetail.position);
                            this.createExplosion(
                                eventDetail.position.x,
                                eventDetail.position.y,
                                120, // nombre de particules
                                8,   // vitesse
                                10,  // taille
                                2.5, // durée de vie (secondes)
                                '#FFDD00', // couleur début (jaune vif)
                                '#FF3300'  // couleur fin (rouge/orange)
                            );
                        } else {
                            console.warn('[ParticleController] ROCKET.DESTROYED event received, but eventDetail or eventDetail.position is missing.', eventDetail);
                        }
                    })
                );
            } else {
                console.warn('[ParticleController] Did not subscribe to ROCKET.DESTROYED. Check window.EVENTS.ROCKET.DESTROYED definition.', window.EVENTS);
            }
        } else {
            // Avertissement si l'EventBus n'est pas correctement initialisé ou disponible,
            // ce qui pourrait indiquer un problème de configuration ou un contexte d'exécution limité (ex: tests).
            if (window.EVENTS && window.EVENTS.GAME) {
                 console.warn("ParticleController: EventBus non fourni ou événements de jeu non définis, la gestion de la pause/reprise et des explosions sera inactive.");
            }
        }
    }

    /**
     * Met à jour l'état de tous les émetteurs de particules et de leurs particules.
     * Cette méthode est typiquement appelée à chaque frame de la boucle de jeu.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière mise à jour, en secondes.
     * @param {RocketModel} [rocketModel] - Le modèle actuel de la fusée, utilisé pour mettre à jour la position des émetteurs.
     */
    update(deltaTime, rocketModel) {
        if (this.isSystemPaused) {
            return; // Ne pas mettre à jour si le système de particules ou le jeu est en pause.
        }

        if (!this.particleSystemModel || !this.particleSystemModel.emitters) {
            // Erreur critique si le modèle de particules n'est pas correctement initialisé.
            console.error('Erreur Critique: ParticleSystemModel ou ses émetteurs ne sont pas initialisés dans ParticleController.update.');
            return;
        }

        // Mettre à jour la référence interne du modèle de la fusée si elle est fournie.
        if (rocketModel) {
            this.rocketModel = rocketModel;
        }

        if (this.rocketModel) {
            this.updateEmitterPositions(this.rocketModel);
        } else {
            // Optionnel: Avertissement si rocketModel n'a jamais été fourni, ce qui peut être normal au début.
            // console.warn("ParticleController.update: rocketModel non disponible, les positions des émetteurs ne seront pas mises à jour.");
        }
        
        // Mettre à jour chaque émetteur de particules.
        for (const emitterName in this.particleSystemModel.emitters) {
            const emitter = this.particleSystemModel.emitters[emitterName];
            
            // Si l'émetteur est actif, générer de nouvelles particules.
            if (emitter.isActive) {
                this.emitParticles(emitter);
            }
            
            // Mettre à jour les particules existantes pour cet émetteur.
            this.updateParticles(emitter.particles, deltaTime); // deltaTime n'est pas utilisé par ParticleModel.update actuellement
        }
        
        // Mettre à jour les particules de débris (ex: explosions).
        this.updateParticles(this.particleSystemModel.debrisParticles, deltaTime); // deltaTime n'est pas utilisé

        // Mettre à jour les particules de texte (si utilisées).
        if (this.particleSystemModel.textParticles && this.particleSystemModel.textParticles.length > 0) {
            this.updateParticles(this.particleSystemModel.textParticles, deltaTime); // deltaTime n'est pas utilisé
        }

        // Mettre à jour les particules de célébration (si utilisées).
        if (this.particleSystemModel.celebrationParticles && this.particleSystemModel.celebrationParticles.length > 0) {
            this.updateParticles(this.particleSystemModel.celebrationParticles, deltaTime); // deltaTime n'est pas utilisé
        }
    }
    
    /**
     * Met à jour la position, la durée de vie et l'état de chaque particule dans un tableau donné.
     * Supprime les particules mortes du tableau.
     * @param {ParticleModel[]} particles - Un tableau de particules à mettre à jour.
     * @param {number} deltaTime - Le temps écoulé (actuellement non utilisé par ParticleModel.update).
     * @private
     */
    updateParticles(particles, deltaTime) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            // La méthode update de ParticleModel retourne true si la particule est toujours active, false sinon.
            const isAlive = particle.update(); 
            
            if (!isAlive) {
                particles.splice(i, 1); // Supprimer la particule du tableau.
            }
        }
    }
    
    /**
     * Émet de nouvelles particules à partir d'un émetteur donné.
     * Le nombre de particules, leur vitesse, leur durée de vie et leur taille
     * sont modulés par le niveau de puissance (`powerLevel`) de l'émetteur.
     * @param {object} emitter - L'objet émetteur contenant les paramètres pour la création de particules.
     * @property {number} emitter.particleCountPerEmit - Nombre de base de particules à émettre.
     * @property {number} emitter.powerLevel - Niveau de puissance de l'émetteur (0-100), affecte la quantité et les propriétés des particules.
     * @property {number} emitter.angle - Angle d'émission principal en radians.
     * @property {number} emitter.spread - Dispersion angulaire (en radians) autour de l'angle principal.
     * @property {number} emitter.particleSpeed - Vitesse de base des particules.
     * @property {number} emitter.particleSpeedVar - Variation aléatoire ajoutée à la vitesse de base.
     * @property {number} emitter.particleLifetimeBase - Durée de vie de base des particules (en secondes ou frames, selon l'interprétation).
     * @property {number} emitter.particleLifetimeVar - Variation aléatoire de la durée de vie.
     * @property {string} emitter.colorStart - Couleur de départ des particules.
     * @property {string} emitter.colorEnd - Couleur de fin des particules (pour dégradé ou transition).
     * @property {object} emitter.position - Position {x, y} de l'émetteur.
     * @property {ParticleModel[]} emitter.particles - Tableau où les nouvelles particules seront ajoutées.
     * @private
     */
    emitParticles(emitter) {
        // Calculer le nombre de particules à émettre, en s'assurant qu'il y en a au moins une si l'émetteur est actif.
        // Le nombre est proportionnel au niveau de puissance de l'émetteur.
        const particleCount = Math.max(1, Math.floor(emitter.particleCountPerEmit * (emitter.powerLevel / 100)));
        
        for (let i = 0; i < particleCount; i++) {
            // Angle final de la particule, incluant une dispersion aléatoire.
            const particleAngle = emitter.angle + (Math.random() * emitter.spread * 2 - emitter.spread);
            
            // Vitesse finale de la particule, ajustée par le niveau de puissance et une variation aléatoire.
            // speedMultiplier va de 0.5 (à 0% power) à 1.0 (à 100% power).
            const speedMultiplier = 0.5 + (emitter.powerLevel / 100) * 0.5; 
            const particleSpeed = (emitter.particleSpeed + Math.random() * emitter.particleSpeedVar) * speedMultiplier;
            
            // Composantes X et Y de la vitesse.
            const vx = Math.cos(particleAngle) * particleSpeed;
            const vy = Math.sin(particleAngle) * particleSpeed;
            
            // Durée de vie finale de la particule, ajustée par le niveau de puissance et une variation aléatoire.
            // lifetimeMultiplier va de 0.7 à 1.3.
            const lifetimeMultiplier = 0.7 + (emitter.powerLevel / 100) * 0.6; 
            // Convertit la durée de vie en nombre de frames (en supposant 60 FPS si la base est en secondes).
            const lifetime = (emitter.particleLifetimeBase + Math.random() * emitter.particleLifetimeVar) * lifetimeMultiplier * 60; 
            
            // Taille de la particule, proportionnelle au niveau de puissance.
            const size = 2 + Math.random() * 2 * (emitter.powerLevel / 100);
            
            // Création de la nouvelle particule.
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
    
    /**
     * Crée un effet d'explosion de particules à une position donnée.
     * Utile pour les impacts, destructions, etc.
     * @param {number} x - Position X de l'explosion.
     * @param {number} y - Position Y de l'explosion.
     * @param {number} count - Nombre de particules à générer pour l'explosion.
     * @param {number} speed - Vitesse moyenne des particules d'explosion.
     * @param {number} size - Taille moyenne des particules d'explosion.
     * @param {number} lifetime - Durée de vie moyenne des particules d'explosion (en secondes).
     * @param {string} colorStart - Couleur de départ des particules.
     * @param {string} colorEnd - Couleur de fin des particules.
     */
    createExplosion(x, y, count, speed, size, lifetime, colorStart, colorEnd) {
        for (let i = 0; i < count; i++) {
            // Angle d'éjection aléatoire sur 360 degrés.
            const angle = Math.random() * Math.PI * 2;
            
            // Vitesse aléatoire pour chaque particule, variant autour de la vitesse de base.
            const particleSpeed = speed * (0.5 + Math.random() * 0.5);
            
            // Composantes X et Y de la vitesse.
            const vx = Math.cos(angle) * particleSpeed;
            const vy = Math.sin(angle) * particleSpeed;
            
            // Taille aléatoire pour chaque particule.
            const particleSize = size * (0.5 + Math.random() * 0.5);
            
            // Durée de vie aléatoire, convertie en frames.
            const particleLifetime = lifetime * (0.7 + Math.random() * 0.3) * 60;
            
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
            
            // Ajoute la particule au tableau des débris géré par ParticleSystemModel.
            this.particleSystemModel.debrisParticles.push(particle);
        }
    }
    
    /**
     * Met à jour les positions et angles des émetteurs de particules attachés à la fusée,
     * en fonction de la position et de l'angle actuels de la fusée.
     * Nécessite que `this.rocketModel` soit défini.
     * @param {RocketModel} rocketModel - Le modèle de la fusée.
     * @property {object} rocketModel.position - Position {x, y} de la fusée.
     * @property {number} rocketModel.angle - Angle de la fusée en radians.
     * @private
     */
    updateEmitterPositions(rocketModel) {
        if (!rocketModel || !this.particleSystemModel || !this.particleSystemModel.emitters) {
            // Prévient les erreurs si les modèles ne sont pas prêts, peut arriver au début.
            // console.warn('ParticleController.updateEmitterPositions: Modèles non initialisés correctement.');
            return;
        }
        
        const pos = rocketModel.position;
        const angle = rocketModel.angle;
        // Assurez-vous que ROCKET.WIDTH est une constante globale accessible, définie par ex. dans constants.js
        const halfRocketWidth = ROCKET.WIDTH / 2; 
        
        // Mise à jour de l'émetteur principal (ex: tuyère principale arrière)
        if (this.particleSystemModel.emitters.main) {
            // Positionne l'émetteur à l'arrière de la fusée, ajusté par l'angle.
            // Les valeurs '30' sont des offsets spécifiques à la géométrie de la fusée.
            this.particleSystemModel.updateEmitterPosition('main', pos.x - Math.sin(angle) * 30, pos.y + Math.cos(angle) * 30);
            // Oriente l'émetteur dans la direction opposée à l'avant de la fusée.
            this.particleSystemModel.updateEmitterAngle('main', angle + Math.PI / 2);
        }
        
        // Mise à jour de l'émetteur arrière (ex: tuyère secondaire ou de freinage)
        if (this.particleSystemModel.emitters.rear) {
            this.particleSystemModel.updateEmitterPosition('rear', pos.x + Math.sin(angle) * 30, pos.y - Math.cos(angle) * 30);
            this.particleSystemModel.updateEmitterAngle('rear', angle - Math.PI / 2);
        }
        
        // Mise à jour de l'émetteur latéral gauche (pour rotation)
        if (this.particleSystemModel.emitters.left) {
            // Positionne l'émetteur sur le côté gauche de la fusée.
            this.particleSystemModel.updateEmitterPosition('left', pos.x - Math.cos(angle) * halfRocketWidth, pos.y - Math.sin(angle) * halfRocketWidth);
            // Oriente l'émetteur vers la gauche par rapport à l'axe de la fusée.
            this.particleSystemModel.updateEmitterAngle('left', angle + Math.PI);
        }
        
        // Mise à jour de l'émetteur latéral droit (pour rotation)
        if (this.particleSystemModel.emitters.right) {
            // Positionne l'émetteur sur le côté droit de la fusée.
            this.particleSystemModel.updateEmitterPosition('right', pos.x + Math.cos(angle) * halfRocketWidth, pos.y + Math.sin(angle) * halfRocketWidth);
            // Oriente l'émetteur vers la droite par rapport à l'axe de la fusée.
            this.particleSystemModel.updateEmitterAngle('right', angle);
        }
    }

    // --- Effet Mission Réussie : texte doré + explosion de particules festives ---
    // NOTE: Cette méthode crée des particules directement avec une structure ad-hoc
    // et les stocke dans `this.particleSystemModel.celebrationParticles`.
    // La méthode `updateParticles` est ensuite utilisée pour les mettre à jour.
    /**
     * Crée un effet visuel de célébration pour une mission réussie.
     * Affiche un texte "Mission réussie" et génère une explosion de particules festives.
     * @param {number} canvasWidth - Largeur du canvas, pour centrer le texte.
     * @param {number} canvasHeight - Hauteur du canvas (non utilisée directement pour le positionnement vertical ici, mais pourrait l'être).
     */
    createMissionSuccessCelebration(canvasWidth, canvasHeight) {
        // 1. Configure l'affichage du texte "Mission réussie" via le ParticleSystemModel.
        // La vue (UIView ou ParticleView) sera responsable de dessiner ce texte.
        this.particleSystemModel.missionSuccessText = {
            visible: true,
            time: Date.now(), // Utilisé pour gérer la durée d'affichage.
            duration: 2500, // en millisecondes
            x: canvasWidth / 2,
            y: 80, // Position verticale fixe en haut du canvas.
            color: '#FFD700', // Doré
            font: 'bold 48px Impact, Arial, sans-serif',
            shadow: true
        };

        // 2. Crée une explosion de particules festives autour de la position du texte.
        const centerX = canvasWidth / 2;
        const centerY = 80;
        const count = 120; // Nombre de particules pour l'effet.
        const colors = ['#FFD700', '#FF69B4', '#00E5FF', '#FF3300', '#00FF66', '#FF00CC', '#FFFACD', '#FFA500']; // Palette de couleurs festives.
        
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2; // Angle d'éjection aléatoire.
            const speed = 4 + Math.random() * 7; // Vitesse aléatoire.
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = 6 + Math.random() * 10; // Taille aléatoire.
            const lifetime = 1.8 + Math.random() * 1.5; // Durée de vie en secondes.
            const color = colors[Math.floor(Math.random() * colors.length)]; // Couleur aléatoire de la palette.
            
            // Crée un objet particule avec sa propre logique de mise à jour.
            // Ce n'est pas un ParticleModel standard, mais un objet ad-hoc.
            const particle = {
                x: centerX,
                y: centerY,
                vx,
                vy,
                size,
                color,
                alpha: 1,
                age: 0,
                lifetime: lifetime * 60, // Converti en frames.
                isActive: true, // Propriété pour compatibilité avec la logique de suppression.
                /** Met à jour la particule de célébration. */
                update() {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.vx *= 0.98; // Applique une légère friction pour ralentir les particules.
                    this.vy *= 0.98;
                    this.age++;
                    this.alpha = 1 - this.age / this.lifetime; // Fondu en opacité.
                    if (this.alpha < 0) this.alpha = 0;
                    return this.age < this.lifetime; // Reste active tant que la durée de vie n'est pas écoulée.
                }
            };

            if (!this.particleSystemModel.celebrationParticles) {
                this.particleSystemModel.celebrationParticles = [];
            }
            this.particleSystemModel.celebrationParticles.push(particle);
        }
    }

    /**
     * Réinitialise l'état du ParticleController et du ParticleSystemModel associé.
     * Vide les listes de particules actives et de débris.
     * S'assure que le système n'est plus en pause.
     */
    reset() {
        if (this.particleSystemModel) {
            this.particleSystemModel.reset(); // Cette méthode devrait vider les tableaux de particules.
        }
        this.isSystemPaused = false;
        // console.log("ParticleController: Système de particules réinitialisé."); // Peut être utile pour le débogage.
    }
} 