/**
 * @file TrainingVisualizer.js
 * Contrôleur pour la visualisation simplifiée pendant l'entraînement IA.
 * Affiche uniquement les planètes et les trajectoires de la fusée.
 */

class TrainingVisualizer {
    constructor(canvas, eventBus) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.eventBus = eventBus;
        
        // État de la visualisation
        this.isActive = false;
        this.rocketTrajectory = [];
        this.allTrajectories = []; // Conserver toutes les trajectoires des épisodes
        this.maxTrajectoryPoints = 5000; // Points max par trajectoire
        this.trajectoryStepCounter = 0; // Compteur de steps pour l'échantillonnage
        this.trajectorySampleRate = 1; // Enregistrer 1 point tous les N steps (ajusté dynamiquement)
        this.maxTrajectoriesCount = 10; // au-delà, alpha est déjà plafonné à 0,2 : ces traces coûtent sans rien montrer
        this.cameraInitialized = false; // Flag pour savoir si la caméra a déjà été initialisée

        // CORRECTION (objectif 'navigate' invisible) : objectif du run courant, mis à jour depuis
        // AI.TRAINING_STARTED. En 'navigate' l'univers est VIDE : il ne faut surtout pas injecter
        // la Terre/Lune par défaut (rayon 6,4e6) qui cadrait la caméra ~370× trop loin.
        this.currentObjective = 'navigate';
        // Passe à true dès que la caméra a été cadrée sur les VRAIS points A/B du run.
        this.navPointsFramed = false;

        // Données de l'environnement
        this.rocketData = null;
        this.celestialBodies = [];
        this.lastDataReceived = null; // Timestamp de la dernière donnée reçue
        
        // Points de navigation pour l'objectif 'navigate'
        this.targetPoint = null; // Point B (destination)
        this.startPoint = null; // Point A (départ)
        
        // Configuration de la caméra simplifiée
        this.camera = {
            x: 0,
            y: 0,
            zoom: 0.0027, // CORRECTION: Zoom par défaut pour navigate (2.7e-3), sera ajusté selon le mode
            targetZoom: 0.0027,
            followRocket: true, // CORRECTION: Suivre la fusée par défaut
            minZoom: 0.0000001, // Zoom minimum pour voir un système très large
            maxZoom: 0.1,       // Zoom maximum pour voir la fusée de près
            zoomSpeed: 0.15,     // Vitesse d'interpolation du zoom (augmentée pour réactivité)
            manualZoomControl: false // CORRECTION: Flag pour indiquer que l'utilisateur contrôle le zoom manuellement
        };
        
        // Configuration visuelle
        this.colors = {
            background: '#0a0a0a',
            trajectory: '#4a90e2',
            trajectoryOld: '#2a5082', // Couleur pour les anciennes trajectoires
            rocket: '#ff6b6b',
            earth: '#1E88E5',
            moon: '#CCCCCC',
            stars: '#FFFFFF'
        };
        
        // Étoiles de fond (statiques)
        this.stars = this.generateStars(200);
        
