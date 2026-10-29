(() => {
  const zoneSelector = '.tier, .pool';

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

      const style = doc.createElement('style');
      style.textContent = '.rank-drop-feedback-marker{position:fixed;width:4px;border-radius:4px;background:#699f35;box-shadow:0 0 0 2px #f7fff0,0 2px 8px #31551c66;z-index:2147483000;pointer-events:none}';
      doc.head.append(style);

      let draggedCard = null;
      let marker = null;

      const clearMarker = () => {
        marker?.remove();
        marker = null;
      };

      const findPlacement = (zone, x, y) => {
        const cards = [...zone.querySelectorAll('.item')]
          .filter(card => card !== draggedCard && !card.classList.contains('touch-ghost'))
          .map(card => ({ rect: card.getBoundingClientRect() }));
        if (!cards.length) return null;

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
        if (next) return { x: next.rect.left - 5, top: next.rect.top, height: next.rect.height };

        const last = row.cards[row.cards.length - 1];
        return { x: last.rect.right + 3, top: last.rect.top, height: last.rect.height };
      };

      const showMarker = placement => {
        if (!placement) {
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
          left: `${placement.x}px`,
          top: `${placement.top}px`,
          height: `${placement.height}px`
        });
      };

      doc.addEventListener('dragstart', event => {
        draggedCard = event.target?.closest?.('.item') || null;
      }, true);

      // Bubble after the board's own drag handlers so pages with a native marker
      // keep their original feedback, while older saved boards get the same line.
      doc.addEventListener('dragover', event => {
        if (!draggedCard) return;
        if (doc.querySelector('.drop-marker')) {
          clearMarker();
          return;
        }
        const zone = event.target?.closest?.(zoneSelector);
        showMarker(zone ? findPlacement(zone, event.clientX, event.clientY) : null);
      });

      const finishDrag = () => {
        draggedCard = null;
        clearMarker();
      };
      doc.addEventListener('drop', finishDrag, true);
      doc.addEventListener('dragend', finishDrag, true);
    });
  };
})();
