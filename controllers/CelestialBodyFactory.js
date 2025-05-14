class CelestialBodyFactory {
    constructor() {
        // Pas besoin de constructeur complexe pour l'instant
    }

    createCelestialBodies() {
        const celestialBodies = [];

        // 1. Soleil (Centre de l'univers, pas d'orbite)
        const sun = new CelestialBodyModel(
            'Soleil',
            CELESTIAL_BODY.SUN.MASS,
            CELESTIAL_BODY.SUN.RADIUS,
            { x: 0, y: 0 },
            '#FFD700',
            null, 0, 0, 0
        );
        celestialBodies.push(sun);

        // 2. Terre (Orbite autour du Soleil)
        const EARTH_ORBIT_DISTANCE = CELESTIAL_BODY.EARTH.ORBIT_DISTANCE;
        const EARTH_ORBIT_SPEED = CELESTIAL_BODY.EARTH.ORBIT_SPEED;
        const earthInitialAngle = Math.random() * Math.PI * 2;
        const earth = new CelestialBodyModel(
            'Terre',
            CELESTIAL_BODY.MASS,
            CELESTIAL_BODY.RADIUS,
            { x: sun.position.x + Math.cos(earthInitialAngle) * EARTH_ORBIT_DISTANCE, y: sun.position.y + Math.sin(earthInitialAngle) * EARTH_ORBIT_DISTANCE },
            '#1E88E5',
            sun,
            EARTH_ORBIT_DISTANCE,
            earthInitialAngle,
            EARTH_ORBIT_SPEED
        );
        earth.updateOrbit(0);
        celestialBodies.push(earth);

        // 3. Lune (Orbite autour de la Terre)
        const MOON_ORBIT_DISTANCE = CELESTIAL_BODY.MOON.ORBIT_DISTANCE;
        const MOON_ORBIT_SPEED = CELESTIAL_BODY.MOON.ORBIT_SPEED;
        const moonInitialAngle = Math.random() * Math.PI * 2;
        const moon = new CelestialBodyModel(
            'Lune',
            CELESTIAL_BODY.MOON.MASS,
            CELESTIAL_BODY.MOON.RADIUS,
            { x: earth.position.x + Math.cos(moonInitialAngle) * MOON_ORBIT_DISTANCE, y: earth.position.y + Math.sin(moonInitialAngle) * MOON_ORBIT_DISTANCE },
            '#CCCCCC',
            earth,
            MOON_ORBIT_DISTANCE,
            moonInitialAngle,
            MOON_ORBIT_SPEED
        );
        moon.updateOrbit(0);
        celestialBodies.push(moon);

        // 4. Mercure (Orbite autour du Soleil)
        const MERCURY_ORBIT_DISTANCE = CELESTIAL_BODY.MERCURY.ORBIT_DISTANCE;
        const MERCURY_ORBIT_SPEED = CELESTIAL_BODY.MERCURY.ORBIT_SPEED;
        const mercuryInitialAngle = Math.random() * Math.PI * 2;
        const mercury = new CelestialBodyModel(
            'Mercure',
            CELESTIAL_BODY.MERCURY.MASS,
            CELESTIAL_BODY.MERCURY.RADIUS,
            { x: sun.position.x + Math.cos(mercuryInitialAngle) * MERCURY_ORBIT_DISTANCE, y: sun.position.y + Math.sin(mercuryInitialAngle) * MERCURY_ORBIT_DISTANCE },
            '#A9A9A9',
            sun,
            MERCURY_ORBIT_DISTANCE,
            mercuryInitialAngle,
            MERCURY_ORBIT_SPEED
        );
        mercury.updateOrbit(0);
        celestialBodies.push(mercury);

        // 5. Vénus (Orbite autour du Soleil)
        const VENUS_ORBIT_DISTANCE = CELESTIAL_BODY.VENUS.ORBIT_DISTANCE;
        const VENUS_ORBIT_SPEED = CELESTIAL_BODY.VENUS.ORBIT_SPEED;
        const venusInitialAngle = Math.random() * Math.PI * 2;
        const venus = new CelestialBodyModel(
            'Vénus',
            CELESTIAL_BODY.VENUS.MASS,
            CELESTIAL_BODY.VENUS.RADIUS,
            { x: sun.position.x + Math.cos(venusInitialAngle) * VENUS_ORBIT_DISTANCE, y: sun.position.y + Math.sin(venusInitialAngle) * VENUS_ORBIT_DISTANCE },
            '#FFDEAD',
            sun,
            VENUS_ORBIT_DISTANCE,
            venusInitialAngle,
            VENUS_ORBIT_SPEED
        );
        venus.updateOrbit(0);
        celestialBodies.push(venus);

        // 6. Mars (Orbite autour du Soleil)
        const MARS_ORBIT_DISTANCE = CELESTIAL_BODY.MARS.ORBIT_DISTANCE;
        const MARS_ORBIT_SPEED = CELESTIAL_BODY.MARS.ORBIT_SPEED;
        const marsInitialAngle = Math.random() * Math.PI * 2;
        const mars = new CelestialBodyModel(
            'Mars',
            CELESTIAL_BODY.MARS.MASS,
            CELESTIAL_BODY.MARS.RADIUS,
            { x: sun.position.x + Math.cos(marsInitialAngle) * MARS_ORBIT_DISTANCE, y: sun.position.y + Math.sin(marsInitialAngle) * MARS_ORBIT_DISTANCE },
            '#E57373',
            sun,
            MARS_ORBIT_DISTANCE,
            marsInitialAngle,
            MARS_ORBIT_SPEED
        );
        mars.updateOrbit(0);
        celestialBodies.push(mars);

        // 7. Phobos (Orbite autour de Mars)
        const PHOBOS_ORBIT_DISTANCE = CELESTIAL_BODY.PHOBOS.ORBIT_DISTANCE;
        const PHOBOS_ORBIT_SPEED = CELESTIAL_BODY.PHOBOS.ORBIT_SPEED;
        const phobosInitialAngle = Math.random() * Math.PI * 2;
        const phobos = new CelestialBodyModel(
            'Phobos',
            CELESTIAL_BODY.PHOBOS.MASS,
            CELESTIAL_BODY.PHOBOS.RADIUS,
            { x: mars.position.x + Math.cos(phobosInitialAngle) * PHOBOS_ORBIT_DISTANCE, y: mars.position.y + Math.sin(phobosInitialAngle) * PHOBOS_ORBIT_DISTANCE },
            '#8B4513',
            mars,
            PHOBOS_ORBIT_DISTANCE,
            phobosInitialAngle,
            PHOBOS_ORBIT_SPEED
        );
        phobos.updateOrbit(0);
        celestialBodies.push(phobos);

        // 8. Deimos (Orbite autour de Mars)
        const DEIMOS_ORBIT_DISTANCE = CELESTIAL_BODY.DEIMOS.ORBIT_DISTANCE;
        const DEIMOS_ORBIT_SPEED = CELESTIAL_BODY.DEIMOS.ORBIT_SPEED;
        const deimosInitialAngle = Math.random() * Math.PI * 2;
        const deimos = new CelestialBodyModel(
            'Deimos',
            CELESTIAL_BODY.DEIMOS.MASS,
            CELESTIAL_BODY.DEIMOS.RADIUS,
            { x: mars.position.x + Math.cos(deimosInitialAngle) * DEIMOS_ORBIT_DISTANCE, y: mars.position.y + Math.sin(deimosInitialAngle) * DEIMOS_ORBIT_DISTANCE },
            '#D2B48C',
            mars,
            DEIMOS_ORBIT_DISTANCE,
            deimosInitialAngle,
            DEIMOS_ORBIT_SPEED
        );
        deimos.updateOrbit(0);
        celestialBodies.push(deimos);

        return celestialBodies;
    }
} 