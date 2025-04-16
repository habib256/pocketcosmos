class RocketModel {
    constructor() {
        // Identité
        this.name = 'Rocket';
        
        // Position et mouvement
        this.position = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.angle = 0;
        this.angularVelocity = 0;
        
        // Propriétés physiques
        this.mass = ROCKET.MASS;
        this.width = ROCKET.WIDTH;
        this.height = ROCKET.HEIGHT;
        this.friction = ROCKET.FRICTION;
        this.momentOfInertia = ROCKET.MASS * 1.5;
        this.radius = ROCKET.WIDTH / 2;
        
        // Propulsion
        // Les positions des propulseurs sont définies en coordonnées polaires dans constants.js
        // L'angle définit la direction depuis le centre de la fusée (0 = droite, PI/2 = bas, PI = gauche, 3PI/2 = haut)
        // La distance définit l'éloignement du propulseur par rapport au centre de la fusée
        // Ces positions influencent:
        //  1. Le point d'application des forces, ce qui affecte la rotation et la stabilité
        //  2. La direction de la poussée qui est perpendiculaire pour les propulseurs latéraux
        //  3. Le moment (couple) créé lors de l'activation des propulseurs
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
        this.fuel = ROCKET.FUEL_MAX;
        this.health = ROCKET.MAX_HEALTH;
        this.isDestroyed = false;
        this.isLanded = false;
        this.landedOn = null;
        this.crashedOn = null;
        
        // Position relative au corps céleste sur lequel on s'est crashé
        this.relativePosition = null; // Position par rapport au corps céleste
        this.attachedTo = null; // Référence au corps céleste auquel la fusée est attachée
    }
    
    // Réinitialiser l'état de la fusée à ses valeurs par défaut
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
        this.isLanded = false; // Commencer comme non posé, sera défini lors de l'initialisation
        this.landedOn = null;
        this.crashedOn = null;
        
        // Réinitialiser la position relative
        this.relativePosition = null;
        this.attachedTo = null;

        // Réinitialiser la puissance des propulseurs
        for (const thrusterName in this.thrusters) {
            this.setThrusterPower(thrusterName, 0);
        }

        // Le cargo est réinitialisé dans GameController.resetRocket
    }
    
    setPosition(x, y) {
        this.position.x = x;
        this.position.y = y;
    }
    
    setVelocity(vx, vy) {
        this.velocity.x = vx;
        this.velocity.y = vy;
    }
    
    setAngle(angle) {
        this.angle = angle;
    }
    
    setAngularVelocity(angularVel) {
        this.angularVelocity = angularVel;
    }
    
    setThrusterPower(thrusterName, power) {
        // Si plus de carburant ou fusée détruite, aucun thruster ne doit fonctionner
        if (this.fuel <= 0 || this.isDestroyed) {
            if (this.thrusters[thrusterName]) {
                this.thrusters[thrusterName].power = 0;
            }
            return;
        }
        if (this.thrusters[thrusterName]) {
            // Limiter la puissance entre 0 et la puissance maximale du propulseur
            const maxPower = this.thrusters[thrusterName].maxPower;
            this.thrusters[thrusterName].power = Math.max(0, Math.min(maxPower, power));
        }
    }
    
    consumeFuel(amount) {
        this.fuel = Math.max(0, this.fuel - amount);
        return this.fuel > 0;
    }
    
    applyDamage(amount) {
        if (this.isDestroyed) return;
        
        this.health -= amount;
        
        if (this.health <= 0) {
            this.health = 0;
            this.isDestroyed = true;
            
            // Si on est sur la Terre ou sur la Lune quand on est détruit, enregistrer la position relative
            if (this.landedOn === 'Lune' || this.landedOn === 'Terre') {
                // Conserver l'information qu'on est attaché au corps céleste pour le mouvement
                this.attachedTo = this.landedOn;
                
                // Ne pas réinitialiser landedOn pour les débris
                console.log(`Fusée détruite sur ${this.landedOn} - conservation de l'attachement`);
            } else {
                // Dans les autres cas, réinitialiser landedOn
                this.landedOn = null;
            }
            
            // Une fusée détruite n'est plus considérée comme atterrie
            this.isLanded = false;
            
            console.log(`Fusée détruite${this.attachedTo ? ' sur ' + this.attachedTo : ''}!`);
            
            // Désactiver tous les propulseurs
            for (const thrusterName in this.thrusters) {
                this.setThrusterPower(thrusterName, 0);
            }
            
            // Jouer le son de crash une seule fois lors de la destruction
            try {
                const crashSound = new Audio('assets/sound/crash.mp3');
                crashSound.volume = 1.0; // Volume maximum
                crashSound.play().catch(error => {
                    console.error("Erreur lors de la lecture du son de crash:", error);
                });
            } catch (error) {
                console.error("Erreur lors de la lecture du fichier crash.mp3:", error);
            }

            // Déclencher une explosion de particules à la position de la fusée
            if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ROCKET_CRASH_EXPLOSION', {
                    detail: { x: this.position.x, y: this.position.y }
                }));
            }
        }
    }
    
    // Calcule et met à jour la position relative par rapport à un corps céleste
    updateRelativePosition(celestialBody) {
        if (!celestialBody) return;
        const isRelatedToBody = (this.landedOn === celestialBody.name) || (this.attachedTo === celestialBody.name);
        if (isRelatedToBody) {
            const dx = this.position.x - celestialBody.position.x;
            const dy = this.position.y - celestialBody.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angleToBody = Math.atan2(dy, dx);
            // Nouvel angle relatif à l'angle orbital du corps céleste
            let angleRelatifOrbital = angleToBody;
            if (typeof celestialBody.currentOrbitAngle === 'number') {
                angleRelatifOrbital = angleToBody - celestialBody.currentOrbitAngle;
            }
            this.relativePosition = {
                x: dx,
                y: dy,
                angle: this.angle,
                distance: distance,
                angleToBody: angleToBody,
                angleRelatifOrbital: angleRelatifOrbital,
                dirX: dx / distance,
                dirY: dy / distance,
                absoluteX: this.position.x,
                absoluteY: this.position.y
            };
            if (celestialBody.name === 'Terre' && this.isLanded) {
                this.relativePosition.isFixedOnEarth = true;
            }
        }
    }
    
    // Met à jour la position absolue en fonction de la position du corps céleste auquel on est attaché
    updateAbsolutePosition(celestialBody) {
        if (!celestialBody || !this.relativePosition) return;
        const isRelatedToBody = (this.landedOn === celestialBody.name) || (this.attachedTo === celestialBody.name);
        if (isRelatedToBody) {
            if (this.relativePosition.isFixedOnEarth && celestialBody.name === 'Terre' && this.isLanded) {
                this.position.x = this.relativePosition.absoluteX;
                this.position.y = this.relativePosition.absoluteY;
                this.angle = this.relativePosition.angle;
                return;
            }
            // --- Correction pour corps mobiles ---
            if (typeof celestialBody.currentOrbitAngle === 'number' && typeof this.relativePosition.angleRelatifOrbital === 'number') {
                // Calculer l'angle absolu actuel
                const angleAbsolu = celestialBody.currentOrbitAngle + this.relativePosition.angleRelatifOrbital;
                this.position.x = celestialBody.position.x + Math.cos(angleAbsolu) * this.relativePosition.distance;
                this.position.y = celestialBody.position.y + Math.sin(angleAbsolu) * this.relativePosition.distance;
                // L'angle de la fusée reste perpendiculaire au rayon
                this.angle = angleAbsolu + Math.PI/2;
            } else {
                // Fallback : ancienne logique
                this.position.x = celestialBody.position.x + this.relativePosition.x;
                this.position.y = celestialBody.position.y + this.relativePosition.y;
                if (this.landedOn === celestialBody.name) {
                    this.angle = this.relativePosition.angleToBody + Math.PI/2;
                }
            }
        }
    }
} 