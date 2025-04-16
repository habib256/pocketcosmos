class VectorsView {
    constructor() {}

    // Méthode principale d'affichage
    render(ctx, rocketState, camera, options = {}) {
        if (!rocketState || !rocketState.position) return;
        ctx.save();
        // Affichage du champ de gravité (grille 50x50, adaptatif au zoom)
        if (options.showGravityField && options.physicsController) {
            this.renderGravityField(ctx, camera, options.physicsController);
        }
        // Se placer au centre de la fusée pour les autres vecteurs
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
        ctx.translate(rocketState.position.x, rocketState.position.y);

        // Vecteur de poussée totale
        if (options.showTotalThrustVector && rocketState.totalThrustVector) {
            const mag = Math.sqrt(rocketState.totalThrustVector.x ** 2 + rocketState.totalThrustVector.y ** 2);
            const scale = 40; // facteur d'échelle pour la lisibilité
            let length = mag * scale;
            length = Math.max(20, Math.min(length, 100));
            this.drawVector(ctx, rocketState.totalThrustVector, '#FF0000', 'Poussée', length);
        }
        // Vecteur de vitesse
        if (options.showVelocityVector && rocketState.velocity) {
            this.drawVector(ctx, rocketState.velocity, 'rgba(255,100,100,0.5)', 'V', 100);
        }
        // Vecteur d'accélération
        if (options.showAccelerationVector && rocketState.accelerationVector) {
            // This line is removed as per the instructions
        }
        // Vecteur d'accélération totale (somme des forces F/m)
        if (options.showTotalAccelerationVector && rocketState.accelerationVector) {
            console.log('[DEBUG][VectorsView] accelerationVector reçu pour affichage:', rocketState.accelerationVector);
            const mag = Math.sqrt(rocketState.accelerationVector.x ** 2 + rocketState.accelerationVector.y ** 2);
            const scale = 1000; // facteur d'échelle pour la lisibilité (accélération souvent petite)
            let length = mag * scale;
            length = Math.max(20, Math.min(length, 100));
            this.drawVector(ctx, rocketState.accelerationVector, '#FFA500', 'a=F/m', length);
        }
        // Vecteur d'attraction lunaire
        if (options.showLunarAttractionVector && rocketState.lunarAttractionVector) {
            this.drawVector(ctx, rocketState.lunarAttractionVector, '#E0A0FF', 'Lune', 80, rocketState.lunarDistance);
        }
        // Vecteur d'attraction terrestre
        if (options.showEarthAttractionVector && rocketState.earthAttractionVector) {
            this.drawVector(ctx, rocketState.earthAttractionVector, '#00FF00', 'Terre', 80, rocketState.earthDistance);
        }
        // Vecteurs de mission
        if (options.showMissionStartVector && rocketState.missionStartVector && rocketState.missionStartVector.vector) {
            const v = rocketState.missionStartVector.vector;
            const norm = Math.sqrt(v.x * v.x + v.y * v.y);
            if (norm > 0.01) {
                const scale = 0.05; // Ajuster pour la lisibilité
                const len = Math.max(30, Math.min(norm * scale, 100));
                const dir = { x: v.x / norm, y: v.y / norm };
                this.drawVector(ctx, rocketState.position, dir, len, 'blue', 'Départ', camera); // Changé en bleu
            }
        }
        if (options.showMissionTargetVector && rocketState.missionTargetVector && rocketState.missionTargetVector.vector) {
            const v = rocketState.missionTargetVector.vector;
            const norm = Math.sqrt(v.x * v.x + v.y * v.y);
            if (norm > 0.01) {
                const scale = 0.05;
                const len = Math.max(30, Math.min(norm * scale, 100));
                const dir = { x: v.x / norm, y: v.y / norm };
                this.drawVector(ctx, rocketState.position, dir, len, 'gold', 'Destination', camera); // Déjà en or (gold)
            }
        }
        // Vecteurs de poussée individuels
        if (options.showThrustVector && rocketState.thrustVectors) {
            for (const thrusterName in rocketState.thrustVectors) {
                const thrustVector = rocketState.thrustVectors[thrusterName];
                if (thrustVector.magnitude > 0) {
                    let color = '#FFFFFF';
                    switch (thrusterName) {
                        case 'main': color = '#FF5500'; break;
                        case 'rear': color = '#FF8800'; break;
                        case 'left': color = '#FFAA00'; break;
                        case 'right': color = '#FFAA00'; break;
                    }
                    this.drawVector(ctx, thrustVector, color, thrusterName, 60, null, thrustVector.position);
                }
            }
        }
        ctx.restore();
    }

    // Helper pour dessiner un vecteur
    drawVector(ctx, vector, color, label, length = 80, distance = null, origin = {x:0, y:0}) {
        const vx = vector.x, vy = vector.y;
        const mag = Math.sqrt(vx*vx + vy*vy);
        if (mag < 1e-6) return;
        const dirX = vx / mag, dirY = vy / mag;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x + dirX * length, origin.y + dirY * length);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        // Flèche
        const arrowSize = 10;
        const angle = Math.atan2(dirY, dirX);
        ctx.beginPath();
        ctx.moveTo(origin.x + dirX * length, origin.y + dirY * length);
        ctx.lineTo(origin.x + dirX * length - arrowSize * Math.cos(angle - Math.PI/6), origin.y + dirY * length - arrowSize * Math.sin(angle - Math.PI/6));
        ctx.lineTo(origin.x + dirX * length - arrowSize * Math.cos(angle + Math.PI/6), origin.y + dirY * length - arrowSize * Math.sin(angle + Math.PI/6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        // Label
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        let labelText = label;
        if (distance !== null && distance !== undefined) labelText += ' ' + Math.floor(distance);
        ctx.fillText(labelText, origin.x + dirX * length + dirX * 15, origin.y + dirY * length + dirY * 15);
        ctx.restore();
    }

    // Affiche le champ de gravité sur une grille 50x50, adaptée au zoom
    renderGravityField(ctx, camera, physicsController) {
        const gridX = 50;
        const gridY = 50;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;
        for (let ix = 0; ix < gridX; ix++) {
            for (let iy = 0; iy < gridY; iy++) {
                // Coordonnées écran (centrées dans chaque maille)
                const sx = ix * stepX + stepX / 2;
                const sy = iy * stepY + stepY / 2;
                // Conversion écran -> monde
                const wx = (sx - camera.offsetX) / camera.zoom + camera.x;
                const wy = (sy - camera.offsetY) / camera.zoom + camera.y;
                // Calcul du champ de gravité à ce point
                const g = physicsController.calculateGravityAtPoint(wx, wy);
                const ax = g.ax, ay = g.ay;
                const a = Math.sqrt(ax * ax + ay * ay);
                if (a < 1e-8) continue;
                // Longueur de la flèche (adaptée à la maille écran)
                const scale = Math.min(2000 * a, Math.min(stepX, stepY) * 0.8);
                const dirX = ax / a, dirY = ay / a;
                // Position de départ et d'arrivée (en pixels écran)
                const ex = sx + dirX * scale;
                const ey = sy + dirY * scale;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = '#FF00FF';
                ctx.lineWidth = 1;
                ctx.stroke();
                // Pointe de flèche
                const angle = Math.atan2(ey - sy, ex - sx);
                const headlen = 8;
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI/6), ey - headlen * Math.sin(angle - Math.PI/6));
                ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI/6), ey - headlen * Math.sin(angle + Math.PI/6));
                ctx.closePath();
                ctx.fillStyle = '#FF00FF';
                ctx.fill();
                ctx.restore();
            }
        }
    }
}

// Export (si module)
// export default VectorsView; 