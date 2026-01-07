// Point d'entrée principal de l'application de simulation de fusée.
// Ce fichier initialise tous les composants majeurs et démarre la boucle de jeu.

// CORRECTION: Utiliser console._origLog si disponible, sinon console.log
// pour que les logs de diagnostic fonctionnent même si DEBUG=false
const logDiagnostic = (...args) => {
    if (console._origLog) {
        console._origLog(...args);
    } else {
        console.log(...args);
    }
};

logDiagnostic("🟢 [main.js] FICHIER CHARGÉ - VERSION AVEC LOGS DE DIAGNOSTIC");
logDiagnostic("🟢 [main.js] Timestamp:", new Date().toISOString());

// Réduction du bruit de logs en production (DEBUG=false): désactiver console.debug/log
if (typeof window !== 'undefined' && window.DEBUG === false) {
    if (!console._debugPatched) {
        console._debugPatched = true;
        console._origLog = console.log;
        console._origDebug = console.debug;
        console.debug = function() {};
        console.log = function() {};
    }
}

/**
 * @type {GameController | null}
 * Instance globale du contrôleur principal du jeu.
 * Initialisé dans `init()`.
 * Utilisé par `cleanup()` pour arrêter le jeu.
 */
let gameController = null;

/**
 * @type {EventBus | null}
 * Instance globale de l'EventBus pour la communication inter-modules.
 * Initialisé dans `init()`.
 * Passé aux contrôleurs pour découpler leurs interactions.
 */
let eventBus = null;

// Liste des mondes disponibles (id -> url)
const WORLD_PRESETS = [
    { id: '1', name: 'Monde 1 — Système solaire', url: 'assets/worlds/1_solar.json' },
    { id: '2', name: 'Monde 2 — Kerbol System',   url: 'assets/worlds/2_kerbol.json' },
    { id: '3', name: 'Monde 3 — OuterWilds System', url: 'assets/worlds/3_outerwilds.json' },
    { id: '4', name: 'Monde 4 — Tatoo', url: 'assets/worlds/4_Tatoo.json' },
    { id: '5', name: 'Monde 5 — Endor', url: 'assets/worlds/5_Endor.json' },
    { id: '6', name: 'Monde 6 — Alien', url: 'assets/worlds/6_alien.json' }
];

/**
 * Fonction principale d'initialisation de l'application.
 * Exécutée lorsque le DOM est entièrement chargé.
 * Crée le canvas, l'EventBus, initialise les contrôleurs, configure le GameController,
 * et affiche les instructions initiales.
 */
