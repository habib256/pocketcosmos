class ThrusterPhysics {
    constructor(physicsController, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketModel, rocketBody, assistedControls etc.
        this.Body = Body; // Module Matter.Body pour appliquer forces/vitesses
        this.ROCKET = ROCKET; // Constantes spécifiques à la fusée (poussée, fuel, etc.)
        this.PHYSICS = PHYSICS; // Constantes physiques générales (gravité, multiplicateurs globaux, etc.)

        // Paramètres pour les contrôles assistés (depuis constants.js)
        this.angularDamping = this.PHYSICS.ASSISTED_CONTROLS.NORMAL_ANGULAR_DAMPING;
        this.assistedAngularDamping = this.PHYSICS.ASSISTED_CONTROLS.ASSISTED_ANGULAR_DAMPING;
        this.rotationStabilityFactor = this.PHYSICS.ASSISTED_CONTROLS.ROTATION_STABILITY_FACTOR;

        // Gestion du son du propulseur principal via AudioManager global
        this.mainThrusterSoundPlaying = false;
    }

    // Mettre à jour et appliquer toutes les forces des propulseurs
    updateThrusters(rocketModel) {
        if (!this.physicsController.rocketBody) return;

        // Si la fusée est détruite, aucun propulseur ne fonctionne
        if (rocketModel.isDestroyed) {
            this.stopMainThrusterSound(); // S'assurer que le son est coupé
            return;
        }

        let mainThrusterActive = false;
        // Pour chaque propulseur, vérifier s'il est actif et appliquer la force correspondante
        for (const thrusterName in rocketModel.thrusters) {
            const thruster = rocketModel.thrusters[thrusterName];

            // Si le propulseur est actif (puissance > 0), appliquer sa force
            if (thruster.power > 0) {
                this.applyThrusterForce(rocketModel, thrusterName, thruster.power);
                if (thrusterName === 'main') {
                    mainThrusterActive = true;
                }
            }
        }

        // Arrêter le son si le propulseur principal n'est plus actif
        if (!mainThrusterActive) {
            this.stopMainThrusterSound();
        }
    }

    // Appliquer la force de poussée d'un réacteur spécifique
    applyThrusterForce(rocketModel, thrusterName, power) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketModel.thrusters[thrusterName] || !rocketBody) return;

        const thruster = rocketModel.thrusters[thrusterName];
        let thrustForce = 0;
        let fuelConsumption = 0;

        // Calculer la force et la consommation de base
        // CORRECTION: 'power' est une valeur absolue (0 à maxPower), pas un pourcentage
        // Calculer le ratio de puissance en divisant par maxPower
        // Le ratio doit être entre 0 et 1
        const powerRatio = thruster.maxPower > 0 ? Math.max(0, Math.min(1, power / thruster.maxPower)) : 0;
        
        switch (thrusterName) {
            case 'main':
                thrustForce = this.ROCKET.MAIN_THRUST * powerRatio
                              * this.ROCKET.THRUSTER_EFFECTIVENESS.MAIN
                              * this.PHYSICS.THRUST_MULTIPLIER;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.MAIN;
                break;
            case 'rear':
                thrustForce = this.ROCKET.REAR_THRUST * powerRatio
                              * this.ROCKET.THRUSTER_EFFECTIVENESS.REAR
                              * this.PHYSICS.THRUST_MULTIPLIER;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.REAR;
                break;
            case 'left':
            case 'right':
                // CORRECTION: Réduction de la puissance des propulseurs latéraux par 2
                thrustForce = (this.ROCKET.LATERAL_THRUST * powerRatio
                              * this.ROCKET.THRUSTER_EFFECTIVENESS.LATERAL
                              * this.PHYSICS.THRUST_MULTIPLIER) / 2;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.LATERAL;
                break;
        }

        // Vérifier s'il reste du carburant
        // La consommation est gérée exclusivement dans RocketModel.update(deltaTime) pour éviter la double-décrémentation
        if (rocketModel.fuel <= 0) {
            thrustForce = 0;
        }

        // Gérer le son du propulseur principal
        if (thrusterName === 'main') {
            if (thrustForce > 0) {
                this.playMainThrusterSound();
            } else {
                this.stopMainThrusterSound();
            }
        }

        // Si pas de poussée (fuel épuisé ou puissance nulle), on arrête ici
        if (thrustForce <= 0) {
            // Nettoyer le vecteur de poussée pour la visualisation de debug
            // (Suppression de rocketBody.thrustVectors inutile car géré par physicsVectors)
             if (this.physicsController.physicsVectors) {
                 this.physicsController.physicsVectors.clearThrustForce(thrusterName);
             }
            return;
        }

        // --- Calcul de la position d'application et de la direction de la force ---
        const thrusterDef = this.ROCKET.THRUSTER_POSITIONS[thrusterName.toUpperCase()]; // Utiliser les définitions de constants.js
        const distance = thrusterDef.distance;
        const angleOffset = thrusterDef.angle;

        // Position relative du propulseur par rapport au centre de la fusée
        const leverX = Math.cos(angleOffset) * distance;
        const leverY = Math.sin(angleOffset) * distance;

        // Convertir la position relative en coordonnées mondiales en tenant compte de l'angle de la fusée
        const offsetX = Math.cos(rocketModel.angle) * leverX - Math.sin(rocketModel.angle) * leverY;
        const offsetY = Math.sin(rocketModel.angle) * leverX + Math.cos(rocketModel.angle) * leverY;
        // Point d'application absolu de la force dans le monde
        const position = { x: rocketBody.position.x + offsetX, y: rocketBody.position.y + offsetY };

        // Calcul de l'angle absolu de la poussée dans le monde
        let thrustAngle;
        // Les propulseurs latéraux poussent perpendiculairement à leur position
        if (thrusterName === 'left' || thrusterName === 'right') {
            // Angle de la position du propulseur par rapport au centre de la fusée
            const propAngleRel = Math.atan2(leverY, leverX);
            // Direction perpendiculaire (PI/2 pour gauche, -PI/2 pour droite)
            const perpDirection = thrusterName === 'left' ? Math.PI/2 : -Math.PI/2;
            // Angle final = Angle de la fusée + Angle relatif du propulseur + Direction perpendiculaire
            thrustAngle = rocketModel.angle + propAngleRel + perpDirection;
        } else {
            // Les propulseurs principaux et arrières poussent selon l'axe de la fusée
            // Angle final = Angle de la fusée + Décalage angulaire du propulseur (défini dans constants.js)
            thrustAngle = rocketModel.angle + angleOffset;
        }

        // Composantes X et Y de la force de poussée
        const thrustX = Math.cos(thrustAngle) * thrustForce;
        const thrustY = Math.sin(thrustAngle) * thrustForce;

        // Stocker le vecteur force pour le débogage/visualisation via PhysicsDebugger/VectorsView
        if (this.physicsController.physicsVectors) {
             this.physicsController.physicsVectors.setThrustForce(thrusterName, thrustX, thrustY);
        }

        // Appliquer la force au corps physique de la fusée
        // La force est appliquée au point 'position' calculé précédemment
        this.Body.applyForce(rocketBody, position, { x: thrustX, y: thrustY });

        // Gérer le décollage si le propulseur principal est actif et que la fusée est posée
        if (thrusterName === 'main' && rocketModel.isLanded && thrustForce > 0) {
            // Applique une impulsion initiale pour vaincre l'inertie/gravité au sol
            this.handleLiftoff(rocketModel, rocketBody);
        }
    }

    // Gère l'impulsion initiale du décollage
    // @param {string|null} forcedLandedOnName - Nom du corps (optionnel, utilisé si landedOn est déjà null)
    handleLiftoff(rocketModel, rocketBody, forcedLandedOnName = null) {
        const landedOnBodyName = forcedLandedOnName || rocketModel.landedOn;
        console.log(`[LIFTOFF] Décollage initié depuis ${landedOnBodyName || 'surface inconnue'}`);

        // Mettre à jour l'état du modèle
        rocketModel.isLanded = false;
        rocketModel.landedOn = null;
        rocketModel.relativePosition = null;
        rocketModel.startLiftoffGracePeriod(500);

        // L'angle "vers le haut" de la fusée est son angle - 90 degrés (PI/2 radians)
        const liftOffAngle = rocketBody.angle - Math.PI / 2;
        
        // Appliquer une impulsion modérée pour aider à vaincre l'inertie initiale
        // La poussée continue des propulseurs fera le reste
        const impulseForce = 50.0;
        const impulse = {
            x: Math.cos(liftOffAngle) * -impulseForce,
            y: Math.sin(liftOffAngle) * -impulseForce
        };
        this.Body.applyForce(rocketBody, rocketBody.position, impulse);

        // Donner une légère vitesse initiale pour décoller du sol
        const initialVelMagnitude = 20.0;
        this.Body.setVelocity(rocketBody, {
            x: Math.cos(liftOffAngle) * -initialVelMagnitude,
            y: Math.sin(liftOffAngle) * -initialVelMagnitude
        });
        
        console.log(`[LIFTOFF] ✅ Décollage naturel initié`);
    }

    // Jouer le son du propulseur principal
    playMainThrusterSound() {
        // Désactiver le son en mode headless
        if (this.physicsController.isHeadless) {
            return;
        }
        if (!window.audioManager) return;
        // Précharger si pas déjà fait
        window.audioManager.preload('thruster_main', 'assets/sound/rocketthrustmaxx.mp3', { loop: true, volume: 0.7 });
        if (!this.mainThrusterSoundPlaying) {
            window.audioManager.startLoop('thruster_main');
            this.mainThrusterSoundPlaying = true;
        }
    }

    // Arrêter le son du propulseur principal
    stopMainThrusterSound() {
        if (!window.audioManager) return;
        if (this.mainThrusterSoundPlaying) {
            window.audioManager.stop('thruster_main');
            this.mainThrusterSoundPlaying = false;
        }
    }

    // Activer/désactiver les contrôles assistés
    toggleAssistedControls() {
        const assistedControls = !this.physicsController.assistedControls; // Inverse l'état actuel
        this.physicsController.assistedControls = assistedControls; // Met à jour l'état dans le contrôleur principal
        const rocketBody = this.physicsController.rocketBody;

        if (rocketBody) {
            rocketBody.angularDamping = assistedControls ? this.assistedAngularDamping : this.angularDamping;
            console.log(`Contrôles assistés: ${assistedControls ? 'ACTIVÉS' : 'DÉSACTIVÉS'}`);
            console.log(`Amortissement angulaire: ${rocketBody.angularDamping.toFixed(2)} (${assistedControls ? 'assisté' : 'normal'})`);
            if (assistedControls) {
                console.log("Stabilisation automatique de la rotation activée");
            }
        }
        return assistedControls;
    }

    // Appliquer la stabilisation de rotation si les contrôles assistés sont actifs
    applyRotationStabilization(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        // Ne s'applique qu'en vol (pas au sol) et si l'assistance est activée
        if (this.physicsController.assistedControls && rocketBody && !rocketModel.isLanded) { 
            // Vérifier si les propulseurs latéraux (qui contrôlent la rotation) sont inactifs
            const leftActive = rocketModel.thrusters.left.power > 0;
            const rightActive = rocketModel.thrusters.right.power > 0;

            // Si aucun contrôle de rotation manuel n'est appliqué et que la fusée tourne
            // (avec une marge pour éviter les micro-corrections inutiles)
            if (!leftActive && !rightActive && Math.abs(rocketBody.angularVelocity) > 0.001) { 
                // Calculer une force de stabilisation proportionnelle et opposée à la vitesse angulaire
                // Le facteur 'rotationStabilityFactor' contrôle l'intensité de la stabilisation
                const stabilizationForce = -rocketBody.angularVelocity * this.rotationStabilityFactor;
                // Appliquer directement un changement de vitesse angulaire (comme un léger couple inverse)
                // Note: Matter.js n'a pas de 'applyTorque' direct, donc on modifie la vitesse angulaire
                this.Body.setAngularVelocity(rocketBody, rocketBody.angularVelocity + stabilizationForce);
            }
        }
    }
}
