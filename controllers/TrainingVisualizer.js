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
        this.maxTrajectoriesCount = 10; // Nombre max de trajectoires à conserver
        
        // Données de l'environnement
        this.rocketData = null;
        this.celestialBodies = [];
        
        // Configuration de la caméra simplifiée
        this.camera = {
            x: 0,
            y: 0,
            zoom: 0.0001, // Zoom initial pour voir la Terre et sa zone proche
            targetZoom: 0.0001,
            followRocket: false, // Commencer par une vue centrée sur la Terre
            minZoom: 0.000001, // Zoom minimum pour voir un système très large (1/1000000)
            maxZoom: 0.01      // Zoom maximum pour voir la fusée de près
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
        
        console.log('[TrainingVisualizer] Initialisé');
    }
    
    /**
     * S'abonner aux événements pertinents
     */
    subscribeToEvents() {
        // Écouter les mises à jour de l'environnement d'entraînement
        this.eventBus.subscribe(window.EVENTS.AI.TRAINING_STEP, (data) => {
            if (this.isActive && data) {
                this.updateVisualization(data);
            }
        });
        
        // Écouter les événements de début/fin d'épisode
        this.eventBus.subscribe(window.EVENTS.AI.EPISODE_STARTED, (data) => {
            this.onEpisodeStarted(data);
        });
        
        this.eventBus.subscribe(window.EVENTS.AI.EPISODE_ENDED, (data) => {
            this.onEpisodeEnded(data);
        });
    }
    
    /**
     * Gérer le début d'un nouvel épisode
     */
    onEpisodeStarted(data) {
        console.log('[TrainingVisualizer] Début d\'épisode:', data);
        
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
            console.log('[TrainingVisualizer] Corps célestes reçus au début d\'épisode:', data.celestialBodies);
            this.celestialBodies = data.celestialBodies;
            if (!this.camera.followRocket) {
                this.initializeCamera();
            }
        } else if (this.celestialBodies.length === 0) {
            // Si aucun corps céleste n'est fourni et qu'on n'en a pas, utiliser les valeurs par défaut
            console.log('[TrainingVisualizer] Aucun corps céleste fourni, utilisation des valeurs par défaut');
            this.initializeDefaultCelestialBodies();
        }
    }
    
    /**
     * Gérer la fin d'un épisode
     */
    onEpisodeEnded(data) {
        // La trajectoire sera sauvegardée au début du prochain épisode
        console.log(`[TrainingVisualizer] Épisode terminé, trajectoire de ${this.rocketTrajectory.length} points`);
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
        
        console.log('[TrainingVisualizer] Corps célestes par défaut initialisés:', this.celestialBodies);
    }
    
    /**
     * Mettre à jour les données de visualisation
     */
    updateVisualization(data) {
        if (!data) return;
        
        // Debug: Log des données reçues (seulement occasionnellement pour éviter le spam)
        if (Math.random() < 0.01) { // 1% de chance de logger
            console.log('[TrainingVisualizer] Données reçues:', {
                hasRocket: !!data.rocket,
                hasCelestialBodies: !!data.celestialBodies,
                celestialBodiesCount: data.celestialBodies ? data.celestialBodies.length : 0,
                step: data.step
            });
        }
        
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
            
            // Log quand on reçoit de nouveaux corps célestes
            if (!hadBodies) {
                console.log('[TrainingVisualizer] Corps célestes reçus:', this.celestialBodies);
            }
            
            // Initialiser la caméra si c'est la première fois qu'on reçoit des corps célestes
            if (!hadBodies && this.celestialBodies.length > 0) {
                this.initializeCamera();
            }
        }
        
        // Mettre à jour la caméra seulement si on suit la fusée
        if (this.rocketData && this.rocketData.position && this.camera.followRocket) {
            this.updateCamera();
        }
        
        // Maintenir la caméra centrée sur la Terre si on ne suit pas la fusée
        if (!this.camera.followRocket) {
            this.maintainEarthCenteredView();
        }
    }
    
    /**
     * Mettre à jour la position de la caméra pour suivre la fusée
     */
    updateCamera() {
        if (!this.rocketData || !this.rocketData.position) return;
        
        // Suivre la fusée avec un léger décalage
        const targetX = this.rocketData.position.x;
        const targetY = this.rocketData.position.y;
        
        // Interpolation douce
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;
        
        // Ajuster le zoom automatiquement selon l'altitude de la fusée
        const earth = this.celestialBodies.find(body => 
            body.name === 'Terre' || body.name === 'Earth'
        );
        
        if (earth && earth.position) {
            const distanceFromEarth = Math.sqrt(
                (this.rocketData.position.x - earth.position.x) ** 2 + 
                (this.rocketData.position.y - earth.position.y) ** 2
            );
            
            const earthRadius = earth.radius || 6371000;
            const altitude = distanceFromEarth - earthRadius;
            
            // Zoom adaptatif basé sur l'altitude
            let targetZoom;
            if (altitude < earthRadius) {
                // Proche de la Terre : zoom plus serré
                targetZoom = 0.005;
            } else if (altitude < earthRadius * 5) {
                // Altitude moyenne : zoom intermédiaire
                targetZoom = 0.001;
            } else {
                // Haute altitude : zoom plus large
                targetZoom = 0.0002;
            }
            
            // Ajuster selon la vitesse pour anticiper les mouvements
            if (this.rocketData.velocity) {
                const speed = Math.sqrt(
                    this.rocketData.velocity.x ** 2 + this.rocketData.velocity.y ** 2
                );
                
                // Réduire le zoom si la fusée va vite pour mieux voir sa trajectoire
                if (speed > 1000) {
                    targetZoom *= 0.7;
                }
            }
            
            this.camera.targetZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, targetZoom));
        }
        
        // Interpolation du zoom
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;
    }
    
    /**
     * Maintenir la caméra centrée sur la Terre
     */
    maintainEarthCenteredView() {
        const earth = this.celestialBodies.find(body => 
            body.name === 'Terre' || body.name === 'Earth'
        );
        
        if (earth && earth.position) {
            // Maintenir la caméra centrée sur la Terre avec une interpolation douce
            this.camera.x += (earth.position.x - this.camera.x) * 0.05;
            this.camera.y += (earth.position.y - this.camera.y) * 0.05;
        }
        
        // Interpolation du zoom vers la valeur cible
        this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;
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
     * Initialiser la caméra pour une vue centrée sur la Terre
     */
    initializeCamera() {
        if (this.celestialBodies.length === 0) {
            this.camera.x = 0;
            this.camera.y = 0;
            this.camera.zoom = 0.0001;
            this.camera.targetZoom = 0.0001;
            this.camera.followRocket = false;
            return;
        }
        
        // Trouver la Terre pour centrer la caméra dessus
        const earth = this.celestialBodies.find(body => 
            body.name === 'Terre' || body.name === 'Earth'
        );
        
        if (earth && earth.position) {
            // Centrer la caméra exactement sur la Terre
            this.camera.x = earth.position.x;
            this.camera.y = earth.position.y;
            
            // Zoom pour voir la Terre et sa zone proche (où la fusée évolue)
            // Calculer un zoom qui montre environ 8 fois le rayon de la Terre
            const earthRadius = earth.radius || 6371000;
            const viewRadius = earthRadius * 8; // Zone de 8 rayons terrestres
            const canvasSize = Math.min(this.canvas.width, this.canvas.height);
            
            // Calculer le zoom pour que la zone d'intérêt occupe environ 60% du canvas
            this.camera.zoom = (canvasSize * 0.6) / (viewRadius * 2);
            this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom));
        } else {
            // Fallback si pas de Terre trouvée - centrer sur l'origine
            this.camera.x = 0;
            this.camera.y = 0;
            this.camera.zoom = 0.0001;
        }
        
        this.camera.targetZoom = this.camera.zoom;
        this.camera.followRocket = false; // Toujours commencer par une vue centrée sur la Terre
        
        console.log(`[TrainingVisualizer] Caméra initialisée sur la Terre: centre=(${this.camera.x.toFixed(0)}, ${this.camera.y.toFixed(0)}), zoom=${this.camera.zoom.toFixed(6)}`);
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
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ctx.translate(centerX, centerY);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
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
        const size = Math.max(10, 50000 * this.camera.zoom);
        
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
                // Adapter la longueur du vecteur vitesse au zoom
                const vectorScale = Math.max(0.1, 1 / this.camera.zoom);
                this.ctx.lineTo(vx * vectorScale / 100, vy * vectorScale / 100);
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
        
        const info = [
            `Caméra: (${this.camera.x.toFixed(0)}, ${this.camera.y.toFixed(0)})`,
            `Zoom: ${this.camera.zoom.toExponential(2)} (${this.camera.followRocket ? 'Suit fusée' : 'Vue libre'})`,
            `Corps célestes: ${this.celestialBodies.length}`,
            `Trajectoires: ${this.allTrajectories.length} anciennes + 1 actuelle`,
            `Points trajectoire actuelle: ${this.rocketTrajectory.length}`
        ];
        
        if (this.rocketData) {
            info.push(
                `Position fusée: (${this.rocketData.position?.x?.toFixed(0) || 'N/A'}, ${this.rocketData.position?.y?.toFixed(0) || 'N/A'})`,
                `Vitesse: ${this.rocketData.velocity ? Math.sqrt(this.rocketData.velocity.x ** 2 + this.rocketData.velocity.y ** 2).toFixed(1) : 'N/A'} m/s`,
                `Carburant: ${this.rocketData.fuel?.toFixed(0) || 'N/A'}`,
                `État: ${this.rocketData.isDestroyed ? 'Détruite' : this.rocketData.isLanded ? 'Atterrie' : 'En vol'}`
            );
        } else {
            info.push('Aucune donnée de fusée');
        }
        
        // Afficher les corps célestes
        if (this.celestialBodies.length > 0) {
            info.push('--- Corps célestes ---');
            for (const body of this.celestialBodies) {
                if (body.position) {
                    const distance = this.rocketData && this.rocketData.position ? 
                        Math.sqrt((body.position.x - this.rocketData.position.x) ** 2 + (body.position.y - this.rocketData.position.y) ** 2) : 0;
                    info.push(`${body.name}: (${body.position.x.toFixed(0)}, ${body.position.y.toFixed(0)}) - ${distance.toFixed(0)}m - R:${body.radius}`);
                } else {
                    info.push(`${body.name}: Position manquante`);
                }
            }
        } else {
            info.push('--- Aucun corps céleste ---');
        }
        
        for (let i = 0; i < info.length; i++) {
            this.ctx.fillText(info[i], 10, 20 + i * 15);
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