/**
 * Tests unitaires pour MathUtils
 */

describe('MathUtils', () => {
    beforeEach(() => {
        // Reset any state if needed
    });

    describe('distance', () => {
        test('calcule correctement la distance avec 4 paramètres', () => {
            const result = MathUtils.distance(0, 0, 3, 4);
            expect(result).toBe(5);
        });

        test('calcule correctement la distance avec 2 objets', () => {
            const point1 = { x: 0, y: 0 };
            const point2 = { x: 3, y: 4 };
            const result = MathUtils.distance(point1, point2);
            expect(result).toBe(5);
        });

        test('retourne 0 pour des points identiques', () => {
            expect(MathUtils.distance(5, 5, 5, 5)).toBe(0);
            expect(MathUtils.distance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
        });

        test('gère les coordonnées négatives', () => {
            const result = MathUtils.distance(-3, -4, 0, 0);
            expect(result).toBe(5);
        });

        test('gère les nombres décimaux', () => {
            const result = MathUtils.distance(0, 0, 1.5, 2);
            expect(result).toBeCloseTo(2.5, 5);
        });
    });

    describe('normalizeAngle', () => {
        test('normalise un angle dans la plage [-π, π]', () => {
            expect(MathUtils.normalizeAngle(0)).toBe(0);
            expect(MathUtils.normalizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 5);
            expect(MathUtils.normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 5);
        });

        test('normalise un angle supérieur à π', () => {
            const result = MathUtils.normalizeAngle(3 * Math.PI);
            // 3π - 2π = π, mais peut être normalisé vers -π (équivalent)
            expect(Math.abs(result)).toBeCloseTo(Math.PI, 5);
        });

        test('normalise un angle inférieur à -π', () => {
            const result = MathUtils.normalizeAngle(-3 * Math.PI);
            // -3π + 2π = -π, mais peut être normalisé vers π (équivalent)
            expect(Math.abs(result)).toBeCloseTo(Math.PI, 5);
        });

        test('normalise un angle très grand', () => {
            const result = MathUtils.normalizeAngle(10 * Math.PI);
            expect(result).toBeCloseTo(0, 5);
        });

        test('gère les angles multiples de 2π', () => {
            expect(MathUtils.normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 5);
            expect(MathUtils.normalizeAngle(4 * Math.PI)).toBeCloseTo(0, 5);
            expect(MathUtils.normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 5);
        });
    });

    describe('degToRad', () => {
        test('convertit 0° en 0 radians', () => {
            expect(MathUtils.degToRad(0)).toBe(0);
        });

        test('convertit 180° en π radians', () => {
            expect(MathUtils.degToRad(180)).toBeCloseTo(Math.PI, 5);
        });

        test('convertit 90° en π/2 radians', () => {
            expect(MathUtils.degToRad(90)).toBeCloseTo(Math.PI / 2, 5);
        });

        test('convertit 360° en 2π radians', () => {
            expect(MathUtils.degToRad(360)).toBeCloseTo(2 * Math.PI, 5);
        });

        test('gère les angles négatifs', () => {
            expect(MathUtils.degToRad(-90)).toBeCloseTo(-Math.PI / 2, 5);
        });
    });

    describe('radToDeg', () => {
        test('convertit 0 radians en 0°', () => {
            expect(MathUtils.radToDeg(0)).toBe(0);
        });

        test('convertit π radians en 180°', () => {
            expect(MathUtils.radToDeg(Math.PI)).toBeCloseTo(180, 5);
        });

        test('convertit π/2 radians en 90°', () => {
            expect(MathUtils.radToDeg(Math.PI / 2)).toBeCloseTo(90, 5);
        });

        test('convertit 2π radians en 360°', () => {
            expect(MathUtils.radToDeg(2 * Math.PI)).toBeCloseTo(360, 5);
        });

        test('gère les radians négatifs', () => {
            expect(MathUtils.radToDeg(-Math.PI / 2)).toBeCloseTo(-90, 5);
        });
    });

    describe('clamp', () => {
        test('retourne la valeur si elle est dans la plage', () => {
            expect(MathUtils.clamp(5, 0, 10)).toBe(5);
            expect(MathUtils.clamp(0, 0, 10)).toBe(0);
            expect(MathUtils.clamp(10, 0, 10)).toBe(10);
        });

        test('retourne min si la valeur est trop petite', () => {
            expect(MathUtils.clamp(-5, 0, 10)).toBe(0);
            expect(MathUtils.clamp(-100, -50, 50)).toBe(-50);
        });

        test('retourne max si la valeur est trop grande', () => {
            expect(MathUtils.clamp(15, 0, 10)).toBe(10);
            expect(MathUtils.clamp(100, -50, 50)).toBe(50);
        });

        test('gère les nombres décimaux', () => {
            expect(MathUtils.clamp(5.7, 0, 10)).toBe(5.7);
            expect(MathUtils.clamp(-0.5, 0, 1)).toBe(0);
            expect(MathUtils.clamp(1.5, 0, 1)).toBe(1);
        });

        test('gère le cas où min = max', () => {
            expect(MathUtils.clamp(5, 3, 3)).toBe(3);
            expect(MathUtils.clamp(1, 3, 3)).toBe(3);
        });
    });

    describe('intégration', () => {
        test('conversion degré-radian aller-retour', () => {
            const degrees = 45;
            const radians = MathUtils.degToRad(degrees);
            const backToDegrees = MathUtils.radToDeg(radians);
            expect(backToDegrees).toBeCloseTo(degrees, 5);
        });

        test('normalisation après conversion', () => {
            const largeDegrees = 450; // 90° après normalisation
            const radians = MathUtils.degToRad(largeDegrees);
            const normalized = MathUtils.normalizeAngle(radians);
            const backToDegrees = MathUtils.radToDeg(normalized);
            expect(backToDegrees).toBeCloseTo(90, 5);
        });

        test('distance et clamp ensemble', () => {
            const distance = MathUtils.distance(0, 0, 10, 10);
            const clampedDistance = MathUtils.clamp(distance, 0, 10);
            expect(clampedDistance).toBe(10); // distance ≈ 14.14, clampée à 10
        });
    });
}); 