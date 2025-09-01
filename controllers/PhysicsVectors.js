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

    // Ajout : méthode pour obtenir l'accélération totale
    getTotalAcceleration() {
        return this.totalAcceleration;
    }

    static calculateGravityVector(rocketModel, universeModel, PHYSICS_G) {
        if (!rocketModel || !universeModel) return null;

        let totalGravityX = 0;
        let totalGravityY = 0;

        for (const body of universeModel.celestialBodies) {
            const dx = body.position.x - rocketModel.position.x;
            const dy = body.position.y - rocketModel.position.y;
            const distanceSquared = dx * dx + dy * dy;
            const distance = Math.sqrt(distanceSquared);

            // Éviter la division par zéro si la fusée est exactement sur le corps céleste (improbable mais sûr)
            if (distance === 0) continue;

            const forceMagnitude = PHYSICS_G * body.mass * rocketModel.mass / distanceSquared;

            const forceX = forceMagnitude * (dx / distance);
            const forceY = forceMagnitude * (dy / distance);

            totalGravityX += forceX / rocketModel.mass;
            totalGravityY += forceY / rocketModel.mass;
        }

        return { x: totalGravityX, y: totalGravityY };
    }

    static calculateThrustVectors(rocketModel, rocketConstants) { // rocketConstants = ROCKET
        if (!rocketModel) return null;

        const thrustVectors = {};

        for (const thrusterName in rocketModel.thrusters) {
            const thruster = rocketModel.thrusters[thrusterName];

            if (thruster.power > 0) {
                // La logique originale pour 'left' et 'right' était de les ignorer ici,
                // car ils contribuent au couple, pas directement à la poussée calculée de cette manière.
                // calculateTotalThrustVector les gère différemment.
                // On conserve ce comportement pour l'instant.
                if (thrusterName === 'left' || thrusterName === 'right') {
                    continue;
                }
                let thrustAngle = 0;
                let thrustMagnitude = 0;

                switch (thrusterName) {
                    case 'main':
                        thrustAngle = rocketModel.angle + Math.PI / 2; // Angle original de GameController
                        thrustMagnitude = rocketConstants.MAIN_THRUST * (thruster.power / thruster.maxPower) * (typeof PHYSICS !== 'undefined' ? PHYSICS.THRUST_MULTIPLIER : 1);
                        break;
                    case 'rear':
                        thrustAngle = rocketModel.angle - Math.PI / 2; // Angle original de GameController
                        thrustMagnitude = rocketConstants.REAR_THRUST * (thruster.power / thruster.maxPower) * (typeof PHYSICS !== 'undefined' ? PHYSICS.THRUST_MULTIPLIER : 1);
                        break;
                }

                thrustVectors[thrusterName] = {
                    position: {
                        x: thruster.position.x,
                        y: thruster.position.y
                    },
                    x: -Math.cos(thrustAngle), // Direction originale de GameController
                    y: -Math.sin(thrustAngle), // Direction originale de GameController
                    magnitude: thrustMagnitude
                };
            }
        }
        return thrustVectors;
    }

    static calculateTotalThrustVector(rocketModel, rocketConstants, physicsConstants) {
        // rocketConstants = { THRUSTER_POSITIONS, MAIN_THRUST, REAR_THRUST, LATERAL_THRUST }
        // physicsConstants = { THRUST_MULTIPLIER }
        if (!rocketModel) return null;

        let totalX = 0;
        let totalY = 0;

        for (const thrusterName in rocketModel.thrusters) {
            const thruster = rocketModel.thrusters[thrusterName];

            if (thruster.power > 0) {
                const position = rocketConstants.THRUSTER_POSITIONS[thrusterName.toUpperCase()];
                if (!position) continue;

                let thrustAngle;

                if (thrusterName === 'left' || thrusterName === 'right') {
                    const propAngle = Math.atan2(position.distance * Math.sin(position.angle),
                        position.distance * Math.cos(position.angle));
                    const perpDirection = thrusterName === 'left' ? Math.PI / 2 : -Math.PI / 2;
                    thrustAngle = rocketModel.angle + propAngle + perpDirection;
                } else {
                    switch (thrusterName) {
                        case 'main':
                            thrustAngle = rocketModel.angle - Math.PI / 2;
                            break;
                        case 'rear':
                            thrustAngle = rocketModel.angle + Math.PI / 2;
                            break;
                        default:
                            thrustAngle = rocketModel.angle; // Fallback, devrait être couvert par les cas ci-dessus
                    }
                }

                let thrustForce;
                switch (thrusterName) {
                    case 'main':
                        thrustForce = rocketConstants.MAIN_THRUST * (thruster.power / 100) * physicsConstants.THRUST_MULTIPLIER;
                        break;
                    case 'rear':
                        thrustForce = rocketConstants.REAR_THRUST * (thruster.power / 100) * physicsConstants.THRUST_MULTIPLIER;
                        break;
                    case 'left':
                    case 'right':
                        thrustForce = rocketConstants.LATERAL_THRUST * (thruster.power / 100) * physicsConstants.THRUST_MULTIPLIER;
                        break;
                    default:
                        thrustForce = 0;
                }

                totalX += Math.cos(thrustAngle) * thrustForce;
                totalY += Math.sin(thrustAngle) * thrustForce;
            }
        }

        if (Math.abs(totalX) < 0.001 && Math.abs(totalY) < 0.001) {
            return null; // Retourne null si la poussée est négligeable, comme dans GameController
        }

        return { x: totalX, y: totalY };
    }

    static calculateLunarAttractionVector(rocketModel, universeModel) {
        if (!rocketModel || !universeModel) return null;

        const moon = universeModel.celestialBodies.find(body => body.name === 'Lune');
        if (!moon) return null;

        const dx = moon.position.x - rocketModel.position.x;
        const dy = moon.position.y - rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);

        if (distance === 0) return { vector: { x: 0, y: 0 }, distance: 0 }; // Pour éviter NaN si distance est 0

        return {
            vector: { x: dx / distance, y: dy / distance },
            distance: distance
        };
    }

    static calculateEarthAttractionVector(rocketModel, universeModel) {
        if (!rocketModel || !universeModel) return null;

        const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;

        const dx = earth.position.x - rocketModel.position.x;
        const dy = earth.position.y - rocketModel.position.y;
        const distanceSquared = dx * dx + dy * dy;
        const distance = Math.sqrt(distanceSquared);

        if (distance === 0) return { x: 0, y: 0 }; // Pour éviter NaN si distance est 0

        return { x: dx / distance, y: dy / distance }; // Retourne seulement le vecteur normalisé
    }

    static calculateEarthDistance(rocketModel, universeModel) {
        if (!rocketModel || !universeModel) return null;

        const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth) return null;

        const dx = earth.position.x - rocketModel.position.x;
        const dy = earth.position.y - rocketModel.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // La distance à la surface ne peut pas être négative
        const surfaceDistance = Math.max(0, distance - earth.radius);

        return surfaceDistance;
    }

    // Nouveau: centraliser tous les calculs de vecteurs utilisés par l'UI/rendu
    // Retourne { gravityVector, thrustVectors, totalThrustVector, accelerationVector, lunarAttraction, earthAttraction }
    static calculateAllVectors(rocketModel, universeModel, physicsConstants, rocketConstants) {
        if (!rocketModel) {
            return {
                gravityVector: null,
                thrustVectors: null,
                totalThrustVector: null,
                accelerationVector: { x: 0, y: 0 },
                lunarAttraction: null,
                earthAttraction: null
            };
        }

        const gravityVector = PhysicsVectors.calculateGravityVector(rocketModel, universeModel, physicsConstants.G);
        const thrustVectors = PhysicsVectors.calculateThrustVectors(rocketModel, rocketConstants);
        const totalThrustVector = PhysicsVectors.calculateTotalThrustVector(rocketModel, rocketConstants, physicsConstants);

        let ax = 0;
        let ay = 0;
        if (gravityVector) {
            ax += gravityVector.x;
            ay += gravityVector.y;
        }
        if (totalThrustVector && rocketModel.mass > 0) {
            ax += totalThrustVector.x / rocketModel.mass;
            ay += totalThrustVector.y / rocketModel.mass;
        }

        const accelerationVector = { x: ax, y: ay };
        const lunarAttraction = PhysicsVectors.calculateLunarAttractionVector(rocketModel, universeModel);
        const earthAttraction = PhysicsVectors.calculateEarthAttractionVector(rocketModel, universeModel);

        return {
            gravityVector,
            thrustVectors,
            totalThrustVector,
            accelerationVector,
            lunarAttraction,
            earthAttraction
        };
    }
} 