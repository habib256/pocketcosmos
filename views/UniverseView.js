/**
 * Gère le rendu de l'arrière-plan de l'univers, des étoiles et des corps célestes.
 * Coordonne également l'affichage de la trace de la fusée via une vue dédiée.
 * Cette classe dépend d'une instance de `CelestialBodyView` et `TraceView`
 * qui doivent lui être fournies via les setters correspondants.
 * Elle utilise également les constantes définies dans `constants.js` (namespace RENDER).
 *
 * Note importante sur la caméra :
 * Cette vue ne gère PAS l'état de la caméra (position, zoom). L'objet `camera`
 * (contenant x, y, zoom, width, height, offsetX, offsetY) doit être fourni
 * à toutes les méthodes qui en ont besoin (render, worldToScreen, etc.).
 * C'est généralement le `RenderingController` qui gère la caméra principale.
 */
class UniverseView {
    /**
     * @param {HTMLCanvasElement} canvas - L'élément canvas sur lequel dessiner.
     */
    constructor(/*canvas*/) {
        /** @type {HTMLCanvasElement} */
        // this.canvas = canvas;
        /** @type {CelestialBodyView | null} Vue pour dessiner les corps célestes. */
        this.celestialBodyView = null;
        /** @type {TraceView | null} Vue pour dessiner la trace de la fusée. */
        this.traceView = null;
    }

    /**
     * Injecte la vue responsable du rendu des corps célestes.
     * @param {CelestialBodyView} view - L'instance de CelestialBodyView.
     */
    setCelestialBodyView(view) {
        this.celestialBodyView = view;
    }

    /**
     * Injecte la vue responsable du rendu de la trace de la fusée.
     * @param {TraceView} view - L'instance de TraceView.
     */
    setTraceView(view) {
        this.traceView = view;
    }

    /**
     * Convertit les coordonnées du monde (simulation) en coordonnées de l'écran (canvas).
     * @param {number} worldX - Coordonnée X dans le monde.
     * @param {number} worldY - Coordonnée Y dans le monde.
     * @param {CameraModel} camera - L'objet caméra contenant (x, y, zoom, offsetX, offsetY).
     * @returns {{x: number, y: number}} Les coordonnées correspondantes sur l'écran.
     */
    worldToScreen(worldX, worldY, camera) {
        return {
            x: (worldX - camera.x) * camera.zoom + camera.offsetX,
            y: (worldY - camera.y) * camera.zoom + camera.offsetY
        };
    }

    /**
     * Convertit les coordonnées de l'écran (canvas) en coordonnées du monde (simulation).
     * @param {number} screenX - Coordonnée X sur l'écran.
     * @param {number} screenY - Coordonnée Y sur l'écran.
     * @param {CameraModel} camera - L'objet caméra contenant (x, y, zoom, offsetX, offsetY).
     * @returns {{x: number, y: number}} Les coordonnées correspondantes dans le monde.
     */
    screenToWorld(screenX, screenY, camera) {
        // Assurer que le zoom n'est pas zéro pour éviter la division par zéro
        const zoom = camera.zoom === 0 ? 1 : camera.zoom;
        return {
            x: (screenX - camera.offsetX) / zoom + camera.x,
            y: (screenY - camera.offsetY) / zoom + camera.y
        };
    }

    /**
     * Vérifie si un objet sphérique (défini par sa position et son rayon dans le monde)
     * est potentiellement visible à l'écran, en tenant compte de la caméra et d'une marge.
     * Utile pour optimiser le rendu en ne dessinant que les objets visibles.
     * @param {number} worldX - Coordonnée X du centre de l'objet dans le monde.
     * @param {number} worldY - Coordonnée Y du centre de l'objet dans le monde.
     * @param {number} radius - Rayon de l'objet dans le monde.
     * @param {CameraModel} camera - L'objet caméra (x, y, zoom, width, height, offsetX, offsetY).
     * @returns {boolean} Vrai si l'objet est potentiellement visible, faux sinon.
     */
    isVisible(worldX, worldY, radius, camera) {
        const screen = this.worldToScreen(worldX, worldY, camera);
        const radiusOnScreen = radius * camera.zoom;
        // Utilise une marge proportionnelle au rayon à l'écran pour être plus tolérant
        const margin = radiusOnScreen * RENDER.MARGIN_FACTOR;

        return (
            screen.x + margin >= 0 &&
            screen.x - margin <= camera.width &&
            screen.y + margin >= 0 &&
            screen.y - margin <= camera.height
        );
    }

