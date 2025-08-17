### TODO – Corrections de bugs et améliorations

#### Priorité moyenne — Robustesse et maintenance
- [ ] Journalisation: réduire le bruit en production
  - Fichiers: multiples (`CollisionHandler`, `RenderingController`, `PhysicsController`, etc.)
  - Action: entourer les logs verbeux d’un drapeau `DEBUG` global ou d’un niveau de log configurable.

#### Performance et UX
- [ ] Audio: pré-charger les sons d’impact et de propulsion
  - Fichiers: `controllers/CollisionHandler.js`, gestion des sons propulseurs dans `ThrusterPhysics`
  - Action: créer un préchargeur global pour éviter les latences à la première lecture.

#### Qualité et tests
- [ ] Tests manuels de régression UI
  - Vérifier: toggles `V`/`G`/`T`, recentrage caméra, zoom clavier/souris/boutons manette, pause, reset fusée.

- [ ] Scénarios collision
  - Vérifier les transitions: non-contact → contact léger → atterrissage → décollage, et crashs (seuils).

- [ ] Entraînement IA
  - Vérifier que les abonnements du `TrainingOrchestrator` sont bien nettoyés lors d’un stop/restart d’entraînement (ajouter `cleanup()` si nécessaire).

---

Notes de cohérence
- Les scripts restent en mode global (pas d’ES modules). `window.EVENTS` et EventBus sont la source de vérité pour les événements.
- La gravité est appliquée par `matter-attractors` durant `Engine.update()`. Les méthodes de calcul gravitationnel côté contrôleurs sont destinées à la visualisation et au debug.


