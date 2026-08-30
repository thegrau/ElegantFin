/* ============================================================================
   HELOU - Enrichissement des fiches de media pour Jellyfin
   ----------------------------------------------------------------------------
   Accompagne le theme ElegantFin (fork Helou). Ce script est necessaire parce
   que la resolution, le codec et la plage dynamique n'existent nulle part dans
   le DOM d'une fiche : seule l'API les expose.

   1. Construit une rangee de cartouches : annee, duree, genres, studio,
      resolution, codec, SDR/HDR - puis l'heure de fin en dessous.
   2. Deplace realisateurs et scenaristes juste au-dessus du carrousel
      Distribution & equipe.
   3. Remplace les recommandations du bas de page par une grille des images
      d'arriere-plan de l'oeuvre consultee.
   4. Joue la bande-annonce en fond de fiche, a la place de l'image d'arriere-
      plan fixe. Muette et sans controles.
   5. Ajoute au menu de l'oeuvre une entree permettant de designer manuellement
      un lien YouTube, qui prend alors le pas sur celui des metadonnees.

   Le masquage des emplacements d'origine est fait en CSS (bloc HELOU du theme).
   ============================================================================ */
(function () {
    'use strict';

    /* ---------------------------------------------------------------- outils */

    function resolutionLabel(w, h) {
        if (!h) return null;
        if (h >= 2000 || w >= 3800) return '4K';
        if (h >= 1400) return '1440p';
        if (h >= 1000) return '1080p';
        if (h >= 700) return '720p';
        if (h >= 540) return '576p';
        return h + 'p';
    }

    function codecLabel(c) {
        if (!c) return null;
        var m = {
            h264: 'H.264', avc: 'H.264', hevc: 'HEVC', h265: 'HEVC',
            av1: 'AV1', vp9: 'VP9', vc1: 'VC-1',
            mpeg2video: 'MPEG-2', mpeg4: 'MPEG-4'
        };
        return m[String(c).toLowerCase()] || String(c).toUpperCase();
    }

    /* Dolby Vision se decline en plusieurs variantes selon la couche de repli ;
       on les ramene toutes au meme libelle. */
    function rangeLabel(t) {
        if (!t) return null;
        if (/^DOVI/i.test(t)) return 'Dolby Vision';
        var m = { SDR: 'SDR', HDR10: 'HDR10', HDR10PLUS: 'HDR10+', HLG: 'HLG', HDR: 'HDR' };
        return m[String(t).toUpperCase()] || t;
    }

    function chip(text, variante) {
        var d = document.createElement('div');
        d.className = 'mediaInfoItem helou-chip' + (variante ? ' helou-chip-' + variante : '');
        d.textContent = text;
        return d;
    }

    function currentItemId() {
        var h = location.hash || '';
        if (h.indexOf('/details') === -1) return null;
        var q = h.indexOf('?');
        if (q === -1) return null;
        return new URLSearchParams(h.slice(q + 1)).get('id');
    }

    /* ------------------------------------------------------- rangee du haut */

    function buildChips(item, host) {
        var row = document.createElement('div');
        row.className = 'helou-chips';

        if (item.ProductionYear) row.appendChild(chip(item.ProductionYear, 'year'));

        if (item.RunTimeTicks) {
            var min = Math.round(item.RunTimeTicks / 600000000);
            var h = Math.floor(min / 60), m = min % 60;
            row.appendChild(chip(h ? h + 'h ' + (m < 10 ? '0' : '') + m + 'm' : min + 'm', 'runtime'));
        }

        (item.Genres || []).forEach(function (g) { row.appendChild(chip(g, 'genre')); });
        (item.Studios || []).forEach(function (s) { row.appendChild(chip(s.Name, 'studio')); });

        var v = (item.MediaStreams || []).filter(function (s) { return s.Type === 'Video'; })[0];
        if (v) {
            var r = resolutionLabel(v.Width, v.Height);
            var c = codecLabel(v.Codec);
            var d = rangeLabel(v.VideoRangeType || v.VideoRange);
            if (r) row.appendChild(chip(r, 'res'));
            if (c) row.appendChild(chip(c, 'codec'));
            if (d) row.appendChild(chip(d, d === 'SDR' ? 'sdr' : 'hdr'));
        }

        host.appendChild(row);

        /* Heure de fin, sur sa propre ligne sous les cartouches */
        var src = document.querySelector('.itemMiscInfo-primary .endsAt');
        if (src && src.textContent.trim()) {
            var e = document.createElement('div');
            e.className = 'helou-endsat';
            e.textContent = src.textContent.trim();
            host.appendChild(e);
        }
    }

    /* ------------------------------------ realisateurs / scenaristes deplaces */

    function moveCrew() {
        var cast = document.querySelector('#castCollapsible');
        var castVisible = cast && !cast.classList.contains('hide');

        /* Point d'ancrage de repli : sans casting visible, on se rabat sur la
           section de details. Sans ce repli, les groupes restaient dans
           .itemDetailsGroup - masque par le theme - et disparaissaient. */
        var ancre = castVisible ? cast
                  : document.querySelector('.trackSelections')
                  || document.querySelector('.detailSectionContent');
        if (!ancre || !ancre.parentNode) return;

        var wrap = document.querySelector('.helou-crew');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'helou-crew';
        }

        ['directorsGroup', 'writersGroup'].forEach(function (k) {
            var g = document.querySelector('.detailsGroupItem.' + k);
            if (g && g.parentNode !== wrap) wrap.appendChild(g);
        });

        if (wrap.children.length && !wrap.parentNode) {
            if (castVisible) ancre.parentNode.insertBefore(wrap, ancre);
            else ancre.parentNode.insertBefore(wrap, ancre.nextSibling);
        }
    }

    /* --------------------------------------------- grille des arriere-plans */

    function buildBackdrops(item, ac) {
        var anchor = document.querySelector('#similarCollapsible');
        if (!anchor) return;

        var old = document.querySelector('.helou-backdrops');
        if (old) old.remove();

        var tags = item.BackdropImageTags || [];
        var srcId = item.Id;

        /* Pour un episode, les arriere-plans sont portes par la serie parente */
        if (!tags.length && item.ParentBackdropImageTags && item.ParentBackdropItemId) {
            tags = item.ParentBackdropImageTags;
            srcId = item.ParentBackdropItemId;
        }
        if (!tags.length) return;

        var sec = document.createElement('div');
        sec.className = 'verticalSection detailVerticalSection helou-backdrops';

        var title = document.createElement('h2');
        title.className = 'sectionTitle';
        title.textContent = 'Images';
        sec.appendChild(title);

        var grid = document.createElement('div');
        grid.className = 'helou-backdrops-grid';

        tags.forEach(function (tag, i) {
            var url = ac.getScaledImageUrl(srcId, {
                type: 'Backdrop', index: i, tag: tag, maxWidth: 700, quality: 90
            });
            var cell = document.createElement('div');
            cell.className = 'helou-backdrop';
            var img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = '';
            img.src = url;
            cell.appendChild(img);
            grid.appendChild(cell);
        });

        sec.appendChild(grid);
        anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    }

    /* ------------------------------------------- bande-annonce en fond de fiche */

    /* Jellyfin pose <meta name="referrer" content="no-referrer"> : sans en-tete
       Referer, YouTube refuse l'integration avec l'erreur 153. L'attribut
       referrerpolicy porte par l'iframe l'emporte sur la regle du document. */
    var POLITIQUE_REFERRER = 'strict-origin-when-cross-origin';

    function youtubeId(url) {
        var m = String(url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    function trailerAuto(item) {
        var liste = item.RemoteTrailers || [];
        for (var i = 0; i < liste.length; i++) {
            var v = youtubeId(liste[i].Url);
            if (v) return v;
        }
        return null;
    }

    /* Le choix manuel prime ; a defaut on retombe sur les metadonnees TMDb. */
    function trailerId(item) {
        return manuels[item.Id] || trailerAuto(item);
    }

    function removeTrailer() {
        var w = document.querySelector('.helou-trailer');
        if (w) w.remove();
    }

    function mountTrailer(itemId, videoId) {
        var host = document.querySelector('.backdropContainer');
        if (!host) return;

        var w = document.querySelector('.helou-trailer');
        /* Deja en place pour cette oeuvre et toujours rattache : ne pas
           recharger, cela relancerait la video a chaque mutation du DOM. */
        if (w && w.dataset.helouId === itemId && w.parentNode === host) return;
        if (w) w.remove();

        w = document.createElement('div');
        w.className = 'helou-trailer';
        w.dataset.helouId = itemId;
        /* z-index : l'image d'arriere-plan est reinseree par Jellyfin apres nous,
           il faut donc passer explicitement au-dessus. */
        w.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;'
                        + 'z-index:2;opacity:0;transition:opacity 1.4s ease';

        var f = document.createElement('iframe');
        f.setAttribute('referrerpolicy', POLITIQUE_REFERRER);
        f.setAttribute('frameborder', '0');
        f.allow = 'autoplay; encrypted-media';
        f.title = '';
        /* 16/9 en couverture : on deborde sur l'axe le plus court. */
        f.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
                        + 'width:100vw;height:56.25vw;min-height:100vh;min-width:177.78vh;border:0';
        f.src = 'https://www.youtube.com/embed/' + videoId
              + '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + videoId
              + '&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3'
              + '&cc_load_policy=0&disablekb=1&fs=0&origin='
              + encodeURIComponent(location.origin);

        w.appendChild(f);
        host.appendChild(w);
        /* Le fondu masque le noir du lecteur pendant sa mise en route. */
        setTimeout(function () { w.style.opacity = '1'; }, 400);
    }

    /* Memorise l'identifiant YouTube par oeuvre : les passages suivants de
       enrich() sortent tot et n'ont plus l'objet complet sous la main. */
    var trailers = Object.create(null);

    function syncTrailer(id) {
        var v = trailers[id];
        if (v) mountTrailer(id, v);
        else removeTrailer();
    }

    /* ------------------------------ choix manuel de la bande-annonce (menu) */

    /* Stockage cote serveur, dans les preferences d'affichage de l'utilisateur :
       le choix suit donc l'utilisateur d'un appareil a l'autre. Une seule cle,
       porteuse d'un objet JSON, pour ne pas encombrer le bac de reglages que
       Jellyfin partage avec ses propres options client. */
    var CLE_PREFS = 'helouTrailers';
    var ID_PREFS = 'helou-trailers';
    var manuels = Object.create(null);
    var prefsChargees = false;

    function prefsClient() { return 'emby'; }

    async function chargerManuels(ac) {
        if (prefsChargees) return;
        try {
            var p = await ac.getDisplayPreferences(ID_PREFS, ac.getCurrentUserId(), prefsClient());
            var brut = (p.CustomPrefs || {})[CLE_PREFS];
            if (brut) manuels = JSON.parse(brut);
        } catch (e) {
            /* Premiere utilisation ou JSON illisible : on repart d'un objet vide */
        }
        prefsChargees = true;
    }

    async function enregistrerManuel(ac, itemId, videoId) {
        /* Relecture avant ecriture : le bac de preferences est partage avec les
           reglages client de Jellyfin, on ne doit pas ecraser le reste. */
        var p = await ac.getDisplayPreferences(ID_PREFS, ac.getCurrentUserId(), prefsClient());
        p.CustomPrefs = p.CustomPrefs || {};

        var courant = Object.create(null);
        try { if (p.CustomPrefs[CLE_PREFS]) courant = JSON.parse(p.CustomPrefs[CLE_PREFS]); } catch (e) {}

        if (videoId) courant[itemId] = videoId;
        else delete courant[itemId];

        p.CustomPrefs[CLE_PREFS] = JSON.stringify(courant);
        await ac.updateDisplayPreferences(ID_PREFS, p, ac.getCurrentUserId(), prefsClient());
        manuels = courant;
    }

    /* --------------------------------------------------------- boite de saisie */

    function fermerBoite() {
        var d = document.querySelector('.helou-modale');
        if (d) d.remove();
    }

    function ouvrirBoite(ac, itemId, titre, auto) {
        fermerBoite();

        var fond = document.createElement('div');
        fond.className = 'helou-modale';
        fond.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;'
            + 'align-items:center;justify-content:center;background:rgba(0,0,0,.55);'
            + 'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)';

        var carte = document.createElement('div');
        carte.style.cssText = 'width:min(34em,92vw);padding:1.6em;border-radius:var(--largeRadius,14px);'
            + 'background:hsla(0,0%,12%,.92);color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6);'
            + 'font-size:1rem;line-height:1.5';

        var h = document.createElement('div');
        h.textContent = 'Bande-annonce de ' + titre;
        h.style.cssText = 'font-size:1.15em;font-weight:600;margin-bottom:.35em';

        var aide = document.createElement('div');
        aide.textContent = auto
            ? 'Une bande-annonce est deja fournie par les metadonnees. Un lien saisi ici la remplacera.'
            : 'Aucune bande-annonce dans les metadonnees. Colle un lien YouTube pour en definir une.';
        aide.style.cssText = 'opacity:.65;font-size:.88em;margin-bottom:1.2em';

        var champ = document.createElement('input');
        champ.type = 'url';
        champ.placeholder = 'https://www.youtube.com/watch?v=...';
        champ.value = manuels[itemId] ? 'https://www.youtube.com/watch?v=' + manuels[itemId] : '';
        champ.style.cssText = 'width:100%;box-sizing:border-box;padding:.7em .9em;border-radius:8px;'
            + 'border:1px solid hsla(0,0%,100%,.18);background:hsla(0,0%,100%,.06);color:#fff;'
            + 'font-size:1em;outline:none';

        var erreur = document.createElement('div');
        erreur.style.cssText = 'min-height:1.4em;margin-top:.5em;font-size:.85em;color:#ff8a80';

        var barre = document.createElement('div');
        barre.style.cssText = 'display:flex;gap:.6em;justify-content:flex-end;margin-top:1em';

        function bouton(texte, primaire) {
            var b = document.createElement('button');
            b.textContent = texte;
            b.style.cssText = 'padding:.6em 1.2em;border-radius:999px;border:0;cursor:pointer;'
                + 'font-size:.95em;font-family:inherit;'
                + (primaire ? 'background:var(--accentColor,#8b5cf6);color:#fff'
                            : 'background:hsla(0,0%,100%,.1);color:#fff');
            return b;
        }

        var bAnnuler = bouton('Annuler', false);
        bAnnuler.onclick = fermerBoite;

        var bEffacer = null;
        if (manuels[itemId]) {
            bEffacer = bouton('Effacer', false);
            bEffacer.onclick = async function () {
                await enregistrerManuel(ac, itemId, null);
                fermerBoite();
                rafraichirTrailer(ac, itemId);
            };
        }

        var bValider = bouton('Enregistrer', true);
        bValider.onclick = async function () {
            var v = champ.value.trim();
            if (!v) { erreur.textContent = 'Colle un lien YouTube, ou utilise Effacer.'; return; }
            var vid = youtubeId(v);
            if (!vid) { erreur.textContent = 'Lien YouTube non reconnu.'; return; }
            bValider.disabled = true;
            try {
                await enregistrerManuel(ac, itemId, vid);
                fermerBoite();
                rafraichirTrailer(ac, itemId);
            } catch (e) {
                bValider.disabled = false;
                erreur.textContent = 'Enregistrement impossible.';
            }
        };

        champ.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') bValider.click();
            if (e.key === 'Escape') fermerBoite();
        });
        fond.addEventListener('click', function (e) { if (e.target === fond) fermerBoite(); });

        barre.appendChild(bAnnuler);
        if (bEffacer) barre.appendChild(bEffacer);
        barre.appendChild(bValider);

        carte.appendChild(h);
        carte.appendChild(aide);
        carte.appendChild(champ);
        carte.appendChild(erreur);
        carte.appendChild(barre);
        fond.appendChild(carte);
        document.body.appendChild(fond);
        champ.focus();
    }

    /* Recalcule et remonte la bande-annonce sans recharger la page. */
    async function rafraichirTrailer(ac, itemId) {
        try {
            var item = await ac.getItem(ac.getCurrentUserId(), itemId);
            trailers[itemId] = (item.Type === 'Movie' || item.Type === 'Series')
                             ? trailerId(item) : null;
            removeTrailer();
            syncTrailer(itemId);
        } catch (e) {}
    }

    /* ------------------------------------------- greffe sur le menu de l'oeuvre */

    /* L'identifiant est fige au moment du clic sur le bouton du menu : une fiche
       peut contenir d'autres menus (episodes, suggestions) qui ouvriraient la
       meme feuille d'actions pour un autre element. */
    var cibleMenu = null;

    document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('.btnMoreCommands') : null;
        cibleMenu = (b && b.closest('.detailPagePrimaryContainer')) ? currentItemId() : null;
    }, true);

    function greffeMenu() {
        if (!cibleMenu) return;
        var contenu = document.querySelector('.actionSheetContent');
        if (!contenu || contenu.querySelector('[data-id="helou-trailer"]')) return;

        var modele = contenu.querySelector('button.actionSheetMenuItem');
        if (!modele) return;

        var itemId = cibleMenu;
        var b = modele.cloneNode(true);
        b.setAttribute('data-id', 'helou-trailer');

        var icone = b.querySelector('.actionsheetMenuItemIcon');
        if (icone) icone.className = 'actionsheetMenuItemIcon listItemIcon '
                                   + 'listItemIcon-transparent material-icons movie';

        /* Le libelle est le seul noeud feuille porteur de texte du modele. */
        var feuilles = [].slice.call(b.querySelectorAll('*')).filter(function (e) {
            return e.children.length === 0 && e.textContent.trim();
        });
        if (feuilles.length) feuilles[0].textContent = 'Bande-annonce personnalisee';

        /* On laisse Jellyfin fermer la feuille : son gestionnaire ignore les
           identifiants qu'il ne connait pas. */
        b.addEventListener('click', function () {
            var ac = window.ApiClient;
            setTimeout(async function () {
                await chargerManuels(ac);
                var item = await ac.getItem(ac.getCurrentUserId(), itemId);
                ouvrirBoite(ac, itemId, item.Name || '', trailerAuto(item));
            }, 60);
        });

        contenu.appendChild(b);
    }

    /* ------------------------------------------------------------- pipeline */

    var enCours = false;

    async function enrich() {
        var id = currentItemId();
        /* Sortie d'une fiche : la bande-annonce doit s'arreter, le conteneur
           d'arriere-plan etant partage par toutes les pages. */
        if (!id) { removeTrailer(); return; }
        if (enCours) return;

        var host = document.querySelector('.itemMiscInfo-primary');
        if (!host || !host.parentNode) return;

        /* Deja traite pour cet element : on se contente de replacer l'equipe,
           que Jellyfin peut avoir reconstruite. */
        var existing = document.querySelector('.helou-info');
        if (existing && existing.dataset.helouId === id) { moveCrew(); syncTrailer(id); return; }

        var ac = window.ApiClient;
        if (!ac || !ac.getCurrentUserId()) return;

        enCours = true;
        try {
            await chargerManuels(ac);
            var item = await ac.getItem(ac.getCurrentUserId(), id);

            if (existing) existing.remove();
            var info = document.createElement('div');
            info.className = 'helou-info';
            info.dataset.helouId = id;

            /* Permet au CSS de cibler les series (casting et equipe masques). */
            document.documentElement.dataset.helouType = item.Type || '';

            buildChips(item, info);
            host.parentNode.insertBefore(info, host.nextSibling);

            moveCrew();
            buildBackdrops(item, ac);

            trailers[id] = (item.Type === 'Movie' || item.Type === 'Series')
                         ? trailerId(item) : null;
            syncTrailer(id);
        } catch (e) {
            /* Jellyfin peut avoir change de page en cours de route : sans gravite */
        } finally {
            enCours = false;
        }
    }

    var t = null;
    function planifier() { greffeMenu(); clearTimeout(t); t = setTimeout(enrich, 150); }

    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', planifier);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', planifier);
    } else {
        planifier();
    }
})();
