/**
 * Gère la détection et la logique des collisions pour la fusée dans le moteur physique.
 * S'occupe de déterminer les atterrissages, les crashs, et d'appliquer les dégâts.
 */
class CollisionHandler {
    /**
     * Crée une instance de CollisionHandler.
     * @param {object} physicsController - Le contrôleur de physique, donnant accès au modèle de la fusée et au corps physique.
     * @param {Matter.Engine} engine - L'instance du moteur physique Matter.js.
     * @param {Matter.Events} Events - Le module Events de Matter.js pour s'abonner aux événements de collision.
     * @param {Matter.Body} Body - Le module Body de Matter.js pour interagir avec les propriétés des corps physiques.
     * @param {object} ROCKET - Les constantes de configuration de la fusée.
     * @param {object} PHYSICS - Les constantes de configuration physique (seuils de collision, etc.).
     */
    constructor(physicsController, engine, Events, Body, ROCKET, PHYSICS) {
        this.physicsController = physicsController; // Pour accéder à rocketModel, rocketBody, etc.
        this.engine = engine;
        this.Events = Events;
        this.Body = Body;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;

        /** @type {boolean} - Indique si la détection des collisions est active. Initialisée à false et activée après un délai. */
        this.collisionsEnabled = false;
        /** @type {number} - Timestamp de l'initialisation du gestionnaire de collision, utilisé pour le délai d'activation. */
        this.initTime = Date.now();
        /** @type {Object.<string, boolean>} - Stocke le dernier état d'atterrissage connu pour chaque corps céleste (par leur label). */
        this._lastLandedState = {};

        // Suppression: la célébration mission est gérée de façon découplée par ParticleController (abonnement à EVENTS.MISSION.COMPLETED)
    }

    /**
     * Les collisions sont-elles armées ? `COLLISION_DELAY` est un délai ÉCOULÉ, pas un événement :
     * il doit donc s'armer de lui-même, quel que soit le chemin qui l'interroge.
     *
     * Le drapeau n'était auparavant posé que dans `collisionStart`, qui repartait par un `return`
     * tant que le délai courait. Or la partie démarre fusée POSÉE sur son corps de spawn : l'unique
     * `collisionStart` du contact sol tombe dans ce délai, et le contact restant ensuite continu,
     * Matter n'émet plus que des `collisionActive`. `collisionsEnabled` restait donc false tant que
     * la fusée n'avait pas décollé PUIS re-percuté un corps.
     *
     * Conséquence mesurée au banc (1_solar, 1500 frames de contact avec la Terre, 2,2 s réelles
     * écoulées) : `collisionsEnabled` restait false, donc `canCrash` aussi, donc TOUTE la détection
     * de crash était désactivée. Un contact à plus de `CRASH_ANGLE_DEG` de la normale n'était alors
     * ni un atterrissage (angle hors tolérance) ni un crash, et comme `ROCKET.FRICTION` vaut 0 la
     * fusée glissait indéfiniment sur la surface (101 unités en 40 s à 40° d'inclinaison).
     *
     * @returns {boolean}
     */
    areCollisionsEnabled() {
        if (!this.collisionsEnabled && Date.now() - this.initTime >= this.PHYSICS.COLLISION_DELAY) {
            this.collisionsEnabled = true;
        }
        return this.collisionsEnabled;
    }

