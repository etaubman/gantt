window.Gantt = window.Gantt || {};

Gantt.gantt = (function() {
  var dayMs = 24 * 60 * 60 * 1000;
  var escapeHtml = function(s) { return Gantt.utils.escapeHtml(s); };
  var prettyDate = function(d) { return Gantt.utils.prettyDate(d); };
  var titleCaseStatus = function(status) { return Gantt.utils.titleCaseStatus(status); };

  function dateAtStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function buildTimeCells(minDate, end, PX_PER_DAY, stepMode) {
    var cells = [];
    var cursor;
    var next;
    var label;

    if (stepMode === 'days') {
      cursor = dateAtStart(minDate);
      while (cursor < end) {
        next = new Date(cursor.getTime() + dayMs);
        label = cursor.toLocaleDateString(undefined, { day: 'numeric' });
        cells.push({ width: Math.max(1, PX_PER_DAY), label: label });
        cursor = next;
      }
    } else if (stepMode === 'weeks') {
      cursor = dateAtStart(minDate);
      while (cursor < end) {
        next = new Date(cursor.getTime() + (7 * dayMs));
        label = cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - cursor) / dayMs) * PX_PER_DAY),
          label: label
        });
        cursor = next;
      }
    } else if (stepMode === 'months') {
      cursor = startOfMonth(minDate);
      while (cursor < end) {
        next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * PX_PER_DAY),
          label: cursor.toLocaleDateString(undefined, { month: 'short' })
        });
        cursor = next;
      }
    } else if (stepMode === 'quarters') {
      cursor = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      while (cursor < end) {
        next = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * PX_PER_DAY),
          label: 'Q' + (Math.floor(cursor.getMonth() / 3) + 1)
        });
        cursor = next;
      }
    } else {
      cursor = new Date(minDate.getFullYear(), 0, 1);
      while (cursor < end) {
        next = new Date(cursor.getFullYear() + 1, 0, 1);
        cells.push({
          width: Math.max(1, Math.round((Math.min(next, end) - Math.max(cursor, minDate)) / dayMs) * PX_PER_DAY),
          label: cursor.getFullYear().toString()
        });
        cursor = next;
      }
    }

    return cells;
  }

  function buildHeaderRows(zoom, minDate, totalDays, PX_PER_DAY) {
    var end = new Date(minDate.getTime() + totalDays * dayMs);
    if (zoom === 'days') {
      return {
        major: buildTimeCells(minDate, end, PX_PER_DAY, 'months'),
        minor: buildTimeCells(minDate, end, PX_PER_DAY, 'days')
      };
    }
    if (zoom === 'weeks') {
      return {
        major: buildTimeCells(minDate, end, PX_PER_DAY, 'months'),
        minor: buildTimeCells(minDate, end, PX_PER_DAY, 'weeks')
      };
    }
    if (zoom === 'months') {
      return {
        major: buildTimeCells(minDate, end, PX_PER_DAY, 'years'),
        minor: buildTimeCells(minDate, end, PX_PER_DAY, 'months')
      };
    }
    if (zoom === 'quarters') {
      return {
        major: buildTimeCells(minDate, end, PX_PER_DAY, 'years'),
        minor: buildTimeCells(minDate, end, PX_PER_DAY, 'quarters')
      };
    }
    return {
      major: buildTimeCells(minDate, end, PX_PER_DAY, 'years'),
      minor: buildTimeCells(minDate, end, PX_PER_DAY, 'years')
    };
  }

  function renderHeaderRows(headerEl, rows) {
    headerEl.innerHTML = '';
    ['major', 'minor'].forEach(function(key) {
      var rowEl = document.createElement('div');
      rowEl.className = 'gantt-header-row gantt-header-row-' + key;
      rows[key].forEach(function(cell) {
        var span = document.createElement('span');
        span.className = 'gantt-header-cell';
        span.style.width = cell.width + 'px';
        span.style.minWidth = cell.width + 'px';
        span.textContent = cell.label;
        rowEl.appendChild(span);
      });
      headerEl.appendChild(rowEl);
    });
  }

  function render(tree, taskRag, selectedTaskUid, onTaskSelect, onTaskOpenDetail) {
    var el = Gantt.state.getEl();
    var c = Gantt.state.getConstants();
    var PX_PER_DAY = c.PX_PER_DAY;
    var ROW_HEIGHT = c.ROW_HEIGHT;
    var zoom = Gantt.state.getTimelineZoom ? Gantt.state.getTimelineZoom() : 'months';
    if (!el.ganttHeader || !el.ganttBody) return;

    var minDate = null, maxDate = null;
    tree.forEach(function(t) {
      if (t.start_date) {
        var d = new Date(t.start_date);
        if (!minDate || d < minDate) minDate = d;
      }
      if (t.end_date) {
        var d2 = new Date(t.end_date);
        if (!maxDate || d2 > maxDate) maxDate = d2;
      }
    });
    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date(minDate.getTime() + 30 * dayMs);
    var minDateStart = dateAtStart(minDate);
    minDateStart = new Date(minDateStart.getTime() - (7 * dayMs));
    var maxDateEnd = dateAtStart(maxDate);
    maxDateEnd = new Date(maxDateEnd.getTime() + (14 * dayMs));
    var totalDays = Math.max(1, Math.ceil((maxDateEnd - minDateStart) / dayMs));
    var totalWidth = totalDays * PX_PER_DAY;

    var timelineInner = el.ganttTimelineInner || document.getElementById('gantt-timeline-inner');
    if (timelineInner) {
      timelineInner.style.minWidth = totalWidth + 'px';
      var existingToday = timelineInner.querySelector('.gantt-today-line');
      if (existingToday) existingToday.remove();
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var daysFromStart = (today - minDateStart) / dayMs;
      var todayPx = Math.round(daysFromStart * PX_PER_DAY);
      timelineInner.setAttribute('data-total-width', totalWidth);
      timelineInner.setAttribute('data-today-px', Math.max(0, Math.min(totalWidth, todayPx)));
      timelineInner.setAttribute('data-px-per-day', PX_PER_DAY);
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
    renderHeaderRows(el.ganttHeader, buildHeaderRows(zoom, minDateStart, totalDays, PX_PER_DAY));

    el.ganttBody.style.setProperty('--gantt-cell-width', PX_PER_DAY + 'px');
    el.ganttBody.style.setProperty('--gantt-row-height', ROW_HEIGHT + 'px');
    el.ganttBody.innerHTML = '';
    el.ganttBody.style.minWidth = totalWidth + 'px';
    tree.forEach(function(t) {
      var progress = Math.max(0, Math.min(100, t.progress != null ? t.progress : 0));
      var rag = taskRag[t.uid] || 'none';
      var tooltipLines = [
        t.name,
        t.description || 'No description',
        'Status: ' + titleCaseStatus(t.status || 'not_started'),
        'RAG: ' + titleCaseStatus(rag),
        'Progress: ' + progress + '%',
        'Accountable: ' + (t.accountable_person || 'Unassigned'),
        'Responsible: ' + (t.responsible_party || 'Unassigned'),
        'Dates: ' + ((t.start_date && t.end_date) ? (prettyDate(t.start_date) + ' - ' + prettyDate(t.end_date)) : 'Unscheduled')
      ];
      var row = document.createElement('div');
      row.className = 'gantt-row' + (selectedTaskUid === t.uid ? ' selected' : '');
      row.style.height = ROW_HEIGHT + 'px';
      row.setAttribute('data-uid', t.uid);
      var barWrap = document.createElement('div');
      barWrap.className = 'bar-wrap';
      barWrap.style.height = ROW_HEIGHT + 'px';
      barWrap.style.width = totalWidth + 'px';
      barWrap.style.position = 'relative';
      var left = 0, w = 0;
      if (t.start_date && t.end_date) {
        var start = new Date(t.start_date);
        var end = new Date(t.end_date);
        left = Math.max(0, (dateAtStart(start) - minDateStart) / dayMs) * PX_PER_DAY;
        w = Math.max(12, (Math.max(1, Math.round((dateAtStart(end) - dateAtStart(start)) / dayMs) + 1)) * PX_PER_DAY);
      } else {
        left = 0;
        w = Math.max(48, PX_PER_DAY * 7);
      }
      var bar = document.createElement('button');
      bar.className = 'bar rag-' + rag;
      bar.type = 'button';
      bar.style.left = left + 'px';
      bar.style.width = w + 'px';
      bar.innerHTML =
        '<span class="bar-label">' + escapeHtml(t.name) + '</span>' +
        '<span class="bar-meta">' + progress + '%</span>';
      bar.setAttribute('title', tooltipLines.join('\n'));
      bar.setAttribute('aria-label', t.name + ', ' + titleCaseStatus(t.status || 'not_started') + ', ' + progress + ' percent');
      if (progress > 0) {
        var progressEl = document.createElement('div');
        progressEl.className = 'bar-progress';
        progressEl.style.width = progress + '%';
        bar.appendChild(progressEl);
      }
      if (!t.start_date || !t.end_date) bar.classList.add('bar-unscheduled');
      var meta = document.createElement('div');
      meta.className = 'gantt-row-meta';
      meta.textContent = (t.start_date && t.end_date)
        ? prettyDate(t.start_date) + ' - ' + prettyDate(t.end_date)
        : 'Unscheduled task';
      meta.title = meta.textContent;
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      row.appendChild(meta);
      row.addEventListener('click', function() {
        if (onTaskSelect) onTaskSelect(t.uid);
      });
      bar.addEventListener('click', function(e) {
        e.stopPropagation();
        if (onTaskSelect) onTaskSelect(t.uid);
      });
      bar.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (onTaskOpenDetail) onTaskOpenDetail(t.uid);
      });
      el.ganttBody.appendChild(row);
    });
  }

  return { render: render };
})();
