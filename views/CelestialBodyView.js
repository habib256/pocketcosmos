/**
 * Classe responsable du rendu visuel d'un corps céleste individuel (planète, lune, soleil) sur le canvas.
 * Prend en entrée un modèle de données (`celestialBodyModel`) et un objet caméra pour gérer les transformations de coordonnées et le zoom.
 */
class CelestialBodyView {
    // Le constructeur vide a été supprimé car inutile.
    
    /**
     * Point d'entrée principal pour dessiner un corps céleste et ses composants (atmosphère, anneaux, nom).
     * @param {CanvasRenderingContext2D} ctx - Le contexte de dessin du canvas.
     * @param {object} celestialBodyModel - Le modèle de données contenant les propriétés du corps céleste (position, radius, color, name, hasRings, atmosphere).
     * @param {Camera} camera - L'objet caméra pour la transformation des coordonnées monde/écran et la gestion du zoom.
     */
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
    
    /**
     * Dessine le corps céleste principal (cercle ou effet spécial pour le Soleil).
     * @param {CanvasRenderingContext2D} ctx - Le contexte de dessin.
     * @param {object} body - Le modèle de données du corps céleste.
     * @param {Camera} camera - L'objet caméra.
     */
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
    
    /**
     * Dessine l'atmosphère du corps céleste si elle existe.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de dessin.
     * @param {object} body - Le modèle de données du corps céleste.
     * @param {Camera} camera - L'objet caméra.
     */
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
    
    /**
     * Dessine les anneaux du corps céleste s'il en possède.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de dessin.
     * @param {object} body - Le modèle de données du corps céleste.
     * @param {Camera} camera - L'objet caméra.
     */
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
    
    /**
     * Dessine le nom du corps céleste au centre de celui-ci.
     * Exclut spécifiquement Phobos et Deimos.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de dessin.
     * @param {object} body - Le modèle de données du corps céleste.
     * @param {Camera} camera - L'objet caméra.
     */
    drawName(ctx, body, camera) {
        if (window.UI_STATE && window.UI_STATE.hideBodyNames) {
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
    
    /**
     * Fonction utilitaire pour calculer une version légèrement plus claire d'une couleur hexadécimale.
     * Utilisée pour le contour des corps célestes.
     * @param {string} hexColor - La couleur au format hexadécimal (ex: '#FF0000').
     * @returns {string} La couleur éclaircie au format hexadécimal.
     */
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