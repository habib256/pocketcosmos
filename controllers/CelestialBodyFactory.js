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
     * Vrai si `valeur` est un nombre FINI. `typeof x === 'number'` ne suffit PAS :
     * NaN et Infinity le satisfont, et une seule de ces valeurs injectée dans un corps
     * Matter empoisonne tout le monde physique (fusée NaN en une frame, irrécupérable
     * même après un reset). Les chaînes numériques ("1e3") sont volontairement rejetées :
     * elles se propagent en CONCATÉNATIONS de chaînes dans Matter (positions qui grossissent
     * à chaque frame) au lieu d'additions.
     * @param {*} valeur
     * @returns {boolean}
     */
    static estNombreFini(valeur) {
        return typeof valeur === 'number' && isFinite(valeur);
    }

    /**
     * Décrit une valeur pour un message d'erreur. `JSON.stringify` transforme NaN et
     * Infinity en `null` (le message deviendrait mensonger) : on passe donc par String()
     * pour les nombres.
     * @private
     */
    static _decrire(valeur) {
        if (typeof valeur === 'number') return String(valeur);
        try { return JSON.stringify(valeur); } catch (e) { return String(valeur); }
    }

    /**
     * Lit un champ numérique de configuration en garantissant un nombre FINI.
     * Absent (undefined/null) => valeur par défaut sans bruit. Présent mais invalide
     * (chaîne, NaN, Infinity, objet) => avertissement nommant le corps ET le champ,
     * puis valeur par défaut : on préfère un monde cohérent et bruyant à un monde NaN.
     * @private
     */
    static _lireNombre(valeur, defaut, nomCorps, champ) {
        if (valeur === undefined || valeur === null) return defaut;
        if (CelestialBodyFactory.estNombreFini(valeur)) return valeur;
        console.warn(`[CelestialBodyFactory] Corps '${nomCorps}': champ '${champ}' invalide (${typeof valeur} ${CelestialBodyFactory._decrire(valeur)}), il doit être un nombre fini. Valeur ${defaut} utilisée.`);
        return defaut;
    }

    /**
     * Lit un point {x, y} de configuration en garantissant deux nombres FINIS.
     * Rejette explicitement les tableaux ([10,20]) et les chaînes ("0,0") qui passaient
     * la simple vérification de véracité et produisaient des positions Matter NaN — ou pire,
     * des positions devenant des chaînes concaténées de plus en plus longues.
     * @private
     */
    static _lirePoint(valeur, defaut, nomCorps, champ) {
        if (valeur === undefined || valeur === null) return { x: defaut.x, y: defaut.y };
        if (typeof valeur !== 'object' || Array.isArray(valeur)) {
            console.warn(`[CelestialBodyFactory] Corps '${nomCorps}': champ '${champ}' invalide (${Array.isArray(valeur) ? 'tableau' : typeof valeur} ${CelestialBodyFactory._decrire(valeur)}), un objet {x, y} est attendu. Valeur (${defaut.x}, ${defaut.y}) utilisée.`);
            return { x: defaut.x, y: defaut.y };
        }
        if (!CelestialBodyFactory.estNombreFini(valeur.x) || !CelestialBodyFactory.estNombreFini(valeur.y)) {
            console.warn(`[CelestialBodyFactory] Corps '${nomCorps}': champ '${champ}' non fini (x=${CelestialBodyFactory._decrire(valeur.x)}, y=${CelestialBodyFactory._decrire(valeur.y)}). Valeur (${defaut.x}, ${defaut.y}) utilisée.`);
            return { x: defaut.x, y: defaut.y };
        }
        return { x: valeur.x, y: valeur.y };
    }

    /**
     * Normalise un nom de corps en CHAÎNE non vide.
     * Un nom numérique laissait `rocketModel.landedOn` valoir un nombre : missions et
     * ravitaillement (qui comparent des chaînes) ne se déclenchaient jamais, sans le moindre
     * message. On convertit donc, bruyamment, plutôt que de laisser un monde à moitié muet.
     * @private
     */
    static _normaliserNom(nom, index) {
        if (typeof nom === 'string' && nom.length > 0) return nom;
        if (CelestialBodyFactory.estNombreFini(nom) || typeof nom === 'boolean') {
            const converti = String(nom);
            console.warn(`[CelestialBodyFactory] bodies[${index}]: 'name' n'est pas une chaîne (${typeof nom} ${converti}). Converti en "${converti}" — sinon les missions et le ravitaillement ne se déclenchent jamais sur ce corps.`);
            return converti;
        }
        const genere = `Corps#${index}`;
        console.warn(`[CelestialBodyFactory] bodies[${index}]: 'name' absent ou invalide (${CelestialBodyFactory._decrire(nom)}). Nom de repli "${genere}" attribué.`);
        return genere;
    }

    /**
     * Crée des CelestialBodyModel à partir d'un tableau de configurations.
     * Chaque config peut référencer un parent par name via parentName.
     *
     * TOUT champ numérique est validé comme nombre FINI avant usage (voir estNombreFini) :
     * une seule valeur NaN/Infinity/chaîne suffisait à rendre le monde injouable en silence.
     * @param {Array<{id?:string,name:string,mass:number,radius:number,position?:{x:number,y:number},color?:string,parentName?:string,orbitDistance?:number,initialOrbitAngle?:number,orbitSpeed?:number}>} configs
     * @returns {CelestialBodyModel[]}
     */
    createCelestialBodiesFromConfigs(configs) {
        const created = [];
        // Table nom -> corps SANS prototype. Avec un objet littéral, un corps nommé
        // "__proto__" remplaçait le prototype de la table : ensuite des parentName tout à
        // fait ordinaires ('position', 'mass', 'name', 'constructor', 'toString') résolvaient
        // vers des membres HÉRITÉS, `parentBody` devenait un non-corps, updateOrbit levait une
        // TypeError et le monde entier était rejeté. Object.create(null) supprime la chaîne.
        const nameToBody = Object.create(null);

        if (!Array.isArray(configs)) {
            console.warn('[CelestialBodyFactory] createCelestialBodiesFromConfigs: configs n\'est pas un tableau, aucun corps créé.');
            return created;
        }

        // Garde-fou de VOLUME. Le plugin matter-attractors est QUADRATIQUE : mesuré à 60 FPS,
        // 203 corps = 3 à 4 ms/frame, 1003 corps = 80 à 95 ms/frame (~10 FPS), 3003 corps =
        // 718 ms/frame (le jeu est figé). Le budget d'une frame est de 16,7 ms, atteint vers
        // ~450 corps. On tronque là où la simulation reste réactive, même si elle est lente.
        // Les 6 mondes livrés comptent au plus 20 corps.
        const SEUIL_ALERTE_CORPS = 200;   // au-delà : encore jouable, mais on prévient
        const MAX_CORPS = 1000;           // au-delà : ~13 FPS ou pire, on tronque
        let listeConfigs = configs;
        if (listeConfigs.length > MAX_CORPS) {
            console.error(`[CelestialBodyFactory] ${listeConfigs.length} corps célestes demandés : TRONQUÉ à ${MAX_CORPS}. Au-delà, le coût gravitationnel quadratique dépasse 78 ms/frame et le jeu est injouable.`);
            listeConfigs = listeConfigs.slice(0, MAX_CORPS);
        } else if (listeConfigs.length > SEUIL_ALERTE_CORPS) {
            console.warn(`[CelestialBodyFactory] ${listeConfigs.length} corps célestes : au-delà de ~450 corps le budget de 16,7 ms/frame est dépassé (gravité quadratique). Baisses de FPS attendues.`);
        }

        // Première passe: créer les corps sans parent assigné
        for (let index = 0; index < listeConfigs.length; index++) {
            const cfg = listeConfigs[index];
            // Une entrée non-objet (null, chaîne, nombre) faisait lever une TypeError qui
            // annulait le CHARGEMENT COMPLET du monde. On l'ignore désormais, bruyamment.
            if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
                console.warn(`[CelestialBodyFactory] bodies[${index}] ignoré : ce n'est pas un objet de configuration (${CelestialBodyFactory._decrire(cfg)}).`);
                continue;
            }

            const nom = CelestialBodyFactory._normaliserNom(cfg.name, index);

            // Validation masse/rayon : un corps avec mass<=0 ou radius<=0 est dégénéré
            // (gravité nulle, rendu invalide). NON FINI est encore pire : une masse Infinity
            // (JSON `1e400` se parse en Infinity) donne un corps Matter de masse infinie qui
            // rend la fusée NaN en une frame. On l'ignore avec un avertissement plutôt
            // que de casser la simulation.
            // Bornes hautes : un rayon de 1e300 est FINI mais l'aire calculée par
            // Matter.Bodies.circle (∝ r²) déborde à Infinity, ce qui rend là encore la fusée
            // NaN. Les mondes livrés culminent à mass=1e13 et radius=1400 ; ces plafonds
            // laissent 6 ordres de grandeur de marge tout en gardant l'arithmétique de Matter
            // très loin des limites du double.
            const MASSE_MAX = 1e20;
            const RAYON_MAX = 1e9;
            if (!(CelestialBodyFactory.estNombreFini(cfg.mass) && cfg.mass > 0) ||
                !(CelestialBodyFactory.estNombreFini(cfg.radius) && cfg.radius > 0)) {
                console.warn(`[CelestialBodyFactory] Corps céleste ignoré (masse ou rayon invalide : nombre fini strictement positif attendu): name="${nom}", mass=${CelestialBodyFactory._decrire(cfg.mass)}, radius=${CelestialBodyFactory._decrire(cfg.radius)}`);
                continue;
            }
            if (cfg.mass > MASSE_MAX || cfg.radius > RAYON_MAX) {
                console.warn(`[CelestialBodyFactory] Corps céleste ignoré (démesuré : mass=${CelestialBodyFactory._decrire(cfg.mass)} > ${MASSE_MAX} ou radius=${CelestialBodyFactory._decrire(cfg.radius)} > ${RAYON_MAX}): name="${nom}". Les calculs de Matter déborderaient et empoisonneraient tout le monde en NaN.`);
                continue;
            }

            // hasAtmosphere : piloté par cfg.atmosphere.exists si fourni, sinon défaut du modèle (nom).
            const options = {};
            const atmoValide = !!cfg.atmosphere && typeof cfg.atmosphere === 'object' && !Array.isArray(cfg.atmosphere);
            if (cfg.atmosphere && !atmoValide) {
                console.warn(`[CelestialBodyFactory] Corps '${nom}': 'atmosphere' n'est pas un objet (${CelestialBodyFactory._decrire(cfg.atmosphere)}), ignorée.`);
            }
            if (atmoValide && typeof cfg.atmosphere.exists === 'boolean') {
                options.hasAtmosphere = cfg.atmosphere.exists;
            }

            const body = new CelestialBodyModel(
                nom,
                cfg.mass,
                cfg.radius,
                CelestialBodyFactory._lirePoint(cfg.position, { x: 0, y: 0 }, nom, 'position'),
                typeof cfg.color === 'string' ? cfg.color : '#FFFFFF',
                null,
                CelestialBodyFactory._lireNombre(cfg.orbitDistance, 0, nom, 'orbitDistance'),
                CelestialBodyFactory._lireNombre(cfg.initialOrbitAngle, 0, nom, 'initialOrbitAngle'),
                CelestialBodyFactory._lireNombre(cfg.orbitSpeed, 0, nom, 'orbitSpeed'),
                options
            );
            if (cfg.color !== undefined && typeof cfg.color !== 'string') {
                console.warn(`[CelestialBodyFactory] Corps '${nom}': 'color' n'est pas une chaîne (${CelestialBodyFactory._decrire(cfg.color)}), couleur par défaut #FFFFFF utilisée.`);
            }
            // Propriétés additionnelles optionnelles
            if (cfg.hasRings) {
                body.hasRings = !!cfg.hasRings;
            }
            if (atmoValide) {
                // cfg.atmosphere: { exists?:boolean, height?:number, color?:string }
                body.atmosphere = body.atmosphere || {};
                if (typeof cfg.atmosphere.exists === 'boolean') {
                    body.atmosphere.exists = cfg.atmosphere.exists;
                } else if (cfg.atmosphere.exists !== undefined) {
                    console.warn(`[CelestialBodyFactory] Corps '${nom}': atmosphere.exists n'est pas un booléen (${typeof cfg.atmosphere.exists} ${CelestialBodyFactory._decrire(cfg.atmosphere.exists)}), ignoré (valeur par défaut conservée).`);
                }
                if (CelestialBodyFactory.estNombreFini(cfg.atmosphere.height)) {
                    // height est exprimée en proportion du rayon si <=1, sinon valeur monde.
                    // Une valeur NÉGATIVE passait par la branche "proportion" et pouvait donner
                    // un rayon d'atmosphère négatif : ctx.arc() lève alors IndexSizeError, ce qui
                    // interrompt le rendu de CHAQUE frame -> écran définitivement figé.
                    const hauteur = cfg.atmosphere.height <= 1
                        ? (cfg.radius * cfg.atmosphere.height)
                        : cfg.atmosphere.height;
                    if (hauteur >= 0) {
                        body.atmosphere.height = hauteur;
                    } else {
                        console.warn(`[CelestialBodyFactory] Corps '${nom}': atmosphere.height négative (${cfg.atmosphere.height}) ignorée.`);
                    }
                } else if (cfg.atmosphere.height !== undefined && cfg.atmosphere.height !== null) {
                    console.warn(`[CelestialBodyFactory] Corps '${nom}': atmosphere.height invalide (${typeof cfg.atmosphere.height} ${CelestialBodyFactory._decrire(cfg.atmosphere.height)}), un nombre fini est attendu. Hauteur par défaut conservée.`);
                }
                if (typeof cfg.atmosphere.color === 'string') {
                    body.atmosphere.color = cfg.atmosphere.color;
                } else if (cfg.atmosphere.color !== undefined) {
                    console.warn(`[CelestialBodyFactory] Corps '${nom}': atmosphere.color n'est pas une chaîne (${CelestialBodyFactory._decrire(cfg.atmosphere.color)}), ignorée.`);
                }
            }
            created.push(body);
            // Conserver le lien config<->body pour les passes suivantes, car des corps
            // peuvent avoir été ignorés (les index de `configs` et `created` ne sont plus alignés).
            body._sourceConfig = cfg;
            // NOMS DUPLIQUÉS : `universeModel.celestialBodies.find` (spawn, ceintures, missions)
            // renvoie le PREMIER corps portant le nom, alors que cette table conservait le DERNIER.
            // Une lune pouvait donc orbiter une autre "Terre" que celle où la fusée apparaît.
            // Règle retenue : le PREMIER corps gagne, pour coïncider avec tous les `.find` du jeu.
            if (nameToBody[nom] !== undefined) {
                console.warn(`[CelestialBodyFactory] Nom de corps DUPLIQUÉ : "${nom}" (bodies[${index}]). Le premier corps portant ce nom reste la référence pour parentName, le spawn, les ceintures et les missions ; le doublon existe toujours mais n'est plus adressable par son nom.`);
            } else {
                nameToBody[nom] = body;
            }
        }

        // Deuxième passe: lier les parents (par name) pour tous les corps valides.
        for (const body of created) {
            const cfg = body._sourceConfig;
            let parentNom = null;
            if (cfg.parentName !== undefined && cfg.parentName !== null && cfg.parentName !== '') {
                if (typeof cfg.parentName === 'string') {
                    parentNom = cfg.parentName;
                } else if (CelestialBodyFactory.estNombreFini(cfg.parentName) || typeof cfg.parentName === 'boolean') {
                    // Cohérent avec _normaliserNom, qui convertit aussi les noms numériques.
                    parentNom = String(cfg.parentName);
                } else {
                    console.warn(`[CelestialBodyFactory] Corps '${body.name}': 'parentName' invalide (${typeof cfg.parentName} ${CelestialBodyFactory._decrire(cfg.parentName)}), lien ignoré.`);
                }
            }
            if (parentNom !== null) {
                if (parentNom === body.name) {
                    // Un corps parent de LUI-MÊME diverge irrémédiablement : updateOrbit ajoute sa
                    // propre position/vélocité à elle-même à chaque frame, la vélocité DOUBLE par
                    // frame et atteint l'infini en ~1100 frames, ce qui empoisonne définitivement
                    // le monde Matter. Une simple faute de frappe dans un preset suffisait.
                    console.error(`[CelestialBodyFactory] Corps '${body.name}': parentName identique au nom du corps (auto-parent). Lien ignoré — le corps restera statique.`);
                } else if (Object.prototype.hasOwnProperty.call(nameToBody, parentNom)) {
                    body.parentBody = nameToBody[parentNom];
                } else {
                    console.warn(`[CelestialBodyFactory] Corps '${body.name}': parentName '${parentNom}' introuvable (typo ou parent ignoré). Le corps restera statique à sa position initiale (${body.position.x},${body.position.y}).`);
                }
            }
        }

        // Deuxième passe bis: BRISER LES CYCLES d'orbite (A->B->A, A->B->C->A, ...).
        // Seul l'auto-parent (cycle de longueur 1) était détecté. Sur un cycle plus long,
        // updateOrbit ajoute à chaque frame la position ET la vélocité de chaque parent à son
        // enfant : le système entier s'emballe (~20 000 unités/frame mesurées, corps à 6e6 après
        // 5 s) sans le moindre message. On remonte la chaîne avec un ensemble de corps déjà vus
        // et on coupe le lien qui referme la boucle : le corps concerné devient statique, tous
        // les autres liens de la chaîne restent valides.
        for (const body of created) {
            const vus = new Set();
            let courant = body;
            while (courant && courant.parentBody) {
                vus.add(courant);
                if (vus.has(courant.parentBody)) {
                    console.error(`[CelestialBodyFactory] CYCLE d'orbite détecté : '${courant.name}' -> '${courant.parentBody.name}' referme une boucle (parentName circulaire). Lien rompu — '${courant.name}' restera statique.`);
                    courant.parentBody = null;
                    break;
                }
                courant = courant.parentBody;
            }
        }

        // Troisième passe: initialiser les positions/vélocités via updateOrbit(0).
        // On itère deux fois pour résoudre l'ordre parents-avant-enfants : si une lune
        // référence un parent défini plus loin (lui-même en orbite), un seul passage
        // utiliserait une position parente non encore initialisée. Le second passage
        // recalcule l'enfant à partir de la position parente désormais correcte.
        for (let pass = 0; pass < 2; pass++) {
            for (const body of created) {
                if (body.parentBody) {
                    body.updateOrbit(0);
                }
            }
        }

        // Nettoyage du champ temporaire.
        for (const body of created) {
            delete body._sourceConfig;
        }
        return created;
    }
} 