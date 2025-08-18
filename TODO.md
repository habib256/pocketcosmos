### TODO – Corrections de bugs et améliorations


#### Qualité et tests
- [ ] Tests manuels de régression UI
  - Vérifier: toggles `V`/`G`/`T`, recentrage caméra, zoom clavier/souris/boutons manette, pause, reset fusée.
  - Ajouter: vérification de la jauge de vitesse (seuils de couleurs basés sur `PHYSICS.CRASH_SPEED_THRESHOLD`).

- [ ] Scénarios collision
  - Vérifier les transitions: non-contact → contact léger → atterrissage → décollage, et crashs (seuils).
  - Ajouter: atterrissage stable uniquement si vitesse/angle/vitesse angulaire sous les seuils; crash si l’un dépasse; confirmation que le message "Crashé sur …" affiche `attachedTo || landedOn`.


#### Système IA — Bugs et améliorations
- [ ] RocketAI: mauvais canal d’émission des actions
  - Fichier: `controllers/RocketAI.js`
  - Problème: `emitControl()` émet `EVENTS.INPUT.KEYDOWN` (non consommé par le jeu).
  - Action: émettre directement des événements sémantiques: `EVENTS.ROCKET.THRUST_FORWARD_START/STOP`, `EVENTS.ROCKET.THRUST_BACKWARD_START/STOP`, `EVENTS.INPUT.ROTATE_COMMAND { value ∈ [-1,1] }`, ou `EVENTS.ROCKET.SET_THRUSTER_POWER` pour chaque propulseur (et remettre à 0 les autres à chaque step).

- [ ] ThrusterPhysics: échelle de puissance incohérente (sur-poussée)
  - Fichier: `controllers/ThrusterPhysics.js`
  - Problème: `applyThrusterForce()` interprète `thruster.power` comme un pourcentage (`/100`) alors qu’il s’agit d’une valeur absolue `[0..THRUSTER_POWER.*]`.
  - Action: utiliser `powerFraction = thruster.power / thruster.maxPower` pour la force et la consommation (l’impulsion de décollage est déjà gérée via `handleLiftoff()`).

- [ ] TrainingOrchestrator: re-souscription incomplète après changement d’EventBus
  - Fichier: `controllers/TrainingOrchestrator.js`
  - Problème: après `trainingEnv.eventBus = this.eventBus`, seul `rocketController.subscribeToEvents()` est rappelé.
  - Action: re-souscrire aussi `missionManager` (et tout autre contrôleur concerné), ex: `missionManager.subscribeToEvents()` si idempotent, ou ré-instancier proprement.

- [ ] Constantes d’entraînement irréalistes
  - Fichiers: `controllers/TrainingOrchestrator.js`, `controllers/HeadlessRocketEnvironment.js`
  - Problème: utilisation de masses/rayons “réels” (Terre/Lune) avec `PHYSICS.G` et unités de la simulation.
  - Action: utiliser `CELESTIAL_BODY` du projet (unités de la simu) ou appliquer un facteur d’échelle cohérent à masses/positions/rayons/G.

- [ ] Ne pas écraser `window.EVENTS` côté entraînement
  - Fichier: `controllers/TrainingOrchestrator.js`
  - Problème: assignation conditionnelle de `window.EVENTS` depuis l’env. d’entraînement.
  - Action: ne pas modifier le global; utiliser l’EventBus partagé et les mêmes `EVENTS` que le jeu.

- [ ] Fuite mémoire TensorFlow (diagnostic gradients)
  - Fichier: `controllers/RocketAI.js`
  - Problème: bloc `tf.variableGrads` ne libère pas tous les tenseurs; risque de fuite.
  - Action: encapsuler dans `tf.tidy()` et `dispose()` systématiquement les tenseurs/valeurs créés.

- [ ] Évaluation: contrôler l’exploration
  - Fichier: `controllers/TrainingOrchestrator.js`
  - Action: pendant `evaluateAgent()`, forcer `epsilon = epsilonMin` (ou un param dédié), puis restaurer après.

- [ ] Actions continues pour l’IA
  - Fichiers: `controllers/RocketAI.js`, `controllers/RocketController.js`
  - Action: privilégier `EVENTS.INPUT.ROTATE_COMMAND` (continu) et `SET_THRUSTER_POWER` proportionnel; s’assurer que les propulseurs non utilisés sont remis à 0 à chaque step (cf. commentaire déjà présent dans `HeadlessRocketEnvironment.step`).