function init() {
    // Initialisation du ControllerContainer global pour le suivi des abonnements EventBus
    // Cela doit être fait une seule fois, AVANT l'instanciation des contrôleurs qui l'utilisent.
    if (!window.controllerContainer) {
        // Supposant que ControllerContainer est une classe définie globalement ou via un script inclus.
        // Si ce n'est pas le cas, il faudra s'assurer que le fichier ControllerContainer.js est inclus
        // ou revenir à l'ancienne définition d'objet simple.
        try {
            window.controllerContainer = new ControllerContainer();
        } catch (e) {
            console.error("Erreur lors de l'instanciation de ControllerContainer. Vérifiez que la classe est définie et accessible.", e);
            // Fallback à l'ancienne structure si l'instanciation échoue, pour éviter de bloquer plus loin.
            // Cela suppose que l'ancienne structure est toujours préférable à une erreur complète.
            console.warn("Fallback à l'ancienne structure de window.controllerContainer.");
            window.controllerContainer = {
                subscriptions: [],
                track(unsubscribeFn) { this.subscriptions.push(unsubscribeFn); },
                cleanup() {
                    this.subscriptions.forEach(unsub => unsub());
                    this.subscriptions = [];
                    if (window.eventBus && typeof window.eventBus.clear === 'function') {
                        window.eventBus.clear();
                    }
                }
            };
        }
    }

    // Initialisation de l'EventBus global pour la communication inter-modules.
    eventBus = new EventBus();
    window.eventBus = eventBus; // Exposition globale temporaire

    // Récupérer l'élément canvas du DOM.
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("L'élément canvas avec l'ID 'gameCanvas' est introuvable. Assurez-vous qu'il existe dans index.html.");
        return; // Arrêter l'initialisation si le canvas n'est pas trouvé.
    }

    // Précharger les sons SFX connus
    if (window.audioManager) {
        window.audioManager.preload('countdown', 'assets/sound/4321.mp3', { volume: 1.0 });
        window.audioManager.preload('collision', 'assets/sound/collision.mp3', { volume: 0.6 });
        window.audioManager.preload('thruster_main', 'assets/sound/rocketthrustmaxx.mp3', { loop: true, volume: 0.7 });
    }

    // Initialisation des contrôleurs et modèles principaux
    // L'ordre d'instanciation peut être important pour les dépendances injectées via constructeur.
    const missionManager = new MissionManager(eventBus);
    gameController = new GameController(eventBus, missionManager);

    // Instancier les contrôleurs requis, en leur injectant l'EventBus.
    logDiagnostic(`[main.js] Création de InputController...`);
    const inputController = new InputController(eventBus);
    logDiagnostic(`[main.js] InputController créé:`, inputController);
    const renderingController = new RenderingController(eventBus, canvas);
    const rocketAI = new RocketAI(eventBus);
    
    // Instancier le gestionnaire de missions.
    // const missionManager = new MissionManager(eventBus); // Déjà instancié plus haut

    // Configurer GameController avec les contrôleurs dont il dépend.
    // GameController est le chef d'orchestre et a besoin de références à d'autres systèmes.
    gameController.setControllers({
        inputController,
        renderingController,
        rocketAI
    });
    
    // Initialiser le GameController (ne prend plus le canvas).
    // Le canvas est maintenant passé à RenderingController et GameSetupController s'en occupe.
    // GameController reçoit le canvas via sa méthode init(), qui le transmettra à GameSetupController.
    const config = {
        missions: [
            { id: 'deliverMoon', type: 'DELIVERY', itemName: 'Moonrocks', quantity: 5, origin: 'Earth', destination: 'Moon', reward: 100, description: 'Livrer 5 unités de roches lunaires de la Terre à la Lune.' },
            { id: 'collectMars', type: 'COLLECTION', itemName: 'MarsSoil', quantity: 10, origin: 'Mars', reward: 150, description: 'Collecter 10 unités de sol martien sur Mars.' }
        ]
        // ... autres configurations ...
    };
    gameController.init(canvas, config); // Passer le canvas et la config ici

    // Le choix du monde est maintenant fait dans l'écran de démarrage (showInstructions)

    // Afficher les instructions initiales à l'utilisateur
    showInstructions();

    // Gérer la fermeture de la modal des instructions
    const instructionsModal = document.getElementById('instructionsModal');
    const closeButton = document.querySelector('.close-button');
    const understoodButton = document.getElementById('understoodButton');

    function closeModal() {
        if (instructionsModal) {
            instructionsModal.style.display = 'none';
        }
        // Reprendre le jeu si nécessaire (par exemple, s'il était en pause à cause de la modale)
        eventBus.emit(EVENTS.GAME.RESUME_IF_PAUSED); 
        // Demander à CameraController de centrer sur la fusée après la fermeture des instructions
        if (gameController && gameController.cameraModel && gameController.rocketModel) {
            console.log("[main.js] Réglage de la caméra pour suivre la fusée après fermeture des instructions.");
            gameController.cameraModel.setTarget(gameController.rocketModel, 'rocket');
        }
    }

    if (closeButton) {
        closeButton.onclick = closeModal;
    }
    if (understoodButton) {
        understoodButton.onclick = closeModal;
    }

    // Afficher la modal au démarrage (si elle n'a pas été cachée par CSS initialement)
    // if (instructionsModal) {
    //     instructionsModal.style.display = 'block';
    //     eventBus.emit(EVENTS.GAME.TOGGLE_PAUSE); // Mettre en pause pendant que les instructions sont visibles
    // }

    // Gestionnaire global d'erreurs pour l'interface utilisateur
    const errorOverlay = document.getElementById('errorOverlay');
    const errorMessageElement = document.getElementById('errorMessage');
    const closeErrorButton = document.getElementById('closeError');

    if (errorOverlay && errorMessageElement && closeErrorButton) {
        window.addEventListener('error', function(event) {
            let message = event.message;
            if (event.filename) {
                message += `\nFichier: ${event.filename.substring(event.filename.lastIndexOf('/') + 1)}`;
            }
            if (event.lineno) {
                message += ` Ligne: ${event.lineno}`;
            }
            if (event.colno) {
                message += ` Colonne: ${event.colno}`;
            }
            errorMessageElement.textContent = message;
            errorOverlay.style.display = 'flex';
        });

        closeErrorButton.onclick = function() {
            errorOverlay.style.display = 'none';
        };
    } else {
        console.warn("Éléments de l'overlay d'erreur non trouvés. L'affichage des erreurs dans l'UI est désactivé.");
    }
}

