/**
 * Fichier de constantes centralisées pour la simulation de fusée
 */

// Drapeau global de debug (désactive les logs verbeux si false)
// TEMPORAIRE: Activé pour le diagnostic du décollage
if (typeof globalThis !== 'undefined' && typeof globalThis.DEBUG === 'undefined') {
    globalThis.DEBUG = true; // Temporairement true pour voir les logs de diagnostic
}

// Constantes physiques
const PHYSICS = {
    // Gravité
    G: 0.0001,                // Constante gravitationnelle
                               // REMARQUE: si un preset JSON est chargé (assets/worlds/*.json),
                               // GameSetupController.buildWorldFromData() écrase cette valeur
                               // avec data.physics.G pour aligner la simulation sur le monde.
    
    // Limites et seuils
    MAX_SPEED: 10000.0,        // Vitesse maximale de la fusée
    MAX_COORDINATE: 10000,      // Valeur maximale de coordonnée autorisée
    
    // Collisions
    COLLISION_DELAY: 2000,      // Délai avant d'activer les collisions (ms)
    REPULSION_STRENGTH: 0.05,   // Force de répulsion lors des collisions
    COLLISION_DAMPING: 0.7,     // Facteur d'amortissement des collisions
    IMPACT_DAMAGE_FACTOR: 10,   // Facteur de dommages lors des impacts (appliqué sur la vitesse d'impact)
    RESTITUTION: 0.2,           // Coefficient de restitution (rebond)

    // ————————————————————————————————————————————————
    // Seuils de détection atterrissage/crash (utilisés par CollisionHandler)
    // Remarque importante: on vise des valeurs « jouables ». NE PAS modifier sans test gameplay.
    // Un atterrissage stable est détecté si TOUTES les conditions suivantes sont vraies:
    //   - vitesse <= LANDING_MAX_SPEED
    //   - |diffAngleAvecNormale| <= LANDING_MAX_ANGLE_DEG
    //   - |vitesseAngulaire| <= LANDING_MAX_ANGULAR_VELOCITY
    // Un crash est détecté si l’on est proche de la surface et qu’AU MOINS une condition de crash est vraie:
    //   - vitesse >= CRASH_SPEED_THRESHOLD
    //   - |diffAngleAvecNormale| >= CRASH_ANGLE_DEG
    //   - |vitesseAngulaire| >= CRASH_ANGULAR_VELOCITY

    CRASH_SPEED_THRESHOLD: 2500, // Seuil de vitesse scalaire d'impact au-delà duquel on considère un crash (unités du monde/sec)

    // Seuils d'atterrissage (tous doivent être respectés)
    LANDING_MAX_SPEED: 2500,            // Vitesse scalaire max pour atterrir (utilisation actuelle: vitesse totale, pas verticale)
    LANDING_MAX_ANGLE_DEG: 30,          // Différence angulaire max vs normale de surface (degrés)
    LANDING_MAX_ANGULAR_VELOCITY: 400,  // Vitesse angulaire max pour atterrir (rad/s)

    // Seuils de crash (si l’un est dépassé et proximité surface => crash)
    CRASH_ANGLE_DEG: 45,                // Différence angulaire max vs normale de surface (degrés)
    CRASH_ANGULAR_VELOCITY: 400,        // Vitesse angulaire de crash (rad/s)
    TAKEOFF_THRUST_THRESHOLD_PERCENT: 10, // Seuil de poussée (en %) pour considérer un décollage actif (était 50)
    // Ajout des catégories de collision
    COLLISION_CATEGORIES: {
        ROCKET: 0x0001,
        CELESTIAL: 0x0002,
        // Ajoutez d'autres catégories si nécessaire
    },
    
    // Multiplicateur de propulsion
    // Ajustez cette valeur pour augmenter la puissance de tous les propulseurs
    // Note: La gravité avec G=0.0001 et masses ~2e11 génère des forces énormes
    // Il faut un multiplicateur élevé pour permettre le décollage
    THRUST_MULTIPLIER: 100.0,    // Multiplicateur global pour toutes les forces de propulsion
    
    // Contrôles assistés
    ASSISTED_CONTROLS: {
        NORMAL_ANGULAR_DAMPING: 0.0,     // Amortissement angulaire normal (mode réaliste)
        ASSISTED_ANGULAR_DAMPING: 2.0,    // Amortissement angulaire en mode assisté (valeur augmentée pour effet plus visible)
        ROTATION_STABILITY_FACTOR: 0.05   // Facteur de stabilisation supplémentaire pour le mode assisté
    }
};