    /**
     * Configure les écouteurs d'événements pour les collisions de Matter.js.
     * Gère 'collisionStart', 'collisionActive', et 'collisionEnd'.
     */
    setupCollisionEvents() {
        // Idempotence : le moteur Matter est créé une seule fois mais initPhysics() rappelle
        // cette méthode à chaque reset/chargement de monde/épisode IA. Sans désabonnement,
        // les écouteurs s'empilent et chaque impact applique les dégâts N fois.
        // CollisionHandler est le seul abonné à ces trois événements (vérifié), donc un
        // Events.off par nom (sans callback) est sûr.
        this.Events.off(this.engine, 'collisionStart collisionActive collisionEnd');

        const rocketModel = this.physicsController.rocketModel;

        // Événement déclenché au début d'une collision
        this.Events.on(this.engine, 'collisionStart', (event) => {
            // Vérifier si les collisions sont actives et si le délai d'initialisation est écoulé.
            // L'armement est délégué à areCollisionsEnabled() : il doit dépendre du seul temps
            // écoulé, pas de l'arrivée d'un nouveau collisionStart (voir sa documentation).
            if (!this.areCollisionsEnabled()) {
                return; // Ignorer les collisions pendant le délai d'initialisation.
            }

            const pairs = event.pairs;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const rocketBody = this.physicsController.rocketBody;

                // S'assurer que les deux corps de la paire et le corps de la fusée existent.
                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                // Vérifier si la fusée est l'un des corps impliqués dans la collision.
                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;

                    if (!otherBody) continue; // Vérification supplémentaire pour l'autre corps.

                    // Calculer la vitesse d'impact RELATIVE entre la fusée et l'autre corps.
                    // On lit la vélocité réelle du corps (orbitale) via le modèle : les corps
                    // célestes étant `isStatic`, leur `body.velocity` ne reflète pas leur mouvement.
                    const otherVel = this.getCelestialBodyVelocity(otherBody);
                    // `collisionStart` est déclenché AVANT `Engine._bodiesUpdateVelocities` (vérifié
                    // dans Matter 0.19) : à cet instant `rocketBody.velocity` contient encore le
                    // DÉPLACEMENT BRUT du pas, soit ~1000× moins que l'échelle Matter puisque le jeu
                    // passe deltaTime en SECONDES. `Body.getVelocity` renvoie la valeur remise à
                    // l'échelle et donne le MÊME résultat depuis n'importe quel point du cycle Matter.
                    const rocketVel = this.Body.getVelocity(rocketBody);
                    const relVelX = rocketVel.x - otherVel.x;
                    const relVelY = rocketVel.y - otherVel.y;
                    const impactVelocity = Math.sqrt(relVelX * relVelX + relVelY * relVelY);
                    // impactVelocity est en ÉCHELLE MATTER (rocketBody.velocity et getCelestialBodyVelocity
                    // le sont). Le gate et les dégâts doivent raisonner en unités/seconde (u/s), sinon une
                    // vitesse ~16.67× trop grande inflige des centaines de dégâts au moindre contact rasant.
                    // On convertit localement (÷ MATTER_BASE_DELTA) : ce chemin de dégâts est le SEUL à
                    // utiliser u/s, les détections de crash/atterrissage restent en échelle Matter.
                    const impactSpeedUs = impactVelocity / this.PHYSICS.MATTER_BASE_DELTA;
                    const COLLISION_THRESHOLD = 2.5; // u/s, seuil pour différencier un contact léger d'un impact notable.

                    // CORRECTION: Vérifier si le propulseur principal est actif (tentative de décollage)
                    const mainStart = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
                    const isTryingToLiftOffStart = mainStart && mainStart.maxPower > 0 
                        ? (mainStart.power / mainStart.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT
                        : false;

                    // Tenter de détecter un atterrissage en utilisant la logique de `isRocketLanded`.
                    // CORRECTION: Ne pas considérer comme atterrissage si en train de décoller ou si délai de grâce actif
                    if (otherBody.label !== 'rocket' && !isTryingToLiftOffStart && this.isRocketLanded(rocketModel, otherBody)) {
                        // Vérifier le délai de grâce avant de mettre isLanded à true
                        if (!rocketModel.canSetLanded()) {
                            // Log supprimé pour éviter le spam lors des collisions répétées
                            continue;
                        }
                        rocketModel.isLanded = true;
                        rocketModel.landedOn = otherBody.label; // Enregistrer sur quel corps la fusée a atterri.

                        // Ajuster l'angle de la fusée pour qu'elle soit perpendiculaire à la surface du corps.
                        const angleToBody = Math.atan2(
                            rocketModel.position.y - otherBody.position.y,
                            rocketModel.position.x - otherBody.position.x
                        );
                        const correctAngle = angleToBody + Math.PI/2;
                        rocketModel.angle = correctAngle;
                        // La synchronisation de l'état physique (position, angle) est gérée par SynchronizationManager.

                        this._lastLandedState[otherBody.label] = !!rocketModel.isLanded;
                    } else {
                        // Gérer une collision normale (pas un atterrissage en douceur).
                        // Cette section est atteinte si isRocketLanded retourne false (soit c'est un crash, soit un contact non-atterrissage).
                        // Si c'est un crash, rocketModel.isDestroyed sera déjà true à cause de la logique dans isRocketLanded.
                        const impactDamage = impactSpeedUs * this.PHYSICS.IMPACT_DAMAGE_FACTOR;

                        if (otherBody.label !== 'rocket' && impactSpeedUs > COLLISION_THRESHOLD) {
                            // Collision significative.
                            if (!rocketModel.isDestroyed) {
                                // landedOn est posé avant applyDamage car le chemin de destruction
                                // s'en sert (écran de fin, épave attachée au corps).
                                const previousLandedOn = rocketModel.landedOn;
                                rocketModel.landedOn = otherBody.label;
                                const wasJustDestroyedByNonFatal = rocketModel.applyDamage(impactDamage);
                                if (!wasJustDestroyedByNonFatal && previousLandedOn !== otherBody.label) {
                                    // Rebond survécu sur un corps où la fusée n'était pas posée :
                                    // restaurer l'état précédent (null en vol, ou le corps d'appui
                                    // réel si elle est posée ailleurs). Sans cela, landedOn restait
                                    // renseigné en plein vol — ou désignait le mauvais corps.
                                    rocketModel.landedOn = previousLandedOn;
                                }
                                this.playCollisionSound(impactVelocity);

                                if (wasJustDestroyedByNonFatal) {
                                    // L'épave doit suivre le corps (surtout s'il est MOBILE) : poser attachedTo
                                    // active le suivi par SynchronizationManager (CAS débris). Sans cela, un crash
                                    // via ce chemin "impact" laissait attachedTo vide et l'épave restait fixe
                                    // pendant que la planète s'éloignait.
                                    rocketModel.attachedTo = otherBody.label;
                                    rocketModel.relativePosition = null;
                                    if (this.physicsController && this.physicsController.eventBus) {
                                        this.physicsController.eventBus.emit(window.EVENTS.ROCKET.DESTROYED, {
                                            position: { ...rocketModel.position },
                                            velocity: { ...rocketModel.velocity },
                                            impactVelocity: impactVelocity,
                                            destroyedOn: otherBody.label
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        // Événement pour les collisions actives (contact continu)
        this.Events.on(this.engine, 'collisionActive', (event) => {
            const pairs = event.pairs;
            const rocketBody = this.physicsController.rocketBody;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];

                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;

                    if (otherBody.label !== 'rocket') {
                        // CORRECTION: Vérifier si le propulseur principal est actif (tentative de décollage)
                        const main = rocketModel.thrusters && rocketModel.thrusters.main ? rocketModel.thrusters.main : null;
                        const isTryingToLiftOff = main && main.maxPower > 0 
                            ? (main.power / main.maxPower) * 100 > this.PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT
                            : false;
                        
                        // Log de diagnostic désactivé (trop verbeux - 60 fois/seconde)
                        // if (main && main.power > 0) {
                        //     console.log(`[CollisionActive] Contact avec ${otherBody.label}: isTryingToLiftOff=${isTryingToLiftOff}, power=${main.power}, maxPower=${main.maxPower}, isLanded=${rocketModel.isLanded}`);
                        // }
                        
                        // Si la fusée essaie de décoller, NE PAS la considérer comme atterrie
                        if (isTryingToLiftOff) {
                            // Log désactivé (trop verbeux)
                            // console.log(`[CollisionActive] Décollage en cours, ignorant atterrissage sur ${otherBody.label}`);
                            continue; // Passer au prochain pair
                        }
                        
                        // Si la fusée n'est pas détruite, pas encore atterrie, et pas en train de décoller
                        if (!rocketModel.isDestroyed && !rocketModel.isLanded && this.isRocketLanded(rocketModel, otherBody)) {
                            // Vérifier le délai de grâce avant de mettre isLanded à true
                            if (!rocketModel.canSetLanded()) {
                                // Log supprimé pour éviter le spam (~60x/sec pendant collisionActive)
                                continue;
                            }
                            rocketModel.isLanded = true;
                            rocketModel.landedOn = otherBody.label;
                            
                            // Mettre à jour le modèle de la fusée pour refléter l'atterrissage.
                            // La vitesse et la vélocité angulaire sont mises à zéro dans le modèle.
                            rocketModel.setVelocity(0, 0);
                            rocketModel.setAngularVelocity(0);
                            
                            // Ajuster l'angle du modèle pour être perpendiculaire à la surface.
                            const angleToBody = Math.atan2(
                                rocketModel.position.y - otherBody.position.y,
                                rocketModel.position.x - otherBody.position.x
                            );
                            const correctAngle = angleToBody + Math.PI/2;
                            rocketModel.angle = correctAngle;
                            
                            // Mettre à jour la position relative de la fusée par rapport au corps sur lequel elle a atterri.
                            const cbModel = this.physicsController.celestialBodies.find(cb => cb.model.name === otherBody.label)?.model;
                            if (cbModel) {
                                rocketModel.updateRelativePosition(cbModel);
                            }
                        }

                        // Si la fusée est considérée comme atterrie sur ce corps,
                        // SynchronizationManager s'occupera de maintenir sa position/orientation, surtout pour les corps mobiles.
                        // Aucune action directe sur le corps physique ici pour éviter les conflits.
                    }
                }
            }
        });

        // Événement de fin de collision
        this.Events.on(this.engine, 'collisionEnd', (event) => {
            const pairs = event.pairs;
            const rocketBody = this.physicsController.rocketBody;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if (!pair.bodyA || !pair.bodyB || !rocketBody) continue;

                if (pair.bodyA === rocketBody || pair.bodyB === rocketBody) {
                    const otherBody = pair.bodyA === rocketBody ? pair.bodyB : pair.bodyA;
                    // Si la fusée était atterrie sur cet 'otherBody' et que la collision se termine.
                    if ((otherBody.label !== 'rocket') && rocketModel.isLanded) {
                        this._lastLandedState[otherBody.label] = false;
                        // La logique de confirmation du décollage est gérée par SynchronizationManager
                    }
                }
            }
        });
    }

    /**
     * Joue un son de collision, avec un volume ajusté en fonction de la vélocité de l'impact.
     * @param {number} impactVelocity - La vélocité de l'impact.
     */
    playCollisionSound(impactVelocity) {
        if (!window.audioManager) return;
        window.audioManager.preload('collision', 'assets/sound/collision.mp3', { volume: 0.6 });
        window.audioManager.play('collision');
    }

    /**
     * Détermine si la fusée est considérée comme atterrie sur un autre corps.
     * Cette fonction vérifie la proximité, la vitesse, l'angle d'atterrissage et la vitesse angulaire.
     * Elle gère également la détection de crash si les conditions d'atterrissage ne sont pas respectées.
     * @param {RocketModel} rocketModel - Le modèle de la fusée.
     * @param {Matter.Body} otherBody - Le corps physique Matter.js avec lequel la collision est vérifiée.
     * @returns {boolean} True si la fusée est considérée comme atterrie, false sinon (y compris en cas de crash).
     */
    /**
     * Retourne la vélocité réelle d'un corps céleste.
     * Les corps célestes sont `isStatic` dans Matter.js : leur `body.velocity` n'est donc pas
     * fiable même lorsqu'ils orbitent. La source de vérité est la vélocité du modèle associé
     * (mise à jour par `updateOrbit`). On résout le modèle par référence du corps physique.
     * @param {Matter.Body} otherBody - Le corps physique entré en contact avec la fusée.
     * @returns {{x: number, y: number}} La vélocité du corps (0,0 si centrale/inconnue).
     */
    getCelestialBodyVelocity(otherBody) {
        if (otherBody && this.physicsController && Array.isArray(this.physicsController.celestialBodies)) {
            // Résolution par référence du corps physique, avec repli par nom/label : la
            // vérification périodique (SynchronizationManager) passe un objet corps SYNTHÉTIQUE
            // qui n'est jamais === cb.body ; sans le repli par label, la vélocité retomberait à 0
            // et la détection redeviendrait absolue au lieu de relative.
            let info = this.physicsController.celestialBodies.find(cb => cb.body === otherBody);
            if (!info && otherBody.label) {
                info = this.physicsController.celestialBodies.find(cb => cb.model && cb.model.name === otherBody.label);
            }
            if (info && info.model && info.model.velocity) {
                // model.velocity est en unités/seconde (orbital). On la met à l'échelle Matter
                // (× MATTER_BASE_DELTA = 1000/60) pour la comparer à rocketBody.velocity. Avec
                // l'ancienne conversion × deltaTime (~1000× trop petite), la vélocité du corps était
                // négligeable et la vitesse "relative" était de fait ABSOLUE : un atterrissage en
                // douceur (co-mobile) sur un corps rapide était classé à tort comme crash. Voir PHYSICS.md §1.
                const k = this.PHYSICS.MATTER_BASE_DELTA;
                return { x: (info.model.velocity.x || 0) * k, y: (info.model.velocity.y || 0) * k };
            }
        }
        // Repli : la vélocité d'un corps physique dynamique est déjà en unités Matter (par pas).
        if (otherBody && otherBody.velocity && !otherBody.isStatic) {
            return { x: otherBody.velocity.x || 0, y: otherBody.velocity.y || 0 };
        }
        return { x: 0, y: 0 };
    }

    isRocketLanded(rocketModel, otherBody) {
        const rocketBody = this.physicsController.rocketBody;
        // Vérifications initiales pour s'assurer que tous les objets nécessaires existent
        if (!rocketBody || !otherBody || !otherBody.position || (otherBody.circleRadius === undefined && otherBody.radius === undefined) || !rocketModel) {
            return false;
        }

        // Pendant la période de grâce de décollage, ne JAMAIS considérer la fusée comme posée.
        // Sur un corps EN MOUVEMENT, la fusée qui décolle suit presque l'orbite du corps, donc sa
        // vitesse RELATIVE reste faible : sans cette garde, isRocketLanded re-détecterait un
        // atterrissage, isLanded serait ré-armé, et la stabilisation ré-ancrerait la fusée sur la
        // surface mobile ("collée à la planète"). La grâce étant rafraîchie tant que le propulseur
        // pousse, cette protection couvre tout le décollage + 500 ms après l'arrêt de la poussée.
        if (typeof rocketModel.isInLiftoffGracePeriod === 'function' && rocketModel.isInLiftoffGracePeriod()) {
            return false;
        }

        // Si le modèle indique déjà un atterrissage sur ce corps, on considère que c'est toujours le cas.
        // Cela évite des calculs redondants ou des changements d'état rapides.
        if (rocketModel.isLanded && rocketModel.landedOn === otherBody.label) {
            return true;
        }

        // --- Calculs géométriques et cinématiques ---
        const rocketX = rocketBody.position.x;
        const rocketY = rocketBody.position.y;
        const bodyX = otherBody.position.x;
        const bodyY = otherBody.position.y;
        const dx = rocketX - bodyX;
        const dy = rocketY - bodyY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Vérifier que distance est valide avant utilisation
        if (!isFinite(distance) || distance <= 0) {
            return false;
        }
        
        const bodyRadius = otherBody.circleRadius ?? otherBody.radius;
        if (bodyRadius === undefined) {
            return false;
        }
        
        const rocketEffectiveRadius = this.ROCKET.HEIGHT / 2; // Approximation du "rayon" de la fusée pour contact.
        const distanceToSurface = distance - bodyRadius - rocketEffectiveRadius;
        const proximityThreshold = this.PHYSICS.LANDING_PROXIMITY_THRESHOLD; // Seuil de proximité (px) pour un contact potentiel.
        const isCloseToSurface = Math.abs(isNaN(distanceToSurface) ? Infinity : distanceToSurface) < proximityThreshold;


        // Vitesse RELATIVE au corps céleste : un atterrissage ou un crash se juge par rapport à
        // la surface (qui peut être en orbite/mouvement), pas dans le référentiel absolu du monde.
        const bodyVelocity = this.getCelestialBodyVelocity(otherBody);
        // Même lecture que dans le handler `collisionStart` : cette méthode est appelée AVANT le
        // rescaling de Matter (depuis collisionStart) ET après (collisionActive, vérification
        // périodique de SynchronizationManager). `Body.getVelocity`/`getAngularVelocity` donnent la
        // même valeur dans les trois cas : un seul point de lecture, cohérent quel que soit le
        // moment du cycle Matter. Sans cela, la vitesse "relative" valait de fait la vitesse
        // ABSOLUE du corps porteur (× MATTER_BASE_DELTA), rendant tout contact fatal sur un corps
        // orbitant vite (Phobos, Deimos). Voir PHYSICS.md §1.
        const rocketVel = this.Body.getVelocity(rocketBody);
        const relSpeedX = rocketVel.x - bodyVelocity.x;
        const relSpeedY = rocketVel.y - bodyVelocity.y;
        const speed = Math.sqrt(relSpeedX * relSpeedX + relSpeedY * relSpeedY);
        const angularVelocity = Math.abs(this.Body.getAngularVelocity(rocketBody));

        // Calcul de l'angle d'orientation de la fusée par rapport à la normale à la surface du corps céleste.
        const surfaceAngle = Math.atan2(dy, dx); // Angle du vecteur allant du centre du corps vers la fusée.
        let rocketOrientation = rocketBody.angle; // Angle actuel de la fusée.
        // Normaliser l'orientation de la fusée entre -PI et PI.
        while (rocketOrientation <= -Math.PI) rocketOrientation += 2 * Math.PI;
        while (rocketOrientation > Math.PI) rocketOrientation -= 2 * Math.PI;
        
        // L'orientation correcte pour un atterrissage est perpendiculaire au rayon (tangente + PI/2).
        let correctOrientation = surfaceAngle + Math.PI / 2;
        // Normaliser l'orientation correcte entre -PI et PI.
        while (correctOrientation <= -Math.PI) correctOrientation += 2 * Math.PI;
        while (correctOrientation > Math.PI) correctOrientation -= 2 * Math.PI;
        
        // Différence absolue entre l'angle de la fusée et l'angle idéal d'atterrissage.
        let angleDiff = Math.abs(rocketOrientation - correctOrientation);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff; // Assurer que la différence est le plus petit angle.
        const angleDiffDeg = angleDiff * (180 / Math.PI);

        // Conversion des seuils d'angle (définis en degrés dans les constantes) en radians pour comparaison.
        const landingAngleThresholdRad = this.PHYSICS.LANDING_MAX_ANGLE_DEG * (Math.PI / 180);
        const crashAngleThresholdRad = this.PHYSICS.CRASH_ANGLE_DEG * (Math.PI / 180);

        // --- Log de débogage conditionnel (désactivé pour réduire le bruit) --- 
        // if (isCloseToSurface && !rocketModel.isDestroyed) {
        //     console.log(`isRocketLanded Check (${otherBody.label}): ` +
        //                 `Close=${isCloseToSurface}, DistToSurf=${distanceToSurface.toFixed(2)}, Speed=${speed.toFixed(2)}, ` +
        //                 `AngleDiff=${angleDiffDeg.toFixed(1)}°, AngVel=${angularVelocity.toFixed(3)}`);
        // }

        // --- Logique de décision : CRASH ou ATTERRISSAGE --- 
        // Un crash ne peut se produire que si les collisions sont activées (après le délai initial).
        const canCrash = this.areCollisionsEnabled();

        // 1. Vérifier les conditions de CRASH (si proche de la surface et collisions activées)
        if (isCloseToSurface && canCrash && !rocketModel.isDestroyed) {
            let crashReason = null;
            if (speed >= this.PHYSICS.CRASH_SPEED_THRESHOLD) {
                crashReason = `Vitesse trop élevée (actuelle: ${speed.toFixed(2)} m/s, max: ${this.PHYSICS.CRASH_SPEED_THRESHOLD} m/s)`;
            } else if (angleDiff > crashAngleThresholdRad) {
                crashReason = `Angle d'atterrissage incorrect (actuel: ${angleDiffDeg.toFixed(1)}°, max: ${this.PHYSICS.CRASH_ANGLE_DEG}°)`;
            } else if (angularVelocity > this.PHYSICS.CRASH_ANGULAR_VELOCITY) {
                // Unités : échelle Matter (≈ rad/s × MATTER_BASE_DELTA). On affiche les deux pour ne pas
                // reproduire l'ancienne annotation trompeuse « rad/s » (cf. PHYSICS.md §1.2).
                crashReason = `Vitesse angulaire trop élevée (actuelle: ${angularVelocity.toFixed(1)} éch. Matter ≈ ${(angularVelocity / this.PHYSICS.MATTER_BASE_DELTA).toFixed(2)} rad/s, max: ${this.PHYSICS.CRASH_ANGULAR_VELOCITY})`;
            }

            if (crashReason) {
                rocketModel.landedOn = otherBody.label;
                rocketModel.attachedTo = otherBody.label;
                rocketModel.relativePosition = null;
                // Invariant : une fusée en cours de crash ne doit jamais rester "posée".
                // Sans cela, si la fusée était isLanded=true juste avant l'impact, elle deviendrait
                // isLanded=true ET isDestroyed=true la même frame, et handleLandedOrAttachedRocket
                // appliquerait simultanément le cas "posé" et le cas "débris" (setPosition/setAngle/
                // setVelocity concurrents). On force explicitement isLanded=false ici, sans dépendre
                // du seul effet de bord d'applyDamage.
                rocketModel.isLanded = false;

                // Appliquer des dégâts fatals SI la fusée n'est pas déjà détruite
                let wasJustDestroyedByCrash = false;
                if (!rocketModel.isDestroyed) {
                    wasJustDestroyedByCrash = rocketModel.applyDamage(this.ROCKET.MAX_HEALTH + 1);
                }
                
                this.playCollisionSound(50);

                // Publier l'événement ROCKET.DESTROYED si la fusée vient d'être détruite
                if (wasJustDestroyedByCrash && this.physicsController && this.physicsController.eventBus && 
                    window.EVENTS && window.EVENTS.ROCKET && window.EVENTS.ROCKET.DESTROYED) {
                    this.physicsController.eventBus.emit(window.EVENTS.ROCKET.DESTROYED, {
                        position: { x: rocketBody.position.x, y: rocketBody.position.y },
                        velocity: { ...rocketBody.velocity },
                        impactVelocity: speed, 
                        destroyedOn: otherBody.label
                    });
                }
                
                // CustomEvent pour compatibilité
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('ROCKET_CRASH_EXPLOSION', {
                        detail: {
                            x: rocketBody.position.x,
                            y: rocketBody.position.y
                        }
                    }));
                }
                // Simuler l'enfoncement de la fusée dans le sol pour un effet visuel de crash.
                // CORRECTION: Vérifier distance avant division pour éviter NaN/Infinity
                if (otherBody.position && bodyRadius !== undefined) {
                    // Vérifier que distance est valide
                    if (distance <= 0 || !isFinite(distance)) {
                        return false;
                    }
                    
                    const CRASH_SINK_DEPTH = this.PHYSICS.CRASH_SINK_DEPTH; // Profondeur d'enfoncement (px) au crash.
                    const directionX = dx / distance; // Vecteur direction normalisé.
                    const directionY = dy / distance;
                    // Nouvelle position : sur la surface moins la moitié de la hauteur de la fusée, plus la profondeur d'enfoncement.
                    const newDist = bodyRadius + (this.ROCKET.HEIGHT / 2) - CRASH_SINK_DEPTH;
                    
                    rocketModel.position.x = otherBody.position.x + directionX * newDist;
                    rocketModel.position.y = otherBody.position.y + directionY * newDist;
                    
                    // NOTE: Body.setPosition() est utilisé ici uniquement pour l'effet visuel de crash.
                    // Normalement, SynchronizationManager gère la synchronisation physique ↔ modèle.
                    // Ce cas spécial est nécessaire pour forcer la position lors d'un crash.
                    if (this.Body && rocketBody) {
                        this.Body.setPosition(rocketBody, { x: rocketModel.position.x, y: rocketModel.position.y });
                    }
                }
                return false; // CRASH a eu lieu, donc pas un atterrissage réussi.
            }
        }

        // 2. Vérifier les conditions d'ATTERRISSAGE STABLE (si proche de la surface)
        if (isCloseToSurface) {
            const isStableSpeed = speed < this.PHYSICS.LANDING_MAX_SPEED;
            const isStableAngle = angleDiff <= landingAngleThresholdRad;
            const isStableAngularVelocity = angularVelocity <= this.PHYSICS.LANDING_MAX_ANGULAR_VELOCITY;

            if (isStableSpeed && isStableAngle && isStableAngularVelocity) {
                // Toutes les conditions pour un atterrissage en douceur sont remplies.
                return true; // ATTERRISSAGE réussi.
            }
        }

        // 3. Si ni proche, ni crashé, ni atterri de manière stable : la fusée n'est pas considérée comme posée.
        return false;
    }
} 