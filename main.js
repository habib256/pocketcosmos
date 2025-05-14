// Point d'entrée principal de l'application de simulation de fusée.
// Ce fichier initialise tous les composants majeurs et démarre la boucle de jeu.

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
                    if (window.eventBus && typeof window.eventBus.clearAllSubscribers === 'function') {
                         window.eventBus.clearAllSubscribers(); // S'assurer que cela correspond à l'API de EventBus
                    }
                }
            };
        }
    }

    // Initialisation de l'EventBus global pour la communication inter-modules.
    const eventBus = new EventBus();
    window.eventBus = eventBus; // Exposition globale temporaire

    // Récupérer l'élément canvas du DOM.
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("L'élément canvas avec l'ID 'gameCanvas' est introuvable. Assurez-vous qu'il existe dans index.html.");
        return; // Arrêter l'initialisation si le canvas n'est pas trouvé.
    }

    // Initialisation des contrôleurs et modèles principaux
    // L'ordre d'instanciation peut être important pour les dépendances injectées via constructeur.
    const missionManager = new MissionManager(eventBus);
    const gameController = new GameController(eventBus, missionManager);

    // Instancier les contrôleurs requis, en leur injectant l'EventBus.
    const inputController = new InputController(eventBus);
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
    try {
        // Crée un objet Audio pour le son.
        const countdownSound = new Audio('assets/sound/4321.mp3');
        countdownSound.volume = 1.0; // Met le volume au maximum.
        // Lance la lecture du son.
        countdownSound.play().catch(error => {
            console.error("Erreur lors de la lecture du son de compte à rebours:", error);
        });
    } catch (error) {
        // Gère les erreurs potentielles lors de la création ou lecture de l'audio.
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
        max-width: 350px; /* Largeur maximale */
        border: 1px solid #555; /* Bordure subtile */
        display: flex; /* Utilisation de flexbox pour l'agencement */
        flex-direction: column;
        align-items: center;
        gap: 10px; /* Espacement entre les éléments */
    `;
    
    // Contenu HTML du panneau (structure améliorée).
    instructions.innerHTML = `
        <img src="favicon.png" alt="Icône Fusée" style="width:80px; height:80px; display:block;" />
        <h3 style="font-weight:bold; font-size:1.1em; margin:5px 0;">Contrôles</h3>
        <table style="border-collapse:collapse; width: 100%; font-size:0.9em; text-align: left;">
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
        <p style="font-size:0.85em; color:#bbb; margin-top: 5px; text-align:center;">Souris et Manette de jeu également supportées.</p>
        <p style="font-size:0.88em; color:#9cf; margin-top:0; text-align:center; font-style: italic;">Une minuscule fusée. Un univers infini. Votre voyage commence.</p>
    `;
    
    // Créer le bouton de fermeture.
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Prêt ! (Commencer)'; // Texte plus engageant
    closeButton.style = 'margin-top: 15px; font-size:1.0em; padding: 5px 15px; cursor: pointer;';
    
    // Action lors du clic sur le bouton : supprimer le panneau et jouer le son.
    closeButton.onclick = () => {
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
    
    // Ajouter le bouton au panneau d'instructions.
    instructions.appendChild(closeButton);
    
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
                    if (window.eventBus && typeof window.eventBus.clearAllSubscribers === 'function') {
                         window.eventBus.clearAllSubscribers(); // S'assurer que cela correspond à l'API de EventBus
                    }
                }
            };
        }
    }

    // Initialisation de l'EventBus global pour la communication inter-modules.
    const eventBus = new EventBus();
    window.eventBus = eventBus; // Exposition globale temporaire

    // Récupérer l'élément canvas du DOM.
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("L'élément canvas avec l'ID 'gameCanvas' est introuvable. Assurez-vous qu'il existe dans index.html.");
        return; // Arrêter l'initialisation si le canvas n'est pas trouvé.
    }

    // Initialisation des contrôleurs et modèles principaux
    // L'ordre d'instanciation peut être important pour les dépendances injectées via constructeur.
    const missionManager = new MissionManager(eventBus);
    const gameController = new GameController(eventBus, missionManager);

    // Instancier les contrôleurs requis, en leur injectant l'EventBus.
    const inputController = new InputController(eventBus);
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
}); 