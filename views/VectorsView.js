class VectorsView {
    constructor() {}

    computeGravityFieldGrid(ctx, camera, physicsController) {
        this.gridX = this.gridX || 50;
        this.gridY = this.gridY || 50;
        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;
        const G = physicsController.gravitationalConstant;
        const bodies = physicsController.celestialBodies; // Accès aux modèles

        this.gravityFieldGrid = [];
        let minPotential = Infinity;
        let maxPotential = -Infinity;
        for (let ix = 0; ix < gridX; ix++) {
            this.gravityFieldGrid[ix] = [];
            for (let iy = 0; iy < gridY; iy++) {
                // Coordonnées écran (centrées dans chaque maille)
                const sx = ix * stepX + stepX / 2;
                const sy = iy * stepY + stepY / 2;
                // Conversion écran -> monde
                const wx = (sx - camera.offsetX) / camera.zoom + camera.x;
                const wy = (sy - camera.offsetY) / camera.zoom + camera.y;
                // Calcul du champ de gravité ET du potentiel
                let ax = 0, ay = 0, potential = 0;
                for (const bodyInfo of bodies) {
                    const bodyModel = bodyInfo.model; // Utiliser le modèle pour la masse
                    const dx = bodyModel.position.x - wx;
                    const dy = bodyModel.position.y - wy;
                    const r2 = dx * dx + dy * dy;
                    if (r2 < 1e-6) continue; // Éviter division par zéro au centre
                    const r = Math.sqrt(r2);
                    const forceMag = G * bodyModel.mass / r2;
                    ax += forceMag * dx / r;
                    ay += forceMag * dy / r;
                    potential -= G * bodyModel.mass / r; // Potentiel V = -GM/r
                }
                this.gravityFieldGrid[ix][iy] = { ax, ay, wx, wy, potential };
                // Suivi min/max potentiel
                if (potential < minPotential) minPotential = potential;
                if (potential > maxPotential) maxPotential = potential;
            }
        }
        // Log de la plage de potentiel
        console.log(`[DEBUG][Grid] Plage de potentiel: [${minPotential.toExponential(2)}, ${maxPotential.toExponential(2)}]`);
    }

    // Méthode principale d'affichage
    render(ctx, rocketState, camera, options = {}) {
        if (!rocketState || !rocketState.position) return;
        ctx.save();
        // Affichage du champ de gravité (flèches ou lignes)
        if (options.showGravityField && options.physicsController) {
            // Calculer la grille de champ de gravité une fois par frame
            this.computeGravityFieldGrid(ctx, camera, options.physicsController);
            if (options.showGravityField === 'arrows') {
                this.renderGravityFieldArrows(ctx, camera, options.physicsController);
            } else if (options.showGravityField === 'lines') {
                this.renderEquipotentialLines(ctx, camera, options.physicsController);
            }
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

    // Affiche le champ de gravité sous forme de flèches sur une grille
    renderGravityFieldArrows(ctx, camera, physicsController) {
        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;
        for (let ix = 0; ix < gridX; ix++) {
            for (let iy = 0; iy < gridY; iy++) {
                // Coordonnées écran (centrées dans chaque maille)
                const sx = ix * stepX + stepX / 2;
                const sy = iy * stepY + stepY / 2;
                // Utiliser la grille pré-calculée
                const g = this.gravityFieldGrid && this.gravityFieldGrid[ix] && this.gravityFieldGrid[ix][iy]
                    ? this.gravityFieldGrid[ix][iy]
                    : { ax: 0, ay: 0 };
                const ax = g.ax, ay = g.ay;
                const a = Math.sqrt(ax * ax + ay * ay);
                if (a < 1e-8) continue;
                // Longueur de la flèche (adaptée à la maille écran)
                const scale = Math.min(2000 * a, Math.min(stepX, stepY) * 0.8);
                const dirX = ax / a, dirY = ay / a;
                // Position de départ et d'arrivée (en pixels écran)
                const ex = sx + dirX * scale;
                const ey = sy + dirY * scale;
                // Déterminer la couleur en fonction de la force de gravité 'a'
                let color;
                if (a < 0.00005) {
                    color = 'rgba(0,255,0,0.35)';
                } else if (a < 0.0003) {
                    const t = (a - 0.00005) / (0.0003 - 0.00005);
                    const r = Math.round(255 * t);
                    const g = 255;
                    color = `rgba(${r},255,0,0.35)`;
                } else if (a < 0.001) {
                    const t = (a - 0.0003) / (0.001 - 0.0003);
                    const r = 255;
                    const g = Math.round(255 * (1 - t) + 165 * t);
                    const b = 0;
                    color = `rgba(255,${g},${b},0.45)`;
                } else if (a < 0.003) {
                    const t = (a - 0.001) / (0.003 - 0.001);
                    const r = 255;
                    const g = Math.round(165 * (1 - t));
                    color = `rgba(255,${g},0,0.55)`;
                } else {
                    color = 'rgba(255,0,0,0.65)';
                }
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = color;
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
                ctx.fillStyle = color;
                ctx.fill();
                ctx.restore();
            }
        }
    }

    // Interpolation bilinéaire du champ de gravité à partir de la grille
    interpolateGravityField(x, y, camera, ctx) {
        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;
        // Convertir (x, y) monde en (sx, sy) écran
        const sx = (x - camera.x) * camera.zoom + camera.offsetX;
        const sy = (y - camera.y) * camera.zoom + camera.offsetY;
        // Trouver les indices de la grille
        const fx = Math.max(0, Math.min(gridX - 1, (sx - stepX / 2) / stepX));
        const fy = Math.max(0, Math.min(gridY - 1, (sy - stepY / 2) / stepY));
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        // Récupérer les 4 coins
        function get(ix, iy) {
            if (ix < 0 || iy < 0 || ix >= gridX || iy >= gridY) return { ax: 0, ay: 0 };
            return this.gravityFieldGrid[ix][iy];
        }
        const g00 = get.call(this, ix, iy);
        const g10 = get.call(this, ix + 1, iy);
        const g01 = get.call(this, ix, iy + 1);
        const g11 = get.call(this, ix + 1, iy + 1);
        // Interpolation bilinéaire
        const ax = (1 - tx) * (1 - ty) * g00.ax + tx * (1 - ty) * g10.ax + (1 - tx) * ty * g01.ax + tx * ty * g11.ax;
        const ay = (1 - tx) * (1 - ty) * g00.ay + tx * (1 - ty) * g10.ay + (1 - tx) * ty * g01.ay + tx * ty * g11.ay;
        return { ax, ay };
    }

    // Nouvelle méthode : lignes équipotentielles avec Marching Squares
    renderEquipotentialLines(ctx, camera, physicsController) {
        if (!this.gravityFieldGrid || !this.gravityFieldGrid[0] || !this.gravityFieldGrid[0][0]) return;
        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;

        // Récupérer les corps célestes pour le masquage DEPUIS L'ARGUMENT
        const bodies = physicsController ? physicsController.celestialBodies : [];

        // Récupérer la plage de potentiel calculée
        let minPotential = Infinity;
        let maxPotential = -Infinity;
        for (let ix = 0; ix < gridX; ix++) {
            for (let iy = 0; iy < gridY; iy++) {
                const p = this.gravityFieldGrid[ix][iy].potential;
                if (p < minPotential) minPotential = p;
                if (p > maxPotential && isFinite(p)) maxPotential = p; // Ignorer Infinity potentiel au centre exact
            }
        }

        // Générer des isovaleurs dynamiquement dans la plage (échelle log)
        const numLevels = 50; // Augmenté pour plus de densité
        const isovalues = [];
        if (minPotential < maxPotential && maxPotential < 0) { // Assure que les valeurs sont valides et négatives
             // Utiliser une échelle log basée sur la magnitude
            const logMin = Math.log10(-maxPotential); // Log de la magnitude max (potentiel le moins négatif)
            const logMax = Math.log10(-minPotential); // Log de la magnitude min (potentiel le plus négatif)
            for (let i = 1; i <= numLevels; i++) {
                const logVal = logMin + (logMax - logMin) * (i / (numLevels + 1));
                isovalues.push(-Math.pow(10, logVal));
            }
        }
        // Fallback linéaire si log scale échoue
         if (isovalues.length === 0 && minPotential < maxPotential) {
             for (let i = 1; i <= numLevels; i++) {
                 isovalues.push(minPotential + (maxPotential - minPotential) * (i / (numLevels + 1)));
             }
         }

        console.log(`[DEBUG][Equipotentials] Plage: [${minPotential.toExponential(2)}, ${maxPotential.toExponential(2)}], Isovaleurs:`, isovalues.map(v => v.toExponential(2)));

        // Fonction d'interpolation linéaire pour trouver où une isovaleur coupe une arête
        const interpolate = (p1, p2, val) => {
            if (Math.abs(val - p1.potential) < 1e-6) return { x: p1.wx, y: p1.wy };
            if (Math.abs(val - p2.potential) < 1e-6) return { x: p2.wx, y: p2.wy };
            if (Math.abs(p1.potential - p2.potential) < 1e-6) return { x: p1.wx, y: p1.wy }; // Évite division par zéro
            const t = (val - p1.potential) / (p2.potential - p1.potential);
            return {
                x: p1.wx + t * (p2.wx - p1.wx),
                y: p1.wy + t * (p2.wy - p1.wy)
            };
        };

        // Fonction pour vérifier si un point (monde) est dans un corps, AVEC MARGE
        const isPointInsideBodyWithMargin = (point, marginFactor = 1.01) => {
            for (const bodyInfo of bodies) {
                const bodyModel = bodyInfo.model;
                const effectiveRadiusSq = (bodyModel.radius * marginFactor)**2;
                const distSq = (point.x - bodyModel.position.x)**2 + (point.y - bodyModel.position.y)**2;
                if (distSq < effectiveRadiusSq) {
                    return true;
                }
            }
            return false;
        };

        ctx.save();
        ctx.lineWidth = 1.5; // Gardons une épaisseur constante pour l'instant

        for (let i = 0; i < isovalues.length; i++) {
            const isovalue = isovalues[i];
            // Déterminer la couleur en fonction de la valeur normalisée de l'isovaleur
            const t = (i / (isovalues.length - 1)); // Normalisé 0..1
            const hue = 180 + t * 60; // Gradient de 180 (cyan) à 240 (bleu)
            ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.7)`; // Utilisation de HSL pour un gradient facile

            ctx.beginPath(); // Commencer un nouveau chemin pour chaque couleur
            for (let ix = 0; ix < gridX - 1; ix++) {
                for (let iy = 0; iy < gridY - 1; iy++) {
                    // Coins de la cellule (ordre: bas-gauche, bas-droite, haut-droite, haut-gauche)
                    const p0 = this.gravityFieldGrid[ix][iy];
                    const p1 = this.gravityFieldGrid[ix + 1][iy];
                    const p2 = this.gravityFieldGrid[ix + 1][iy + 1];
                    const p3 = this.gravityFieldGrid[ix][iy + 1];

                    // Calculer le code Marching Squares (1 si > isovalue, 0 sinon)
                    let squareIndex = 0;
                    if (p0.potential < isovalue) squareIndex |= 1;
                    if (p1.potential < isovalue) squareIndex |= 2;
                    if (p2.potential < isovalue) squareIndex |= 4;
                    if (p3.potential < isovalue) squareIndex |= 8;

                    // Tracer les segments selon le cas (lookup table implicite)
                    let v1, v2, v3, v4;
                    switch (squareIndex) {
                        // Cas à 1 ligne
                        case 1: case 14: v1 = interpolate(p0, p3, isovalue); v2 = interpolate(p0, p1, isovalue); break;
                        case 2: case 13: v1 = interpolate(p0, p1, isovalue); v2 = interpolate(p1, p2, isovalue); break;
                        case 3: case 12: v1 = interpolate(p0, p3, isovalue); v2 = interpolate(p1, p2, isovalue); break;
                        case 4: case 11: v1 = interpolate(p1, p2, isovalue); v2 = interpolate(p2, p3, isovalue); break;
                        case 6: case 9:  v1 = interpolate(p0, p1, isovalue); v2 = interpolate(p2, p3, isovalue); break;
                        case 7: case 8:  v1 = interpolate(p0, p3, isovalue); v2 = interpolate(p2, p3, isovalue); break;
                        // Cas à 2 lignes (ambigus, traités simplement ici)
                        case 5:  v1 = interpolate(p0, p3, isovalue); v2 = interpolate(p0, p1, isovalue); v3 = interpolate(p1, p2, isovalue); v4 = interpolate(p2, p3, isovalue); break;
                        case 10: v1 = interpolate(p0, p1, isovalue); v2 = interpolate(p2, p3, isovalue); v3 = interpolate(p0, p3, isovalue); v4 = interpolate(p1, p2, isovalue); break;
                    }

                    // Dessiner les segments
                    if (v1 && v2) {
                        // Vérifier les extrémités ET le point milieu AVEC MARGE
                        const midPoint = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
                        const shouldDraw = !isPointInsideBodyWithMargin(v1) && !isPointInsideBodyWithMargin(v2) && !isPointInsideBodyWithMargin(midPoint);

                        // Ne dessiner que si les deux points ET le milieu sont hors des corps (avec marge)
                        if (shouldDraw) {
                            const s1 = camera.worldToScreen(v1.x, v1.y);
                            const s2 = camera.worldToScreen(v2.x, v2.y);
                            ctx.moveTo(s1.x, s1.y);
                            ctx.lineTo(s2.x, s2.y);
                        }
                    }
                    if (v3 && v4) { // Pour les cas ambigus
                         // Vérifier les extrémités ET le point milieu AVEC MARGE
                         const midPoint = { x: (v3.x + v4.x) / 2, y: (v3.y + v4.y) / 2 };
                         const shouldDraw = !isPointInsideBodyWithMargin(v3) && !isPointInsideBodyWithMargin(v4) && !isPointInsideBodyWithMargin(midPoint);

                         // Ne dessiner que si les deux points ET le milieu sont hors des corps (avec marge)
                        if (shouldDraw) {
                            const s3 = camera.worldToScreen(v3.x, v3.y);
                            const s4 = camera.worldToScreen(v4.x, v4.y);
                            ctx.moveTo(s3.x, s3.y);
                            ctx.lineTo(s4.x, s4.y);
                        }
                    }
                }
            }
            ctx.stroke(); // Tracer le chemin pour cette isovaleur avec sa couleur
        }
        ctx.restore();
    }
}

// Export (si module)
// export default VectorsView; 