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
        this.maxTrajectoryPoints = 1000; // Limiter pour les performances
        this.maxTrajectoriesCount = 100; // Nombre max de trajectoires à conserver
        this.cameraInitialized = false; // Flag pour savoir si la caméra a déjà été initialisée
        
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
        
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(unsubscribe1);
            window.controllerContainer.track(unsubscribe2);
            window.controllerContainer.track(unsubscribe3);
        }
    }
    
    /**
     * Gérer le début d'un nouvel épisode
     */
    onEpisodeStarted(data) {
        // Sauvegarder la trajectoire actuelle si elle existe
        if (this.rocketTrajectory.length > 0) {
            this.allTrajectories.push([...this.rocketTrajectory]);
            
            // Limiter le nombre de trajectoires conservées
            if (this.allTrajectories.length > this.maxTrajectoriesCount) {
                this.allTrajectories.shift();
            }
        }
        
        // Commencer une nouvelle trajectoire
        this.rocketTrajectory = [];
        
        // Mettre à jour les corps célestes si fournis
        if (data && data.celestialBodies && data.celestialBodies.length > 0) {
            this.celestialBodies = data.celestialBodies;
            if (!this.camera.followRocket) {
                // Préserver le zoom si la caméra a déjà été initialisée
                this.initializeCamera(this.cameraInitialized);
            }
        } else if (this.celestialBodies.length === 0) {
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
            // Initialiser les corps célestes par défaut si aucun n'est présent
            if (this.celestialBodies.length === 0) {
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
            
            // Ajouter le point à la trajectoire
            if (this.rocketData.position) {
                this.rocketTrajectory.push({
                    x: this.rocketData.position.x,
                    y: this.rocketData.position.y,
                    timestamp: Date.now()
                });
                
                // Limiter la taille de la trajectoire
                if (this.rocketTrajectory.length > this.maxTrajectoryPoints) {
                    this.rocketTrajectory.shift();
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
        
        // Initialiser la caméra si les points de navigation sont disponibles et que la caméra n'a pas encore été initialisée
        if (pointsChanged && this.startPoint && this.targetPoint && !this.cameraInitialized) {
            this.initializeCamera(false);
        }
        
        // Mettre à jour la caméra seulement si on suit la fusée
        if (this.rocketData && this.rocketData.position && this.camera.followRocket) {
            this.updateCamera();
        }
        
        // CORRECTION: Vue absolue - ne pas centrer sur la Terre
        // Si on ne suit pas la fusée, maintenir la vue absolue (pas de mouvement automatique)
        // CORRECTION: Zoom fixe - ne pas interpoler automatiquement
        if (!this.camera.followRocket && this.camera.manualZoomControl) {
            // Interpolation du zoom vers la valeur cible seulement si l'utilisateur l'a modifié
            const zoomSpeed = this.camera.zoomSpeed || 0.15;
            this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * zoomSpeed;
        }
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
        // Interpolation du zoom seulement si l'utilisateur a modifié manuellement
        if (this.camera.manualZoomControl) {
            const zoomSpeed = this.camera.zoomSpeed || 0.15;
            this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * zoomSpeed;
        }
    }
    
    /**
     * Maintenir la vue absolue (ne plus utilisé - remplacé par la logique dans updateVisualization)
     * Conservé pour compatibilité mais ne fait rien car on utilise maintenant une vue absolue
     */
    maintainEarthCenteredView() {
        // CORRECTION: Vue absolue - ne plus centrer sur la Terre
        // Cette méthode n'est plus utilisée, la vue reste fixe à sa position absolue
        // Interpolation du zoom vers la valeur cible
        const zoomSpeed = this.camera.zoomSpeed || 0.15;
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * zoomSpeed;
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
        this.camera.followRocket = follow;
        if (!follow) {
            this.initializeCamera();
        }
    }
    
    /**
     * Réinitialiser la vue à la position par défaut
     */
    resetView() {
        // CORRECTION: Réinitialiser le contrôle manuel du zoom lors de la réinitialisation
        this.camera.manualZoomControl = false;
        this.initializeCamera();
        if (this.isActive) {
            this.render();
        }
    }
    
    /**
     * Générer des étoiles de fond
     */
    generateStars(count) {
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: (Math.random() - 0.5) * 500000000, // Plus large pour couvrir l'espace Terre-Lune
                y: (Math.random() - 0.5) * 500000000,
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
     * Initialiser la caméra pour une vue absolue (pas centrée sur la Terre)
     * @param {boolean} preserveZoom - Si true, préserve le zoom actuel au lieu de le réinitialiser
     */
    initializeCamera(preserveZoom = false) {
        // CORRECTION: Si on suit la fusée, centrer directement sur elle au lieu du point de départ
        // Protection contre NaN et valeurs invalides
        const canvasSize = Math.min(this.canvas.width || 400, this.canvas.height || 400);
        
        // CORRECTION: Si on suit la fusée et qu'elle a une position, l'utiliser directement
        if (this.camera.followRocket && this.rocketData && this.rocketData.position &&
            typeof this.rocketData.position.x === 'number' && typeof this.rocketData.position.y === 'number' &&
            isFinite(this.rocketData.position.x) && isFinite(this.rocketData.position.y)) {
            // Centrer directement sur la fusée
            this.camera.x = this.rocketData.position.x;
            this.camera.y = this.rocketData.position.y;

            if (!preserveZoom) {
                // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
                // Si on a des points de navigation, utiliser le zoom pour navigate
                const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
                this.camera.zoom = defaultZoom;
                this.camera.targetZoom = defaultZoom;
            }
        } else if (this.startPoint && this.targetPoint &&
            typeof this.startPoint.x === 'number' && typeof this.startPoint.y === 'number' &&
            typeof this.targetPoint.x === 'number' && typeof this.targetPoint.y === 'number' &&
            isFinite(this.startPoint.x) && isFinite(this.startPoint.y) &&
            isFinite(this.targetPoint.x) && isFinite(this.targetPoint.y)) {
            // Pour l'objectif 'navigate' sans position de fusée, centrer la vue pour voir les deux points
            const centerX = (this.startPoint.x + this.targetPoint.x) / 2;
            const centerY = (this.startPoint.y + this.targetPoint.y) / 2;

            this.camera.x = isFinite(centerX) ? centerX : 0;
            this.camera.y = isFinite(centerY) ? centerY : 0;

            if (!preserveZoom) {
                // CORRECTION: Zoom par défaut pour le mode navigate (2.7e-3)
                this.camera.zoom = 0.0027;
                this.camera.targetZoom = 0.0027;
            }
        } else if (this.celestialBodies.length === 0) {
            // Vue absolue centrée sur l'origine (pas de planètes, pas de points de navigation)
            this.camera.x = 0;
            this.camera.y = 0;
            if (!preserveZoom) {
                // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
                const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
                this.camera.zoom = defaultZoom;
                this.camera.targetZoom = defaultZoom;
            }
        } else {
            // Il y a des corps célestes mais pas de points de navigation
            // Centrer sur le premier corps céleste ou l'origine
            const firstBody = this.celestialBodies[0];
            if (firstBody && firstBody.position && 
                typeof firstBody.position.x === 'number' && typeof firstBody.position.y === 'number' &&
                isFinite(firstBody.position.x) && isFinite(firstBody.position.y)) {
                this.camera.x = firstBody.position.x;
                this.camera.y = firstBody.position.y;
                
                if (!preserveZoom) {
                    const bodyRadius = firstBody.radius || 6371000;
                    const viewRadius = bodyRadius * 8;
                    if (canvasSize > 0 && viewRadius > 0) {
                        this.camera.zoom = (canvasSize * 0.6) / (viewRadius * 2);
                        this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom));
                        if (!isFinite(this.camera.zoom)) {
                            // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
                            const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
                            this.camera.zoom = defaultZoom;
                        }
                    } else {
                        // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
                        const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
                        this.camera.zoom = defaultZoom;
                    }
                    this.camera.targetZoom = this.camera.zoom;
                }
            } else {
                this.camera.x = 0;
                this.camera.y = 0;
                if (!preserveZoom) {
                    // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
                    const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
                    this.camera.zoom = defaultZoom;
                    this.camera.targetZoom = defaultZoom;
                }
            }
        }
        
        // CORRECTION: Protection finale contre NaN
        if (!isFinite(this.camera.x)) this.camera.x = 0;
        if (!isFinite(this.camera.y)) this.camera.y = 0;
        // CORRECTION: Zoom par défaut selon le mode (navigate: 2.7e-3, autre: 7.11e-3)
        const defaultZoom = (this.startPoint && this.targetPoint) ? 0.0027 : 0.00711;
        if (!isFinite(this.camera.zoom)) this.camera.zoom = defaultZoom;
        if (!isFinite(this.camera.targetZoom)) this.camera.targetZoom = defaultZoom;
        
        // CORRECTION: Suivre la fusée par défaut
        this.camera.followRocket = true;
        this.cameraInitialized = true;
    }
    
    /**
     * Démarrer la boucle de rendu
     */
    startRenderLoop() {
        if (this.renderLoopId) return;
        
        const render = () => {
            if (this.isActive) {
                this.render();
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
        
        // Adapter la taille des étoiles au zoom pour qu'elles restent visibles
        const starSize = Math.max(1, 2 / this.camera.zoom);
        
        for (const star of this.stars) {
            this.ctx.globalAlpha = star.brightness * 0.5;
            this.ctx.fillRect(star.x, star.y, starSize, starSize);
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    /**
     * Dessiner les points de navigation (A et B) pour l'objectif 'navigate'
     */
    renderNavigationPoints() {
        // Dessiner le point A (départ) si disponible
        if (this.startPoint) {
            this.ctx.save();
            this.ctx.fillStyle = '#00ff00'; // Vert pour le point de départ
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = Math.max(2, 3 / this.camera.zoom);
            
            const pointSize = Math.max(15, 20000 * this.camera.zoom);
            
            // Cercle extérieur
            this.ctx.beginPath();
            this.ctx.arc(this.startPoint.x, this.startPoint.y, pointSize, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Cercle intérieur
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath();
            this.ctx.arc(this.startPoint.x, this.startPoint.y, pointSize * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Contour
            this.ctx.stroke();
            
            // Label "Point A"
            this.ctx.fillStyle = '#00ff00';
            const fontSize = Math.max(12, Math.min(20, 18 / this.camera.zoom));
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Point A', this.startPoint.x, this.startPoint.y - pointSize - fontSize - 5);
            
            this.ctx.restore();
        }
        
        // Dessiner le point B (destination) si disponible
        if (this.targetPoint) {
            this.ctx.save();
            this.ctx.fillStyle = '#ff6b6b'; // Rouge pour le point d'arrivée
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth = Math.max(2, 3 / this.camera.zoom);
            
            const pointSize = Math.max(15, 20000 * this.camera.zoom);
            
            // Cercle extérieur avec animation pulsante
            const pulse = Math.sin(Date.now() / 500) * 0.2 + 1; // Pulsation entre 0.8 et 1.2
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointSize * pulse, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Cercle intérieur
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath();
            this.ctx.arc(this.targetPoint.x, this.targetPoint.y, pointSize * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Contour
            this.ctx.stroke();
            
            // Label "Point B"
            this.ctx.fillStyle = '#ff6b6b';
            const fontSize = Math.max(12, Math.min(20, 18 / this.camera.zoom));
            this.ctx.font = `bold ${fontSize}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Point B', this.targetPoint.x, this.targetPoint.y - pointSize * pulse - fontSize - 5);
            
            this.ctx.restore();
        }
    }
    
    /**
     * Dessiner les corps célestes
     */
    renderCelestialBodies() {
        for (const body of this.celestialBodies) {
            if (!body.position) continue;
            
            // Calculer la taille d'affichage basée sur le rayon réel et le zoom
            const realRadius = body.radius || 50000;
            // S'assurer que les corps célestes sont toujours visibles avec une taille minimale plus grande
            const displayRadius = Math.max(8, realRadius * this.camera.zoom);
            
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
            
            // Contour plus visible
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.lineWidth = Math.max(2, 3 / this.camera.zoom);
            this.ctx.stroke();
            
            // Nom du corps céleste (toujours visible avec une taille adaptée)
            this.ctx.fillStyle = '#FFFFFF';
            const fontSize = Math.max(10, Math.min(20, 15 / this.camera.zoom));
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
            
            // Dessiner la trajectoire avec un effet de fade basé sur l'âge des points
            for (let i = 1; i < this.rocketTrajectory.length; i++) {
                const point = this.rocketTrajectory[i];
                const prevPoint = this.rocketTrajectory[i - 1];
                
                // Calculer l'opacité basée sur l'âge du point
                const age = (Date.now() - point.timestamp) / 30000; // 30 secondes de fade
                const alpha = Math.max(0.3, 1 - age);
                
                this.ctx.globalAlpha = alpha;
                
                if (i === 1) {
                    this.ctx.moveTo(prevPoint.x, prevPoint.y);
                }
                this.ctx.lineTo(point.x, point.y);
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
        
        // Taille adaptée au zoom - plus visible à faible zoom
        const size = Math.max(10, 10000 * this.camera.zoom);
        
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
            const speed = Math.sqrt((vel.x || 0) ** 2 + (vel.y || 0) ** 2);
            
            info.push(
                `------- Fusée -------`,
                `Position: (${(pos.x || 0).toFixed(0)}, ${(pos.y || 0).toFixed(0)})`,
                `Vitesse: ${speed.toFixed(1)} m/s`,
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
        this.eventBus = null;
        this.canvas = null;
        this.ctx = null;
    }
} 