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

    function trailerId(item) {
        var liste = item.RemoteTrailers || [];
        for (var i = 0; i < liste.length; i++) {
            var v = youtubeId(liste[i].Url);
            if (v) return v;
        }
        return null;
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
    function planifier() { clearTimeout(t); t = setTimeout(enrich, 150); }

    new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', planifier);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', planifier);
    } else {
        planifier();
    }
})();
