(() => {
  const zoneSelector = '.tier, .pool';
  const publishedKeyPrefix = 'rank-studio-v1-published-';

  window.installRankDropFeedback = frame => {
    if (!frame || frame.dataset.rankDropFeedbackInstalled) return;
    frame.dataset.rankDropFeedbackInstalled = 'true';

    frame.addEventListener('load', () => {
      let doc;
      try {
        doc = frame.contentDocument;
      } catch {
        return;
      }
      if (!doc?.body || doc.documentElement.dataset.rankDropFeedbackInstalled) return;
      doc.documentElement.dataset.rankDropFeedbackInstalled = 'true';

      const win = doc.defaultView;
      const style = doc.createElement('style');
      style.textContent = '.rank-drop-feedback-marker{position:fixed;width:4px;border-radius:4px;background:#699f35;box-shadow:0 0 0 2px #f7fff0,0 2px 8px #31551c66;z-index:2147483000;pointer-events:none}';
      doc.head.append(style);

      let draggedCard = null;
      let marker = null;
      let nativeMarkerSeen = false;
      const scrollRestoreKey = 'rank-studio-drop-scroll:' + win.location.pathname;

      const restoreScroll = () => {
        try {
          const savedScroll = win.sessionStorage.getItem(scrollRestoreKey);
          if (savedScroll === null) return;
          win.sessionStorage.removeItem(scrollRestoreKey);
          const y = Number(savedScroll);
          if (Number.isFinite(y)) win.requestAnimationFrame(() => win.scrollTo(0, y));
        } catch {}
      };
      restoreScroll();

      // Newer boards already calculate and apply beforeId themselves. Keep that
      // path intact; older published snapshots only have a visual fallback line.
      const hasNativePreciseDnD = [...doc.scripts].some(script => {
        const source = script.textContent || '';
        return source.includes('function insertionAt(') && source.includes('beforeId');
      });

      const clearMarker = () => {
        marker?.remove();
        marker = null;
      };

      const findPlacement = (zone, x, y) => {
        const cards = [...zone.querySelectorAll('.item')]
          .filter(card => card !== draggedCard && !card.classList.contains('touch-ghost'))
          .map(card => ({ id: card.dataset.item, rect: card.getBoundingClientRect() }));
        if (!cards.length) return { beforeId: null, marker: null };

        const rows = [];
        for (const card of cards) {
          let row = rows.find(candidate => Math.abs(candidate.top - card.rect.top) < 6);
          if (!row) {
            row = { top: card.rect.top, bottom: card.rect.bottom, cards: [] };
            rows.push(row);
          }
          row.top = Math.min(row.top, card.rect.top);
          row.bottom = Math.max(row.bottom, card.rect.bottom);
          row.cards.push(card);
        }

        rows.sort((a, b) => a.top - b.top);
        rows.forEach(row => row.cards.sort((a, b) => a.rect.left - b.rect.left));

        let rowIndex = 0;
        let bestDistance = Infinity;
        rows.forEach((row, index) => {
          const distance = y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0;
          if (distance < bestDistance) {
            bestDistance = distance;
            rowIndex = index;
          }
        });

        const row = rows[rowIndex];
        const next = row.cards.find(card => x < card.rect.left + card.rect.width / 2);
        if (next) {
          return {
            beforeId: next.id,
            marker: { x: next.rect.left - 5, top: next.rect.top, height: next.rect.height }
          };
        }

        const last = row.cards[row.cards.length - 1];
        return {
          beforeId: rows[rowIndex + 1]?.cards[0]?.id || null,
          marker: { x: last.rect.right + 3, top: last.rect.top, height: last.rect.height }
        };
      };

      const persistLegacyPlacement = (zone, placement) => {
        const id = draggedCard?.dataset.item;
        const filename = win.location.pathname.split('/').pop() || '';
        const slug = filename.toLowerCase().endsWith('.html') ? filename.slice(0, -5) : '';
        if (!id || !/^[a-z0-9][a-z0-9-]{0,47}$/i.test(slug) || !zone.dataset.tier) return false;

        const storageKey = publishedKeyPrefix + slug;
        try {
          const state = JSON.parse(win.localStorage.getItem(storageKey) || 'null');
          if (!state || !Array.isArray(state.tiers) || !Array.isArray(state.items)) return false;

          const item = state.items.find(entry => String(entry.id) === String(id));
          if (!item) return false;

          const targetTier = zone.classList.contains('pool') || zone.dataset.tier === 'pool'
            ? null
            : zone.dataset.tier;
          if (targetTier !== null && !state.tiers.some(tier => String(tier.id) === String(targetTier))) return false;

          state.items = state.items.filter(entry => String(entry.id) !== String(id));
          item.tier = targetTier;
          const beforeId = placement?.beforeId == null ? null : String(placement.beforeId);
          const index = beforeId === null
            ? -1
            : state.items.findIndex(entry => String(entry.id) === beforeId);
          state.items.splice(index < 0 ? state.items.length : index, 0, item);

          win.localStorage.setItem(storageKey, JSON.stringify(state));
          return true;
        } catch {
          return false;
        }
      };

      const showMarker = placement => {
        if (!placement?.marker) {
          clearMarker();
          return;
        }
        if (!marker) {
          marker = doc.createElement('div');
          marker.className = 'rank-drop-feedback-marker';
          marker.setAttribute('aria-hidden', 'true');
          doc.body.append(marker);
        }
        Object.assign(marker.style, {
          left: placement.marker.x + 'px',
          top: placement.marker.top + 'px',
          height: placement.marker.height + 'px'
        });
      };

      doc.addEventListener('dragstart', event => {
        draggedCard = event.target?.closest?.('.item') || null;
        nativeMarkerSeen = false;
      }, true);

      // Run after the board's handlers so an existing native marker remains authoritative.
      doc.addEventListener('dragover', event => {
        if (!draggedCard) return;
        if (doc.querySelector('.drop-marker')) {
          nativeMarkerSeen = true;
          clearMarker();
          return;
        }
        if (hasNativePreciseDnD) {
          clearMarker();
          return;
        }
        const zone = event.target?.closest?.(zoneSelector);
        showMarker(zone ? findPlacement(zone, event.clientX, event.clientY) : null);
      });

      // Legacy snapshots drew the line in this helper but ignored its position on
      // drop. Persist the same beforeId the line represents, then reload the board
      // so its private in-memory state and saved state stay in sync.
      doc.addEventListener('drop', event => {
        if (!draggedCard || hasNativePreciseDnD || nativeMarkerSeen) return;
        const zone = event.target?.closest?.(zoneSelector);
        if (!zone) return;
        const placement = findPlacement(zone, event.clientX, event.clientY);
        if (!persistLegacyPlacement(zone, placement)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const y = win.scrollY;
        try {
          win.sessionStorage.setItem(scrollRestoreKey, String(y));
        } catch {}
        draggedCard = null;
        nativeMarkerSeen = false;
        clearMarker();
        win.setTimeout(() => win.location.reload(), 0);
      }, true);

      const finishDrag = () => {
        draggedCard = null;
        nativeMarkerSeen = false;
        clearMarker();
      };
      doc.addEventListener('drop', finishDrag, true);
      doc.addEventListener('dragend', finishDrag, true);
    });
  };
})();
