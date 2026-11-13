/**
 * @file Guide « Découverte » : quatre défis courts liés au cours de 3e sur la gravitation
 * (interaction gravitationnelle, influence de la distance, poids, orbite), et légende des
 * affichages V (forces) et G (champ de gravitation).
 *
 * Panneau HTML repliable, à gauche sous le HUD : il ne masque ni la fusée (centrée par la caméra)
 * ni les commandes tactiles. Chaque défi est validé AUTOMATIQUEMENT à partir de l'état réel de la
 * simulation (SIMULATION.UPDATED), puis une explication relie ce que l'élève a vu au cours.
 *
 * Grandeurs : le jeu n'utilise pas le Système international et son système solaire est
 * miniature. Le guide n'affiche donc QUE des rapports (« 2,0 fois plus loin », « 4,0 fois plus
 * faible »), calculés avec la même loi en 1/d² et la même constante que la gravité réellement
 * appliquée par matter-attractors (vérifié par mesure, cf. PhysicsVectors.calculerAttractions).
 *
 * Le guide ne s'affiche que dans un monde qui contient la Terre et la Lune (Monde 1). Rien n'est
 * enregistré ni transmis : la progression repart de zéro à chaque chargement de la page.
 */
class GuideDecouverteController {
    /**
     * @param {EventBus} eventBus
     * @param {RenderingController} renderingController - lu pour savoir si V et G sont affichés.
     */
    constructor(eventBus, renderingController) {
        this.eventBus = eventBus;
        this.renderingController = renderingController;

        /** Index du défi affiché (0..3). */
        this.index = 0;
        /** Identifiants des défis réussis. */
        this.reussis = new Set();
        /** Panneau déplié ? Replié d'office sur petit écran (téléphone). */
        this.ouvert = GuideDecouverteController.grandEcran();
        /** Une partie est lancée (écran de démarrage refermé). */
        this.partieEnCours = false;
        /** Le monde chargé contient la Terre et la Lune. */
        this.mondeCompatible = false;
        /** Dernier défi validé dont l'explication est affichée (null sinon). */
        this.explicationAffichee = null;
        /** Suivi propre à un vol ; remis à zéro au reset, au changement de défi ou de monde. */
        this._suivi = GuideDecouverteController._suiviVierge();
        /** Dernière mesure affichée (texte), pour ne toucher au DOM que si elle change. */
        this._derniereMesure = '';
        this._derniereLegende = '';
        this._dernierRafraichissement = 0;
        /** Dernière marge gauche transmise à la caméra (px). @private */
        this._margeSignalee = '';
        this._tactileVu = null;
        /** Le prochain `click` suit un pointerup déjà traité : à ignorer. @private */
        this._ignorerClic = false;

        this._construireInterface();
        this._abonner();
        this._appliquerAffichage();
    }

    /** @return {boolean} Assez de place pour déplier le guide d'office. @static */
    static grandEcran() {
        try {
            return window.innerWidth >= 700 && window.innerHeight >= 520;
        } catch (e) {
            return true;
        }
    }

    /** @private @static */
    static _suiviVierge() {
        return { phaseRetombee: 'attente', arc: 0, anglePrecedent: null };
    }

    /** Nombre décimal à la française, tronqué (jamais arrondi vers le haut : « 2,0 » ⇒ ≥ 2). @static */
    static nombre(x, decimales = 1) {
        const p = Math.pow(10, decimales);
        const v = Math.floor(x * p + 1e-9) / p;
        return v.toFixed(decimales).replace('.', ',');
    }

    // ------------------------------------------------------------------ Défis

