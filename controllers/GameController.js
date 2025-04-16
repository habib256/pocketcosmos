// import missionManager from './MissionManager.js'; // Supprimer cette ligne

class GameController {
    constructor(eventBus, missionManager) {
        // EventBus
        this.eventBus = eventBus;
        this.missionManager = missionManager; // Utilise la variable passée en argument
        
        // Modèles
        this.rocketModel = null;
        this.universeModel = null;
        this.particleSystemModel = null;
        
        // Vues
        this.rocketView = null;
        this.universeView = null;
        this.particleView = null;
        this.celestialBodyView = null;
        this.traceView = null;
        this.uiView = null;
        
        // Contrôleurs
        this.inputController = null;
        this.physicsController = null;
        this.particleController = null;
        this.renderingController = null;
        this.rocketAgent = null;
        
        // État du jeu
        this.isRunning = false;
        this.isPaused = false;
        this.lastTimestamp = 0;
        this.elapsedTime = 0;
        
        // Canvas et contexte
        this.canvas = null;
        this.ctx = null;
        
        // Variables pour le glisser-déposer
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartRocketX = 0;
        this.dragStartRocketY = 0;

        // Crédits gagnés - Initialiser à 10
        this.totalCreditsEarned = 10;

        // Initialiser la caméra
        this.cameraModel = new CameraModel();
        
        // Timer pour réinitialisation auto après crash
        this.crashResetTimer = null;
        
        // S'abonner aux événements
        this.subscribeToEvents();

        // Ajout : pause automatique si l'utilisateur quitte l'onglet
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && !this.isPaused) {
                this.isPaused = true;
                // console.log('[AUTO-PAUSE] Jeu mis en pause car l\'onglet n\'est plus actif.');
                // On peut aussi émettre un événement si besoin :
                // this.eventBus.emit('GAME_PAUSED');
            }
        });

        this.pauseKeyDown = false;

        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('ROCKET_CRASH_EXPLOSION', (e) => {
                if (this.particleController && e.detail) {
                    // Explosion massive : beaucoup de particules, couleurs vives, grande taille
                    this.particleController.createExplosion(
                        e.detail.x,
                        e.detail.y,
                        120, // nombre de particules
                        8,   // vitesse
                        10,  // taille
                        2.5, // durée de vie (secondes)
                        '#FFDD00', // couleur début (jaune vif)
                        '#FF3300'  // couleur fin (rouge/orange)
                    );
                }
            });

            // --- Effet Mission Réussie (particules texte) ---
            window.addEventListener('MISSION_SUCCESS_PARTICLES', (e) => {
                // Effet désactivé : on ne veut plus de texte coloré au-dessus de la fusée
                // if (this.particleController && e.detail) {
                //     this.particleController.createMissionSuccessParticles(
                //         e.detail.x,
                //         e.detail.y,
                //         e.detail.message || 'Mission réussie'
                //     );
                // }
            });
        }

        this._lastRocketDestroyed = false;
    }
    
    // S'abonner aux événements de l'EventBus
    subscribeToEvents() {
        this.eventBus.subscribe('INPUT_KEYDOWN', (data) => this.handleKeyDown(data));
        this.eventBus.subscribe('INPUT_KEYUP', (data) => this.handleKeyUp(data));
        this.eventBus.subscribe('INPUT_KEYPRESS', (data) => this.handleKeyPress(data));
        this.eventBus.subscribe('INPUT_MOUSEDOWN', (data) => this.handleMouseDown(data));
        this.eventBus.subscribe('INPUT_MOUSEMOVE', (data) => this.handleMouseMove(data));
        this.eventBus.subscribe('INPUT_MOUSEUP', (data) => this.handleMouseUp(data));
        this.eventBus.subscribe('INPUT_WHEEL', (data) => this.handleWheel(data));
        
        // Événement pour les vecteurs (une seule méthode)
        this.eventBus.subscribe('toggleVectors', () => this.toggleVectors());
        // Ajout : événement pour le champ de gravité
        this.eventBus.subscribe('toggleGravityField', () => this.toggleGravityField());
        
        // Événement pour les mises à jour d'état de la fusée
        this.eventBus.subscribe('ROCKET_STATE_UPDATED', (data) => this.handleRocketStateUpdated(data));
        // Événement lorsque la fusée atterrit
        this.eventBus.subscribe('ROCKET_LANDED', (data) => this.handleRocketLanded(data));

        // --- Abonnements Joystick ---
        this.eventBus.subscribe('INPUT_JOYSTICK_AXIS_CHANGED', (data) => this.handleJoystickAxisChanged(data));
        this.eventBus.subscribe('INPUT_JOYSTICK_BUTTON_DOWN', (data) => this.handleJoystickButtonDown(data));
        this.eventBus.subscribe('INPUT_JOYSTICK_BUTTON_UP', (data) => this.handleJoystickButtonUp(data));
        this.eventBus.subscribe('INPUT_JOYSTICK_AXIS_HELD', (data) => this.handleJoystickAxisHeld(data));
        this.eventBus.subscribe('INPUT_JOYSTICK_AXIS_RELEASED', (data) => this.handleJoystickAxisReleased(data));
        this.eventBus.subscribe('INPUT_GAMEPAD_CONNECTED', () => { /* On pourrait afficher un message */ });
        this.eventBus.subscribe('INPUT_GAMEPAD_DISCONNECTED', () => { /* On pourrait afficher un message */ });
        // --- Fin Abonnements Joystick ---
    }
    
    // Gérer les événements d'entrée
    handleKeyDown(data) {
        // Si en pause, n'importe quelle flèche doit reprendre le jeu (hors P/Escape)
        if (this.isPaused && (data.action === 'thrustForward' || data.action === 'thrustBackward' || data.action === 'rotateLeft' || data.action === 'rotateRight')) {
            this.isPaused = false;
            console.log("Jeu repris par flèche");
            return;
        }
        
        switch (data.action) {
            case 'thrustForward':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
                this.particleSystemModel.setEmitterActive('main', true, this.rocketModel);
                break;
            case 'thrustBackward':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
                this.particleSystemModel.setEmitterActive('rear', true, this.rocketModel);
                break;
            case 'rotateLeft':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('left', ROCKET.THRUSTER_POWER.LEFT);
                this.particleSystemModel.setEmitterActive('left', true, this.rocketModel);
                break;
            case 'rotateRight':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('right', ROCKET.THRUSTER_POWER.RIGHT);
                this.particleSystemModel.setEmitterActive('right', true, this.rocketModel);
                break;
            case 'zoomIn':
                this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
                break;
            case 'zoomOut':
                this.cameraModel.setZoom(this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED));
                break;
        }
        
        // Émettre l'état mis à jour
        this.emitUpdatedStates();
    }
    
    handleKeyUp(data) {
        // Toggle pause sur relâchement de P ou Escape
        if (data.action === 'pauseGame') {
            this.isPaused = !this.isPaused;
            console.log(this.isPaused ? "Jeu mis en pause (toggle par P/Escape)" : "Jeu repris (toggle par P/Escape)");
            return;
        }
        switch (data.action) {
            case 'thrustForward':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('main', 0);
                this.particleSystemModel.setEmitterActive('main', false, this.rocketModel);
                
                // Forcer l'arrêt du son du propulseur principal
                if (this.physicsController && this.physicsController.mainThrusterSoundPlaying) {
                    if (this.physicsController.mainThrusterSound) {
                        this.physicsController.mainThrusterSound.pause();
                        this.physicsController.mainThrusterSound.currentTime = 0;
                        this.physicsController.mainThrusterSoundPlaying = false;
                    }
                }
                break;
            case 'thrustBackward':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('rear', 0);
                this.particleSystemModel.setEmitterActive('rear', false, this.rocketModel);
                break;
            case 'rotateLeft':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('left', 0);
                this.particleSystemModel.setEmitterActive('left', false, this.rocketModel);
                break;
            case 'rotateRight':
                if (!this.rocketModel) return;
                this.rocketModel.setThrusterPower('right', 0);
                this.particleSystemModel.setEmitterActive('right', false, this.rocketModel);
                break;
        }
        
        // Émettre l'état mis à jour
        this.emitUpdatedStates();
    }
    
    handleKeyPress(data) {
        // Ne plus gérer la pause ici pour P/Escape
        if (this.isPaused) {
            this.isPaused = false;
            console.log("Jeu repris par keypress");
            return;
        }

        switch (data.action) {
            case 'pauseGame':
                // Toujours sortir de la pause si on est en pause
                if (this.isPaused) {
                    this.isPaused = false;
                    console.log("Jeu repris par touche P");
                } else {
                    this.togglePause();
                }
                break;
            case 'resetRocket':
                this.resetRocket();
                break;
            case 'centerCamera':
                if (this.cameraModel && this.rocketModel) {
                    this.cameraModel.setTarget(this.rocketModel, 'rocket');
                }
                break;
            case 'toggleForces':
                if (this.physicsController) {
                    const showForces = this.physicsController.toggleForceVectors();
                    console.log(`Affichage des forces: ${showForces ? 'activé' : 'désactivé'}`);
                }
                break;
            case 'toggleVectors':
                this.toggleVectors();
                break;
            case 'toggleTraces':
                this.toggleTraceVisibility();
                break;
            case 'increaseThrustMultiplier':
                this.adjustThrustMultiplier(2.0); // Doubler
                break;
            case 'decreaseThrustMultiplier':
                this.adjustThrustMultiplier(0.5); // Réduire de moitié
                break;
            case 'toggleAI':
                this.toggleAIControl();
                break;
        }
    }
    
    handleMouseDown(data) {
        if (this.isPaused) return;
        
        this.isDragging = true;
        this.dragStartX = data.x;
        this.dragStartY = data.y;
        
        if (this.cameraModel) {
            this.dragStartCameraX = this.cameraModel.x;
            this.dragStartCameraY = this.cameraModel.y;
        }
    }
    
    handleMouseMove(data) {
        if (!this.isDragging || this.isPaused) return;
        
        const dx = (data.x - this.dragStartX) / this.cameraModel.zoom;
        const dy = (data.y - this.dragStartY) / this.cameraModel.zoom;
        
        if (this.cameraModel) {
            this.cameraModel.setPosition(
                this.dragStartCameraX - dx,
                this.dragStartCameraY - dy
            );
        }
    }
    
    handleMouseUp(data) {
        this.isDragging = false;
        
        // Vérifier si le clic est sur le bouton des contrôles assistés
        if (this.uiView && this.uiView.isPointInAssistedControlsButton(data.x, data.y)) {
            this.toggleAssistedControls();
        }
    }
    
    handleWheel(data) {
        if (this.isPaused) return;
        
        if (this.cameraModel) {
            const zoomFactor = 1 + RENDER.ZOOM_SPEED;
            if (data.delta > 0) {
                // Zoom out (molette vers le bas)
                this.cameraModel.setZoom(this.cameraModel.zoom / zoomFactor);
            } else {
                // Zoom in (molette vers le haut)
                this.cameraModel.setZoom(this.cameraModel.zoom * zoomFactor);
            }
        }
    }
    
    // Émettre les états mis à jour pour les vues
    emitUpdatedStates() {
        if (this.rocketModel) {
            // Calculer les vecteurs de gravité et de poussée pour le rendu
            const gravityVector = this.calculateGravityVector();
            const thrustVectors = this.calculateThrustVectors();
            const totalThrustVector = this.calculateTotalThrustVector();
            
            // Calculer le vecteur d'attraction lunaire
            const lunarAttraction = this.calculateLunarAttractionVector();
            
            // Calculer la distance à la Terre et le vecteur d'attraction terrestre
            const earthDistance = this.calculateEarthDistance();
            const earthAttractionVector = this.calculateEarthAttractionVector();
            
            // Récupérer la liste du cargo
            const cargoList = this.rocketModel.cargo ? this.rocketModel.cargo.getCargoList() : [];

            // Mettre à jour l'affichage du cargo dans l'UI
            if (this.uiView) {
                this.uiView.updateCargoDisplay(cargoList);
            }
            
            // Émettre l'état de la fusée mis à jour
            this.eventBus.emit('ROCKET_STATE_UPDATED', {
                position: { ...this.rocketModel.position },
                velocity: { ...this.rocketModel.velocity },
                angle: this.rocketModel.angle,
                fuel: this.rocketModel.fuel,
                health: this.rocketModel.health,
                isLanded: this.rocketModel.isLanded,
                isDestroyed: this.rocketModel.isDestroyed,
                landedOn: this.rocketModel.landedOn,
                attachedTo: this.rocketModel.attachedTo,
                relativePosition: this.rocketModel.relativePosition ? {...this.rocketModel.relativePosition} : null,
                thrusters: { ...this.rocketModel.thrusters },
                gravityVector,
                thrustVectors,
                totalThrustVector,
                lunarAttractionVector: lunarAttraction ? lunarAttraction.vector : null,
                lunarDistance: lunarAttraction ? lunarAttraction.distance : null,
                earthDistance: earthDistance,
                earthAttractionVector: earthAttractionVector
            });
        }
        
        if (this.universeModel) {
            // S'assurer que les corps célestes sont envoyés correctement
            this.eventBus.emit('UNIVERSE_STATE_UPDATED', {
                celestialBodies: this.universeModel.celestialBodies.map(body => ({
                    name: body.name,
                    mass: body.mass,
                    radius: body.radius,
                    position: { ...body.position },
                    velocity: { ...body.velocity },
                    color: body.color,
                    atmosphere: { ...body.atmosphere }
                })),
                stars: this.universeModel.stars
            });
        }
        
        if (this.particleSystemModel) {
            this.eventBus.emit('PARTICLE_SYSTEM_UPDATED', {
                emitters: this.particleSystemModel.emitters,
                debrisParticles: this.particleSystemModel.debrisParticles
            });
        }
    }
    
    // Calculer le vecteur de gravité pour le rendu
    calculateGravityVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        let totalGravityX = 0;
        let totalGravityY = 0;
        
        for (const body of this.universeModel.celestialBodies) {
            const dx = body.position.x - this.rocketModel.position.x;
            const dy = body.position.y - this.rocketModel.position.y;
            const distanceSquared = dx * dx + dy * dy;
            const distance = Math.sqrt(distanceSquared);
            
            const forceMagnitude = PHYSICS.G * body.mass * this.rocketModel.mass / distanceSquared;
            
            const forceX = forceMagnitude * (dx / distance);
            const forceY = forceMagnitude * (dy / distance);
            
            totalGravityX += forceX / this.rocketModel.mass;
            totalGravityY += forceY / this.rocketModel.mass;
        }
        
        return { x: totalGravityX, y: totalGravityY };
    }
    
    // Calculer les vecteurs de poussée pour le rendu
    calculateThrustVectors() {
        if (!this.rocketModel) return null;
        
        const thrustVectors = {};
        
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            if (thruster.power > 0) {
                let thrustAngle = 0;
                let thrustMagnitude = 0;
                
                switch (thrusterName) {
                    case 'main':
                        thrustAngle = this.rocketModel.angle + Math.PI/2;
                        thrustMagnitude = PHYSICS.MAIN_THRUST * (thruster.power / thruster.maxPower);
                        break;
                    case 'rear':
                        thrustAngle = this.rocketModel.angle - Math.PI/2;
                        thrustMagnitude = PHYSICS.REAR_THRUST * (thruster.power / thruster.maxPower);
                        break;
                    case 'left':
                        thrustAngle = this.rocketModel.angle + 0;
                        thrustMagnitude = PHYSICS.LATERAL_THRUST * (thruster.power / thruster.maxPower);
                        break;
                    case 'right':
                        thrustAngle = this.rocketModel.angle + Math.PI;
                        thrustMagnitude = PHYSICS.LATERAL_THRUST * (thruster.power / thruster.maxPower);
                        break;
                }
                
                thrustVectors[thrusterName] = {
                    position: { 
                        x: thruster.position.x, 
                        y: thruster.position.y 
                    },
                    x: -Math.cos(thrustAngle),
                    y: -Math.sin(thrustAngle),
                    magnitude: thrustMagnitude
                };
            }
        }
        
        return thrustVectors;
    }
    
    // Calculer le vecteur de poussée totale
    calculateTotalThrustVector() {
        if (!this.rocketModel) return null;
        
        let totalX = 0;
        let totalY = 0;
        
        // Parcourir tous les propulseurs actifs
        for (const thrusterName in this.rocketModel.thrusters) {
            const thruster = this.rocketModel.thrusters[thrusterName];
            
            // Ne considérer que les propulseurs actifs
            if (thruster.power > 0) {
                // Récupérer la position du propulseur
                const position = ROCKET.THRUSTER_POSITIONS[thrusterName.toUpperCase()];
                if (!position) continue;
                
                // Calculer l'angle de poussée en fonction du type de propulseur
                let thrustAngle;
                
                if (thrusterName === 'left' || thrusterName === 'right') {
                    // Pour les propulseurs latéraux
                    const propAngle = Math.atan2(position.distance * Math.sin(position.angle), 
                                               position.distance * Math.cos(position.angle));
                    const perpDirection = thrusterName === 'left' ? Math.PI/2 : -Math.PI/2;
                    thrustAngle = this.rocketModel.angle + propAngle + perpDirection;
                } else {
                    // Pour les propulseurs principaux
                    switch (thrusterName) {
                        case 'main': 
                            thrustAngle = this.rocketModel.angle - Math.PI/2; // Vers le haut
                            break;
                        case 'rear':
                            thrustAngle = this.rocketModel.angle + Math.PI/2; // Vers le bas
                            break;
                        default:
                            thrustAngle = this.rocketModel.angle;
                    }
                }
                
                // Calculer la force en fonction de la puissance
                let thrustForce;
                switch (thrusterName) {
                    case 'main': 
                        thrustForce = ROCKET.MAIN_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    case 'rear': 
                        thrustForce = ROCKET.REAR_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    case 'left':
                    case 'right': 
                        thrustForce = ROCKET.LATERAL_THRUST * (thruster.power / 100) * PHYSICS.THRUST_MULTIPLIER;
                        break;
                    default:
                        thrustForce = 0;
                }
                
                // Ajouter la contribution de ce propulseur
                totalX += Math.cos(thrustAngle) * thrustForce;
                totalY += Math.sin(thrustAngle) * thrustForce;
            }
        }
        
        // Si aucune poussée, retourner null
        if (Math.abs(totalX) < 0.001 && Math.abs(totalY) < 0.001) {
            return null;
        }
        
        return { x: totalX, y: totalY };
    }
    
    // Initialiser le jeu
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Initialiser les modèles et vues
        this.setupModels();
        this.setupViews();
        
        // Configurer les contrôleurs
        this.setupControllers();
        
        // Configurer la caméra
        this.setupCamera();
        
        // Réinitialiser l'état de la fusée AVANT de démarrer la boucle
        this.resetRocket();
        
        // Démarrer la boucle de jeu principale SEULEMENT après la réinitialisation
        this.start();
        
        console.log("GameController initialisé et boucle démarrée.");
    }
    
    // Définir les contrôleurs
    setControllers(controllers) {
        this.inputController = controllers.inputController;
        this.renderingController = controllers.renderingController;
        this.rocketAgent = controllers.rocketAgent;
    }
    
    // Configurer les modèles
    setupModels() {
        try {
            // Créer un modèle d'univers
            this.universeModel = new UniverseModel();

            // --- Création des Corps Célestes --- 

            // 1. Soleil (Centre de l'univers, pas d'orbite)
            // Utilisation des constantes pour le Soleil
            const sun = new CelestialBodyModel(
                'Soleil',
                CELESTIAL_BODY.SUN.MASS,   // Masse depuis constants.js
                CELESTIAL_BODY.SUN.RADIUS, // Rayon depuis constants.js
                { x: 0, y: 0 }, // Position centrale
                '#FFD700',      // Couleur jaune
                null,           // Pas de parent
                0, 0, 0         // Pas d'orbite
            );
            this.universeModel.addCelestialBody(sun);

            // 2. Terre (Orbite autour du Soleil)
            // Utilisation des constantes pour la Terre
            const EARTH_ORBIT_DISTANCE = CELESTIAL_BODY.EARTH.ORBIT_DISTANCE; // Distance depuis constants.js
            const EARTH_ORBIT_SPEED = CELESTIAL_BODY.EARTH.ORBIT_SPEED;         // Vitesse LENTE depuis constants.js
            const earthInitialAngle = Math.random() * Math.PI * 2; // Angle de départ aléatoire
            const earth = new CelestialBodyModel(
                'Terre',
                CELESTIAL_BODY.MASS,     // Masse depuis constants.js
                CELESTIAL_BODY.RADIUS,   // Rayon depuis constants.js
                { x: sun.position.x + Math.cos(earthInitialAngle) * EARTH_ORBIT_DISTANCE, y: sun.position.y + Math.sin(earthInitialAngle) * EARTH_ORBIT_DISTANCE }, // Position initiale calculée
                '#1E88E5',                // Couleur bleue
                sun,                      // Parent = Soleil
                EARTH_ORBIT_DISTANCE,     // Distance orbitale
                earthInitialAngle,        // Angle initial
                EARTH_ORBIT_SPEED         // Vitesse orbitale
            );
            earth.updateOrbit(0); // Calculer la position et la vélocité initiales
            this.universeModel.addCelestialBody(earth);

            // 3. Lune (Orbite autour de la Terre)
            const MOON_ORBIT_DISTANCE = CELESTIAL_BODY.MOON.ORBIT_DISTANCE; // Depuis constants.js
            const MOON_ORBIT_SPEED = CELESTIAL_BODY.MOON.ORBIT_SPEED;       // Depuis constants.js
            const moonInitialAngle = Math.random() * Math.PI * 2; // Angle de départ aléatoire autour de la Terre
            const moon = new CelestialBodyModel(
                'Lune',
                CELESTIAL_BODY.MOON.MASS,    // Masse depuis constants.js
                CELESTIAL_BODY.MOON.RADIUS,  // Rayon depuis constants.js
                { x: earth.position.x + Math.cos(moonInitialAngle) * MOON_ORBIT_DISTANCE, y: earth.position.y + Math.sin(moonInitialAngle) * MOON_ORBIT_DISTANCE }, // Position initiale calculée
                '#CCCCCC',                  // Couleur grise
                earth,                    // Parent = Terre
                MOON_ORBIT_DISTANCE,      // Distance orbitale
                moonInitialAngle,         // Angle initial
                MOON_ORBIT_SPEED          // Vitesse orbitale
            );
            moon.updateOrbit(0); // Calculer la position et la vélocité initiales
            this.universeModel.addCelestialBody(moon);

            // 4. Mercure (Orbite autour du Soleil)
            const MERCURY_ORBIT_DISTANCE = CELESTIAL_BODY.MERCURY.ORBIT_DISTANCE;
            const MERCURY_ORBIT_SPEED = CELESTIAL_BODY.MERCURY.ORBIT_SPEED;
            const mercuryInitialAngle = Math.random() * Math.PI * 2;
            const mercury = new CelestialBodyModel(
                'Mercure',
                CELESTIAL_BODY.MERCURY.MASS,
                CELESTIAL_BODY.MERCURY.RADIUS,
                { x: sun.position.x + Math.cos(mercuryInitialAngle) * MERCURY_ORBIT_DISTANCE, y: sun.position.y + Math.sin(mercuryInitialAngle) * MERCURY_ORBIT_DISTANCE },
                '#A9A9A9', // Couleur gris foncé
                sun,
                MERCURY_ORBIT_DISTANCE,
                mercuryInitialAngle,
                MERCURY_ORBIT_SPEED
            );
            mercury.updateOrbit(0);
            this.universeModel.addCelestialBody(mercury);

            // 5. Vénus (Orbite autour du Soleil)
            const VENUS_ORBIT_DISTANCE = CELESTIAL_BODY.VENUS.ORBIT_DISTANCE;
            const VENUS_ORBIT_SPEED = CELESTIAL_BODY.VENUS.ORBIT_SPEED;
            const venusInitialAngle = Math.random() * Math.PI * 2;
            const venus = new CelestialBodyModel(
                'Vénus',
                CELESTIAL_BODY.VENUS.MASS,
                CELESTIAL_BODY.VENUS.RADIUS,
                { x: sun.position.x + Math.cos(venusInitialAngle) * VENUS_ORBIT_DISTANCE, y: sun.position.y + Math.sin(venusInitialAngle) * VENUS_ORBIT_DISTANCE },
                '#FFDEAD', // Couleur Navajo White (jaunâtre)
                sun,
                VENUS_ORBIT_DISTANCE,
                venusInitialAngle,
                VENUS_ORBIT_SPEED
            );
            venus.updateOrbit(0);
            this.universeModel.addCelestialBody(venus);

            // 6. Mars (Orbite autour du Soleil)
            const MARS_ORBIT_DISTANCE = CELESTIAL_BODY.MARS.ORBIT_DISTANCE;
            const MARS_ORBIT_SPEED = CELESTIAL_BODY.MARS.ORBIT_SPEED;
            const marsInitialAngle = Math.random() * Math.PI * 2;
            const mars = new CelestialBodyModel(
                'Mars',
                CELESTIAL_BODY.MARS.MASS,
                CELESTIAL_BODY.MARS.RADIUS,
                { x: sun.position.x + Math.cos(marsInitialAngle) * MARS_ORBIT_DISTANCE, y: sun.position.y + Math.sin(marsInitialAngle) * MARS_ORBIT_DISTANCE },
                '#E57373', // Couleur rougeâtre
                sun,
                MARS_ORBIT_DISTANCE,
                marsInitialAngle,
                MARS_ORBIT_SPEED
            );
            mars.updateOrbit(0);
            this.universeModel.addCelestialBody(mars);

            // 7. Phobos (Orbite autour de Mars)
            const PHOBOS_ORBIT_DISTANCE = CELESTIAL_BODY.PHOBOS.ORBIT_DISTANCE;
            const PHOBOS_ORBIT_SPEED = CELESTIAL_BODY.PHOBOS.ORBIT_SPEED;
            const phobosInitialAngle = Math.random() * Math.PI * 2;
            const phobos = new CelestialBodyModel(
                'Phobos',
                CELESTIAL_BODY.PHOBOS.MASS,
                CELESTIAL_BODY.PHOBOS.RADIUS,
                { x: mars.position.x + Math.cos(phobosInitialAngle) * PHOBOS_ORBIT_DISTANCE, y: mars.position.y + Math.sin(phobosInitialAngle) * PHOBOS_ORBIT_DISTANCE },
                '#8B4513', // Couleur SaddleBrown (brunâtre)
                mars, // Parent = Mars
                PHOBOS_ORBIT_DISTANCE,
                phobosInitialAngle,
                PHOBOS_ORBIT_SPEED
            );
            phobos.updateOrbit(0);
            this.universeModel.addCelestialBody(phobos);

            // 8. Deimos (Orbite autour de Mars)
            const DEIMOS_ORBIT_DISTANCE = CELESTIAL_BODY.DEIMOS.ORBIT_DISTANCE;
            const DEIMOS_ORBIT_SPEED = CELESTIAL_BODY.DEIMOS.ORBIT_SPEED;
            const deimosInitialAngle = Math.random() * Math.PI * 2;
            const deimos = new CelestialBodyModel(
                'Deimos',
                CELESTIAL_BODY.DEIMOS.MASS,
                CELESTIAL_BODY.DEIMOS.RADIUS,
                { x: mars.position.x + Math.cos(deimosInitialAngle) * DEIMOS_ORBIT_DISTANCE, y: mars.position.y + Math.sin(deimosInitialAngle) * DEIMOS_ORBIT_DISTANCE },
                '#D2B48C', // Couleur Tan (beige)
                mars, // Parent = Mars
                DEIMOS_ORBIT_DISTANCE,
                deimosInitialAngle,
                DEIMOS_ORBIT_SPEED
            );
            deimos.updateOrbit(0);
            this.universeModel.addCelestialBody(deimos);

            // --- Fin Création des Corps Célestes ---
            
            // --- Création de la Fusée ---
            this.rocketModel = new RocketModel();

            // Positionner la fusée sur la surface initiale de la Terre
            const angleVersSoleil = Math.atan2(earth.position.y - sun.position.y, earth.position.x - sun.position.x);
            const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
            const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
            this.rocketModel.setPosition(rocketStartX, rocketStartY);

            // Donner à la fusée la vélocité initiale de la Terre
            this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
            
            // Orienter la fusée vers le haut (loin de la Terre, dans la direction opposée au Soleil comme approximation)
            this.rocketModel.setAngle(angleVersSoleil); 
            
            // --- Fin Création de la Fusée ---

            // Créer le système de particules
            this.particleSystemModel = new ParticleSystemModel();
            
            // Les émetteurs sont déjà créés dans le constructeur de ParticleSystemModel
            // Configurer la position et l'angle des émetteurs si nécessaire
            this.particleSystemModel.updateEmitterAngle('main', Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('rear', -Math.PI/2);
            this.particleSystemModel.updateEmitterAngle('left', 0);
            this.particleSystemModel.updateEmitterAngle('right', Math.PI);
            
        } catch (error) {
            console.error("Erreur lors de l'initialisation des modèles:", error);
        }
    }
    
    // Configurer les vues
    setupViews() {
        // Créer les vues
        this.rocketView = new RocketView();
        this.universeView = new UniverseView(this.canvas);
        this.celestialBodyView = new CelestialBodyView();
        this.particleView = new ParticleView();
        this.traceView = new TraceView();
        this.uiView = new UIView();
        
        // Initialiser le contrôleur de rendu avec les vues
        if (this.renderingController) {
            this.renderingController.initViews(
                this.rocketView,
                this.universeView,
                this.celestialBodyView,
                this.particleView,
                this.traceView,
                this.uiView
            );
        }
    }
    
    // Configurer la caméra
    setupCamera() {
        this.cameraModel.setTarget(this.rocketModel, 'rocket');
        this.cameraModel.offsetX = this.canvas.width / 2;
        this.cameraModel.offsetY = this.canvas.height / 2;
        this.cameraModel.width = this.canvas.width;
        this.cameraModel.height = this.canvas.height;
    }
    
    // Configurer les contrôleurs
    setupControllers() {
        this.physicsController = new PhysicsController(this.eventBus);
        
        this.particleController = new ParticleController(this.particleSystemModel);
        
        // Initialiser les événements
        this.eventBus.emit('CONTROLLERS_SETUP', {});
    }
    
    // Démarrer la boucle de jeu
    start() {
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    // Mettre le jeu en pause
    togglePause() {
        this.isPaused = !this.isPaused;
    }
    
    // La boucle de jeu principale
    gameLoop(timestamp) {
        if (!this.isRunning) return;

        const deltaTime = (timestamp - this.lastTimestamp) / 1000; // Convertir en secondes
        this.lastTimestamp = timestamp;

        // Si le jeu est en pause, ne rien faire d'autre que de demander la prochaine frame
        if (this.isPaused) {
            // Mettre à jour le rendu même en pause pour afficher le message "PAUSE"
            if (this.renderingController) {
                this.renderingController.render(this.ctx, this.canvas, this.rocketModel, this.universeModel, this.particleSystemModel, this.isPaused, this.cameraModel, [], this.totalCreditsEarned);
            }
            requestAnimationFrame(this.gameLoop.bind(this));
            return;
        }

        // Mettre à jour l'état des entrées (pour les keypress ponctuels)
        if (this.inputController) {
            this.inputController.update();
        }

        // Mettre à jour la caméra pour suivre sa cible
        if (this.cameraModel) {
            this.cameraModel.update(deltaTime);
        }

        // ---- AJOUT ----
        // Mettre à jour la position des émetteurs de particules AVANT de mettre à jour les particules
        if (this.particleController && this.rocketModel) {
            this.particleController.updateEmitterPositions(this.rocketModel);
        }
        // -------------

        // Mise à jour de la physique
        if (this.physicsController && this.rocketModel) {
            this.physicsController.update(deltaTime);
            // Émettre l'état mis à jour après la physique
            this.emitUpdatedStates(); 
        }

        // Mise à jour du système de particules
        if (this.particleController) {
            this.particleController.update(deltaTime);
        }

        // Mise à jour de l'agent IA (si actif)
        if (this.rocketAgent && this.rocketAgent.isActive) {
            this.rocketAgent.update(deltaTime);
        }

        // Mise à jour de la trace
        if (this.traceView && this.traceView.isVisible) {
            this.updateTrace();
        }

        // Vérification de l'état de la mission
        if (this.rocketModel && this.missionManager) {
            const activeMissions = this.missionManager.getActiveMissions();
            if (activeMissions.length > 0) {
                const currentMission = activeMissions[0]; // Supposons une seule mission active

                // Vérifier l'échec (crash)
                if (this.rocketModel.isDestroyed && currentMission.status === 'pending') {
                    this.eventBus.emit('MISSION_FAILED', { mission: currentMission });
                }
            }
        }


        // Rendu graphique
        if (this.renderingController) {
            // Récupérer les missions actives pour le rendu (si missionManager existe)
            const activeMissions = this.missionManager ? this.missionManager.getActiveMissions() : [];
            // Passer tous les arguments nécessaires à render
            this.renderingController.render(
                this.ctx,
                this.canvas,
                this.rocketModel,
                this.universeModel,
                this.particleSystemModel,
                this.isPaused,
                this.cameraModel,
                activeMissions, // Passer les missions actives récupérées
                this.totalCreditsEarned // Passer les crédits
            );
        }

        // Demander la prochaine frame d'animation
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    // Réinitialiser la fusée
    resetRocket() {
        // Déclarer startLocation au début de la fonction
        let startLocation = 'Terre';
        
        // Effacer le timer de réinitialisation auto si présent
        if (this.crashResetTimer) {
            clearTimeout(this.crashResetTimer);
            this.crashResetTimer = null;
        }
        
        // Nettoyer les traces existantes
        // this.clearAllTraces(); // Supprimé car fait à la fin

        // Créer les modèles si nécessaire (ou juste réinitialiser)
        if (!this.rocketModel) {
            this.setupModels();
        } else {
            // Réinitialiser l'état de base du modèle (fuel, health, vitesse, etc.)
            this.rocketModel.reset();
            // Réinitialiser le cargo (VIDE initialement)
            this.rocketModel.cargo = new RocketCargo(); 
            // Réinitialiser les crédits à 10
            this.totalCreditsEarned = 10;

            // --- Repositionner la fusée sur Terre ---            
            const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
            // startLocation est déjà 'Terre', on le met à null seulement si Earth n'est pas trouvée
            if (earth) {
                const angleVersSoleil = Math.atan2(earth.position.y - this.universeModel.celestialBodies[0].position.y, 
                                                 earth.position.x - this.universeModel.celestialBodies[0].position.x);
                const rocketStartX = earth.position.x + Math.cos(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                const rocketStartY = earth.position.y + Math.sin(angleVersSoleil) * (earth.radius + ROCKET.HEIGHT / 2 + 1);
                this.rocketModel.setPosition(rocketStartX, rocketStartY);
                // Donner la vélocité de la Terre et orienter
                this.rocketModel.setVelocity(earth.velocity.x, earth.velocity.y);
                this.rocketModel.setAngle(angleVersSoleil); 
                this.rocketModel.isLanded = true; // Définir comme posé après repositionnement
                this.rocketModel.landedOn = 'Terre';

                // --- Mettre à jour la caméra --- 
                if (this.cameraModel) {
                    this.cameraModel.setPosition(rocketStartX, rocketStartY);
                }
                // Supprimer l'update de la trace ici, car elle est faite à la fin
                // if (this.traceView) {
                //    this.traceView.update(this.rocketModel.position, false, null); 
                // }
                // -----------------------------------------

            } else {
                console.error("Impossible de trouver la Terre pour repositionner la fusée.");
                startLocation = null; // Mettre à null si Earth n'est pas trouvée
            }
            // -----------------------------------------

            // Réinitialiser le système de particules lié à la fusée
            if (this.particleSystemModel) {
                this.particleSystemModel.reset();
            }
        }

        // Réinitialiser le moteur physique (positions, vitesses, etc.)
        if (this.physicsController) {
            this.physicsController.resetPhysics(this.rocketModel, this.universeModel); // Appeler la méthode resetPhysics du PhysicsController
        }

        // Réinitialiser le temps et l'état de pause
        this.lastTimestamp = performance.now();
        this.elapsedTime = 0;
        this.isPaused = false;

        // --- Nettoyer la trace et ajouter le premier point --- 
        if (this.traceView) {
            this.clearAllTraces(); // Effacer les anciennes traces
            // Ajouter le premier point de trace APRÈS que la position de la fusée soit définie
            this.traceView.update(this.rocketModel.position);
            console.log(`%c[GameController] resetRocket: Trace effacée et premier point ajouté à (${this.rocketModel.position.x.toFixed(2)}, ${this.rocketModel.position.y.toFixed(2)})`, 'color: green;');
        }
        // --------------------------------------------------

        // Réinitialiser les missions
        if (this.missionManager) {
            this.missionManager.resetMissions();
        }
        
        // CHARGER LE CARGO POUR LA MISSION AU POINT DE DÉPART
        // Vérifier que startLocation n'est pas null (au cas où Earth n'a pas été trouvée)
        if(startLocation){
            this.loadCargoForCurrentLocationMission(startLocation);
        }

        // ---- AJOUT ----
        // Rétablir le suivi de la caméra sur la fusée
        if (this.cameraModel && this.rocketModel) {
            this.cameraModel.setTarget(this.rocketModel, 'rocket');
        }
        // -------------

        console.log("Fusée réinitialisée.");
        this._lastRocketDestroyed = false;
    }
    
    // Nettoyer les ressources
    cleanup() {
        this.isRunning = false;
        
        // Désabonner des événements
        if (this.eventBus) {
            // Les événements seront nettoyés par l'EventBus lui-même
        }
    }

    // Active ou désactive l'affichage des positions des propulseurs
    toggleThrusterPositions() {
        if (this.rocketView) {
            this.rocketView.setShowThrusterPositions(!this.rocketView.showThrusterPositions);
        }
    }

    // Ajuster le multiplicateur de poussée
    adjustThrustMultiplier(factor) {
        const currentMultiplier = PHYSICS.THRUST_MULTIPLIER;
        const newMultiplier = currentMultiplier * factor;
        
        // Limiter le multiplicateur à des valeurs raisonnables
        const minMultiplier = 0.1;
        const maxMultiplier = 1000;
        
        PHYSICS.THRUST_MULTIPLIER = Math.max(minMultiplier, Math.min(maxMultiplier, newMultiplier));
        
        console.log(`Multiplicateur de poussée: ${PHYSICS.THRUST_MULTIPLIER.toFixed(2)}x`);
        
        // Force une mise à jour de l'analyse des exigences de poussée
        if (this.physicsController) {
            this.physicsController._lastThrustCalculation = 0;
        }
    }

    // Activer/désactiver l'affichage de la trace
    toggleTraceVisibility() {
        if (this.traceView) {
            this.traceView.toggleVisibility();
            console.log(`Affichage de la trace: ${this.traceView.isVisible ? 'activé' : 'désactivé'}`);
        }
    }

    // Activer/désactiver tous les vecteurs (gravité, poussée et vitesse)
    toggleVectors() {
        if (this.rocketView) {
            // Définir une valeur commune pour tous les vecteurs (anciens + nouveaux)
            const newValue = !(
                this.rocketView.showVelocityVector ||
                this.rocketView.showLunarAttractionVector ||
                this.rocketView.showEarthAttractionVector ||
                this.rocketView.showTotalThrustVector ||
                this.rocketView.showThrustVector ||
                this.rocketView.showAccelerationVector ||
                this.rocketView.showMissionStartVector ||
                this.rocketView.showMissionTargetVector ||
                this.rocketView.showGravityVector // au cas où il reste utilisé
            );
            // Appliquer à tous les vecteurs
            this.rocketView.showVelocityVector = newValue;
            this.rocketView.showLunarAttractionVector = newValue;
            this.rocketView.showEarthAttractionVector = newValue;
            this.rocketView.showTotalThrustVector = newValue;
            this.rocketView.showThrustVector = newValue;
            this.rocketView.showAccelerationVector = newValue;
            this.rocketView.showMissionStartVector = newValue;
            this.rocketView.showMissionTargetVector = newValue;
            this.rocketView.showGravityVector = newValue; // pour compatibilité
            console.log(`Affichage des vecteurs: ${newValue ? 'activé' : 'désactivé'}`);
        }
        if (this.physicsController && this.physicsController.physicsVectors) {
            this.physicsController.physicsVectors.toggleForceVectors();
        }
    }

    // Gérer les mises à jour d'état de la fusée
    handleRocketStateUpdated(data) {
        if (data.isDestroyed && !this._lastRocketDestroyed) {
            console.log("Fusée détruite - Appuyez sur R pour réinitialiser");
        }
        this._lastRocketDestroyed = !!data.isDestroyed;
    }

    // Mettre à jour la trace de la fusée
    updateTrace() {
        if (!this.rocketModel || !this.traceView) return;
        
        // Vérifier si la fusée est attachée à la lune (détruite ou simplement posée)
        const isAttachedToMoon = (this.rocketModel.isDestroyed && (this.rocketModel.attachedTo === 'Lune' || this.rocketModel.landedOn === 'Lune')) || 
                                  (this.rocketModel.landedOn === 'Lune');
        
        // Si la fusée est attachée à la lune, on a besoin de la position de la lune
        let moonPosition = null;
        if (isAttachedToMoon) {
            // Trouver la lune dans l'univers
            const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
            if (moon) {
                moonPosition = moon.position;
            }
        }
        
        // Ajouter le point à la trace avec l'information d'attachement à la lune
        this.traceView.update(this.rocketModel.position, isAttachedToMoon, moonPosition);
    }

    // Basculer les contrôles assistés
    toggleAssistedControls() {
        if (this.physicsController && this.uiView) {
            // Basculer l'état des contrôles assistés dans le contrôleur physique
            const assistedEnabled = this.physicsController.toggleAssistedControls();
            
            // Synchroniser l'état avec la vue UI
            this.uiView.assistedControlsActive = assistedEnabled;
            
            console.log(`Contrôles assistés: ${assistedEnabled ? 'activés' : 'désactivés'}`);
        }
    }

    // Nettoyer toutes les traces
    clearAllTraces() {
        if (this.traceView) {
            this.traceView.clear(true); // true = effacer toutes les traces
        }
    }

    // Calculer le vecteur d'attraction vers la Lune
    calculateLunarAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Lune dans les corps célestes
        const moon = this.universeModel.celestialBodies.find(body => body.name === 'Lune');
        if (!moon) return null;
        
        // Calculer le vecteur d'attraction
        const dx = moon.position.x - this.rocketModel.position.x;
        const dy = moon.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Retourner le vecteur et la distance
        return { 
            vector: { x: dx / distance, y: dy / distance }, // Vecteur normalisé
            distance: distance // Distance à la Lune
        };
    }

    // Méthode pour activer/désactiver le contrôle par IA
    toggleAIControl() {
        if (!this.rocketAgent) return;
        
        // Émettre l'événement pour activer/désactiver l'agent
        this.eventBus.emit('TOGGLE_AI_CONTROL', {});
        console.log('Basculement du contrôle IA');
    }

    // Calculer la distance à la Terre
    calculateEarthDistance() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Terre dans les corps célestes
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        // Calculer la distance entre la fusée et la Terre
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Soustraire le rayon de la Terre pour obtenir la distance à la surface
        const surfaceDistance = Math.max(0, distance - earth.radius);
        
        return surfaceDistance;
    }

    // Calculer le vecteur d'attraction vers la Terre
    calculateEarthAttractionVector() {
        if (!this.rocketModel || !this.universeModel) return null;
        
        // Trouver la Terre dans les corps célestes
        const earth = this.universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;
        
        // Calculer le vecteur d'attraction
        const dx = earth.position.x - this.rocketModel.position.x;
        const dy = earth.position.y - this.rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);
        
        // Retourner le vecteur normalisé qui pointe vers la Terre
        return { x: dx / distance, y: dy / distance };
    }

    // Gérer l'atterrissage de la fusée
    handleRocketLanded(data) {
        // VÉRIFICATION IMPORTANTE : Ne traiter que si la fusée est ACTUELLEMENT considérée comme posée.
        // Cela empêche le traitement multiple si l'événement est déclenché par erreur après une fausse détection de décollage.
        if (!this.rocketModel || !this.rocketModel.isLanded) { 
            console.log(`%c[GameController] Événement ROCKET_LANDED ignoré pour ${data.landedOn} car rocketModel.isLanded est false.`, 'color: orange;');
            return; 
        }

        console.log(`%c[GameController] Événement ROCKET_LANDED reçu pour: ${data.landedOn} (isLanded=${this.rocketModel.isLanded})`, 'color: #ADD8E6');
        
        // ----- Logique de mission et cargo exécutée IMMÉDIATEMENT -----
        // Re-vérifier rocketModel juste avant d'agir (sécurité)
        if (!this.rocketModel) return;

        // Vérifier et gérer la complétion de mission
        if (this.missionManager && this.rocketModel.cargo) {
            const completedMissions = this.missionManager.checkMissionCompletion(this.rocketModel.cargo, data.landedOn);
            
            // Traiter les conséquences du succès ICI
            if (completedMissions.length > 0) {
                console.log(`%c[GameController] ${completedMissions.length} mission(s) complétée(s) !`, 'color: lightgreen;');
                completedMissions.forEach(mission => {
                    // Ajouter les récompenses au total
                    this.totalCreditsEarned += mission.reward;
                    console.log(`%c[GameController] +${mission.reward} crédits gagnés ! Total: ${this.totalCreditsEarned}`, 'color: gold;');
                    // Log déchargement du cargo
                    console.log(`%c[GameController] Cargo déchargé pour la mission ${mission.id}`, 'color: orange;');
                    // Émettre les événements de succès (si nécessaire pour l'UI ou autre)
                    this.eventBus.emit('UI_UPDATE_CREDITS', { reward: mission.reward }); 
                    this.eventBus.emit('MISSION_COMPLETED', { mission: mission }); // Passer la mission complétée
                });
            }
            // FIN MODIFICATION
            
            // TENTER DE CHARGER LE CARGO POUR LA PROCHAINE MISSION
            // S'assurer que rocketModel existe toujours
            if (this.rocketModel) { 
               this.loadCargoForCurrentLocationMission(data.landedOn);
            }
        }
        // -------------------------------------------------
    }

    /**
     * Charge le cargo nécessaire pour la première mission active partant de la localisation donnée.
     * @param {string} location - Le nom de la planète/lune où se trouve la fusée.
     */
    loadCargoForCurrentLocationMission(location) {
        if (!this.missionManager || !this.rocketModel) return;

        const activeMissions = this.missionManager.getActiveMissions();
        const nextMission = activeMissions.find(m => m.from === location);

        if (nextMission) {
            console.log(`%c[GameController] Détection de la mission suivante au départ de ${location}. Tentative de chargement du cargo requis.`, 'color: magenta;');
            
            // Vider le cargo actuel avant de charger celui de la mission
            this.rocketModel.cargo = new RocketCargo(); 
            let allLoaded = true;

            nextMission.requiredCargo.forEach(item => {
                const loaded = this.rocketModel.cargo.addCargo(item.type, item.quantity);
                if (!loaded) {
                    allLoaded = false;
                    console.warn(`[GameController] Échec du chargement de ${item.quantity} x ${item.type} pour la mission ${nextMission.id}. Capacité dépassée ?`);
                }
            });

            if (allLoaded) {
                const cargoString = nextMission.requiredCargo.map(item => `${item.type} x${item.quantity}`).join(', ');
                console.log(`%c[GameController] Cargo chargé pour la mission ${nextMission.id}: ${cargoString}`, 'color: lightblue;');
            }
             // Mettre à jour l'affichage UI du cargo immédiatement
            if (this.uiView) {
                this.uiView.updateCargoDisplay(this.rocketModel.cargo.getCargoList());
            }
        } else {
            console.log(`%c[GameController] Aucune mission active au départ de ${location} trouvée. Pas de chargement automatique de cargo.`, 'color: gray;');
        }
    }

    // --- Gestionnaires d'événements Joystick ---

    handleJoystickAxisChanged(data) {
        // Cet événement n'est déclenché qu'une fois lorsque l'axe change d'état (0 -> valeur ou valeur -> 0)
        if (!this.rocketModel || this.isPaused) return;

        const axisThreshold = this.inputController ? this.inputController.axisThreshold : 0.1;

        switch (data.action) {
            case 'rotate': // Mappé à l'axe horizontal (0) dans InputController
                 // La logique de rotation est bonne ici, car elle doit réagir au changement
                 // et s'arrêter quand l'axe revient à 0.
                const rotateValue = data.value;
                const power = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.RIGHT; // Utilise la puissance DROITE
                console.log(`%c[GC Joystick Rotate - CHANGED] Axe 0: ${rotateValue.toFixed(2)}`, 'color: purple');
                if (rotateValue < 0) { 
                    this.rocketModel.setThrusterPower('right', power); 
                    this.rocketModel.setThrusterPower('left', 0);
                    this.particleSystemModel.setEmitterActive('right', power > 0.1);
                    this.particleSystemModel.setEmitterActive('left', false);
                } else if (rotateValue > 0) { 
                    const powerLeft = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.LEFT; // Utilise la puissance GAUCHE
                    this.rocketModel.setThrusterPower('left', powerLeft); 
                    this.rocketModel.setThrusterPower('right', 0);
                    this.particleSystemModel.setEmitterActive('left', powerLeft > 0.1);
                    this.particleSystemModel.setEmitterActive('right', false);
                } else { 
                    this.rocketModel.setThrusterPower('left', 0);
                    this.rocketModel.setThrusterPower('right', 0);
                    this.particleSystemModel.setEmitterActive('left', false);
                    this.particleSystemModel.setEmitterActive('right', false);
                }
                break;

            // RETRAIT de la logique de zoom ici, elle est gérée par AXIS_HELD
            /*
            case 'zoomAxis': 
                // ... ancienne logique ...
                break;
            */
        }
        // Pas besoin d'emitUpdatedStates ici car AXIS_HELD le fera si nécessaire
        // this.emitUpdatedStates(); 
    }
    
    // NOUVELLE MÉTHODE : Gère les axes maintenus
    handleJoystickAxisHeld(data) {
         if (!this.cameraModel || this.isPaused) return;
         
         switch(data.action) {
             case 'zoomAxis': // Mappé à l'axe 3
                 const zoomValue = data.value; // Valeur ajustée (-1 à 1)
                 const zoomSpeedFactor = Math.abs(zoomValue) * RENDER.ZOOM_SPEED * 1.5; // Ajuster le *1.5 si besoin
                 
                 if (zoomValue < 0) { // Zoom In
                      // console.log(`%c[GC Joystick Zoom - HELD] Axe 3: ${zoomValue.toFixed(2)} -> Zoom In`, 'color: cyan'); // Spam
                      this.cameraModel.setZoom(this.cameraModel.zoom * (1 + zoomSpeedFactor * (60/1000))); // Appliquer proportionnellement au framerate (approx)
                 } else if (zoomValue > 0) { // Zoom Out
                     // console.log(`%c[GC Joystick Zoom - HELD] Axe 3: ${zoomValue.toFixed(2)} -> Zoom Out`, 'color: cyan'); // Spam
                     this.cameraModel.setZoom(this.cameraModel.zoom / (1 + zoomSpeedFactor * (60/1000))); // Appliquer proportionnellement au framerate (approx)
                 }
                 // Mettre à jour l'état ici car le zoom a changé
                 this.emitUpdatedStates(); 
                 break;
            // Gérer d'autres axes maintenus si nécessaire (ex: poussée analogique)
            /*
             case 'thrustAxis': // Si on avait un axe pour la poussée principale
                  const thrustPower = Math.abs(data.value) * ROCKET.THRUSTER_POWER.MAIN;
                  this.rocketModel.setThrusterPower('main', thrustPower);
                  this.particleSystemModel.setEmitterActive('main', thrustPower > 0.1);
                  this.emitUpdatedStates();
                  break;
            */
         }
    }
    
    // NOUVELLE MÉTHODE : Gère le relâchement d'un axe (optionnel)
    handleJoystickAxisReleased(data) {
        // Utile si on doit arrêter une action spécifique au relâchement
        // console.log(`%c[GC Joystick Axis Released] Action: ${data.action}, Axe: ${data.axis}`, 'color: brown;');
        switch(data.action) {
            case 'rotate': // Quand on relâche l'axe de rotation
                 // Normalement géré par AXIS_CHANGED avec valeur 0, mais sécurité supplémentaire
                 // this.rocketModel.setThrusterPower('left', 0);
                 // this.rocketModel.setThrusterPower('right', 0);
                 // this.particleSystemModel.setEmitterActive('left', false);
                 // this.particleSystemModel.setEmitterActive('right', false);
                 break;
             // Pas besoin de gérer 'zoomAxis' ici, s'arrête naturellement
        }
    }

    handleJoystickButtonDown(data) {
        if (!this.rocketModel || this.isPaused) return;

        switch (data.action) {
            case 'boost': 
            case 'thrustMain': 
                 this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
                 this.particleSystemModel.setEmitterActive('main', true);
                break;
            case 'thrustBackward': 
                this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
                this.particleSystemModel.setEmitterActive('rear', true);
                break;
            case 'zoomInButton':
                console.log('%c[GC Joystick Zoom] Bouton 7 -> Zoom In', 'color: cyan');
                this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
                break;
            case 'zoomOutButton':
                console.log('%c[GC Joystick Zoom] Bouton 6 -> Zoom Out', 'color: cyan');
                this.cameraModel.setZoom(this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED));
                break;
            case 'resetRocket': 
                 console.log('%c[GC Joystick Action] Bouton 10 -> Reset Rocket', 'color: red');
                 this.resetRocket();
                 break;
             case 'centerCamera': 
                 if (this.cameraModel && this.rocketModel) {
                     this.cameraModel.setTarget(this.rocketModel, 'rocket');
                 }
                 break;
             case 'pauseGame': 
                 this.togglePause();
                 break;
             // AJOUT : Gestion du bouton pour les vecteurs
             case 'toggleVectors':
                 console.log('%c[GC Joystick Action] Bouton 12 -> Toggle Vectors', 'color: orange');
                 this.toggleVectors(); // Appel de la méthode existante
                 break;
        }
        this.emitUpdatedStates();
    }

    handleJoystickButtonUp(data) {
        if (!this.rocketModel) return; 

        switch (data.action) {
            case 'boost':
            case 'thrustMain':
                 // Correction: Vérifier la source d'input pour éviter conflit si axe ET bouton contrôlent 'main'
                 // Si seul le bouton contrôle 'main', on coupe toujours.
                 // Si un axe analogique (ex: gachette) contrôle aussi 'main', il faudrait une logique plus fine.
                 // Pour l'instant, on suppose que seul le bouton contrôle.
                 this.rocketModel.setThrusterPower('main', 0);
                 this.particleSystemModel.setEmitterActive('main', false);
                // Gérer l'arrêt du son si nécessaire (similaire à handleKeyUp)
                break;
             // AJOUT : Gérer le relâchement du bouton pour le propulseur arrière
             case 'thrustBackward':
                 this.rocketModel.setThrusterPower('rear', 0);
                 this.particleSystemModel.setEmitterActive('rear', false);
                 break;
        }
        this.emitUpdatedStates();
    }

    // --- Fin Gestionnaires Joystick ---

    toggleGravityField() {
        if (this.universeView && typeof this.universeView.toggleGravityField === 'function') {
            this.universeView.toggleGravityField();
        }
    }
} 