    /**
     * Vérifie si un point donné en coordonnées **écran** est dans les limites du canvas,
     * avec une marge de tolérance.
     * @param {number} screenX - Coordonnée X à vérifier sur l'écran.
     * @param {number} screenY - Coordonnée Y à vérifier sur l'écran.
     * @param {CameraModel} camera - L'objet caméra pour obtenir les dimensions.
     * @returns {boolean} Vrai si le point est dans les limites visibles (avec marge).
     */
    isPointVisible(screenX, screenY, camera) {
        // Calcule une marge basée sur les dimensions du canvas (maintenant via camera) pour éviter les artefacts sur les bords
        const margin = RENDER.MARGIN_FACTOR * Math.max(camera.width, camera.height);
        return screenX >= -margin && screenX <= camera.width + margin &&
               screenY >= -margin && screenY <= camera.height + margin;
    }


    /**
     * Applique les transformations (translation, échelle) au contexte de rendu 2D
     * en fonction de l'état actuel de la caméra. Doit être appelée avant de dessiner
     * les éléments du monde pour qu'ils apparaissent au bon endroit et à la bonne taille.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {CameraModel} camera - L'objet caméra (x, y, zoom, offsetX, offsetY).
     */
    applyCameraTransform(ctx, camera) {
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
    }

    /**
     * Dessine le fond uni de l'espace.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {CameraModel} camera - L'objet caméra pour obtenir les dimensions.
     */
    renderBackground(ctx, camera) {
        // Sauvegarde l'état actuel (transformations, styles)
        ctx.save();
        // Réinitialise la transformation pour dessiner le fond sur tout le canvas visible
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = RENDER.SPACE_COLOR;
        // Utiliser camera.width et camera.height pour les dimensions du fillRect
        ctx.fillRect(0, 0, camera.width, camera.height);
        // Restaure l'état précédent
        ctx.restore();
    }

    /**
     * Calcule et met à jour la luminosité des étoiles pour simuler un effet de scintillement.
     * Modifie directement la propriété `brightness` des objets étoiles dans le tableau.
     * @param {Array<Object>} stars - Le tableau contenant les objets étoiles (avec x, y).
     * @param {number} time - Le temps actuel (par exemple, timestamp) pour animer le scintillement.
     */
    applyStarTwinkle(stars, time) {
        if (!stars) return;

        const twinkleFactor = RENDER.STAR_TWINKLE_FACTOR;
        // Vitesse de scintillement, potentiellement basée sur une constante ou dynamique
        const twinkleSpeed = RENDER.ZOOM_SPEED * 0.02; // Exemple: lié à ZOOM_SPEED

        for (const star of stars) {
            // Calcul simple basé sur sin() pour un effet périodique
            const twinkling = Math.sin(time * twinkleSpeed + star.x * 0.01 + star.y * 0.01);
            // Applique le scintillement à la luminosité de base
            star.brightness = RENDER.STAR_BRIGHTNESS_BASE + twinkling * twinkleFactor + RENDER.STAR_BRIGHTNESS_RANGE;
            // S'assure que la luminosité reste dans une plage valide (ex: 0 à 1)
            star.brightness = Math.max(0, Math.min(1, star.brightness));
        }
    }


