class RocketView {
    constructor(particleSystemView) {
        this.particleSystemView = particleSystemView;
        this.rocketImage = new Image();
        this.rocketImage.src = 'assets/image/rocket.png'; // Chemin de l'image de la fusée
        
        // Ajouter l'image de la fusée crashée
        this.rocketCrashedImage = new Image();
        this.rocketCrashedImage.src = 'assets/image/rocket_crashed.png'; // Chemin de l'image de la fusée crashée
        
        // Dimensions de l'image basées sur les constantes
        this.width = ROCKET.WIDTH * 2; // Double de la largeur pour l'affichage
        this.height = ROCKET.HEIGHT * 1.6; // Hauteur proportionnelle
        
        // Affichage des vecteurs
        this.showThrusterPositions = false; // On garde uniquement pour les positions des propulseurs
    }
    
    // Nouveau rendu avec support de la caméra et prise en charge de l'état
    render(ctx, rocketState, camera) {
        if (rocketState.isDestroyed) {
            // Afficher uniquement la carcasse de la fusée, pas les thrusters
            ctx.save();
            ctx.translate(camera.offsetX, camera.offsetY);
            ctx.scale(camera.zoom, camera.zoom);
            ctx.translate(-camera.x, -camera.y);
            ctx.translate(rocketState.position.x, rocketState.position.y);
            ctx.save();
            ctx.rotate(rocketState.angle);
            const currentImage = this.rocketCrashedImage;
            if (currentImage.complete && currentImage.naturalWidth > 0) {
                try {
                    const minScreenSize = 10;
                    const minDrawDim = minScreenSize / camera.zoom;
                    let drawWidth = this.width;
                    let drawHeight = this.height;
                    const aspectRatio = this.width / this.height;
                    if (drawWidth < minDrawDim || drawHeight < minDrawDim) {
                        if (aspectRatio >= 1) {
                            drawWidth = Math.max(drawWidth, minDrawDim);
                            drawHeight = drawWidth / aspectRatio;
                        } else {
                            drawHeight = Math.max(drawHeight, minDrawDim);
                            drawWidth = drawHeight * aspectRatio;
                        }
                    }
                    ctx.drawImage(
                        currentImage,
                        -drawWidth / 2,
                        -drawHeight / 2,
                        drawWidth,
                        drawHeight
                    );
                } catch (e) {
                    console.error("Erreur de chargement d'image:", e);
                    this.drawRocketShape(ctx, rocketState);
                }
            } else {
                this.drawRocketShape(ctx, rocketState);
            }
            ctx.restore();
            ctx.restore();
            return;
        }
        if (!rocketState || !rocketState.position) return;
        
        ctx.save();
        
        // Appliquer la transformation de la caméra
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
        
        // Translater au centre de la fusée
        ctx.translate(rocketState.position.x, rocketState.position.y);
        
        // Dessiner la fusée
        ctx.save(); // Sauvegarder le contexte pour la rotation de la fusée
        
        // Pivoter selon l'angle de la fusée
        ctx.rotate(rocketState.angle);
        
        // Sélectionner l'image en fonction de l'état de la fusée
        const currentImage = rocketState.isDestroyed ? this.rocketCrashedImage : this.rocketImage;
        
        // Dessiner la fusée
        if (currentImage.complete && currentImage.naturalWidth > 0) {
            // Si l'image est chargée, l'utiliser
            try {
                // Calculer les dimensions de dessin pour assurer une taille minimale à l'écran
                const minScreenSize = 10; // Taille minimale en pixels à l'écran (modifié)
                const minDrawDim = minScreenSize / camera.zoom; // Taille minimale dans le système de coordonnées local

                let drawWidth = this.width;
                let drawHeight = this.height;
                const aspectRatio = this.width / this.height;

                if (drawWidth < minDrawDim || drawHeight < minDrawDim) {
                   if (aspectRatio >= 1) { // Plus large ou carré
                       drawWidth = Math.max(drawWidth, minDrawDim);
                       drawHeight = drawWidth / aspectRatio;
                   } else { // Plus haut
                       drawHeight = Math.max(drawHeight, minDrawDim);
                       drawWidth = drawHeight * aspectRatio;
                   }
                }

                ctx.drawImage(
                    currentImage,
                    -drawWidth / 2,  // Centrer l'image ajustée
                    -drawHeight / 2, // Centrer l'image ajustée
                    drawWidth,
                    drawHeight
                );
            } catch (e) {
                console.error("Erreur de chargement d'image:", e);
                this.drawRocketShape(ctx, rocketState);
            }
        } else {
            // Sinon, dessiner une forme simple comme secours
            this.drawRocketShape(ctx, rocketState);
        }
        
        ctx.restore(); // Restaurer le contexte sans la rotation pour les vecteurs
        
        ctx.restore();
    }
    
    // Dessine une forme simple en secours si l'image n'est pas chargée
    drawRocketShape(ctx, rocketState) {
        const radius = ROCKET.WIDTH / 2;
        
        // Corps de la fusée
        ctx.fillStyle = '#CCCCCC';
        ctx.beginPath();
        ctx.moveTo(0, -radius * 2);
        ctx.lineTo(radius, radius);
        ctx.lineTo(-radius, radius);
        ctx.closePath();
        ctx.fill();
        
        // Détails de la fusée
        ctx.fillStyle = '#888888';
        ctx.fillRect(-radius * 0.8, radius * 0.5, radius * 1.6, radius * 0.5);
        
        // Réacteurs
        ctx.fillStyle = '#555555';
        ctx.fillRect(-radius * 0.6, radius, radius * 1.2, radius * 0.5);
    }

    // Activer/désactiver l'affichage des positions des propulseurs
    setShowThrusterPositions(enabled) {
        this.showThrusterPositions = enabled;
    }
} 