class RenderingController {
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // Références aux vues
        this.rocketView = null;
        this.universeView = null;
        this.celestialBodyView = null;
        this.particleView = null;
        this.traceView = null;
        this.uiView = null;
        
        // Référence au contrôleur de physique pour afficher les forces
        this.physicsController = null;
        
        // États des modèles pour le rendu
        this.rocketState = {
            position: { x: 0, y: 0 },
            angle: 0,
            velocity: { x: 0, y: 0 },
            thrusters: {},
            fuel: 0,
            health: 0,
            isLanded: false,
            isDestroyed: false
        };
        
        this.universeState = {
            celestialBodies: [],
            stars: []
        };
        
        this.particleSystemState = {
            emitters: {},
            debrisParticles: []
        };
        
        // Abonner aux événements de mise à jour d'état
        this.subscribeToEvents();
    }
    
    subscribeToEvents() {
        this.eventBus.subscribe('ROCKET_STATE_UPDATED', (state) => {
            this.updateRocketState(state);
        });
        
        this.eventBus.subscribe('UNIVERSE_STATE_UPDATED', (state) => {
            this.updateUniverseState(state);
        });
        
        this.eventBus.subscribe('PARTICLE_SYSTEM_UPDATED', (state) => {
            this.updateParticleSystemState(state);
        });
    }
    
    // Initialiser les vues
    initViews(rocketView, universeView, celestialBodyView, particleView, traceView, uiView) {
        this.rocketView = rocketView;
        this.universeView = universeView;
        this.celestialBodyView = celestialBodyView;
        this.particleView = particleView;
        this.traceView = traceView;
        this.uiView = uiView;
        
        // Configurer les vues
        if (this.universeView && this.celestialBodyView) {
            this.universeView.setCelestialBodyView(this.celestialBodyView);
        }
        
        // Configurer la vue de trace
        if (this.universeView && this.traceView) {
            this.universeView.setTraceView(this.traceView);
        }
    }
    
    // Mettre à jour les états pour le rendu
    updateRocketState(state) {
        this.rocketState = {
            ...this.rocketState,
            ...state
        };
    }
    
    updateUniverseState(state) {
        // Assurer que les corps célestes sont correctement préparés pour le rendu
        if (state.celestialBodies) {
            // Parcourir les corps célestes pour vérifier les lunes
            for (const body of state.celestialBodies) {
                // Si un corps a une lune, s'assurer qu'elle est également accessible pour le rendu
                if (body.moon && !state.celestialBodies.includes(body.moon)) {
                    console.log(`Ajout de la lune de ${body.name} à la liste des corps pour le rendu`);
                }
            }
        }
        
        this.universeState = {
            ...this.universeState,
            ...state
        };
    }
    
    updateParticleSystemState(state) {
        this.particleSystemState = {
            ...this.particleSystemState,
            ...state
        };
    }
    
    // Définir le contrôleur de physique
    setPhysicsController(physicsController) {
        this.physicsController = physicsController;
    }
    
    // Méthode principale de rendu
    render(ctx, canvas, rocketModel, universeModel, particleSystemModel, isPaused, camera, activeMissions = [], totalCreditsEarned = 0) {
        // Effacer le canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Rendre le fond
        if (this.universeView) {
            this.universeView.renderBackground(ctx, camera);
        }
        
        // Rendre les étoiles
        if (this.universeView && this.universeState.stars) {
            this.universeView.renderStars(ctx, camera, this.universeState.stars);
        }
        
        // Rendre les corps célestes
        if (this.universeView && this.celestialBodyView && this.universeState.celestialBodies) {
            this.universeView.renderCelestialBodies(ctx, camera, this.universeState.celestialBodies);
        }
        
        // Rendre la trace de la fusée
        if (this.traceView) {
            this.traceView.render(ctx, camera);
        }
        
        // Rendre les particules
        if (this.particleView) {
            this.particleView.renderParticles(ctx, particleSystemModel, camera);
        }
        
        // Calculs des vecteurs pour l'affichage
        // 1. Vecteur d'accélération totale (somme des forces)
        let accelerationVector = null;
        if (this.physicsController && this.physicsController.physicsVectors) {
            // On prend l'accélération totale (somme des forces divisée par la masse)
            const f = this.physicsController.physicsVectors.totalAcceleration;
            if (f && (f.x !== 0 || f.y !== 0)) {
                accelerationVector = { x: f.x, y: f.y };
                // Log de la norme du vecteur d'accélération
                const norm = Math.sqrt(f.x * f.x + f.y * f.y);
                console.log('[DEBUG] Norme du vecteur accélération:', norm, 'Valeur:', f);
            }
        }

        // 2. Vecteurs de mission (départ et arrivée)
        let missionStartVector = null;
        let missionTargetVector = null;
        if (activeMissions && activeMissions.length > 0 && rocketModel && universeModel) {
            const mission = activeMissions[0];
            const rocketPos = rocketModel.position;
            // Planète de départ
            const startBody = universeModel.celestialBodies.find(b => b.name === mission.from);
            if (startBody && rocketPos) {
                const dx = startBody.position.x - rocketPos.x;
                const dy = startBody.position.y - rocketPos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                missionStartVector = {
                    vector: { x: dx, y: dy },
                    name: mission.from,
                    distance: dist
                };
            }
            // Planète d'arrivée
            const targetBody = universeModel.celestialBodies.find(b => b.name === mission.to);
            if (targetBody && rocketPos) {
                const dx = targetBody.position.x - rocketPos.x;
                const dy = targetBody.position.y - rocketPos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                missionTargetVector = {
                    vector: { x: dx, y: dy },
                    name: mission.to,
                    distance: dist
                };
            }
        }
        // Fusionner dans l'état de la fusée pour l'affichage
        const rocketStateForView = {
            ...rocketModel,
            accelerationVector,
            missionStartVector,
            missionTargetVector
        };
        // LOG DEBUG pour le vecteur accélération (une seule fois au chargement ou lors d'un changement de mission)
        if (!window._accelVectorLogged || window._lastMissionName !== (activeMissions && activeMissions[0] && activeMissions[0].name)) {
            console.log('[DEBUG] accelerationVector:', accelerationVector);
            window._accelVectorLogged = true;
            window._lastMissionName = (activeMissions && activeMissions[0] && activeMissions[0].name);
        }
        // Rendre la fusée
        if (this.rocketView) {
            this.rocketView.render(ctx, rocketStateForView, camera);
        }
        
        // Dessiner les vecteurs de force si activés
        if (this.physicsController) {
            this.physicsController.drawForceVectors(ctx, camera);
        }
        
        // Rendre l'interface utilisateur
        if (this.uiView) {
            this.uiView.render(ctx, canvas, rocketModel, universeModel, isPaused, activeMissions, totalCreditsEarned);
        }
    }
    
    // Mettre à jour la trace de la fusée
    updateTrace() {
        if (!this.traceView || !this.rocketState || !this.rocketState.position) {
            return;
        }
        
        // S'assurer que la position est valide
        if (this.rocketState.position.x === undefined || this.rocketState.position.y === undefined ||
            isNaN(this.rocketState.position.x) || isNaN(this.rocketState.position.y)) {
            console.warn("Position de la fusée invalide pour la trace:", this.rocketState.position);
            return;
        }
        
        // Supprimer toute la logique de vérification et d'appel relative à la lune
        /*
        // Vérifier si la fusée est détruite et attachée à la lune
        const isAttachedToMoon = (this.rocketState.isDestroyed && 
                                 (this.rocketState.attachedTo === 'Lune' || this.rocketState.landedOn === 'Lune')) ||
                                 (!this.rocketState.isDestroyed && this.rocketState.landedOn === 'Lune');
        
        // Si la fusée est attachée à la lune, on a besoin de la position de la lune
        let moonPosition = null;
        if (isAttachedToMoon && this.universeState && this.universeState.celestialBodies) {
            // Trouver la lune dans l'univers
            const moon = this.universeState.celestialBodies.find(body => body.name === 'Lune');
            if (moon && moon.position) {
                moonPosition = moon.position;
                
                // Vérifier que la position de la lune est valide
                if (moonPosition.x === undefined || moonPosition.y === undefined ||
                    isNaN(moonPosition.x) || isNaN(moonPosition.y)) {
                    console.warn("Position de la lune invalide pour la trace:", moonPosition);
                    moonPosition = null;
                } else {
                    // Mettre à jour les traces existantes pour qu'elles suivent la lune
                    // this.traceView.updateTracesForMoon(moonPosition); // Appel supprimé
                }
            }
        }
        */
        
        // Ajouter le point de trace (coordonnées absolues uniquement)
        this.traceView.update(this.rocketState.position);
    }
} 