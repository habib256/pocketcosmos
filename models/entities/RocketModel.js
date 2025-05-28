/**
 * Représente l'état de la fusée dans la simulation.
 * Contient les données physiques (position, vitesse, masse, etc.),
 * l'état des ressources (carburant, santé) et l'état opérationnel
 * (atterri, détruit, propulseurs actifs).
 * Ce modèle est destiné à être géré par les contrôleurs (PhysicsController, GameController)
 * et affiché par les vues (RocketView, VectorsView).
 * Il utilise les constantes définies dans `constants.js`.
 */
class RocketModel {
    /**
     * Initialise un nouveau modèle de fusée avec les valeurs par défaut de `constants.js`.
     */
    constructor() {
        // Identité
        this.name = 'Rocket';
        
        // Position et mouvement
        /** @type {{x: number, y: number}} Position actuelle (centre de masse) */
        this.position = { x: 0, y: 0 };
        /** @type {{x: number, y: number}} Vitesse actuelle */
        this.velocity = { x: 0, y: 0 };
        /** @type {{x: number, y: number}} Accélération actuelle (calculée par PhysicsController) */
        this.acceleration = { x: 0, y: 0 };
        /** @type {number} Angle actuel en radians (0 = droite, PI/2 = bas) */
        this.angle = 0;
        /** @type {number} Vitesse angulaire actuelle en radians/s */
        this.angularVelocity = 0;
        
        // Propriétés physiques
        /** @type {number} Masse en kg (depuis ROCKET.MASS) */
        this.mass = ROCKET.MASS;
        /** @type {number} Largeur de la hitbox (depuis ROCKET.WIDTH) */
        this.width = ROCKET.WIDTH;
        /** @type {number} Hauteur de la hitbox (depuis ROCKET.HEIGHT) */
        this.height = ROCKET.HEIGHT;
        /** @type {number} Friction (depuis ROCKET.FRICTION) */
        this.friction = ROCKET.FRICTION;
        /** @type {number} Moment d'inertie (calculé à partir de la masse) */
        this.momentOfInertia = ROCKET.MASS * 1.5;
        // this.radius a été supprimé car il est calculable via this.width / 2
        
        // Propulsion
        // Les positions et angles des propulseurs sont définis dans constants.js
        // et utilisés par ThrusterPhysics pour appliquer les forces et le couple.
        /**
         * @type {Object<string, {power: number, maxPower: number, position: {x: number, y: number}, angle: number}>}
         * État de chaque propulseur : puissance actuelle (0 à maxPower), puissance max, position relative au centre, angle.
         */
        this.thrusters = {
            main: {
                power: 0,
                maxPower: ROCKET.THRUSTER_POWER.MAIN,
                position: {
                    x: Math.cos(ROCKET.THRUSTER_POSITIONS.MAIN.angle) * ROCKET.THRUSTER_POSITIONS.MAIN.distance,
                    y: Math.sin(ROCKET.THRUSTER_POSITIONS.MAIN.angle) * ROCKET.THRUSTER_POSITIONS.MAIN.distance
                },
                angle: ROCKET.THRUSTER_POSITIONS.MAIN.angle
            },
            rear: {
                power: 0,
                maxPower: ROCKET.THRUSTER_POWER.REAR,
                position: {
                    x: Math.cos(ROCKET.THRUSTER_POSITIONS.REAR.angle) * ROCKET.THRUSTER_POSITIONS.REAR.distance,
                    y: Math.sin(ROCKET.THRUSTER_POSITIONS.REAR.angle) * ROCKET.THRUSTER_POSITIONS.REAR.distance
                },
                angle: ROCKET.THRUSTER_POSITIONS.REAR.angle
            },
            left: {
                power: 0,
                maxPower: ROCKET.THRUSTER_POWER.LEFT,
                position: {
                    x: Math.cos(ROCKET.THRUSTER_POSITIONS.LEFT.angle) * ROCKET.THRUSTER_POSITIONS.LEFT.distance,
                    y: Math.sin(ROCKET.THRUSTER_POSITIONS.LEFT.angle) * ROCKET.THRUSTER_POSITIONS.LEFT.distance
                },
                angle: ROCKET.THRUSTER_POSITIONS.LEFT.angle
            },
            right: {
                power: 0,
                maxPower: ROCKET.THRUSTER_POWER.RIGHT,
                position: {
                    x: Math.cos(ROCKET.THRUSTER_POSITIONS.RIGHT.angle) * ROCKET.THRUSTER_POSITIONS.RIGHT.distance,
                    y: Math.sin(ROCKET.THRUSTER_POSITIONS.RIGHT.angle) * ROCKET.THRUSTER_POSITIONS.RIGHT.distance
                },
                angle: ROCKET.THRUSTER_POSITIONS.RIGHT.angle
            }
        };
        
        // État
        /** @type {number} Quantité de carburant restante (depuis ROCKET.FUEL_MAX) */
        this.fuel = ROCKET.FUEL_MAX;
        /** @type {number} Santé restante (depuis ROCKET.MAX_HEALTH) */
        this.health = ROCKET.MAX_HEALTH;
        /** @type {boolean} Indique si la fusée est détruite (santé <= 0) */
        this.isDestroyed = false;
        /** @type {boolean} Indique si la fusée est actuellement posée sur un corps céleste */
        this.isLanded = false;
        /** @type {string|null} Nom du corps céleste sur lequel la fusée est posée (ex: 'Terre', 'Lune'). Null si non posée. */
        this.landedOn = null;
        // this.crashedOn a été supprimé car non utilisé.
        
        /**
         * @typedef {object} RelativePosition
         * @property {number} x - Décalage X par rapport au centre du corps céleste.
         * @property {number} y - Décalage Y par rapport au centre du corps céleste.
         * @property {number} angle - Angle de la fusée au moment de l'atterrissage/crash.
         * @property {number} distance - Distance au centre du corps céleste.
         * @property {number} angleToBody - Angle absolu vers le corps céleste.
         * @property {number} angleRelatifOrbital - Angle par rapport à l'orbite du corps céleste (pour suivre la rotation).
         * @property {number} dirX - Composante X du vecteur direction normalisé vers le corps.
         * @property {number} dirY - Composante Y du vecteur direction normalisé vers le corps.
         * @property {number} absoluteX - Position X absolue au moment de l'enregistrement.
         * @property {number} absoluteY - Position Y absolue au moment de l'enregistrement.
         * @property {boolean} [isFixedOnEarth] - Indicateur spécial pour un comportement fixe sur Terre.
         */
        /**
         * @type {RelativePosition|null}
         * Stocke la position et l'orientation de la fusée par rapport à un corps céleste
         * au moment où elle s'y attache (atterrissage ou destruction).
         * Permet de faire suivre la fusée (ou ses débris) au corps céleste.
         * Calculé par `updateRelativePosition`.
         */
        this.relativePosition = null;
        /**
         * @type {string|null}
         * Référence au nom du corps céleste auquel la fusée (ou ses débris) est actuellement attachée.
         * Utilisé conjointement avec `relativePosition` pour mettre à jour la position absolue via `updateAbsolutePosition`.
         * `landedOn` indique un atterrissage réussi, `attachedTo` indique un lien (atterri OU détruit).
         */
        this.attachedTo = null;
    }
    
