class RocketController {
    constructor(eventBus, rocketModel, actualPhysicsController, actualParticleController, cameraModel) {
        this.eventBus = eventBus;
        this.rocketModel = rocketModel;
        this.physicsController = actualPhysicsController; // actualPhysicsController est l'instance de PhysicsController
        
        // actualParticleController est l'instance de ParticleController.
        // Nous supposons qu'elle détient une référence à son ParticleSystemModel.
        if (actualParticleController && actualParticleController.particleSystemModel) {
            this.particleSystemModel = actualParticleController.particleSystemModel;
        } else if (actualParticleController && actualParticleController.model) { // Tentative avec .model
            this.particleSystemModel = actualParticleController.model;
        } else {
            console.error("RocketController: Impossible de récupérer particleSystemModel depuis particleController. Les émetteurs de particules pourraient ne pas fonctionner.", actualParticleController);
            this.particleSystemModel = null;
        }
        
        this.cameraModel = cameraModel; // Stocker cameraModel

        // Constante pour le nouvel événement que RocketController émettra
        this.ROCKET_INTERNAL_STATE_CHANGED_EVENT = 'rocket:internalStateChanged';
    }

    update(deltaTime) {
        if (!this.rocketModel || this.rocketModel.isDestroyed) {
            return;
        }
        // Logique de mise à jour continue pour RocketController (si nécessaire)
        // Par exemple, gestion des contrôles assistés, rotation continue, etc.
        // Pour l'instant, cette méthode existe pour corriger l'erreur.
    }

    subscribeToEvents() {
        // S'abonner aux événements sémantiques pour les actions de la fusée
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_START, () => this.handleThrustForwardStart()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_STOP, () => this.handleThrustForwardStop()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_START, () => this.handleThrustBackwardStart()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_STOP, () => this.handleThrustBackwardStop()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_START, () => this.handleRotateLeftStart()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_STOP, () => this.handleRotateLeftStop()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_START, () => this.handleRotateRightStart()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_STOP, () => this.handleRotateRightStop()));
        window.controllerContainer.track(this.eventBus.subscribe(EVENTS.ROCKET.SET_THRUSTER_POWER, (data) => this.handleSetThrusterPower(data)));
    }

    handleThrustForwardStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', true, this.rocketModel);
        } else {
            console.warn("RocketController: particleSystemModel non disponible pour l'émetteur principal.");
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustForwardStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('main', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', false, this.rocketModel);
        }
        if (this.physicsController && this.physicsController.mainThrusterSoundPlaying) {
            if (this.physicsController.mainThrusterSound) {
                this.physicsController.mainThrusterSound.pause();
                this.physicsController.mainThrusterSound.currentTime = 0;
                this.physicsController.mainThrusterSoundPlaying = false;
            }
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustBackwardStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('rear', true, this.rocketModel);
        } else {
            console.warn("RocketController: particleSystemModel non disponible pour l'émetteur arrière.");
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustBackwardStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('rear', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('rear', false, this.rocketModel);
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateLeftStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('left', ROCKET.THRUSTER_POWER.LEFT);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('left', true, this.rocketModel);
        } else {
            console.warn("RocketController: particleSystemModel non disponible pour l'émetteur de rotation gauche.");
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateLeftStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('left', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('left', false, this.rocketModel);
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateRightStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('right', ROCKET.THRUSTER_POWER.RIGHT);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('right', true, this.rocketModel);
        } else {
            console.warn("RocketController: particleSystemModel non disponible pour l'émetteur de rotation droite.");
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateRightStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('right', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('right', false, this.rocketModel);
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleSetThrusterPower(data) {
        if (!this.eventBus || !this.rocketModel || !data) return;

        const thrusterId = data.thrusterId; // 'left', 'right', 'main', 'rear'
        const power = data.power;

        if (thrusterId && typeof power === 'number') {
            this.rocketModel.setThrusterPower(thrusterId, power);
            
            if (this.particleSystemModel) {
                // Gérer l'activation des particules pour les propulseurs de rotation
                // Pour 'main' et 'rear', les handlers existants (handleThrustForwardStart/Stop) s'en chargent déjà.
                // Ce handler est principalement pour 'left' et 'right' venant du joystick.
                if (thrusterId === 'left' || thrusterId === 'right') {
                    this.particleSystemModel.setEmitterActive(thrusterId, power > 0.01, this.rocketModel);
                }
            } else {
                console.warn(`RocketController: particleSystemModel non disponible pour l'émetteur ${thrusterId}.`);
            }
            this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
        }
    }
} 