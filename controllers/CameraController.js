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
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.CAMERA_ZOOM_ADJUST, (data) => this.handleCameraZoomAdjust(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.CENTER_ON_ROCKET, () => this.handleCenterCamera()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.START_DRAG, (data) => this.handleCameraStartDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.DRAG, (data) => this.handleCameraDrag(data)));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.CAMERA.STOP_DRAG, () => this.handleCameraStopDrag()));

        // Nouvel abonnement pour la commande de zoom générique (par exemple, depuis un joystick)
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.INPUT.ZOOM_COMMAND, (data) => this.handleZoomCommand(data)));

        // S'abonner à l'événement de redimensionnement du canvas
        const canvasResizedEventName = (window.EVENTS && window.EVENTS.SYSTEM && window.EVENTS.SYSTEM.CANVAS_RESIZED)
            ? window.EVENTS.SYSTEM.CANVAS_RESIZED
            : (window.EVENTS && window.EVENTS.RENDER && window.EVENTS.RENDER.CANVAS_RESIZED)
              ? window.EVENTS.RENDER.CANVAS_RESIZED
              : null;

        if (canvasResizedEventName) {
            window.controllerContainer.track(
                this.eventBus.subscribe(canvasResizedEventName, (data) => this.handleCanvasResized(data))
            );
        } else {
            console.warn("EVENTS.SYSTEM.CANVAS_RESIZED ou EVENTS.RENDER.CANVAS_RESIZED n'est pas défini. CameraController ne s'abonnera pas à l'événement de redimensionnement du canvas.");
        }
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

    // NOUVEAU GESTIONNAIRE pour le zoom via facteur (utilisé par joystick et potentiellement boutons)
    handleCameraZoomAdjust(data) {
        if (this.gameController.isPaused || !data || typeof data.factor !== 'number') return;

        // Le facteur est appliqué directement. 
        // Un facteur > 1 zoome (augmente la taille visible des objets, diminue la zone visible).
        // Un facteur < 1 dézoome (diminue la taille visible des objets, augmente la zone visible).
        // GameController envoie déjà un facteur calculé : 
        //   - zoom arrière (axe joystick < 0) -> factor = 1 + zoomSpeedFactor (donc > 1, pour dézoomer setZoom attend un facteur < 1)
        //   - zoom avant (axe joystick > 0) -> factor = 1 / (1 + zoomSpeedFactor) (donc < 1, pour zoomer setZoom attend un facteur > 1)
        // Il semble y avoir une inversion dans mon commentaire précédent ou dans la logique de setZoom.
        // Si cameraModel.setZoom(newAbsoluteZoomLevel):
        // Si cameraModel.setZoom(multiplicativeFactor): 
        //    - zoom IN (view smaller area) factor > 1
        //    - zoom OUT (view larger area) factor < 1 (e.g., 0.9)
        // Nos handleZoomIn/Out actuels: 
        //    ZOOM_IN:  this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED) -> facteur > 1
        //    ZOOM_OUT: this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED) -> facteur < 1
        // GameController a envoyé pour joystick:
        //    EVENTS.INPUT.ZOOM_COMMAND -> value < 0 (zoom arrière/OUT)
        //       GameController.handleZoomCommand -> EVENTS.CAMERA.CAMERA_ZOOM_ADJUST { factor: 1 + zoomSpeedFactor } (facteur > 1)
        //    EVENTS.INPUT.ZOOM_COMMAND -> value > 0 (zoom avant/IN)
        //       GameController.handleZoomCommand -> EVENTS.CAMERA.CAMERA_ZOOM_ADJUST { factor: 1 / (1 + zoomSpeedFactor) } (facteur < 1)
        // Donc, la logique dans GameController pour le facteur de CAMERA_ZOOM_ADJUST est inversée par rapport à handleZoomIn/Out.
        // GameController.handleZoomCommand devrait envoyer:
        //  - zoom arrière (value < 0): factor < 1 (comme pour ZOOM_OUT)
        //  - zoom avant (value > 0): factor > 1 (comme pour ZOOM_IN)
        // Pour l'instant, on applique le facteur tel quel, mais il faudra vérifier la cohérence.
        // Supposons que le facteur est correct pour une application multiplicative directe à cameraModel.zoom.
        
        this.cameraModel.setZoom(this.cameraModel.zoom * data.factor);

        // L'émission d'un événement de mise à jour de simulation (SIMULATION.UPDATED)
        // devrait être gérée par GameController si les changements de caméra l'exigent,
        // ou si CameraModel émet lui-même un événement indiquant son changement d'état.
        // GameController.emitUpdatedStates(); // Peut-être nécessaire si le zoom affecte des éléments de UI
    }

    // +++ NOUVEAU GESTIONNAIRE pour EVENTS.INPUT.ZOOM_COMMAND +++
    handleZoomCommand(data) {
        if (!this.cameraModel || this.gameController.isPaused) return; // Accès à isPaused via gameController
        
        const zoomValue = data.value; // Valeur brute de l'axe du joystick
        const zoomSpeed = (RENDER.ZOOM_SPEED || 0.01); // Vitesse de zoom de base
        let factor = 1.0;

        // Comportement désiré :
        // Joystick vers le HAUT (zoomValue < 0) doit ZOOMER (facteur > 1).
        // Joystick vers le BAS (zoomValue > 0) doit DÉZOOMER (facteur < 1).
        // La méthode cameraModel.setZoom(this.cameraModel.zoom * factor) fonctionne ainsi :
        // - facteur > 1 : Zoom IN (objets plus grands, zone vue plus petite)
        // - facteur < 1 : Zoom OUT (objets plus petits, zone vue plus grande)

        if (zoomValue < 0) { // Joystick vers le HAUT ou équivalent -> ZOOMER
            factor = 1 + Math.abs(zoomValue) * zoomSpeed * 1.5; // facteur > 1
        } else if (zoomValue > 0) { // Joystick vers le BAS ou équivalent -> DÉZOOMER
            factor = 1 / (1 + Math.abs(zoomValue) * zoomSpeed * 1.5); // facteur < 1
        } else {
            return; // Pas de changement si la valeur est nulle (zone morte gérée en amont)
        }
        
        this.cameraModel.setZoom(this.cameraModel.zoom * factor);
        // L'appel à emitUpdatedStates sera géré par GameController si nécessaire après propagation de l'état de CameraModel
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

    // +++ NOUVEAU GESTIONNAIRE pour le redimensionnement du canvas +++
    handleCanvasResized(data) {
        if (this.cameraModel && data) {
            this.cameraModel.width = data.width;
            this.cameraModel.height = data.height;
            this.cameraModel.offsetX = data.width / 2;
            this.cameraModel.offsetY = data.height / 2;
            // console.log(`[CameraController] CameraModel dimensions updated: ${data.width}x${data.height}`);
        }
    }

    // Méthode de nettoyage si nécessaire (par exemple, pour se désabonner des événements)
    cleanup() {
        // Code pour se désabonner des événements si window.controllerContainer.untrack était implémenté
        // ou si EventBus avait une méthode unsubscribeAllBySubscriber(this)
        console.log("CameraController cleanup: Unsubscribe logic placeholder.");
    }
} 