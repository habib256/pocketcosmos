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

        // Dessiner le cercle principal du corps céleste
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = body.color || '#3399FF'; // Utiliser la couleur du modèle ou une couleur par défaut
        ctx.fill();
        
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