    /**
     * Les quatre défis. `evaluer(m)` reçoit les mesures de la frame et renvoie
     * `{ reussi: boolean, mesure: string }`.
     * @private
     */
    _definirDefis() {
        const nombre = GuideDecouverteController.nombre;
        return [
            {
                id: 'retombee',
                titre: 'Décoller… et retomber',
                consigne: 'Décolle (bouton ▲ ou flèche ↑), monte un peu, puis lâche : les moteurs se coupent. Que fait la fusée ?',
                evaluer: (m) => {
                    const s = this._suivi;
                    if (m.enVol && m.moteurs) s.phaseRetombee = 'vol';
                    else if (s.phaseRetombee === 'vol' && m.enVol && !m.moteurs) s.phaseRetombee = 'coupe';
                    if (s.phaseRetombee === 'coupe' && m.enVol && m.vitesseRadiale < -3) return { reussi: true, mesure: '' };
                    if (s.phaseRetombee === 'coupe') return { reussi: false, mesure: 'Moteurs coupés : la fusée a encore de la vitesse vers le haut… observe bien.' };
                    if (s.phaseRetombee === 'vol') return { reussi: false, mesure: 'Étape 2 : coupe les moteurs (lâche ▲ ou ↑).' };
                    return { reussi: false, mesure: 'Étape 1 : décolle (garde ▲ ou ↑ appuyé).' };
                },
                explication: () => [
                    'Moteurs coupés, la fusée a encore de la vitesse vers le haut : elle monte encore un peu, ralentit, puis retombe. La Terre l’attire vers son centre, même sans la toucher : c’est l’<b>interaction gravitationnelle</b> (et la fusée attire aussi la Terre).',
                    'Cette attraction de la Terre sur la fusée, c’est son <b>poids</b> : P = m × g. Près du sol, g = 9,8 N/kg ; plus haut, g diminue. Affiche les forces (V) : la flèche « Attraction de la Terre » est là, moteurs allumés ou coupés.'
                ]
            },
            {
                id: 'distance',
                titre: 'Plus loin, moins attirée',
                consigne: 'Affiche les forces (bouton V). Monte jusqu’à être 2 fois plus loin du centre de la Terre qu’au décollage (d se mesure depuis le centre de la Terre, pas depuis le sol), en regardant la flèche « Attraction de la Terre ».',
                evaluer: (m) => {
                    const f = m.distanceTerre / m.distanceSolTerre;
                    if (!m.enVol || f < 1.02) return { reussi: false, mesure: 'Au décollage, la distance au centre de la Terre sert de référence. Décolle et monte.' };
                    if (f < 1.1) return { reussi: false, mesure: 'Distance au centre de la Terre : presque la même qu’au décollage. Continue de monter.' };
                    const texte = `Distance au centre de la Terre : <b>${nombre(f)} fois</b> celle du décollage. Attraction de la Terre : <b>${nombre(f * f)} fois plus faible</b> qu’au décollage.`;
                    return { reussi: f >= 2, mesure: texte };
                },
                explication: () => [
                    'La distance d entre le centre de la Terre et la fusée a été multipliée par 2, et l’attraction de la Terre est divisée par <b>4</b>, pas par 2 : dans F = G × (m₁ × m₂) / d², la distance est <b>au carré</b> (2² = 4).',
                    'À 3 fois la distance, l’attraction serait 9 fois plus faible (3² = 9). La flèche rapetisse très vite ! Tu vois peut-être aussi la flèche « Attraction du Soleil » : le Soleil attire aussi la fusée.'
                ]
            },
            {
                id: 'orbite',
                titre: 'Tomber autour de la Terre',
                consigne: '1) Monte. 2) Penche la fusée (↺ ↻ ou ← →) et accélère parallèlement au sol. 3) Coupe les moteurs : fais un quart de tour de la Terre sans toucher le sol. La trajectoire s’affiche avec le bouton ou la touche T.',
                evaluer: (m) => {
                    const s = this._suivi;
                    if (!m.enVol || m.moteurs) {
                        s.arc = 0;
                        s.anglePrecedent = null;
                        return { reussi: false, mesure: !m.enVol ? 'Décolle d’abord.' : 'Moteurs allumés : le compteur démarre quand tu les coupes.' };
                    }
                    if (s.anglePrecedent !== null) {
                        let da = m.angleAutourTerre - s.anglePrecedent;
                        if (da > Math.PI) da -= 2 * Math.PI;
                        if (da < -Math.PI) da += 2 * Math.PI;
                        s.arc += da;
                    }
                    s.anglePrecedent = m.angleAutourTerre;
                    // La Terre doit RETENIR la fusée (énergie mécanique par rapport à la Terre < 0) :
                    // une fusée assez rapide pour s'échapper en ligne presque droite balaierait aussi
                    // un angle, sans que sa trajectoire « tombe » autour de la Terre.
                    if (m.energieTerre >= 0) {
                        s.arc = 0;
                        return { reussi: false, mesure: 'Trop rapide : la fusée s’échappe, la Terre ne la retient plus. Recommence (R) moins vite.' };
                    }
                    const part = Math.min(1, Math.abs(s.arc) / (Math.PI / 2));
                    return { reussi: part >= 1, mesure: `Quart de tour sans moteur : <b>${Math.floor(part * 100)} %</b>` };
                },
                explication: () => [
                    'Moteurs coupés, la fusée tombe sans cesse vers la Terre, mais elle avance si vite sur le côté que le sol « s’échappe » sous elle : sa trajectoire se courbe autour de la Terre. C’est le principe d’une <b>orbite</b>.',
                    'Newton a compris que la Lune « tombe » ainsi autour de la Terre, attirée par la Terre comme la pomme qui tombe de l’arbre.',
                    '<span class="guide-note">Dans ce jeu, la fusée ne fait presque jamais plus d’un tour, surtout parce que la Terre ne tourne pas autour du Soleil alors que le Soleil attire la fusée et la dévie. Dans la réalité, le Soleil attire presque pareil la Terre et le satellite : ils tournent ensemble autour de lui, et un satellite peut faire des milliers de tours de la Terre.</span>'
                ]
            },
            {
                id: 'lune',
                titre: 'Sur la Lune, moins attirée',
                consigne: 'Va jusqu’à la Lune et approche-toi tout près de sa surface, ou pose-toi dessus. Astuce : avec V, la flèche dorée « Mission : Lune » montre où elle est.',
                evaluer: (m) => {
                    const surLaLune = m.poseeSur === 'Lune';
                    const toutPres = m.enVol && m.distanceLune <= 2 * m.rayonLune && m.astreDominant === 'Lune';
                    const mesure = m.astreDominant
                        ? `Astre qui attire le plus la fusée ici : <b>${GuideDecouverteController._articleDefini(m.astreDominant)}</b>.`
                        : '';
                    return { reussi: surLaLune || toutPres, mesure };
                },
                explication: (m) => {
                    const pourcent = Math.round(100 * m.poidsLune / m.poidsTerre);
                    return [
                        'Près de la Lune, c’est elle qui attire le plus la fusée. La masse de la Lune est bien plus petite que celle de la Terre, ce qui diminue l’attraction. Son rayon est aussi plus petit : à sa surface, on est plus près de son centre, ce qui compense en partie. Au total, posée sur la Lune, la fusée est moins attirée que sur la Terre.',
                        `Dans ce jeu, son poids sur la Lune vaut environ <b>${pourcent} %</b> de son poids sur la Terre. En réalité, c’est environ <b>16 %</b> (1,6 N/kg contre 9,8 N/kg), soit 6 fois moins : les astres du jeu n’ont pas les vraies masses ni les vrais rayons.`,
                        'La <b>masse</b> de la fusée, elle, ne dépend pas de l’astre où elle se trouve : seul son <b>poids</b> change d’un astre à l’autre.'
                    ];
                }
            }
        ];
    }

