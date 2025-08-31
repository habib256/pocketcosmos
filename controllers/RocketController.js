class RocketController {
    constructor(eventBus, rocketModel, actualPhysicsController, actualParticleController, cameraModel) {
        this.eventBus = eventBus;
        this.rocketModel = rocketModel;
        this.physicsController = actualPhysicsController; // actualPhysicsController est l'instance de PhysicsController
        
        if (actualParticleController && typeof actualParticleController.getParticleSystemModel === 'function') {
            this.particleSystemModel = actualParticleController.getParticleSystemModel();
        } else if (actualParticleController && actualParticleController.particleSystemModel) {
            this.particleSystemModel = actualParticleController.particleSystemModel;
        } else if (actualParticleController && actualParticleController.model) { // Tentative avec .model
            this.particleSystemModel = actualParticleController.model;
        } else {
            // Pas de console.error ici, on gère l'absence dans les méthodes
            this.particleSystemModel = null;
        }
        
        this.cameraModel = cameraModel; // Stocker cameraModel

        // Constante pour le nouvel événement que RocketController émettra
        this.ROCKET_INTERNAL_STATE_CHANGED_EVENT = (window.EVENTS && window.EVENTS.ROCKET && window.EVENTS.ROCKET.INTERNAL_STATE_CHANGED)
            ? window.EVENTS.ROCKET.INTERNAL_STATE_CHANGED
            : 'rocket:internalStateChanged';
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
        // Nettoyer les anciens abonnements si ils existent
        if (this.eventSubscriptions) {
            this.eventSubscriptions.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
        }
        this.eventSubscriptions = [];
        
        // S'abonner aux événements sémantiques pour les actions de la fusée
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_START, () => this.handleThrustForwardStart()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_FORWARD_STOP, () => this.handleThrustForwardStop()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_START, () => this.handleThrustBackwardStart()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.THRUST_BACKWARD_STOP, () => this.handleThrustBackwardStop()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_START, () => this.handleRotateLeftStart()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_LEFT_STOP, () => this.handleRotateLeftStop()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_START, () => this.handleRotateRightStart()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.ROTATE_RIGHT_STOP, () => this.handleRotateRightStop()));
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.ROCKET.SET_THRUSTER_POWER, (data) => this.handleSetThrusterPower(data)));

        // Nouvel abonnement pour la commande de rotation générique (par exemple, depuis un joystick)
        this.eventSubscriptions.push(this.eventBus.subscribe(EVENTS.INPUT.ROTATE_COMMAND, (data) => this.handleRotateCommand(data)));
        
        // Utiliser controllerContainer si disponible (mode jeu normal)
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            this.eventSubscriptions.forEach(subscription => {
                window.controllerContainer.track(subscription);
            });
        }
        
        console.log(`[RocketController] Abonné à ${this.eventSubscriptions.length} événements`);
    }
    
    /**
     * Nettoie les abonnements aux événements
     */
    unsubscribeFromEvents() {
        if (this.eventSubscriptions) {
            this.eventSubscriptions.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this.eventSubscriptions = [];
            console.log('[RocketController] Abonnements aux événements nettoyés');
        }
    }

    handleThrustForwardStart() {
        if (!this.eventBus || !this.rocketModel) return;
        // Si la fusée est détruite (écran rouge crashé), utiliser le même bouton (boost)
        // pour relancer immédiatement au lieu d'activer les propulseurs.
        if (this.rocketModel.isDestroyed) {
            this.eventBus.emit(EVENTS.ROCKET.RESET);
            return;
        }
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', true, this.rocketModel);
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustForwardStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('main', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', false, this.rocketModel);
        }
        // Rendre la gestion du son plus robuste
        if (this.physicsController && this.physicsController.mainThrusterSoundPlaying) {
            if (this.physicsController.mainThrusterSound && typeof this.physicsController.mainThrusterSound.pause === 'function') {
                this.physicsController.mainThrusterSound.pause();
                this.physicsController.mainThrusterSound.currentTime = 0;
            }
            this.physicsController.mainThrusterSoundPlaying = false; // Assurer que l'état est mis à jour
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustBackwardStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('rear', true, this.rocketModel);
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
                this.particleSystemModel.setEmitterActive(thrusterId, power > 0.01, this.rocketModel);
            }
            this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
        }
    }

    // +++ NOUVEAU GESTIONNAIRE pour EVENTS.INPUT.ROTATE_COMMAND +++
    handleRotateCommand(data) {
        if (!this.rocketModel || !this.eventBus /* Ajoutez ici la vérification de gameController.isPaused si nécessaire */) return;

        const rotateValue = data.value; // Valeur de rotation, négative pour droite, positive pour gauche

        // Note: Accéder à gameController.isPaused nécessiterait de passer gameController au constructeur
        // ou de gérer la pause via un événement auquel RocketController s'abonne.
        // Pour l'instant, on suppose que si le jeu est en pause, InputController n'émet pas ces événements,
        // ou que GameController gère la pause globalement pour les mises à jour.
        // Si GameController.isPaused est nécessaire, il faudrait l'ajouter.

        let powerLeft = 0;
        let powerRight = 0;

        if (rotateValue < 0) { // Rotation vers la droite (propulseur droit)
            // ROCKET.THRUSTER_POWER.RIGHT est la puissance max du propulseur droit.
            powerRight = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.RIGHT;
        } else if (rotateValue > 0) { // Rotation vers la gauche (propulseur gauche)
            powerLeft = Math.abs(rotateValue) * ROCKET.THRUSTER_POWER.LEFT;
        }

        // Appliquer les puissances et gérer les particules
        // On peut utiliser directement setThrusterPower et la logique de gestion des particules de handleSetThrusterPower
        // ou émettre des événements SET_THRUSTER_POWER.
        // Émettre des événements est plus cohérent avec le pattern actuel.

        this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'left', power: powerLeft });
        this.eventBus.emit(EVENTS.ROCKET.SET_THRUSTER_POWER, { thrusterId: 'right', power: powerRight });

        // La méthode handleSetThrusterPower s'occupe déjà d'activer/désactiver les particules
        // et d'émettre ROCKET_INTERNAL_STATE_CHANGED_EVENT.
        // Si les particules pour 'left' et 'right' ne sont pas gérées par handleSetThrusterPower pour power = 0,
        // il faudrait ajouter cette logique ici ou dans handleSetThrusterPower.
        // D'après le code de handleSetThrusterPower, il gère bien l'activation/désactivation pour 'left' et 'right'.
        // Exemple : this.particleSystemModel.setEmitterActive('left', powerLeft > 0.01, this.rocketModel);
        //          this.particleSystemModel.setEmitterActive('right', powerRight > 0.01, this.rocketModel);
        // Mais cela est déjà fait dans handleSetThrusterPower. Si on appelle SET_THRUSTER_POWER, il le fera.
    }
} 