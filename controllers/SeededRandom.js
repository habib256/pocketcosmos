/**
 * @file SeededRandom.js
 * Générateur pseudo-aléatoire **déterministe** (mulberry32) pour rendre l'entraînement IA
 * reproductible : à seed égale, une session produit la même séquence (angles initiaux,
 * tirages epsilon-greedy). Permet aussi un **jeu d'évaluation fixe** (mêmes conditions
 * initiales entre runs et entre modèles → `compareModels` comparable).
 *
 * mulberry32 : rapide, sans dépendance, qualité suffisante pour du RL (ce n'est pas de la crypto).
 * NB : `Math.random`/`Date.now` ne sont pas seedables — d'où ce petit générateur.
 */
class SeededRandom {
    /**
     * Fabrique un générateur `() => [0, 1)` déterministe à partir d'une seed entière.
     * @param {number} seed
     * @return {function(): number}
     */
    static mulberry32(seed) {
        // Pas de `|| 1` : mulberry32 est un mélangeur à compteur, pas un LCG — l'état 0 est
        // parfaitement valide (le premier pas ajoute 0x6D2B79F5). Le garde-fou hérité repliait
        // silencieusement la graine 0, pourtant saisissable dans l'interface, sur la graine 1 :
        // deux runs « distincts » produisaient la même séquence.
        let a = seed >>> 0;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * Liste déterministe de N angles dans [0, 2π), dérivée d'une seed.
     * Utilisée pour le jeu d'évaluation fixe (conditions initiales stables et comparables).
     * @param {number} seed
     * @param {number} n
     * @return {number[]}
     */
    static angleSet(seed, n) {
        const rng = SeededRandom.mulberry32(seed);
        const out = [];
        for (let i = 0; i < n; i++) out.push(rng() * Math.PI * 2);
        return out;
    }

    /**
     * Dérive une sous-seed déterministe (pour séparer les flux : entraînement vs évaluation).
     * @param {number} seed
     * @param {number} salt
     * @return {number}
     */
    static derive(seed, salt) {
        return ((seed >>> 0) ^ Math.imul(salt >>> 0, 0x9E3779B9)) >>> 0;
    }
}

// Exposition globale (pas de modules ES6 dans ce projet)
window.SeededRandom = SeededRandom;
