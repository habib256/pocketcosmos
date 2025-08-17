/**
 * @class VectorsView
 * Responsable de l'affichage de toutes les visualisations vectorielles et des champs physiques (gravité).
 * Centralise le rendu des vecteurs de poussée, vitesse, accélération, gravité, mission,
 * ainsi que l'affichage du champ gravitationnel (flèches ou lignes équipotentielles).
 * Cette classe lit l'état (fusée, caméra, physique) mais ne le modifie pas.
 */
class VectorsView {
    /**
     * Constructeur de VectorsView.
     * Initialise les propriétés pour la grille de calcul du champ de gravité.
     */
    constructor() {
        /** @private @type {number} Nombre de cellules horizontales pour la grille de gravité. */
        this.gridX = 80;
        /** @private @type {number} Nombre de cellules verticales pour la grille de gravité. */
        this.gridY = 80;
        /** @private @type {Array<Array<{ax: number, ay: number, wx: number, wy: number, potential: number}>> | null} Grille contenant le champ de gravité (accélération ax, ay) et le potentiel scalaire (potential) calculés aux coordonnées monde (wx, wy) de chaque point de la grille. Recalculée à chaque frame si l'affichage du champ est actif. */
        this.gravityFieldGrid = null;
        /** @private @type {number} Timestamp du dernier calcul de grille pour throttle. */
        this._lastGridComputeTime = 0;
        /** @private @type {number} Délai minimal (ms) entre deux recalculs de grille. */
        this._gridComputeIntervalMs = 150; // Throttle léger
        /** @private */
        this._lastCameraSignature = null; // Pour cache basique (zoom/offset)
    }