    /**
     * Dessine les étoiles sur le canvas.
     * Les étoiles ont une taille fixe indépendante du zoom.
     * Leur luminosité peut varier (voir `applyStarTwinkle`).
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {CameraModel} camera - L'objet caméra.
     * @param {Array<Object>} stars - Tableau d'objets étoile ({x, y, brightness}).
     */
    renderStars(ctx, camera, stars) {
        if (!stars || stars.length === 0) return;

        ctx.save();
        // Réinitialise la transformation pour dessiner les étoiles directement en coordonnées écran
        // (leur position perçue dépend de la caméra, mais leur rendu est en pixels fixes)
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        for (const star of stars) {
            // Convertit la position monde en écran
            const screenPos = this.worldToScreen(star.x, star.y, camera);

            // Vérifie si le point est visible (en coordonnées écran)
            if (this.isPointVisible(screenPos.x, screenPos.y, camera)) {
                // Taille fixe pour les étoiles (ex: 1 pixel)
                const size = 1;

                // Utilise la luminosité calculée (ou une valeur par défaut)
                ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness || RENDER.STAR_BRIGHTNESS_BASE})`;
                ctx.beginPath();
                // Dessine un petit cercle ou carré
                // ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
                // Utiliser fillRect est souvent plus performant pour des points de 1 pixel
                ctx.fillRect(Math.floor(screenPos.x), Math.floor(screenPos.y), size, size);
                // ctx.fill(); // Seulement si arc est utilisé
            }
        }
        ctx.restore();
    }


    /**
     * Dessine les corps célestes en utilisant la vue injectée (`celestialBodyView`).
     * Ne dessine que les corps visibles.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {CameraModel} camera - L'objet caméra.
     * @param {Array<CelestialBodyModel>} celestialBodies - Tableau des modèles de corps célestes.
     */
    renderCelestialBodies(ctx, camera, celestialBodies) {
        if (!celestialBodies || celestialBodies.length === 0 || !this.celestialBodyView) {
            return;
        }

        for (const body of celestialBodies) {
            // Vérification basique de l'existence et de la position
            if (!body || typeof body.position?.x !== 'number' || typeof body.position?.y !== 'number') {
                console.warn("Corps céleste invalide ou sans position:", body);
                continue;
            }
            // Vérifie la visibilité avant de déléguer le rendu
            if (this.isVisible(body.position.x, body.position.y, body.radius, camera)) {
                 this.celestialBodyView.render(ctx, body, camera);
            }
        }
    }


    /**
     * Met à jour la vue de la trace avec la nouvelle position de la fusée.
     * La position est convertie en coordonnées écran avant d'être passée à `TraceView`.
     * @param {{x: number, y: number}} rocketPosition - Position de la fusée dans le monde.
     * @param {CameraModel} camera - L'objet caméra actuel.
     */
    updateTrace(rocketPosition, camera) {
        if (!this.traceView) return;

        // Convertit la position monde de la fusée en coordonnées écran
        const screenPos = this.worldToScreen(rocketPosition.x, rocketPosition.y, camera);
        this.traceView.update(screenPos); // TraceView travaille en coordonnées écran
    }

    /**
     * Demande à la vue de la trace d'effacer l'historique des positions.
     */
    clearTrace() {
        if (!this.traceView) return;
        this.traceView.clear();
    }

    /**
     * Demande à la vue de la trace de basculer sa visibilité.
     */
    toggleTraceVisibility() {
        if (!this.traceView) return;
        this.traceView.toggleVisibility();
    }

    /**
     * Méthode de rendu principale pour l'univers.
     * Orchestre le dessin du fond, des étoiles et des corps célestes.
     * Applique également l'effet de scintillement aux étoiles.
     * IMPORTANT : Cette méthode suppose que les transformations de caméra (`applyCameraTransform`)
     * sont gérées à l'extérieur (par exemple, par le RenderingController) AVANT d'appeler cette méthode,
     * SAUF pour les éléments qui doivent être dessinés en coordonnées écran fixes (fond, étoiles).
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {CameraModel} camera - L'objet caméra.
     * @param {Array<Object>} stars - Tableau d'objets étoile ({x, y, brightness}).
     * @param {Array<CelestialBodyModel>} celestialBodies - Tableau des modèles de corps célestes.
     * @param {number} time - Le temps actuel pour l'animation du scintillement.
     */
    render(ctx, camera, stars, celestialBodies, time) {
       // 1. Dessiner le fond (ignore la transformation caméra actuelle)
       this.renderBackground(ctx, camera);

       // 2. Appliquer le scintillement aux données des étoiles (avant le dessin)
       this.applyStarTwinkle(stars, time);

       // 3. Dessiner les étoiles (ignore la transformation caméra actuelle, utilise worldToScreen)
       this.renderStars(ctx, camera, stars);

       // 4. Dessiner les corps célestes directement (les vues utilisent worldToScreen)
       this.renderCelestialBodies(ctx, camera, celestialBodies);

       // Note: Le rendu de la trace (TraceView) est généralement géré séparément
       // car il se superpose à tout le reste et travaille en coordonnées écran.
       // Son rendu serait appelé par le RenderingController *après* cette méthode.
    }
} 