/**
 * Arrête la boucle de jeu et nettoie les ressources.
 * Appelée lorsque l'utilisateur quitte la page (événement `beforeunload`).
 * Délègue le nettoyage principal au `GameController`.
 */
function cleanup() {
    if (gameController) {
        gameController.cleanup(); // Appelle la méthode de nettoyage du GameController
    }
    // Nettoyer tous les abonnements stockés dans le container
    if (window.controllerContainer) {
        window.controllerContainer.cleanup();
    }
}

/**
 * Joue un son de compte à rebours.
 * Typiquement appelé après la fermeture des instructions initiales.
 */
function playCountdownSound() {
    // Utiliser AudioManager si disponible et PRÉCHARGÉ (sinon fallback tout de suite dans le même geste utilisateur)
    if (window.audioManager && window.audioManager.cache && window.audioManager.cache.has('countdown')) {
        window.audioManager.play('countdown');
        return;
    }
    try {
        const fallback = new Audio('assets/sound/4321.mp3');
        fallback.volume = 1.0;
        fallback.play().catch(() => {});
    } catch (error) {
        console.error("Erreur lors de la création/lecture du fichier 4321.mp3:", error);
    }
}

/**
 * Affiche un panneau d'instructions initiales à l'utilisateur.
 * Crée dynamiquement un élément `div` contenant les contrôles du jeu,
 * une image et un bouton pour fermer le panneau.
 * La fermeture du panneau déclenche `playCountdownSound`.
 */
