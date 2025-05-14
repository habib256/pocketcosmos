class CameraController {
    constructor(eventBus, cameraModel, gameController) {
        this.eventBus = eventBus;
        this.cameraModel = cameraModel;
        this.gameController = gameController; // Pour accéder à isPaused et rocketModel

        // Variables pour le glisser-déposer de la caméra
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartCameraX = 0;
        this.dragStartCameraY = 0;

        this.subscribeToEvents();
    }

    subscribeToEvents() {
        // Événements sémantiques pour la caméra
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_IN, () => this.handleZoomIn()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.ZOOM_OUT, () => this.handleZoomOut()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.CENTER_ON_ROCKET, () => this.handleCenterCamera()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.START_DRAG, (data) => this.handleCameraStartDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.DRAG, (data) => this.handleCameraDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.STOP_DRAG, () => this.handleCameraStopDrag()));
    }

    // Gestion du zoom
    handleZoomIn() {
        if (this.gameController.isPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
        // L'émission de EVENTS.GAME.STATE_UPDATED est gérée par GameController si nécessaire,
        // ou pourrait être émise ici si CameraController devient plus indépendant.
        // Pour l'instant, on suppose que GameController écoute les changements de CameraModel
        // ou que les opérations de zoom n'ont pas besoin d'un STATE_UPDATED immédiat spécifique à elles.
    }

    handleZoomOut() {
        if (this.gameController.isPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED));
    }

    // Centrer la caméra sur la fusée
    handleCenterCamera() {
        if (this.gameController.isPaused) return;

        if (this.cameraModel && this.gameController.rocketModel) {
            // Vérifier si la caméra suit actuellement la fusée
            if (this.cameraModel.target === this.gameController.rocketModel && this.cameraModel.mode === 'rocket') {
                // Si oui, la détacher et passer en mode libre
                this.cameraModel.setTarget(null, 'free');
            } else {
                // Sinon, la centrer sur la fusée et activer le suivi
                this.cameraModel.setTarget(this.gameController.rocketModel, 'rocket');
                // Optionnel: Forcer la position pour un recentrage immédiat, 
                // sinon le lissage de CameraModel.update() le fera progressivement.
                // this.cameraModel.setPosition(this.gameController.rocketModel.position.x, this.gameController.rocketModel.position.y);
            }
        }
    }

    // Gestion du drag de la caméra
    handleCameraStartDrag(data) {
        if (this.gameController.isPaused) return;
        
        this.isDragging = true;
        this.dragStartX = data.x;
        this.dragStartY = data.y;
        
        if (this.cameraModel) {
            this.dragStartCameraX = this.cameraModel.x;
            this.dragStartCameraY = this.cameraModel.y;
            this.cameraModel.setTarget(null, 'free');
        }
    }
    
    handleCameraDrag(data) {
        if (!this.isDragging || this.gameController.isPaused) return;
        
        const dx = (data.x - this.dragStartX) / this.cameraModel.zoom;
        const dy = (data.y - this.dragStartY) / this.cameraModel.zoom;
        
        if (this.cameraModel) {
            this.cameraModel.setPosition(
                this.dragStartCameraX - dx,
                this.dragStartCameraY - dy
            );
        }
    }
    
    handleCameraStopDrag() {
        if (this.isDragging) { // Vérifier si on était en train de draguer, même si le jeu est en pause
            this.isDragging = false;
        }
    }

    // Méthode de nettoyage si nécessaire (par exemple, pour se désabonner des événements)
    cleanup() {
        // Code pour se désabonner des événements si window.controllerContainer.untrack était implémenté
        // ou si EventBus avait une méthode unsubscribeAllBySubscriber(this)
        console.log("CameraController cleanup: Unsubscribe logic placeholder.");
    }
} 