    /** « la Terre », « le Soleil », « Mars ». @private @static */
    static _articleDefini(nom) {
        if (nom === 'Terre') return 'la Terre';
        if (nom === 'Lune') return 'la Lune';
        if (nom === 'Soleil') return 'le Soleil';
        return nom;
    }

    // ------------------------------------------------------------------ Interface

    /** @private */
    _ecouter(cible, type, fn, options) {
        cible.addEventListener(type, fn, options);
        if (window.controllerContainer && typeof window.controllerContainer.track === 'function') {
            window.controllerContainer.track(() => cible.removeEventListener(type, fn, options));
        }
    }

    /**
     * Bouton du guide : action au RELÂCHEMENT du pointeur sur le bouton (fiable au doigt même si un
     * autre doigt tient ▲), sans prise de focus (la barre Espace reste au jeu) ; au clavier
     * (Tab puis Entrée/Espace), l'événement `click` habituel.
     * @private
     */
    _creerBouton(id, texte, titre, action, classe) {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.className = 'guide-bouton' + (classe ? ' ' + classe : '');
        b.innerHTML = texte;
        if (titre) {
            b.title = titre;
            b.setAttribute('aria-label', titre);
        }
        const pointeurs = new Set();
        this._ecouter(b, 'pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
            pointeurs.add(e.pointerId);
        });
        this._ecouter(b, 'pointerup', (e) => {
            if (!pointeurs.delete(e.pointerId)) return;
            const r = b.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            this._ignorerClic = true;
            setTimeout(() => { this._ignorerClic = false; }, 400);
            action();
        });
        const oublier = (e) => { pointeurs.delete(e.pointerId); };
        this._ecouter(b, 'pointercancel', oublier);
        this._ecouter(b, 'lostpointercapture', oublier);
        this._ecouter(b, 'click', (e) => {
            e.stopPropagation();
            if (this._ignorerClic) { this._ignorerClic = false; return; }
            action();
        });
        return b;
    }

    /** @private */
    _construireInterface() {
        const colonne = document.createElement('div');
        colonne.id = 'colonnePedagogique';

        // --- Guide des défis ---
        const guide = document.createElement('section');
        guide.id = 'guideDecouverte';
        guide.setAttribute('aria-label', 'Défis du cours sur la gravitation');

        const entete = document.createElement('div');
        entete.className = 'guide-entete';
        this.boutonBascule = this._creerBouton('guideBascule', '', 'Afficher ou replier les défis du cours', () => this.basculer(), 'guide-bascule');
        this.boutonPrecedent = this._creerBouton('guidePrecedent', '◀', 'Défi précédent', () => this.allerA(this.index - 1));
        this.boutonSuivantEntete = this._creerBouton('guideSuivantEntete', '▶', 'Défi suivant', () => this.allerA(this.index + 1));
        entete.appendChild(this.boutonBascule);
        entete.appendChild(this.boutonPrecedent);
        entete.appendChild(this.boutonSuivantEntete);

        const corps = document.createElement('div');
        corps.className = 'guide-corps';
        corps.id = 'guideCorps';
        this.elTitre = document.createElement('h2');
        this.elTitre.className = 'guide-titre';
        this.elConsigne = document.createElement('p');
        this.elConsigne.className = 'guide-consigne';
        this.elMesure = document.createElement('p');
        this.elMesure.className = 'guide-mesure';
        this.elMesure.id = 'guideMesure';
        this.elExplication = document.createElement('div');
        this.elExplication.className = 'guide-explication';
        this.elExplication.id = 'guideExplication';
        this.elExplication.setAttribute('role', 'status');
        this.elExplication.setAttribute('aria-live', 'polite');
        this.boutonSuivant = this._creerBouton('guideSuivant', 'Défi suivant ▶', 'Passer au défi suivant', () => this.allerA(this.index + 1), 'guide-suivant');
        corps.appendChild(this.elTitre);
        corps.appendChild(this.elConsigne);
        corps.appendChild(this.elMesure);
        corps.appendChild(this.elExplication);
        corps.appendChild(this.boutonSuivant);

        guide.appendChild(entete);
        guide.appendChild(corps);

        // --- Légende des affichages V et G ---
        const legende = document.createElement('section');
        legende.id = 'legendeAffichage';
        legende.setAttribute('aria-label', 'Légende des flèches affichées');

        colonne.appendChild(guide);
        colonne.appendChild(legende);
        this._ecouter(colonne, 'contextmenu', (e) => e.preventDefault());
        document.body.appendChild(colonne);

        this.colonne = colonne;
        this.elGuide = guide;
        this.elCorps = corps;
        this.elLegende = legende;
        this.defis = this._definirDefis();
        this._afficherDefi();
    }

    /** Déplie / replie le panneau des défis. */
    basculer() {
        this.ouvert = !this.ouvert;
        this.boutonBascule.classList.remove('guide-nouveau');
        this._appliquerAffichage();
    }

    /** Affiche le défi `i` (borné) et remet son suivi à zéro. */
    allerA(i) {
        const n = this.defis.length;
        this.index = Math.max(0, Math.min(n - 1, i));
        this.explicationAffichee = null;
        this._suivi = GuideDecouverteController._suiviVierge();
        this._derniereMesure = '';
        this._afficherDefi();
    }

    /** @private */
    _afficherDefi() {
        const d = this.defis[this.index];
        const n = this.defis.length;
        const fait = this.reussis.has(d.id);
        this.elTitre.textContent = `Défi ${this.index + 1} sur ${n} — ${d.titre}` + (fait ? ' ✓' : '');
        this.elConsigne.textContent = d.consigne;
        // Défi réussi : la consigne laisse la place à l'explication (petits écrans, cadre 1000×680).
        this.elConsigne.hidden = this.explicationAffichee !== null;
        this.elMesure.innerHTML = '';
        if (this.explicationAffichee === null) {
            this.elExplication.innerHTML = '';
            this.elExplication.hidden = true;
            this.boutonSuivant.hidden = true;
        }
        this.boutonPrecedent.disabled = this.index === 0;
        this.boutonSuivantEntete.disabled = this.index === n - 1;
        this._majBascule();
    }

    /** @private */
    _majBascule() {
        const n = this.defis.length;
        this.boutonBascule.innerHTML = `🎯 Défis <span class="guide-compteur">✓ ${this.reussis.size}/${n}</span> <span aria-hidden="true">${this.ouvert ? '▾' : '▸'}</span>`;
        this.boutonBascule.setAttribute('aria-expanded', this.ouvert ? 'true' : 'false');
    }

    /** @private */
    _appliquerAffichage() {
        const actif = this.partieEnCours;
        this.colonne.style.display = actif ? '' : 'none';
        this.elGuide.hidden = !this.mondeCompatible;
        this.elCorps.hidden = !this.ouvert;
        this.boutonPrecedent.hidden = !this.ouvert;
        this.boutonSuivantEntete.hidden = !this.ouvert;
        this.colonne.classList.toggle('replie', !this.ouvert);
        this._majBascule();
        this._majLegende(true);
        this._signalerMarge();
    }

    /**
     * Indique à la caméra la largeur recouverte à gauche par le panneau déplié (ou la légende),
     * pour que la fusée suivie reste dans la zone libre, même quand le retard de la caméra la
     * décale vers la gauche à grande vitesse. Rien sur petit écran (zone libre < 360 px) ni quand
     * le panneau est replié.
     * @private
     */
    _signalerMarge() {
        let gauche = 0, droite = 0;
        if (this.partieEnCours && this.colonne.style.display !== 'none') {
            const r = this.colonne.getBoundingClientRect();
            if (r.height > 70) gauche = Math.round(r.right + 8);
            // Commandes du pouce droit (▲ ▼) affichées : la zone libre s'arrête avant elles.
            const pouceDroit = document.body.classList.contains('commandes-tactiles') && document.querySelector('#commandesTactiles .groupe-poussee');
            if (gauche > 0 && pouceDroit) {
                const rd = pouceDroit.getBoundingClientRect();
                if (rd.width > 0) droite = Math.round(window.innerWidth - rd.left + 8);
            }
        }
        const cle = gauche + '|' + droite;
        if (cle === this._margeSignalee) return;
        this._margeSignalee = cle;
        if (this.eventBus && window.EVENTS && EVENTS.CAMERA && EVENTS.CAMERA.LEFT_MARGIN_CHANGED) {
            this.eventBus.emit(EVENTS.CAMERA.LEFT_MARGIN_CHANGED, { margeGauche: gauche, margeDroite: droite });
        }
    }

    /** Légende : contenu selon V (forces) et G (champ). @private */
    _majLegende(forcer = false) {
        const rc = this.renderingController;
        const v = !!(rc && rc.showVectors);
        const g = rc ? rc.gravityFieldMode : 0;
        const cle = `${v}|${g}|${this.ouvert}`;
        if (!forcer && cle === this._derniereLegende) return;
        this._derniereLegende = cle;
        let html = '';
        if (v) {
            html += '<h3>Flèches sur la fusée (V)</h3><ul>'
                + '<li><span class="trait trait-attraction"></span><span><b>Attraction</b> d’un astre (son nom est au bout) : force gravitationnelle, dirigée vers le centre de l’astre.</span></li>'
                + '<li><span class="trait trait-poussee"></span><span><b>Poussée</b> du moteur.</span></li>'
                + '<li><span class="trait trait-vitesse"></span><span><b>Vitesse</b> (ce n’est pas une force) : direction et sens du mouvement, longueur fixe.</span></li>'
                + '<li><span class="trait trait-mission"></span><span><b>Mission</b> : vers où se trouve l’astre à atteindre (ce n’est pas une force).</span></li>'
                + '</ul><p class="legende-note">Les forces partent du centre de la fusée (point blanc), à la même échelle : une force 2 fois plus grande a une flèche 2 fois plus longue (sauf « flèche raccourcie »). Les attractions très faibles (moins d’un cinquième de la plus forte) ne sont pas dessinées, mais elles existent : tous les astres attirent la fusée. La fusée attire aussi chaque astre, avec une force de même valeur et de sens opposé (non dessinée).</p>';
        }
        if (g === 1) {
            html += '<h3>Champ de gravitation (G)</h3><p>Chaque petite flèche montre vers où un objet placé là serait attiré. Flèches longues et <span class="couleur-fort">rouges</span> : attraction forte ; courtes et <span class="couleur-faible">vertes</span> : attraction faible (par rapport aux autres flèches visibles à l’écran).</p>';
        } else if (g === 2) {
            html += '<h3>Lignes équipotentielles (G)</h3><p>Courbes de même « niveau » de gravitation autour des astres (notion hors programme du collège). Appuie encore sur G pour les masquer.</p>';
        }
        this.elLegende.innerHTML = html;
        // Le bouton 🎯 replie TOUTE la colonne (guide et légende) : sur téléphone, rien ne recouvre
        // la zone de jeu ni la barre d'outils tant que l'élève ne l'ouvre pas.
        this.elLegende.hidden = html === '' || !this.ouvert;
        this._signalerMarge();
    }

    // ------------------------------------------------------------------ Simulation

    /** @private */
    _abonner() {
        if (!this.eventBus || !window.EVENTS) return;
        const suivre = (unsub) => {
            if (window.controllerContainer && typeof window.controllerContainer.track === 'function') window.controllerContainer.track(unsub);
        };
        suivre(this.eventBus.subscribe(EVENTS.SIMULATION.UPDATED, (etat) => this._surMiseAJour(etat)));
        if (EVENTS.UNIVERSE && EVENTS.UNIVERSE.RELOAD_COMPLETED) {
            suivre(this.eventBus.subscribe(EVENTS.UNIVERSE.RELOAD_COMPLETED, () => {
                this.partieEnCours = true;
                this._appliquerAffichage();
            }));
        }
        if (EVENTS.UNIVERSE && EVENTS.UNIVERSE.STATE_UPDATED) {
            suivre(this.eventBus.subscribe(EVENTS.UNIVERSE.STATE_UPDATED, (charge) => {
                const corps = (charge && charge.universeModel && charge.universeModel.celestialBodies) || [];
                if (corps.length) this.mondeCompatible = corps.some(c => c.name === 'Terre') && corps.some(c => c.name === 'Lune');
                this._suivi = GuideDecouverteController._suiviVierge();
                this._appliquerAffichage();
            }));
        }
        if (EVENTS.ROCKET && EVENTS.ROCKET.RESET) {
            suivre(this.eventBus.subscribe(EVENTS.ROCKET.RESET, () => { this._suivi = GuideDecouverteController._suiviVierge(); }));
        }
        // Après un redimensionnement, la caméra a recentré sur tout l'écran : renvoyer la marge.
        this._ecouter(window, 'resize', () => { this._margeSignalee = ''; setTimeout(() => this._signalerMarge(), 0); });
        // V et G peuvent être basculés pendant la pause (pas de SIMULATION.UPDATED) : légende à jour
        // juste après le traitement de la bascule par RenderingController.
        if (EVENTS.RENDER) {
            const apresBascule = () => setTimeout(() => this._majLegende(), 0);
            if (EVENTS.RENDER.TOGGLE_VECTORS) suivre(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_VECTORS, apresBascule));
            if (EVENTS.RENDER.TOGGLE_GRAVITY_FIELD) suivre(this.eventBus.subscribe(EVENTS.RENDER.TOGGLE_GRAVITY_FIELD, apresBascule));
        }
    }

    /**
     * Mesures de la frame, tirées de l'état réel de la simulation.
     * @private
     */
    _mesurer(fusee, univers) {
        const corps = (univers && univers.celestialBodies) || [];
        const terre = corps.find(c => c.name === 'Terre');
        const lune = corps.find(c => c.name === 'Lune');
        if (!terre || !lune || !fusee || !fusee.position) return null;
        // Si l'état transmis ne précise pas le monde (SIMULATION.UPDATED), on le déduit ici aussi.
        this.mondeCompatible = true;
        const k = (typeof PHYSICS !== 'undefined' && PHYSICS.MATTER_BASE_DELTA) ? PHYSICS.MATTER_BASE_DELTA : 1000 / 60;
        const dx = fusee.position.x - terre.position.x, dy = fusee.position.y - terre.position.y;
        const distanceTerre = Math.hypot(dx, dy) || 1;
        const v = fusee.velocity || { x: 0, y: 0 };
        // Vitesse RELATIVE à la Terre (la Terre du Monde 1 est immobile, mais restons justes), en u/s
        const tv = terre.velocity || { x: 0, y: 0 };
        const vx = v.x / k - (tv.x || 0), vy = v.y / k - (tv.y || 0);
        const t = fusee.thrusters || {};
        const pousse = (nom) => PhysicsVectors.thrusterProduitPoussee(fusee, nom, t[nom]);
        const enVol = !fusee.isLanded && !fusee.isDestroyed;
        const masse = fusee.mass || ROCKET.MASS;
        const attractions = PhysicsVectors.calculerAttractions(fusee, univers, PHYSICS.G);
        return {
            enVol,
            moteurs: pousse('main') || pousse('rear'),
            poseeSur: fusee.isLanded ? fusee.landedOn : null,
            distanceTerre,
            distanceSolTerre: PhysicsVectors.distanceAuSol(terre),
            vitesseRadiale: (vx * dx + vy * dy) / distanceTerre,
            // Énergie mécanique massique par rapport à la Terre (unités du jeu) : < 0 ⇒ la Terre retient la fusée
            energieTerre: (vx * vx + vy * vy) / 2 - PHYSICS.G * terre.mass / distanceTerre,
            angleAutourTerre: Math.atan2(dy, dx),
            distanceLune: Math.hypot(fusee.position.x - lune.position.x, fusee.position.y - lune.position.y),
            rayonLune: lune.radius,
            astreDominant: attractions.length ? attractions[0].nom : null,
            poidsTerre: PhysicsVectors.poidsAuSol(terre, masse, PHYSICS.G),
            poidsLune: PhysicsVectors.poidsAuSol(lune, masse, PHYSICS.G)
        };
    }

    /** @private */
    _surMiseAJour(etat) {
        if (!etat) return;
        const maintenant = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const m = this._mesurer(etat.rocket, etat.universe);
        if (!m) {
            if (this.mondeCompatible) { this.mondeCompatible = false; this._appliquerAffichage(); }
            return;
        }
        if (this.elGuide.hidden) this._appliquerAffichage();
        const defi = this.defis[this.index];
        if (this.explicationAffichee === null) {
            const r = defi.evaluer(m);
            if (r.reussi) {
                this._valider(defi, m);
            } else if (r.mesure !== this._derniereMesure && maintenant - this._dernierRafraichissement > 150) {
                this._derniereMesure = r.mesure;
                this._dernierRafraichissement = maintenant;
                this.elMesure.innerHTML = r.mesure;
            }
        }
        this._majLegende();
        // ✋ peut afficher/masquer les commandes tactiles à tout moment.
        const tactile = !!(window.UI_STATE && window.UI_STATE.commandesTactiles);
        if (tactile !== this._tactileVu) { this._tactileVu = tactile; this._signalerMarge(); }
    }

    /** Défi réussi : explication, compteur, et le panneau s'ouvre s'il était replié. @private */
    _valider(defi, m) {
        this.reussis.add(defi.id);
        this.explicationAffichee = defi.id;
        const paragraphes = defi.explication(m);
        const dernier = this.index === this.defis.length - 1;
        let html = '<p class="guide-bravo">✓ Défi réussi !</p>' + paragraphes.map(p => `<p>${p}</p>`).join('');
        if (this.reussis.size === this.defis.length) {
            html += '<p class="guide-bilan"><b>À retenir</b> : deux corps qui ont une masse s’attirent mutuellement, à distance : F = G × (m₁ × m₂) / d² (m₁, m₂ : masses ; d : distance entre leurs centres). Le poids est l’attraction d’un astre sur un objet : P = m × g (g = 9,8 N/kg sur la Terre, 1,6 N/kg sur la Lune). La masse ne dépend pas du lieu, le poids si.</p>';
        }
        this.elMesure.innerHTML = '';
        this._derniereMesure = '';
        this.elExplication.innerHTML = html;
        this.elExplication.hidden = false;
        this.boutonSuivant.hidden = dernier;
        // Grand écran : le panneau s'ouvre pour montrer l'explication. Petit écran (téléphone) : il
        // recouvrirait la zone de jeu et la barre d'outils en plein pilotage ; le bouton 🎯 est
        // seulement mis en évidence, l'élève l'ouvre quand il veut.
        if (GuideDecouverteController.grandEcran()) this.ouvert = true;
        else if (!this.ouvert) this.boutonBascule.classList.add('guide-nouveau');
        this._afficherDefi();
        this._appliquerAffichage();
        // Le panneau peut défiler (petit écran, légende affichée) : montrer l'explication.
        try {
            this.elExplication.scrollIntoView({ block: 'nearest' });
            if (!dernier) this.boutonSuivant.scrollIntoView({ block: 'nearest' });
        } catch (e) { /* ignoré */ }
    }
}