    /**
     * Réinitialise l'état de la fusée à ses valeurs initiales.
     * Utilisé pour recommencer une partie ou lors de la création initiale.
     */
    reset() {
        // Réinitialiser la position et le mouvement
        this.position = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.angle = 0;
        this.angularVelocity = 0;

        // Réinitialiser l'état (santé, carburant)
        this.fuel = ROCKET.FUEL_MAX;
        this.health = ROCKET.MAX_HEALTH;
        this.isDestroyed = false;
        this.isLanded = false;
        this.landedOn = null;
        // this.crashedOn = null; // Déjà supprimé

        // Réinitialiser la position relative et l'attachement
        this.relativePosition = null;
        this.attachedTo = null;

        // Réinitialiser la puissance des propulseurs
        for (const thrusterName in this.thrusters) {
            this.setThrusterPower(thrusterName, 0);
        }

        // Note: Le cargo est géré et réinitialisé séparément, probablement dans GameController.
    }
    
    /**
     * Définit la position de la fusée.
     * @param {number} x - Coordonnée X.
     * @param {number} y - Coordonnée Y.
     */
    setPosition(x, y) {
        this.position.x = x;
        this.position.y = y;
    }
    
    /**
     * Définit la vitesse de la fusée.
     * @param {number} vx - Composante X de la vitesse.
     * @param {number} vy - Composante Y de la vitesse.
     */
    setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
    }
    
    /**
     * Définit l'angle de la fusée.
     * @param {number} angle - Angle en radians.
     */
    setAngle(angle) {
        this.angle = angle;
    }
    
    /**
     * Définit la vitesse angulaire de la fusée.
     * @param {number} angularVel - Vitesse angulaire en radians/s.
     */
    setAngularVelocity(angularVel) {
        this.angularVelocity = angularVel;
    }
    
    /**
     * Définit la puissance d'un propulseur spécifique.
     * La puissance est limitée entre 0 et `maxPower` du propulseur.
     * La puissance est mise à 0 si la fusée est détruite ou sans carburant.
     * @param {string} thrusterName - Nom du propulseur ('main', 'rear', 'left', 'right').
     * @param {number} power - Puissance souhaitée.
     */
    setThrusterPower(thrusterName, power) {
        if (!this.thrusters[thrusterName]) return; // Sécurité

        // Si plus de carburant ou fusée détruite, aucun propulseur ne doit fonctionner
        if (this.fuel <= 0 || this.isDestroyed) {
            this.thrusters[thrusterName].power = 0;
            return;
        }

        // Limiter la puissance entre 0 et la puissance maximale du propulseur
        const maxPower = this.thrusters[thrusterName].maxPower;
        this.thrusters[thrusterName].power = Math.max(0, Math.min(maxPower, power));
    }
    
    /**
     * Réduit le carburant de la fusée.
     * @param {number} amount - Quantité de carburant à consommer.
     * @returns {boolean} `true` s'il reste du carburant après consommation, `false` sinon.
     */
    consumeFuel(amount) {
        this.fuel = Math.max(0, this.fuel - amount);
        return this.fuel > 0;
    }
    
    /**
     * Applique des dommages à la santé de la fusée.
     * Si la santé tombe à 0 ou moins, la fusée est marquée comme détruite (`isDestroyed = true`),
     * son état d'atterrissage est réinitialisé, et l'attachement au corps céleste est géré
     * pour le suivi des débris. Désactive également tous les propulseurs.
     *
     * @param {number} amount - Quantité de dommages à appliquer.
     *
     * @improvement
     * La gestion des effets secondaires (son, particules) devrait idéalement être déplacée
     * vers un contrôleur qui écoute un événement émis par ce modèle (ex: 'ROCKET_DESTROYED').
     * Cela améliorerait la séparation des responsabilités (MVC).
     */
    applyDamage(amount) {
        if (this.isDestroyed) return false; // Déjà détruite, ne rien faire et indiquer pas de changement d'état

        const wasAlreadyDestroyed = this.isDestroyed; // Bien que redondant avec le check précédent, pour la logique claire
        this.health -= amount;
        let justDestroyed = false;
        
        if (this.health <= 0) {
            this.health = 0;
            if (!wasAlreadyDestroyed) {
                this.isDestroyed = true;
                justDestroyed = true; // La fusée vient d'être détruite par cet appel
                this.isLanded = false; // Si détruite, elle n'est plus considérée comme "atterrie" proprement dit

                // Désactiver tous les propulseurs
                for (const thrusterName in this.thrusters) {
                    this.setThrusterPower(thrusterName, 0);
                }
                
                console.log(`RocketModel: Fusée détruite. Santé: ${this.health}, vient d'être détruite: ${justDestroyed}`);
                // L'ancien dispatchEvent est supprimé ici
            }
        }
        return justDestroyed; // Retourne true si la fusée vient d'être détruite, false sinon
    }
    
    /**
     * Calcule et stocke la position/orientation relative de la fusée
     * par rapport à un corps céleste donné.
     * Doit être appelée lorsque la fusée s'attache à un corps (atterrissage/destruction).
     * Nécessaire pour que `updateAbsolutePosition` fonctionne correctement.
     *
     * @param {object} celestialBody - Le modèle du corps céleste (doit avoir `name`, `position`, `currentOrbitAngle`).
     */
    updateRelativePosition(celestialBody) {
        if (!celestialBody) return;

        // AJOUT LOG DE DEBUG - Commenté pour réduire le bruit
        // console.log(`[updateRelativePosition] Called for ${celestialBody.name}. Current landedOn: ${this.landedOn}, attachedTo: ${this.attachedTo}`);

        // Vérifie si la fusée est liée à CE corps céleste (soit par atterrissage, soit par destruction dessus)
        const isRelatedToBody = (this.landedOn === celestialBody.name) || (this.attachedTo === celestialBody.name);

        // AJOUT LOG DE DEBUG - Commenté pour réduire le bruit
        // console.log(`[updateRelativePosition] isRelatedToBody: ${isRelatedToBody}`);

        if (isRelatedToBody) {
            const dx = this.position.x - celestialBody.position.x;
            const dy = this.position.y - celestialBody.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // Éviter la division par zéro si la distance est nulle
            const dirX = distance === 0 ? 0 : dx / distance;
            const dirY = distance === 0 ? 0 : dy / distance;
            const angleToBody = Math.atan2(dy, dx);

            // Calculer l'angle relatif par rapport à l'orbite du corps céleste
            // S'assurer que currentOrbitAngle existe et est un nombre
            let angleRelatifOrbital = angleToBody;
            // AJOUT LOG DE DEBUG - Commenté pour réduire le bruit
            // console.log(`[updateRelativePosition] Calculating relative angle. Body Angle: ${celestialBody.currentOrbitAngle}`);
            if (typeof celestialBody.currentOrbitAngle === 'number') {
                angleRelatifOrbital = angleToBody - celestialBody.currentOrbitAngle;
                // Normaliser l'angle entre -PI et PI si nécessaire (optionnel)
                // angleRelatifOrbital = (angleRelatifOrbital + Math.PI * 3) % (Math.PI * 2) - Math.PI;
            }

            // AJOUT LOG DE DEBUG - Commenté pour réduire le bruit
            // console.log("[updateRelativePosition] Assigning this.relativePosition");
            this.relativePosition = {
                x: dx,
                y: dy,
                angle: this.angle, // Angle de la fusée au moment de l'attachement
                distance: distance,
                angleToBody: angleToBody, // Angle absolu vers le corps
                angleRelatifOrbital: angleRelatifOrbital, // Angle relatif à l'orbite du corps
                dirX: dirX,
                dirY: dirY,
                absoluteX: this.position.x, // Sauvegarde position absolue
                absoluteY: this.position.y
            };

            // Cas spécial pour Terre (si un comportement "fixe" est nécessaire)
            if (celestialBody.name === 'Terre' && this.isLanded) {
                this.relativePosition.isFixedOnEarth = true;
            }
        }
    }
    
    /**
     * Met à jour la position absolue et l'angle de la fusée pour qu'elle suive
     * le mouvement du corps céleste auquel elle est attachée (`this.attachedTo`).
     * Utilise les données stockées dans `this.relativePosition`.
     * L'angle de la fusée n'est mis à jour que si elle n'est PAS détruite, préservant l'orientation du crash.
     *
     * @param {object} celestialBody - Le modèle du corps céleste auquel la fusée est attachée.
     */
    updateAbsolutePosition(celestialBody) {
        // Vérifier si la fusée est attachée ou posée sur CE corps céleste et si les données relatives existent
        if (!celestialBody || !this.relativePosition || (this.attachedTo !== celestialBody.name && this.landedOn !== celestialBody.name)) {
            return;
        }

        // Sauvegarder l'angle actuel au cas où (surtout pour les débris)
        const originalAngle = this.angle;

        /* COMMENTED OUT: Bloc Terre Fixe - semble indésirable si Terre orbite
        // --- Gérer le cas spécial Terre "fixe" --- //
        if (this.relativePosition.isFixedOnEarth && celestialBody.name === 'Terre') {
            // Si la Terre ne bouge pas (ou si on veut un point fixe dessus),
            // on utilise la position absolue enregistrée.
            this.position.x = this.relativePosition.absoluteX;
            this.position.y = this.relativePosition.absoluteY;
            // Ne pas modifier l'angle (ni pour atterri, ni pour détruit)
            // this.angle = this.relativePosition.angle; // L'angle initial est conservé
            return; // Sortir tôt
        }
        */

        // --- Gérer les corps mobiles (en orbite) --- //
        //console.log(`[Debug Orbit Follow] Updating for ${this.attachedTo || this.landedOn} (${celestialBody?.name}). Body Angle: ${celestialBody?.currentOrbitAngle}, Relative Orbital Angle: ${this.relativePosition?.angleRelatifOrbital}`);

        if (typeof celestialBody.currentOrbitAngle === 'number' && typeof this.relativePosition.angleRelatifOrbital === 'number') {
            // Recalculer l'angle absolu basé sur l'orbite actuelle du corps et l'angle relatif enregistré
            const angleAbsolu = celestialBody.currentOrbitAngle + this.relativePosition.angleRelatifOrbital;

            // Mettre à jour la position absolue de la fusée
            this.position.x = celestialBody.position.x + Math.cos(angleAbsolu) * this.relativePosition.distance;
            this.position.y = celestialBody.position.y + Math.sin(angleAbsolu) * this.relativePosition.distance;

            // Mettre à jour l'angle de la fusée SEULEMENT si elle n'est PAS détruite
            // L'angle des débris doit rester celui du moment de la destruction.
            if (!this.isDestroyed) {
                // L'angle de la fusée doit suivre la rotation du corps pour rester "alignée" à la surface.
                // angleAbsolu est l'angle du point d'attache par rapport au centre du système.
                // L'angle de la fusée doit être perpendiculaire à cela (ou basé sur l'angle relatif initial).
                // Utiliser l'angle relatif enregistré (`this.relativePosition.angle`) par rapport à la nouvelle orientation.
                // L'angle de la fusée = (Angle actuel du corps) + (Angle relatif fusée/corps au moment de l'attache)
                // L'angle relatif fusée/corps = this.relativePosition.angle - this.relativePosition.angleToBody (?) Non, plus simple :
                // Angle relatif fusée/surface = this.relativePosition.angle - (this.relativePosition.angleToBody + PI/2) ? -> Complexe

                // Option simple: Faire pointer la fusée vers l'extérieur du corps céleste.
                // this.angle = angleAbsolu + Math.PI / 2;

                // Option préservant l'orientation relative initiale (plus logique) :
                // Différence angulaire entre l'angle actuel du point d'attache et l'angle au moment de l'attache
                const deltaAngle = angleAbsolu - this.relativePosition.angleToBody;
                this.angle = this.relativePosition.angle + deltaAngle;
            }

        } else {
            // --- Gérer les corps statiques (ne devrait pas arriver si tout orbite, mais par sécurité) --- //
            if (this.relativePosition.x !== undefined) {
                // Mettre à jour la position basée sur le décalage initial
                this.position.x = celestialBody.position.x + this.relativePosition.x;
                this.position.y = celestialBody.position.y + this.relativePosition.y;
                // Ne pas modifier l'angle ici non plus (ni pour atterri, ni pour détruit).
                // L'angle sur corps statique est celui de l'atterrissage/crash initial.
            }
        }

        // Sécurité: Restaurer l'angle original si la fusée est détruite, au cas où.
        // Normalement, la logique ci-dessus ne le modifie pas si isDestroyed est true.
        if (this.isDestroyed) {
            this.angle = originalAngle;
        }
    }

    /**
     * Met à jour l'état interne du modèle de la fusée.
     * Appelé à chaque frame par la boucle de jeu principale.
     * @param {number} deltaTime - Le temps écoulé depuis la dernière mise à jour, en secondes.
     */
    update(deltaTime) {
        if (this.isDestroyed) {
            // Si la fusée est détruite, s'assurer que tous les propulseurs sont à 0
            for (const thrusterName in this.thrusters) {
                if (this.thrusters[thrusterName].power > 0) {
                    this.setThrusterPower(thrusterName, 0);
                }
            }
            return; // Pas d'autre mise à jour si détruite
        }

        // Consommation de carburant basée sur la puissance des propulseurs
        let fuelConsumedThisFrame = 0;
        for (const thrusterName in this.thrusters) {
            const thruster = this.thrusters[thrusterName];
            if (thruster.power > 0) {
                // La consommation dépend de la puissance et du type de propulseur (via ROCKET.FUEL_CONSUMPTION)
                const consumptionRate = ROCKET.FUEL_CONSUMPTION[thrusterName.toUpperCase()] || ROCKET.FUEL_CONSUMPTION.DEFAULT;
                fuelConsumedThisFrame += thruster.power * consumptionRate * deltaTime;
            }
        }

        if (fuelConsumedThisFrame > 0) {
            this.consumeFuel(fuelConsumedThisFrame);
        }

        // Si plus de carburant, couper tous les propulseurs
        if (this.fuel <= 0) {
            for (const thrusterName in this.thrusters) {
                if (this.thrusters[thrusterName].power > 0) {
                    this.setThrusterPower(thrusterName, 0); // setThrusterPower gère déjà la condition fuel <= 0
                }
            }
        }

        // Autres logiques de mise à jour du modèle qui pourraient être nécessaires :
        // - Vérification de conditions de victoire/défaite basées sur l'état de la fusée
        // - Mise à jour de compteurs internes, etc.
        // - Si la physique n'est pas entièrement gérée par Matter.js pour ce modèle,
        //   des mises à jour de position/vélocité pourraient avoir lieu ici, mais c'est moins probable.
    }
}

// Rendre disponible globalement
window.RocketModel = RocketModel; 