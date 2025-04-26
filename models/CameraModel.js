/**
 * Représente l'état de la caméra virtuelle dans la simulation.
 * Gère la position, le zoom, le suivi d'une cible et la conversion
 * entre les coordonnées du monde et les coordonnées de l'écran.
 */
class CameraModel {
    /**
     * Initialise une nouvelle caméra.
     */
    constructor() {
        /** @type {number} Position horizontale de la caméra dans le monde. */
        this.x = 0;
        /** @type {number} Position verticale de la caméra dans le monde. */
        this.y = 0;
        /** @type {number} Niveau de zoom actuel. 1 = zoom normal. <1 = dézoomé, >1 = zoomé. */
        this.zoom = 1;
        /** 
         * @type {number} Décalage horizontal en pixels sur l'écran. 
         * Généralement utilisé pour centrer la vue (ex: canvas.width / 2).
         */
        this.offsetX = 0;
        /** 
         * @type {number} Décalage vertical en pixels sur l'écran.
         * Généralement utilisé pour centrer la vue (ex: canvas.height / 2).
         */
        this.offsetY = 0;
        /** 
         * @type {object|null} La cible que la caméra doit suivre (ex: la fusée). 
         * Doit avoir une propriété `position` avec `x` et `y`.
         */
        this.target = null;
        /** 
         * @type {'rocket'|'free'} Mode de suivi de la caméra.
         * 'rocket': Suit la cible `target`.
         * 'free': La caméra est contrôlée manuellement (ne suit pas de cible).
         * Le mode 'earth' a été retiré car non implémenté.
         */
        this.mode = 'rocket';
        /** 
         * @type {number} Facteur de lissage pour le mouvement de la caméra.
         * Une valeur plus faible donne un suivi plus réactif, une valeur plus élevée donne un suivi plus doux.
         * Provient de `RENDER.CAMERA_SMOOTHING` dans `constants.js`.
         */
        this.smoothing = RENDER.CAMERA_SMOOTHING;
        /** 
         * @type {number} Largeur du canvas de rendu (en pixels). 
         * N'est pas directement utilisée par la logique interne de CameraModel pour le calcul de position/zoom, 
         * mais est nécessaire pour que les systèmes externes (ex: RenderingController) calculent correctement l'offsetX 
         * pour centrer la vue.
         */
        this.width = 800;  // Valeur par défaut, devrait être mise à jour par le système de rendu.
        /** 
         * @type {number} Hauteur du canvas de rendu (en pixels).
         * N'est pas directement utilisée par la logique interne de CameraModel, mais essentielle pour calculer l'offsetY.
         */
        this.height = 600; // Valeur par défaut, devrait être mise à jour par le système de rendu.
    }

    /**
     * Définit la cible que la caméra doit suivre et le mode de suivi.
     * @param {object|null} target - L'objet cible (doit avoir `position.x` et `position.y`) ou null pour arrêter le suivi.
     * @param {'rocket'|'free'} [mode='rocket'] - Le mode de caméra.
     */
    setTarget(target, mode = 'rocket') {
        this.target = target;
        this.mode = mode;
    }

    /**
     * Met à jour la position de la caméra en fonction de son mode et de sa cible.
     * Doit être appelée à chaque frame de la boucle de jeu.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière frame (en secondes).
     */
    update(deltaTime) {
        if (!this.target) return; // Ne fait rien si aucune cible n'est définie

        switch (this.mode) {
            case 'rocket':
                this.followRocket(deltaTime);
                break;
            // case 'earth': // Mode retiré car non implémenté
            //     this.followEarth(deltaTime); 
            //     break;
            case 'free':
                // En mode libre, la caméra ne suit pas automatiquement.
                // Sa position peut être modifiée via setPosition() ou par d'autres contrôles.
                break;
        }
    }

