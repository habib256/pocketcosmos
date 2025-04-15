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
        this.showThrustVector = false;  // Option pour afficher les vecteurs de poussée
        this.showTotalThrustVector = false; // Option pour afficher le vecteur de poussée totale
        this.showVelocityVector = false; // Option pour afficher le vecteur de vitesse
        this.showLunarAttractionVector = false; // Option pour afficher le vecteur d'attraction lunaire
        this.showEarthAttractionVector = false; // Option pour afficher le vecteur d'attraction terrestre
        this.showThrusterPositions = false; // Option pour afficher la position des propulseurs
        this.showAccelerationVector = false;
        this.showMissionStartVector = false;
        this.showMissionTargetVector = false;
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
        
        // Dessiner les vecteurs si activés (APRÈS la fusée) et si la fusée n'est pas détruite
        if (!rocketState.isDestroyed) {
            // Dessiner le vecteur de poussée des propulseurs
            if (this.showThrustVector && rocketState.thrustVectors) {
                this.renderThrustVectors(ctx, rocketState);
            }
            
            // Dessiner le vecteur de poussée totale
            if (this.showTotalThrustVector && rocketState.totalThrustVector) {
                this.renderTotalThrustVector(ctx, rocketState);
            }
            
            // Dessiner le vecteur de vitesse
            if (this.showVelocityVector && rocketState.velocity) {
                this.renderVelocityVector(ctx, rocketState);
            }
            
            // Dessiner le vecteur d'attraction vers la Lune
            if (this.showLunarAttractionVector && rocketState.lunarAttractionVector) {
                this.renderLunarAttractionVector(ctx, rocketState);
            }
            
            // Dessiner le vecteur d'attraction vers la Terre
            if (this.showEarthAttractionVector && rocketState.earthAttractionVector) {
                this.renderEarthAttractionVector(ctx, rocketState);
            }
            
            if (this.showAccelerationVector && rocketState.accelerationVector) {
                this.renderAccelerationVector(ctx, rocketState);
            }
            
            if (this.showMissionStartVector && rocketState.missionStartVector) {
                this.renderMissionStartVector(ctx, rocketState);
            }
            
            if (this.showMissionTargetVector && rocketState.missionTargetVector) {
                this.renderMissionTargetVector(ctx, rocketState);
            }
        }
        
        ctx.restore();
    }
    
    // Affiche le vecteur de vitesse de la fusée
    renderVelocityVector(ctx, rocketState) {
        if (!rocketState.velocity) return;
        const velocityX = rocketState.velocity.x;
        const velocityY = rocketState.velocity.y;
        const velocityMagnitude = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
        if (velocityMagnitude > 0.00001) {
            const dirX = velocityX / velocityMagnitude;
            const dirY = velocityY / velocityMagnitude;
            const vectorLength = 100; // Longueur fixe
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00FFFF"; // Cyan pour la vitesse
            ctx.stroke();
            // Flèche
            const arrowSize = RENDER.GRAVITY_ARROW_SIZE * 0.8;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6)
            );
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6)
            );
            ctx.closePath();
            ctx.fillStyle = "#00FFFF";
            ctx.fill();
            ctx.fillStyle = "#00FFFF";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("V", dirX * vectorLength + dirX * 15, dirY * vectorLength + dirY * 15);
        }
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
    
    // Affiche les vecteurs de poussée des propulseurs de la fusée
    renderThrustVectors(ctx, rocketState) {
        if (!rocketState.thrustVectors) return;
        
        ctx.save();
        
        // Afficher les positions des propulseurs si activé
        if (this.showThrusterPositions) {
            this.renderThrusterPositions(ctx, rocketState);
        }
        
        // Dessiner les vecteurs de poussée pour chaque propulseur
        for (const thrusterName in rocketState.thrustVectors) {
            const thrustVector = rocketState.thrustVectors[thrusterName];
            
            if (thrustVector.magnitude > 0) {
                const scale = RENDER.THRUST_SCALE_FACTOR; // Utiliser la constante définie
                const length = thrustVector.magnitude * scale;
                
                // Couleur en fonction du propulseur
                let color;
                switch (thrusterName) {
                    case 'main': color = '#FF5500'; break;
                    case 'rear': color = '#FF8800'; break;
                    case 'left': color = '#FFAA00'; break;
                    case 'right': color = '#FFAA00'; break;
                    default: color = '#FFFFFF';
                }
                
                // Dessiner le vecteur
                ctx.beginPath();
                ctx.moveTo(thrustVector.position.x, thrustVector.position.y);
                ctx.lineTo(
                    thrustVector.position.x + thrustVector.x * length,
                    thrustVector.position.y + thrustVector.y * length
                );
                
                // Style de ligne
                ctx.lineWidth = 2;
                ctx.strokeStyle = color;
                ctx.stroke();
                
                // Dessiner une flèche au bout du vecteur
                const arrowSize = RENDER.THRUST_ARROW_SIZE;
                const angle = Math.atan2(thrustVector.y, thrustVector.x);
                
                ctx.beginPath();
                ctx.moveTo(
                    thrustVector.position.x + thrustVector.x * length,
                    thrustVector.position.y + thrustVector.y * length
                );
                ctx.lineTo(
                    thrustVector.position.x + thrustVector.x * length - arrowSize * Math.cos(angle - Math.PI/6),
                    thrustVector.position.y + thrustVector.y * length - arrowSize * Math.sin(angle - Math.PI/6)
                );
                ctx.lineTo(
                    thrustVector.position.x + thrustVector.x * length - arrowSize * Math.cos(angle + Math.PI/6),
                    thrustVector.position.y + thrustVector.y * length - arrowSize * Math.sin(angle + Math.PI/6)
                );
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    // Visualise la position des propulseurs
    renderThrusterPositions(ctx, rocketState) {
        // Afficher la position de chaque propulseur défini dans ROCKET.THRUSTER_POSITIONS
        for (const thrusterName in ROCKET.THRUSTER_POSITIONS) {
            const position = ROCKET.THRUSTER_POSITIONS[thrusterName];
            
            // Convertir la position polaire en coordonnées cartésiennes
            const x = Math.cos(position.angle) * position.distance;
            const y = Math.sin(position.angle) * position.distance;
            
            // Appliquer la rotation de la fusée
            const rotatedX = Math.cos(rocketState.angle) * x - Math.sin(rocketState.angle) * y;
            const rotatedY = Math.sin(rocketState.angle) * x + Math.cos(rocketState.angle) * y;
            
            // Couleur selon le propulseur
            let color;
            switch (thrusterName) {
                case 'MAIN': color = '#FF0000'; break;  // Rouge
                case 'REAR': color = '#00FF00'; break;  // Vert
                case 'LEFT': color = '#0000FF'; break;  // Bleu
                case 'RIGHT': color = '#FFFF00'; break; // Jaune
                default: color = '#FFFFFF';              // Blanc
            }
            
            // Dessiner un cercle à la position du propulseur
            ctx.beginPath();
            ctx.arc(rotatedX, rotatedY, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            
            // Ajouter une étiquette avec le nom du propulseur
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(thrusterName, rotatedX, rotatedY - 8);
        }
    }

    // Activer/désactiver l'affichage des positions des propulseurs
    setShowThrusterPositions(enabled) {
        this.showThrusterPositions = enabled;
    }

    // Affiche le vecteur d'attraction vers la Lune
    renderLunarAttractionVector(ctx, rocketState) {
        if (!rocketState.lunarAttractionVector) return;
        
        // Sauvegarder le contexte
        ctx.save();
        
        const lunarVector = rocketState.lunarAttractionVector;
        
        // Calculer la magnitude du vecteur d'attraction lunaire
        const lunarMagnitude = Math.sqrt(lunarVector.x * lunarVector.x + lunarVector.y * lunarVector.y);
        
        if (lunarMagnitude > 0.0000001) { // Vérifier si l'attraction est significative
            // Normaliser la direction
            const dirX = lunarVector.x / lunarMagnitude;
            const dirY = lunarVector.y / lunarMagnitude;
            
            // Échelle de visualisation fixe pour le vecteur normalisé
            const vectorLength = 80; // Longueur fixe pour que le vecteur soit bien visible
            
            // Dessiner le vecteur
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            
            // Style de ligne
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#E0A0FF"; // Violet clair pour l'attraction lunaire
            ctx.stroke();
            
            // Dessiner la flèche
            const arrowSize = RENDER.GRAVITY_ARROW_SIZE;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6)
            );
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6)
            );
            ctx.closePath();
            ctx.fillStyle = "#E0A0FF";
            ctx.fill();
            
            // Calculer la distance à la Lune si disponible
            let distanceText = "";
            if (rocketState.lunarDistance) {
                distanceText = ` ${Math.floor(rocketState.lunarDistance)}`;
            }
            
            // Ajouter un texte explicatif avec le nom de la Lune et la distance
            ctx.fillStyle = "#E0A0FF";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`Lune${distanceText}`, dirX * vectorLength + dirX * 20, dirY * vectorLength + dirY * 15);
        }
        
        ctx.restore();
    }

    // Affiche le vecteur d'attraction vers la Terre
    renderEarthAttractionVector(ctx, rocketState) {
        if (!rocketState.earthAttractionVector) return;
        
        // Sauvegarder le contexte
        ctx.save();
        
        const earthVector = rocketState.earthAttractionVector;
        
        // Calculer la magnitude du vecteur d'attraction terrestre
        const earthMagnitude = Math.sqrt(earthVector.x * earthVector.x + earthVector.y * earthVector.y);
        
        if (earthMagnitude > 0.0000001) { // Vérifier si l'attraction est significative
            // Normaliser la direction
            const dirX = earthVector.x / earthMagnitude;
            const dirY = earthVector.y / earthMagnitude;
            
            // Échelle de visualisation fixe pour le vecteur normalisé
            const vectorLength = 80; // Longueur fixe pour que le vecteur soit bien visible
            
            // Dessiner le vecteur
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            
            // Style de ligne
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00FF00"; // Vert pour l'attraction terrestre
            ctx.stroke();
            
            // Dessiner la flèche
            const arrowSize = RENDER.GRAVITY_ARROW_SIZE;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6)
            );
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6)
            );
            ctx.closePath();
            ctx.fillStyle = "#00FF00";
            ctx.fill();
            
            // Calculer la distance à la Terre si disponible
            let distanceText = "";
            if (rocketState.earthDistance !== null && rocketState.earthDistance !== undefined) {
                distanceText = ` ${Math.floor(rocketState.earthDistance)}`;
            }
            
            // Ajouter un texte explicatif
            ctx.fillStyle = "#00FF00";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`Terre${distanceText}`, dirX * vectorLength + dirX * 15, dirY * vectorLength + dirY * 15);
        }
        
        ctx.restore();
    }

    // Affiche le vecteur de poussée totale de la fusée
    renderTotalThrustVector(ctx, rocketState) {
        if (!rocketState.totalThrustVector) return;
        
        // Sauvegarder le contexte
        ctx.save();
        
        const thrustVector = rocketState.totalThrustVector;
        
        // Calculer la magnitude du vecteur de poussée
        const thrustMagnitude = Math.sqrt(thrustVector.x * thrustVector.x + thrustVector.y * thrustVector.y);
        
        if (thrustMagnitude > 0.0000001) { // Vérifier si la poussée est significative
            // Normaliser la direction
            const dirX = thrustVector.x / thrustMagnitude;
            const dirY = thrustVector.y / thrustMagnitude;
            
            // Échelle de visualisation
            const vectorLength = 80; // Longueur fixe pour que le vecteur soit bien visible
            
            // Dessiner le vecteur
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            
            // Style de ligne
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#FF0000"; // Rouge pour la poussée totale
            ctx.stroke();
            
            // Dessiner la flèche
            const arrowSize = RENDER.GRAVITY_ARROW_SIZE;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6)
            );
            ctx.lineTo(
                dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6),
                dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6)
            );
            ctx.closePath();
            ctx.fillStyle = "#FF0000";
            ctx.fill();
            
            // Ajouter un texte explicatif
            ctx.fillStyle = "#FF0000";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Poussée", dirX * vectorLength + dirX * 15, dirY * vectorLength + dirY * 15);
        }
        
        ctx.restore();
    }

    renderAccelerationVector(ctx, rocketState) {
        if (!rocketState.accelerationVector) return;
        ctx.save();
        const acc = rocketState.accelerationVector;
        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y);
        if (magnitude > 0.00001) {
            const dirX = acc.x / magnitude;
            const dirY = acc.y / magnitude;
            const vectorLength = 100; // Longueur fixe
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#FFA500"; // Orange
            ctx.stroke();
            // Flèche
            const arrowSize = 10;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6));
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6));
            ctx.closePath();
            ctx.fillStyle = "#FFA500";
            ctx.fill();
            ctx.fillStyle = "#FFA500";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText("a", dirX * vectorLength + dirX * 15, dirY * vectorLength + dirY * 15);
        }
        ctx.restore();
    }

    renderMissionStartVector(ctx, rocketState) {
        if (!rocketState.missionStartVector) return;
        ctx.save();
        const vec = rocketState.missionStartVector.vector;
        const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
        if (magnitude > 0.00001) {
            const dirX = vec.x / magnitude;
            const dirY = vec.y / magnitude;
            const vectorLength = 100; // Longueur fixe
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#00BFFF"; // Bleu clair
            ctx.stroke();
            // Flèche
            const arrowSize = 10;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6));
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6));
            ctx.closePath();
            ctx.fillStyle = "#00BFFF";
            ctx.fill();
            ctx.fillStyle = "#00BFFF";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            const label = rocketState.missionStartVector.name + ' ' + Math.floor(rocketState.missionStartVector.distance);
            ctx.fillText(label, dirX * vectorLength + dirX * 20, dirY * vectorLength + dirY * 15);
        }
        ctx.restore();
    }

    renderMissionTargetVector(ctx, rocketState) {
        if (!rocketState.missionTargetVector) return;
        ctx.save();
        const vec = rocketState.missionTargetVector.vector;
        const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
        if (magnitude > 0.00001) {
            const dirX = vec.x / magnitude;
            const dirY = vec.y / magnitude;
            const vectorLength = 100; // Longueur fixe
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "gold"; // Jaune/or pour la flèche de destination
            ctx.stroke();
            // Flèche
            const arrowSize = 10;
            const angle = Math.atan2(dirY, dirX);
            ctx.beginPath();
            ctx.moveTo(dirX * vectorLength, dirY * vectorLength);
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle - Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle - Math.PI/6));
            ctx.lineTo(dirX * vectorLength - arrowSize * Math.cos(angle + Math.PI/6), dirY * vectorLength - arrowSize * Math.sin(angle + Math.PI/6));
            ctx.closePath();
            ctx.fillStyle = "gold";
            ctx.fill();
            ctx.fillStyle = "gold";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            const label = rocketState.missionTargetVector.name + ' ' + Math.floor(rocketState.missionTargetVector.distance);
            ctx.fillText(label, dirX * vectorLength + dirX * 20, dirY * vectorLength + dirY * 15);
        }
        ctx.restore();
    }
} 