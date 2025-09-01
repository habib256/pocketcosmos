/**
 * @file Gère la caméra du jeu, y compris le zoom, le déplacement (drag),
 * le centrage sur des cibles (comme la fusée) et la réponse aux redimensionnements du canvas.
 * S'abonne aux événements pertinents via l'EventBus pour découpler la logique de la caméra
 * des sources d'entrée directes.
 */
class CameraController {
    /**
     * Crée une instance de CameraController.
     * @param {EventBus} eventBus - L'instance de l'EventBus pour la communication.
     * @param {CameraModel} cameraModel - Le modèle de données de la caméra à contrôler.
     * @param {GameController} gameController - Le contrôleur de jeu principal, utilisé pour accéder
     *                                        à l'état du jeu (ex: `isPaused`) et au modèle de la fusée.
     */
    constructor(eventBus, cameraModel, gameController) {
        this.eventBus = eventBus;
        this.cameraModel = cameraModel;
        this.gameController = gameController; // Pour accéder à isPaused et rocketModel

        /**
         * Indique si le jeu est en pause selon les événements de la FSM.
         * @type {boolean}
         */
        this.isSystemPaused = false;

        /**
         * Indique si un glissement de la caméra est en cours.
         * @type {boolean}
         */
        this.isDragging = false;
        /**
         * Coordonnée X de départ du glissement de la souris/tactile.
         * @type {number}
         */
        this.dragStartX = 0;
        /**
         * Coordonnée Y de départ du glissement de la souris/tactile.
         * @type {number}
         */
        this.dragStartY = 0;
        /**
         * Position X de la caméra au début du glissement.
         * @type {number}
         */
        this.dragStartCameraX = 0;
        /**
         * Position Y de la caméra au début du glissement.
         * @type {number}
         */
        this.dragStartCameraY = 0;

        this.subscribeToEvents();
    }

    /**
     * S'abonne aux événements nécessaires pour le contrôle de la caméra.
     * Utilise `window.controllerContainer.track` pour permettre un nettoyage potentiel
     * des écouteurs d'événements lors de la suppression du contrôleur.
     * @private
     */
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

