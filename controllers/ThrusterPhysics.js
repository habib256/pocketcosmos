class ThrusterPhysics {
    constructor(physicsController, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketModel, rocketBody, assistedControls etc.
        this.Body = Body;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;

        // Contrôles assistés
        this.angularDamping = this.PHYSICS.ASSISTED_CONTROLS.NORMAL_ANGULAR_DAMPING;
        this.assistedAngularDamping = this.PHYSICS.ASSISTED_CONTROLS.ASSISTED_ANGULAR_DAMPING;
        this.rotationStabilityFactor = this.PHYSICS.ASSISTED_CONTROLS.ROTATION_STABILITY_FACTOR;

        // Son du propulseur principal
        this.mainThrusterSound = null;
        this.mainThrusterSoundPlaying = false;

        this._lastThrustCalculation = null;
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
    applyThrusterForce(rocketModel, thrusterName, powerPercentage) {
        const rocketBody = this.physicsController.rocketBody;
        if (!rocketModel.thrusters[thrusterName] || !rocketBody) return;

        const thruster = rocketModel.thrusters[thrusterName];
        let thrustForce = 0;
        let fuelConsumption = 0;

        // Calculer la force et la consommation de base
        switch (thrusterName) {
            case 'main':
                thrustForce = this.ROCKET.MAIN_THRUST * (powerPercentage / 100) * 1.5 * this.PHYSICS.THRUST_MULTIPLIER;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.MAIN;
                break;
            case 'rear':
                thrustForce = this.ROCKET.REAR_THRUST * (powerPercentage / 100) * 1.5 * this.PHYSICS.THRUST_MULTIPLIER;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.REAR;
                break;
            case 'left':
            case 'right':
                thrustForce = this.ROCKET.LATERAL_THRUST * (powerPercentage / 100) * 3 * this.PHYSICS.THRUST_MULTIPLIER;
                fuelConsumption = this.ROCKET.FUEL_CONSUMPTION.LATERAL;
                break;
        }

        // Vérifier le carburant
        if (rocketModel.fuel <= 0) {
            thrustForce = 0;
        } else {
            const fuelUsed = fuelConsumption * (powerPercentage / 100);
            if (!rocketModel.consumeFuel(fuelUsed)) {
                thrustForce = 0; // Plus de carburant
            }
        }

        // Gérer le son du propulseur principal
        if (thrusterName === 'main') {
            if (thrustForce > 0) {
                this.playMainThrusterSound();
            } else {
                this.stopMainThrusterSound();
            }
        }

        // Si pas de poussée, on sort
        if (thrustForce <= 0) {
            // Nettoyer le vecteur de poussée pour la visualisation
            if (rocketBody.thrustVectors && rocketBody.thrustVectors[thrusterName]) {
                delete rocketBody.thrustVectors[thrusterName];
            }
             // S'assurer que les forces de debug sont à zéro aussi
             if (this.physicsController.physicsVectors) {
                 this.physicsController.physicsVectors.clearThrustForce(thrusterName);
             }
            return;
        }

        // Calculer le point d'application et l'angle
        const leverX = thruster.position.x;
        const leverY = thruster.position.y;
        const offsetX = Math.cos(rocketModel.angle) * leverX - Math.sin(rocketModel.angle) * leverY;
        const offsetY = Math.sin(rocketModel.angle) * leverX + Math.cos(rocketModel.angle) * leverY;
        const position = { x: rocketBody.position.x + offsetX, y: rocketBody.position.y + offsetY };

        let thrustAngle;
        if (thrusterName === 'left' || thrusterName === 'right') {
            const propAngle = Math.atan2(leverY, leverX);
            const perpDirection = thrusterName === 'left' ? Math.PI/2 : -Math.PI/2;
            thrustAngle = rocketModel.angle + propAngle + perpDirection;
        } else {
            thrustAngle = rocketModel.angle + (thrusterName === 'main' ? -Math.PI/2 : Math.PI/2);
        }

        const thrustX = Math.cos(thrustAngle) * thrustForce;
        const thrustY = Math.sin(thrustAngle) * thrustForce;

        // Stocker pour le débogage (via PhysicsDebugger)
        if (this.physicsController.physicsVectors) {
             this.physicsController.physicsVectors.setThrustForce(thrusterName, thrustX, thrustY);
        }

        // Appliquer la force
        this.Body.applyForce(rocketBody, position, { x: thrustX, y: thrustY });

        // Gérer le décollage si le propulseur principal est actif et que la fusée est posée
        if (thrusterName === 'main' && rocketModel.isLanded && thrustForce > 0) {
            this.handleLiftoff(rocketModel, rocketBody);
        }

        // Stocker les vecteurs pour RocketView (pourrait être déplacé dans PhysicsDebugger aussi)
        if (!rocketBody.thrustVectors) rocketBody.thrustVectors = {};
        rocketBody.thrustVectors[thrusterName] = {
            position: { x: offsetX, y: offsetY },
            x: Math.cos(thrustAngle),
            y: Math.sin(thrustAngle),
            magnitude: thrustForce
        };
    }

    // Gère l'impulsion initiale du décollage
    handleLiftoff(rocketModel, rocketBody) {
        console.log(`Décollage initié depuis ${rocketModel.landedOn || 'surface inconnue'} avec propulseur principal`);
        const landedOnBodyName = rocketModel.landedOn;

        rocketModel.isLanded = false;
        rocketModel.landedOn = null;
        rocketModel.relativePosition = null; // Oublier la position relative

        // Appliquer une forte impulsion vers le haut (perpendiculaire à la surface)
        const impulseForce = 5.0; // Force augmentée
        const angle = rocketBody.angle - Math.PI / 2; // Direction vers le haut de la fusée
        const impulse = {
            x: Math.cos(angle) * -impulseForce, // Négatif car la force pousse dans la direction opposée à l'angle
            y: Math.sin(angle) * -impulseForce
        };
        this.Body.applyForce(rocketBody, rocketBody.position, impulse);

        // Ajouter une vitesse initiale pour aider à s'échapper
        const initialVelMagnitude = 2.0;
        this.Body.setVelocity(rocketBody, {
            x: rocketBody.velocity.x + Math.cos(angle) * -initialVelMagnitude,
            y: rocketBody.velocity.y + Math.sin(angle) * -initialVelMagnitude
        });
    }

    // Jouer le son du propulseur principal
    playMainThrusterSound() {
        try {
            if (!this.mainThrusterSound) {
                this.mainThrusterSound = new Audio('assets/sound/rocketthrustmaxx.mp3');
                this.mainThrusterSound.loop = true;
                this.mainThrusterSound.volume = 0.7;
            }
            if (!this.mainThrusterSoundPlaying) {
                this.mainThrusterSound.play().catch(error => {
                    console.error("Erreur lors de la lecture du son du propulseur principal:", error);
                });
                this.mainThrusterSoundPlaying = true;
            }
        } catch (error) {
            console.error("Erreur lors de la création/lecture du son du propulseur principal:", error);
        }
    }

    // Arrêter le son du propulseur principal
    stopMainThrusterSound() {
        if (this.mainThrusterSoundPlaying && this.mainThrusterSound) {
            this.mainThrusterSound.pause();
            this.mainThrusterSound.currentTime = 0;
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

    // Appliquer la stabilisation de rotation si nécessaire
    applyRotationStabilization(rocketModel) {
        const rocketBody = this.physicsController.rocketBody;
        if (this.physicsController.assistedControls && rocketBody && !rocketModel.isLanded) {
            const leftActive = rocketModel.thrusters.left.power > 0;
            const rightActive = rocketModel.thrusters.right.power > 0;

            if (!leftActive && !rightActive && Math.abs(rocketBody.angularVelocity) > 0.001) {
                const stabilizationForce = -rocketBody.angularVelocity * this.rotationStabilityFactor;
                this.Body.setAngularVelocity(rocketBody,
                    rocketBody.angularVelocity + stabilizationForce);
            }
        }
    }

     // Calculer et afficher les exigences de poussée pour le décollage (peut être déplacé dans une classe d'analyse/debug?)
     calculateThrustRequirements(rocketModel, universeModel) {
         // Ne calculer qu'une fois toutes les N secondes pour éviter de surcharger la console
         if (!this._lastThrustCalculation || Date.now() - this._lastThrustCalculation > 5000) { // Augmenté à 5s
             this._lastThrustCalculation = Date.now();

             if (!universeModel || !universeModel.celestialBodies || !rocketModel || rocketModel.mass <= 0) return;

             // Trouver le corps céleste le plus proche ou celui sur lequel on est posé
             let nearestBody = null;
             let minDistanceSq = Infinity;

             if (rocketModel.landedOn) {
                 nearestBody = universeModel.celestialBodies.find(body => body.name === rocketModel.landedOn);
             } else {
                 for (const body of universeModel.celestialBodies) {
                     const dx = body.position.x - rocketModel.position.x;
                     const dy = body.position.y - rocketModel.position.y;
                     const distanceSq = dx * dx + dy * dy;
                     if (distanceSq < minDistanceSq) {
                         minDistanceSq = distanceSq;
                         nearestBody = body;
                     }
                 }
             }

             if (!nearestBody) return;

             const dx = nearestBody.position.x - rocketModel.position.x;
             const dy = nearestBody.position.y - rocketModel.position.y;
             const distanceSquared = Math.max(dx * dx + dy * dy, 1); // Éviter la division par zéro

             // Calculer la force gravitationnelle (approximation locale)
             // Note: Utilise PHYSICS.G qui peut être différent de la constante du plugin
             const gravitationalForce = this.PHYSICS.G * nearestBody.mass * rocketModel.mass / distanceSquared;

             // Force du propulseur principal à pleine puissance avec multiplicateur
             const mainThrusterForce = this.ROCKET.MAIN_THRUST * 1.5 * this.PHYSICS.THRUST_MULTIPLIER;

             // Rapport poussée/poids (TWR - Thrust to Weight Ratio)
             const twr = mainThrusterForce / gravitationalForce;

             const canLiftOff = twr > 1;
         }
     }
}
