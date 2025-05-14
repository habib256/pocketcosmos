class RocketController {
    constructor(eventBus, rocketModel, particleSystemModel, physicsController) {
        this.eventBus = eventBus;
        this.rocketModel = rocketModel;
        this.particleSystemModel = particleSystemModel;
        this.physicsController = physicsController; // Pour les sons des propulseurs

        // Constante pour le nouvel événement que RocketController émettra
        this.ROCKET_INTERNAL_STATE_CHANGED_EVENT = 'rocket:internalStateChanged';
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
    }

    handleThrustForwardStart() {
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
        this.particleSystemModel.setEmitterActive('main', true, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustForwardStop() {
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('main', 0);
        this.particleSystemModel.setEmitterActive('main', false, this.rocketModel);
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
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
        this.particleSystemModel.setEmitterActive('rear', true, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustBackwardStop() {
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('rear', 0);
        this.particleSystemModel.setEmitterActive('rear', false, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateLeftStart() {
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('left', ROCKET.THRUSTER_POWER.LEFT);
        this.particleSystemModel.setEmitterActive('left', true, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateLeftStop() {
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('left', 0);
        this.particleSystemModel.setEmitterActive('left', false, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateRightStart() {
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('right', ROCKET.THRUSTER_POWER.RIGHT);
        this.particleSystemModel.setEmitterActive('right', true, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleRotateRightStop() {
        if (!this.rocketModel) return;
        this.rocketModel.setThrusterPower('right', 0);
        this.particleSystemModel.setEmitterActive('right', false, this.rocketModel);
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }
} 