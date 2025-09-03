/**
 * @fileoverview Usine pour créer des instances de corps célestes et leurs modèles.
 * S'occupe de l'instanciation et de la configuration initiale des planètes, lunes, etc.
 */

/**
 * @class CelestialBodyFactory
 * @classdesc Gère la création et la configuration des modèles de corps célestes.
 * Cette classe centralise la logique de création pour assurer la cohérence
 * et faciliter la gestion des différents corps du système solaire simulé.
 */
class CelestialBodyFactory {
    /**
     * Crée une instance de CelestialBodyFactory.
     * Actuellement, le constructeur n'a pas de logique spécifique.
     */
    constructor() {
        // Pas besoin de constructeur complexe pour l'instant
    }

    /**
     * Crée et retourne un tableau de modèles de corps célestes configurés.
     * Inclut le Soleil, la Terre, la Lune, Mercure, Vénus, Mars, Phobos et Deimos,
     * chacun avec ses propriétés orbitales et physiques spécifiques.
     * @returns {CelestialBodyModel[]} Un tableau contenant les instances de CelestialBodyModel.
     */
    createCelestialBodies() {
        const celestialBodies = [];

        // 1. Soleil (Centre de l'univers, pas d'orbite)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Soleil',
            CELESTIAL_BODY.SUN.MASS,
            CELESTIAL_BODY.SUN.RADIUS,
            { x: 0, y: 0 }, // Position centrale
            '#FFD700',
            null, // Pas de corps parent pour l'orbite
            0,    // Pas de distance d'orbite
            0,    // Pas d'angle initial
            0     // Pas de vitesse d'orbite
        );

        const sun = celestialBodies.find(body => body.name === 'Soleil');

