class CameraModel {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.target = null;
        this.mode = 'rocket'; // 'rocket', 'earth', 'free'
        this.smoothing = RENDER.CAMERA_SMOOTHING;
        this.width = 800;  // Valeur par défaut
        this.height = 600; // Valeur par défaut
    }

    setTarget(target, mode = 'rocket') {
        this.target = target;
        this.mode = mode;
    }

    update(deltaTime) {
        if (!this.target) return;

        switch (this.mode) {
            case 'rocket':
                this.followRocket(deltaTime);
                break;
            case 'earth':
                this.followEarth(deltaTime);
                break;
            case 'free':
                // En mode libre, la caméra ne suit pas automatiquement
                break;
        }
    }

    followRocket(deltaTime) {
        if (!this.target.position) return;
        
        // Calculer la position cible
        const targetX = this.target.position.x;
        const targetY = this.target.position.y;
        
        // Appliquer le lissage
        this.x += (targetX - this.x) * this.smoothing * deltaTime;
        this.y += (targetY - this.y) * this.smoothing * deltaTime;
    }

    followEarth(deltaTime) {
        // À implémenter si nécessaire
    }

    setZoom(newZoom) {
        this.zoom = Math.max(RENDER.MIN_ZOOM, Math.min(RENDER.MAX_ZOOM, newZoom));
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    setOffset(offsetX, offsetY) {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
    }

    // Convertir les coordonnées du monde en coordonnées de l'écran
    worldToScreen(worldX, worldY) {
        // Si un seul argument est passé et c'est un objet, extraire les coordonnées x et y
        if (arguments.length === 1 && typeof worldX === 'object' && worldX !== null) {
            const position = worldX;
            worldX = position.x;
            worldY = position.y;
        }
        
        return {
            x: (worldX - this.x) * this.zoom + this.offsetX,
            y: (worldY - this.y) * this.zoom + this.offsetY
        };
    }

    // Convertir les coordonnées de l'écran en coordonnées du monde
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.offsetX) / this.zoom + this.x,
            y: (screenY - this.offsetY) / this.zoom + this.y
        };
    }
} 