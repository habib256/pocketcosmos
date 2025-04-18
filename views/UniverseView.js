class UniverseView {
    constructor(canvas) {
        this.canvas = canvas;
        this.camera = new CameraModel();
        this.celestialBodyView = null;
        this.traceView = null;
    }
    
    // Initialise la taille du canvas
    setCanvasSize(width, height) {
        this.camera.width = width;
        this.camera.height = height;
        this.camera.offsetX = width / 2;
        this.camera.offsetY = height / 2;
    }
    
    // Définit la position de la caméra
    setCameraPosition(x, y) {
        this.camera.x = x;
        this.camera.y = y;
    }
    
    // Définit le zoom de la caméra
    setCameraZoom(zoom) {
        this.camera.zoom = Math.max(RENDER.MIN_ZOOM, Math.min(RENDER.MAX_ZOOM, zoom));
    }
    
    // Centre la caméra sur une position spécifique
    centerOn(x, y) {
        this.camera.x = x;
        this.camera.y = y;
    }
    
    // Convertit des coordonnées du monde en coordonnées écran
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.camera.x) * this.camera.zoom + this.camera.offsetX,
            y: (worldY - this.camera.y) * this.camera.zoom + this.camera.offsetY
        };
    }
    
    // Convertit des coordonnées écran en coordonnées du monde
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.camera.offsetX) / this.camera.zoom + this.camera.x,
            y: (screenY - this.camera.offsetY) / this.camera.zoom + this.camera.y
        };
    }
    
    // Vérifie si un objet est visible à l'écran
    isVisible(x, y, radius) {
        const screen = this.worldToScreen(x, y);
        const radiusOnScreen = radius * this.camera.zoom;
        const margin = radiusOnScreen * RENDER.MARGIN_FACTOR;
        
        return (
            screen.x + margin >= 0 &&
            screen.x - margin <= this.camera.width &&
            screen.y + margin >= 0 &&
            screen.y - margin <= this.camera.height
        );
    }
    
    // Méthode pour appliquer les transformations de caméra au contexte
    applyCameraTransform(ctx) {
        ctx.translate(this.camera.offsetX, this.camera.offsetY);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(-this.camera.x, -this.camera.y);
    }
    
    // Rendu du fond spatial (sans les étoiles)
    renderBackground(ctx, camera) {
        // Remplir le fond avec la couleur de l'espace
        ctx.fillStyle = RENDER.SPACE_COLOR;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Rendu des étoiles
    renderStars(ctx, camera, stars) {
        if (!stars || stars.length === 0) return;

        for (const star of stars) {
            // Convertir les coordonnées du monde en coordonnées de l'écran
            const screenPos = {
                x: (star.x - camera.x) * camera.zoom + camera.offsetX,
                y: (star.y - camera.y) * camera.zoom + camera.offsetY
            };
            
            // Vérifier si l'étoile est visible à l'écran
            if (this.isPointVisible(screenPos.x, screenPos.y)) {
                // Taille fixe pour les étoiles, indépendante du zoom
                const size = 1;
                
                // Dessiner l'étoile
                ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness || 0.8})`;
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    isPointVisible(x, y) {
        const margin = RENDER.MARGIN_FACTOR * Math.max(this.canvas.width, this.canvas.height);
        return x >= -margin && x <= this.canvas.width + margin &&
               y >= -margin && y <= this.canvas.height + margin;
    }
    
    // Rendu des corps célestes
    renderCelestialBodies(ctx, camera, celestialBodies) {
        if (!celestialBodies || celestialBodies.length === 0 || !this.celestialBodyView) {
            return;
        }

        for (const body of celestialBodies) {
            if (!body || !body.position) {
                console.error("Corps céleste invalide", body);
                continue;
            }
            this.celestialBodyView.render(ctx, body, camera);
        }
    }
    
    // Effet de scintillement pour les étoiles
    applyStarTwinkle(ctx, stars, time) {
        if (!stars) return;
        
        const twinkleFactor = RENDER.STAR_TWINKLE_FACTOR;
        const twinkleSpeed = RENDER.ZOOM_SPEED * 0.02; // Vitesse de scintillement basée sur ZOOM_SPEED
        
        for (const star of stars) {
            // Calculer un facteur de scintillement basé sur le temps et la position de l'étoile
            const twinkling = Math.sin(time * twinkleSpeed + star.x * 0.01 + star.y * 0.01);
            star.brightness = RENDER.STAR_BRIGHTNESS_BASE + twinkling * twinkleFactor + RENDER.STAR_BRIGHTNESS_RANGE;
        }
    }

    // Mettre à jour la trace avec la position de la fusée
    updateTrace(rocketPosition) {
        if (!this.traceView) return;
        
        const screenPos = this.worldToScreen(rocketPosition.x, rocketPosition.y);
        this.traceView.update(screenPos);
    }

    // Effacer la trace
    clearTrace() {
        if (!this.traceView) return;
        
        this.traceView.clear();
    }

    // Basculer la visibilité de la trace
    toggleTraceVisibility() {
        if (!this.traceView) return;
        
        this.traceView.toggleVisibility();
    }

    setUniverseModel(model) {
        this.universeModel = model;
    }

    setCelestialBodyView(view) {
        this.celestialBodyView = view;
    }
    
    setTraceView(view) {
        this.traceView = view;
    }

    // Ajoute une méthode de rendu principale si elle n'existe pas déjà
    render(ctx, camera, physicsController) {
       // console.log('[DEBUG] UniverseView.render appelé, physicsController:', !!physicsController);
        this.renderBackground(ctx, camera);
        // Les autres appels de rendu (étoiles, corps célestes, etc.) doivent être faits ici dans l'ordre voulu
    }
} 