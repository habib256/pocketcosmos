class RenderingController {
    constructor(eventBus, canvas) {
        this.eventBus = eventBus;
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.isSystemPaused = false; // Flag pour l'état de pause du système de rendu
        
        // Références aux vues
        this.rocketView = null;
        this.universeView = null;
        this.celestialBodyView = null;
        this.particleView = null;
        this.traceView = null;
        this.uiView = null;
        this.vectorsView = new VectorsView(); // Nouvelle vue pour les vecteurs
        this.showVectors = false; // Par défaut désactivé
        this.showGravityField = false; // Par défaut désactivé
        this.gravityFieldMode = 0; // 0: rien, 1: flèches, 2: lignes
        
        // Initialiser la taille et gérer le redimensionnement
        this.handleResize(); // Appel initial pour définir la taille
        window.addEventListener('resize', () => this.handleResize());
        // TODO: Ajouter le removeEventListener dans une méthode cleanup si nécessaire
        
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

        // S'abonner aux événements de pause du jeu
        if (this.eventBus && window.EVENTS && window.EVENTS.GAME) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_PAUSED, () => {
                    this.isSystemPaused = true;
                    // console.log("RenderingController: PAUSED");
                })
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_RESUMED, () => {
                    this.isSystemPaused = false;
                    // console.log("RenderingController: RESUMED");
                })
            );
        } else {
            console.error("EventBus ou EVENTS.GAME non disponibles pour RenderingController lors de l'abonnement pause/resume.");
        }
    }
    
    subscribeToEvents() {
        // S'abonner et enregistrer l'unsubscribe dans le container
        window.controllerContainer.track(
            this.eventBus.subscribe(EVENTS.SIMULATION.UPDATED, (simState) => {
                if (simState.rocket) {
                    this.updateRocketState(simState.rocket);
                }
                if (simState.universe) {
                    this.updateUniverseState(simState.universe);
                }
                if (simState.particles) {
                    this.updateParticleSystemState(simState.particles);
                }
            })
        );
        window.controllerContainer.track(
            this.eventBus.subscribe(EVENTS.SYSTEM.CONTROLLERS_SETUP, ({ physicsController }) => {
                this.physicsController = physicsController;
            })
        );

        // Abonnement no-op pour éviter l'avertissement lors de l'émission de UI_UPDATE_CREDITS
        window.controllerContainer.track(
            this.eventBus.subscribe(EVENTS.UI.CREDITS_UPDATED, (data) => {
                // no-op
            })
        );
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
    
    // Méthode principale de rendu
    render(time, /*ctx, canvas,*/ rocketModel, universeModel, particleSystemModel, camera, activeMissions = [], totalCreditsEarned = 0, missionJustSucceeded = false) {
        // Le paramètre isPaused est retiré, on utilise this.isSystemPaused à la place.
        
        // Utiliser this.ctx et this.canvas internes
        const ctx = this.ctx;
        const canvas = this.canvas;

        // Effacer le canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Si le jeu est en pause (géré par RenderingController lui-même)
        if (this.isSystemPaused) {
            if (this.uiView) {
                // UIView gère l'affichage du message de PAUSE
                this.uiView.render(ctx, canvas, rocketModel, universeModel, this.isSystemPaused, activeMissions, totalCreditsEarned, null, missionJustSucceeded);
            }
            // Ne pas rendre le reste de la scène si en pause
            return; 
        }
        
        // Rendre le fond et les corps séparément, en utilisant uniquement les états internes
        if (this.universeView) {
            this.universeView.renderBackground(ctx, camera);
            this.universeView.render(ctx, camera, this.universeState.stars, [], time);
        }
        
        // Rendre les étoiles
        if (this.universeView && this.universeState.stars) {
            this.universeView.renderStars(ctx, camera, this.universeState.stars);
        }
        
        // Rendre les corps célestes
        if (this.universeView && this.celestialBodyView && universeModel && universeModel.celestialBodies) {
            this.universeView.renderCelestialBodies(ctx, camera, universeModel.celestialBodies);
        }
        
        // Rendre la trace de la fusée
        if (this.traceView) {
            this.traceView.render(ctx, camera);
        }
        
        // Rendre les particules en découplé
        if (this.particleView) {
            this.particleView.renderParticles(ctx, this.particleSystemState, camera, this.rocketState);
        }
        
        // Utiliser directement rocketModel (l'argument frais de GameController) pour les données de la fusée
        let currentAccelerationVector = { x: 0, y: 0 };
        if (rocketModel && rocketModel.acceleration) {
            currentAccelerationVector = rocketModel.acceleration; 
        }

        // Vecteurs de mission (départ et arrivée)
        let missionStartVector = null;
        let missionTargetVector = null;
        if (activeMissions && activeMissions.length > 0 && rocketModel && universeModel && rocketModel.position) {
            const mission = activeMissions[0];
            const rocketPos = rocketModel.position;
            const startBody = universeModel.celestialBodies.find(b => b.name === mission.from);
            if (startBody && startBody.position) {
                const dx = startBody.position.x - rocketPos.x;
                const dy = startBody.position.y - rocketPos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                missionStartVector = {
                    vector: { x: dx, y: dy },
                    name: mission.from,
                    distance: dist
                };
            }
            const targetBody = universeModel.celestialBodies.find(b => b.name === mission.to);
            if (targetBody && targetBody.position) {
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

        // Préparer l'état de la fusée pour les vues (rocketView, vectorsView)
        // en utilisant le rocketModel frais passé en argument comme base,
        // et en y ajoutant les vecteurs calculés stockés dans this.rocketState (maintenant à jour).
        const baseRocketState = rocketModel ? {
            position: rocketModel.position,
            angle: rocketModel.angle,
            velocity: rocketModel.velocity,
            acceleration: rocketModel.acceleration, // Accélération "physique" du modèle
            thrusters: rocketModel.thrusters,
            fuel: rocketModel.fuel,
            health: rocketModel.health,
            isLanded: rocketModel.isLanded,
            isDestroyed: rocketModel.isDestroyed,
            attachedTo: rocketModel.attachedTo,
            relativePosition: rocketModel.relativePosition,
            mass: rocketModel.mass
        } : {};

        // this.rocketState contient les vecteurs calculés par GameController.emitUpdatedStates()
        // (gravityVector, thrustVectors, totalThrustVector, accelerationVector (résultant), lunarAttraction, earth)
        // et aussi potentiellement les champs de base, mais ceux de rocketModel (passé en arg) sont plus frais.
        const calculatedVectorsFromEvent = this.rocketState || {};

        const rocketStateForView = {
            ...baseRocketState, // Priorité aux données fraîches de rocketModel
            // Ajouter les vecteurs de this.rocketState (qui devraient être à jour grâce à emitUpdatedStates() en fin de gameLoop)
            gravityVector: calculatedVectorsFromEvent.gravityVector,
            thrustVectors: calculatedVectorsFromEvent.thrustVectors, // Note: `calculateThrustVectors` dans GameController utilise `PHYSICS.MAIN_THRUST` etc.
            totalThrustVector: calculatedVectorsFromEvent.totalThrustVector,
            accelerationVector: calculatedVectorsFromEvent.accelerationVector, // C'est le a=F/m global
            lunarAttraction: calculatedVectorsFromEvent.lunarAttraction,
            earth: calculatedVectorsFromEvent.earth,
            // Ajouter les vecteurs de mission calculés localement
            missionStartVector,
            missionTargetVector
        };
        // Assurer que même si rocketModel est null, on passe un objet à rocketView
        const finalRocketStateForView = rocketModel ? rocketStateForView : {};

        // Rendre la fusée
        if (this.rocketView) {
            this.rocketView.render(ctx, finalRocketStateForView, camera);
        }
        // Afficher les vecteurs physiques de la fusée SI activé
        if (this.vectorsView && this.showVectors) {
            this.vectorsView.render(ctx, finalRocketStateForView, camera, {
                showTotalThrustVector: true,
                showVelocityVector: true,
                showAccelerationVector: true,
                showLunarAttractionVector: true,
                showEarthAttractionVector: true,
                showMissionStartVector: true,
                showMissionTargetVector: true,
                showThrustVector: true,
                showTotalAccelerationVector: true
            });
        }
        // Afficher le champ de gravité selon le mode
        if (this.vectorsView && this.gravityFieldMode === 1) {
            this.vectorsView.render(ctx, finalRocketStateForView, camera, { showGravityField: 'arrows', physicsController: this.physicsController });
        } else if (this.vectorsView && this.gravityFieldMode === 2) {
            this.vectorsView.render(ctx, finalRocketStateForView, camera, { showGravityField: 'lines', physicsController: this.physicsController });
        }
        
        // Rendre l'interface utilisateur
        if (this.uiView) {
            // Passer this.isSystemPaused à uiView.render
            this.uiView.render(ctx, canvas, rocketModel, universeModel, this.isSystemPaused, activeMissions, totalCreditsEarned, currentAccelerationVector, missionJustSucceeded);
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
    
    // Ajout : méthode pour basculer l'affichage des vecteurs
    toggleVectors() {
        this.showVectors = !this.showVectors;
        console.log(`[RenderingController] Affichage des vecteurs : ${this.showVectors ? 'activé' : 'désactivé'}`);
    }
    // Ajout : méthode pour basculer l'affichage du champ de gravité
    toggleGravityField() {
        this.gravityFieldMode = (this.gravityFieldMode + 1) % 3;
        let msg = '';
        if (this.gravityFieldMode === 0) msg = 'désactivé';
        else if (this.gravityFieldMode === 1) msg = 'flèches';
        else if (this.gravityFieldMode === 2) msg = 'lignes de champ';
        console.log(`[RenderingController] Affichage du champ de gravité : ${msg}`);
    }

    // Ajout : méthode pour basculer l'affichage de la trace
    toggleTraceVisibility() {
        if (this.traceView) {
            this.traceView.toggleVisibility(); // Appelle la méthode sur l'instance de TraceView qu'il détient
            console.log(`[RenderingController] Affichage de la trace : ${this.traceView.isVisible ? 'activé' : 'désactivé'}`);
        } else {
            console.warn("[RenderingController] toggleTraceVisibility appelé mais traceView n'est pas initialisée.");
        }
    }

    // Nouvelle méthode pour gérer le redimensionnement du canvas
    handleResize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            
            // Émettre un événement avec les nouvelles dimensions
            // Assurez-vous que EVENTS.SYSTEM.CANVAS_RESIZED est défini
            // ou utilisez une constante d'événement appropriée (ex: EVENTS.RENDER.CANVAS_RESIZED)
            if (this.eventBus && window.EVENTS && window.EVENTS.SYSTEM && window.EVENTS.SYSTEM.CANVAS_RESIZED) { 
                this.eventBus.emit(window.EVENTS.SYSTEM.CANVAS_RESIZED, { 
                    width: this.canvas.width, 
                    height: this.canvas.height 
                });
            } else if (this.eventBus && window.EVENTS && window.EVENTS.RENDER && window.EVENTS.RENDER.CANVAS_RESIZED) { // Fallback si RENDER.CANVAS_RESIZED existe
                 this.eventBus.emit(window.EVENTS.RENDER.CANVAS_RESIZED, { 
                    width: this.canvas.width, 
                    height: this.canvas.height 
                });
            } else {
                console.warn("EVENT.SYSTEM.CANVAS_RESIZED ou EVENT.RENDER.CANVAS_RESIZED non défini. L'événement de redimensionnement du canvas ne sera pas émis.");
            }
            console.log(`Canvas redimensionné à: ${this.canvas.width}x${this.canvas.height}`);
        }
    }

    // Nouvelle méthode pour obtenir les dimensions du canvas
    getCanvasDimensions() {
        if (this.canvas) {
            return { width: this.canvas.width, height: this.canvas.height };
        }
        // Retourner des valeurs par défaut ou gérer l'erreur si le canvas n'est pas prêt
        console.warn("getCanvasDimensions appelé avant que le canvas ne soit initialisé.");
        return { width: 0, height: 0 }; 
    }
} 