class CelestialBodyView {
    constructor() {
        // Pas besoin de stocker d'images dans cette version
    }
    
    render(ctx, celestialBodyModel, camera) {
        if (!celestialBodyModel || !celestialBodyModel.position) {
            console.error("Modèle de corps céleste invalide", celestialBodyModel);
            return;
        }
        
        ctx.save();
        
        // Dessiner l'atmosphère si elle existe (en premier pour qu'elle soit derrière la planète)
        if (celestialBodyModel.atmosphere && celestialBodyModel.atmosphere.exists) {
            this.drawAtmosphere(ctx, celestialBodyModel, camera);
        }
        
        // Dessiner le corps céleste
        this.drawBody(ctx, celestialBodyModel, camera);
        
        // Dessiner les points cibles
        this.drawTargetPoints(ctx, celestialBodyModel, camera);
        
        // Dessiner les anneaux si le corps en possède
        if (celestialBodyModel.hasRings) {
            this.drawRings(ctx, celestialBodyModel, camera);
        }
        
        // Dessiner le nom du corps céleste
        this.drawName(ctx, celestialBodyModel, camera);
        
        ctx.restore();
    }
    
    drawBody(ctx, body, camera) {
        const screenPos = camera.worldToScreen(body.position.x, body.position.y);
        const screenRadius = body.radius * camera.zoom;

        // Effet spécial pour le Soleil : dégradé radial animé du orange au jaune
        if (body.name === 'Soleil') {
            // Utiliser le temps pour animer la couleur
            const now = Date.now() / 1000;
            // Oscille entre 0 et 1
            const t = (Math.sin(now * 1.2) + 1) / 2;
            // Interpolation entre orange et jaune
            const color1 = `rgb(${Math.round(255)},${Math.round(180 + 75 * t)},0)`; // orange -> jaune
            const color2 = `rgb(${Math.round(255)},${Math.round(220 + 35 * t)},${Math.round(40 * t)})`;
            const gradient = ctx.createRadialGradient(
                screenPos.x, screenPos.y, screenRadius * 0.2,
                screenPos.x, screenPos.y, screenRadius
            );
            gradient.addColorStop(0, color2);
            gradient.addColorStop(0.5, color1);
            gradient.addColorStop(1, '#FFB300');
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.shadowColor = color2;
            ctx.shadowBlur = 60 * camera.zoom;
            ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            // Dessiner le cercle principal du corps céleste
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
            ctx.fillStyle = body.color || '#3399FF'; // Utiliser la couleur du modèle ou une couleur par défaut
            ctx.fill();
        }
        // Ajouter un contour
        ctx.strokeStyle = this.getLighterColor(body.color || '#3399FF');
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    drawAtmosphere(ctx, body, camera) {
        const screenPos = camera.worldToScreen(body.position.x, body.position.y);
        const screenRadius = body.radius * camera.zoom;
        const screenAtmosphereHeight = body.atmosphere.height * camera.zoom;
        
        // Dessiner le cercle de l'atmosphère avec un remplissage
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius + screenAtmosphereHeight, 0, Math.PI * 2);
        
        // Ajouter un remplissage semi-transparent
        ctx.fillStyle = body.atmosphere.color || 'rgba(25, 35, 80, 0.2)';
        ctx.fill();
        
        // Ajouter un contour
        ctx.strokeStyle = body.atmosphere.color || 'rgba(25, 35, 80, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    drawRings(ctx, body, camera) {
        const screenPos = camera.worldToScreen(body.position.x, body.position.y);
        
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        
        // Créer un dégradé pour les anneaux
        const screenRadius = body.radius * camera.zoom;
        const gradient = ctx.createLinearGradient(0, -screenRadius * 2, 0, screenRadius * 2);
        gradient.addColorStop(0, 'rgba(200, 200, 200, 0.7)');
        gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.3)');
        gradient.addColorStop(1, 'rgba(200, 200, 200, 0.7)');
        
        // Dessiner les anneaux
        ctx.beginPath();
        ctx.ellipse(0, 0, screenRadius * 2, screenRadius * 0.5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = screenRadius * 0.2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawName(ctx, body, camera) {
        // Ne pas afficher le nom pour Phobos et Deimos
        if (body.name === 'Phobos' || body.name === 'Deimos') {
            return;
        }

        const screenPos = camera.worldToScreen(body.position.x, body.position.y);
        const fontSize = Math.max(12, 24 * camera.zoom);
        
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(body.name, screenPos.x, screenPos.y);
    }
    
    drawTargetPoints(ctx, body, camera) {
        if (!body.targetPoints || body.targetPoints.length === 0) {
            return; // Pas de points à dessiner
        }

        // Style des marqueurs
        const markerRadiusBase = 4; // Rayon de base du marqueur
        const markerColor = 'magenta';
        const labelColor = 'white';
        const labelFontSizeBase = 10;

        body.targetPoints.forEach(point => {
            // Calculer la position du point sur la surface en coordonnées monde
            const pointWorldX = body.position.x + body.radius * Math.cos(point.angle);
            const pointWorldY = body.position.y + body.radius * Math.sin(point.angle);

            // Convertir en coordonnées écran
            const screenPos = camera.worldToScreen(pointWorldX, pointWorldY);

            // Ajuster la taille en fonction du zoom (avec limites)
            const markerRadius = Math.max(1, Math.min(markerRadiusBase, markerRadiusBase * camera.zoom * 0.5));
            const labelFontSize = Math.max(6, Math.min(labelFontSizeBase, labelFontSizeBase * camera.zoom * 0.5));

            // Dessiner le marqueur (cercle)
            ctx.fillStyle = markerColor;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, markerRadius, 0, Math.PI * 2);
            ctx.fill();

            // Dessiner l'ID du point (seulement si assez zoomé)
            if (camera.zoom > 0.5) { // Seuil de zoom pour afficher le texte
                ctx.fillStyle = labelColor;
                ctx.font = `${labelFontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(point.id, screenPos.x, screenPos.y - markerRadius - 2); 
            }
        });
    }
    
    // Utilitaire pour éclaircir une couleur
    getLighterColor(hexColor) {
        // Convertir la couleur hex en RGB
        let r = parseInt(hexColor.substr(1, 2), 16);
        let g = parseInt(hexColor.substr(3, 2), 16);
        let b = parseInt(hexColor.substr(5, 2), 16);
        
        // Éclaircir la couleur
        r = Math.min(255, r + 40);
        g = Math.min(255, g + 40);
        b = Math.min(255, b + 40);
        
        // Reconvertir en hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
} 