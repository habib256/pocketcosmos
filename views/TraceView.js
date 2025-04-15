class TraceView {
    constructor() {
        this.traces = [];
        this.maxPoints = 20000; // Nombre maximum de points dans la trace (x2)
        this.isVisible = true;
        
        // Suppression des variables relatives à la lune
        // this.moonRelativeTraces = []; 
        // this.attachedToMoon = false;
    }
    
    // Signature simplifiée: ne prend que la position absolue
    update(position) { 
        if (!this.isVisible) return;
        
       // console.log(`%c[TraceView] update: Ajout du point (${position.x.toFixed(2)}, ${position.y.toFixed(2)})`, 'color: orange;');
        
        // Ajouter simplement le point de position absolue
        this.traces.push({ ...position });
        
        // Limiter le nombre de points
        if (this.traces.length > this.maxPoints) {
            this.traces.shift();
        }
    }
    
    render(ctx, camera) {
        if (!this.isVisible || this.traces.length < 2) return;
        
        ctx.save();
        
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        ctx.lineWidth = 2;
        
        let isNewPath = true;
        
        // Tracer la ligne entre les points en gérant les discontinuités
        for (let i = 0; i < this.traces.length; i++) {
            const point = this.traces[i];
            
            // Si le point est null, c'est une discontinuité
            if (point === null) {
                // Terminer le chemin actuel
                if (!isNewPath) {
                    ctx.stroke();
                    isNewPath = true;
                }
                continue;
            }
            
            // Vérifier que le point a des coordonnées x et y valides
            if (point.x === undefined || point.y === undefined || 
                isNaN(point.x) || isNaN(point.y)) {
                console.warn("Point de trace invalide:", point);
                // Commencer un nouveau chemin au prochain point valide
                isNewPath = true;
                continue;
            }
            
            const screenPos = camera.worldToScreen(point.x, point.y);
            
            // S'assurer que les coordonnées d'écran sont des nombres valides
            if (isNaN(screenPos.x) || isNaN(screenPos.y)) {
                console.warn("Coordonnées d'écran invalides:", screenPos);
                isNewPath = true;
                continue;
            }
            
            if (isNewPath) {
                // Commencer un nouveau chemin
                ctx.beginPath();
                ctx.moveTo(screenPos.x, screenPos.y);
                isNewPath = false;
            } else {
                ctx.lineTo(screenPos.x, screenPos.y);
            }
        }
        
        // Terminer le dernier chemin
        if (!isNewPath) {
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        return this.isVisible;
    }
    
    clear(all = false) {
        if (all) {
            // Effacement complet de toutes les traces
            this.traces = [];
            // Suppression de la référence à moonRelativeTraces
            // this.moonRelativeTraces = []; 
        } else {
            console.log('%c[TraceView] clear: Ajout d\'une discontinuité (null).', 'color: red;');
            // Ajouter un point null pour créer une discontinuité dans la trace
            this.traces.push(null);
            // Suppression de la référence à moonRelativeTraces
            /*
            if (this.attachedToMoon) {
                this.moonRelativeTraces.push(null);
            }
            */
        }
    }
} 