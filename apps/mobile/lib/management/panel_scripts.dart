/// Native export handoff for download anchors only. The ERP revokes its blob
/// immediately after click(), before WebView can issue a download event.
/// Keep that blob alive briefly and hand off only its URL, never credentials.
const panelExportCompatibilityScript = r'''
(() => {
  if (window.__barbacuePanelExportNames instanceof Map) return;
  const exports = new Map();
  window.__barbacuePanelExportNames = exports;
  const mark = (anchor) => {
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.hasAttribute('download')) return false;
    const url = anchor.href;
    if (!url.startsWith('blob:' + location.origin + '/')) return false;
    const bridge = window.flutter_inappwebview;
    if (!bridge?.callHandler) return false;
    if (exports.has(url)) return true;
    if (exports.size >= 32) exports.delete(exports.keys().next().value);
    exports.set(url, anchor.download || 'relatorio.csv');
    setTimeout(() => exports.delete(url), 60000);
    bridge.callHandler('barbacueExport', url).catch(() => {});
    return true;
  };
  document.addEventListener('click', event => {
    if (mark(event.target.closest?.('a[download]'))) event.preventDefault();
  }, true);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (!mark(this)) return click.call(this);
  };
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function(url) {
    if (exports.has(url)) setTimeout(() => revoke(url), 60000);
    else revoke(url);
  };
})();
''';