// Constantes de rendu
const RENDER = {
    // Dimensions
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    
    // Caméra
    CAMERA_SMOOTHING: 2,      // Facteur de lissage du mouvement de caméra
    ZOOM_SMOOTHING: 0.1,        // Facteur de lissage du zoom
    ZOOM_SPEED: 0.2,            // Vitesse de zoom avec la molette 
    MIN_ZOOM: 0.0025,              // Zoom minimum
    MAX_ZOOM: 6.0,              // Zoom maximum 
    // Facteur de zoom pour les boutons (LT/RT gamepad)
    CAMERA_ZOOM_BUTTON_FACTOR: 1.1,
    
    // Vecteur de gravité
    GRAVITY_VECTOR_SCALE: 150,  // Échelle du vecteur de gravité pour le rendu
    GRAVITY_ARROW_SIZE: 15,     // Taille de la flèche du vecteur de gravité
    
    // Vecteurs de visualisation
    GRAVITY_SCALE_FACTOR: 3000,   // Facteur d'échelle pour rendre le vecteur gravitationnel visible 
    GRAVITY_MAX_LENGTH: 120,        // Longueur maximale du vecteur gravitationnel (augmentée à 120)
    VELOCITY_SCALE_FACTOR: 50,      // Facteur d'échelle pour le vecteur de vitesse
    VELOCITY_MAX_LENGTH: 80,        // Longueur maximale du vecteur de vitesse
    THRUST_SCALE_FACTOR: 0.01,      // Facteur d'échelle pour les vecteurs de poussée
    THRUST_ARROW_SIZE: 5,           // Taille de la flèche des vecteurs de poussée
    
    // Couleurs et affichage
    SPACE_COLOR: '#000022',     // Couleur de fond de l'espace
    STAR_TWINKLE_FACTOR: 0.7,   // Facteur de scintillement des étoiles
    STAR_BRIGHTNESS_BASE: 0.5,  // Luminosité de base des étoiles
    STAR_BRIGHTNESS_RANGE: 0.3, // Variation de luminosité des étoiles
    MARGIN_FACTOR: 2            // Facteur de marge pour la visibilité à l'écran
};

// Constantes de la fusée
const ROCKET = {
    // Propriétés physiques
    MASS: 1500,                 // Masse de la fusée en kg
    WIDTH: 30,                  // Largeur de la hitbox
    HEIGHT: 60,                 // Hauteur de la hitbox
    FRICTION: 0.0,              // Friction de la fusée
    MAX_HEALTH: 100,            // Santé maximale de la fusée
    ROTATION_SPEED: 100,        // Vitesse de rotation
    
    // Capacité du cargo
    CARGO_CAPACITY: 10,         // Capacité maximale du cargo
    
    // Carburant
    FUEL_MAX: 6000,            // Quantité maximale de carburant (doublée)
    FUEL_CONSUMPTION: {
        MAIN: 0.2,              // Consommation du propulseur principal
        REAR: 0.2,              // Consommation du propulseur arrière
        LATERAL: 0.05           // Consommation des propulseurs latéraux
    },
    
    // Propulseurs - Forces
    MAIN_THRUST: 5500.0,         // Force du propulseur principal 
    LATERAL_THRUST: 100.0,       // Force des propulseurs latéraux 
    REAR_THRUST: 3000.0,         // Force du propulseur arrière
    
    // Propulseurs - Puissance maximale
    THRUSTER_POWER: {
        MAIN: 1000,            // Puissance maximale du propulseur principal 
        REAR: 200,             // Puissance maximale du propulseur arrière 
        LEFT: 20,              // Puissance maximale du propulseur gauche 
        RIGHT: 20              // Puissance maximale du propulseur droit 
    },
    
    // NOUVEAU : Multiplicateurs d'efficacité spécifiques par type de propulseur
    // Ces valeurs modulent la force de base définie dans *_THRUST
    THRUSTER_EFFECTIVENESS: {
        MAIN: 1.5,            // Multiplicateur pour le propulseur principal
        REAR: 1.5,            // Multiplicateur pour le propulseur arrière
        LATERAL: 0.3          // Multiplicateur pour les propulseurs latéraux (réduit pour équilibrage)
    },

    // Positionnement des propulseurs
    THRUSTER_POSITIONS: {
        MAIN: { angle: -Math.PI/2, distance: 30 },    // Propulseur principal 
        REAR: { angle: Math.PI/2, distance: 30 },     // Propulseur arrière 
        LEFT: { angle: Math.PI, distance: 15 },       // Propulseur gauche 
        RIGHT: { angle: 0, distance: 15 }             // Propulseur droit 
    }
};

