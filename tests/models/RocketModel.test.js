/**
 * Tests unitaires pour RocketModel
 */

describe('RocketModel', () => {
    let rocket;

    beforeEach(() => {
        rocket = new RocketModel();
    });

    describe('initialisation', () => {
        test('initialise avec les valeurs par défaut', () => {
            expect(rocket.name).toBe('Rocket');
            expect(rocket.position).toEqual({ x: 0, y: 0 });
            expect(rocket.velocity).toEqual({ x: 0, y: 0 });
            expect(rocket.angle).toBe(0);
            expect(rocket.fuel).toBe(ROCKET.FUEL_MAX);
            expect(rocket.health).toBe(ROCKET.MAX_HEALTH);
            expect(rocket.isDestroyed).toBe(false);
            expect(rocket.isLanded).toBe(false);
        });

        test('initialise les propulseurs correctement', () => {
            expect(rocket.thrusters).toBeDefined();
            expect(rocket.thrusters.main).toBeDefined();
            expect(rocket.thrusters.rear).toBeDefined();
            expect(rocket.thrusters.left).toBeDefined();
            expect(rocket.thrusters.right).toBeDefined();
            
            // Tous les propulseurs devraient être à 0 au départ
            Object.values(rocket.thrusters).forEach(thruster => {
                expect(thruster.power).toBe(0);
                expect(thruster.maxPower).toBeGreaterThan(0);
            });
        });
    });

    describe('setPosition', () => {
        test('définit la position correctement', () => {
            rocket.setPosition(100, 200);
            expect(rocket.position.x).toBe(100);
            expect(rocket.position.y).toBe(200);
        });

        test('gère les coordonnées négatives', () => {
            rocket.setPosition(-50, -75);
            expect(rocket.position.x).toBe(-50);
            expect(rocket.position.y).toBe(-75);
        });
    });

    describe('setVelocity', () => {
        test('définit la vitesse correctement', () => {
            rocket.setVelocity(10, -5);
            expect(rocket.velocity.x).toBe(10);
            expect(rocket.velocity.y).toBe(-5);
        });
    });

    describe('setAngle', () => {
        test('définit l\'angle correctement', () => {
            rocket.setAngle(Math.PI / 2);
            expect(rocket.angle).toBe(Math.PI / 2);
        });
    });

    describe('setThrusterPower', () => {
        test('définit la puissance d\'un propulseur', () => {
            rocket.setThrusterPower('main', 50);
            expect(rocket.thrusters.main.power).toBe(50);
        });

        test('limite la puissance à la valeur maximale', () => {
            const maxPower = rocket.thrusters.main.maxPower;
            rocket.setThrusterPower('main', maxPower + 100);
            expect(rocket.thrusters.main.power).toBe(maxPower);
        });

        test('ne permet pas de puissance négative', () => {
            rocket.setThrusterPower('main', -100);
            expect(rocket.thrusters.main.power).toBe(0);
        });

        test('coupe les propulseurs si plus de carburant', () => {
            rocket.fuel = 0;
            rocket.setThrusterPower('main', 50);
            expect(rocket.thrusters.main.power).toBe(0);
        });

        test('coupe les propulseurs si fusée détruite', () => {
            rocket.isDestroyed = true;
            rocket.setThrusterPower('main', 50);
            expect(rocket.thrusters.main.power).toBe(0);
        });

        test('ignore les propulseurs inexistants', () => {
            expect(() => {
                rocket.setThrusterPower('inexistant', 100);
            }).not.toThrow();
        });
    });

    describe('consumeFuel', () => {
        test('consomme le carburant correctement', () => {
            const initialFuel = rocket.fuel;
            const consumed = 100;
            const result = rocket.consumeFuel(consumed);
            
            expect(rocket.fuel).toBe(initialFuel - consumed);
            expect(result).toBe(true);
        });

        test('ne peut pas consommer plus que disponible', () => {
            rocket.fuel = 50;
            const result = rocket.consumeFuel(100);
            
            expect(rocket.fuel).toBe(0);
            expect(result).toBe(false);
        });

        test('retourne false quand plus de carburant', () => {
            rocket.fuel = 0;
            const result = rocket.consumeFuel(10);
            
            expect(rocket.fuel).toBe(0);
            expect(result).toBe(false);
        });
    });

    describe('applyDamage', () => {
        test('applique les dommages correctement', () => {
            const initialHealth = rocket.health;
            const damage = 25;
            const result = rocket.applyDamage(damage);
            
            expect(rocket.health).toBe(initialHealth - damage);
            expect(result).toBe(false); // Pas encore détruite
            expect(rocket.isDestroyed).toBe(false);
        });

        test('détruit la fusée quand santé <= 0', () => {
            rocket.health = 50;
            const result = rocket.applyDamage(60);
            
            expect(rocket.health).toBe(0);
            expect(rocket.isDestroyed).toBe(true);
            expect(rocket.isLanded).toBe(false);
            expect(result).toBe(true); // Vient d'être détruite
        });

        test('coupe tous les propulseurs quand détruite', () => {
            rocket.setThrusterPower('main', 80);
            rocket.setThrusterPower('left', 50);
            
            rocket.applyDamage(rocket.health + 10);
            
            expect(rocket.thrusters.main.power).toBe(0);
            expect(rocket.thrusters.left.power).toBe(0);
        });

        test('ne fait rien si déjà détruite', () => {
            rocket.isDestroyed = true;
            rocket.health = 0;
            
            const result = rocket.applyDamage(50);
            
            expect(rocket.health).toBe(0);
            expect(result).toBe(false);
        });
    });

    describe('reset', () => {
        test('remet la fusée à l\'état initial', () => {
            // Modifier l'état
            rocket.setPosition(100, 200);
            rocket.setVelocity(10, -5);
            rocket.setAngle(Math.PI);
            rocket.consumeFuel(500);
            rocket.applyDamage(50);
            rocket.setThrusterPower('main', 80);
            
            // Reset
            rocket.reset();
            
            // Vérifier que tout est remis à zéro
            expect(rocket.position).toEqual({ x: 0, y: 0 });
            expect(rocket.velocity).toEqual({ x: 0, y: 0 });
            expect(rocket.angle).toBe(0);
            expect(rocket.fuel).toBe(ROCKET.FUEL_MAX);
            expect(rocket.health).toBe(ROCKET.MAX_HEALTH);
            expect(rocket.isDestroyed).toBe(false);
            expect(rocket.isLanded).toBe(false);
            expect(rocket.thrusters.main.power).toBe(0);
        });
    });

    describe('update', () => {
        test('consomme le carburant basé sur la puissance des propulseurs', () => {
            const initialFuel = rocket.fuel;
            rocket.setThrusterPower('main', 100);
            
            const deltaTime = 1/60; // 1 frame à 60 FPS
            rocket.update(deltaTime);
            
            expect(rocket.fuel).toBeLessThan(initialFuel);
        });

        test('coupe les propulseurs quand plus de carburant', () => {
            rocket.fuel = 1; // Très peu de carburant
            rocket.setThrusterPower('main', 100);
            
            // Plusieurs updates pour épuiser le carburant
            for (let i = 0; i < 100; i++) {
                rocket.update(1/60);
                if (rocket.fuel <= 0) break;
            }
            
            expect(rocket.fuel).toBe(0);
            expect(rocket.thrusters.main.power).toBe(0);
        });

        test('ne fait rien si fusée détruite', () => {
            rocket.isDestroyed = true;
            rocket.setThrusterPower('main', 100);
            const initialFuel = rocket.fuel;
            
            rocket.update(1/60);
            
            expect(rocket.fuel).toBe(initialFuel);
            expect(rocket.thrusters.main.power).toBe(0);
        });
    });

    describe('updateRelativePosition', () => {
        test('calcule la position relative par rapport à un corps céleste', () => {
            const celestialBody = {
                name: 'Terre',
                position: { x: 100, y: 100 },
                currentOrbitAngle: 0
            };
            
            rocket.setPosition(150, 150);
            rocket.landedOn = 'Terre';
            
            rocket.updateRelativePosition(celestialBody);
            
            expect(rocket.relativePosition).toBeDefined();
            expect(rocket.relativePosition.x).toBe(50);
            expect(rocket.relativePosition.y).toBe(50);
            expect(rocket.relativePosition.distance).toBeCloseTo(Math.sqrt(50*50 + 50*50), 5);
        });

        test('ne fait rien si pas liée au corps céleste', () => {
            const celestialBody = {
                name: 'Lune',
                position: { x: 100, y: 100 }
            };
            
            rocket.landedOn = 'Terre'; // Différent du corps fourni
            
            rocket.updateRelativePosition(celestialBody);
            
            expect(rocket.relativePosition).toBeNull();
        });
    });

    describe('scénarios d\'intégration', () => {
        test('cycle de vie complet d\'une mission', () => {
            // Démarrage
            expect(rocket.isDestroyed).toBe(false);
            expect(rocket.fuel).toBe(ROCKET.FUEL_MAX);
            
            // Vol
            rocket.setThrusterPower('main', 500);
            rocket.update(1/60);
            expect(rocket.fuel).toBeLessThan(ROCKET.FUEL_MAX);
            
            // Atterrissage
            rocket.isLanded = true;
            rocket.landedOn = 'Lune';
            expect(rocket.isLanded).toBe(true);
            
            // Reset pour nouvelle mission
            rocket.reset();
            expect(rocket.isLanded).toBe(false);
            expect(rocket.fuel).toBe(ROCKET.FUEL_MAX);
        });

        test('gestion des situations d\'urgence', () => {
            // Collision
            rocket.applyDamage(rocket.health);
            expect(rocket.isDestroyed).toBe(true);
            
            // Tentative d'utiliser les propulseurs après destruction
            rocket.setThrusterPower('main', 1000);
            expect(rocket.thrusters.main.power).toBe(0);
            
            // Update ne devrait rien faire
            const fuel = rocket.fuel;
            rocket.update(1/60);
            expect(rocket.fuel).toBe(fuel);
        });
    });
}); 