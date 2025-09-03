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
        this.activeExplosionParticlesCount = 0;
        this.explosionInProgress = false; // Pour savoir si une explosion a été déclenchée
        this._canvasSize = { width: 0, height: 0 };
        this._cameraSnapshot = null; // { x, y, zoom, offsetX, offsetY }
        this._lastMissionCelebrationAt = 0; // Throttle anti-spam

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

            // S'abonner à une requête générique de création d'explosion
            if (window.EVENTS && window.EVENTS.PARTICLES && window.EVENTS.PARTICLES.CREATE_EXPLOSION) {
                window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.PARTICLES.CREATE_EXPLOSION, (p) => {
                        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') {
                            console.warn('[ParticleController] PARTICLES.CREATE_EXPLOSION reçu sans coordonnées valides:', p);
                            return;
                        }
                        const count = typeof p.count === 'number' ? p.count : 120;
                        const speed = typeof p.speed === 'number' ? p.speed : 8;
                        const size = typeof p.size === 'number' ? p.size : 10;
                        const lifetime = typeof p.lifetime === 'number' ? p.lifetime : 2.5;
                        const colorStart = typeof p.colorStart === 'string' ? p.colorStart : '#FFDD00';
                        const colorEnd = typeof p.colorEnd === 'string' ? p.colorEnd : '#FF3300';
                        this.createExplosion(p.x, p.y, count, speed, size, lifetime, colorStart, colorEnd);
                    })
                );
            }

            // S'abonner à la réussite de mission pour déclencher la célébration via EventBus (découplé de CollisionHandler)
            if (window.EVENTS && window.EVENTS.MISSION && window.EVENTS.MISSION.COMPLETED) {
                window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.MISSION.COMPLETED, () => {
                        this._triggerMissionCelebration();
                    })
                );
            }

            // Fallback: déclencher aussi à la mise à jour des crédits (récompense mission)
            if (window.EVENTS && window.EVENTS.UI && window.EVENTS.UI.CREDITS_UPDATED) {
                window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.UI.CREDITS_UPDATED, () => {
                        this._triggerMissionCelebration();
                    })
                );
            }

            // Suivre les dimensions du canvas pour positionner correctement les effets de célébration
            if (window.EVENTS && window.EVENTS.SYSTEM && window.EVENTS.SYSTEM.CANVAS_RESIZED) {
                window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.SYSTEM.CANVAS_RESIZED, ({ width, height }) => {
                        if (typeof width === 'number' && typeof height === 'number') {
                            this._canvasSize = { width, height };
                        }
                    })
                );
            }

            // Suivre l'état de la caméra pour projeter les coordonnées écran -> monde
            if (window.EVENTS && window.EVENTS.SIMULATION && window.EVENTS.SIMULATION.UPDATED) {
                window.controllerContainer.track(
                    this.eventBus.subscribe(window.EVENTS.SIMULATION.UPDATED, (sim) => {
                        if (sim && sim.camera) {
                            const c = sim.camera;
                            this._cameraSnapshot = {
                                x: typeof c.x === 'number' ? c.x : 0,
                                y: typeof c.y === 'number' ? c.y : 0,
                                zoom: typeof c.zoom === 'number' && c.zoom > 0 ? c.zoom : 1,
                                offsetX: typeof c.offsetX === 'number' ? c.offsetX : 0,
                                offsetY: typeof c.offsetY === 'number' ? c.offsetY : 0
                            };
                        }
                    })
                );
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
        const noFuel = !!(this.rocketModel && this.rocketModel.fuel <= 0);
        for (const emitterName in this.particleSystemModel.emitters) {
            const emitter = this.particleSystemModel.emitters[emitterName];
            
            // Si l'émetteur est actif et qu'il reste du carburant, générer de nouvelles particules.
            if (emitter.isActive && !noFuel) {
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

        // Vérifier si une explosion était en cours et si toutes ses particules ont disparu
        if (this.explosionInProgress && this.activeExplosionParticlesCount === 0) {
            console.log("[ParticleController] Toutes les particules d'explosion ont disparu.");
            this.eventBus.emit(EVENTS.PARTICLES.EXPLOSION_COMPLETED);
            this.explosionInProgress = false; // Réinitialiser pour la prochaine explosion
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
                // Si une explosion est en cours et que nous suivons les particules d'explosion,
                // décrémenter le compteur.
                // Note: Cela suppose que `particles` est `this.particleSystemModel.debrisParticles`
                // lorsque l'on traite les particules d'explosion.
                if (this.explosionInProgress && particles === this.particleSystemModel.debrisParticles && this.activeExplosionParticlesCount > 0) {
                    this.activeExplosionParticlesCount--;
                }
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
        this.activeExplosionParticlesCount += count;
        this.explosionInProgress = true;
        console.log(`[ParticleController] Explosion créée. ${count} particules ajoutées. Total suivies: ${this.activeExplosionParticlesCount}`);
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
        // Coordonnées écran: centré et légèrement en dessous du texte (UIView: y=150)
        const screenCenterX = (canvasWidth && canvasWidth > 0) ? (canvasWidth / 2) : (this._cameraSnapshot ? this._cameraSnapshot.offsetX : 0);
        const screenCenterY = 190;

        // 1. Optionnel: stocker un état UI côté particules (non utilisé par UIView directement)
        this.particleSystemModel.missionSuccessText = {
            visible: true,
            time: Date.now(),
            duration: 2500,
            x: screenCenterX, // Ecran
            y: screenCenterY,
            color: '#FFD700',
            font: 'bold 48px Impact, Arial, sans-serif',
            shadow: true
        };

        // 2. Crée des particules festives en COORDONNÉES ÉCRAN (dessinées en screen-space)
        const centerX = screenCenterX;
        const centerY = screenCenterY;
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
                screenSpace: true,
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

        // Retourner le centre écran pour information
        return { x: centerX, y: centerY };
    }

    /**
     * Déclenche la célébration de mission (texte + explosion autour du texte), avec anti-spam.
     * @private
     */
    _triggerMissionCelebration() {
        const now = Date.now();
        if (now - this._lastMissionCelebrationAt < 800) {
            return; // éviter le spam si plusieurs événements successifs
        }
        this._lastMissionCelebrationAt = now;

        const w = (this._canvasSize && this._canvasSize.width) ? this._canvasSize.width : 0;
        const h = (this._canvasSize && this._canvasSize.height) ? this._canvasSize.height : 0;
        const center = this.createMissionSuccessCelebration(w, h);
        const explosionX = center && typeof center.x === 'number' ? center.x : (this._cameraSnapshot ? this._cameraSnapshot.x : (this.rocketModel && this.rocketModel.position ? this.rocketModel.position.x : 0));
        const explosionY = center && typeof center.y === 'number' ? center.y : (this._cameraSnapshot ? this._cameraSnapshot.y : (this.rocketModel && this.rocketModel.position ? this.rocketModel.position.y : 0));
        this.createExplosion(
            explosionX,
            explosionY,
            150, // un peu plus dense pour un effet festif
            7,
            12,
            2.2,
            '#FFD700',
            '#FF3300'
        );
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