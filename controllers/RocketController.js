class RocketController {
    constructor(eventBus, rocketModel, actualPhysicsController, actualParticleController, cameraModel) {
        console.log(`[RocketController] 🔵 CONSTRUCTEUR APPELÉ`);
        this.eventBus = eventBus;
        this.rocketModel = rocketModel;
        this.physicsController = actualPhysicsController; // actualPhysicsController est l'instance de PhysicsController
        /** @type {boolean} Le jeu est-il en pause ? Tenu à jour via GAME_PAUSED / GAME_RESUMED.
         *  Sert à ignorer les commandes continues du gamepad pendant la pause (cf. handleRotateCommand). */
        this.isGamePaused = false;
        
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
        console.log(`[RocketController] ⚠️ subscribeToEvents() APPELÉ`);
        let subscriptionCount = 0;

        // Vérifier que EVENTS est défini
        if (!window.EVENTS || !window.EVENTS.ROCKET) {
            console.error(`[RocketController] ❌ EVENTS non défini! window.EVENTS=`, window.EVENTS);
            return;
        }

        console.log(`[RocketController] ✅ EVENTS défini, THRUST_FORWARD_START=${window.EVENTS.ROCKET.THRUST_FORWARD_START}`);

        // Idempotence : si on a déjà souscrit (ex: re-bind sur un autre EventBus par
        // TrainingOrchestrator), désabonner d'abord les anciens handlers pour éviter
        // les abonnements orphelins (fuite mémoire) et le double-binding.
        // eventBus.subscribe() retourne une fonction de désabonnement (cf. EventBus.js).
        if (!Array.isArray(this._subscriptions)) {
            this._subscriptions = [];
        }
        if (this._subscriptions.length > 0) {
            for (const unsubscribe of this._subscriptions) {
                if (typeof unsubscribe === 'function') {
                    try { unsubscribe(); }
                    catch (err) { console.error(`[RocketController] Erreur lors du désabonnement:`, err); }
                }
            }
            this._subscriptions = [];
        }

        // S'abonner aux événements sémantiques pour les actions de la fusée
        // CORRECTION: Utiliser uniquement controllerContainer.track() pour éviter la double gestion
        const subscribeAndTrack = (eventType, handler) => {
            if (!eventType) {
                console.error(`[RocketController] Tentative d'abonnement à un événement null/undefined`);
                return null;
            }
            const unsubscribe = this.eventBus.subscribe(eventType, handler);
            // Conserver la fn de désabonnement sur l'instance pour pouvoir rendre
            // subscribeToEvents() idempotent lors d'un re-bind d'EventBus.
            if (typeof unsubscribe === 'function') {
                this._subscriptions.push(unsubscribe);
            }
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(unsubscribe);
            }
            subscriptionCount++;
            console.log(`[RocketController] Abonné à l'événement: ${eventType}`);
            return unsubscribe;
        };
        
        subscribeAndTrack(EVENTS.ROCKET.THRUST_FORWARD_START, () => {
            console.log(`[RocketController] Événement THRUST_FORWARD_START reçu, appel handleThrustForwardStart`);
            this.handleThrustForwardStart();
        });
        subscribeAndTrack(EVENTS.ROCKET.THRUST_FORWARD_STOP, () => this.handleThrustForwardStop());
        subscribeAndTrack(EVENTS.ROCKET.THRUST_BACKWARD_START, () => this.handleThrustBackwardStart());
        subscribeAndTrack(EVENTS.ROCKET.THRUST_BACKWARD_STOP, () => this.handleThrustBackwardStop());
        subscribeAndTrack(EVENTS.ROCKET.ROTATE_LEFT_START, () => this.handleRotateLeftStart());
        subscribeAndTrack(EVENTS.ROCKET.ROTATE_LEFT_STOP, () => this.handleRotateLeftStop());
        subscribeAndTrack(EVENTS.ROCKET.ROTATE_RIGHT_START, () => this.handleRotateRightStart());
        subscribeAndTrack(EVENTS.ROCKET.ROTATE_RIGHT_STOP, () => this.handleRotateRightStop());
        subscribeAndTrack(EVENTS.ROCKET.SET_THRUSTER_POWER, (data) => this.handleSetThrusterPower(data));

        // Nouvel abonnement pour la commande de rotation générique (par exemple, depuis un joystick)
        subscribeAndTrack(EVENTS.INPUT.ROTATE_COMMAND, (data) => this.handleRotateCommand(data));

        // Suivi de l'état de pause : le gamepad est lu par polling à chaque frame, y compris
        // en pause. On a donc besoin de savoir si le jeu tourne pour ne pas écrire la puissance
        // des propulseurs dans le modèle pendant que la simulation est figée.
        if (EVENTS.GAME && EVENTS.GAME.GAME_PAUSED) {
            subscribeAndTrack(EVENTS.GAME.GAME_PAUSED, () => {
                this.isGamePaused = true;
                // Couper la boucle sonore du propulseur : son seul autre point d'arrêt
                // (ThrusterPhysics.updateThrusters) ne tourne plus une fois la simulation en pause,
                // le son continuait donc indéfiniment par-dessus le menu de pause.
                const tp = this.physicsController && this.physicsController.thrusterPhysics;
                if (tp && typeof tp.stopMainThrusterSound === 'function') {
                    tp.stopMainThrusterSound();
                }
            });
        }
        if (EVENTS.GAME && EVENTS.GAME.GAME_RESUMED) {
            subscribeAndTrack(EVENTS.GAME.GAME_RESUMED, () => { this.isGamePaused = false; });
        }
        
        console.log(`[RocketController] Abonné à ${subscriptionCount} événements`);
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
        console.log(`[THRUST] handleThrustForwardStart appelé, power=${ROCKET.THRUSTER_POWER.MAIN}, isLanded=${this.rocketModel.isLanded}`);
        this.rocketModel.setThrusterPower('main', ROCKET.THRUSTER_POWER.MAIN);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', true, this.rocketModel);
            // Rétablir l'intensité PLEINE du panache : powerLevel n'est écrit que par
            // handleSetThrusterPower, et un passage à 0 par ce chemin (désactivation de
            // l'IA, rotation gamepad) le laissait figé bas — la poussée clavier suivante
            // n'émettait plus qu'une seule particule.
            this._updateEmitterPowerLevel('main', ROCKET.THRUSTER_POWER.MAIN);
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustForwardStop() {
        if (!this.eventBus || !this.rocketModel) return;
        this.rocketModel.setThrusterPower('main', 0);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('main', false, this.rocketModel);
        }
        // Couper le son du propulseur principal.
        // L'état du son vit sur ThrusterPhysics, PAS sur PhysicsController : l'ancien test
        // (`this.physicsController.mainThrusterSoundPlaying`) était toujours undefined, donc
        // cette branche ne s'exécutait jamais. Comme updateThrusters() — l'autre chemin d'arrêt —
        // ne tourne pas quand la simulation est en pause, la boucle sonore continuait par-dessus
        // le menu de pause ou l'écran de chargement.
        const thrusterPhysics = this.physicsController && this.physicsController.thrusterPhysics;
        if (thrusterPhysics && typeof thrusterPhysics.stopMainThrusterSound === 'function') {
            thrusterPhysics.stopMainThrusterSound();
        }
        this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
    }

    handleThrustBackwardStart() {
        if (!this.eventBus || !this.rocketModel) return;
        this.eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED);
        this.rocketModel.setThrusterPower('rear', ROCKET.THRUSTER_POWER.REAR);
        if (this.particleSystemModel) {
            this.particleSystemModel.setEmitterActive('rear', true, this.rocketModel);
            // Rétablir l'intensité PLEINE du panache : powerLevel n'est écrit que par
            // handleSetThrusterPower, et un passage à 0 par ce chemin (désactivation de
            // l'IA, rotation gamepad) le laissait figé bas — la poussée clavier suivante
            // n'émettait plus qu'une seule particule.
            this._updateEmitterPowerLevel('rear', ROCKET.THRUSTER_POWER.REAR);
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
            // Rétablir l'intensité PLEINE du panache : powerLevel n'est écrit que par
            // handleSetThrusterPower, et un passage à 0 par ce chemin (désactivation de
            // l'IA, rotation gamepad) le laissait figé bas — la poussée clavier suivante
            // n'émettait plus qu'une seule particule.
            this._updateEmitterPowerLevel('left', ROCKET.THRUSTER_POWER.LEFT);
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
            // Rétablir l'intensité PLEINE du panache : powerLevel n'est écrit que par
            // handleSetThrusterPower, et un passage à 0 par ce chemin (désactivation de
            // l'IA, rotation gamepad) le laissait figé bas — la poussée clavier suivante
            // n'émettait plus qu'une seule particule.
            this._updateEmitterPowerLevel('right', ROCKET.THRUSTER_POWER.RIGHT);
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
                const fuelOk = this.rocketModel._infiniteFuel || this.rocketModel.fuel > 0;
                this.particleSystemModel.setEmitterActive(thrusterId, fuelOk && power > 0.01, this.rocketModel);
                // Moduler l'intensité visuelle du panache selon la puissance réelle.
                // `setEmitterPowerLevel` n'était appelé NULLE PART : ParticleController module
                // pourtant nombre, vitesse, durée de vie et taille des particules par
                // powerLevel/100, qui restait figé à 100. Le panache était donc identique à 5 %
                // et à 100 % de poussée (visible au stick analogique et sous contrôle de l'IA).
                this._updateEmitterPowerLevel(thrusterId, power);
            }
            this.eventBus.emit(this.ROCKET_INTERNAL_STATE_CHANGED_EVENT);
        }
    }

    /**
     * Répercute la puissance d'un propulseur sur l'intensité visuelle de son émetteur.
     * @param {string} thrusterId - 'main' | 'rear' | 'left' | 'right'
     * @param {number} power - Puissance ABSOLUE (0..maxPower), pas un pourcentage.
     * @private
     */
    _updateEmitterPowerLevel(thrusterId, power) {
        if (!this.particleSystemModel || typeof this.particleSystemModel.setEmitterPowerLevel !== 'function') return;
        const thruster = this.rocketModel && this.rocketModel.thrusters && this.rocketModel.thrusters[thrusterId];
        const maxPower = thruster && thruster.maxPower;
        if (!maxPower || maxPower <= 0) return;
        const ratio = Math.max(0, Math.min(1, power / maxPower));
        this.particleSystemModel.setEmitterPowerLevel(thrusterId, ratio * 100);
    }

    // +++ NOUVEAU GESTIONNAIRE pour EVENTS.INPUT.ROTATE_COMMAND +++
    handleRotateCommand(data) {
        if (!this.rocketModel || !this.eventBus /* Ajoutez ici la vérification de gameController.isPaused si nécessaire */) return;

        const rotateValue = data.value; // Valeur de rotation, négative pour droite, positive pour gauche

        // Le gamepad est lu par polling à chaque frame, y compris pendant la pause : un stick
        // maintenu (ou une simple dérive au repos au-dessus de axisThreshold = 0,1) réémet
        // ROTATE_COMMAND en continu. On ignore donc ces commandes en pause plutôt que de
        // demander une reprise : émettre RESUME_IF_PAUSED ici rendait la mise en pause
        // IMPOSSIBLE tant que le stick était dévié (reprise immédiate à la frame suivante).
        // Les autres chemins de contrôle (clavier, boutons) restent événementiels : eux
        // demandent bien la reprise, car ils traduisent une intention ponctuelle du joueur.
        //
        // ⚠️ EXCEPTION IMPORTANTE : value === 0 est la commande d'ARRÊT, et c'est le SEUL signal
        // qui remet les propulseurs latéraux à zéro pour le gamepad. Elle est émise depuis des
        // chemins qui s'exécutent justement pendant la pause (front descendant de l'axe lu par
        // update(), relâchement global sur blur, déconnexion de la manette) et le front est
        // CONSOMMÉ au passage. L'ignorer laissait le propulseur latéral allumé pour de bon :
        // à la reprise, la fusée tournait sur elle-même en brûlant du carburant, sans qu'aucun
        // événement ultérieur ne vienne la stopper. On traite donc toujours l'arrêt.
        if (this.isGamePaused && rotateValue !== 0) {
            return;
        }

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