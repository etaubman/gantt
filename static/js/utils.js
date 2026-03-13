window.Gantt = window.Gantt || {};

Gantt.utils = (function() {
  function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function dateStr(d) {
    if (!d) return '—';
    return String(d).slice(0, 10);
  }

  function prettyDate(d) {
    if (!d) return 'No date';
    var value = new Date(d);
    if (isNaN(value.getTime())) return String(d);
    return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function shortDate(d) {
    if (!d) return '—';
    var value = new Date(d);
    if (isNaN(value.getTime())) return String(d).slice(0, 10);
    return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function titleCaseStatus(status) {
    if (!status) return 'Unknown';
    return String(status).split('_').map(function(part) {
      return part ? part.charAt(0).toUpperCase() + part.slice(1) : '';
    }).join(' ');
  }

  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 4000);
  }

  return {
    escapeHtml: escapeHtml,
    dateStr: dateStr,
    prettyDate: prettyDate,
    shortDate: shortDate,
    titleCaseStatus: titleCaseStatus,
    showToast: showToast
  };
})();
