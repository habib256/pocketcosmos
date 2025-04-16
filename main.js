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
    instructions.innerHTML = `
        <img src="favicon.png" alt="Favicon" style="width:300px;height:300px;display:block;margin:0 auto 10px auto;" />
        <h3>Contrôles: Clavier, Souris & Joystick</h3>
        <ul style="text-align:left; max-width: 500px; margin: 0 auto; font-size: 1.1em;">
            <li><b>↑ / W</b> : Propulsion avant</li>
            <li><b>↓ / S</b> : Propulsion arrière</li>
            <li><b>← / A</b> : Rotation gauche</li>
            <li><b>→ / D</b> : Rotation droite</li>
            <li><b>R</b> : Réinitialiser la fusée</li>
            <li><b>T</b> : Afficher/masquer la trace de trajectoire</li>
            <li><b>V</b> : Afficher/masquer les vecteurs physiques</li>
            <li><b>G</b> : Afficher/masquer le champ de gravité et les équipotentielles</li>
            <li><b>+</b> / <b>-</b> ou <b>Molette Souris</b> : Zoom avant / arrière</li>
            <li><b>P</b> ou <b>Échap</b> : Pause</li>
        </ul>
        <p style="font-size:0.95em; color:#888; text-align:center;">A tiny rocket. An infinite universe. Your journey begins. </p>
    `;
    
    // Créer le bouton de fermeture
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Fermer';
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