// Constantes du corps céleste
// IMPORTANT: Ces valeurs décrivent un monde par défaut (fallback) utilisé
// uniquement si aucun preset JSON n'est chargé.
// Le monde par défaut sera remplacé par assets/worlds/1_solar.json
// lors de l'initialisation (voir main.js et GameController/Setup).
const CELESTIAL_BODY = {
    // --- Propriétés Générales / Terre (par défaut) ---
    MASS: 2e11,                 // Masse de la Terre (valeur de base)
    RADIUS: 720,                  // Rayon de la Terre (valeur de base)
    ATMOSPHERE_RATIO: 0.1666,     // Ratio du rayon pour la hauteur de l'atmosphère

    // --- Paramètres spécifiques au Soleil (Nouvelle section) ---
    SUN: {
      MASS:1e13, // Masse 1000x celle de la Terre (simulation)
      RADIUS: 1400 // Rayon plus grand pour le Soleil (simulation)
    },
    // --- Fin Paramètres Soleil ---

    // --- Paramètres spécifiques à la Terre ---
    EARTH: {
      ORBIT_DISTANCE: 22500,    // Distance orbitale Terre-Soleil (augmentée x1.5)
      ORBIT_SPEED: 0.0000,      // Vitesse orbitale TRÈS LENTE (radians/s)
    },
    // --- Fin Paramètres Terre ---

    // --- Paramètres spécifiques à Mercure ---
    MERCURY: {
      MASS: 1.2e11,             // Masse approximative de Mercure (simulation)
      RADIUS: 488,              // Rayon approximatif de Mercure (simulation)
      ORBIT_DISTANCE: 13050,    // Distance orbitale Mercure-Soleil (augmentée x1.5)
      ORBIT_SPEED: 0.0000,      // Vitesse orbitale (simulation) - À ajuster si besoin
    },
    // --- Fin Paramètres Mercure ---

    // --- Paramètres spécifiques à Vénus ---
    VENUS: {
      MASS: 2e11,            // Masse approximative de Vénus (simulation)
      RADIUS: 710,              // Rayon approximatif de Vénus (simulation)
      ORBIT_DISTANCE: 18000,    // Distance orbitale Vénus-Soleil (augmentée x1.5)
      ORBIT_SPEED: 0.0000,      // Vitesse orbitale (simulation) - À ajuster si besoin
    },
    // --- Fin Paramètres Vénus ---

    // --- Paramètres spécifiques à Mars ---
    MARS: {
      MASS: 1.28e11,            // Masse approximative de Mars (simulation)
      RADIUS: 580,              // Rayon approximatif de Mars (simulation)
      ORBIT_DISTANCE: 30000,    // Distance orbitale Mars-Soleil (augmentée x1.5)
      ORBIT_SPEED: 0.0000,      // Vitesse orbitale (simulation) - À ajuster si besoin
    },
    // --- Fin Paramètres Mars ---

    // --- Paramètres spécifiques à Jupiter ---
    JUPITER: {
      MASS: 1.0e12,            // Masse approximative de Jupiter (simulation)
      RADIUS: 1000,            // Rayon approximatif de Jupiter (simulation)
      ORBIT_DISTANCE: 45000,   // Distance orbitale Jupiter-Soleil (simulation)
      ORBIT_SPEED: 0.0000      // Vitesse orbitale (simulation)
    },
    // --- Fin Paramètres Jupiter ---

    // --- Paramètres spécifiques à Saturne ---
    SATURN: {
      MASS: 8.0e11,            // Masse approximative de Saturne (simulation)
      RADIUS: 900,             // Rayon approximatif de Saturne (simulation)
      ORBIT_DISTANCE: 60000,   // Distance orbitale Saturne-Soleil (simulation)
      ORBIT_SPEED: 0.0000      // Vitesse orbitale (simulation)
    },
    // --- Fin Paramètres Saturne ---

    // --- Paramètres spécifiques à Uranus ---
    URANUS: {
      MASS: 5.0e11,            // Masse approximative d'Uranus (simulation)
      RADIUS: 800,             // Rayon approximatif d'Uranus (simulation)
      ORBIT_DISTANCE: 75000,   // Distance orbitale Uranus-Soleil (simulation)
      ORBIT_SPEED: 0.0000      // Vitesse orbitale (simulation)
    },
    // --- Fin Paramètres Uranus ---

    // --- Paramètres spécifiques à Neptune ---
    NEPTUNE: {
      MASS: 5.5e11,            // Masse approximative de Neptune (simulation)
      RADIUS: 820,             // Rayon approximatif de Neptune (simulation)
      ORBIT_DISTANCE: 90000,   // Distance orbitale Neptune-Soleil (simulation)
      ORBIT_SPEED: 0.0000      // Vitesse orbitale (simulation)
    },
    // --- Fin Paramètres Neptune ---

    // --- Lunes de Mars ---
    PHOBOS: {
        MASS: 8e8,           // Masse très faible (simulation)
        RADIUS: 40,            // Rayon petit (augmenté x2)
        ORBIT_DISTANCE: 1200,  // Distance orbitale de Mars (augmentée x1.5)
        ORBIT_SPEED: 0.8,    // Vitesse orbitale rapide (simulation)
    },
    DEIMOS: {
        MASS: 5e8,            // Masse encore plus faible (simulation)
        RADIUS: 30,            // Rayon très petit (augmenté x2)
        ORBIT_DISTANCE: 1800,  // Distance orbitale plus grande (augmentée x1.5)
        ORBIT_SPEED: 0.4,    // Vitesse orbitale plus lente (simulation)
    },
    // --- Fin Lunes de Mars ---

    // --- Lunes de Jupiter ---
    IO: {
        MASS: 5e9,
        RADIUS: 120,
        ORBIT_DISTANCE: 2200,
        ORBIT_SPEED: 0.03
    },
    EUROPE: {
        MASS: 4e9,
        RADIUS: 110,
        ORBIT_DISTANCE: 2600,
        ORBIT_SPEED: 0.024
    },
    GANYMEDE: {
        MASS: 6e9,
        RADIUS: 160,
        ORBIT_DISTANCE: 3200,
        ORBIT_SPEED: 0.019
    },
    CALLISTO: {
        MASS: 5e9,
        RADIUS: 150,
        ORBIT_DISTANCE: 3800,
        ORBIT_SPEED: 0.015
    },
    // --- Fin Lunes de Jupiter ---

    // --- Lunes de Saturne ---
    TITAN: {
        MASS: 6e9,
        RADIUS: 150,
        ORBIT_DISTANCE: 3200,
        ORBIT_SPEED: 0.02
    },
    ENCELADE: {
        MASS: 1e9,
        RADIUS: 70,
        ORBIT_DISTANCE: 2400,
        ORBIT_SPEED: 0.03
    },
    // --- Fin Lunes de Saturne ---

    // Propriétés de la lune (Lune terrestre)
    MOON: {
        MASS: 10000000000,            // Masse de la lune (25 fois moins que la planète)
        RADIUS: 180,                 // Rayon de la lune
        ORBIT_DISTANCE: 2000,        // Distance orbitale depuis la planète (réduite)
        ORBIT_SPEED: 0.005,         // Vitesse orbitale de la lune (ajustée)
        INITIAL_ANGLE: Math.PI + Math.PI / 4   // Angle initial de la lune sur son orbite
    }
};

