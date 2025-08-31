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
        this.stationView = new StationView();
        this.vectorsView = new VectorsView(); // Nouvelle vue pour les vecteurs
        this.showVectors = false; // Par défaut désactivé
        this.showGravityField = false; // Par défaut désactivé
        this.gravityFieldMode = 0; // 0: rien, 1: flèches, 2: lignes
        
        // Initialiser la taille et gérer le redimensionnement
        this.handleResize(); // Appel initial pour définir la taille
        this._boundResize = this.handleResize.bind(this);
        window.addEventListener('resize', this._boundResize);
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(() => window.removeEventListener('resize', this._boundResize));
        }
        
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

        // S'abonner directement aux événements de bascule du rendu
        if (window.EVENTS && window.EVENTS.RENDER) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_VECTORS, () => this.toggleVectors())
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD, () => this.toggleGravityField())
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_TRACES, () => this.toggleTraceVisibility())
            );
        } else {
            console.warn("RenderingController: EVENTS.RENDER non disponible, les bascules de rendu pourraient ne pas fonctionner via EventBus.");
        }
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
        // Mise à jour simple de l'état de l'univers pour le rendu
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

        // Mettre à jour la trace avec la dernière position connue de la fusée avant le rendu
        // this.updateTrace(); // L'appel est déplacé ici
        // Correction: rocketState est mis à jour par l'événement SIMULATION.UPDATED.
        // Si GameController.update appelle emitUpdatedStates APRÈS this.updateTrace, alors rocketState ne serait pas à jour ici.
        // Assurons-nous que updateTrace est appelé avec les données les plus fraîches ou que l'ordre est correct.
        // Pour l'instant, on part du principe que this.rocketState est à jour au moment où render() est appelé.
        // GameController.gameLoop -> update() -> emitUpdatedStates() -> RenderingController.render()
        // Donc this.rocketState (mis à jour par SIMULATION.UPDATED) devrait être frais.

        if (!this.isSystemPaused) { // Seulement si le jeu n'est pas en pause
            this.updateTrace(); // Mettre à jour les données de la trace
        }

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

        // Rendre les stations si présentes
        if (universeModel && universeModel.stations && universeModel.celestialBodies && this.stationView) {
            for (const st of universeModel.stations) {
                const host = universeModel.celestialBodies.find(b => b.name === st.hostName);
                if (!host) continue;
                // Positionner la station juste SOUS la surface: rayon - inset (fallback sur +offset si ancien champ)
                const r = host.radius - (STATIONS && STATIONS.SURFACE_INSET !== undefined ? STATIONS.SURFACE_INSET : -(STATIONS ? STATIONS.SURFACE_OFFSET : 4));
                const worldX = host.position.x + Math.cos(st.angle) * r;
                const worldY = host.position.y + Math.sin(st.angle) * r;
                const screen = this.universeView.worldToScreen(worldX, worldY, camera);
                if (this.universeView.isPointVisible(screen.x, screen.y, camera)) {
                    // Taille proportionnelle au zoom; devient minuscule puis invisible quand on dé-zoom fortement
                    const baseSize = (STATIONS ? STATIONS.ICON_SIZE : 8);
                    const size = baseSize * camera.zoom;
                    if (size < 1) { // Trop petit: on ne dessine pas
                        continue;
                    }
                    this.stationView.drawStation(ctx, screen.x, screen.y, size, st.color || (STATIONS ? STATIONS.COLOR : '#00FFCC'), st.name, st.angle);
                }
            }
        }
        
        // Rendre la trace de la fusée
        if (this.traceView) {
            this.traceView.render(ctx, camera);
        }
        
        // Rendre les particules en découplé
        if (this.particleView) {
            // Utiliser le modèle passé (live) si disponible, sinon retomber sur l'état interne
            const particlesSource = particleSystemModel || this.particleSystemState;
            const rocketSource = rocketModel || this.rocketState;
            this.particleView.renderParticles(ctx, particlesSource, camera, rocketSource);
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
            // console.warn("[RenderingController] Position de la fusée invalide pour la trace:", this.rocketState.position);
            return;
        }
        
        // La logique complexe avec la lune n'est plus nécessaire car TraceView.update ne la prend plus en charge.
        // Ajouter simplement le point de trace (coordonnées absolues uniquement)
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

    // Nouvelle méthode pour réinitialiser la trace
    resetTrace(initialRocketPosition) {
        if (this.traceView) {
            this.traceView.clear(true); // Efface complètement tous les points de la trace
            if (initialRocketPosition && 
                initialRocketPosition.x !== undefined && initialRocketPosition.y !== undefined &&
                !isNaN(initialRocketPosition.x) && !isNaN(initialRocketPosition.y)) {
                // Ajoute le premier point de la nouvelle trace si la position est valide
                this.traceView.update(initialRocketPosition);
            } else if (initialRocketPosition) {
                // Log si la position initiale fournie n'est pas valide
                console.warn("[RenderingController.resetTrace] Position initiale de la fusée non valide, trace non initialisée avec un point:", initialRocketPosition);
            } 
            // Si initialRocketPosition n'est pas fourni, la trace est juste effacée.
        }
    }
} 