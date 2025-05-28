/**
 * @class RocketView
 * Gère l'affichage visuel de la fusée, y compris son image principale,
 * son état (normal ou détruit) et son adaptation à la caméra (zoom, position).
 * Ne gère plus l'affichage des vecteurs physiques (voir VectorsView.js).
 * @param {HTMLCanvasElement} canvas - L'élément canvas sur lequel dessiner.
 * @param {Camera} camera - L'objet caméra pour gérer le zoom et le déplacement.
 */
class RocketView {
    /**
     * @param {ParticleSystemView} particleSystemView - N'est plus utilisé, sera supprimé.
     */
    constructor(/* particleSystemView */) { // particleSystemView n'est plus nécessaire ici
        // this.particleSystemView = particleSystemView; // Supprimé car inutilisé
        this.rocketImage = new Image();
        this.rocketImage.src = 'assets/image/rocket.png'; // Chemin de l'image de la fusée normale
        
        // Image de la fusée crashée
        this.rocketCrashedImage = new Image();
        this.rocketCrashedImage.src = 'assets/image/rocket_crashed.png'; // Chemin de l'image de la fusée crashée
        
        // Dimensions de l'image pour le rendu, basées sur les constantes ROCKET
        // Note : Ces dimensions peuvent être ajustées dynamiquement dans `render`
        // pour assurer une taille minimale visible à l'écran en fonction du zoom.
        this.baseWidth = ROCKET.WIDTH * 2;  // Largeur de base pour l'affichage
        this.baseHeight = ROCKET.HEIGHT * 1.6; // Hauteur de base proportionnelle
        
        // Affichage des vecteurs - OBSOLETE
        // this.showThrusterPositions = false; // Supprimé, géré par VectorsView.js
    }
    
    /**
     * Méthode principale pour dessiner la fusée sur le canvas.
     * Prend en compte l'état de la fusée (normale/détruite), la position, l'angle,
     * et les transformations de la caméra (position, zoom).
     * Assure une taille minimale d'affichage même à des niveaux de zoom élevés.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D du canvas.
     * @param {object} rocketState - L'état actuel de la fusée (position, angle, isDestroyed).
     * @param {Camera} camera - L'objet caméra pour obtenir les informations de transformation (position, zoom, offset).
     */
    render(ctx, rocketState, camera) {
        // Vérification initiale de l'état de la fusée
        if (!rocketState || !rocketState.position) {
            // console.warn("RocketView: rocketState invalide ou position manquante.");
            return; // Ne rien dessiner si l'état n'est pas valide
        }

        ctx.save(); // Sauvegarde l'état global du contexte (transformations, styles)

        // 1. Appliquer les transformations de la caméra
        // Place l'origine du canvas au centre de la vue de la caméra
        ctx.translate(camera.offsetX, camera.offsetY);
        // Applique le zoom de la caméra
        ctx.scale(camera.zoom, camera.zoom);
        // Déplace le "monde" pour que la position de la caméra soit au centre
        ctx.translate(-camera.x, -camera.y);

        // 2. Se positionner à l'emplacement de la fusée dans le monde
        ctx.translate(rocketState.position.x, rocketState.position.y);

        // 3. Orienter le contexte selon l'angle de la fusée
        ctx.rotate(rocketState.angle);

        // 4. Sélectionner l'image appropriée (normale ou détruite)
        const currentImage = rocketState.isDestroyed ? this.rocketCrashedImage : this.rocketImage;

        // 5. Dessiner l'image de la fusée (ou une forme de secours)
        if (currentImage.complete && currentImage.naturalWidth > 0) {
            // Si l'image est chargée et valide
            try {
                // Calculer les dimensions de dessin pour assurer une taille minimale à l'écran
                const minScreenSize = 10; // Taille minimale souhaitée en pixels à l'écran
                const minDrawDim = minScreenSize / camera.zoom; // Taille minimale équivalente dans les coordonnées du monde

                let drawWidth = this.baseWidth;
                let drawHeight = this.baseHeight;
                const aspectRatio = this.baseWidth / this.baseHeight;

                // Ajuster les dimensions si elles sont plus petites que la taille minimale requise
                // en conservant les proportions de l'image.
                if (drawWidth < minDrawDim || drawHeight < minDrawDim) {
                   if (aspectRatio >= 1) { // Image plus large ou carrée
                       drawWidth = Math.max(drawWidth, minDrawDim);
                       drawHeight = drawWidth / aspectRatio;
                   } else { // Image plus haute
                       drawHeight = Math.max(drawHeight, minDrawDim);
                       drawWidth = drawHeight * aspectRatio;
                   }
                }

                // Dessiner l'image centrée sur l'origine locale (position de la fusée)
                ctx.drawImage(
                    currentImage,
                    -drawWidth / 2,
                    -drawHeight / 2,
                    drawWidth,
                    drawHeight
                );
            } catch (e) {
                console.error("Erreur lors du dessin de l'image de la fusée:", e);
                // En cas d'erreur (rare si l'image est .complete), dessiner une forme de secours
                this.drawRocketShape(ctx); // Appel simplifié
            }
        } else {
            // Si l'image n'est pas encore chargée ou est invalide, dessiner une forme de secours
            this.drawRocketShape(ctx); // Appel simplifié
        }

        // 6. Restaurer l'état du contexte
        // Annule la rotation et les translations spécifiques à la fusée,
        // puis les transformations de la caméra.
        ctx.restore(); // Rétablit l'état du contexte tel qu'il était avant ctx.save()
    }
    
    /**
     * Dessine une forme géométrique simple représentant la fusée.
     * Utilisé comme solution de secours si l'image principale ne peut pas être chargée ou dessinée.
     * Le dessin est effectué à l'origine locale (0,0) car la translation et la rotation
     * sont déjà appliquées dans la méthode `render`.
     *
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     */
    drawRocketShape(ctx) {
        // Utilise les dimensions de base pour dessiner la forme
        const width = this.baseWidth / 2; // Ajusté pour correspondre +/- à l'image
        const height = this.baseHeight / 2;

        // Corps principal (triangle)
        ctx.fillStyle = '#CCCCCC';
        ctx.beginPath();
        ctx.moveTo(0, -height * 0.7); // Pointe avant
        ctx.lineTo(width * 0.5, height * 0.3); // Coin arrière droit
        ctx.lineTo(-width * 0.5, height * 0.3); // Coin arrière gauche
        ctx.closePath();
        ctx.fill();

        // Fenêtre (cercle)
        ctx.fillStyle = '#888888';
        ctx.beginPath();
        ctx.arc(0, -height * 0.2, width * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Réacteur (rectangle)
        ctx.fillStyle = '#555555';
        ctx.fillRect(-width * 0.3, height * 0.3, width * 0.6, height * 0.2);
    }

    // Supprimé car l'affichage des vecteurs/positions est géré par VectorsView.js
    // setShowThrusterPositions(enabled) {
    //     this.showThrusterPositions = enabled;
    // }
}
// Rendre disponible globalement
window.RocketView = RocketView;