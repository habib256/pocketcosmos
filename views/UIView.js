class UIView {
    constructor(eventBus) {
        this.font = '16px Arial';
        this.colors = {
            white: 'white',
            red: 'red',
            orange: 'orange',
            green: 'green',
            success: 'rgba(0, 255, 0, 0.8)',
            danger: 'rgba(255, 0, 0, 0.8)',
            moon: 'rgba(200, 200, 200, 0.9)' // Couleur pour les infos de la lune
        };
        this.showMoonInfo = true; // Option pour afficher les informations de la lune
        this.assistedControlsActive = true; // Activés par défaut
        
        // Référence à l'élément d'affichage du cargo
        this.cargoDisplayElement = document.getElementById('cargo-display');
        
        // Gestionnaire d'événements
        this.eventBus = eventBus;
        
        // État du jeu
        this.isPaused = false;
        
        // Police et style
        this.fontFamily = RENDER.FONT_FAMILY;
    }

    renderPause(ctx, canvas) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = '48px Arial';
        ctx.fillStyle = this.colors.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2);
    }

    renderRocketInfo(ctx, rocketModel) {
        ctx.font = this.font;
        ctx.fillStyle = this.colors.white;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const barWidth = 100;
        const barHeight = 10;
        const barX = 50;
        
        // Texte de santé (toujours en blanc)
        ctx.fillText(`❤️:`, 20, 20);
        
        // Barre de santé
        const barYHealth = 25;
        
        // Fond de la barre
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barYHealth, barWidth, barHeight);
        
        // Barre de progression pour la santé
        const health = Math.floor(rocketModel.health);
        if (health < 30) {
            ctx.fillStyle = this.colors.red;
        } else if (health < 70) {
            ctx.fillStyle = this.colors.orange;
        } else {
            ctx.fillStyle = this.colors.green;
        }
        const healthWidth = (health / ROCKET.MAX_HEALTH) * barWidth;
        ctx.fillRect(barX, barYHealth, healthWidth, barHeight);
        
        // Retour à la couleur blanche pour le texte
        ctx.fillStyle = this.colors.white;
        
        // Afficher le carburant
        ctx.fillText(`🛢️:`, 20, 50);
        
        // Barre de carburant
        const barYFuel = 55;
        
        // Fond de la barre
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barYFuel, barWidth, barHeight);
        
        // Barre de progression pour le carburant
        const fuel = rocketModel.fuel;
        const fuelPercentage = (fuel / ROCKET.FUEL_MAX) * 100;
        
        // Changer la couleur en fonction du niveau de carburant
        if (fuelPercentage < 30) {
            ctx.fillStyle = this.colors.red;
        } else if (fuelPercentage < 70) {
            ctx.fillStyle = this.colors.orange;
        } else {
            ctx.fillStyle = this.colors.green;
        }
        
        const fuelWidth = (fuel / ROCKET.FUEL_MAX) * barWidth;
        ctx.fillRect(barX, barYFuel, fuelWidth, barHeight);
        
        // Retour à la couleur blanche pour le texte
        ctx.fillStyle = this.colors.white;
        
        // Calculer et afficher la vitesse
        const speed = this.calculateSpeed(rocketModel);
        this.renderSpeed(ctx, speed, 20, 80);

        // --- Affichage de l'accélération gravitationnelle ---
        if (window.physicsController && window.physicsController.physicsVectors) {
            const acc = window.physicsController.physicsVectors.getTotalAcceleration();
            const accNorm = Math.sqrt(acc.x * acc.x + acc.y * acc.y);
            ctx.fillStyle = this.colors.white;
            ctx.fillText(`a: ${accNorm.toFixed(2)} m/s²`, 20, 110);
        }
    }

    calculateSpeed(rocketModel) {
        if (!rocketModel || !rocketModel.velocity) return 0;
        
        // Calculer la vitesse absolue (amplitude du vecteur vitesse)
        const vx = rocketModel.velocity.x;
        const vy = rocketModel.velocity.y;
        
        // On utilise la vitesse absolue pour l'affichage de la jauge
        // C'est plus représentatif de l'état réel de la fusée
        return Math.sqrt(vx * vx + vy * vy);
    }

    renderSpeed(ctx, speed, x, y) {
        // Texte de vitesse (toujours en blanc)
        ctx.fillStyle = this.colors.white;
        ctx.fillText(`🚀:`, x, y);
        
        // Barre de vitesse
        const barWidth = 100;
        const barHeight = 10;
        const barX = 50;
        const barYSpeed = y + 5;
        
        // Fond de la barre (gris clair)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(barX, barYSpeed, barWidth, barHeight);
        
        // Paramètres pour l'échelle exponentielle
        const maxDisplaySpeed = 80000.0;        // Réduit la vitesse maximale à afficher
        const threshold = 0.1;              // Seuil pour la vitesse "nulle"
        const exponent = 0.5;               // Exposant pour l'échelle (racine carrée)
        
        // Limiter la vitesse à la plage d'affichage
        const displaySpeed = Math.min(Math.abs(speed), maxDisplaySpeed);
        
        // Log de débogage
        //console.log(`Vitesse: ${speed.toFixed(2)}, Vitesse affichée: ${displaySpeed.toFixed(2)}`);
        
        // Si la vitesse est quasi-nulle, on garde la barre vide
        if (displaySpeed < threshold) {
            return;
        }
        
        // Calcul du ratio de vitesse avec échelle non linéaire (racine carrée)
        const speedRatio = Math.pow(displaySpeed, exponent) / Math.pow(maxDisplaySpeed, exponent);
        
        // Calcul de la largeur de la partie "pleine" de la barre
        const filledWidth = speedRatio * barWidth;
        
        // Détermination de la couleur basée sur la vitesse
        let barColor;
        const speedPercentage = (displaySpeed / maxDisplaySpeed) * 100;
        
        // Log de débogage
        //console.log(`Pourcentage de vitesse: ${speedPercentage.toFixed(2)}%`);
        
        if (speedPercentage < 20) {
            barColor = this.colors.green;    // Vert pour vitesses faibles
        } else if (speedPercentage < 50) {
            barColor = this.colors.orange;   // Orange pour vitesses moyennes
        } else {
            barColor = this.colors.red;      // Rouge pour vitesses élevées
        }
        
        // Dessiner la partie "pleine" de la barre
        ctx.fillStyle = barColor;
        ctx.fillRect(barX, barYSpeed, filledWidth, barHeight);
    }

    renderLandingGuidance(ctx, canvas, rocketModel, universeModel) {
        if (!rocketModel.isLanded) {
            const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
            if (earth) {
                const dx = rocketModel.position.x - earth.position.x;
                const dy = rocketModel.position.y - earth.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = rocketModel.radius + earth.radius + earth.atmosphere.height;
                
                if (distance < minDistance + 100) {
                    const surfaceAngle = Math.atan2(dy, dx);
                    const rocketOrientation = rocketModel.angle % (Math.PI * 2);
                    const isUpright = Math.abs(rocketOrientation - (surfaceAngle - Math.PI/2)) < Math.PI/4 || 
                                    Math.abs(rocketOrientation - (surfaceAngle - Math.PI/2) - Math.PI*2) < Math.PI/4;
                    
                    if (!rocketModel.isLanded && rocketModel.velocity.y > 0.1) {
                        ctx.textAlign = 'center';
                        if (!isUpright) {
                            ctx.fillStyle = this.colors.red;
                        } else {
                            ctx.fillStyle = this.colors.green;
                            ctx.fillText('Orientation correcte', canvas.width / 2, 110);
                        }
                        
                        const speed = this.calculateSpeed(rocketModel);
                        if (Math.abs(speed) > 1.0) {
                            ctx.fillStyle = this.colors.red;
                        }
                    }
                }
            }
        }
    }

    renderLandingSuccess(ctx, canvas, rocketModel) {
        ctx.font = '24px Arial';
        ctx.fillStyle = this.colors.success;
        ctx.textAlign = 'center';
        
        // Adapter le message en fonction de l'astre où on a atterri
        const landedOn = rocketModel.landedOn || 'un corps céleste';
        ctx.fillText(`Vous êtes posé sur ${landedOn}`, canvas.width / 2, 30);
        
        ctx.font = this.font;
        ctx.fillText('Utilisez les propulseurs pour décoller', canvas.width / 2, 60);
    }

    renderCrashed(ctx, canvas, rocketModel) {
        ctx.font = '24px Arial';
        ctx.fillStyle = this.colors.danger;
        ctx.textAlign = 'center';
        const crashLocation = rocketModel && rocketModel.crashedOn ? ` sur ${rocketModel.crashedOn}` : '';
        ctx.fillText(`Vous êtes crashé${crashLocation}`, canvas.width / 2, 30);
        ctx.font = 'bold 28px Arial';
        ctx.fillText('THE END', canvas.width / 2, 70);
        // Ajouter le message de redémarrage
        ctx.font = '16px Arial';
        ctx.fillStyle = this.colors.danger; // Changer la couleur pour le message de redémarrage en rouge
        ctx.fillText('Appuyez sur R pour recommencer', canvas.width / 2, 100);
    }

    renderMoonInfo(ctx, canvas, rocketModel, universeModel) {
        if (!this.showMoonInfo) return;
        
        const earth = universeModel.celestialBodies.find(body => body.name === 'Terre');
        if (!earth || !earth.moon) return;
        
        const moon = earth.moon;
        
        // Calculer la distance entre la fusée et la lune
        const dx = rocketModel.position.x - moon.position.x;
        const dy = rocketModel.position.y - moon.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Afficher les informations de distance uniquement si la fusée est proche de la lune
        const proximityThreshold = moon.radius * 10;
        if (distance < proximityThreshold) {
            ctx.font = '14px Arial';
            ctx.fillStyle = this.colors.moon;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(`Distance de la Lune: ${Math.floor(distance)} m`, canvas.width - 20, 20);
            
            // Si très proche, afficher une alerte
            if (distance < moon.radius * 3) {
                ctx.font = '18px Arial';
                ctx.fillStyle = this.colors.orange;
                ctx.textAlign = 'center';
                ctx.fillText('Proximité lunaire!', canvas.width / 2, 40);
            }
        }
    }

    // Rendre le bouton des contrôles assistés
    renderAssistedControlsButton(ctx, canvas) {
        // Position et dimensions du bouton
        const buttonWidth = 180;
        const buttonHeight = 30;
        const buttonX = 10; // Nouvelle position: à gauche
        const buttonY = canvas.height - 40; // Position en bas de l'écran

        // Dessiner le fond du bouton
        ctx.fillStyle = this.assistedControlsActive ? 'rgba(0, 150, 0, 0.7)' : 'rgba(50, 50, 150, 0.7)';
        ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Dessiner le contour du bouton
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Texte du bouton
        ctx.font = '14px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this.assistedControlsActive ? "Contrôles assistés: ON" : "Contrôles assistés: OFF", 
            buttonX + buttonWidth / 2, 
            buttonY + buttonHeight / 2
        );
        
        // Retourner les coordonnées du bouton pour la détection de clic
        return {
            x: buttonX,
            y: buttonY,
            width: buttonWidth,
            height: buttonHeight
        };
    }

    // Afficher les missions actives et le cargo dans un cadre
    renderMissionAndCargoBox(ctx, canvas, rocketModel, missions, totalCreditsEarned = 0) {
        // LOG DE DÉBOGAGE POUR LES CRÉDITS REÇUS
        // console.log(`[UIView] renderMissionAndCargoBox - totalCreditsEarned reçu: ${totalCreditsEarned}`);
        
        if (!missions && (!rocketModel || !rocketModel.cargo)) {
            return; // Ne rien faire si pas de missions et pas de cargo
        }

        // Dimensions et position (gardons les valeurs précédentes)
        const boxWidth = 125;
        const boxPadding = 8;
        const lineHeight = 16;
        const boxX = canvas.width - boxWidth - 15;
        const boxY = 15;
        let currentY = boxY + boxPadding;

        // --- Dessin des Crédits (en premier) --- 
        const creditsStartY = currentY - lineHeight * 0.2; 
        ctx.fillStyle = 'gold';
        ctx.font = 'bold 14px ' + this.fontFamily;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const creditsText = `💰 ${totalCreditsEarned}`;
        ctx.fillText(creditsText, boxX + boxPadding, currentY);
        currentY += lineHeight * 1.3; // Espace après crédits
        const creditsEndY = currentY;
        
        // Ajouter un espace avant Missions
        currentY += lineHeight * 0.5;
        
        // --- Dessin des Missions --- 
        const missionsStartY = currentY;
        ctx.fillStyle = this.colors.white;
        ctx.font = 'bold 14px ' + this.fontFamily;
        ctx.fillText("Missions:", boxX + boxPadding, currentY);
        currentY += lineHeight * 1.5; // Espace après titre
        
        // --- Logique d'affichage du statut de la mission --- 
        if (rocketModel && rocketModel.isDestroyed) {
            ctx.font = 'bold 14px ' + this.fontFamily;
            ctx.fillStyle = this.colors.red; // Mettre en rouge
            ctx.fillText("Mission Ratée", boxX + boxPadding, currentY);
            currentY += lineHeight;
        } else {
            const activeMissions = missions.filter(m => m.status === 'pending');
            const missionToShow = activeMissions.length > 0 ? activeMissions[0] : null;
            if (missionToShow) {
                // ... (dessin Origine -> Dest)
                ctx.font = '14px ' + this.fontFamily;
                // Affichage coloré : point de départ en bleu, point d'arrivée en or
                const fromColor = '#00BFFF'; // Bleu clair (même que la flèche)
                const toColor = 'gold';      // Or (même que les crédits)
                const arrow = ' -> ';
                const fromText = missionToShow.from;
                const toText = missionToShow.to;
                let x = boxX + boxPadding;
                // Point de départ
                ctx.fillStyle = fromColor;
                ctx.fillText(fromText, x, currentY);
                x += ctx.measureText(fromText).width;
                // Flèche
                ctx.fillStyle = this.colors.white;
                ctx.fillText(arrow, x, currentY);
                x += ctx.measureText(arrow).width;
                // Point d'arrivée
                ctx.fillStyle = toColor;
                ctx.fillText(toText, x, currentY);
                currentY += lineHeight * 1.2;
                // ... (dessin détails cargo mission)
                const detailItems = missionToShow.requiredCargo.map(item => {
                    const cargoIcon = item.type === 'Fuel' ? '🛢️' : (item.type === 'Wrench' ? '🔧' : item.type);
                    return `${cargoIcon} x${item.quantity}`;
                });
                const detailText = `  ${detailItems.join('  ')}`; 
                ctx.fillText(detailText, boxX + boxPadding, currentY);
                currentY += lineHeight;
            } else {
                // --- Afficher "Missions réussies !" --- 
                ctx.font = 'bold 14px ' + this.fontFamily; // Mettre en gras
                ctx.fillStyle = this.colors.green; // Mettre en vert
                ctx.fillText("Missions réussies !", boxX + boxPadding, currentY);
                currentY += lineHeight;
            }
        }
        // --- Fin logique affichage statut mission ---

        const missionsEndY = currentY;
        
        // Ajouter un espace avant Cargo
        currentY += lineHeight * 0.5;

        // --- Dessin du Cargo --- 
        const cargoStartY = currentY;
        ctx.fillStyle = this.colors.white;
        ctx.font = 'bold 14px ' + this.fontFamily;
        ctx.fillText("Cargo:", boxX + boxPadding, currentY);
        currentY += lineHeight * 1.3; // Espace après titre
        
        // Contenu Cargo
        let cargoList = [];
        try { 
            if (rocketModel && rocketModel.cargo && typeof rocketModel.cargo.getCargoList === 'function') {
                cargoList = rocketModel.cargo.getCargoList();
            }
        } catch (e) { console.warn("Impossible de récupérer la liste du cargo:", e); }
        if (cargoList.length > 0) {
            cargoList.forEach(item => {
                let icon = null;
                // AJOUT: Reconnaître l'icône astronaute
                if (item.type === 'Fuel') icon = '🛢️';
                else if (item.type === 'Wrench') icon = '🔧';
                else if (item.type === '🧑‍🚀') icon = '🧑‍🚀'; // Reconnaître l'astronaute
                
                if (icon) { // Si c'est Fuel, Wrench ou Astronaute
                    const iconsPerLine = 5;
                    const totalIcons = item.quantity;
                    let linesNeeded = Math.ceil(totalIcons / iconsPerLine);
                    ctx.font = '14px ' + this.fontFamily; // S'assurer que la police est correcte pour les icônes
                    for(let i=0; i<linesNeeded; i++){
                         const iconsToShow = Math.min(iconsPerLine, totalIcons - (i * iconsPerLine));
                         const cargoText = icon.repeat(iconsToShow);
                         // Ajuster légèrement la position Y pour un meilleur alignement
                         ctx.fillText(cargoText, boxX + boxPadding + 5, currentY); 
                         currentY += lineHeight * 1.3; // Augmenter l'espacement vertical entre les lignes d'icônes
                    }
                } else { // Pour tous les autres types de cargo (texte)
                    ctx.font = '12px ' + this.fontFamily; // Police plus petite pour le texte
                    const cargoText = ` - ${item.type}: ${item.quantity}`; 
                    ctx.fillText(cargoText, boxX + boxPadding, currentY);
                    currentY += lineHeight; // Espacement normal pour le texte
                }
            });
        } else {
            ctx.fillText("Vide", boxX + boxPadding, currentY);
            currentY += lineHeight;
        }
        const cargoEndY = currentY;

        // --- Dessiner les Cadres --- 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; 
        ctx.lineWidth = 1;
        const drawSectionFrame = (startY, endY) => {
            if (startY >= endY) return; // Ne pas dessiner si vide
            const framePadding = boxPadding * 0.5;
            const frameX = boxX + framePadding / 2;
            const frameY = startY - framePadding;
            const frameWidth = boxWidth - framePadding;
            const frameHeight = (endY - startY) + framePadding * 1.5;
            ctx.beginPath();
            ctx.roundRect(frameX, frameY, frameWidth, frameHeight, 3);
            ctx.stroke();
        }

        drawSectionFrame(creditsStartY, creditsEndY);
        drawSectionFrame(missionsStartY, missionsEndY);
        drawSectionFrame(cargoStartY, cargoEndY);

        // Réinitialiser les styles
        ctx.font = this.font;
        ctx.fillStyle = this.colors.white;
    }

    /**
     * Met à jour l'affichage des icônes de cargo.
     * @param {Array<{type: string, quantity: number}>} cargoList - La liste du cargo.
     */
    updateCargoDisplay(cargoList = []) {
        if (!this.cargoDisplayElement) return;

        // Vider l'affichage actuel
        this.cargoDisplayElement.innerHTML = '';

        // Boucler sur les items du cargo
        cargoList.forEach(item => {
            let icon = '';
            let title = item.type;
            let iconsPerLine = 5; // Nombre d'icônes par ligne par défaut

            if (item.type === 'Fuel') { 
                icon = '🛢️';
                title = 'Fuel';
            } else if (item.type === 'Wrench') { 
                icon = '🔧';
                title = 'Clé à molette';
            } 
            // Ajouter d'autres types ici si besoin
            // else if (item.type === 'Autre') { ... }

            if (icon) { // Si une icône est définie
                let iconsAdded = 0;
                while (iconsAdded < item.quantity) {
                    const iconsToShow = Math.min(iconsPerLine, item.quantity - iconsAdded);
                    const lineDiv = document.createElement('div'); // Utiliser une div pour chaque ligne d'icônes
                    for (let i = 0; i < iconsToShow; i++) {
                        const span = document.createElement('span');
                        span.textContent = icon;
                        span.title = title; 
                        lineDiv.appendChild(span);
                    }
                    this.cargoDisplayElement.appendChild(lineDiv);
                    iconsAdded += iconsToShow;
                }
            } else {
                // Affichage texte pour les types inconnus
                 const lineDiv = document.createElement('div'); // Mettre aussi dans une div
                 const span = document.createElement('span');
                 // Supprimer le tiret initial et ajuster le style
                 span.textContent = `${item.type}: ${item.quantity}`;
                 span.title = title;
                 span.style.fontSize = '12px'; 
                 span.style.verticalAlign = 'middle';
                 lineDiv.appendChild(span);
                 this.cargoDisplayElement.appendChild(lineDiv);
            }
        });
        
        if (this.cargoDisplayElement.innerHTML === '') {
             this.cargoDisplayElement.textContent = 'Vide'; // Afficher "Vide" si rien dans le cargo
        }
    }

    render(ctx, canvas, rocketModel, universeModel, isPaused, activeMissions = [], totalCreditsEarned = 0) {
        // --- Affichage du texte Mission Réussie (overlay UI) ---
        if (window._missionSuccessTextTime && Date.now() - window._missionSuccessTextTime < 2500) {
            ctx.save();
            const elapsed = Date.now() - window._missionSuccessTextTime;
            ctx.globalAlpha = 1 - (elapsed / 2500) * 0.5;
            ctx.font = 'bold 54px Impact, Arial, sans-serif';
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#FFEC80';
            ctx.shadowBlur = 32;
            ctx.strokeStyle = '#B8860B';
            ctx.lineWidth = 5;
            ctx.strokeText('Mission réussie', canvas.width / 2, 150);
            ctx.fillText('Mission réussie', canvas.width / 2, 150);
            ctx.restore();
        }
        if (isPaused) {
            this.renderPause(ctx, canvas);
        } else {
            // Afficher les infos de la fusée (santé, fuel numérique, vitesse)
            if (rocketModel) {
                this.renderRocketInfo(ctx, rocketModel);
                
                // Afficher l'état d'atterrissage ou de crash
                if (rocketModel.isLanded) {
                    this.renderLandingSuccess(ctx, canvas, rocketModel);
                } else if (rocketModel.isDestroyed) {
                    this.renderCrashed(ctx, canvas, rocketModel);
                } else {
                    // Optionnel: Afficher le guide d'atterrissage
                    // this.renderLandingGuidance(ctx, canvas, rocketModel, universeModel);
                }
            }
            
            // Afficher les infos de la lune
            if (universeModel) {
                this.renderMoonInfo(ctx, canvas, rocketModel, universeModel);
            }
            
            // Afficher le bouton des contrôles assistés
            this.renderAssistedControlsButton(ctx, canvas);

            // Afficher les missions et le cargo et les crédits
            this.renderMissionAndCargoBox(ctx, canvas, rocketModel, activeMissions, totalCreditsEarned);
        }
        
    }
    
    // Basculer l'affichage des informations lunaires
    toggleMoonInfo() {
        this.showMoonInfo = !this.showMoonInfo;
        return this.showMoonInfo;
    }
    
    // Basculer les contrôles assistés
    toggleAssistedControls() {
        this.assistedControlsActive = !this.assistedControlsActive;
        return this.assistedControlsActive;
    }
    
    // Vérifier si un point est dans les limites du bouton des contrôles assistés
    isPointInAssistedControlsButton(x, y) {
        if (!this.assistedControlsButtonBounds) return false;
        
        const bounds = this.assistedControlsButtonBounds;
        return (
            x >= bounds.x && 
            x <= bounds.x + bounds.width && 
            y >= bounds.y && 
            y <= bounds.y + bounds.height
        );
    }

    // Fonction helper pour dessiner les cadres de section
    drawSectionFrame(ctx, boxX, boxWidth, boxPadding, lineWidth, color, radius, startY, endY) {
        if (startY >= endY) return; // Ne pas dessiner si la section est vide
        
        // Ajuster le padding horizontal pour élargir le cadre
        const verticalPadding = boxPadding * 0.5;
        const horizontalPadding = boxPadding * 0.3; // Réduire le padding horizontal
        
        const frameX = boxX + horizontalPadding; // Commencer plus près du bord gauche
        const frameY = startY - verticalPadding * 0.7; // Garder le padding vertical
        const frameWidth = boxWidth - horizontalPadding * 2; // Rendre plus large
        const frameHeight = (endY - startY) + verticalPadding * 1.5; 
        
        ctx.save(); 
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.roundRect(frameX, frameY, frameWidth, frameHeight, radius);
        ctx.stroke();
        ctx.restore(); 
    }
} 