### TODO – Corrections de bugs et améliorations

#### Priorité haute — Corrections de bugs
- [x] UIView: jauge vitesse utilise la mauvaise constante
  - Fichier: `views/UIView.js`
  - Action: remplacer `ROCKET.CRASH_SPEED_THRESHOLD` par `PHYSICS.CRASH_SPEED_THRESHOLD` pour le calcul du pourcentage de vitesse.

- [x] UIView: propriété `crashedOn` obsolète
  - Fichier: `views/UIView.js`
  - Action: remplacer les usages de `rocketModel.crashedOn` par `(rocketModel.attachedTo || rocketModel.landedOn)` dans l'affichage (Game Over et état de vol).

- [x] ThrusterPhysics: incohérence "puissance en %" vs "valeur absolue"
  - Fichier: `controllers/ThrusterPhysics.js`
  - Action: interpréter `thruster.power` comme une valeur absolue dans [0..`thruster.maxPower`], calculer `powerFraction = power/maxPower` et l'utiliser pour la force et la consommation; retirer les divisions `/ 100` actuelles et utiliser `fuelUsed = FUEL_CONSUMPTION[type] * powerFraction`.

- [x] SynchronizationManager: seuil de décollage en pourcentage
  - Fichier: `controllers/SynchronizationManager.js`
  - Action: comparer `((thrusters.main.power / thrusters.main.maxPower) * 100)` à `PHYSICS.TAKEOFF_THRUST_THRESHOLD_PERCENT` (appliquer la même correction à toutes les occurrences liées au décollage/atterrissage).

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
  - Ajouter: vérification de la jauge de vitesse (seuils de couleurs basés sur `PHYSICS.CRASH_SPEED_THRESHOLD`).

- [ ] Scénarios collision
  - Vérifier les transitions: non-contact → contact léger → atterrissage → décollage, et crashs (seuils).
  - Ajouter: atterrissage stable uniquement si vitesse/angle/vitesse angulaire sous les seuils; crash si l’un dépasse; confirmation que le message "Crashé sur …" affiche `attachedTo || landedOn`.

- [ ] Entraînement IA
  - Vérifier que les abonnements du `TrainingOrchestrator` sont bien nettoyés lors d’un stop/restart d’entraînement (ajouter `cleanup()` si nécessaire).

---

