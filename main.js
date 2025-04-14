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
        <h3>Contrôles</h3>
        <p>↑/W: Propulsion avant | ↓/S: Propulsion arrière</p>
        <p>←/A: Rotation gauche | →/D: Rotation droite</p>
        <p>R: Réinitialiser | C: Centrer caméra | T: Traces</p>
        <p>V: Vecteurs | Mouse wheel: Zoom</p>
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