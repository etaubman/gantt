window.Gantt = window.Gantt || {};

Gantt.ragTooltip = (function() {
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var statusRank = { red: 0, amber: 1, green: 2 };
  var cache = {};
  var tooltipEl = null;
  var activeAnchor = null;
  var loadDelayTimer = null;
  var TOOLTIP_LOAD_DELAY_MS = 280;

  function ensureTooltip() {
    if (tooltipEl && document.body.contains(tooltipEl)) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'rag-super-tooltip';
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function setCache(taskUid, ragHistory) {
    if (!taskUid) return;
    cache[taskUid] = Array.isArray(ragHistory) ? ragHistory : [];
  }

  function getHistory(taskUid) {
    if (cache[taskUid]) return Promise.resolve(cache[taskUid]);
    return Gantt.api.getTaskRag(taskUid).then(function(ragHistory) {
      setCache(taskUid, ragHistory);
      return ragHistory;
    });
  }

  function getTrendText(history) {
    if (!history || history.length < 2) return 'No prior RAG history';
    var current = history[history.length - 1];
    var previous = history[history.length - 2];
    if (current.status === previous.status) {
      return 'Stable at ' + titleCaseStatus(current.status);
    }
    var currentRank = statusRank[current.status];
    var previousRank = statusRank[previous.status];
    if (currentRank > previousRank) {
      return 'Improving from ' + titleCaseStatus(previous.status) + ' to ' + titleCaseStatus(current.status);
    }
    if (currentRank < previousRank) {
      return 'Worsening from ' + titleCaseStatus(previous.status) + ' to ' + titleCaseStatus(current.status);
    }
    return 'Changed from ' + titleCaseStatus(previous.status) + ' to ' + titleCaseStatus(current.status);
  }

  function buildHistoryLine(history) {
    if (!history || !history.length) return 'No RAG history yet';
    var recent = history.slice(-4).reverse().map(function(entry) {
      return titleCaseStatus(entry.status);
    });
    return recent.join(' -> ');
  }

  function renderTooltip(taskName, history) {
    var tooltip = ensureTooltip();
    var current = history && history.length ? history[history.length - 1] : null;
    var previous = history && history.length > 1 ? history[history.length - 2] : null;
    if (!current) {
      tooltip.innerHTML =
        '<div class="rag-super-tooltip-title">' + escapeHtml(taskName || 'RAG status') + '</div>' +
        '<div class="rag-super-tooltip-empty">No RAG history yet</div>';
      return;
    }

    tooltip.innerHTML =
      '<div class="rag-super-tooltip-title">' + escapeHtml(taskName || 'RAG status') + '</div>' +
      '<div class="rag-super-tooltip-status-row">' +
        '<span class="rag-super-tooltip-chip ' + escapeHtml(current.status) + '">' + escapeHtml(titleCaseStatus(current.status)) + '</span>' +
        '<span class="rag-super-tooltip-created">' + escapeHtml(prettyDate(current.created_at)) + '</span>' +
      '</div>' +
      '<div class="rag-super-tooltip-grid">' +
        '<div class="rag-super-tooltip-label">Rationale</div><div class="rag-super-tooltip-value">' + escapeHtml(current.rationale || 'No rationale provided') + '</div>' +
        '<div class="rag-super-tooltip-label">Trend</div><div class="rag-super-tooltip-value">' + escapeHtml(getTrendText(history)) + '</div>' +
        '<div class="rag-super-tooltip-label">Prior status</div><div class="rag-super-tooltip-value">' + escapeHtml(previous ? (titleCaseStatus(previous.status) + ' on ' + prettyDate(previous.created_at)) : 'No prior status') + '</div>' +
        '<div class="rag-super-tooltip-label">History</div><div class="rag-super-tooltip-value">' + escapeHtml(buildHistoryLine(history)) + '</div>' +
        (current.status !== 'green'
          ? '<div class="rag-super-tooltip-label">Path to green</div><div class="rag-super-tooltip-value">' + escapeHtml(current.path_to_green || 'Not provided') + '</div>'
          : '') +
      '</div>';
  }

  function positionTooltip(event) {
    var tooltip = ensureTooltip();
    if (tooltip.hidden) return;
    var offset = 14;
    var maxLeft = Math.max(8, window.innerWidth - tooltip.offsetWidth - 8);
    var maxTop = Math.max(8, window.innerHeight - tooltip.offsetHeight - 8);
    var left = Math.min(maxLeft, event.clientX + offset);
    var top = Math.min(maxTop, event.clientY + offset);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (loadDelayTimer) {
      window.clearTimeout(loadDelayTimer);
      loadDelayTimer = null;
    }
    activeAnchor = null;
    var tooltip = ensureTooltip();
    tooltip.hidden = true;
    tooltip.innerHTML = '';
  }

  function showLoading(taskName) {
    var tooltip = ensureTooltip();
    tooltip.innerHTML =
      '<div class="rag-super-tooltip-title">' + escapeHtml(taskName || 'RAG status') + '</div>' +
      '<div class="rag-super-tooltip-empty">Loading RAG details...</div>';
    tooltip.hidden = false;
  }

  function bind(anchor, options) {
    if (!anchor || !options || !options.taskUid) return;
    if (options.history) setCache(options.taskUid, options.history);

    function handleEnter(event) {
      if (loadDelayTimer) {
        window.clearTimeout(loadDelayTimer);
        loadDelayTimer = null;
      }
      activeAnchor = anchor;
      showLoading(options.taskName);
      positionTooltip(event);
      loadDelayTimer = window.setTimeout(function() {
        loadDelayTimer = null;
        getHistory(options.taskUid)
          .then(function(history) {
            if (activeAnchor !== anchor) return;
            renderTooltip(options.taskName, history);
            positionTooltip(event);
          })
          .catch(function() {
            if (activeAnchor !== anchor) return;
            var tooltip = ensureTooltip();
            tooltip.innerHTML =
              '<div class="rag-super-tooltip-title">' + escapeHtml(options.taskName || 'RAG status') + '</div>' +
              '<div class="rag-super-tooltip-empty">Unable to load RAG details</div>';
          });
      }, TOOLTIP_LOAD_DELAY_MS);
    }

    function handleFocus() {
      var rect = anchor.getBoundingClientRect();
      handleEnter({
        clientX: rect.left + Math.min(rect.width / 2, 100),
        clientY: rect.bottom
      });
    }

    anchor.addEventListener('mouseenter', handleEnter);
    anchor.addEventListener('mousemove', positionTooltip);
    anchor.addEventListener('mouseleave', hideTooltip);
    anchor.addEventListener('focus', handleFocus);
    anchor.addEventListener('blur', hideTooltip);
  }

  return {
    bind: bind,
    setCache: setCache
  };
})();
