#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Classes qui doivent être exposées globalement
const classesToExpose = [
    // Physics
    { file: 'physics/PhysicsController.js', className: 'PhysicsController' },
    { file: 'physics/factories/BodyFactory.js', className: 'BodyFactory' },
    { file: 'physics/handlers/CollisionHandler.js', className: 'CollisionHandler' },
    
    // Game
    { file: 'game/GameController.js', className: 'GameController' },
    { file: 'game/rocket/RocketController.js', className: 'RocketController' },
    { file: 'game/missions/MissionManager.js', className: 'MissionManager' },
    
    // Input
    { file: 'input/InputController.js', className: 'InputController' },
    
    // Rendering
    { file: 'rendering/RenderingController.js', className: 'RenderingController' },
    { file: 'rendering/views/RocketView.js', className: 'RocketView' },
    { file: 'rendering/views/UniverseView.js', className: 'UniverseView' },
    
    // AI
    { file: 'ai/RocketAI.js', className: 'RocketAI' },
    { file: 'ai/training/TrainingOrchestrator.js', className: 'TrainingOrchestrator' },
    { file: 'ai/training/HeadlessRocketEnvironment.js', className: 'HeadlessRocketEnvironment' },
    { file: 'ai/scripts/ControllerContainer.js', className: 'ControllerContainer' }
];

function addGlobalExport(filePath, className) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Vérifier si l'exposition globale existe déjà
        if (content.includes(`window.${className}`)) {
            console.log(`✅ ${className} déjà exposé dans ${filePath}`);
            return;
        }
        
        // Ajouter l'exposition globale à la fin
        const exportLine = `\n// Rendre disponible globalement\nwindow.${className} = ${className};`;
        const newContent = content.trimEnd() + exportLine;
        
        fs.writeFileSync(filePath, newContent);
        console.log(`✅ Ajouté exposition globale pour ${className} dans ${filePath}`);
        
    } catch (error) {
        console.log(`❌ Erreur avec ${filePath}: ${error.message}`);
    }
}

console.log('🚀 Ajout des expositions globales...\n');

for (const { file, className } of classesToExpose) {
    const filePath = path.join(process.cwd(), file);
    
    if (fs.existsSync(filePath)) {
        addGlobalExport(filePath, className);
    } else {
        console.log(`⚠️ Fichier non trouvé: ${filePath}`);
    }
}

console.log('\n🎉 Terminé !');
console.log('💡 N\'oubliez pas de reconstruire les bundles avec: npm run build'); 