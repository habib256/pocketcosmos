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
 * @type {(message: string) => void}
 * Affiche un message dans l'overlay #errorOverlay d'index.html.
 * No-op tant que `installerGestionnaireErreurs()` n'a pas trouvé les éléments du DOM.
 */
let afficherErreurFatale = () => {};

/**
 * Câble l'overlay d'erreur d'index.html sur les erreurs globales.
 * DOIT être appelé tout au début de `init()` : posé en dernier (comme c'était le cas), il ne
 * couvrait AUCUNE panne d'initialisation — une exception entre l'instanciation de l'EventBus et
 * `showInstructions()` laissait une page entièrement noire, sans écran de démarrage ni message.
 */
function installerGestionnaireErreurs() {
    const errorOverlay = document.getElementById('errorOverlay');
    const errorMessageElement = document.getElementById('errorMessage');
    const closeErrorButton = document.getElementById('closeError');

    if (!errorOverlay || !errorMessageElement || !closeErrorButton) {
        console.warn("Éléments de l'overlay d'erreur non trouvés. L'affichage des erreurs dans l'UI est désactivé.");
        return;
    }

    afficherErreurFatale = function(message) {
        errorMessageElement.textContent = message;
        errorOverlay.style.display = 'flex';
    };

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
        afficherErreurFatale(message);
    });

    window.addEventListener('unhandledrejection', function(event) {
        const raison = event.reason;
        afficherErreurFatale('Promesse rejetée : ' + ((raison && raison.stack) || raison));
    });

    // Rejouer les erreurs capturées avant DOMContentLoaded (voir le <script> inline d'index.html).
    if (Array.isArray(window.__erreursPrecoces) && window.__erreursPrecoces.length) {
        afficherErreurFatale(window.__erreursPrecoces.join('\n'));
        window.__erreursPrecoces.length = 0;
    }

    closeErrorButton.onclick = function() {
        errorOverlay.style.display = 'none';
    };
}

/**
 * Fonction principale d'initialisation de l'application.
 * Exécutée lorsque le DOM est entièrement chargé.
 * Crée le canvas, l'EventBus, initialise les contrôleurs, configure le GameController,
 * et affiche les instructions initiales.
 */
function initialiserApplication() {
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
    // Commandes tactiles à l'écran : elles passent par l'InputController (même chemin que le
    // clavier) et ne s'affichent que sur un appareil tactile ou via le bouton ✋.
    try {
        window.touchControls = new TouchControlsController(eventBus, inputController);
    } catch (e) {
        console.error("[main.js] Commandes tactiles indisponibles :", e);
    }
    const renderingController = new RenderingController(eventBus, canvas);
    // Guide « Découverte » (défis du cours de 3e sur la gravitation) et légende des flèches V / G.
    try {
        window.guideDecouverte = new GuideDecouverteController(eventBus, renderingController);
    } catch (e) {
        console.error("[main.js] Guide « Découverte » indisponible :", e);
    }
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
    // Les missions ne viennent PAS d'ici : elles sont déclarées par le monde chargé
    // (`missions[]` dans assets/worlds/*.json) et lues par GameSetupController.buildWorldFromData
    // -> MissionManager.loadFromData. Un tableau `missions` codé en dur figurait ici ; il n'était
    // lu par personne (init/_setupModels ignorent ce paramètre) et son schéma
    // (origin/destination/itemName) ne correspondait pas à celui attendu (from/to/requiredCargo) :
    // il aurait été intégralement rejeté. Supprimé pour ne pas induire en erreur.
    const config = {
        // ... configurations éventuelles (aucune n'est consommée pour l'instant) ...
    };
    gameController.init(canvas, config); // Passer le canvas et la config ici

    // Le choix du monde est maintenant fait dans l'écran de démarrage (showInstructions)

    // Afficher les instructions initiales à l'utilisateur
    showInstructions();

    // NOTE: le code de fermeture d'une « modale d'instructions » (#instructionsModal,
    // .close-button, #understoodButton) a été supprimé : aucun de ces éléments n'existe dans
    // index.html, les trois lookups renvoyaient null et la fonction closeModal n'était jamais
    // appelée. L'écran de démarrage réel est le panneau construit dynamiquement par
    // showInstructions() ci-dessus, dont le bouton « Prêt ! » gère lui-même la fermeture,
    // le chargement du monde choisi et le recentrage caméra.

}

