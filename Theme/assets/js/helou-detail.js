/* ============================================================================
   HELOU - Enrichissement des fiches de media - Jellyfin 12 ("Modern")
   ----------------------------------------------------------------------------
   Accompagne ElegantFin + la couche de compatibilite elegantfin-jf12.
   Ce script existe parce que la resolution, le codec et la plage dynamique
   n'apparaissent nulle part dans le DOM d'une fiche : seule l'API les expose.

   1. Cartouches sous le titre : annee, duree, genres, studio, resolution,
      codec, SDR/HDR - puis l'heure de fin en dessous.
   2. Realisation et scenario, juste au-dessus de "Distribution & equipe".
   3. Grille des images d'arriere-plan a la place des recommandations.

   Le masquage des emplacements d'origine est fait en CSS (bloc HELOU).

   NOTE DE PORTAGE 10.x -> 12.0
   Jellyfin 12 a reconstruit le tableau de metadonnees en composants MUI :
   les classes .detailsGroupItem.directorsGroup / .writersGroup / .genresGroup
   / .studiosGroup ont disparu, il ne reste que .detailsGroupItem sans
   qualificatif. L'ancienne version deplacait ces noeuds ; elle ne pouvait donc
   plus les retrouver. On ne deplace plus rien : le bloc equipe est reconstruit
   a partir de item.People, ce qui ne depend ni des classes ni de la langue.
   ============================================================================ */
(function () {
    'use strict';

    /* Libelles du bloc equipe. Le DOM de la 12 n'expose plus de classe
       permettant de les recuperer ; ils sont donc poses ici. */
    var LIB = { director: 'Realisation', writer: 'Scenario', images: 'Images' };

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

        /* Heure de fin, sur sa propre ligne sous les cartouches. Jellyfin 12
           l'affiche nativement dans .itemMiscInfo-primary, que le CSS masque :
           on en recopie le texte plutot que de le recalculer. */
        var src = document.querySelector('.itemMiscInfo-primary .endsAt');
        if (src && src.textContent.trim()) {
            var e = document.createElement('div');
            e.className = 'helou-endsat';
            e.textContent = src.textContent.trim();
            host.appendChild(e);
        }
    }

    /* ------------------------------------------- realisation et scenario */

    function crewGroup(label, gens) {
        var g = document.createElement('div');
        g.className = 'helou-crew-group';

        var l = document.createElement('span');
        l.className = 'label';
        l.textContent = label;
        g.appendChild(l);

        var n = document.createElement('span');
        n.className = 'helou-crew-names';
        n.textContent = gens.join(', ');
        g.appendChild(n);

        return g;
    }

    function buildCrew(item) {
        var anchor = document.querySelector('#castCollapsible');
        if (!anchor || !anchor.parentNode) return;

        var old = document.querySelector('.helou-crew');
        if (old) old.remove();

        var gens = item.People || [];
        var uniq = function (type) {
            var vus = {};
            return gens.filter(function (p) { return p.Type === type; })
                       .map(function (p) { return p.Name; })
                       .filter(function (n) {
                           if (!n || vus[n]) return false;
                           vus[n] = 1;
                           return true;
                       });
        };

        var real = uniq('Director');
        var scen = uniq('Writer');
        if (!real.length && !scen.length) return;

        var wrap = document.createElement('div');
        wrap.className = 'helou-crew';
        if (real.length) wrap.appendChild(crewGroup(LIB.director, real));
        if (scen.length) wrap.appendChild(crewGroup(LIB.writer, scen));

        anchor.parentNode.insertBefore(wrap, anchor);
    }

    /* --------------------------------------------- grille des arriere-plans */

    function buildBackdrops(item, ac) {
        var anchor = document.querySelector('#similarCollapsible');
        if (!anchor || !anchor.parentNode) return;

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
        title.textContent = LIB.images;
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

    /* ------------------------------------------------------------- pipeline */

    var enCours = false;

    async function enrich() {
        var id = currentItemId();
        if (!id || enCours) return;

        var host = document.querySelector('.itemMiscInfo-primary');
        if (!host || !host.parentNode) return;

        /* Deja traite pour cet element. Jellyfin 12 re-rend les sections du bas
           apres coup : on rejoue equipe et images si elles ont ete balayees. */
        var existing = document.querySelector('.helou-info');
        if (existing && existing.dataset.helouId === id) {
            if (!document.querySelector('.helou-crew') || !document.querySelector('.helou-backdrops')) {
                var cache = window.__helouItem;
                if (cache && cache.Id === id) {
                    buildCrew(cache);
                    buildBackdrops(cache, window.ApiClient);
                }
            }
            return;
        }

        var ac = window.ApiClient;
        if (!ac || !ac.getCurrentUserId()) return;

        enCours = true;
        try {
            var item = await ac.getItem(ac.getCurrentUserId(), id);
            window.__helouItem = item;

            if (existing) existing.remove();
            var info = document.createElement('div');
            info.className = 'helou-info';
            info.dataset.helouId = id;

            /* Permet au CSS de cibler les series (casting et equipe masques). */
            document.documentElement.dataset.helouType = item.Type || '';

            buildChips(item, info);
            host.parentNode.insertBefore(info, host.nextSibling);

            buildCrew(item);
            buildBackdrops(item, ac);
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
