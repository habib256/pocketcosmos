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
    // Créer l'élément <canvas> et l'ajouter au corps du document.
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth; // Adapter à la largeur de la fenêtre
    canvas.height = window.innerHeight; // Adapter à la hauteur de la fenêtre
    document.body.appendChild(canvas);
    
    // Créer l'instance unique de l'EventBus pour la communication découplée.
    eventBus = new EventBus();
    // Rendre l'EventBus accessible globalement (pour le débogage ou accès facile).
    // Attention: Ceci est une pratique qui peut rompre l'encapsulation.
    window.eventBus = eventBus; 
    
    // Container pour gérer automatiquement les désabonnements (DI simple)
    window.controllerContainer = {
        subscriptions: [],
        track(fn) { this.subscriptions.push(fn); },
        cleanup() {
            this.subscriptions.forEach(unsub => unsub());
            this.subscriptions = [];
            // nettoyer l'EventBus
            if (window.eventBus && window.eventBus.clear) window.eventBus.clear();
        }
    };
    
    // Instancier les contrôleurs requis, en leur injectant l'EventBus.
    const inputController = new InputController(eventBus);
    const renderingController = new RenderingController(eventBus, canvas);
    const rocketAgent = new RocketAgent(eventBus);
    
    // Instancier le gestionnaire de missions.
    const missionManager = new MissionManager(eventBus);
    // Initialiser les missions par défaut dès le début.
    missionManager.resetMissions();
    
    // Instancier le contrôleur de jeu principal, en lui passant l'EventBus et le MissionManager.
    gameController = new GameController(eventBus, missionManager);
    
    // Injecter les dépendances (autres contrôleurs) dans le GameController.
    gameController.setControllers({
        inputController,
        renderingController,
        rocketAgent
    });
    
    // Initialiser le GameController (ne prend plus le canvas).
    gameController.init(/*canvas*/);
    
    // Afficher les instructions de jeu à l'utilisateur.
    showInstructions();
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
document.addEventListener('DOMContentLoaded', init); 