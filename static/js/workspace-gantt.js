window.Gantt = window.Gantt || {};

Gantt.gantt = (function() {
  var dayMs = 24 * 60 * 60 * 1000;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };
  var activeTooltip = null;
  var tooltipHideTimer = null;

  function parseTaskDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getTime());
    var text = String(value).trim();
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function dateAtStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function buildTimeCells(minDate, end, pxPerDay, stepMode) {
    var cells = [];
    var cursor;
    var next;
    var label;
    var dayLabelEvery = 1;

    if (stepMode === 'days') {
      dayLabelEvery = pxPerDay >= 24 ? 1 : (pxPerDay >= 16 ? 2 : 3);
    }

    if (stepMode === 'days') {
      cursor = dateAtStart(minDate);
      var dayIndex = 0;
      while (cursor < end) {
        next = new Date(cursor.getTime() + dayMs);
        label = dayIndex % dayLabelEvery === 0
          ? cursor.toLocaleDateString(undefined, { day: 'numeric' })
          : '';
        cells.push({
          width: Math.max(1, pxPerDay),
          label: label,
          title: cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
          isDayCell: true
        });
        cursor = next;
        dayIndex += 1;
      }
    } else if (stepMode === 'weeks') {
      cursor = dateAtStart(minDate);
      while (cursor < end) {
        next = new Date(cursor.getTime() + (7 * dayMs));
        label = cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - cursor) / dayMs) * pxPerDay),
          label: label
        });
        cursor = next;
      }
    } else if (stepMode === 'months') {
      cursor = startOfMonth(minDate);
      while (cursor < end) {
        next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * pxPerDay),
          label: cursor.toLocaleDateString(undefined, { month: 'short' })
        });
        cursor = next;
      }
    } else if (stepMode === 'quarters') {
      cursor = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      while (cursor < end) {
        next = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * pxPerDay),
          label: 'Q' + (Math.floor(cursor.getMonth() / 3) + 1)
        });
        cursor = next;
      }
    } else {
      cursor = new Date(minDate.getFullYear(), 0, 1);
      while (cursor < end) {
        next = new Date(cursor.getFullYear() + 1, 0, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * pxPerDay),
          label: cursor.getFullYear().toString()
        });
        cursor = next;
      }
    }

    return cells;
  }

  function buildHeaderRows(zoom, minDate, totalDays, pxPerDay) {
    var end = new Date(minDate.getTime() + totalDays * dayMs);
    if (zoom === 'days') {
      return {
        major: buildTimeCells(minDate, end, pxPerDay, 'months'),
        minor: buildTimeCells(minDate, end, pxPerDay, 'days')
      };
    }
    if (zoom === 'weeks') {
      return {
        major: buildTimeCells(minDate, end, pxPerDay, 'months'),
        minor: buildTimeCells(minDate, end, pxPerDay, 'weeks')
      };
    }
    if (zoom === 'months') {
      return {
        major: buildTimeCells(minDate, end, pxPerDay, 'years'),
        minor: buildTimeCells(minDate, end, pxPerDay, 'months')
      };
    }
    if (zoom === 'quarters') {
      return {
        major: buildTimeCells(minDate, end, pxPerDay, 'years'),
        minor: buildTimeCells(minDate, end, pxPerDay, 'quarters')
      };
    }
    return {
      major: buildTimeCells(minDate, end, pxPerDay, 'years'),
      minor: buildTimeCells(minDate, end, pxPerDay, 'years')
    };
  }

  function renderHeaderRows(headerEl, rows) {
    headerEl.innerHTML = '';
    ['major', 'minor'].forEach(function(key) {
      var rowEl = document.createElement('div');
      rowEl.className = 'gantt-header-row gantt-header-row-' + key;
      rows[key].forEach(function(cell) {
        var span = document.createElement('span');
        span.className = 'gantt-header-cell' + (cell.isDayCell ? ' gantt-header-cell-day' : '');
        span.style.width = cell.width + 'px';
        span.style.minWidth = cell.width + 'px';
        span.textContent = cell.label;
        if (cell.title) span.title = cell.title;
        rowEl.appendChild(span);
      });
      headerEl.appendChild(rowEl);
    });
  }

  function createSvgEl(name) {
    return document.createElementNS(SVG_NS, name);
  }

  function buildDependencyOverlay(totalWidth, totalHeight) {
    var overlay = createSvgEl('svg');
    overlay.setAttribute('class', 'gantt-dependency-overlay');
    overlay.setAttribute('width', totalWidth);
    overlay.setAttribute('height', totalHeight);
    overlay.setAttribute('viewBox', '0 0 ' + totalWidth + ' ' + totalHeight);
    overlay.setAttribute('aria-hidden', 'true');

    var defs = createSvgEl('defs');

    var incomingArrow = createSvgEl('marker');
    incomingArrow.setAttribute('id', 'gantt-dep-arrow-incoming');
    incomingArrow.setAttribute('markerWidth', '10');
    incomingArrow.setAttribute('markerHeight', '10');
    incomingArrow.setAttribute('refX', '8');
    incomingArrow.setAttribute('refY', '5');
    incomingArrow.setAttribute('orient', 'auto');
    var incomingArrowPath = createSvgEl('path');
    incomingArrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    incomingArrowPath.setAttribute('fill', '#f6c453');
    incomingArrow.appendChild(incomingArrowPath);

    var outgoingArrow = createSvgEl('marker');
    outgoingArrow.setAttribute('id', 'gantt-dep-arrow-outgoing');
    outgoingArrow.setAttribute('markerWidth', '10');
    outgoingArrow.setAttribute('markerHeight', '10');
    outgoingArrow.setAttribute('refX', '8');
    outgoingArrow.setAttribute('refY', '5');
    outgoingArrow.setAttribute('orient', 'auto');
    var outgoingArrowPath = createSvgEl('path');
    outgoingArrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    outgoingArrowPath.setAttribute('fill', '#77b6ff');
    outgoingArrow.appendChild(outgoingArrowPath);

    var incomingDot = createSvgEl('marker');
    incomingDot.setAttribute('id', 'gantt-dep-dot-incoming');
    incomingDot.setAttribute('markerWidth', '8');
    incomingDot.setAttribute('markerHeight', '8');
    incomingDot.setAttribute('refX', '4');
    incomingDot.setAttribute('refY', '4');
    var incomingDotCircle = createSvgEl('circle');
    incomingDotCircle.setAttribute('cx', '4');
    incomingDotCircle.setAttribute('cy', '4');
    incomingDotCircle.setAttribute('r', '2.5');
    incomingDotCircle.setAttribute('fill', '#f6c453');
    incomingDot.appendChild(incomingDotCircle);

    var outgoingDot = createSvgEl('marker');
    outgoingDot.setAttribute('id', 'gantt-dep-dot-outgoing');
    outgoingDot.setAttribute('markerWidth', '8');
    outgoingDot.setAttribute('markerHeight', '8');
    outgoingDot.setAttribute('refX', '4');
    outgoingDot.setAttribute('refY', '4');
    var outgoingDotCircle = createSvgEl('circle');
    outgoingDotCircle.setAttribute('cx', '4');
    outgoingDotCircle.setAttribute('cy', '4');
    outgoingDotCircle.setAttribute('r', '2.5');
    outgoingDotCircle.setAttribute('fill', '#77b6ff');
    outgoingDot.appendChild(outgoingDotCircle);

    defs.appendChild(incomingArrow);
    defs.appendChild(outgoingArrow);
    defs.appendChild(incomingDot);
    defs.appendChild(outgoingDot);
    overlay.appendChild(defs);
    return overlay;
  }

  function clearDependencyHover(overlay, geometryByUid) {
    if (overlay) {
      var toRemove = [];
      for (var i = 1; i < overlay.childNodes.length; i++) {
        var node = overlay.childNodes[i];
        var cls = node.getAttribute ? node.getAttribute('class') || '' : '';
        if (cls.indexOf('gantt-dependency-drawing') === -1) {
          toRemove.push(node);
        }
      }
      toRemove.forEach(function(n) { overlay.removeChild(n); });
    }
    Object.keys(geometryByUid).forEach(function(uid) {
      var item = geometryByUid[uid];
      if (!item) return;
      item.row.classList.remove('dependency-row-active', 'dependency-row-related');
      item.bar.classList.remove('dependency-bar-active', 'dependency-bar-related');
    });
  }

  function buildDependencyPath(fromGeom, toGeom, offsetIndex) {
    var verticalOffset = (offsetIndex - 1.5) * 6;
    var startX = fromGeom.left + fromGeom.width;
    var endX = toGeom.left;
    var startY = fromGeom.centerY + verticalOffset;
    var endY = toGeom.centerY + verticalOffset;
    var bend = Math.max(42, Math.abs(endX - startX) * 0.35);
    var c1x = startX + bend;
    var c2x = endX - bend;
    return 'M ' + startX + ' ' + startY + ' C ' + c1x + ' ' + startY + ', ' + c2x + ' ' + endY + ', ' + endX + ' ' + endY;
  }

  function showDependencyHover(taskUid, dependencies, geometryByUid, overlay) {
    clearDependencyHover(overlay, geometryByUid);
    var hovered = geometryByUid[taskUid];
    if (!hovered) return;

    hovered.row.classList.add('dependency-row-active');
    hovered.bar.classList.add('dependency-bar-active');

    var visibleLinks = dependencies.filter(function(dep) {
      if (dep.predecessor_task_uid !== taskUid && dep.successor_task_uid !== taskUid) return false;
      return geometryByUid[dep.predecessor_task_uid] && geometryByUid[dep.successor_task_uid];
    });

    visibleLinks.forEach(function(dep, index) {
      var fromGeom = geometryByUid[dep.predecessor_task_uid];
      var toGeom = geometryByUid[dep.successor_task_uid];
      var incoming = dep.successor_task_uid === taskUid;
      var path = createSvgEl('path');
      path.setAttribute('class', 'gantt-dependency-link ' + (incoming ? 'incoming' : 'outgoing'));
      path.setAttribute('d', buildDependencyPath(fromGeom, toGeom, index));
      path.setAttribute('marker-start', incoming ? 'url(#gantt-dep-dot-incoming)' : 'url(#gantt-dep-dot-outgoing)');
      path.setAttribute('marker-end', incoming ? 'url(#gantt-dep-arrow-incoming)' : 'url(#gantt-dep-arrow-outgoing)');
      overlay.appendChild(path);

      fromGeom.row.classList.add('dependency-row-related');
      fromGeom.bar.classList.add('dependency-bar-related');
      toGeom.row.classList.add('dependency-row-related');
      toGeom.bar.classList.add('dependency-bar-related');
    });
  }

  function ensureTooltip() {
    if (activeTooltip && document.body.contains(activeTooltip)) return activeTooltip;
    activeTooltip = document.createElement('div');
    activeTooltip.className = 'gantt-super-tooltip';
    activeTooltip.hidden = true;
    activeTooltip.addEventListener('mouseenter', function() {
      if (tooltipHideTimer) {
        window.clearTimeout(tooltipHideTimer);
        tooltipHideTimer = null;
      }
    });
    activeTooltip.addEventListener('mouseleave', function() {
      hideTooltip();
    });
    document.body.appendChild(activeTooltip);
    return activeTooltip;
  }

  function positionTooltip(tooltip, event) {
    if (!tooltip || !event) return;
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
    if (tooltipHideTimer) window.clearTimeout(tooltipHideTimer);
    tooltipHideTimer = window.setTimeout(function() {
      var tooltip = ensureTooltip();
      tooltip.hidden = true;
      tooltip.innerHTML = '';
    }, 160);
  }

  function showTooltip(event, task, rag, progress) {
    var tooltip = ensureTooltip();
    if (tooltipHideTimer) {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
    var description = task.description || 'No description';
    var dateLabel = (task.start_date && task.end_date)
      ? (task.is_milestone ? prettyDate(task.start_date) : (prettyDate(task.start_date) + ' - ' + prettyDate(task.end_date)))
      : 'Unscheduled';
    tooltip.innerHTML =
      '<div class="gantt-super-tooltip-title">' + escapeHtml(task.name) + '</div>' +
      '<div class="gantt-super-tooltip-desc">' + escapeHtml(description) + '</div>' +
      '<div class="gantt-super-tooltip-grid">' +
        '<div class="gantt-super-tooltip-label">Type</div><div class="gantt-super-tooltip-value">' + (task.is_milestone ? 'Milestone' : 'Task') + '</div>' +
        '<div class="gantt-super-tooltip-label">Status</div><div class="gantt-super-tooltip-value">' + escapeHtml(titleCaseStatus(task.status || 'not_started')) + '</div>' +
        '<div class="gantt-super-tooltip-label">RAG</div><div class="gantt-super-tooltip-value">' + escapeHtml(titleCaseStatus(rag)) + '</div>' +
        '<div class="gantt-super-tooltip-label">Progress</div><div class="gantt-super-tooltip-value">' + progress + '%</div>' +
        '<div class="gantt-super-tooltip-label">Dates</div><div class="gantt-super-tooltip-value">' + escapeHtml(dateLabel) + '</div>' +
        '<div class="gantt-super-tooltip-label">Accountable</div><div class="gantt-super-tooltip-value">' + escapeHtml(task.accountable_person || 'Unassigned') + '</div>' +
        '<div class="gantt-super-tooltip-label">Responsible</div><div class="gantt-super-tooltip-value">' + escapeHtml(task.responsible_party || 'Unassigned') + '</div>' +
      '</div>';
    tooltip.hidden = false;
    positionTooltip(tooltip, event);
  }

  function pxToDate(px, minDateStart, pxPerDay) {
    var days = px / pxPerDay;
    return new Date(minDateStart.getTime() + days * dayMs);
  }

  function dateToPx(d, minDateStart, pxPerDay) {
    return ((dateAtStart(d) - minDateStart) / dayMs) * pxPerDay;
  }

  function formatDateForTooltip(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  function showDateTooltip(event, startDate, endDate, isMilestone) {
    var tooltip = ensureTooltip();
    if (tooltipHideTimer) { window.clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
    var label = isMilestone ? formatDateForTooltip(startDate) : formatDateForTooltip(startDate) + ' – ' + formatDateForTooltip(endDate);
    tooltip.innerHTML = '<div class="gantt-super-tooltip-title">' + escapeHtml(label) + '</div>';
    tooltip.hidden = false;
    positionTooltip(tooltip, event);
  }

  function render(tree, taskRag, selectedTaskUid, onTaskSelect, onTaskOpenDetail, isTimelineEdit, onTaskDateChange, onDependencyCreate) {
    var el = Gantt.state.getEl();
    var c = Gantt.state.getConstants();
    var basePxPerDay = c.PX_PER_DAY;
    var ROW_HEIGHT = c.ROW_HEIGHT;
    var dependencies = Gantt.state.getDependencies ? Gantt.state.getDependencies() : [];
    var zoom = Gantt.state.getTimelineZoom ? Gantt.state.getTimelineZoom() : 'months';
    if (!el.ganttHeader || !el.ganttBody) return;

    var minDate = null, maxDate = null;
    tree.forEach(function(t) {
      if (t.start_date) {
        var d = parseTaskDate(t.start_date);
        if (d && (!minDate || d < minDate)) minDate = d;
      }
      if (t.end_date) {
        var d2 = parseTaskDate(t.end_date);
        if (d2 && (!maxDate || d2 > maxDate)) maxDate = d2;
      }
    });
    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate.getTime() + 30 * dayMs);
    var minDateStart = dateAtStart(minDate);
    minDateStart = new Date(minDateStart.getTime() - (7 * dayMs));
    var maxDateEnd = dateAtStart(maxDate);
    maxDateEnd = new Date(maxDateEnd.getTime() + (14 * dayMs));
    var totalDays = Math.max(1, Math.ceil((maxDateEnd - minDateStart) / dayMs));
    var wrapWidth = el.ganttScrollWrap ? el.ganttScrollWrap.clientWidth : 0;
    var pxPerDay = basePxPerDay;
    if (wrapWidth > 0) {
      pxPerDay = Math.max(basePxPerDay, wrapWidth / totalDays);
    }
    var totalWidth = totalDays * pxPerDay;
    var gridStepDays = zoom === 'days' ? 1 : 7;
    var gridColumnWidth = pxPerDay * gridStepDays;

    var timelineInner = el.ganttTimelineInner || document.getElementById('gantt-timeline-inner');
    if (timelineInner) {
      timelineInner.style.minWidth = totalWidth + 'px';
      var existingToday = timelineInner.querySelector('.gantt-today-line');
      if (existingToday) existingToday.remove();
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var daysFromStart = (today - minDateStart) / dayMs;
      var todayPx = Math.round((daysFromStart * pxPerDay) + (pxPerDay / 2));
      timelineInner.setAttribute('data-total-width', totalWidth);
      timelineInner.setAttribute('data-today-px', Math.max(0, Math.min(totalWidth, todayPx)));
      timelineInner.setAttribute('data-px-per-day', pxPerDay);
      if (todayPx >= 0 && todayPx < totalWidth) {
        var todayLine = document.createElement('div');
        var headerHeight = ROW_HEIGHT;
        var bodyHeight = tree.length * ROW_HEIGHT;
        todayLine.className = 'gantt-today-line';
        todayLine.style.left = todayPx + 'px';
        todayLine.style.top = '0';
        todayLine.style.height = (headerHeight + bodyHeight) + 'px';
        todayLine.setAttribute('aria-hidden', 'true');
        timelineInner.appendChild(todayLine);
      }
    }

    var dateRangeEl = el.ganttDateRange || document.getElementById('gantt-date-range');
    if (dateRangeEl) {
      dateRangeEl.textContent = minDateStart.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' - ' + maxDateEnd.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    el.ganttHeader.style.minWidth = totalWidth + 'px';
    renderHeaderRows(el.ganttHeader, buildHeaderRows(zoom, minDateStart, totalDays, pxPerDay));

    el.ganttBody.style.setProperty('--gantt-cell-width', pxPerDay + 'px');
    el.ganttBody.style.setProperty('--gantt-grid-column-width', gridColumnWidth + 'px');
    el.ganttBody.style.setProperty('--gantt-row-height', ROW_HEIGHT + 'px');
    el.ganttBody.innerHTML = '';
    el.ganttBody.style.minWidth = totalWidth + 'px';
    var geometryByUid = {};
    var dependencyOverlay = buildDependencyOverlay(totalWidth, Math.max(tree.length * ROW_HEIGHT, ROW_HEIGHT));
    tree.forEach(function(t, index) {
      var progress = Math.max(0, Math.min(100, t.progress != null ? t.progress : 0));
      var rag = taskRag[t.uid] || 'none';
      var isMilestone = !!t.is_milestone;
      var isCancelled = t.status === 'cancelled';
      var row = document.createElement('div');
      row.className = 'gantt-row' + (selectedTaskUid === t.uid ? ' selected' : '') + (isCancelled ? ' cancelled' : '');
      row.style.height = ROW_HEIGHT + 'px';
      row.setAttribute('data-uid', t.uid);
      var barWrap = document.createElement('div');
      barWrap.className = 'bar-wrap';
      barWrap.style.height = ROW_HEIGHT + 'px';
      barWrap.style.width = totalWidth + 'px';
      barWrap.style.position = 'relative';
      var left = 0, w = 0;
      if (t.start_date && t.end_date) {
        var start = parseTaskDate(t.start_date);
        var end = parseTaskDate(t.end_date);
        if (start && end) {
          left = Math.max(0, (dateAtStart(start) - minDateStart) / dayMs) * pxPerDay;
          w = isMilestone
            ? Math.max(18, Math.min(24, pxPerDay * 0.9))
            : Math.max(12, (Math.max(1, Math.round((dateAtStart(end) - dateAtStart(start)) / dayMs) + 1)) * pxPerDay);
        }
      } else {
        left = 0;
        w = isMilestone ? 18 : Math.max(48, pxPerDay * 7);
      }
      var bar = document.createElement('button');
      bar.className = 'bar rag-' + rag + (isMilestone ? ' milestone' : '') + (isCancelled ? ' cancelled' : '');
      bar.type = 'button';
      if (isMilestone) {
        var milestoneCenter = left + (pxPerDay / 2);
        bar.style.left = Math.max(0, milestoneCenter - (w / 2)) + 'px';
        bar.style.width = w + 'px';
        bar.style.height = w + 'px';
        bar.style.top = Math.max(4, (ROW_HEIGHT - w) / 2) + 'px';
        bar.innerHTML = '<span class="bar-milestone-core" aria-hidden="true"></span>';
      } else {
        bar.style.left = left + 'px';
        bar.style.width = w + 'px';
        bar.innerHTML =
          '<span class="bar-label' + (isCancelled ? ' is-cancelled' : '') + '">' + escapeHtml(t.name) + '</span>' +
          '<span class="bar-meta">' + progress + '%</span>';
      }
      bar.setAttribute('aria-label', t.name + ', ' + (isMilestone ? 'milestone, ' : '') + titleCaseStatus(t.status || 'not_started') + ', ' + progress + ' percent');
      if (!isMilestone && progress > 0) {
        var progressEl = document.createElement('div');
        progressEl.className = 'bar-progress';
        progressEl.style.width = progress + '%';
        bar.appendChild(progressEl);
      }
      if (!t.start_date || !t.end_date) bar.classList.add('bar-unscheduled');
      if (isMilestone) {
        var milestoneLabel = document.createElement('div');
        milestoneLabel.className = 'gantt-milestone-label';
        if (isCancelled) milestoneLabel.classList.add('is-cancelled');
        milestoneLabel.textContent = t.name;
        milestoneLabel.style.left = (parseFloat(bar.style.left) + w + 10) + 'px';
        milestoneLabel.title = t.name;
        barWrap.appendChild(milestoneLabel);
      }
      var meta = document.createElement('div');
      meta.className = 'gantt-row-meta';
      meta.textContent = (t.start_date && t.end_date)
        ? (isMilestone ? prettyDate(t.start_date) : prettyDate(t.start_date) + ' - ' + prettyDate(t.end_date))
        : (isMilestone ? 'Unscheduled milestone' : 'Unscheduled task');
      meta.title = meta.textContent;
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      row.appendChild(meta);
      geometryByUid[t.uid] = {
        row: row,
        bar: bar,
        left: parseFloat(bar.style.left) || left,
        width: w,
        centerY: (index * ROW_HEIGHT) + (ROW_HEIGHT / 2)
      };
      row.addEventListener('click', function() {
        if (onTaskSelect) onTaskSelect(t.uid);
      });
      row.addEventListener('mouseenter', function() {
        showDependencyHover(t.uid, dependencies, geometryByUid, dependencyOverlay);
      });
      row.addEventListener('mouseleave', function() {
        clearDependencyHover(dependencyOverlay, geometryByUid);
      });
      bar.addEventListener('click', function(e) {
        e.stopPropagation();
        if (onTaskSelect) onTaskSelect(t.uid);
      });
      bar.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (onTaskOpenDetail) onTaskOpenDetail(t.uid);
      });
      bar.addEventListener('mouseenter', function(e) {
        showDependencyHover(t.uid, dependencies, geometryByUid, dependencyOverlay);
        if (!isTimelineEdit) showTooltip(e, t, rag, progress);
      });
      bar.addEventListener('mousemove', function(e) {
        if (!isTimelineEdit) positionTooltip(ensureTooltip(), e);
      });
      bar.addEventListener('mouseleave', function() {
        if (!isTimelineEdit) hideTooltip();
      });
      bar.addEventListener('focus', function() {
        showDependencyHover(t.uid, dependencies, geometryByUid, dependencyOverlay);
        if (!isTimelineEdit) {
          var rect = bar.getBoundingClientRect();
          showTooltip({
            clientX: rect.left + Math.min(rect.width / 2, 120),
            clientY: rect.bottom
          }, t, rag, progress);
        }
      });
      bar.addEventListener('blur', function() {
        if (!isTimelineEdit) hideTooltip();
        clearDependencyHover(dependencyOverlay, geometryByUid);
      });

      if (isTimelineEdit && onTaskDateChange && !isCancelled) {
        var geom = geometryByUid[t.uid];
        var barLeft = left;
        var barWidth = w;
        var taskStart = t.start_date ? parseTaskDate(t.start_date) : null;
        var taskEnd = t.end_date ? parseTaskDate(t.end_date) : null;
        var DOT_OFFSET = 10;

        function updateDotPositions() {
          if (leftDot) {
            leftDot.style.left = (barLeft - DOT_OFFSET) + 'px';
          }
          if (rightDot) {
            rightDot.style.left = (barLeft + barWidth + DOT_OFFSET) + 'px';
          }
        }

        var leftDot = null;
        var rightDot = null;
        if (!isMilestone && taskStart && taskEnd) {
          leftDot = document.createElement('div');
          leftDot.className = 'gantt-dep-dot gantt-dep-dot-left';
          leftDot.setAttribute('data-uid', t.uid);
          leftDot.setAttribute('data-side', 'left');
          leftDot.title = 'Drag to create dependency (this task as successor)';
          leftDot.style.left = (barLeft - DOT_OFFSET) + 'px';
          leftDot.style.top = (ROW_HEIGHT / 2 - 6) + 'px';
          barWrap.appendChild(leftDot);

          rightDot = document.createElement('div');
          rightDot.className = 'gantt-dep-dot gantt-dep-dot-right';
          rightDot.setAttribute('data-uid', t.uid);
          rightDot.setAttribute('data-side', 'right');
          rightDot.title = 'Drag to create dependency (this task as predecessor)';
          rightDot.style.left = (barLeft + barWidth + DOT_OFFSET) + 'px';
          rightDot.style.top = (ROW_HEIGHT / 2 - 6) + 'px';
          barWrap.appendChild(rightDot);

          setupDependencyDotHandlers(rightDot, leftDot, t.uid, geometryByUid, dependencyOverlay, onDependencyCreate, ROW_HEIGHT, DOT_OFFSET, geom.centerY, createSvgEl);
        }

        var edgeResizeZone = 8;
        var isResizing = false;
        var isMoving = false;
        var resizeSide = null;
        var startX = 0;
        var startLeft = 0;
        var startWidth = 0;
        var startLeftDateVal = taskStart || null;
        var startRightDateVal = taskEnd || null;
        var isUnscheduled = !taskStart || !taskEnd;
        var unscheduledDefaultDays = 7;

        function startBarDrag(e) {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          if (leftDot && rightDot && (e.target === leftDot || e.target === rightDot)) return;
          if (isUnscheduled) {
            isMoving = true;
            startLeftDateVal = startLeftDateVal || new Date();
            startRightDateVal = startRightDateVal || new Date(startLeftDateVal.getTime() + unscheduledDefaultDays * dayMs);
          } else {
            var rect = bar.getBoundingClientRect();
            var localX = e.clientX - rect.left;
            if (localX < edgeResizeZone) {
              isResizing = true;
              resizeSide = 'left';
            } else if (localX > rect.width - edgeResizeZone) {
              isResizing = true;
              resizeSide = 'right';
            } else {
              isMoving = true;
            }
          }
          startX = e.clientX;
          startLeft = barLeft;
          startWidth = barWidth;
          document.addEventListener('mousemove', onBarDragMove);
          document.addEventListener('mouseup', onBarDragEnd);
        }

        function onBarDragMove(e) {
          var deltaPx = e.clientX - startX;
          var deltaDays = deltaPx / pxPerDay;
          if (isMoving) {
            var newLeft = Math.max(0, startLeft + deltaPx);
            var newLeftDate = new Date(startLeftDateVal.getTime() + deltaDays * dayMs);
            var newRightDate = new Date(startRightDateVal.getTime() + deltaDays * dayMs);
            bar.style.left = newLeft + 'px';
            barLeft = newLeft;
            updateDotPositions();
            showDateTooltip(e, newLeftDate, newRightDate, false);
          } else if (isResizing && resizeSide === 'left') {
            var newLeft = Math.max(0, Math.min(startLeft + startWidth - pxPerDay, startLeft + deltaPx));
            var newWidth = startLeft + startWidth - newLeft;
            if (newWidth < pxPerDay) return;
            var newLeftDate = pxToDate(newLeft, minDateStart, pxPerDay);
            bar.style.left = newLeft + 'px';
            bar.style.width = newWidth + 'px';
            barLeft = newLeft;
            barWidth = newWidth;
            updateDotPositions();
            showDateTooltip(e, newLeftDate, startRightDateVal, false);
          } else if (isResizing && resizeSide === 'right') {
            var newWidth = Math.max(pxPerDay, startWidth + deltaPx);
            var newRightDate = pxToDate(startLeft + newWidth, minDateStart, pxPerDay);
            bar.style.width = newWidth + 'px';
            barWidth = newWidth;
            updateDotPositions();
            showDateTooltip(e, startLeftDateVal, newRightDate, false);
          }
        }

        function onBarDragEnd(e) {
          document.removeEventListener('mousemove', onBarDragMove);
          document.removeEventListener('mouseup', onBarDragEnd);
          hideTooltip();
          if (!isMoving && !isResizing) return;
          var newStart, newEnd;
          if (isMoving) {
            newStart = new Date(startLeftDateVal.getTime() + ((barLeft - startLeft) / pxPerDay) * dayMs);
            newEnd = new Date(startRightDateVal.getTime() + ((barLeft - startLeft) / pxPerDay) * dayMs);
          } else {
            newStart = resizeSide === 'left' ? pxToDate(barLeft, minDateStart, pxPerDay) : startLeftDateVal;
            newEnd = resizeSide === 'right' ? pxToDate(barLeft + barWidth, minDateStart, pxPerDay) : startRightDateVal;
          }
          var startStr = dateAtStart(newStart).toISOString().slice(0, 10);
          var endStr = dateAtStart(newEnd).toISOString().slice(0, 10);
          onTaskDateChange(t.uid, startStr, endStr);
          isMoving = false;
          isResizing = false;
        }

        bar.addEventListener('mousedown', startBarDrag);
        bar.style.cursor = 'grab';
      } else if (isTimelineEdit && onTaskDateChange && isMilestone && !isCancelled) {
        var startX = 0;
        var startLeft = 0;
        var mStartDate = t.start_date ? parseTaskDate(t.start_date) : new Date();
        bar.addEventListener('mousedown', function(e) {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          startX = e.clientX;
          startLeft = parseFloat(bar.style.left) || left;
          document.addEventListener('mousemove', onMilestoneMove);
          document.addEventListener('mouseup', onMilestoneEnd);
        });
        function onMilestoneMove(e) {
          var deltaPx = e.clientX - startX;
          var newLeft = Math.max(0, startLeft + deltaPx);
          var newDate = pxToDate(newLeft + w / 2, minDateStart, pxPerDay);
          bar.style.left = newLeft + 'px';
          showDateTooltip(e, newDate, newDate, true);
        }
        function onMilestoneEnd() {
          document.removeEventListener('mousemove', onMilestoneMove);
          document.removeEventListener('mouseup', onMilestoneEnd);
          hideTooltip();
          var newLeft = parseFloat(bar.style.left) || left;
          var newDate = pxToDate(newLeft + w / 2, minDateStart, pxPerDay);
          var startStr = dateAtStart(newDate).toISOString().slice(0, 10);
          onTaskDateChange(t.uid, startStr, startStr);
        }
        bar.style.cursor = 'grab';
      }

      el.ganttBody.appendChild(row);
    });

    el.ganttBody.appendChild(dependencyOverlay);
  }

  function setupDependencyDotHandlers(rightDotEl, leftDotEl, taskUid, geometryByUid, overlay, onDependencyCreate, rowHeight, dotOffset, centerY, createSvg) {
    var drawingFrom = null;
    var tempPath = null;

    rightDotEl.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var fromGeom = geometryByUid[taskUid];
      if (!fromGeom) return;
      drawingFrom = { uid: taskUid, side: 'right' };
      var startX = fromGeom.left + fromGeom.width + (dotOffset || 0);
      var startY = centerY;
      tempPath = createSvg('path');
      tempPath.setAttribute('class', 'gantt-dependency-link gantt-dependency-drawing');
      tempPath.setAttribute('stroke', '#77b6ff');
      tempPath.setAttribute('fill', 'none');
      tempPath.setAttribute('stroke-width', '2.5');
      tempPath.setAttribute('d', 'M ' + startX + ' ' + startY + ' L ' + startX + ' ' + startY);
      overlay.appendChild(tempPath);
      document.addEventListener('mousemove', onDepDrawMove);
      document.addEventListener('mouseup', onDepDrawEnd);
    });

    function onDepDrawMove(e) {
      if (!drawingFrom || !tempPath) return;
      var fromGeom = geometryByUid[drawingFrom.uid];
      if (!fromGeom) return;
      var scrollWrap = overlay.closest('.gantt-scroll-wrap');
      var scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;
      var rect = overlay.getBoundingClientRect();
      var x = e.clientX - rect.left + scrollLeft;
      var y = e.clientY - rect.top;
      var startX = fromGeom.left + fromGeom.width + (dotOffset || 0);
      var startY = centerY;
      var bend = Math.max(42, Math.abs(x - startX) * 0.35);
      var c1x = startX + bend;
      var c2x = x - bend;
      var d = 'M ' + startX + ' ' + startY + ' C ' + c1x + ' ' + startY + ', ' + c2x + ' ' + y + ', ' + x + ' ' + y;
      tempPath.setAttribute('d', d);
    }

    function onDepDrawEnd(e) {
      document.removeEventListener('mousemove', onDepDrawMove);
      document.removeEventListener('mouseup', onDepDrawEnd);
      if (tempPath && tempPath.parentNode) tempPath.parentNode.removeChild(tempPath);
      tempPath = null;
      if (!drawingFrom) return;
      var target = document.elementFromPoint(e.clientX, e.clientY);
      var leftDot = target && target.closest('.gantt-dep-dot-left');
      if (leftDot) {
        var targetUid = leftDot.getAttribute('data-uid');
        if (targetUid && targetUid !== drawingFrom.uid) {
          onDependencyCreate(drawingFrom.uid, targetUid);
        }
      }
      drawingFrom = null;
    }
  }


  return { render: render };
})();
