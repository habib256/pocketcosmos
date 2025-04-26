// Point d'entrée de l'application

let gameController = null;
let eventBus = null;

// Fonction d'initialisation
function init() {
    // Créer le canvas
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    
    // Créer l'EventBus pour la communication
    eventBus = new EventBus();
    window.eventBus = eventBus; // Rendre l'EventBus accessible globalement
    
    // Créer les contrôleurs avec l'EventBus
    const inputController = new InputController(eventBus);
    const renderingController = new RenderingController(eventBus);
    const rocketAgent = new RocketAgent(eventBus);
    
    // Créer le gestionnaire de missions
    const missionManager = new MissionManager(eventBus);
    // Initialiser les missions dès le départ
    missionManager.resetMissions();
    
    // Créer et initialiser le contrôleur de jeu
    gameController = new GameController(eventBus, missionManager);
    
    // Initialiser avec les dépendances
    gameController.setControllers({
        inputController,
        renderingController,
        rocketAgent
    });
    
    // Initialiser le jeu
    gameController.init(canvas);
    
    // Connecter le PhysicsController au RenderingController
    if (gameController.physicsController && gameController.renderingController) {
        gameController.renderingController.setPhysicsController(gameController.physicsController);
    }
    
    // Afficher les instructions
    showInstructions();
}

// Arrêter le jeu et nettoyer
function cleanup() {
    if (gameController) {
        gameController.cleanup();
    }
}

// Fonction pour jouer le son de compte à rebours
function playCountdownSound() {
    try {
        const countdownSound = new Audio('assets/sound/4321.mp3');
        countdownSound.volume = 1.0; // Volume maximum
        countdownSound.play().catch(error => {
            console.error("Erreur lors de la lecture du son de compte à rebours:", error);
        });
    } catch (error) {
        console.error("Erreur lors de la lecture du fichier 4321.mp3:", error);
    }
}

// Fonction pour afficher les instructions
function showInstructions() {
    // Créer élément d'instructions
    const instructions = document.createElement('div');
    instructions.id = 'instructions';
    instructions.style = `
        position: fixed;
        top: 50%;
        left: 50%;
     
        background: rgba(30,30,30,0.97);
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px #0008;
        padding: 2px 4px;
        font-size: 0.90em;
        z-index: 9999;
        min-width: unset;
        max-width: 210px;
    `;
    instructions.innerHTML = `
        <div style=\"display:flex; flex-direction:column; align-items:center; gap:1px;\">
            <img src=\"favicon.png\" alt=\"Favicon\" style=\"width:100px;height:100px;display:block;margin:0 auto 0 auto;\" />
            <span style=\"font-weight:bold; font-size:0.98em; margin-bottom:0;\">Contrôles rapides</span>
            <table style=\"border-collapse:collapse; margin:2px 0; font-size:0.88em;\">
                <tbody>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>↑/W</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Avancer</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>↓/S</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Reculer</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>←/A</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Gauche</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>→/D</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Droite</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>R</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Reset</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>T</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Trace</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>V</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Vecteurs</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>G</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Gravité</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>+</b>/<b>-</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Zoom</td></tr>
                    <tr><td style=\"border:1px solid #888;padding:1px 3px;\"><b>P</b>/<b>Échap</b></td><td style=\"border:1px solid #888;padding:1px 3px;\">Pause</td></tr>
                </tbody>
            </table>
            <span style=\"font-size:0.78em; color:#aaa; margin-top:0;\">Souris & Joystick aussi supportés</span>
            <span style=\"font-size:0.80em; color:#8cf; margin-top:1px; text-align:center;\">Une minuscule fusée. Un univers infini. Votre voyage commence.</span>
        </div>
    `;
    // Créer le bouton de fermeture
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Fermer';
    closeButton.style = 'margin: 8px auto 0 auto; display: block; font-size:0.95em; padding:2px 12px;';
    closeButton.onclick = () => {
        document.body.removeChild(instructions);
        // Jouer le son de compte à rebours après avoir fermé les instructions
        playCountdownSound();
    };
    instructions.appendChild(closeButton);
    document.body.appendChild(instructions);
}

// Nettoyer lors du déchargement de la page
window.addEventListener('beforeunload', cleanup);

// Attendre que le DOM soit chargé pour initialiser l'application
document.addEventListener('DOMContentLoaded', init); 