        // 2. Terre (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Terre',
            CELESTIAL_BODY.MASS, // Note: Semble utiliser CELESTIAL_BODY.MASS générique, vérifier si c'est CELESTIAL_BODY.EARTH.MASS
            CELESTIAL_BODY.RADIUS, // Note: Semble utiliser CELESTIAL_BODY.RADIUS générique, vérifier si c'est CELESTIAL_BODY.EARTH.RADIUS
            null, // La position sera calculée par _createAndAddCelestialBody
            '#1E88E5',
            sun,
            CELESTIAL_BODY.EARTH.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2, // Angle orbital initial aléatoire
            CELESTIAL_BODY.EARTH.ORBIT_SPEED
        );

        const earth = celestialBodies.find(body => body.name === 'Terre');

        // 3. Lune (Orbite autour de la Terre)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Lune',
            CELESTIAL_BODY.MOON.MASS,
            CELESTIAL_BODY.MOON.RADIUS,
            null,
            '#CCCCCC',
            earth,
            CELESTIAL_BODY.MOON.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.MOON.ORBIT_SPEED
        );

        // 4. Mercure (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Mercure',
            CELESTIAL_BODY.MERCURY.MASS,
            CELESTIAL_BODY.MERCURY.RADIUS,
            null,
            '#A9A9A9',
            sun,
            CELESTIAL_BODY.MERCURY.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.MERCURY.ORBIT_SPEED
        );

        // 5. Vénus (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Vénus',
            CELESTIAL_BODY.VENUS.MASS,
            CELESTIAL_BODY.VENUS.RADIUS,
            null,
            '#FFDEAD',
            sun,
            CELESTIAL_BODY.VENUS.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.VENUS.ORBIT_SPEED
        );

        // 6. Mars (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Mars',
            CELESTIAL_BODY.MARS.MASS,
            CELESTIAL_BODY.MARS.RADIUS,
            null,
            '#E57373',
            sun,
            CELESTIAL_BODY.MARS.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.MARS.ORBIT_SPEED
        );

        const mars = celestialBodies.find(body => body.name === 'Mars');

        // 7. Phobos (Orbite autour de Mars)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Phobos',
            CELESTIAL_BODY.PHOBOS.MASS,
            CELESTIAL_BODY.PHOBOS.RADIUS,
            null,
            '#8B4513',
            mars,
            CELESTIAL_BODY.PHOBOS.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.PHOBOS.ORBIT_SPEED
        );

        // 8. Deimos (Orbite autour de Mars)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Deimos',
            CELESTIAL_BODY.DEIMOS.MASS,
            CELESTIAL_BODY.DEIMOS.RADIUS,
            null,
            '#D2B48C',
            mars,
            CELESTIAL_BODY.DEIMOS.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.DEIMOS.ORBIT_SPEED
        );

        // 9. Jupiter (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Jupiter',
            CELESTIAL_BODY.JUPITER.MASS,
            CELESTIAL_BODY.JUPITER.RADIUS,
            null,
            '#C68C53',
            sun,
            CELESTIAL_BODY.JUPITER.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.JUPITER.ORBIT_SPEED
        );
        const jupiter = celestialBodies.find(body => body.name === 'Jupiter');

        // 10. Saturne (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Saturne',
            CELESTIAL_BODY.SATURN.MASS,
            CELESTIAL_BODY.SATURN.RADIUS,
            null,
            '#C2B280',
            sun,
            CELESTIAL_BODY.SATURN.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.SATURN.ORBIT_SPEED
        );
        const saturn = celestialBodies.find(body => body.name === 'Saturne');
        if (saturn) {
            saturn.hasRings = true;
        }

        // Lunes de Jupiter (Io, Europe, Ganymède, Callisto)
        if (jupiter) {
            this._createAndAddCelestialBody(
                celestialBodies,
                'Io',
                CELESTIAL_BODY.IO.MASS,
                CELESTIAL_BODY.IO.RADIUS,
                null,
                '#D4AA00',
                jupiter,
                CELESTIAL_BODY.IO.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.IO.ORBIT_SPEED
            );

            this._createAndAddCelestialBody(
                celestialBodies,
                'Europe',
                CELESTIAL_BODY.EUROPE.MASS,
                CELESTIAL_BODY.EUROPE.RADIUS,
                null,
                '#B0C4DE',
                jupiter,
                CELESTIAL_BODY.EUROPE.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.EUROPE.ORBIT_SPEED
            );

            this._createAndAddCelestialBody(
                celestialBodies,
                'Ganymède',
                CELESTIAL_BODY.GANYMEDE.MASS,
                CELESTIAL_BODY.GANYMEDE.RADIUS,
                null,
                '#AAAAAA',
                jupiter,
                CELESTIAL_BODY.GANYMEDE.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.GANYMEDE.ORBIT_SPEED
            );

            this._createAndAddCelestialBody(
                celestialBodies,
                'Callisto',
                CELESTIAL_BODY.CALLISTO.MASS,
                CELESTIAL_BODY.CALLISTO.RADIUS,
                null,
                '#888888',
                jupiter,
                CELESTIAL_BODY.CALLISTO.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.CALLISTO.ORBIT_SPEED
            );
        }

        // Lunes de Saturne (Titan, Encelade)
        if (saturn) {
            this._createAndAddCelestialBody(
                celestialBodies,
                'Titan',
                CELESTIAL_BODY.TITAN.MASS,
                CELESTIAL_BODY.TITAN.RADIUS,
                null,
                '#D2B48C',
                saturn,
                CELESTIAL_BODY.TITAN.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.TITAN.ORBIT_SPEED
            );

            this._createAndAddCelestialBody(
                celestialBodies,
                'Encelade',
                CELESTIAL_BODY.ENCELADE.MASS,
                CELESTIAL_BODY.ENCELADE.RADIUS,
                null,
                '#E0FFFF',
                saturn,
                CELESTIAL_BODY.ENCELADE.ORBIT_DISTANCE,
                Math.random() * Math.PI * 2,
                CELESTIAL_BODY.ENCELADE.ORBIT_SPEED
            );
        }

        // 11. Uranus (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Uranus',
            CELESTIAL_BODY.URANUS.MASS,
            CELESTIAL_BODY.URANUS.RADIUS,
            null,
            '#7FB3D5',
            sun,
            CELESTIAL_BODY.URANUS.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.URANUS.ORBIT_SPEED
        );

        // 12. Neptune (Orbite autour du Soleil)
        this._createAndAddCelestialBody(
            celestialBodies,
            'Neptune',
            CELESTIAL_BODY.NEPTUNE.MASS,
            CELESTIAL_BODY.NEPTUNE.RADIUS,
            null,
            '#4169E1',
            sun,
            CELESTIAL_BODY.NEPTUNE.ORBIT_DISTANCE,
            Math.random() * Math.PI * 2,
            CELESTIAL_BODY.NEPTUNE.ORBIT_SPEED
        );

        return celestialBodies;
    }

    /**
     * Crée une instance de CelestialBodyModel, la configure et l'ajoute à la liste.
     * Calcule la position initiale si un corps parent est fourni.
     * @private
     * @param {CelestialBodyModel[]} bodiesArray - Le tableau où ajouter le nouveau corps.
     * @param {string} name - Le nom du corps céleste.
     * @param {number} mass - La masse du corps céleste.
     * @param {number} radius - Le rayon du corps céleste.
     * @param {{x: number, y: number} | null} initialPosition - La position initiale, ou null si calculée orbitalement.
     * @param {string} color - La couleur du corps céleste.
     * @param {CelestialBodyModel | null} parentBody - Le corps céleste autour duquel celui-ci orbite (null si aucun).
     * @param {number} orbitDistance - La distance d'orbite par rapport au parentBody.
     * @param {number} initialAngle - L'angle orbital initial (en radians).
     * @param {number} orbitSpeed - La vitesse orbitale.
     */
    _createAndAddCelestialBody(bodiesArray, name, mass, radius, initialPosition, color, parentBody, orbitDistance, initialAngle, orbitSpeed) {
        let position;
        if (parentBody) {
            // Calcule la position initiale basée sur l'orbite autour du corps parent.
            position = {
                x: parentBody.position.x + Math.cos(initialAngle) * orbitDistance,
                y: parentBody.position.y + Math.sin(initialAngle) * orbitDistance
            };
        } else {
            // Utilise la position initiale fournie (par exemple, pour le Soleil).
            position = initialPosition;
        }

        const bodyModel = new CelestialBodyModel(
            name,
            mass,
            radius,
            position,
            color,
            parentBody,
            orbitDistance,
            initialAngle,
            orbitSpeed
        );

        // updateOrbit(0) initialise la position basée sur l'angle et la distance d'orbite.
        // Si parentBody est null (comme pour le Soleil), cette méthode ne devrait pas modifier la position
        // si CelestialBodyModel.updateOrbit est correctement implémentée pour ce cas.
        // Pour les corps en orbite, cela affine la position calculée ci-dessus si nécessaire
        // ou initialise les paramètres orbitaux.
        if (parentBody) { // Appeler updateOrbit uniquement pour les corps en orbite
             bodyModel.updateOrbit(0);
        }

        bodiesArray.push(bodyModel);
    }

    /**
     * Crée des CelestialBodyModel à partir d'un tableau de configurations.
     * Chaque config peut référencer un parent par name via parentName.
     * @param {Array<{id?:string,name:string,mass:number,radius:number,position?:{x:number,y:number},color?:string,parentName?:string,orbitDistance?:number,initialOrbitAngle?:number,orbitSpeed?:number}>} configs
     * @returns {CelestialBodyModel[]}
     */
    createCelestialBodiesFromConfigs(configs) {
        const created = [];
        const nameToBody = {};

        // Première passe: créer les corps sans parent assigné
        for (const cfg of configs) {
            const body = new CelestialBodyModel(
                cfg.name,
                cfg.mass,
                cfg.radius,
                cfg.position || { x: 0, y: 0 },
                cfg.color || '#FFFFFF',
                null,
                cfg.orbitDistance || 0,
                typeof cfg.initialOrbitAngle === 'number' ? cfg.initialOrbitAngle : 0,
                cfg.orbitSpeed || 0
            );
            // Propriétés additionnelles optionnelles
            if (cfg.hasRings) {
                body.hasRings = !!cfg.hasRings;
            }
            created.push(body);
            nameToBody[cfg.name] = body;
        }

        // Deuxième passe: lier les parents et faire une updateOrbit initiale si parent
        for (let i = 0; i < configs.length; i++) {
            const cfg = configs[i];
            const body = created[i];
            if (cfg.parentName && nameToBody[cfg.parentName]) {
                body.parentBody = nameToBody[cfg.parentName];
                body.updateOrbit(0);
            }
        }
        return created;
    }
} 