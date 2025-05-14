/**
 * Fichier de constantes centralisées pour la simulation de fusée
 */

// Constantes physiques
const PHYSICS = {
    // Gravité
    G: 0.0001,                // Constante gravitationnelle (Ancien: 1)
    
    // Limites et seuils
    MAX_SPEED: 10000.0,        // Vitesse maximale de la fusée
    MAX_COORDINATE: 10000,      // Valeur maximale de coordonnée autorisée
    
    // Collisions
    COLLISION_DELAY: 2000,      // Délai avant d'activer les collisions (ms)
    REPULSION_STRENGTH: 0.05,   // Force de répulsion lors des collisions
    COLLISION_DAMPING: 0.7,     // Facteur d'amortissement des collisions
    IMPACT_DAMAGE_FACTOR: 10,   // Facteur de dommages lors des impacts
    RESTITUTION: 0.2,           // Coefficient de restitution (rebond)
    CRASH_SPEED_THRESHOLD: 2500, // Vitesse max pour atterrissage (m/s)
    // Nouveaux seuils pour atterrissage/crash plus fins
    LANDING_MAX_SPEED: 2500,           // Vitesse verticale max pour atterrir (m/s)
    LANDING_MAX_ANGLE_DEG: 30,        // Angle max par rapport à la verticale (degrés)
    LANDING_MAX_ANGULAR_VELOCITY: 400,// Vitesse angulaire max pour atterrir (rad/s)
    CRASH_ANGLE_DEG: 45,              // Angle de crash par rapport à la verticale (degrés)
    CRASH_ANGULAR_VELOCITY: 400,      // Vitesse angulaire de crash (rad/s)
    TAKEOFF_THRUST_THRESHOLD_PERCENT: 50, // Seuil de poussée (en %) pour considérer un décollage actif
    // Ajout des catégories de collision
    COLLISION_CATEGORIES: {
        ROCKET: 0x0001,
        CELESTIAL: 0x0002,
        // Ajoutez d'autres catégories si nécessaire
    },
    
    // Multiplicateur de propulsion
    // Ajustez cette valeur pour augmenter la puissance de tous les propulseurs
    THRUST_MULTIPLIER: 10.0,    // Multiplicateur global pour toutes les forces de propulsion
    
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
    MIN_ZOOM: 0.005,              // Zoom minimum
    MAX_ZOOM: 6.0,              // Zoom maximum 
    
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
    FUEL_MAX: 5000,             // Quantité maximale de carburant
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
        LATERAL: 3.0          // Multiplicateur pour les propulseurs latéraux
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
const CELESTIAL_BODY = {
    // --- Propriétés Générales / Terre (par défaut) ---
    MASS: 2e11,                 // Masse de la Terre (valeur de base)
    RADIUS: 720,                  // Rayon de la Terre (valeur de base)
    ATMOSPHERE_RATIO: 0.1666,     // Ratio du rayon pour la hauteur de l'atmosphère

    // --- Paramètres spécifiques au Soleil (Nouvelle section) ---
    SUN: {
      MASS: 6e12, // Masse 1000x celle de la Terre (simulation)
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
    VISIBLE_RADIUS: 50000,      // Rayon visible de l'espace (augmenté x2)
    
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