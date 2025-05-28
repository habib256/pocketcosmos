/**
 * Tests pour CelestialBodyModel - Corps célestes du système solaire
 */

describe('CelestialBodyModel', () => {
    let celestialBody;

    beforeEach(() => {
        // Configuration basique d'un corps céleste
        const config = {
            name: 'Test Planet',
            position: { x: 100, y: 200 },
            radius: 50,
            mass: 1000,
            color: '#FF0000',
            type: 'planet'
        };
        
        celestialBody = new CelestialBodyModel(config);
    });

    describe('initialisation', () => {
        test('initialise correctement avec la configuration', () => {
            expect(celestialBody.name).toBe('Test Planet');
            expect(celestialBody.position).toEqual({ x: 100, y: 200 });
            expect(celestialBody.radius).toBe(50);
            expect(celestialBody.mass).toBe(1000);
            expect(celestialBody.color).toBe('#FF0000');
            expect(celestialBody.type).toBe('planet');
        });

        test('utilise des valeurs par défaut appropriées', () => {
            const defaultBody = new CelestialBodyModel({});
            
            expect(defaultBody.name).toBe('Corps céleste');
            expect(defaultBody.position).toEqual({ x: 0, y: 0 });
            expect(defaultBody.radius).toBe(10);
            expect(defaultBody.mass).toBe(100);
            expect(defaultBody.color).toBe('#CCCCCC');
            expect(defaultBody.type).toBe('generic');
        });

        test('propriétés dérivées calculées correctement', () => {
            expect(celestialBody.isVisible).toBe(true);
            expect(celestialBody.gravitationalInfluence).toBeGreaterThan(0);
        });
    });

    describe('propriétés physiques', () => {
        test('calcule la surface correctement', () => {
            const expectedSurface = Math.PI * 50 * 50;
            expect(celestialBody.getSurfaceArea()).toBeCloseTo(expectedSurface, 2);
        });

        test('calcule la densité correctement', () => {
            const volume = (4/3) * Math.PI * Math.pow(50, 3);
            const expectedDensity = 1000 / volume;
            expect(celestialBody.getDensity()).toBeCloseTo(expectedDensity, 6);
        });

        test('calcule la vitesse d\'évasion', () => {
            // v = sqrt(2 * G * M / r)
            const escapeVelocity = celestialBody.getEscapeVelocity();
            expect(escapeVelocity).toBeGreaterThan(0);
            expect(typeof escapeVelocity).toBe('number');
        });
    });

    describe('interactions gravitationnelles', () => {
        test('calcule la distance par rapport à un point', () => {
            const point = { x: 200, y: 200 };
            const distance = celestialBody.getDistanceFromPoint(point);
            expect(distance).toBeCloseTo(100, 2); // sqrt((200-100)² + (200-200)²) = 100
        });

        test('calcule la force gravitationnelle', () => {
            const otherMass = 500;
            const distance = 100;
            const force = celestialBody.getGravitationalForce(otherMass, distance);
            
            expect(force).toBeGreaterThan(0);
            expect(typeof force).toBe('number');
        });

        test('détermine la sphère d\'influence', () => {
            const sphere = celestialBody.getSphereOfInfluence();
            expect(sphere).toBeGreaterThan(celestialBody.radius);
        });
    });

    describe('mise à jour et état', () => {
        test('update ne modifie pas les propriétés de base', () => {
            const originalPosition = { ...celestialBody.position };
            const originalMass = celestialBody.mass;
            
            celestialBody.update(16.67); // ~60fps
            
            expect(celestialBody.position).toEqual(originalPosition);
            expect(celestialBody.mass).toBe(originalMass);
        });

        test('isVisible reste constant pour un corps normal', () => {
            expect(celestialBody.isVisible).toBe(true);
            celestialBody.update(16.67);
            expect(celestialBody.isVisible).toBe(true);
        });
    });

    describe('types de corps célestes', () => {
        test('crée une étoile avec les bonnes propriétés', () => {
            const star = new CelestialBodyModel({
                name: 'Test Star',
                type: 'star',
                mass: 1000000,
                radius: 200,
                color: '#FFFF00'
            });
            
            expect(star.type).toBe('star');
            expect(star.mass).toBe(1000000);
            expect(star.color).toBe('#FFFF00');
        });

        test('crée une planète avec les bonnes propriétés', () => {
            const planet = new CelestialBodyModel({
                name: 'Test Planet',
                type: 'planet',
                mass: 50000,
                radius: 80,
                color: '#0080FF'
            });
            
            expect(planet.type).toBe('planet');
            expect(planet.mass).toBe(50000);
            expect(planet.color).toBe('#0080FF');
        });

        test('crée une lune avec les bonnes propriétés', () => {
            const moon = new CelestialBodyModel({
                name: 'Test Moon',
                type: 'moon',
                mass: 1000,
                radius: 20,
                color: '#CCCCCC'
            });
            
            expect(moon.type).toBe('moon');
            expect(moon.mass).toBe(1000);
            expect(moon.color).toBe('#CCCCCC');
        });
    });

    describe('validation et edge cases', () => {
        test('gère les masses négatives', () => {
            const invalidBody = new CelestialBodyModel({ mass: -100 });
            expect(invalidBody.mass).toBeGreaterThanOrEqual(0);
        });

        test('gère les rayons négatifs', () => {
            const invalidBody = new CelestialBodyModel({ radius: -50 });
            expect(invalidBody.radius).toBeGreaterThan(0);
        });

        test('gère les positions nulles', () => {
            const bodyWithNullPos = new CelestialBodyModel({ position: null });
            expect(bodyWithNullPos.position).toEqual({ x: 0, y: 0 });
        });

        test('calculs gravitationnels avec distance zéro', () => {
            expect(() => {
                celestialBody.getGravitationalForce(100, 0);
            }).not.toThrow();
        });
    });

    describe('méthodes utilitaires', () => {
        test('toString retourne une représentation lisible', () => {
            const str = celestialBody.toString();
            expect(str).toContain('Test Planet');
            expect(str).toContain('planet');
            expect(typeof str).toBe('string');
        });

        test('clone crée une copie indépendante', () => {
            const clone = celestialBody.clone();
            
            expect(clone.name).toBe(celestialBody.name);
            expect(clone.position).toEqual(celestialBody.position);
            expect(clone.position).not.toBe(celestialBody.position); // Référence différente
            
            // Modifier le clone ne doit pas affecter l'original
            clone.position.x = 999;
            expect(celestialBody.position.x).toBe(100);
        });

        test('getInfo retourne les informations complètes', () => {
            const info = celestialBody.getInfo();
            
            expect(info).toHaveProperty('name');
            expect(info).toHaveProperty('type');
            expect(info).toHaveProperty('mass');
            expect(info).toHaveProperty('radius');
            expect(info).toHaveProperty('position');
            expect(info).toHaveProperty('surfaceArea');
            expect(info).toHaveProperty('density');
        });
    });

    describe('scénarios d\'intégration', () => {
        test('système binaire - deux corps célestes', () => {
            const body1 = new CelestialBodyModel({
                name: 'Body 1',
                position: { x: 0, y: 0 },
                mass: 1000,
                radius: 50
            });
            
            const body2 = new CelestialBodyModel({
                name: 'Body 2',
                position: { x: 200, y: 0 },
                mass: 800,
                radius: 40
            });
            
            const distance = body1.getDistanceFromPoint(body2.position);
            const force1on2 = body1.getGravitationalForce(body2.mass, distance);
            const force2on1 = body2.getGravitationalForce(body1.mass, distance);
            
            expect(force1on2).toBeCloseTo(force2on1, 6); // Newton's 3rd law
        });

        test('performance avec beaucoup de corps', () => {
            const bodies = [];
            const startTime = performance.now();
            
            for (let i = 0; i < 100; i++) {
                bodies.push(new CelestialBodyModel({
                    name: `Body ${i}`,
                    position: { x: Math.random() * 1000, y: Math.random() * 1000 },
                    mass: Math.random() * 1000 + 100,
                    radius: Math.random() * 50 + 10
                }));
            }
            
            const endTime = performance.now();
            expect(endTime - startTime).toBeLessThan(100); // Moins de 100ms pour 100 corps
            expect(bodies.length).toBe(100);
        });
    });
}); 