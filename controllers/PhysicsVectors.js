class PhysicsVectors {
    constructor(physicsController, RENDER) {
        this.physicsController = physicsController; // Pour accéder à rocketBody, showForces etc.
        this.RENDER = RENDER;

        this.showForces = false;
        this.thrustForces = {
            main: { x: 0, y: 0 },
            rear: { x: 0, y: 0 },
            left: { x: 0, y: 0 },
            right: { x: 0, y: 0 }
        };
        this.gravityForce = { x: 0, y: 0 }; // Force calculée pour la visualisation
        // Note: La logique de calcul de this.gravityForce reste dans PhysicsController pour l'instant
        // car elle utilise this.celestialBodies qui n'est pas directement dans ce module.
        // On pourrait la déplacer ici si PhysicsVectors reçoit celestialBodies.
    }

    // Méthodes pour mettre à jour les forces depuis d'autres modules (ex: ThrusterPhysics)
    setThrustForce(thrusterName, x, y) {
        if (this.thrustForces[thrusterName]) {
            this.thrustForces[thrusterName] = { x, y };
        }
    }

    clearThrustForce(thrusterName) {
        if (this.thrustForces[thrusterName]) {
            this.thrustForces[thrusterName] = { x: 0, y: 0 };
        }
    }

     // Méthode pour mettre à jour la force de gravité depuis PhysicsController
     setGravityForceForDebug(x, y) {
         this.gravityForce = { x, y };
     }

    // Activer/désactiver l'affichage
    toggleForceVectors() {
        this.showForces = !this.showForces;
        console.log(`Affichage des vecteurs de force: ${this.showForces ? 'Activé' : 'Désactivé'}`);
        return this.showForces;
    }

    // Dessiner les vecteurs sur le canvas
    drawForceVectors(ctx, camera) {
        const rocketBody = this.physicsController.rocketBody;
        if (!this.showForces || !rocketBody || !camera) return;

        const baseScale = 0.02; // Échelle de base pour la force de poussée
        const minVectorScreenLength = 20; // Longueur minimale à l'écran
        const maxVectorScreenLength = 80; // Longueur maximale à l'écran
        const baseLineWidth = 1.5;
        const baseHeadLength = 8;
        const baseFontSize = 11;

        // Position de la fusée dans le système de coordonnées AVANT le zoom de la caméra
        const rocketPreZoomX = rocketBody.position.x - camera.x;
        const rocketPreZoomY = rocketBody.position.y - camera.y;

        // --- Dessiner les vecteurs de force des propulseurs ---
        for (const thrusterName in this.thrustForces) {
            const force = this.thrustForces[thrusterName];
            const forceMagnitude = Math.sqrt(force.x**2 + force.y**2);
            if (forceMagnitude === 0) continue;

            let color;
            switch (thrusterName) {
                case 'main': color = '#FF0000'; break; // Rouge
                case 'rear': color = '#00FF00'; break; // Vert
                case 'left': color = '#0000FF'; break; // Bleu
                case 'right': color = '#FFFF00'; break; // Jaune
                default: color = '#FFFFFF';
            }

            // Calculer la longueur souhaitée à l'écran, limitée
            let screenLength = forceMagnitude * baseScale;
            screenLength = Math.max(minVectorScreenLength, Math.min(screenLength, maxVectorScreenLength));

            // Convertir la longueur écran en longueur "pré-zoom"
            const vectorLengthPreZoom = screenLength / camera.zoom;

            // Calculer la position de fin "pré-zoom"
            const endPreZoomX = rocketPreZoomX + (force.x / forceMagnitude) * vectorLengthPreZoom;
            const endPreZoomY = rocketPreZoomY + (force.y / forceMagnitude) * vectorLengthPreZoom;

            // Dessiner la flèche avec les coordonnées et dimensions "pré-zoom"
            this.drawArrow(ctx, rocketPreZoomX, rocketPreZoomY, endPreZoomX, endPreZoomY, color, baseLineWidth, baseHeadLength, camera.zoom);
        }

        // --- Dessiner le vecteur de vitesse ---
        if (rocketBody.velocity && (rocketBody.velocity.x !== 0 || rocketBody.velocity.y !== 0)) {
            const velocityColor = '#00FFFF'; // Cyan
            const velocityMagnitude = Math.sqrt(rocketBody.velocity.x**2 + rocketBody.velocity.y**2);
            const velocityBaseScale = 0.1; // Échelle de base pour la vitesse

             // Calculer la longueur souhaitée à l'écran, limitée
             let screenLength = velocityMagnitude * velocityBaseScale;
             screenLength = Math.max(minVectorScreenLength, Math.min(screenLength, maxVectorScreenLength));

             // Convertir la longueur écran en longueur "pré-zoom"
            const vectorLengthPreZoom = screenLength / camera.zoom;

             // Calculer la position de fin "pré-zoom"
             const endPreZoomX = rocketPreZoomX + (rocketBody.velocity.x / velocityMagnitude) * vectorLengthPreZoom;
             const endPreZoomY = rocketPreZoomY + (rocketBody.velocity.y / velocityMagnitude) * vectorLengthPreZoom;

            // Dessiner la ligne et la pointe
            this.drawArrow(ctx, rocketPreZoomX, rocketPreZoomY, endPreZoomX, endPreZoomY, velocityColor, baseLineWidth, baseHeadLength, camera.zoom);

            // --- Afficher la magnitude (taille fixe à l'écran) ---
            ctx.font = `${baseFontSize / camera.zoom}px Arial`; // Taille de police "pré-zoom"
            const text = `V: ${velocityMagnitude.toFixed(1)} m/s`;
            const textMetrics = ctx.measureText(text); // Mesure dans le contexte actuel (transformé)
            const textWidthPreZoom = textMetrics.width; // La largeur mesurée est déjà la bonne en pré-zoom
            const textHeightPreZoom = baseFontSize / camera.zoom; // Hauteur approx "pré-zoom"
            const paddingPreZoom = 4 / camera.zoom;

            // Décalage pour le texte (constant à l'écran -> divisé par zoom pour pré-zoom)
            const textOffsetScreen = 5;
            const textOffsetXPreZoom = textOffsetScreen / camera.zoom;
            const textOffsetYPreZoom = textOffsetScreen / camera.zoom;

            // Position du texte "pré-zoom"
            const textPreZoomX = endPreZoomX + textOffsetXPreZoom;
            const textPreZoomY = endPreZoomY - textOffsetYPreZoom; // - car Y va vers le bas

            // Position et dimensions du fond "pré-zoom"
            const backgroundPreZoomX = textPreZoomX - paddingPreZoom;
            const backgroundPreZoomY = textPreZoomY - textHeightPreZoom; // Décalage pour aligner
            const backgroundWidthPreZoom = textWidthPreZoom + paddingPreZoom * 2;
            const backgroundHeightPreZoom = textHeightPreZoom + paddingPreZoom * 2;
            
            // Dessiner fond et texte avec coordonnées/dimensions "pré-zoom"
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; 
            ctx.fillRect(backgroundPreZoomX, backgroundPreZoomY, backgroundWidthPreZoom, backgroundHeightPreZoom);
            ctx.fillStyle = velocityColor;
            ctx.fillText(text, textPreZoomX, textPreZoomY);
        }

        // --- Dessiner le vecteur de force gravitationnelle ---
        if (this.gravityForce && (this.gravityForce.x !== 0 || this.gravityForce.y !== 0)) {
            const gravityColor = '#FF00FF'; // Magenta
            const forceMagnitude = Math.sqrt(this.gravityForce.x**2 + this.gravityForce.y**2);
            const angle = Math.atan2(this.gravityForce.y, this.gravityForce.x);

            // Échelle de base adaptative pour la gravité
            const gravityBaseScale = 0.00001 * Math.max(1, 50000 / forceMagnitude);

            // Calculer la longueur souhaitée à l'écran, limitée
            let screenLength = forceMagnitude * gravityBaseScale;
            screenLength = Math.max(minVectorScreenLength, Math.min(screenLength, maxVectorScreenLength));

            // Convertir la longueur écran en longueur "pré-zoom"
            const vectorLengthPreZoom = screenLength / camera.zoom;

            // Calculer la position de fin "pré-zoom"
            const endPreZoomX = rocketPreZoomX + Math.cos(angle) * vectorLengthPreZoom;
            const endPreZoomY = rocketPreZoomY + Math.sin(angle) * vectorLengthPreZoom;

            // Dessiner la ligne et la pointe
            this.drawArrow(ctx, rocketPreZoomX, rocketPreZoomY, endPreZoomX, endPreZoomY, gravityColor, baseLineWidth, baseHeadLength, camera.zoom);

            // --- Afficher la magnitude (taille fixe à l'écran) ---
            ctx.font = `${baseFontSize / camera.zoom}px Arial`; // Taille de police "pré-zoom"
            const text = `G: ${forceMagnitude.toFixed(1)}`;
            const textMetrics = ctx.measureText(text); // Mesure dans le contexte actuel (transformé)
            const textWidthPreZoom = textMetrics.width; // La largeur mesurée est déjà la bonne en pré-zoom
            const textHeightPreZoom = baseFontSize / camera.zoom; // Hauteur approx "pré-zoom"
            const paddingPreZoom = 4 / camera.zoom;

            // Décalage pour le texte (constant à l'écran -> divisé par zoom pour pré-zoom)
            const textOffsetScreen = 10;
            const textOffsetXPreZoom = (textOffsetScreen / camera.zoom) * Math.cos(angle);
            const textOffsetYPreZoom = (textOffsetScreen / camera.zoom) * Math.sin(angle);

            // Position du texte "pré-zoom"
            const textPreZoomX = endPreZoomX + textOffsetXPreZoom;
            const textPreZoomY = endPreZoomY + textOffsetYPreZoom;

             // Position et dimensions du fond "pré-zoom"
             const backgroundPreZoomX = textPreZoomX - paddingPreZoom;
             const backgroundPreZoomY = textPreZoomY - textHeightPreZoom; // Décalage pour aligner
             const backgroundWidthPreZoom = textWidthPreZoom + paddingPreZoom * 2;
             const backgroundHeightPreZoom = textHeightPreZoom + paddingPreZoom * 2;

            // Dessiner fond et texte avec coordonnées/dimensions "pré-zoom"
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(backgroundPreZoomX, backgroundPreZoomY, backgroundWidthPreZoom, backgroundHeightPreZoom);
            ctx.fillStyle = gravityColor;
            ctx.fillText(text, textPreZoomX, textPreZoomY);
        }
    }

    // Helper pour dessiner une flèche (utilise coordonnées pré-zoom, ajuste dimensions)
    drawArrow(ctx, preZoomFromX, preZoomFromY, preZoomToX, preZoomToY, color, desiredLineWidth, desiredHeadLength, zoom) {
        const angle = Math.atan2(preZoomToY - preZoomFromY, preZoomToX - preZoomFromX);

        // Dimensions ajustées ("pré-zoom") pour obtenir la taille écran désirée
        const actualLineWidth = desiredLineWidth / zoom;
        const actualHeadLength = desiredHeadLength / zoom;

        // Corps de la flèche (coordonnées pré-zoom, épaisseur pré-zoom)
        ctx.beginPath();
        ctx.moveTo(preZoomFromX, preZoomFromY);
        ctx.lineTo(preZoomToX, preZoomToY);
        ctx.strokeStyle = color;
        ctx.lineWidth = actualLineWidth; 
        ctx.stroke();

        // Pointe de la flèche (coordonnées pré-zoom, taille pré-zoom)
        ctx.beginPath();
        ctx.moveTo(preZoomToX, preZoomToY);
        ctx.lineTo(preZoomToX - actualHeadLength * Math.cos(angle - Math.PI / 6),
                   preZoomToY - actualHeadLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(preZoomToX - actualHeadLength * Math.cos(angle + Math.PI / 6),
                   preZoomToY - actualHeadLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
} 