        // Suivre les événements de pause/reprise pour piloter localement l'état
        if (window.EVENTS && window.EVENTS.GAME) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_PAUSED, () => { this.isSystemPaused = true; })
            );
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.GAME.GAME_RESUMED, () => { this.isSystemPaused = false; })
            );
        }

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

    /**
     * Gère l'action de zoom avant (agrandissement).
     * Augmente le niveau de zoom actuel du modèle de caméra.
     * Ne fait rien si le jeu est en pause.
     */
    handleZoomIn() {
        if (this.isSystemPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
    }

    /**
     * Gère l'action de zoom arrière (réduction).
     * Diminue le niveau de zoom actuel du modèle de caméra.
     * Ne fait rien si le jeu est en pause.
     */
    handleZoomOut() {
        if (this.isSystemPaused) return;
        this.cameraModel.setZoom(this.cameraModel.zoom / (1 + RENDER.ZOOM_SPEED));
    }

    /**
     * Gère l'ajustement du zoom via un facteur multiplicatif direct.
     * Utilisé par exemple par les boutons de zoom du gamepad (`InputController`).
     * Ne fait rien si le jeu est en pause ou si les données sont invalides.
     * @param {object} data - L'objet contenant les données de l'événement.
     * @param {number} data.factor - Le facteur par lequel multiplier le zoom actuel.
     *                               Un facteur > 1 zoome (agrandit), un facteur < 1 dézoome (réduit).
     */
    handleCameraZoomAdjust(data) {
        if (this.isSystemPaused || !data || typeof data.factor !== 'number') return;

        // Le facteur est appliqué directement. Il est attendu que InputController
        // envoie un facteur correct : > 1 pour zoomer, < 1 pour dézoomer.
        // Par exemple, si RENDER.CAMERA_ZOOM_BUTTON_FACTOR = 1.1 :
        // - Bouton Zoom In: factor = 1.1 (Zoom IN)
        // - Bouton Zoom Out: factor = 1 / 1.1 (approx 0.9, Zoom OUT)
        this.cameraModel.setZoom(this.cameraModel.zoom * data.factor);
    }

    /**
     * Gère une commande de zoom provenant d'une source analogique (ex: axe de joystick).
     * Calcule un facteur de zoom basé sur la valeur de l'entrée et une vitesse de zoom définie.
     * Ne fait rien si le modèle de caméra n'est pas disponible ou si le jeu est en pause.
     * @param {object} data - L'objet contenant les données de l'événement.
     * @param {number} data.value - La valeur brute de l'entrée de zoom (ex: position de l'axe du joystick).
     *                            Une valeur négative est interprétée comme un zoom avant, positive comme un zoom arrière.
     */
    handleZoomCommand(data) {
        if (!this.cameraModel || this.isSystemPaused) return;
        
        const zoomValue = data.value; // Valeur brute de l'axe du joystick
        const zoomSpeed = (RENDER.ZOOM_SPEED || 0.01); // Vitesse de zoom de base
        let factor = 1.0;

        // Comportement désiré :
        // - Valeur d'entrée < 0 (ex: joystick vers le haut) : ZOOMER (facteur > 1).
        // - Valeur d'entrée > 0 (ex: joystick vers le bas) : DÉZOOMER (facteur < 1).
        // La méthode cameraModel.setZoom(this.cameraModel.zoom * factor) fonctionne ainsi :
        // - facteur > 1 : Zoom IN (objets plus grands, zone vue plus petite)
        // - facteur < 1 : Zoom OUT (objets plus petits, zone vue plus grande)

        if (zoomValue < 0) { // Entrée pour ZOOMER
            factor = 1 + Math.abs(zoomValue) * zoomSpeed * 1.5; // facteur > 1
        } else if (zoomValue > 0) { // Entrée pour DÉZOOMER
            factor = 1 / (1 + Math.abs(zoomValue) * zoomSpeed * 1.5); // facteur < 1
        } else {
            return; // Pas de changement si la valeur est nulle (zone morte gérée en amont par InputController)
        }
        
        this.cameraModel.setZoom(this.cameraModel.zoom * factor);
    }

    /**
     * Gère la demande de centrage de la caméra.
     * Si la caméra suit déjà la fusée, elle la détache et passe en mode 'free'.
     * Sinon, elle cible la fusée et passe en mode de suivi 'rocket'.
     * Ne fait rien si le jeu est en pause.
     */
    handleCenterCamera() {
        if (this.isSystemPaused) return;

        if (this.cameraModel && this.gameController.rocketModel) {
            // Vérifier si la caméra suit actuellement la fusée
            if (this.cameraModel.target === this.gameController.rocketModel && this.cameraModel.mode === 'rocket') {
                // Si oui, la détacher et passer en mode libre
                this.cameraModel.setTarget(null, 'free');
            } else {
                // Sinon, la centrer sur la fusée et activer le suivi
                this.cameraModel.setTarget(this.gameController.rocketModel, 'rocket');
                // Optionnel: Forcer la position pour un recentrage immédiat.
                // Actuellement, le lissage dans CameraModel.update() s'en charge progressivement.
                // this.cameraModel.setPosition(this.gameController.rocketModel.position.x, this.gameController.rocketModel.position.y);
            }
        }
    }

    /**
     * Gère le début du glissement de la caméra.
     * Enregistre la position de départ du glissement et la position actuelle de la caméra.
     * Ne fait rien si le jeu est en pause.
     * @param {object} data - Les données de l'événement de début de glissement.
     * @param {number} data.x - La coordonnée X du pointeur au début du glissement.
     * @param {number} data.y - La coordonnée Y du pointeur au début du glissement.
     */
    handleCameraStartDrag(data) {
        if (this.gameController.isPaused) return;
        
        this.isDragging = true;
        this.dragStartX = data.x;
        this.dragStartY = data.y;
        
        if (this.cameraModel) {
            this.dragStartCameraX = this.cameraModel.x;
            this.dragStartCameraY = this.cameraModel.y;
            // Ne pas appeler setTarget(null, 'free') ici immédiatement.
            // Le mode sera changé dans handleCameraDrag si un mouvement significatif est détecté
            // alors que la caméra suivait la fusée.
        }
    }
    
    /**
     * Gère le mouvement de la caméra pendant un glissement.
     * Calcule le déplacement de la caméra en fonction du mouvement du pointeur
     * et du niveau de zoom actuel, puis met à jour la position de la caméra.
     * Ne fait rien si aucun glissement n'est en cours ou si le jeu est en pause.
     * @param {object} data - Les données de l'événement de glissement.
     * @param {number} data.x - La coordonnée X actuelle du pointeur.
     * @param {number} data.y - La coordonnée Y actuelle du pointeur.
     */
    handleCameraDrag(data) {
        if (!this.isDragging || this.gameController.isPaused) return;

        if (this.cameraModel) {
            // Si un drag est détecté ET que la caméra est toujours en mode 'rocket' 
            // (signifiant qu'un mousedown a eu lieu mais n'a pas immédiatement changé le mode),
            // alors on vérifie si le mouvement est significatif avant de passer en mode 'free'.
            if (this.cameraModel.mode === 'rocket' && this.cameraModel.target === this.gameController.rocketModel) {
                const dragThreshold = 2; // Seuil en pixels pour considérer un drag comme intentionnel
                const movedX = Math.abs(data.x - this.dragStartX);
                const movedY = Math.abs(data.y - this.dragStartY);

                if (movedX > dragThreshold || movedY > dragThreshold) {
                    // console.log("[CameraController.handleCameraDrag] Passage en mode 'free' car drag significatif détecté pendant le suivi de la fusée."); // Commenté
                    this.cameraModel.setTarget(null, 'free');
                    // dragStartCameraX/Y sont déjà corrects car ils ont été enregistrés au mousedown.
                } else {
                    return; // Pas de drag significatif, on ne change pas de mode et on ne déplace pas la caméra.
                }
            }

            // Si la caméra est (ou vient de passer en) mode 'free', appliquer le déplacement.
            if (this.cameraModel.mode === 'free') {
                const dx = (data.x - this.dragStartX) / this.cameraModel.zoom;
                const dy = (data.y - this.dragStartY) / this.cameraModel.zoom;
                
                this.cameraModel.setPosition(
                    this.dragStartCameraX - dx,
                    this.dragStartCameraY - dy
                );
            }
        }
    }
    
    /**
     * Gère la fin du glissement de la caméra.
     * Réinitialise l'état de glissement.
     */
    handleCameraStopDrag() {
        // Vérifier si on était en train de draguer, même si le jeu est mis en pause PENDANT le drag.
        if (this.isDragging) {
            this.isDragging = false;
        }
    }

    /**
     * Gère l'événement de redimensionnement du canvas.
     * Met à jour les dimensions et les décalages (offsets) du modèle de caméra
     * pour s'adapter à la nouvelle taille du canvas.
     * @param {object} data - Les données de l'événement de redimensionnement.
     * @param {number} data.width - La nouvelle largeur du canvas.
     * @param {number} data.height - La nouvelle hauteur du canvas.
     */
    handleCanvasResized(data) {
        if (this.cameraModel && data) {
            this.cameraModel.width = data.width;
            this.cameraModel.height = data.height;
            this.cameraModel.offsetX = data.width / 2;  // Centre de l'écran en X
            this.cameraModel.offsetY = data.height / 2; // Centre de l'écran en Y
            // console.log(`[CameraController] CameraModel dimensions updated: ${data.width}x${data.height}`);
        }
    }

    /**
     * Méthode de nettoyage pour ce contrôleur.
     * Actuellement un placeholder. Si `window.controllerContainer.track` gère la désinscription
     * des événements souscrits, cette méthode pourrait ne pas être nécessaire pour cela.
     * Pourrait être étendue si d'autres ressources spécifiques à ce contrôleur nécessitaient un nettoyage.
     */
    cleanup() {
        // La désinscription des événements de l'EventBus est supposée être gérée
        // par le mécanisme `window.controllerContainer.track` si celui-ci conserve
        // les fonctions de désabonnement retournées par `eventBus.subscribe`.
        console.log("CameraController cleanup: Placeholder pour la logique de nettoyage.");
    }
} 