        // S'abonner aux événements
        this.subscribeToEvents();
    }
    
    /**
     * S'abonner aux événements pertinents
     */
    subscribeToEvents() {
        // CORRECTION: Track tous les abonnements pour éviter les fuites mémoire
        // Écouter les mises à jour de l'environnement d'entraînement
        const unsubscribe1 = this.eventBus.subscribe(window.EVENTS.AI.TRAINING_STEP, (data) => {
            if (this.isActive && data) {
                this.updateVisualization(data);
            }
        });
        
        // Écouter les événements de début/fin d'épisode
        const unsubscribe2 = this.eventBus.subscribe(window.EVENTS.AI.EPISODE_STARTED, (data) => {
            this.onEpisodeStarted(data);
        });
        
        const unsubscribe3 = this.eventBus.subscribe(window.EVENTS.AI.EPISODE_ENDED, (data) => {
            this.onEpisodeEnded(data);
        });

        // CORRECTION : connaître l'objectif du run permet de ne PAS injecter les corps célestes
        // par défaut en 'navigate', et de re-cadrer la caméra sur les nouveaux points A/B.
        const unsubscribe4 = this.eventBus.subscribe(window.EVENTS.AI.TRAINING_STARTED, (data) => {
            this.onTrainingStarted(data);
        });


        // CORRECTION (fuite) : conserver les unsubscribe localement pour que destroy() puisse
        // réellement se désabonner. Sans cela, un EPISODE_STARTED reçu après destroy() levait une
        // exception (canvas/ctx mis à null) et le visualiseur détruit restait référencé par le bus.
        this._unsubs = [unsubscribe1, unsubscribe2, unsubscribe3, unsubscribe4];

        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(unsubscribe1);
            window.controllerContainer.track(unsubscribe2);
            window.controllerContainer.track(unsubscribe3);
            window.controllerContainer.track(unsubscribe4);
        }
    }

    /**
     * Début d'une session d'entraînement : mémoriser l'objectif et repartir d'un cadrage neuf.
     */
    onTrainingStarted(data) {
        const objectives = data && data.config && data.config.objectives;
        if (objectives && objectives.length > 0) {
            this.currentObjective = objectives[0];
        }

        // Les points A/B et les corps célestes du run précédent ne sont plus valides : on les
        // oublie pour que la caméra se recadre sur ceux du nouveau run dès leur arrivée.
        this.startPoint = null;
        this.targetPoint = null;
        this.navPointsFramed = false;
        this.allTrajectories = []; // les traces du run précédent ne sont plus pertinentes
        if (this.isNavigateMode()) {
            this.celestialBodies = [];
        }
    }

    /**
     * L'objectif courant est-il une navigation point à point (univers vide) ?
     * Vrai aussi dès que des points A/B ont été reçus (détection robuste côté données).
     */
    isNavigateMode() {
        return this.currentObjective === 'navigate' || !!(this.startPoint || this.targetPoint);
    }


    /**
     * Gérer le début d'un nouvel épisode
     */
    onEpisodeStarted(data) {
        // Sauvegarder la trajectoire actuelle si elle existe
        if (this.rocketTrajectory.length > 0) {
            // Décimation à l'archivage : une trace fantôme n'a pas besoin de la résolution
            // complète (jusqu'à 5000 points), et renderTrajectory() les retrace TOUTES à chaque
            // frame, sur le thread qui exécute aussi model.fit().
            const pasArchivage = Math.max(1, Math.ceil(this.rocketTrajectory.length / 300));
            this.allTrajectories.push(this.rocketTrajectory.filter((_, i) => i % pasArchivage === 0));
            
            // Limiter le nombre de trajectoires conservées
            if (this.allTrajectories.length > this.maxTrajectoriesCount) {
                this.allTrajectories.shift();
            }
        }
        
        // Commencer une nouvelle trajectoire
        this.rocketTrajectory = [];
        this.trajectoryStepCounter = 0;
        this.trajectorySampleRate = 1;

        // Mettre à jour les corps célestes si fournis
        if (data && data.celestialBodies && data.celestialBodies.length > 0) {
            this.celestialBodies = data.celestialBodies;
            if (!this.camera.followRocket) {
                // Préserver le zoom si la caméra a déjà été initialisée
                this.initializeCamera(this.cameraInitialized);
            }
        } else if (this.celestialBodies.length === 0 && !this.isNavigateMode()) {
            // CORRECTION : en 'navigate' l'univers est VIDE par construction — injecter la
            // Terre/Lune factices y créait des planètes fantômes et un cadrage aberrant.
            this.initializeDefaultCelestialBodies();
        }
    }
    
    /**
     * Gérer la fin d'un épisode
     */
    onEpisodeEnded(data) {
        // La trajectoire sera sauvegardée au début du prochain épisode
    }
    
    /**
     * Activer/désactiver la visualisation
     */
    setActive(active) {
        this.isActive = active;
        if (active) {
            // Initialiser les corps célestes par défaut si aucun n'est présent.
            // CORRECTION : jamais en mode 'navigate' (univers vide) — la Terre/Lune factices
            // (rayon 6,4e6) cadraient la caméra à un zoom ~2,35e-6 et verrouillaient
            // cameraInitialized, si bien que le couloir réel A→B (127 279 unités) était rendu
            // sur ~0,3 px et que les repères A/B restaient invisibles.
            if (this.celestialBodies.length === 0 && !this.isNavigateMode()) {
                this.initializeDefaultCelestialBodies();
            }
            this.startRenderLoop();
            // Rendu initial pour montrer que le canvas fonctionne
            this.render();
        } else {
            this.stopRenderLoop();
        }
    }
    
    /**
     * Initialiser les corps célestes par défaut (Terre et Lune)
     */
    initializeDefaultCelestialBodies() {
        this.celestialBodies = [
            {
                name: 'Terre',
                position: { x: 0, y: 6471000 },
                radius: 6371000,
                mass: 5.972e24,
                color: '#1E88E5'
            },
            {
                name: 'Lune',
                position: { x: 384400000, y: 6471000 },
                radius: 1737000,
                mass: 7.342e22,
                color: '#CCCCCC'
            }
        ];
        
        // Initialiser la caméra avec ces corps célestes
        this.initializeCamera();
    }
    
    /**
     * Mettre à jour les données de visualisation
     */
    updateVisualization(data) {
        if (!data) return;
        
        // Marquer la réception de données
        this.lastDataReceived = Date.now();
        
        // Mettre à jour les données de la fusée
        if (data.rocket) {
            this.rocketData = data.rocket;
            
            // Ajouter le point à la trajectoire (échantillonné)
            if (this.rocketData.position) {
                this.trajectoryStepCounter++;
                if (this.trajectoryStepCounter >= this.trajectorySampleRate) {
                    this.trajectoryStepCounter = 0;
                    this.rocketTrajectory.push({
                        x: this.rocketData.position.x,
                        y: this.rocketData.position.y
                    });

                    // Si on dépasse la limite, doubler le taux d'échantillonnage
                    // et réduire les points existants de moitié (garder 1 sur 2)
                    if (this.rocketTrajectory.length > this.maxTrajectoryPoints) {
                        this.trajectorySampleRate *= 2;
                        this.rocketTrajectory = this.rocketTrajectory.filter((_, i) => i % 2 === 0);
                    }
                }
            }
        }
        
        // Mettre à jour les corps célestes
        if (data.celestialBodies && data.celestialBodies.length > 0) {
            const hadBodies = this.celestialBodies.length > 0;
            this.celestialBodies = data.celestialBodies;
            
            // Initialiser la caméra si c'est la première fois qu'on reçoit des corps célestes
            if (!hadBodies && this.celestialBodies.length > 0) {
                this.initializeCamera(this.cameraInitialized);
            }
        }
        
        // CORRECTION: Récupérer les points de navigation pour l'objectif 'navigate'
        let pointsChanged = false;
        if (data.targetPoint) {
            this.targetPoint = data.targetPoint; // Point B (destination)
            pointsChanged = true;
        }
        if (data.startPoint) {
            this.startPoint = data.startPoint; // Point A (départ)
            pointsChanged = true;
        }
        
        // Cadrer la caméra sur les VRAIS points de navigation dès leur première arrivée.
        // CORRECTION : le garde était `!this.cameraInitialized`, un drapeau jamais remis à false
        // et déjà positionné par le cadrage par défaut (Terre factice) -> le recadrage sur A/B
        // n'avait jamais lieu et calculateNavigateZoom() (≈ 2,1e-3) ne servait à rien. On utilise
        // désormais un drapeau propre aux points de navigation, réarmé à chaque nouveau run.
        if (pointsChanged && this.startPoint && this.targetPoint && !this.navPointsFramed) {
            this.navPointsFramed = true;
            this.initializeCamera(false);
        }
        
        // Mettre à jour la caméra seulement si on suit la fusée
        if (this.rocketData && this.rocketData.position && this.camera.followRocket) {
            this.updateCamera();
        }
        
        // CORRECTION: Vue absolue - ne pas centrer sur la Terre
        // Si on ne suit pas la fusée, maintenir la vue absolue (pas de mouvement automatique)
        // L'interpolation du zoom a été déplacée dans render() (cf. commentaire là-bas).
    }
    
    /**
     * Mettre à jour la position de la caméra pour suivre la fusée (vue absolue)
     */
    updateCamera() {
        if (!this.rocketData || !this.rocketData.position) return;
        
        // CORRECTION: Vue absolue - suivre la fusée sans référence à la Terre
        const targetX = this.rocketData.position.x;
        const targetY = this.rocketData.position.y;
        
        // CORRECTION: Interpolation plus rapide pour suivre la fusée immédiatement
        // Utiliser une interpolation plus rapide (0.3 au lieu de 0.1) pour un suivi plus réactif
        this.camera.x += (targetX - this.camera.x) * 0.3;
        this.camera.y += (targetY - this.camera.y) * 0.3;
        
        // CORRECTION: Zoom fixe - ne pas ajuster automatiquement le zoom
        // L'utilisateur contrôle le zoom manuellement, il reste fixe
        
        // CORRECTION: Zoom fixe - ne pas interpoler le zoom automatiquement
        // Le zoom reste à sa valeur initiale sauf si l'utilisateur le modifie manuellement
        // L'interpolation du zoom a été déplacée dans render() (cf. commentaire là-bas).
    }

    /**
     * Zoom avant (grossir)
     */
    zoomIn(factor = 1.5) {
        // CORRECTION: Activer le contrôle manuel du zoom pour empêcher l'ajustement automatique
        this.camera.manualZoomControl = true;
        const newZoom = Math.min(this.camera.maxZoom, this.camera.targetZoom * factor);
        this.camera.targetZoom = newZoom;
        if (this.isActive) {
            this.render();
        }
    }
    
    /**
     * Zoom arrière (dézoomer)
     */
    zoomOut(factor = 1.5) {
        // CORRECTION: Activer le contrôle manuel du zoom pour empêcher l'ajustement automatique
        this.camera.manualZoomControl = true;
        const newZoom = Math.max(this.camera.minZoom, this.camera.targetZoom / factor);
        this.camera.targetZoom = newZoom;
        if (this.isActive) {
            this.render();
        }
    }
    
    /**
     * Définir le mode de suivi de la fusée
     */
    setFollowRocket(follow) {
        if (!follow) {
            this.initializeCamera();
        }
        // CORRECTION: initializeCamera() force followRocket = true en fin d'exécution ; il faut
        // donc (ré)appliquer l'argument APRÈS, sinon setFollowRocket(false) réactivait le suivi.
        this.camera.followRocket = follow;
    }
    
    /**
     * Réinitialiser la vue à la position par défaut
     */
    resetView() {
        this.camera.manualZoomControl = false;
        this.camera.followRocket = false;

        // Centrer entre A et B si disponibles
        if (this.startPoint && this.targetPoint &&
            isFinite(this.startPoint.x) && isFinite(this.targetPoint.x)) {
            this.camera.x = (this.startPoint.x + this.targetPoint.x) / 2;
            this.camera.y = (this.startPoint.y + this.targetPoint.y) / 2;
            const z = this.calculateNavigateZoom();
            this.camera.zoom = z;
            this.camera.targetZoom = z;
        } else {
            this.initializeCamera();
            this.camera.followRocket = false;
        }

        if (this.isActive) {
            this.render();
        }
    }

    /**
     * Bascule entre la vue du vaisseau (suivi de la fusée) et la vue absolue (centrée entre A et B).
     * @returns {boolean} true si on suit désormais le vaisseau, false si on est en vue absolue.
     */
    toggleView() {
        if (this.camera.followRocket) {
            // Suivi actif -> passer en vue absolue (centrée A↔B)
            this.resetView();
        } else {
            // Vue absolue -> repasser en suivi du vaisseau
            this.camera.followRocket = true;
            this.camera.manualZoomControl = false;
            this.initializeCamera(false);
            if (this.isActive) {
                this.render();
            }
        }
        return this.camera.followRocket;
    }

    /**
     * Générer des étoiles de fond
     */
    generateStars(count) {
        // CORRECTION : les étoiles étaient tirées sur ±2,5e8 unités alors que le monde
        // d'entraînement fait ~1,4e5 unités : AUCUNE n'était jamais dans le champ. On les stocke
        // désormais en coordonnées NORMALISÉES ([-0,5 ; 0,5]) et renderStars() les projette sur
        // l'étendue réelle de la scène (A↔B, ou la vue courante).
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                nx: Math.random() - 0.5,
                ny: Math.random() - 0.5,
                brightness: Math.random() * 0.8 + 0.2
            });
        }
        return stars;
    }
    
    /**
     * Effacer la trajectoire actuelle
     */
    clearTrajectory() {
        this.rocketTrajectory = [];
        this.allTrajectories = [];
    }
    
    /**
     * Calcule le zoom idéal pour voir les deux points de navigation avec marge
     */
    calculateNavigateZoom() {
        if (!this.startPoint || !this.targetPoint) return 0.00711;
        const canvasW = this.canvas.width || 800;
        const canvasH = this.canvas.height || 600;
        const dx = Math.abs(this.targetPoint.x - this.startPoint.x);
        const dy = Math.abs(this.targetPoint.y - this.startPoint.y);
        const worldSpan = Math.max(dx, dy, 1) * 1.5; // 50% de marge
        const zoom = Math.min(canvasW, canvasH) / worldSpan;
        return Math.max(this.camera.minZoom || 0.0001, Math.min(this.camera.maxZoom || 10, zoom));
    }

    /**
     * Initialiser la caméra pour une vue absolue
     * @param {boolean} preserveZoom - Si true, préserve le zoom actuel au lieu de le réinitialiser
     */
    initializeCamera(preserveZoom = false) {
        const canvasSize = Math.min(this.canvas.width || 400, this.canvas.height || 400);
        const hasNavPoints = this.startPoint && this.targetPoint &&
            isFinite(this.startPoint.x) && isFinite(this.startPoint.y) &&
            isFinite(this.targetPoint.x) && isFinite(this.targetPoint.y);

        if (this.camera.followRocket && this.rocketData && this.rocketData.position &&
            isFinite(this.rocketData.position.x) && isFinite(this.rocketData.position.y)) {
            this.camera.x = this.rocketData.position.x;
            this.camera.y = this.rocketData.position.y;
            if (!preserveZoom) {
                const z = hasNavPoints ? this.calculateNavigateZoom() : 0.00711;
                this.camera.zoom = z;
                this.camera.targetZoom = z;
            }
        } else if (hasNavPoints) {
            // Vue absolue centrée entre A et B
            this.camera.x = (this.startPoint.x + this.targetPoint.x) / 2;
            this.camera.y = (this.startPoint.y + this.targetPoint.y) / 2;
            if (!preserveZoom) {
                const z = this.calculateNavigateZoom();
                this.camera.zoom = z;
                this.camera.targetZoom = z;
            }
        } else if (this.celestialBodies.length === 0) {
            this.camera.x = 0;
            this.camera.y = 0;
            if (!preserveZoom) {
                this.camera.zoom = 0.00711;
                this.camera.targetZoom = 0.00711;
            }
        } else {
            const firstBody = this.celestialBodies[0];
            if (firstBody && firstBody.position &&
                isFinite(firstBody.position.x) && isFinite(firstBody.position.y)) {
                this.camera.x = firstBody.position.x;
                this.camera.y = firstBody.position.y;
                if (!preserveZoom) {
                    const bodyRadius = firstBody.radius || 6371000;
                    const viewRadius = bodyRadius * 8;
                    if (canvasSize > 0 && viewRadius > 0) {
                        this.camera.zoom = (canvasSize * 0.6) / (viewRadius * 2);
                        this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom));
                    }
                    if (!isFinite(this.camera.zoom)) this.camera.zoom = 0.00711;
                    this.camera.targetZoom = this.camera.zoom;
                }
            } else {
                this.camera.x = 0;
                this.camera.y = 0;
                if (!preserveZoom) {
                    this.camera.zoom = 0.00711;
                    this.camera.targetZoom = 0.00711;
                }
            }
        }

        // Protection finale contre NaN
        if (!isFinite(this.camera.x)) this.camera.x = 0;
        if (!isFinite(this.camera.y)) this.camera.y = 0;
        if (!isFinite(this.camera.zoom)) this.camera.zoom = 0.00711;
        if (!isFinite(this.camera.targetZoom)) this.camera.targetZoom = this.camera.zoom;

        this.camera.followRocket = true;
        this.cameraInitialized = true;
    }
    
    /**
     * Démarrer la boucle de rendu
     */
    startRenderLoop() {
        if (this.renderLoopId) return;

        let frame = 0;
        const render = () => {
            if (this.isActive) {
                // Saute des frames quand la vitesse visuelle est élevée (curseur ⏩) : le rendu de la
                // trajectoire est coûteux et monopolise le thread principal (il s'exécute entre chaque
                // model.fit). En n'affichant qu'1 frame sur N, on libère le thread pour la boucle
                // d'entraînement -> la simulation avance réellement plus vite (avance rapide).
                const skip = Math.max(1, this.renderEveryNFrames || 1);
                if (frame % skip === 0) {
                    this.render();
                }
                frame++;
                this.renderLoopId = requestAnimationFrame(render);
            }
        };

        this.renderLoopId = requestAnimationFrame(render);
    }
    
    /**
     * Arrêter la boucle de rendu
     */
    stopRenderLoop() {
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
            this.renderLoopId = null;
        }
    }
    
    /**
     * Rendu principal
     */
    render() {
        if (!this.ctx) return;
        
        // Effacer le canvas
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Sauvegarder le contexte
        this.ctx.save();

        // Interpolation du zoom : elle doit vivre dans la boucle de RENDU (rAF), qui tourne dès que
        // le visualiseur est actif. Placée dans updateVisualization(), elle n'avançait qu'à la
        // réception d'un AI.TRAINING_STEP : ➕/➖ n'avaient aucun effet avant le 1er run, en pause,
        // ou après la fin d'un entraînement.
        if (this.camera.manualZoomControl && isFinite(this.camera.targetZoom)) {
            const zoomSpeed = this.camera.zoomSpeed || 0.15;
            this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * zoomSpeed;
        }

        // Appliquer la transformation de la caméra
        this.applyCamera();
        
        // Dessiner les étoiles
        this.renderStars();
        
        // Dessiner les corps célestes
        this.renderCelestialBodies();
        
        // Dessiner les points de navigation (A et B) pour l'objectif 'navigate'
        this.renderNavigationPoints();

        // Dessiner la trajectoire
        this.renderTrajectory();

        // Dessiner la fusée
        this.renderRocket();
        
        // Restaurer le contexte
        this.ctx.restore();
        
        // Dessiner les informations de debug
        this.renderDebugInfo();
    }
    
    /**
     * Appliquer la transformation de la caméra
     */
    applyCamera() {
        // CORRECTION: Protection contre NaN dans la transformation de la caméra
        const centerX = (this.canvas.width || 400) / 2;
        const centerY = (this.canvas.height || 400) / 2;
        
        const cameraX = isFinite(this.camera.x) ? this.camera.x : 0;
        const cameraY = isFinite(this.camera.y) ? this.camera.y : 0;
        // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
        const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
        const zoom = isFinite(this.camera.zoom) && this.camera.zoom > 0 ? this.camera.zoom : defaultZoom;

        this.ctx.translate(centerX, centerY);
        this.ctx.scale(zoom, zoom);
        this.ctx.translate(-cameraX, -cameraY);
    }
    
    /**
     * Dessiner les étoiles
     */
    renderStars() {
        this.ctx.fillStyle = this.colors.stars;

        // Le contexte est en coordonnées MONDE (applyCamera a déjà appliqué le zoom) : une taille
        // de N pixels à l'écran vaut N / zoom unités monde.
        const zoom = (isFinite(this.camera.zoom) && this.camera.zoom > 0) ? this.camera.zoom : 0.00711;
        const starSize = 2 / zoom;

        // Étendue du champ d'étoiles : centré sur la scène (milieu A↔B si connus, sinon la
        // caméra) et dimensionné sur la distance A↔B (ou sur la vue courante), de sorte que les
        // étoiles tombent toujours dans le champ tout en restant fixes dans le monde (parallaxe).
        const viewW = (this.canvas.width || 800) / zoom;
        const viewH = (this.canvas.height || 600) / zoom;
        let centerX = isFinite(this.camera.x) ? this.camera.x : 0;
        let centerY = isFinite(this.camera.y) ? this.camera.y : 0;
        let spanX = viewW * 2;
        let spanY = viewH * 2;

        if (this.startPoint && this.targetPoint &&
            isFinite(this.startPoint.x) && isFinite(this.targetPoint.x)) {
            centerX = (this.startPoint.x + this.targetPoint.x) / 2;
            centerY = (this.startPoint.y + this.targetPoint.y) / 2;
            const ddx = this.targetPoint.x - this.startPoint.x;
            const ddy = this.targetPoint.y - this.startPoint.y;
            const abSpan = Math.sqrt(ddx * ddx + ddy * ddy) * 2;
            spanX = Math.max(abSpan, viewW * 2);
            spanY = Math.max(abSpan, viewH * 2);
        }

        for (const star of this.stars) {
            // Compatibilité : anciennes étoiles éventuelles stockées en coordonnées absolues
            const nx = (typeof star.nx === 'number') ? star.nx : 0;
            const ny = (typeof star.ny === 'number') ? star.ny : 0;
            this.ctx.globalAlpha = star.brightness * 0.5;
            this.ctx.fillRect(centerX + nx * spanX, centerY + ny * spanY, starSize, starSize);
        }

        this.ctx.globalAlpha = 1.0;
    }
    
    /**
     * Dessiner les points de navigation (A et B) pour l'objectif 'navigate'
     * Note : le contexte est en coordonnées monde (applyCamera a déjà scalé par zoom).
     * Les tailles doivent donc être en unités monde.
     */
    renderNavigationPoints() {
        // Calculer la taille proportionnellement à la distance A-B (~2% de la distance)
        let abDistance = 5000; // fallback
        if (this.startPoint && this.targetPoint) {
            const ddx = this.targetPoint.x - this.startPoint.x;
            const ddy = this.targetPoint.y - this.startPoint.y;
            abDistance = Math.sqrt(ddx * ddx + ddy * ddy) || 5000;
        }
        const pointRadius = abDistance * 0.03;
        const lw = abDistance * 0.004;
        const fs = abDistance * 0.025;

        // Ligne pointillée entre A et B
        if (this.startPoint && this.targetPoint) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = lw * 0.5;
            this.ctx.setLineDash([lw * 12, lw * 12]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.startPoint.x, this.startPoint.y);
            this.ctx.lineTo(this.targetPoint.x, this.targetPoint.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }

        // Point A (départ)
        if (this.startPoint) {
            this.ctx.save();

            // Halo lumineux
            const gA = this.ctx.createRadialGradient(
                this.startPoint.x, this.startPoint.y, pointRadius * 0.5,
                this.startPoint.x, this.startPoint.y, pointRadius * 3
            );
            gA.addColorStop(0, 'rgba(0, 255, 100, 0.25)');
            gA.addColorStop(1, 'rgba(0, 255, 100, 0)');
            this.ctx.fillStyle = gA;
            this.ctx.beginPath();
            this.ctx.arc(this.startPoint.x, this.startPoint.y, pointRadius * 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Anneau extérieur
            this.ctx.strokeStyle = '#00ff64';
            this.ctx.lineWidth = lw;
            this.ctx.beginPath();
            this.ctx.arc(this.startPoint.x, this.startPoint.y, pointRadius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Disque intérieur
            this.ctx.fillStyle = '#00ff64';
            this.ctx.beginPath();
            this.ctx.arc(this.startPoint.x, this.startPoint.y, pointRadius * 0.35, 0, Math.PI * 2);
            this.ctx.fill();

            // Croix au centre
            this.ctx.strokeStyle = '#00ff64';
            this.ctx.lineWidth = lw * 0.7;
            const crossA = pointRadius * 0.7;
            this.ctx.beginPath();
            this.ctx.moveTo(this.startPoint.x - crossA, this.startPoint.y);
            this.ctx.lineTo(this.startPoint.x + crossA, this.startPoint.y);
            this.ctx.moveTo(this.startPoint.x, this.startPoint.y - crossA);
            this.ctx.lineTo(this.startPoint.x, this.startPoint.y + crossA);
            this.ctx.stroke();

            // Label
            this.ctx.fillStyle = '#00ff64';
            this.ctx.font = `bold ${fs}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText('A - DEPART', this.startPoint.x, this.startPoint.y - pointRadius * 1.5);

            this.ctx.restore();
        }

        // Point B (destination)
        if (this.targetPoint) {
            this.ctx.save();

            const pulse = Math.sin(Date.now() / 400) * 0.15 + 1;

            // Halo lumineux pulsant
            const gB = this.ctx.createRadialGradient(
                this.targetPoint.x, this.targetPoint.y, pointRadius * 0.5,
                this.targetPoint.x, this.targetPoint.y, pointRadius * 4 * pulse
            );
            gB.addColorStop(0, 'rgba(255, 60, 60, 0.3)');
            gB.addColorStop(0.5, 'rgba(255, 60, 60, 0.1)');
            gB.addColorStop(1, 'rgba(255, 60, 60, 0)');
            this.ctx.fillStyle = gB;
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointRadius * 4 * pulse, 0, Math.PI * 2);
            this.ctx.fill();

            // Double anneau (cible)
            this.ctx.strokeStyle = '#ff4444';
            this.ctx.lineWidth = lw;
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointRadius * pulse, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointRadius * 0.6 * pulse, 0, Math.PI * 2);
            this.ctx.stroke();

            // Disque intérieur
            this.ctx.fillStyle = '#ff4444';
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointRadius * 0.25 * pulse, 0, Math.PI * 2);
            this.ctx.fill();

            // Croix de visée
            this.ctx.strokeStyle = '#ff4444';
            this.ctx.lineWidth = lw * 0.7;
            const crossB = pointRadius * 1.3 * pulse;
            this.ctx.beginPath();
            this.ctx.moveTo(this.targetPoint.x - crossB, this.targetPoint.y);
            this.ctx.lineTo(this.targetPoint.x + crossB, this.targetPoint.y);
            this.ctx.moveTo(this.targetPoint.x, this.targetPoint.y - crossB);
            this.ctx.lineTo(this.targetPoint.x, this.targetPoint.y + crossB);
            this.ctx.stroke();

            // Label
            this.ctx.fillStyle = '#ff4444';
            this.ctx.font = `bold ${fs}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            this.ctx.fillText('B - ARRIVEE', this.targetPoint.x, this.targetPoint.y - pointRadius * 1.8 * pulse);

            this.ctx.restore();
        }
    }
    
    /**
     * Dessiner les corps célestes
     */
    renderCelestialBodies() {
        // Le contexte est en coordonnées MONDE (applyCamera a déjà appliqué le zoom) : pour
        // garantir une taille minimale de N pixels à l'écran il faut N / zoom unités monde.
        // CORRECTION : le code MULTIPLIAIT par le zoom (≈ 2,7e-3) — les corps étaient dessinés
        // ~370 000× trop petits (donc invisibles), idem pour la taille de police.
        const zoom = (isFinite(this.camera.zoom) && this.camera.zoom > 0) ? this.camera.zoom : 0.00711;

        for (const body of this.celestialBodies) {
            if (!body.position) continue;

            // Rayon réel, avec un plancher de 8 px à l'écran pour rester visible de loin
            const realRadius = body.radius || 50000;
            const displayRadius = Math.max(realRadius, 8 / zoom);

            this.ctx.beginPath();
            this.ctx.arc(body.position.x, body.position.y, displayRadius, 0, Math.PI * 2);
            
            // Couleur selon le type de corps
            if (body.name === 'Terre' || body.name === 'Earth') {
                this.ctx.fillStyle = this.colors.earth;
            } else if (body.name === 'Lune' || body.name === 'Moon') {
                this.ctx.fillStyle = this.colors.moon;
            } else {
                this.ctx.fillStyle = body.color || '#FFFFFF';
            }
            
            this.ctx.fill();
            
            // Contour plus visible (2 px à l'écran)
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.lineWidth = 2 / zoom;
            this.ctx.stroke();

            // Nom du corps céleste : 14 px à l'écran -> 14 / zoom unités monde
            this.ctx.fillStyle = '#FFFFFF';
            const fontSize = 14 / zoom;
            this.ctx.font = `${fontSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(body.name || 'Corps', body.position.x, body.position.y + displayRadius + fontSize + 5);
        }
    }
    
    /**
     * Dessiner toutes les trajectoires de la fusée
     */
    renderTrajectory() {
        // Dessiner d'abord les anciennes trajectoires (épisodes précédents)
        this.ctx.lineWidth = Math.max(1, 2 / this.camera.zoom);
        
        for (let trajIndex = 0; trajIndex < this.allTrajectories.length; trajIndex++) {
            const trajectory = this.allTrajectories[trajIndex];
            if (trajectory.length < 2) continue;
            
            // Opacité décroissante pour les anciennes trajectoires
            const trajectoryAge = this.allTrajectories.length - trajIndex;
            const alpha = Math.max(0.2, 1 - (trajectoryAge * 0.1));
            
            this.ctx.strokeStyle = this.colors.trajectoryOld;
            this.ctx.globalAlpha = alpha;
            this.ctx.beginPath();
            
            this.ctx.moveTo(trajectory[0].x, trajectory[0].y);
            for (let i = 1; i < trajectory.length; i++) {
                this.ctx.lineTo(trajectory[i].x, trajectory[i].y);
            }
            
            this.ctx.stroke();
        }
        
        // Dessiner la trajectoire actuelle
        if (this.rocketTrajectory.length >= 2) {
            this.ctx.strokeStyle = this.colors.trajectory;
            this.ctx.globalAlpha = 1.0;
            this.ctx.beginPath();

            // CORRECTION (fade mort) : l'ancien code calculait un globalAlpha par point à
            // l'intérieur d'un unique beginPath()/stroke() — seule la DERNIÈRE valeur s'appliquait,
            // le dégradé n'a donc jamais existé. Le rendre réel imposerait un stroke() par segment
            // (des milliers d'appels par frame, sur le thread qui fait tourner l'entraînement) :
            // on supprime plutôt le calcul mort et le champ `timestamp` qui ne servait qu'à lui.
            this.ctx.moveTo(this.rocketTrajectory[0].x, this.rocketTrajectory[0].y);
            for (let i = 1; i < this.rocketTrajectory.length; i++) {
                this.ctx.lineTo(this.rocketTrajectory[i].x, this.rocketTrajectory[i].y);
            }

            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    /**
     * Dessiner la fusée
     */
    renderRocket() {
        if (!this.rocketData || !this.rocketData.position) return;
        
        const x = this.rocketData.position.x;
        const y = this.rocketData.position.y;
        const angle = this.rocketData.angle || 0;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);

        // Le contexte est en coordonnées MONDE : une taille minimale de N pixels à l'écran vaut
        // N / zoom unités monde. CORRECTION : l'ancien `10000 * zoom` MULTIPLIAIT par le zoom
        // (≈ 2,7e-3 -> 27 unités monde ≈ 0,07 px à l'écran) : la fusée était invisible.
        const zoom = (isFinite(this.camera.zoom) && this.camera.zoom > 0) ? this.camera.zoom : 0.00711;
        const rocketHalfHeight = (typeof ROCKET !== 'undefined' && ROCKET.HEIGHT) ? ROCKET.HEIGHT / 2 : 30;
        const size = Math.max(rocketHalfHeight, 12 / zoom); // au moins ~12 px à l'écran

        // Dessiner la fusée comme un triangle simple
        this.ctx.fillStyle = this.rocketData.isDestroyed ? '#ff0000' : this.colors.rocket;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size);
        this.ctx.lineTo(-size/2, size);
        this.ctx.lineTo(size/2, size);
        this.ctx.closePath();
        this.ctx.fill();
        
        // Contour
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = Math.max(1, 3 / this.camera.zoom);
        this.ctx.stroke();
        
        // Indicateur de direction de vitesse (seulement si assez zoomé)
        if (this.rocketData.velocity && this.camera.zoom > 0.00002) {
            const vx = this.rocketData.velocity.x;
            const vy = this.rocketData.velocity.y;
            const speed = Math.sqrt(vx * vx + vy * vy);

            if (speed > 1) {
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = Math.max(2, 4 / this.camera.zoom);
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                // CORRECTION: Adapter la longueur du vecteur vitesse au zoom (divisé par 5)
                const vectorScale = Math.max(0.1, 1 / this.camera.zoom);
                this.ctx.lineTo(vx * vectorScale / 500, vy * vectorScale / 500); // Divisé par 500 au lieu de 100 (5x plus petit)
                this.ctx.stroke();
            }
        }
        
        this.ctx.restore();
    }
    
    /**
     * Dessiner les informations de debug
     */
    renderDebugInfo() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '12px monospace';
        
        // Indicateur de réception de données (clignotant)
        const dataIndicator = this.lastDataReceived && (Date.now() - this.lastDataReceived < 500) ? '🟢' : '🔴';
        
        // CORRECTION: Protection contre NaN dans l'affichage
        const cameraX = isFinite(this.camera.x) ? this.camera.x : 0;
        const cameraY = isFinite(this.camera.y) ? this.camera.y : 0;
        const zoom = isFinite(this.camera.zoom) ? this.camera.zoom : 0.00711; // Zoom par défaut pour l'entraînement
        const targetZoom = isFinite(this.camera.targetZoom) ? this.camera.targetZoom : 0.00711;
        
        const info = [
            `${dataIndicator} Données: ${this.lastDataReceived ? 'Actif' : 'En attente'}`,
            `Caméra: (${cameraX.toFixed(0)}, ${cameraY.toFixed(0)})`,
            `Zoom: ${zoom.toExponential(2)} → ${targetZoom.toExponential(2)}`
        ];
        
        if (this.rocketData) {
            const pos = this.rocketData.position || {};
            const vel = this.rocketData.velocity || {};
            // CORRECTION (unités) : rocketData.velocity est en échelle Matter
            // (≈ u/s × MATTER_BASE_DELTA, cf. PHYSICS.md §1). L'afficher tel quel en « m/s »
            // annonçait une vitesse ~16,67× trop grande. On convertit en unités/seconde.
            const VK = (typeof PHYSICS !== 'undefined' && PHYSICS.MATTER_BASE_DELTA) ? PHYSICS.MATTER_BASE_DELTA : (1000 / 60);
            const speed = Math.sqrt((vel.x || 0) ** 2 + (vel.y || 0) ** 2) / VK;

            info.push(
                `------- Fusée -------`,
                `Position: (${(pos.x || 0).toFixed(0)}, ${(pos.y || 0).toFixed(0)})`,
                `Vitesse: ${speed.toFixed(1)} u/s`,
                `Carburant: ${(this.rocketData.fuel || 0).toFixed(0)}`,
                `État: ${this.rocketData.isDestroyed ? '💥 Détruite' : this.rocketData.isLanded ? '✅ Atterrie' : '🚀 En vol'}`
            );
        } else {
            info.push('------- Fusée -------');
            info.push('⏳ Aucune donnée de fusée');
            info.push('(Démarrez l\'entraînement)');
        }
        
        // Contrôles
        info.push('------ Contrôles ------');
        info.push('🔍+/- : Zoom');
        info.push('🧹 : Effacer trajectoire');
        
        // Fond semi-transparent pour le texte
        const lineHeight = 14;
        const padding = 5;
        const textWidth = 200;
        const textHeight = info.length * lineHeight + padding * 2;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(5, 5, textWidth, textHeight);
        
        this.ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < info.length; i++) {
            this.ctx.fillText(info[i], 10, 18 + i * lineHeight);
        }
    }
    
    /**
     * Redimensionner le canvas
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Forcer un nouveau rendu après redimensionnement
        if (this.isActive) {
            this.render();
        }
    }
    
    /**
     * Nettoyer les ressources
     */
    destroy() {
        this.stopRenderLoop();
        this.isActive = false;

        // Se désabonner AVANT de lâcher le canvas/contexte (sinon un événement AI.* arrivant
        // ensuite exécuterait le rendu sur un ctx null).
        if (this._unsubs && this._unsubs.length > 0) {
            for (const unsub of this._unsubs) {
                try { if (typeof unsub === 'function') unsub(); } catch (e) { /* ignore */ }
            }
            this._unsubs = [];
        }

        this.eventBus = null;
        this.canvas = null;
        this.ctx = null;
    }
} 