/**
 * Point d'entrée réel : pose le filet de sécurité AVANT toute initialisation, puis initialise.
 */
function init() {
    installerGestionnaireErreurs();
    try {
        initialiserApplication();
    } catch (e) {
        console.error("Échec fatal de l'initialisation :", e);
        afficherErreurFatale(
            "Échec de l'initialisation : " + ((e && e.stack) || e) +
            "\n\nVérifiez votre connexion réseau (Matter.js, matter-attractors et TensorFlow.js sont " +
            "chargés depuis un CDN) et que la page est servie par un serveur local " +
            "(python -m http.server 8000), pas ouverte en file://."
        );
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
        max-width: min(640px, calc(100vw - 16px)); /* jamais plus large que l'écran (téléphone, cadre) */
        max-height: calc(100vh - 16px);            /* trop haut : le panneau défile au doigt */
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
        box-sizing: border-box;
        border: 1px solid #555; /* Bordure subtile */
        display: flex; /* Utilisation de flexbox pour l'agencement */
        flex-direction: column;
        align-items: center;
        gap: 10px; /* Espacement entre les éléments */
    `;
    
    // Contenu HTML du panneau (structure améliorée). Mise en page : classes définies dans
    // index.html (#instructions …), qui adaptent le panneau aux petits écrans et au doigt.
    instructions.innerHTML = `
        <div class="ligne-haut">
            <div class="colonne-logo">
                <img src="favicon.png" alt="Icône Fusée" />
                <div>
                    <p style="font-size:0.8em; color:#bbb; margin-top: 8px; text-align:center;">Souris, manette de jeu et écran tactile également supportés.</p>
                    <p style="font-size:0.82em; color:#9cf; margin-top:4px; text-align:center; font-style: italic;">Une minuscule fusée. Un univers infini. Votre voyage commence.</p>
                </div>
            </div>
            <div class="colonne-controles">
                <h3 style="font-weight:bold; font-size:1.1em; margin:0 0 5px 0; text-align: left;">Contrôles</h3>
                <table style="border-collapse:collapse; width: 100%; font-size:0.85em; text-align: left;">
                    <tbody>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; width: 40%; text-align: center;"><b>↑ / W</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Principale</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>↓ / S</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Arrière</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>→ / A</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Latérale Gauche</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>← / D</b></td><td style="border:1px solid #666; padding: 3px 6px;">Propulsion Latérale Droite</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>R</b></td><td style="border:1px solid #666; padding: 3px 6px;">Réinitialiser la Simulation</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>T</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher la Trajectoire</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>V</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher les forces (attraction, poussée) et la vitesse</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>G</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher/Cacher Champ Gravité/Équipotentielles</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>+ / -</b></td><td style="border:1px solid #666; padding: 3px 6px;">Zoom Avant / Arrière (Molette aussi)</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>P / Échap</b></td><td style="border:1px solid #666; padding: 3px 6px;">Mettre en Pause / Reprendre</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>C</b></td><td style="border:1px solid #666; padding: 3px 6px;">Centrer la caméra sur la fusée</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>🎯</b></td><td style="border:1px solid #666; padding: 3px 6px;">Défis du cours (Monde 1, panneau à gauche)</td></tr>
                        <tr><td colspan="2" class="titre-tactile">Écran tactile (tablette) — boutons T, G, V, C, R comme au clavier</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>▲ / ▼</b></td><td style="border:1px solid #666; padding: 3px 6px;">Poussée / Rétro (garder le doigt appuyé)</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>↺ / ↻</b></td><td style="border:1px solid #666; padding: 3px 6px;">Tourner à gauche / à droite (garder appuyé)</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>2 doigts</b></td><td style="border:1px solid #666; padding: 3px 6px;">Pincer pour zoomer ; 1 doigt fait glisser la vue</td></tr>
                        <tr><td style="border:1px solid #666; padding: 3px 6px; text-align: center;"><b>✋</b></td><td style="border:1px solid #666; padding: 3px 6px;">Afficher / masquer les commandes tactiles</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="ligne-depart">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <label for="worldSelect" style="font-weight:bold;">Monde:</label>
                <select id="worldSelect">
                    <option value="1" selected>Monde 1 — Système solaire</option>
                    <option value="2">Monde 2 — Kerbol System</option>
                    <option value="3">Monde 3 — OuterWilds System</option>
                    <option value="4">Monde 4 — Tatoo</option>
                    <option value="5">Monde 5 — Endor</option>
                    <option value="6">Monde 6 — Alien</option>
                </select>
            </div>
            <button id="startButton" type="button">Prêt ! (Commencer)</button>
        </div>
    `;
    
    // Action lors du clic sur le bouton : supprimer le panneau et jouer le son.
    const startBtn = instructions.querySelector('#startButton');
    let sansEventBus = false;   // voir le repli plus bas
    const onStart = () => {
        // Verrou anti double-clic : un second clic avant le retrait du panneau
        // émettrait deux UNIVERSE_LOAD_REQUESTED concurrents.
        startBtn.onclick = null;
        startBtn.disabled = true;
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
        // NOTE: les abonnements RELOAD_COMPLETED / LOAD_FAILED sont posés UNE SEULE FOIS, en
        // dehors de ce handler (voir plus bas) : les enregistrer ici en rajoutait une paire à
        // chaque nouvelle tentative après un échec.
        if (sansEventBus && instructions.parentNode) {
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
    startBtn.onclick = onStart;

    // Le panneau de démarrage n'est retiré qu'au chargement EFFECTIF du monde, et se réarme si le
    // chargement échoue. `handleUniverseLoadRequested` est asynchrone : le retirer dès le clic
    // laissait le jeu figé sur « Chargement… » sans aucun moyen de réessayer quand le fetch
    // échouait (404, JSON invalide, ou ouverture du fichier en file://).
    const retirerPanneau = () => {
        if (instructions.parentNode) instructions.parentNode.removeChild(instructions);
    };
    if (window.eventBus && window.EVENTS && window.EVENTS.UNIVERSE) {
        const suivre = (unsub) => {
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
                window.controllerContainer.track(unsub);
            }
        };
        if (window.EVENTS.UNIVERSE.RELOAD_COMPLETED) {
            suivre(window.eventBus.subscribe(window.EVENTS.UNIVERSE.RELOAD_COMPLETED, retirerPanneau));
        }
        if (window.EVENTS.UNIVERSE.LOAD_FAILED) {
            suivre(window.eventBus.subscribe(window.EVENTS.UNIVERSE.LOAD_FAILED, () => {
                if (!instructions.parentNode) return;   // monde déjà chargé : rien à réarmer
                let msg = instructions.querySelector('#startError');
                if (!msg) {
                    msg = document.createElement('div');
                    msg.id = 'startError';
                    msg.style.cssText = 'color:#ff8080; font-size:0.8em; margin-top:6px;';
                    instructions.appendChild(msg);
                }
                msg.textContent = "Échec du chargement du monde. Vérifiez que le jeu est servi par un serveur local (python -m http.server), puis réessayez.";
                startBtn.disabled = false;
                startBtn.onclick = onStart;
            }));
        }
    } else {
        // Pas d'EventBus (échec de chargement d'un script) : impossible de savoir quand le monde
        // est prêt. On revient au comportement historique — retrait au clic — en le faisant DANS
        // le handler. L'appeler ici serait un no-op : le panneau n'est ajouté au DOM que plus bas.
        sansEventBus = true;
    }

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