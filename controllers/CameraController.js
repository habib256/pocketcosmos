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

        // Panneau à gauche (guide « Découverte ») : centrer la vue dans la zone restée libre.
        if (window.EVENTS && window.EVENTS.CAMERA && window.EVENTS.CAMERA.LEFT_MARGIN_CHANGED) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.CAMERA.LEFT_MARGIN_CHANGED, (data) => {
                    if (!this.cameraModel || !data) return;
                    const positif = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : 0; };
                    this.cameraModel.margeGauche = positif(data.margeGauche);
                    this.cameraModel.margeDroite = positif(data.margeDroite);
                    this.cameraModel.appliquerCentre();
                })
            );
        }

        // Recentrer caméra sur la fusée lors d'un reload d'univers
        if (window.EVENTS && window.EVENTS.UNIVERSE && window.EVENTS.UNIVERSE.STATE_UPDATED) {
            window.controllerContainer.track(
                this.eventBus.subscribe(window.EVENTS.UNIVERSE.STATE_UPDATED, (payload) => {
                    try {
                        // Annuler tout panoramique en cours : ses ancres (dragStartCameraX/Y)
                        // référencent la caméra de l'ANCIEN monde. Sans cela, un rechargement
                        // survenant bouton enfoncé faisait, au mouvement suivant, sauter la vue
                        // d'une distance arbitraire dans le vide du nouveau monde.
                        this.isDragging = false;
                        if (this.cameraModel && this.gameController && this.gameController.rocketModel) {
                            this.cameraModel.setTarget(this.gameController.rocketModel, 'rocket');
                            if (this.gameController.rocketModel.position) {
                                this.cameraModel.setPosition(this.gameController.rocketModel.position.x, this.gameController.rocketModel.position.y);
                            }
                        }
                    } catch (e) {
                        console.warn('[CameraController] Erreur lors du traitement de UNIVERSE_STATE_UPDATED:', e);
                    }
                })
            );
        }
    }

    /**
     * Gère l'action de zoom avant (agrandissement).
     * Augmente le niveau de zoom actuel du modèle de caméra.
     */
    handleZoomIn() {
        this.cameraModel.setZoom(this.cameraModel.zoom * (1 + RENDER.ZOOM_SPEED));
    }

    /**
     * Gère l'action de zoom arrière (réduction).
     * Diminue le niveau de zoom actuel du modèle de caméra.
     */
    handleZoomOut() {
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
        if (!data || typeof data.factor !== 'number') return;

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
     * @param {number} [data.deltaTime] - Le temps écoulé (en secondes) depuis la dernière frame.
     */
    handleZoomCommand(data) {
        if (!this.cameraModel || !data) return;

        const zoomValue = data.value; // Valeur brute de l'axe du joystick
        if (typeof zoomValue !== 'number' || !isFinite(zoomValue) || zoomValue === 0) return;

        // Le gain est exprimé en unités par SECONDE et intégré sur le temps réel. Auparavant le
        // facteur « par cran de molette » (1 + |v| * ZOOM_SPEED * 1.5) était appliqué à CHAQUE
        // frame : saturation en 7 frames à fond, et zoom 2,4× plus rapide à 144 Hz qu'à 60 Hz.
        const dt = (typeof data.deltaTime === 'number' && isFinite(data.deltaTime))
            ? Math.max(0, Math.min(0.05, data.deltaTime))
            : 1 / 60;
        const taux = (RENDER.ZOOM_RATE_PER_SECOND || 1.0); // Gain du zoom analogique en unités/seconde
        // v < 0 (stick vers le haut) -> facteur > 1 -> ZOOM IN ; v > 0 -> facteur < 1 -> ZOOM OUT.
        this.cameraModel.setZoom(this.cameraModel.zoom * Math.exp(-zoomValue * taux * dt));
    }

    /**
     * Gère la demande de centrage de la caméra.
     * Si la caméra suit déjà la fusée, elle la détache et passe en mode 'free'.
     * Sinon, elle cible la fusée et passe en mode de suivi 'rocket'.
     */
    handleCenterCamera() {

        const rocketModel = this.gameController && this.gameController.rocketModel;
        if (this.cameraModel && rocketModel) {
            // « Centrer sur la fusée » CENTRE, toujours. Ce n'était pas une bascule utile :
            // le mode par défaut étant déjà 'rocket', l'ancien code détachait la caméra dans le
            // cas le plus courant — appuyer sur C en vol faisait fuir la fusée hors de l'écran,
            // et il fallait appuyer une seconde fois pour rétablir le suivi.
            this.cameraModel.setTarget(rocketModel, 'rocket');
            // Recentrage IMMÉDIAT : après un panoramique loin de la fusée, le lissage seul
            // aurait fait dériver la vue lentement à travers tout le monde.
            if (rocketModel.position) {
                this.cameraModel.setPosition(rocketModel.position.x, rocketModel.position.y);
            }
        }
    }

    /**
     * Gère le début du glissement de la caméra.
     * Enregistre la position de départ du glissement et la position actuelle de la caméra.
     * @param {object} data - Les données de l'événement de début de glissement.
     * @param {number} data.x - La coordonnée X du pointeur au début du glissement.
     * @param {number} data.y - La coordonnée Y du pointeur au début du glissement.
     */
    handleCameraStartDrag(data) {
        
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
     * Ne fait rien si aucun glissement n'est en cours.
     * @param {object} data - Les données de l'événement de glissement.
     * @param {number} data.x - La coordonnée X actuelle du pointeur.
     * @param {number} data.y - La coordonnée Y actuelle du pointeur.
     */
    handleCameraDrag(data) {
        if (!this.isDragging) return;

        if (this.cameraModel) {
            // Si un drag est détecté ET que la caméra est toujours en mode 'rocket' 
            // (signifiant qu'un mousedown a eu lieu mais n'a pas immédiatement changé le mode),
            // alors on vérifie si le mouvement est significatif avant de passer en mode 'free'.
            if (this.cameraModel.mode === 'rocket') {
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
            // Centre de l'écran, ou de la zone laissée libre par le guide « Découverte »
            this.cameraModel.appliquerCentre();
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