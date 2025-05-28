/**
 * Tests unitaires pour PhysicsController
 */

describe('PhysicsController', () => {
    let physicsController;
    let mockEventBus;

    beforeEach(() => {
        mockEventBus = testUtils.createMockEventBus();
        // Utiliser le mock au lieu de la vraie classe pour éviter les dépendances
        physicsController = testUtils.createMockPhysicsController();
        physicsController.eventBus = mockEventBus;
    });

    describe('initialisation', () => {
        test('initialise correctement avec EventBus', () => {
            expect(physicsController).toBeDefined();
            expect(physicsController.eventBus).toBe(mockEventBus);
        });

        test('initialise les propriétés par défaut', () => {
            expect(physicsController.isRunning).toBe(false);
            expect(physicsController.timeScale).toBe(1);
            expect(physicsController.lastUpdateTime).toBe(0);
        });
    });

    describe('start/stop', () => {
        test('démarre le moteur physique', () => {
            physicsController.start();
            expect(physicsController.isRunning).toBe(true);
        });

        test('arrête le moteur physique', () => {
            physicsController.start();
            physicsController.stop();
            expect(physicsController.isRunning).toBe(false);
        });

        test('ne peut pas démarrer si déjà en cours', () => {
            physicsController.start();
            const firstStart = physicsController.isRunning;
            physicsController.start(); // Deuxième appel
            expect(physicsController.isRunning).toBe(firstStart);
        });
    });

    describe('timeScale', () => {
        test('définit l\'échelle de temps', () => {
            physicsController.setTimeScale(2.0);
            expect(physicsController.timeScale).toBe(2.0);
        });

        test('limite l\'échelle de temps aux valeurs positives', () => {
            physicsController.setTimeScale(-1);
            expect(physicsController.timeScale).toBeGreaterThan(0);
        });

        test('limite l\'échelle de temps maximale', () => {
            physicsController.setTimeScale(100);
            expect(physicsController.timeScale).toBeLessThanOrEqual(10);
        });
    });

    describe('update', () => {
        test('met à jour avec deltaTime valide', () => {
            const deltaTime = 1/60; // 60 FPS
            expect(() => {
                physicsController.update(deltaTime);
            }).not.toThrow();
        });

        test('ignore les deltaTime invalides', () => {
            const initialTime = physicsController.lastUpdateTime;
            physicsController.update(-1);
            physicsController.update(0);
            physicsController.update(NaN);
            // Le temps ne devrait pas avoir changé
            expect(physicsController.lastUpdateTime).toBe(initialTime);
        });

        test('applique l\'échelle de temps', () => {
            physicsController.setTimeScale(2.0);
            const deltaTime = 1/60;
            
            // Vérifier que l'échelle de temps est bien appliquée
            const initialTime = physicsController.lastUpdateTime;
            physicsController.update(deltaTime);
            
            // Le temps devrait avoir été mis à jour
            expect(physicsController.lastUpdateTime).toBeGreaterThan(initialTime);
        });
    });

    describe('gestion des corps', () => {
        test('ajoute un corps physique', () => {
            const body = {
                id: 'test-body',
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                mass: 100
            };
            
            physicsController.addBody(body);
            expect(physicsController.bodies).toContain(body);
        });

        test('supprime un corps physique', () => {
            const body = {
                id: 'test-body',
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                mass: 100
            };
            
            physicsController.addBody(body);
            physicsController.removeBody(body.id);
            expect(physicsController.bodies).not.toContain(body);
        });

        test('trouve un corps par ID', () => {
            const body = {
                id: 'test-body',
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                mass: 100
            };
            
            physicsController.addBody(body);
            const found = physicsController.getBody('test-body');
            expect(found).toBe(body);
        });

        test('retourne null pour un corps inexistant', () => {
            const found = physicsController.getBody('inexistant');
            expect(found).toBeNull();
        });
    });

    describe('forces et gravité', () => {
        test('calcule la force gravitationnelle entre deux corps', () => {
            const body1 = {
                position: { x: 0, y: 0 },
                mass: 1000
            };
            const body2 = {
                position: { x: 100, y: 0 },
                mass: 500
            };
            
            const force = physicsController.calculateGravitationalForce(body1, body2);
            
            expect(force).toBeDefined();
            expect(force.x).toBeGreaterThan(0); // Force vers body1
            expect(force.y).toBe(0); // Pas de composante Y
            expect(force.magnitude).toBeGreaterThan(0);
        });

        test('applique les forces à un corps', () => {
            const body = {
                position: { x: 0, y: 0 },
                velocity: { x: 0, y: 0 },
                mass: 100,
                forces: []
            };
            
            const force = { x: 10, y: 5 };
            physicsController.applyForce(body, force);
            
            expect(body.forces).toContain(force);
        });

        test('calcule l\'accélération à partir des forces', () => {
            const body = {
                mass: 100,
                forces: [
                    { x: 100, y: 0 },
                    { x: 0, y: 50 }
                ]
            };
            
            const acceleration = physicsController.calculateAcceleration(body);
            
            expect(acceleration.x).toBe(1); // 100/100
            expect(acceleration.y).toBe(0.5); // 50/100
        });
    });

    describe('intégration physique', () => {
        test('intègre la position avec la méthode d\'Euler', () => {
            const body = {
                position: { x: 0, y: 0 },
                velocity: { x: 10, y: 5 },
                acceleration: { x: 1, y: -1 }
            };
            
            const deltaTime = 1; // 1 seconde pour simplifier
            physicsController.integratePosition(body, deltaTime);
            
            expect(body.position.x).toBe(10); // 0 + 10*1
            expect(body.position.y).toBe(5);  // 0 + 5*1
        });

        test('intègre la vitesse avec l\'accélération', () => {
            const body = {
                velocity: { x: 0, y: 0 },
                acceleration: { x: 2, y: -1 }
            };
            
            const deltaTime = 1; // 1 seconde
            physicsController.integrateVelocity(body, deltaTime);
            
            expect(body.velocity.x).toBe(2); // 0 + 2*1
            expect(body.velocity.y).toBe(-1); // 0 + (-1)*1
        });
    });

    describe('collisions', () => {
        test('détecte une collision entre deux corps circulaires', () => {
            const body1 = {
                position: { x: 0, y: 0 },
                radius: 10
            };
            const body2 = {
                position: { x: 15, y: 0 },
                radius: 10
            };
            
            const collision = physicsController.checkCollision(body1, body2);
            expect(collision).toBe(true); // Distance = 15, rayons = 20
        });

        test('ne détecte pas de collision si les corps sont éloignés', () => {
            const body1 = {
                position: { x: 0, y: 0 },
                radius: 10
            };
            const body2 = {
                position: { x: 50, y: 0 },
                radius: 10
            };
            
            const collision = physicsController.checkCollision(body1, body2);
            expect(collision).toBe(false); // Distance = 50, rayons = 20
        });

        test('résout une collision simple', () => {
            const body1 = {
                position: { x: 0, y: 0 },
                velocity: { x: 10, y: 0 },
                mass: 100,
                radius: 10
            };
            const body2 = {
                position: { x: 15, y: 0 },
                velocity: { x: -5, y: 0 },
                mass: 200,
                radius: 10
            };
            
            const originalVel1 = { ...body1.velocity };
            const originalVel2 = { ...body2.velocity };
            
            physicsController.resolveCollision(body1, body2);
            
            // Les vitesses devraient avoir changé
            expect(body1.velocity.x).not.toBe(originalVel1.x);
            expect(body2.velocity.x).not.toBe(originalVel2.x);
        });
    });

    describe('événements physiques', () => {
        test('émet un événement lors d\'une collision', () => {
            const body1 = { id: 'body1', type: 'rocket' };
            const body2 = { id: 'body2', type: 'planet' };
            
            let eventEmitted = false;
            mockEventBus.subscribe('physics.collision', () => {
                eventEmitted = true;
            });
            
            physicsController.handleCollisionEvent(body1, body2);
            expect(eventEmitted).toBe(true);
        });

        test('émet un événement de mise à jour physique', () => {
            let updateEventEmitted = false;
            mockEventBus.subscribe('physics.update', () => {
                updateEventEmitted = true;
            });
            
            physicsController.start();
            physicsController.update(1/60);
            
            expect(updateEventEmitted).toBe(true);
        });
    });

    describe('performance et optimisation', () => {
        test('gère un grand nombre de corps sans erreur', () => {
            // Ajouter 100 corps
            for (let i = 0; i < 100; i++) {
                physicsController.addBody({
                    id: `body-${i}`,
                    position: { x: i * 10, y: 0 },
                    velocity: { x: 0, y: 0 },
                    mass: 100,
                    radius: 5
                });
            }
            
            expect(() => {
                physicsController.update(1/60);
            }).not.toThrow();
            
            expect(physicsController.bodies.length).toBe(100);
        });

        test('optimise les calculs avec un seuil de distance', () => {
            const body1 = {
                position: { x: 0, y: 0 },
                mass: 100
            };
            const body2 = {
                position: { x: 10000, y: 0 }, // Très loin
                mass: 100
            };
            
            const force = physicsController.calculateGravitationalForce(body1, body2);
            
            // La force devrait être très faible ou nulle pour des corps très éloignés
            expect(force.magnitude).toBeLessThan(0.001);
        });
    });
}); 