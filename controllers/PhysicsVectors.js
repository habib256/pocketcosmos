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
        this.totalAcceleration = { x: 0, y: 0 }; // Force calculée pour la visualisation
        // Note: La logique de calcul de this.totalAcceleration reste dans PhysicsController pour l'instant
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
     setTotalAcceleration(x, y) {
         this.totalAcceleration = { x, y };
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
        }

        // --- Dessiner le vecteur de force gravitationnelle ---
        if (this.totalAcceleration && (this.totalAcceleration.x !== 0 || this.totalAcceleration.y !== 0)) {
            // Afficher uniquement la direction (flèche de longueur fixe, sans texte)
            const gravityColor = '#FF00FF'; // Magenta
            const forceMagnitude = Math.sqrt(this.totalAcceleration.x**2 + this.totalAcceleration.y**2);
            if (forceMagnitude > 0) {
                const angle = Math.atan2(this.totalAcceleration.y, this.totalAcceleration.x);
                // Longueur fixe à l'écran (ex: 60 pixels)
                const fixedScreenLength = 60;
                const vectorLengthPreZoom = fixedScreenLength / camera.zoom;
                const endPreZoomX = rocketPreZoomX + Math.cos(angle) * vectorLengthPreZoom;
                const endPreZoomY = rocketPreZoomY + Math.sin(angle) * vectorLengthPreZoom;
                this.drawArrow(ctx, rocketPreZoomX, rocketPreZoomY, endPreZoomX, endPreZoomY, gravityColor, baseLineWidth, baseHeadLength, camera.zoom);
                // Ajouter la lettre 'A' à l'extrémité du vecteur
                ctx.save();
                ctx.font = `${baseFontSize / camera.zoom}px Arial`;
                ctx.fillStyle = gravityColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('A', endPreZoomX, endPreZoomY - 10 / camera.zoom);
                ctx.restore();
            }
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