function showInstructions() {
    // Créer l'élément conteneur pour les instructions.
    const instructions = document.createElement('div');
    instructions.id = 'instructions'; // Assigner un ID pour référence potentielle (CSS).
    // Styles pour positionner et formater le panneau.
    instructions.style = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%); /* Centrage parfait */
        background: rgba(30,30,30,0.97);
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px #0008;
        padding: 15px 20px; /* Augmentation du padding */
        font-size: 0.95em; /* Taille de police légèrement augmentée */
        z-index: 9999;
        min-width: 250px; /* Largeur minimale */
        max-width: 500px; /* Largeur maximale augmentée pour rééquilibrage */
        border: 1px solid #555; /* Bordure subtile */
        display: flex; /* Utilisation de flexbox pour l'agencement */
        flex-direction: column;
        align-items: center;
        gap: 10px; /* Espacement entre les éléments */
    `;
    
    // Contenu HTML du panneau (structure améliorée).
    instructions.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 15px; width: 100%;">
            <div style="display:flex; flex-direction:column; align-items:center; width:160px; flex-shrink:0;">
                <img src="favicon.png" alt="Icône Fusée" style="width:160px; height:160px; margin-top: 5px;" />
                <p style="font-size:0.8em; color:#bbb; margin-top: 8px; text-align:center;">Souris et Manette de jeu également supportées.</p>
                <p style="font-size:0.82em; color:#9cf; margin-top:4px; text-align:center; font-style: italic;">Une minuscule fusée. Un univers infini. Votre voyage commence.</p>
            </div>
            <div style="flex-grow: 1;">
                <h3 style="font-weight:bold; font-size:1.1em; margin:0 0 5px 0; text-align: left;">Contrôles</h3>
                <table style="border-collapse:collapse; width: 100%; font-size:0.85em; text-align: left;">
                    <tbody>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; width: 40%; text-align: center;"><b>↑ / W</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Principale</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>↓ / S</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Arrière</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>← / A</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Latérale Gauche</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>→ / D</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Latérale Droite</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>R</b></td><td style="border:1px solid #666; padding: 3px 6px;">Réinitialiser la Simulation</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>T</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher la Trajectoire</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>V</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher les Vecteurs</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>G</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher Champ Gravité/Équipotentielles</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>+ / -</b></td><td style="border:1px solid #666; padding: 3px 6px;">Zoom Avant / Arrière (Molette aussi)</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>P / Échap</b></td><td style="border:1px solid #666; padding: 3px 6px;">Mettre en Pause / Reprendre</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>C</b></td><td style="border:1px solid #666; padding: 3px 6px;">Vue fusée / Vue libre</td></tr>            
                    </tbody>
                </table>
            </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; margin-top:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <label for="worldSelect" style="font-weight:bold;">Monde:</label>
                <select id="worldSelect" style="padding:4px 6px;">
                    <option value="1" selected>Monde 1 — Système solaire</option>
                    <option value="2">Monde 2 — Kerbol System</option>
                    <option value="3">Monde 3 — OuterWilds System</option>
                    <option value="4">Monde 4 — Tatoo</option>
                    <option value="5">Monde 5 — Endor</option>
                    <option value="6">Monde 6 — Alien</option>
                </select>
            </div>
            <button id="startButton" style="font-size:1.0em; padding: 5px 15px; cursor: pointer;">Prêt ! (Commencer)</button>
        </div>
    `;
    
    // Action lors du clic sur le bouton : supprimer le panneau et jouer le son.
    const startBtn = instructions.querySelector('#startButton');
    startBtn.onclick = () => {
        // Émettre le chargement du monde choisi AVANT de retirer l'overlay
        try {
            const select = instructions.querySelector('#worldSelect');
            const worldId = select ? select.value : '1';
            const preset = WORLD_PRESETS.find(w => w.id === worldId) || WORLD_PRESETS[0];
            if (window.eventBus && window.EVENTS && window.EVENTS.UNIVERSE && window.EVENTS.UNIVERSE.LOAD_REQUESTED) {
                window.eventBus.emit(window.EVENTS.UNIVERSE.LOAD_REQUESTED, {
                    source: 'preset',
                    url: preset.url
                });
            }
        } catch (e) {
            console.warn('[start] Échec de l\'émission UNIVERSE_LOAD_REQUESTED via écran de démarrage:', e);
        }
        if (instructions.parentNode) { // Vérifier si le panneau est toujours dans le DOM
            instructions.parentNode.removeChild(instructions);
        }
        // Jouer le son de compte à rebours après fermeture.
        playCountdownSound();

        // S'assurer que la caméra suit la fusée après la fermeture des instructions
        if (gameController && gameController.cameraModel && gameController.rocketModel) {
            console.log("[main.js] Réglage de la caméra pour suivre la fusée après fermeture des instructions.");
            gameController.cameraModel.setTarget(gameController.rocketModel, 'rocket');
            // Optionnel: forcer la position pour un centrage visuel immédiat si le lissage de CameraModel.update() pose problème ici
            // ou si les offsets n'étaient pas encore parfaits au moment du gameController.init()
            // Normalement, la mise à jour des offsets dans gameController.init() devrait suffire,
            // et setTarget + cameraModel.update() devrait gérer le suivi.
            if (gameController.rocketModel.position) {
                 gameController.cameraModel.setPosition(gameController.rocketModel.position.x, gameController.rocketModel.position.y);
            }
        }
    };
    
    // Ajouter le panneau d'instructions complet au corps du document.
    document.body.appendChild(instructions);
}

/**
 * Fonction de nettoyage appelée avant que la page ne soit déchargée.
 * Assure l'arrêt propre de la simulation.
 */
window.addEventListener('beforeunload', cleanup);

/**
 * Écouteur d'événement qui déclenche l'initialisation (`init`)
 * une fois que le contenu HTML de la page est complètement chargé et analysé.
 */
document.addEventListener('DOMContentLoaded', () => {
    init();
});