// Constantes pour les particules
const PARTICLES = {
    STAR_COUNT: 800,           // Nombre d'étoiles dans l'espace
    VISIBLE_RADIUS: 100000,      // Rayon visible de l'espace (doublé)
    
    // Propriétés des émetteurs de particules
    EMITTER: {
        MAIN: {
            SPEED: 5,
            COLOR_START: '#FF5500',
            COLOR_END: '#FF9500',
            LIFETIME: 1.5,
            COUNT: 3
        },
        LATERAL: {
            SPEED: 3,
            COLOR_START: '#FF8800',
            COLOR_END: '#FFAA00',
            LIFETIME: 1.0,
            COUNT: 2
        },
        REAR: {
            SPEED: 4,
            COLOR_START: '#FF5500',
            COLOR_END: '#FF9500',
            LIFETIME: 1.2,
            COUNT: 2
        }
    },
    
    // Particules de collision
    COLLISION: {
        COUNT: 50,
        SPEED_MIN: 3,
        SPEED_MAX: 8,
        SIZE_MIN: 1,
        SIZE_MAX: 5,
        LIFETIME_MIN: 20,
        LIFETIME_MAX: 60,
        COLORS: ['#FF4500', '#FF6347', '#FF8C00', '#FFD700']
    }
}; 

