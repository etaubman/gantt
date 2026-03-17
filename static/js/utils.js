window.Gantt = window.Gantt || {};

Gantt.utils = (function() {
  var toastContainer = null;

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

  function isTaskPastDue(task) {
    if (!task || !task.end_date) return false;
    if (task.status === 'complete' || task.status === 'cancelled') return false;
    var end = new Date(String(task.end_date).slice(0, 10));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return end.getTime() < today.getTime();
  }

  function ensureToastContainer() {
    if (toastContainer && toastContainer.isConnected) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-stack';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(msg, isError) {
    const stack = ensureToastContainer();
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    stack.appendChild(t);
    window.setTimeout(function() {
      t.classList.add('is-leaving');
      window.setTimeout(function() { t.remove(); }, 180);
    }, isError ? 4200 : 2600);
  }

  return {
    escapeHtml: escapeHtml,
    dateStr: dateStr,
    prettyDate: prettyDate,
    shortDate: shortDate,
    titleCaseStatus: titleCaseStatus,
    isTaskPastDue: isTaskPastDue,
    showToast: showToast
  };
})();
