/**
 * @fileoverview Gère le rendu de l'interface utilisateur (UI) sur le canvas principal.
 * Affiche des informations telles que l'état de la fusée (santé, carburant, vitesse, accélération),
 * l'état du jeu (pause, atterri, crashé), les missions, le cargo, les crédits,
 * et des éléments contextuels comme la distance aux objets célestes ou les boutons.
 *
 * @class UIView
 * @depend {EventBus} - Reçu pour une potentielle communication future, mais pas activement utilisé pour les abonnements dans cette version.
 * @depend {RocketModel} - Données de la fusée requises par la méthode `render`.
 * @depend {UniverseModel} - Données de l'univers (corps célestes) requises par `render`.
 * @depend {Array<Mission>} - Liste des missions actives requise par `render`.
 * @depend {PhysicsVectors} - (Optionnel) Informations sur les vecteurs physiques (ex: accélération) requises par `render`.
 * @depend {constants.js} - Utilise les constantes ROCKET, RENDER.
 *
 * @info La gestion des interactions utilisateur (ex: clic sur le bouton 'Contrôles assistés')
 * n'est PAS gérée ici mais devrait l'être par `InputController`, qui peut demander
 * les coordonnées des éléments dessinés si nécessaire ou réagir à des événements.
 */
class UIView {
    /**
     * Crée une instance de UIView.
     * @param {EventBus} eventBus - Le bus d'événements pour la communication (potentiellement future).
     */
    constructor(eventBus) {
        this.eventBus = eventBus; // Utilisé pour émettre/écouter des événements UI

        // Styles par défaut
        this.fontFamily = 'Arial'; // Utiliser une seule source pour la famille de police
        this.font = `16px ${this.fontFamily}`;
        this.colors = {
            white: 'white',
            red: 'red',
            orange: 'orange',
            green: 'green',
            success: 'rgba(0, 255, 0, 0.8)',
            danger: 'rgba(255, 0, 0, 0.8)',
            moon: 'rgba(200, 200, 200, 0.9)',
            info: '#00BFFF', // Bleu clair pour infos (ex: départ mission)
            gold: 'gold',    // Pour crédits, destination mission
            barBackground: 'rgba(255, 255, 255, 0.3)',
            buttonBorder: 'white',
            frameBorder: 'rgba(255, 255, 255, 0.8)',
        };

        // État interne de l'UI (certains pourraient être gérés via EventBus à terme)
        this.showMoonInfo = true;
        this.missionSuccessFadeTime = 0; // Timestamp de la dernière réussite de mission pour l'effet de fade
        this.missionSuccessDuration = 2500; // Durée de l'affichage "Mission Réussie" (ms)

        // États d'affichage des écrans modaux
        this.uiState = {
            showLoadingScreen: false,
            showMainMenuScreen: false,
            showPauseMenuScreen: false,
            showGameOverScreen: false,
            // Potentiellement d'autres états UI spécifiques ici
        };

        this.subscribeToEvents();

        // Brancher un gestionnaire de clic global et le relayer via EventBus (découplage InputController/UI)
        const onClick = (ev) => {
            if (!this.eventBus || !window.EVENTS || !window.EVENTS.UI || !window.EVENTS.UI.UPDATE) return;
            this.eventBus.emit(window.EVENTS.UI.UPDATE, { type: 'canvas_click', x: ev.clientX, y: ev.clientY });
        };
        window.addEventListener('click', onClick);
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(() => window.removeEventListener('click', onClick));
        }
    }

    subscribeToEvents() {
        if (!this.eventBus || !window.EVENTS || !window.EVENTS.UI) {
            console.warn("[UIView] EventBus ou EVENTS.UI non disponibles, abonnements aux états UI désactivés.");
            return;
        }

        // Chargement
        if (EVENTS.UI.SHOW_LOADING_SCREEN) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.SHOW_LOADING_SCREEN, () => {
                    this.uiState.showLoadingScreen = true;
                    this.uiState.showMainMenuScreen = false;
                    this.uiState.showPauseMenuScreen = false;
                    this.uiState.showGameOverScreen = false;
                    console.log("[UIView] Affichage: Écran de chargement");
                })
            );
        }

        // Menu Principal
        if (EVENTS.UI.SHOW_MAIN_MENU) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.SHOW_MAIN_MENU, () => {
                    this.uiState.showLoadingScreen = false;
                    this.uiState.showMainMenuScreen = true;
                    this.uiState.showPauseMenuScreen = false;
                    this.uiState.showGameOverScreen = false;
                    console.log("[UIView] Affichage: Menu principal");
                })
            );
        }
        if (EVENTS.UI.HIDE_MAIN_MENU) { // Bien que SHOW_XXX met les autres à false, un HIDE explicite peut être utile
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.HIDE_MAIN_MENU, () => {
                    this.uiState.showMainMenuScreen = false;
                    console.log("[UIView] Cache: Menu principal");
                })
            );
        }

        // Menu Pause
        if (EVENTS.UI.SHOW_PAUSE_MENU) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.SHOW_PAUSE_MENU, () => {
                    // Le menu pause se superpose, il ne cache pas nécessairement les autres états principaux
                    this.uiState.showPauseMenuScreen = true;
                    console.log("[UIView] Affichage: Menu pause");
                })
            );
        }
        if (EVENTS.UI.HIDE_PAUSE_MENU) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.HIDE_PAUSE_MENU, () => {
                    this.uiState.showPauseMenuScreen = false;
                    console.log("[UIView] Cache: Menu pause");
                })
            );
        }

        // Game Over
        if (EVENTS.UI.SHOW_GAME_OVER_SCREEN) {
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.SHOW_GAME_OVER_SCREEN, () => {
                    this.uiState.showLoadingScreen = false;
                    this.uiState.showMainMenuScreen = false;
                    this.uiState.showPauseMenuScreen = false; // Game Over prime sur la pause
                    this.uiState.showGameOverScreen = true;
                    console.log("[UIView] Affichage: Écran Game Over");
                })
            );
        }
        if (EVENTS.UI.HIDE_GAME_OVER_SCREEN) { // Pourrait être appelé si on retourne au menu principal depuis Game Over
            window.controllerContainer.track(
                this.eventBus.subscribe(EVENTS.UI.HIDE_GAME_OVER_SCREEN, () => {
                    this.uiState.showGameOverScreen = false;
                    console.log("[UIView] Cache: Écran Game Over");
                })
            );
        }
    }

    // --- Méthodes de Rendu Publiques ---

    /**
     * Méthode de rendu principale. Appelle les méthodes de rendu spécifiques.
     * @param {CanvasRenderingContext2D} ctx - Le contexte de rendu 2D.
     * @param {HTMLCanvasElement} canvas - L'élément canvas.
     * @param {RocketModel | null} rocketModel - Le modèle de la fusée, ou null.
     * @param {UniverseModel | null} universeModel - Le modèle de l'univers, ou null.
     * @param {boolean} isPaused - Indique si le jeu est en pause.
     * @param {Array<Mission>} [activeMissions=[]] - Les missions en cours.
     * @param {number} [totalCreditsEarned=0] - Le total des crédits gagnés.
     * @param {Vector | null} [totalAcceleration=null] - Le vecteur d'accélération total subi par la fusée (optionnel).
     * @param {boolean} [missionJustSucceeded=false] - Indique si une mission vient d'être réussie (pour l'effet).
     */
    render(ctx, canvas, rocketModel, universeModel, isPaused, activeMissions = [], totalCreditsEarned = 0, totalAcceleration = null, missionJustSucceeded = false) {
        // Gestion de l'effet "Mission Réussie" - exécutée en premier
        if (missionJustSucceeded && this.missionSuccessFadeTime === 0) {
            this.missionSuccessFadeTime = Date.now();
            // console.log("[UIView] missionJustSucceeded est true, déclenchement de l'affichage.");
        }

        if (this.missionSuccessFadeTime > 0) {
            const stillShowSuccessMessage = Date.now() - this.missionSuccessFadeTime <= this.missionSuccessDuration;
            if (stillShowSuccessMessage) {
                this._renderMissionSuccessText(ctx, canvas);
            } else {
                this.missionSuccessFadeTime = 0; // Réinitialiser après la fin de l'effet
                // console.log("[UIView] Fin de l'affichage Mission Réussie.");
            }
        }

        // Afficher les écrans modaux en priorité
        if (this.uiState.showLoadingScreen) {
            this._renderLoadingScreen(ctx, canvas);
            return; // Ne rien afficher d'autre
        }

        // Menu principal désactivé

        if (this.uiState.showGameOverScreen) {
            this._renderGameOverScreen(ctx, canvas, rocketModel); // rocketModel pour afficher des infos de score par ex.
            return; // Ne rien afficher d'autre
        }

        // Si aucun écran modal plein n'est affiché, dessiner l'UI du jeu
        // Le menu pause peut se superposer au jeu
        if (this.uiState.showPauseMenuScreen) {
            this._renderPauseMenuScreen(ctx, canvas);
            // En pause, on pourrait décider de ne pas afficher les autres infos du jeu ci-dessous,
            // ou de les afficher en fond. Pour l'instant, on les affiche.
        }

        // Afficher les infos de la fusée (santé, fuel, vitesse, accélération)
        // Ne pas afficher si un écran modal est actif (géré par les return ci-dessus) 
        // ou si le menu pause doit cacher ces infos (actuellement, il ne le fait pas)
        if (rocketModel) {
            this._renderRocketInfo(ctx, rocketModel, totalAcceleration);
        }

        // Afficher l'état d'atterrissage ou de crash
        // La logique de Game Over est maintenant gérée par _renderGameOverScreen
        // On garde _renderFlightStatus pour "Posé sur..."
        if (!this.uiState.showGameOverScreen) { // Ne pas afficher si l'écran Game Over est déjà là
             this._renderFlightStatus(ctx, canvas, rocketModel);
        }

        // (Affichage distance/proximité Lune supprimé)

        // Afficher les missions, le cargo et les crédits
        this._renderMissionAndCargoBox(ctx, canvas, rocketModel, activeMissions, totalCreditsEarned);
    }

    // --- Méthodes de Rendu Privées (Convention: préfixe _) ---

    /** @private Affiche le message de pause. */
    _renderPauseMenuScreen(ctx, canvas) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = `48px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }

    /** @private Affiche l'écran de chargement. */
    _renderLoadingScreen(ctx, canvas) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `36px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Chargement en cours...', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }

    // _renderMainMenuScreen supprimé (menu principal désactivé)

    /** @private Affiche l'écran de Game Over. */
    _renderGameOverScreen(ctx, canvas, rocketModel) {
        ctx.save();
        ctx.fillStyle = 'rgba(50, 0, 0, 0.7)'; // Fond rouge sombre
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `bold 48px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.danger;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);

        // Afficher la raison du crash si disponible (déjà dans _renderFlightStatus, mais on le spécialise ici)
        let reason = '';
        if (rocketModel && rocketModel.isDestroyed) {
            const bodyName = rocketModel.attachedTo || rocketModel.landedOn;
            const crashedOnText = bodyName ? ` sur ${bodyName}` : '';
            reason = `Crashé${crashedOnText}`;
            ctx.font = `20px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.white;
            ctx.fillText(reason, canvas.width / 2, canvas.height / 2 + 20);
        }
        
        ctx.font = `18px ${this.fontFamily}`;
        ctx.fillStyle = this.colors.white;
        ctx.fillText('Appuyez sur R pour recommencer', canvas.width / 2, canvas.height / 2 + 60);
        ctx.restore();
    }

    /** @private Affiche les informations principales de la fusée. */
    _renderRocketInfo(ctx, rocketModel, totalAcceleration) {
        ctx.save();
        ctx.font = this.font;
        ctx.fillStyle = this.colors.white;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const barWidth = 100;
        const barHeight = 10;
        const startX = 20;
        const labelX = startX;
        const barX = labelX + 30; // Espace pour l'icône/label

        // --- Santé ---
        const healthY = 20;
        ctx.fillText(`❤️:`, labelX, healthY);
        this._renderProgressBar(ctx, barX, healthY + 5, barWidth, barHeight, rocketModel.health, ROCKET.MAX_HEALTH);

        // --- Carburant ---
        const fuelY = 50;
        ctx.fillText(`🛢️:`, labelX, fuelY);
        this._renderProgressBar(ctx, barX, fuelY + 5, barWidth, barHeight, rocketModel.fuel, ROCKET.FUEL_MAX);

        // --- Vitesse ---
        const speedY = 80;
        const speed = this._calculateSpeed(rocketModel);
        ctx.fillText(`🚀:`, labelX, speedY);
        this._renderSpeedBar(ctx, speed, barX, speedY + 5, barWidth, barHeight);

        // --- Accélération ---
        /* // Suppression de l'affichage de l'accélération
        const accelerationY = 110;
        if (totalAcceleration) {
            const accNorm = Math.sqrt(totalAcceleration.x * totalAcceleration.x + totalAcceleration.y * totalAcceleration.y);
            // Formatter l'accélération pour être plus lisible (ex: k pour milliers)
            let accText = accNorm.toFixed(2);
            if (accNorm > 1000) {
                 accText = (accNorm / 1000).toFixed(1) + 'k';
            } else if (accNorm > 100) {
                 accText = Math.round(accNorm).toString();
            }
            ctx.fillText(`a: ${accText} m/s²`, labelX, accelerationY);
        } else {
             ctx.fillText(`a: --- m/s²`, labelX, accelerationY); // Indiquer si non disponible
        }
        */

        ctx.restore();
    }

    /** @private Dessine une barre de progression générique. */
    _renderProgressBar(ctx, x, y, width, height, currentValue, maxValue) {
        const ratio = Math.max(0, Math.min(1, currentValue / maxValue));
        const filledWidth = ratio * width;

        // Fond de la barre
        ctx.fillStyle = this.colors.barBackground;
        ctx.fillRect(x, y, width, height);

        // Barre de progression
        if (ratio < 0.3) {
            ctx.fillStyle = this.colors.red;
        } else if (ratio < 0.7) {
            ctx.fillStyle = this.colors.orange;
        } else {
            ctx.fillStyle = this.colors.green;
        }
        ctx.fillRect(x, y, filledWidth, height);
    }

    /** @private Calcule la vitesse scalaire de la fusée. */
    _calculateSpeed(rocketModel) {
        if (!rocketModel || !rocketModel.velocity) return 0;
        const vx = rocketModel.velocity.x;
        const vy = rocketModel.velocity.y;
        return Math.sqrt(vx * vx + vy * vy);
    }

    /** @private Dessine la barre de vitesse avec une échelle non linéaire. */
    _renderSpeedBar(ctx, speed, x, y, width, height) {
        // Fond de la barre
        ctx.fillStyle = this.colors.barBackground;
        ctx.fillRect(x, y, width, height);

        // Paramètres pour l'échelle exponentielle (ajustés pour la sensibilité)
        const maxDisplaySpeed = 80000.0; // Vitesse correspondant à 100% de la barre
        const threshold = 0.1;           // Vitesse minimale pour afficher quelque chose
        const exponent = 0.5;            // Exposant (0.5 = racine carrée, rend les basses vitesses plus visibles)

        const displaySpeed = Math.min(Math.abs(speed), maxDisplaySpeed);

        if (displaySpeed < threshold) {
            return; // Barre reste vide si vitesse trop faible
        }

        // Calcul du ratio non linéaire
        const speedRatio = Math.pow(displaySpeed / maxDisplaySpeed, exponent);
        const filledWidth = speedRatio * width;

        // Couleur basée sur la vitesse *absolue* (pas le ratio affiché)
        let barColor;
        const speedPercentage = (Math.abs(speed) / PHYSICS.CRASH_SPEED_THRESHOLD) * 100; // Comparer à un seuil significatif

        if (speedPercentage < 30) { // Vitesse très sûre
            barColor = this.colors.green;
        } else if (speedPercentage < 80) { // Vitesse modérée
            barColor = this.colors.orange;
        } else { // Vitesse dangereuse
            barColor = this.colors.red;
        }

        // Dessiner la partie "pleine"
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, filledWidth, height);
    }

    /** @private Affiche l'état de vol (atterri, crashé) ou rien si en vol normal. */
    _renderFlightStatus(ctx, canvas, rocketModel) {
        if (!rocketModel) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        if (rocketModel.isLanded) {
            const landedOn = rocketModel.landedOn || 'un corps céleste';
            // Message principal
            ctx.font = `24px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.success;
            ctx.fillText(`Posé sur ${landedOn}`, canvas.width / 2, 30);
            // Instruction
            ctx.font = `16px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.white; // Instruction en blanc
            ctx.fillText('Utilisez les propulseurs pour décoller', canvas.width / 2, 60);

        } else if (rocketModel.isDestroyed) {
            const bodyName = rocketModel.attachedTo || rocketModel.landedOn;
            const crashedOn = bodyName ? ` sur ${bodyName}` : '';
            // Message principal
            ctx.font = `24px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.danger;
            ctx.fillText(`Crashé${crashedOn}`, canvas.width / 2, 30);
            // Message de fin
            ctx.font = `bold 28px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.danger;
            ctx.fillText('GAME OVER', canvas.width / 2, 70);
            // Instruction de redémarrage
            ctx.font = `16px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.white; // Instruction en blanc
            ctx.fillText('Appuyez sur R pour recommencer', canvas.width / 2, 100);
        }
        // Aucune indication spécifique si en vol normal (ancien renderLandingGuidance supprimé)
        ctx.restore();
    }

    /** @private Affiche la boîte contenant les crédits, missions et cargo. */
    _renderMissionAndCargoBox(ctx, canvas, rocketModel, missions, totalCreditsEarned) {
        if (!missions && (!rocketModel || !rocketModel.cargo)) {
            return; // Ne rien afficher si aucune info pertinente
        }

        ctx.save();
        const boxWidth = 125;
        const boxPadding = 6 ;
        const lineHeight = 15; // Hauteur de ligne de base
        const boxX = canvas.width - boxWidth - 15;
        const boxY = 15;
        let currentY = boxY + boxPadding; // Position Y courante pour dessiner
        let sectionStartY = currentY;

        // --- Section Crédits ---
        sectionStartY = currentY;
        // Note: _renderCreditsSection n'a pas besoin de retourner currentY car elle est simple
        this._renderCreditsSection(ctx, boxX, boxPadding, currentY, lineHeight, totalCreditsEarned);
        currentY += lineHeight * 1.8; // Espace après crédits (fixe pour cette section)
        let creditsEndY = currentY - lineHeight * 0.7;
        this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding,1, this.colors.frameBorder, 3, sectionStartY, creditsEndY);

        // --- Section Missions ---
        const missionsRenderNeeded = (missions && missions.length > 0) || (rocketModel && rocketModel.isDestroyed);
        if (missionsRenderNeeded) {
            sectionStartY = currentY;
            let missionsEndY = this._renderMissionsSection(ctx, boxX, boxPadding, currentY, lineHeight, missions, rocketModel);
            // Ajouter un petit padding au bottom avant de dessiner le cadre
            missionsEndY -= lineHeight * 0.2;
             this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding, 1, this.colors.frameBorder, 3, sectionStartY, missionsEndY);
             currentY = missionsEndY + lineHeight * 0.5; // Mettre à jour currentY pour la section suivante
        }

        // --- Section Cargo ---
        const cargoRenderNeeded = rocketModel && rocketModel.cargo && rocketModel.cargo.getCargoList().length > 0;
        if (cargoRenderNeeded) {
             sectionStartY = currentY;
             let cargoEndY = this._renderCargoSection(ctx, boxX, boxPadding, currentY, lineHeight, rocketModel);
             // Ajouter un petit padding au bottom avant de dessiner le cadre
             cargoEndY += lineHeight * 0.3;
             this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding, 1, this.colors.frameBorder, 3, sectionStartY, cargoEndY);
             currentY = cargoEndY + lineHeight * 0.3; // Mettre à jour currentY au cas où il y aurait d'autres sections
        }

        // --- Dessiner les cadres pour chaque section --- (Déplacé DANS chaque section)
        // this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding, 1, this.colors.frameBorder, 3, creditsStartY, creditsEndY);
        // // Ne dessiner le cadre Missions que s'il y a du contenu ou un statut à afficher
        // if (missions && missions.length > 0 || (rocketModel && rocketModel.isDestroyed)) {
        //      this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding, 1, this.colors.frameBorder, 3, missionsStartY, missionsEndY);
        // }
        // // Ne dessiner le cadre Cargo que s'il y a du contenu
        // if (rocketModel && rocketModel.cargo && rocketModel.cargo.getCargoList().length > 0) {
        //     this._drawSectionFrame(ctx, boxX, boxWidth, boxPadding, 1, this.colors.frameBorder, 3, cargoStartY, cargoEndY);
        // }

        ctx.restore();
    }

     /** @private Affiche la section des crédits. */
    _renderCreditsSection(ctx, boxX, boxPadding, startY, lineHeight, totalCreditsEarned) {
        ctx.fillStyle = this.colors.gold;
        ctx.font = `bold 14px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const creditsText = `💰 ${totalCreditsEarned}`;
        ctx.fillText(creditsText, boxX + boxPadding, startY);
    }

    /** @private Affiche la section des missions. Retourne la nouvelle position Y. */
    _renderMissionsSection(ctx, boxX, boxPadding, startY, lineHeight, missions, rocketModel) {
        let currentY = startY;
        ctx.fillStyle = this.colors.white;
        ctx.font = `bold 14px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText("Missions:", boxX + boxPadding, currentY);
        currentY += lineHeight * 1.5;

        const activeMissions = missions ? missions.filter(m => m.status === 'pending') : [];
        const completedMissions = missions ? missions.filter(m => m.status === 'completed') : [];
        const allMissionsCompleted = missions && activeMissions.length === 0 && missions.length > 0;

        if (rocketModel && rocketModel.isDestroyed) {
            ctx.font = `bold 14px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.red;
            ctx.fillText("Mission Ratée", boxX + boxPadding, currentY);
            currentY += lineHeight;
        } else if (activeMissions.length > 0) {
            const missionToShow = activeMissions[0]; // Afficher la première mission active
            ctx.font = `14px ${this.fontFamily}`;

            // Origine -> Destination
            const fromText = missionToShow.from;
            const toText = missionToShow.to;
            const arrow = ' -> ';
            let currentX = boxX + boxPadding;
            ctx.fillStyle = this.colors.info; // Bleu pour départ
            ctx.fillText(fromText, currentX, currentY);
            currentX += ctx.measureText(fromText).width;
            ctx.fillStyle = this.colors.white; // Flèche blanche
            ctx.fillText(arrow, currentX, currentY);
            currentX += ctx.measureText(arrow).width;
            ctx.fillStyle = this.colors.gold; // Or pour destination
            ctx.fillText(toText, currentX, currentY);
            currentY += lineHeight * 1.2;

            // Détails Cargo Requis
            const detailItems = missionToShow.requiredCargo.map(item => {
                const cargoIcon = this._getCargoIcon(item.type);
                return `${cargoIcon} x${item.quantity}`;
            });
            const detailText = `  ${detailItems.join('  ')}`;
            ctx.fillStyle = this.colors.white; // Détails en blanc
            ctx.fillText(detailText, boxX + boxPadding, currentY);
            currentY += lineHeight;

        } else if (allMissionsCompleted) {
            ctx.font = `bold 14px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.green;
            ctx.fillText("Missions réussies !", boxX + boxPadding, currentY);
            currentY += lineHeight;
        } else {
            // Aucune mission active ou terminée à afficher (pourrait être le début du jeu)
            ctx.font = `12px ${this.fontFamily}`;
            ctx.fillStyle = this.colors.white;
            ctx.fillText("Aucune mission", boxX + boxPadding, currentY);
            currentY += lineHeight;
        }
        return currentY; // Retourne la position Y pour la section suivante
    }

     /** @private Affiche la section du cargo. Retourne la nouvelle position Y. */
    _renderCargoSection(ctx, boxX, boxPadding, startY, lineHeight, rocketModel) {
        let currentY = startY;
        if (!rocketModel || !rocketModel.cargo || rocketModel.cargo.getCargoList().length === 0) {
            // Optionnel: afficher "Cargo: Vide" ou juste ne rien afficher et ne pas dessiner le cadre
            ctx.fillStyle = this.colors.white;
            ctx.font = `bold 14px ${this.fontFamily}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText("Cargo:", boxX + boxPadding, currentY);
            currentY += lineHeight * 1.3;
            ctx.font = `12px ${this.fontFamily}`;
            ctx.fillText("Vide", boxX + boxPadding + 5, currentY);
            currentY += lineHeight;
            return currentY;
        }

        ctx.fillStyle = this.colors.white;
        ctx.font = `bold 14px ${this.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText("Cargo:", boxX + boxPadding, currentY);
        // Avancer l'ordonnée avant de dessiner les icônes
        currentY += lineHeight * 1.3;
        // Hauteur de la première ligne d'icônes
        let currentLineY = currentY;

        const cargoList = rocketModel.cargo.getCargoList();
        const iconsPerLine = 5;
        const iconSpacing = 20;
        const iconStartX = boxX + boxPadding + 5;
        const iconYIncrement = lineHeight * 1.1;

        cargoList.forEach(item => {
            const icon = this._getCargoIcon(item.type);
            if (icon) { // Affichage par icônes
                ctx.font = `14px ${this.fontFamily}`;
                let iconCount = 0;
                let currentLineX = iconStartX;

                if (item.quantity > 0) {
                    for (let i = 0; i < item.quantity; i++) {
                        if (iconCount > 0 && iconCount % iconsPerLine === 0) {
                            iconCount = 0;
                            currentLineX = iconStartX;
                            currentLineY += iconYIncrement;
                        }
                        ctx.fillText(icon, currentLineX, currentLineY);
                        currentLineX += iconSpacing;
                        iconCount++;
                    }
                    // Descendre d'une ligne après avoir dessiné toutes les icônes de ce type
                    currentLineY += iconYIncrement;
                    currentY = currentLineY;
                }

            } else { // Affichage texte pour les autres types
                ctx.font = `12px ${this.fontFamily}`;
                const cargoText = ` - ${item.type}: ${item.quantity}`;
                ctx.fillText(cargoText, boxX + boxPadding, currentY);
                currentY += lineHeight; // Espacement normal pour le texte
            }
        });
        return currentY; // Retourne la position Y finale
    }

    /** @private Retourne l'icône correspondant à un type de cargo. */
    _getCargoIcon(type) {
        switch (type) {
            case 'Fuel': return '🛢️';
            case 'Wrench': return '🔧';
            case '🧑‍🚀': return '🧑‍🚀'; // Astronaute
            // Ajouter d'autres types ici
            default: return null; // Pas d'icône définie pour ce type
        }
    }

     /** @private Affiche le texte "Mission Réussie" avec un effet de fondu. */
    _renderMissionSuccessText(ctx, canvas) {
        if (this.missionSuccessFadeTime === 0) return;

        const elapsed = Date.now() - this.missionSuccessFadeTime;
        if (elapsed >= this.missionSuccessDuration) {
            this.missionSuccessFadeTime = 0;
            return;
        }

        ctx.save();
        // Calcul de l'alpha pour le fondu (fade out)
        const progress = elapsed / this.missionSuccessDuration;
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.5); // Fade out plus rapide

        // Style du texte
        ctx.font = 'bold 54px Impact, Arial, sans-serif';
        ctx.fillStyle = this.colors.gold; // Doré
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Ombre portée pour la lisibilité
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;

        // Optionnel: Contour léger
        // ctx.strokeStyle = '#B8860B'; // Or foncé
        // ctx.lineWidth = 2;
        // ctx.strokeText('Mission Réussie', canvas.width / 2, 150);

        // Texte principal
        ctx.fillText('Mission Réussie !', canvas.width / 2, 150);

        ctx.restore();
    }

    /**
     * @private Fonction helper pour dessiner les cadres arrondis des sections.
     * Utilise la méthode roundRect si disponible, sinon dessine un rectangle simple.
    */
    _drawSectionFrame(ctx, x, width, padding, lineWidth, color, radius, startY, endY) {
        if (startY >= endY) return; // Ne pas dessiner si la section est vide ou invalide

        const framePaddingV = padding * 0.5;
        const framePaddingH = padding * 0.3;

        const frameX = x + framePaddingH;
        const frameY = startY - framePaddingV * 0.8; // Ajuster position Y
        const frameWidth = width - framePaddingH * 2;
        const frameHeight = (endY - startY) + framePaddingV * 1.5; // Ajuster hauteur

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        // Vérifier si roundRect est supporté
        if (ctx.roundRect) {
            ctx.roundRect(frameX, frameY, frameWidth, frameHeight, radius);
        } else {
            // Fallback si roundRect n'est pas supporté
            ctx.rect(frameX, frameY, frameWidth, frameHeight);
        }
        ctx.stroke();
        ctx.restore();
    }


    // --- Méthodes de Contrôle de l'UI ---

    /** Bascule l'affichage des informations lunaires. */
    toggleMoonInfo() {
        this.showMoonInfo = !this.showMoonInfo;
        console.log("Affichage infos Lune:", this.showMoonInfo ? "Activé" : "Désactivé");
        // Note: Idéalement, l'état devrait être synchronisé via EventBus ou contrôleur principal.
    }

    /**
     * Met à jour l'état d'affichage des contrôles assistés.
     * Devrait être appelée par un contrôleur via EventBus lorsque l'état change réellement.
     * @param {boolean} isActive - Le nouvel état des contrôles assistés.
     */
    // setAssistedControlsActive(isActive) {
    //     // console.log(`[UIView] setAssistedControlsActive appelé avec: ${isActive}, ancien état: ${this.assistedControlsActive}`);
    //     // Cette méthode est maintenant contournée au profit d'un système d'événements.
    //     // Elle est conservée au cas où elle serait utilisée par d'autres parties du code
    //     // ou pour des tests directs, mais GameController ne l'appelle plus.
    //     console.warn("[UIView.setAssistedControlsActive] Cette méthode est dépréciée en faveur de l'événement EVENTS.UI.ASSISTED_CONTROLS_STATE_CHANGED.");
    //     if (this.assistedControlsActive !== isActive) {
    //         this.assistedControlsActive = isActive;
    //         // Il n'y a PAS d'appel explicite pour redessiner l'UI ici.
    //     }
    // }
} 