// Constantes pour l'entraînement de l'IA
// Ces valeurs sont calculées pour être cohérentes avec la physique du jeu (PHYSICS.G et masses)
// Formule vitesse orbitale : v = sqrt(G * M / r)
const AI_TRAINING = {
    // Configuration de l'environnement d'entraînement
    ENVIRONMENT: {
        // Position de la Terre (centre du système d'entraînement)
        EARTH_POSITION: { x: 0, y: 0 },
        // Position initiale de la fusée (sur la surface de la Terre, côté +Y)
        ROCKET_INITIAL_OFFSET: 50, // Distance au-dessus de la surface
    },
    
    // Paramètres d'orbite pour la Terre (calculés avec G=0.0001, M=2e11, R=720)
    ORBIT: {
        // Plage d'altitude pour considérer une orbite stable (au-dessus de la surface)
        MIN_ALTITUDE: 100,           // Altitude minimale sécuritaire
        MAX_ALTITUDE: 1500,          // Altitude maximale pour orbite basse
        TARGET_ALTITUDE: 500,        // Altitude cible idéale
        
        // Vitesse orbitale théorique : v = sqrt(G * M / (R + altitude))
        // Pour altitude=500 : v = sqrt(0.0001 * 2e11 / 1220) ≈ 128
        MIN_ORBITAL_SPEED: 100,      // Vitesse minimale pour orbite stable
        MAX_ORBITAL_SPEED: 160,      // Vitesse maximale pour orbite stable
        TARGET_ORBITAL_SPEED: 128,   // Vitesse orbitale cible (calculée)
        
        // Tolérance pour considérer l'orbite réussie
        ALTITUDE_TOLERANCE: 200,     // ±200 autour de la cible
        SPEED_TOLERANCE: 30,         // ±30 autour de la vitesse cible
        
        // Nombre de pas pour confirmer une orbite stable
        STABILITY_STEPS: 100,        // ~1.67 secondes à 60 FPS
    },
    
    // Paramètres d'atterrissage
    LANDING: {
        MAX_LANDING_SPEED: 10,       // Vitesse max pour atterrissage en douceur
        APPROACH_ALTITUDE: 100,      // Altitude pour commencer l'approche finale
    },
    
    // Paramètres de récompense (pour reward shaping)
    REWARDS: {
        // Récompenses positives
        ORBIT_PERFECT: 1.0,          // Dans la zone orbitale parfaite
        ORBIT_GOOD: 0.5,             // Dans une zone orbitale acceptable
        ORBIT_SUCCESS: 100.0,        // Mission d'orbite réussie
        LANDING_SUCCESS: 100.0,      // Atterrissage réussi
        EXPLORATION_NEW_BODY: 10.0,  // Découverte d'un nouveau corps
        
        // Pénalités
        STEP_PENALTY: -0.01,         // Pénalité par pas (encourager efficacité)
        FUEL_PENALTY_FACTOR: 0.005,  // Facteur de pénalité pour consommation carburant
        CRASH_PENALTY: -100.0,       // Crash
        TOO_CLOSE_PENALTY: -0.5,     // Trop proche de la surface
        TOO_FAR_PENALTY: -0.2,       // Trop loin pour une orbite
    },
    
    // CORRECTION: Configuration avancée des récompenses pour navigation point à point
    // Poids ajustés selon les priorités : Haute > Moyenne > Basse
    NAVIGATE_REWARDS: {
        // PRIORITÉ HAUTE - Guidance immédiate et orientation correcte
        DISTANCE_DELTA: 100.0,       // Delta Distance Reward (priorité haute) - Poids augmenté car normalisé par distance initiale (~141km)
        HEADING_ALIGNMENT: 5.0,      // Heading Alignment Reward (priorité haute) - Alignement directionnel vers la cible

        // PRIORITÉ MOYENNE - Efficacité et motivation
        VELOCITY_OPTIMAL: 2.0,       // Velocity Control Reward (priorité moyenne) - Vitesse optimale
        ZONE: 5.0,                   // Progressive Zone Rewards (priorité moyenne) - Récompenses progressives par zones

        // PRIORITÉ BASSE - Optimisation théorique
        POTENTIAL: 1.0,              // Potential-Based Reward (priorité basse) - Potential-based reward shaping

        // Paramètres de vitesse (distance A-B ~127k unités, budget ~20k steps)
        VELOCITY_TARGET: 500.0,      // Vitesse cible optimale (unités/s)
        VELOCITY_SIGMA: 200.0,       // Écart-type pour gaussienne de vitesse
        VELOCITY_MIN: 50.0,          // Vitesse minimale acceptable
        VELOCITY_MAX: 2000.0,        // Vitesse maximale acceptable

        // Zones progressives (ratio de distance initiale)
        ZONE_REWARDS: [10, 25, 50, 100], // Récompenses par zone (croissantes, augmentées)
        ZONE_THRESHOLDS: [0.8, 0.5, 0.2, 0.05], // Seuils (80%, 50%, 20%, 5% de distance restante)

        // Stabilisation au point B
        BRAKE_ZONE_RATIO: 0.2,      // En dessous de 20% de distance, réduire la vitesse cible
        STABILIZE_ZONE_RATIO: 0.1,  // En dessous de 10%, forte récompense pour vitesse quasi nulle
        STABILIZE_SPEED_REF: 100,   // Vitesse de référence pour le calcul de stabilisation

        // Récompenses de terminaison
        SUCCESS_REWARD: 1000,        // Récompense finale pour succès (proche ET stabilisé)
        TIMEOUT_PENALTY: -50,        // Pénalité si timeout
        STEP_PENALTY: -0.001,        // Pénalité par step (réduite pour navigation)

        // Potential-based reward shaping
        POTENTIAL_GAMMA: 0.99,       // Facteur de discount pour potential
    },
    
    // Limites de sécurité
    SAFETY: {
        MIN_SAFE_ALTITUDE: 50,       // Altitude minimale avant alerte crash
        MAX_SIMULATION_DISTANCE: 50000, // Distance max du centre avant reset
    }
};

// Constantes des stations (ravitaillement, etc.)
const STATIONS = {
    // Tolerance de distance (en mètres du monde) pour considérer l'accostage réussi
    DOCKING_DISTANCE_TOLERANCE: 100,
    // Couleur de rendu par défaut
    COLOR: '#00FFCC',
    // Taille de l'icône à l'écran (en pixels, sera multipliée par zoom)
    ICON_SIZE: 100,
    // Décalage radial historique au-dessus de la surface (non utilisé, conservé pour compat)
    SURFACE_OFFSET: 1,
    // Nouvel inset: dessiner la station légèrement SOUS la surface (rayon - inset)
    SURFACE_INSET: -20
};

// Icônes de l'UI (utilisées pour l'étiquetage des options, etc.)
const UI = {
    ICONS: {
        PLANET: '🪐', // Utilisé pour l'option d'affichage des noms de planètes
        GAS: '⛽'     // Utilisé pour l'option d'affichage des stations (carburant)
    }
};