    /**
     * Calcule le champ de gravité et le potentiel gravitationnel sur une grille couvrant la vue actuelle.
     * Stocke le résultat dans `this.gravityFieldGrid`.
     * @param {CanvasRenderingContext2D} ctx - Contexte du canvas pour obtenir les dimensions.
     * @param {Camera} camera - Objet caméra pour la conversion écran <-> monde.
     * @param {PhysicsController} physicsController - Pour accéder aux corps célestes et à la constante G.
     * @private
     */
    computeGravityFieldGrid(ctx, camera, physicsController) {
        // Throttle/reuse: ne recalculer que si la caméra a sensiblement changé ou si intervalle écoulé
        const now = performance && performance.now ? performance.now() : Date.now();
        const sig = `${camera.x.toFixed(1)}|${camera.y.toFixed(1)}|${camera.zoom.toFixed(3)}|${ctx.canvas.width}|${ctx.canvas.height}`;
        const canReuse = this.gravityFieldGrid && this._lastCameraSignature === sig && (now - this._lastGridComputeTime) < this._gridComputeIntervalMs;
        if (canReuse) {
            return; // Réutiliser la grille existante
        }
        this._lastCameraSignature = sig;
        this._lastGridComputeTime = now;
        // Note: Recalculer cette grille à chaque frame peut être coûteux en performances,
        // surtout avec de nombreux corps célestes. Optimisations possibles si nécessaire.
        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;
        const G = physicsController.gravitationalConstant;
        const bodies = physicsController.celestialBodies; // Accès aux modèles de corps célestes

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

                // Calcul du champ de gravité (accélération) ET du potentiel V = -GM/r
                let ax = 0, ay = 0, potential = 0;
                for (const bodyInfo of bodies) {
                    const bodyModel = bodyInfo.model; // Utiliser le modèle pour la masse et position
                    const dx = bodyModel.position.x - wx;
                    const dy = bodyModel.position.y - wy;
                    const r2 = dx * dx + dy * dy;

                    // Éviter division par zéro et calculs inutiles très loin
                    if (r2 < 1e-6) continue;

                    const r = Math.sqrt(r2);
                    const forceMagOverMass = G * bodyModel.mass / r2; // C'est l'accélération g = GM/r^2
                    ax += forceMagOverMass * dx / r; // Composante x de l'accélération
                    ay += forceMagOverMass * dy / r; // Composante y de l'accélération
                    potential -= G * bodyModel.mass / r; // Potentiel V = -GM/r (somme des potentiels)
                }
                this.gravityFieldGrid[ix][iy] = { ax, ay, wx, wy, potential };

                // Suivi min/max potentiel pour la normalisation/coloration des lignes équipotentielles
                if (potential < minPotential) minPotential = potential;
                // Ignorer les potentiels infinis qui peuvent survenir au centre exact d'un corps (si r2 ~ 0)
                if (potential > maxPotential && isFinite(potential)) maxPotential = potential;
            }
        }
        // Log de la plage de potentiel retiré (anciennement [DEBUG][Grid])
    }

    /**
     * Méthode de rendu principale pour tous les vecteurs et visualisations de champ.
     * Appelé à chaque frame par le RenderingController.
     * @param {CanvasRenderingContext2D} ctx - Contexte du canvas.
     * @param {object} rocketState - État actuel de la fusée (position, vitesse, etc.).
     * @param {Camera} camera - Objet caméra pour la transformation des coordonnées.
     * @param {object} [options={}] - Options d'affichage (ex: { showVelocityVector: true, showGravityField: 'arrows', physicsController: pc }).
     * @param {boolean} [options.showTotalThrustVector] - Afficher le vecteur de poussée totale résultante.
     * @param {boolean} [options.showVelocityVector] - Afficher le vecteur vitesse.
     * @param {boolean} [options.showTotalAccelerationVector] - Afficher le vecteur d'accélération totale (F/m).
     * @param {boolean} [options.showLunarAttractionVector] - Afficher le vecteur d'attraction lunaire.
     * @param {boolean} [options.showEarthAttractionVector] - Afficher le vecteur d'attraction terrestre.
     * @param {boolean} [options.showMissionStartVector] - Afficher le vecteur vers le départ de la mission.
     * @param {boolean} [options.showMissionTargetVector] - Afficher le vecteur vers la cible de la mission.
     * @param {boolean} [options.showThrustVector] - Afficher les vecteurs de poussée individuels.
     * @param {'arrows' | 'lines' | false} [options.showGravityField] - Afficher le champ de gravité ('arrows', 'lines') ou non (false).
     * @param {PhysicsController} [options.physicsController] - Requis si showGravityField est actif.
     */
    render(ctx, rocketState, camera, options = {}) {
        if (!rocketState || !rocketState.position) return; // Vérification minimale

        ctx.save();

        // 1. Affichage du champ de gravité (optionnel, potentiellement coûteux)
        if (options.showGravityField && options.physicsController) {
            // Calculer la grille de champ/potentiel (si non déjà fait ou si la vue a changé significativement)
            // Pour l'instant, on recalcule à chaque frame où c'est visible.
            this.computeGravityFieldGrid(ctx, camera, options.physicsController);

            if (options.showGravityField === 'arrows') {
                this.renderGravityFieldArrows(ctx, camera, options.physicsController);
            } else if (options.showGravityField === 'lines') {
                this.renderEquipotentialLines(ctx, camera, options.physicsController);
            }
        }

        // 2. Se positionner relativement à la fusée pour les autres vecteurs
        ctx.translate(camera.offsetX, camera.offsetY);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);
        // Le point (0,0) du contexte est maintenant le centre de la fusée dans le monde
        ctx.translate(rocketState.position.x, rocketState.position.y);

        // --- Affichage des vecteurs relatifs à la fusée ---
        // Note: Les échelles et longueurs max sont souvent définies ici pour la lisibilité à l'écran,
        // elles peuvent différer des constantes RENDER qui sont parfois des facteurs généraux.

        // Vecteur de poussée totale
        if (options.showTotalThrustVector && rocketState.totalThrustVector) {
            const mag = Math.sqrt(rocketState.totalThrustVector.x ** 2 + rocketState.totalThrustVector.y ** 2);
            // Échelle arbitraire pour la visualisation de la poussée totale
            const scale = 40;
            let length = mag * scale;
            // Limiter la longueur pour éviter des vecteurs trop grands/petits
            length = Math.max(20, Math.min(length, 100));
            this.drawVector(ctx, rocketState.totalThrustVector, '#FF0000', 'Poussée', length);
        }

        // Vecteur de vitesse
        if (options.showVelocityVector && rocketState.velocity) {
            // Utilise une longueur max fixe pour ce vecteur (100 pixels)
            this.drawVector(ctx, rocketState.velocity, 'rgba(255,100,100,0.5)', 'V', 100);
        }

        // Vecteur d'accélération totale (somme des forces F/m)
        // 'accelerationVector' contient la somme de l'accélération gravitationnelle et de la poussée / masse.
        if (options.showTotalAccelerationVector && rocketState.accelerationVector) {
            // Log de débogage retiré
            const mag = Math.sqrt(rocketState.accelerationVector.x ** 2 + rocketState.accelerationVector.y ** 2);
            // L'accélération est souvent petite, on utilise une échelle plus grande
            const scale = 1000;
            let length = mag * scale;
            length = Math.max(20, Math.min(length, 100)); // Limiter la longueur
            this.drawVector(ctx, rocketState.accelerationVector, '#FFA500', 'a=F/m', length);
        }

        // // Vecteur d'attraction lunaire (supprimé à la demande)
        // if (options.showLunarAttractionVector && !options.showMissionTargetVector && rocketState.lunarAttractionVector) {
        //     this.drawVector(ctx, rocketState.lunarAttractionVector, '#E0A0FF', 'Lune', 80, rocketState.lunarDistance);
        // }

        // Vecteur d'attraction terrestre (si calculé et fourni)
        if (options.showEarthAttractionVector && !options.showMissionStartVector && rocketState.earthAttractionVector) {
            // Affiche aussi la distance dans le label
            this.drawVector(ctx, rocketState.earthAttractionVector, '#00FF00', 'Terre', 80, rocketState.earthDistance);
        }

        // Vecteurs de mission (pointant de la fusée vers départ/destination)
        // Note: La structure attendue est { vector: {x, y}, ... }
        if (options.showMissionStartVector && rocketState.missionStartVector && rocketState.missionStartVector.vector) {
            const v = rocketState.missionStartVector.vector;
            const norm = Math.sqrt(v.x * v.x + v.y * v.y);
            if (norm > 0.01) { // Éviter division par zéro et dessin inutile
                const fixedLength = 80; // Longueur fixe pour l'affichage
                const dir = { x: v.x / norm, y: v.y / norm };
                // Le vecteur 'v' pointe de la fusée vers le point de départ. On dessine donc dans cette direction.
                // L'origine est la fusée (0,0 dans ce contexte transformé)
                // Changé en "Origin", couleur bleu clair, et ajout de la distance
                this.drawVector(ctx, dir, '#ADD8E6', 'Orig', fixedLength, rocketState.missionStartVector.distance);
            }
        }
        if (options.showMissionTargetVector && rocketState.missionTargetVector && rocketState.missionTargetVector.vector) {
            const v = rocketState.missionTargetVector.vector;
            const norm = Math.sqrt(v.x * v.x + v.y * v.y);
            if (norm > 0.01) { // Éviter division par zéro et dessin inutile
                const fixedLength = 80; // Longueur fixe pour l'affichage
                const dir = { x: v.x / norm, y: v.y / norm };
                 // Le vecteur 'v' pointe de la fusée vers la cible. On dessine dans cette direction.
                // Ajout de la distance au vecteur Destination
                this.drawVector(ctx, dir, 'gold', 'Dest', fixedLength, rocketState.missionTargetVector.distance);
            }
        }

        // Vecteurs de poussée individuels (si actifs)
        if (options.showThrustVector && rocketState.thrustVectors) {
            for (const thrusterName in rocketState.thrustVectors) {
                const thrustData = rocketState.thrustVectors[thrusterName];
                // On s'attend à ce que thrustData contienne { vector: {x, y}, magnitude: M, position: {x, y} }
                // où position est relative au centre de la fusée.
                if (thrustData.magnitude > 0 && thrustData.vector) {
                    let color = '#FFFFFF'; // Couleur par défaut
                    switch (thrusterName) {
                        case 'main': color = '#FF5500'; break;
                        case 'rear': color = '#FF8800'; break;
                        case 'left': color = '#FFAA00'; break;
                        case 'right': color = '#FFAA00'; break;
                    }
                    // La longueur est fixe pour la visualisation des propulseurs actifs
                    const displayLength = 60;
                    // L'origine du vecteur est la position du propulseur sur la fusée
                    this.drawVector(ctx, thrustData.vector, color, thrusterName, displayLength, null, thrustData.position);
                }
            }
        }

        ctx.restore(); // Rétablir l'état du contexte (transformations, styles)
    }

    /**
     * Fonction utilitaire pour dessiner un vecteur avec une flèche et un label.
     * @param {CanvasRenderingContext2D} ctx - Contexte du canvas.
     * @param {{x: number, y: number}} vector - Le vecteur à dessiner (direction et magnitude).
     * @param {string} color - Couleur du vecteur et du label.
     * @param {string} label - Texte à afficher près de la pointe du vecteur.
     * @param {number} [length=80] - Longueur d'affichage du vecteur en pixels. La magnitude réelle du vecteur n'est utilisée que pour la direction.
     * @param {number | null} [distance=null] - Si fourni, ajoute cette valeur (arrondie) au label.
     * @param {{x: number, y: number}} [origin={x:0, y:0}] - Point d'origine du vecteur, relatif au contexte actuel (par défaut {0,0}).
     * @private
     */
    drawVector(ctx, vector, color, label, length = 80, distance = null, origin = {x:0, y:0}) {
        const vx = vector.x, vy = vector.y;
        const mag = Math.sqrt(vx*vx + vy*vy);

        // Ne rien dessiner si le vecteur est nul (ou presque)
        if (mag < 1e-6) return;

        // Normaliser pour obtenir la direction
        const dirX = vx / mag;
        const dirY = vy / mag;

        ctx.save(); // Sauvegarder l'état (styles, transformations)

        // Ligne du vecteur
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x + dirX * length, origin.y + dirY * length);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();

        // Pointe de la flèche
        const arrowSize = 10; // Taille de la pointe en pixels
        const angle = Math.atan2(dirY, dirX); // Angle du vecteur
        ctx.beginPath();
        // Pointe de la flèche à l'extrémité
        ctx.moveTo(origin.x + dirX * length, origin.y + dirY * length);
        // Calcul des deux autres points de la flèche triangulaire
        ctx.lineTo(origin.x + dirX * length - arrowSize * Math.cos(angle - Math.PI/6), origin.y + dirY * length - arrowSize * Math.sin(angle - Math.PI/6));
        ctx.lineTo(origin.x + dirX * length - arrowSize * Math.cos(angle + Math.PI/6), origin.y + dirY * length - arrowSize * Math.sin(angle + Math.PI/6));
        ctx.closePath(); // Fermer le triangle
        ctx.fillStyle = color; // Remplir la flèche
        ctx.fill();

        // Label
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center'; // Centrer le texte horizontalement
        // Ajouter la distance au label si fournie
        let labelText = label;
        if (distance !== null && distance !== undefined) {
            labelText += ' ' + Math.floor(distance);
        }
        // Positionner le label légèrement après la pointe de la flèche
        const labelOffset = 15;
        ctx.fillText(labelText,
                     origin.x + dirX * (length + labelOffset),
                     origin.y + dirY * (length + labelOffset));

        ctx.restore(); // Restaurer l'état précédent
    }

    /**
     * Affiche le champ de gravité sous forme de flèches sur la grille pré-calculée.
     * La couleur et la longueur des flèches dépendent de l'intensité locale du champ.
     * @param {CanvasRenderingContext2D} ctx - Contexte du canvas.
     * @param {Camera} camera - Objet caméra (non utilisé directement ici car on travaille en coordonnées écran).
     * @param {PhysicsController} physicsController - Non utilisé directement ici.
     * @private
     */
    renderGravityFieldArrows(ctx, camera, physicsController) {
        if (!this.gravityFieldGrid) return; // S'assurer que la grille est calculée

        const gridX = this.gridX;
        const gridY = this.gridY;
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const stepX = width / gridX;
        const stepY = height / gridY;

        ctx.save();
        ctx.lineWidth = 1; // Lignes fines pour le champ

        for (let ix = 0; ix < gridX; ix++) {
            for (let iy = 0; iy < gridY; iy++) {
                // Coordonnées écran du centre de la maille
                const sx = ix * stepX + stepX / 2;
                const sy = iy * stepY + stepY / 2;

                // Récupérer les données pré-calculées pour cette maille
                const g = this.gravityFieldGrid[ix][iy];
                if (!g) continue; // Sécurité

                const ax = g.ax, ay = g.ay;
                const a = Math.sqrt(ax * ax + ay * ay); // Magnitude de l'accélération gravitationnelle

                if (a < 1e-8) continue; // Ne pas dessiner si le champ est quasi nul

                // Normaliser la direction
                const dirX = ax / a;
                const dirY = ay / a;

                // Longueur de la flèche : proportionnelle à 'a', mais limitée par la taille de la maille
                const scaleFactor = 2000; // Facteur d'échelle arbitraire pour la visibilité
                const maxLengthFactor = 0.8; // Pourcentage max de la taille de la maille
                const length = Math.min(scaleFactor * a, Math.min(stepX, stepY) * maxLengthFactor);

                // Position de fin de la flèche (en pixels écran)
                const ex = sx + dirX * length;
                const ey = sy + dirY * length;

                // Déterminer la couleur en fonction de l'intensité 'a' (gradient vert -> jaune -> rouge)
                let color;
                // Seuils ajustés pour une meilleure visualisation des variations
                const threshold1 = 0.00005;
                const threshold2 = 0.0003;
                const threshold3 = 0.001;
                const threshold4 = 0.003;

                if (a < threshold1) {
                    color = 'rgba(0,255,0,0.35)'; // Vert faible
                } else if (a < threshold2) {
                    const t = (a - threshold1) / (threshold2 - threshold1); // Interpolation 0..1
                    color = `rgba(${Math.round(255 * t)}, 255, 0, 0.35)`; // Vert -> Jaune
                } else if (a < threshold3) {
                    const t = (a - threshold2) / (threshold3 - threshold2);
                    color = `rgba(255, ${Math.round(255 * (1 - t) + 165 * t)}, 0, 0.45)`; // Jaune -> Orange
                } else if (a < threshold4) {
                    const t = (a - threshold3) / (threshold4 - threshold3);
                    color = `rgba(255, ${Math.round(165 * (1 - t))}, 0, 0.55)`; // Orange -> Rouge
                } else {
                    color = 'rgba(255,0,0,0.65)'; // Rouge fort
                }

                // Dessiner la ligne
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = color;
                ctx.stroke();

                // Dessiner la pointe de flèche
                const angle = Math.atan2(ey - sy, ex - sx);
                const headlen = 4; // Taille fixe de la pointe
                ctx.beginPath();
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex - headlen * Math.cos(angle - Math.PI/6), ey - headlen * Math.sin(angle - Math.PI/6));
                ctx.lineTo(ex - headlen * Math.cos(angle + Math.PI/6), ey - headlen * Math.sin(angle + Math.PI/6));
                ctx.closePath();
                ctx.fillStyle = color; // Remplir avec la même couleur
                ctx.fill();
            }
        }
        ctx.restore();
    }

    /**
     * Affiche les lignes équipotentielles en utilisant l'algorithme des "Marching Squares"
     * sur la grille de potentiel pré-calculée (`this.gravityFieldGrid`).
     * Les lignes sont colorées en fonction de la valeur du potentiel et masquées près des corps célestes.
     * @param {CanvasRenderingContext2D} ctx - Contexte du canvas.
     * @param {Camera} camera - Objet caméra pour transformer les points monde en écran.
     * @param {PhysicsController} physicsController - Pour accéder aux corps célestes (pour le masquage).
     * @private
     */
    renderEquipotentialLines(ctx, camera, physicsController) {
        // Vérifier si la grille et les données de potentiel existent
        if (!this.gravityFieldGrid || !this.gravityFieldGrid[0] || !this.gravityFieldGrid[0][0] || !this.gravityFieldGrid[0][0].hasOwnProperty('potential')) {
            console.warn("[VectorsView] Grille de potentiel non disponible pour renderEquipotentialLines.");
            return;
        }

        const gridX = this.gridX;
        const gridY = this.gridY;

        // Récupérer les corps célestes DEPUIS l'argument physicsController
        const bodies = physicsController ? physicsController.celestialBodies : [];

        // Trouver la plage de potentiel (min/max) à partir de la grille calculée
        let minPotential = Infinity;
        let maxPotential = -Infinity;
        for (let ix = 0; ix < gridX; ix++) {
            for (let iy = 0; iy < gridY; iy++) {
                const p = this.gravityFieldGrid[ix][iy].potential;
                if (p < minPotential) minPotential = p;
                // Ignorer Infinity potentiel au centre exact des corps
                if (p > maxPotential && isFinite(p)) maxPotential = p;
            }
        }

        // Générer dynamiquement les isovaleurs (niveaux de potentiel) à dessiner.
        // Utilise une échelle logarithmique pour mieux répartir les lignes là où le potentiel varie rapidement.
        const numLevels = 50; // Nombre de lignes équipotentielles à tracer
        const isovalues = [];
        // S'assurer que la plage est valide et négative (potentiel gravitationnel attractif)
        if (minPotential < maxPotential && maxPotential < 0) {
            // Logarithme de la magnitude (potentiel est négatif)
            const logMinMag = Math.log10(-maxPotential); // Potentiel le moins négatif (magnitude la plus faible)
            const logMaxMag = Math.log10(-minPotential); // Potentiel le plus négatif (magnitude la plus forte)
            const rangeLogMag = logMaxMag - logMinMag;

            if (rangeLogMag > 1e-6) { // Éviter division par zéro si la plage est trop petite
                for (let i = 1; i <= numLevels; i++) {
                    // Interpole linéairement dans l'espace logarithmique
                    const logVal = logMinMag + rangeLogMag * (i / (numLevels + 1));
                    // Revenir à l'échelle linéaire et remettre le signe négatif
                    isovalues.push(-Math.pow(10, logVal));
                }
            }
        }

        // Fallback: utiliser une échelle linéaire si l'échelle log a échoué ou si la plage n'était pas négative.
         if (isovalues.length === 0 && maxPotential > minPotential) {
             console.warn("[VectorsView] Utilisation de l'échelle linéaire pour les isovaleurs (log a échoué ou plage non négative).");
             const range = maxPotential - minPotential;
             for (let i = 1; i <= numLevels; i++) {
                 isovalues.push(minPotential + range * (i / (numLevels + 1)));
             }
         }

        // Log des isovaleurs retiré (anciennement [DEBUG][Equipotentials])

        /**
         * Fonction d'interpolation linéaire pour trouver le point (coordonnées monde)
         * où une isovaleur coupe le segment entre deux points de la grille p1 et p2.
         * @param {{wx: number, wy: number, potential: number}} p1 - Premier point.
         * @param {{wx: number, wy: number, potential: number}} p2 - Deuxième point.
         * @param {number} isovalue - Valeur du potentiel recherchée.
         * @returns {{x: number, y: number}} Coordonnées monde du point d'intersection.
         */
        const interpolate = (p1, p2, isovalue) => {
            // Cas limites pour éviter les erreurs ou divisions par zéro
            if (Math.abs(isovalue - p1.potential) < 1e-9) return { x: p1.wx, y: p1.wy };
            if (Math.abs(isovalue - p2.potential) < 1e-9) return { x: p2.wx, y: p2.wy };
            const diffPotential = p2.potential - p1.potential;
            if (Math.abs(diffPotential) < 1e-9) return { x: p1.wx, y: p1.wy }; // Potentiels égaux

            // Calcul du facteur d'interpolation t
            const t = (isovalue - p1.potential) / diffPotential;

            // Interpolation linéaire des coordonnées monde (wx, wy)
            return {
                x: p1.wx + t * (p2.wx - p1.wx),
                y: p1.wy + t * (p2.wy - p1.wy)
            };
        };

        /**
         * Vérifie si un point (coordonnées monde) se trouve à l'intérieur
         * d'un corps céleste, en ajoutant une petite marge.
         * Utilisé pour ne pas dessiner les lignes trop près ou à l'intérieur des corps.
         * @param {{x: number, y: number}} point - Point à tester (coordonnées monde).
         * @param {number} [marginFactor=1.05] - Multiplicateur du rayon pour créer une marge.
         * @returns {boolean} True si le point est dans un corps (avec marge), false sinon.
         */
        const isPointInsideBodyWithMargin = (point, marginFactor = 1.05) => {
            for (const bodyInfo of bodies) {
                const bodyModel = bodyInfo.model;
                // Calculer le carré du rayon effectif (avec marge) pour éviter sqrt
                const effectiveRadiusSq = (bodyModel.radius * marginFactor) ** 2;
                // Calculer le carré de la distance du point au centre du corps
                const distSq = (point.x - bodyModel.position.x)**2 + (point.y - bodyModel.position.y)**2;
                // Si la distance au carré est inférieure au rayon au carré, le point est dedans
                if (distSq < effectiveRadiusSq) {
                    return true;
                }
            }
            return false; // Le point n'est dans aucun corps
        };

        ctx.save();
        ctx.lineWidth = 1.5; // Épaisseur des lignes équipotentielles

        // Itérer sur chaque isovaleur pour dessiner les lignes correspondantes
        for (let i = 0; i < isovalues.length; i++) {
            const isovalue = isovalues[i];

            // Déterminer la couleur en fonction de la position de l'isovaleur dans la plage (gradient)
            // Normaliser l'index i entre 0 et 1
            const t = isovalues.length > 1 ? (i / (isovalues.length - 1)) : 0.5;
            // Créer un gradient de couleur (par exemple, cyan -> bleu -> violet) en utilisant HSL
            const hue = 180 + t * 120; // 180 (Cyan) -> 300 (Magenta/Violet)
            const saturation = 100;
            const lightness = 50;
            const alpha = 0.7; // Transparence
            ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;

            ctx.beginPath(); // Commencer un nouveau chemin pour cette isovaleur (et cette couleur)

            // Itérer sur chaque cellule de la grille (Marching Squares)
            for (let ix = 0; ix < gridX - 1; ix++) {
                for (let iy = 0; iy < gridY - 1; iy++) {
                    // Récupérer les 4 coins de la cellule (potentiel et coordonnées monde)
                    // Ordre: 0: bas-gauche, 1: bas-droite, 2: haut-droite, 3: haut-gauche
                    const p0 = this.gravityFieldGrid[ix][iy];
                    const p1 = this.gravityFieldGrid[ix + 1][iy];
                    const p2 = this.gravityFieldGrid[ix + 1][iy + 1];
                    const p3 = this.gravityFieldGrid[ix][iy + 1];

                    // Calculer l'index de la cellule Marching Squares
                    // Bit à 1 si potentiel < isovaleur, 0 sinon.
                    let squareIndex = 0;
                    if (p0.potential < isovalue) squareIndex |= 1; // Bas-gauche
                    if (p1.potential < isovalue) squareIndex |= 2; // Bas-droite
                    if (p2.potential < isovalue) squareIndex |= 4; // Haut-droite
                    if (p3.potential < isovalue) squareIndex |= 8; // Haut-gauche

                    // Tracer les segments de ligne en fonction de l'index (lookup implicite)
                    let v_bottom, v_right, v_top, v_left; // Points d'intersection sur les arêtes

                    // Calculer les points d'intersection potentiels (optimisation: calculer seulement si nécessaire)
                    // Note: Les interpolations retournent les coordonnées monde {x, y}
                    const interpBottom = () => interpolate(p0, p1, isovalue); // Entre 0 et 1
                    const interpRight  = () => interpolate(p1, p2, isovalue); // Entre 1 et 2
                    const interpTop    = () => interpolate(p3, p2, isovalue); // Entre 3 et 2 (ordre inversé pour t)
                    const interpLeft   = () => interpolate(p0, p3, isovalue); // Entre 0 et 3

                    // Utiliser une structure pour stocker les segments à dessiner
                    const segments = [];

                    // Déterminer les segments basés sur squareIndex
                    switch (squareIndex) {
                        // Cas avec 1 coin intérieur (ou 3 extérieurs) -> 1 segment
                        case 1: case 14: segments.push({ p1: interpLeft(),  p2: interpBottom() }); break;
                        case 2: case 13: segments.push({ p1: interpBottom(),p2: interpRight()  }); break;
                        case 4: case 11: segments.push({ p1: interpRight(), p2: interpTop()    }); break;
                        case 8: case 7:  segments.push({ p1: interpTop(),   p2: interpLeft()   }); break;

                        // Cas avec 2 coins adjacents intérieurs -> 1 segment
                        case 3: case 12: segments.push({ p1: interpLeft(),  p2: interpRight()  }); break;
                        case 6: case 9:  segments.push({ p1: interpBottom(),p2: interpTop()    }); break;

                        // Cas ambigus (2 coins opposés intérieurs) - traités simplement avec 2 segments
                        // Note: Un traitement plus avancé (disambiguation basée sur la valeur centrale) existe
                        // mais n'est pas implémenté ici pour la simplicité.
                        case 5:  segments.push({ p1: interpLeft(), p2: interpBottom() }, { p1: interpTop(), p2: interpRight() }); break; // 0 et 2 intérieurs
                        case 10: segments.push({ p1: interpBottom(), p2: interpRight() }, { p1: interpLeft(), p2: interpTop() }); break; // 1 et 3 intérieurs

                        // Cas 0 et 15: pas de ligne à tracer
                        default: break;
                    }

                    // Dessiner les segments déterminés, MAIS seulement s'ils sont hors des corps célestes
                    for (const seg of segments) {
                        // Vérifier si les extrémités ET le point milieu sont hors des corps (avec marge)
                        // Ceci évite de dessiner des lignes traversant ou trop proches des corps.
                        const midPoint = { x: (seg.p1.x + seg.p2.x) / 2, y: (seg.p1.y + seg.p2.y) / 2 };
                        const shouldDraw = !isPointInsideBodyWithMargin(seg.p1) &&
                                           !isPointInsideBodyWithMargin(seg.p2) &&
                                           !isPointInsideBodyWithMargin(midPoint);

                        if (shouldDraw) {
                            // Convertir les points monde en coordonnées écran
                            const s1 = camera.worldToScreen(seg.p1.x, seg.p1.y);
                            const s2 = camera.worldToScreen(seg.p2.x, seg.p2.y);
                            // Ajouter le segment au chemin actuel
                            ctx.moveTo(s1.x, s1.y);
                            ctx.lineTo(s2.x, s2.y);
                        }
                    }
                }
            }
            ctx.stroke(); // Tracer toutes les lignes pour cette isovaleur avec la couleur définie
        }
        ctx.restore(); // Restaurer l'état du contexte
    }
}

// Pas d'export car les fichiers sont chargés via <script> dans index.html
// export default VectorsView; 