    /**
     * Logique de suivi de la fusée (ou de toute cible ayant une `position`).
     * Applique un lissage pour un mouvement fluide.
     * @private // Indique que cette méthode est principalement à usage interne.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière frame.
     */
    followRocket(deltaTime) {
        // Vérifie si la cible et sa position existent avant d'essayer d'y accéder.
        if (!this.target || typeof this.target.position?.x !== 'number' || typeof this.target.position?.y !== 'number') {
            console.warn("Camera target or target position is invalid for following.");
            return;
        }
        
        // Position cible souhaitée (centre de la caméra sur la cible)
        const targetX = this.target.position.x;
        const targetY = this.target.position.y;
        
        // Interpolation linéaire pour un mouvement doux vers la cible.
        // se rapprocher de la cible = targetX - this.x
        // facteur de rapprochement = this.smoothing * deltaTime 
        // (ajuste la vitesse en fonction du temps écoulé et du facteur de lissage)
        this.x += (targetX - this.x) * this.smoothing * deltaTime;
        this.y += (targetY - this.y) * this.smoothing * deltaTime;
    }

    // La méthode followEarth a été supprimée car elle n'était pas implémentée.

    /**
     * Définit le niveau de zoom de la caméra, en le contraignant
     * entre `RENDER.MIN_ZOOM` et `RENDER.MAX_ZOOM`.
     * @param {number} newZoom - Le nouveau niveau de zoom souhaité.
     */
    setZoom(newZoom) {
        this.zoom = Math.max(RENDER.MIN_ZOOM, Math.min(RENDER.MAX_ZOOM, newZoom));
    }

    /**
     * Définit manuellement la position de la caméra dans le monde.
     * Utile pour le mode 'free' ou pour initialiser la caméra.
     * @param {number} x - Nouvelle coordonnée X.
     * @param {number} y - Nouvelle coordonnée Y.
     */
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Définit le décalage de l'écran (généralement pour centrer la vue).
     * @param {number} offsetX - Décalage horizontal en pixels.
     * @param {number} offsetY - Décalage vertical en pixels.
     */
    setOffset(offsetX, offsetY) {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
    }

    /**
     * Convertit les coordonnées du système du monde (positions physiques des objets)
     * en coordonnées du système de l'écran (pixels sur le canvas).
     * Prend en compte la position de la caméra, le zoom et l'offset.
     * @param {number|{x: number, y: number}} worldX - Coordonnée X dans le monde ou objet {x, y}.
     * @param {number} [worldY] - Coordonnée Y dans le monde (si worldX n'est pas un objet).
     * @returns {{x: number, y: number}} Les coordonnées correspondantes sur l'écran.
     * @example
     * const screenPos = camera.worldToScreen(rocket.position.x, rocket.position.y);
     * const screenPosObj = camera.worldToScreen(rocket.position); // Fonctionne aussi
     * ctx.fillRect(screenPos.x, screenPos.y, 10, 10); 
     */
    worldToScreen(worldX, worldY) {
        // Permet de passer soit (x, y) soit un objet {x, y}
        if (arguments.length === 1 && typeof worldX === 'object' && worldX !== null) {
            const position = worldX;
            worldX = position.x;
            worldY = position.y;
        }
        
        // 1. Calculer la position relative à la caméra : (worldX - this.x)
        // 2. Appliquer le zoom : * this.zoom
        // 3. Ajouter l'offset de l'écran : + this.offsetX
        return {
            x: (worldX - this.x) * this.zoom + this.offsetX,
            y: (worldY - this.y) * this.zoom + this.offsetY
        };
    }

    /**
     * Convertit les coordonnées de l'écran (pixels sur le canvas, ex: position de la souris)
     * en coordonnées du système du monde.
     * Inverse l'opération de `worldToScreen`.
     * @param {number} screenX - Coordonnée X sur l'écran.
     * @param {number} screenY - Coordonnée Y sur l'écran.
     * @returns {{x: number, y: number}} Les coordonnées correspondantes dans le monde.
     * @example
     * canvas.addEventListener('click', (event) => {
     *   const worldPos = camera.screenToWorld(event.clientX, event.clientY);
     *   console.log('Clic aux coordonnées monde:', worldPos.x, worldPos.y);
     * });
     */
    screenToWorld(screenX, screenY) {
        // 1. Enlever l'offset de l'écran : (screenX - this.offsetX)
        // 2. Inverser le zoom : / this.zoom
        // 3. Ajouter la position de la caméra pour retrouver les coordonnées monde : + this.x
        return {
            x: (screenX - this.offsetX) / this.zoom + this.x,
            y: (screenY - this.offsetY) / this.zoom + this.y
        };
    }
} 