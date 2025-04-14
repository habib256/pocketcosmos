class BodyFactory {
    constructor(Bodies, Body, Attractors, ROCKET, PHYSICS) {
        this.Bodies = Bodies;
        this.Body = Body;
        this.Attractors = Attractors;
        this.ROCKET = ROCKET;
        this.PHYSICS = PHYSICS;
    }

    createRocketBody(rocketModel) {
        const rocketBody = this.Bodies.rectangle(
            rocketModel.position.x,
            rocketModel.position.y,
            this.ROCKET.WIDTH,
            this.ROCKET.HEIGHT,
            {
                mass: this.ROCKET.MASS,
                inertia: this.ROCKET.MASS * 1.5,
                friction: 0.8,
                restitution: 0.05,
                angle: rocketModel.angle,
                isStatic: false,
                label: 'rocket',
                frictionAir: 0.1, // Ajouter de la friction dans l'air pour ralentir naturellement
                // Amortissement angulaire initial défini dans PhysicsController après création
                sleepThreshold: -1, // Désactiver le repos pour le corps de la fusée
                collisionFilter: {
                    category: 0x0001,
                    mask: 0xFFFFFFFF
                },
                plugin: {
                    attractors: [
                        // Utiliser l'attracteur standard de Matter Attractors (relation en 1/r²)
                        this.Attractors.Attractors.gravity
                    ]
                }
            }
        );

        // Synchronisation initiale (sera faite dans PhysicsController après ajout au monde)
        // if (rocketBody) {
        //     this.Body.setVelocity(rocketBody, {
        //         x: rocketModel.velocity.x,
        //         y: rocketModel.velocity.y
        //     });
        //     this.Body.setAngularVelocity(rocketBody, rocketModel.angularVelocity);
        //     this.Body.setAngle(rocketBody, rocketModel.angle);
        // }

        return rocketBody;
    }

    createCelestialBody(bodyModel) {
        const options = {
            mass: bodyModel.mass,
            isStatic: true,
            label: bodyModel.name, // Utiliser le nom du corps comme label
            collisionFilter: {
                category: 0x0002,
                mask: 0x0001 // Collision uniquement avec la fusée (catégorie 1)
            },
            restitution: this.PHYSICS.RESTITUTION,
            friction: 0.05,
            plugin: {
                attractors: [
                    // Utiliser l'attracteur standard de Matter Attractors (relation en 1/r²)
                    this.Attractors.Attractors.gravity
                ]
            }
        };

        const celestialBody = this.Bodies.circle(
            bodyModel.position.x,
            bodyModel.position.y,
            bodyModel.radius,
            options
        );

        return celestialBody;
    }
} 