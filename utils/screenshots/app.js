// Loaded with `defer`, the way most sites register their handlers: from a bundle
// that runs after the document has parsed.
window.addEventListener('message', function onWidgetResize(event) {
  // A prefix check, which startsWith makes bypassable by https://demo-shop.test.evil.com
  if (!String(event.origin).startsWith('https://demo-shop.test')) return;
  const data = event.data || {};
  if (data.type === 'resize') {
    document.getElementById('pay').style.height = data.height + 'px';
  }
});

window.addEventListener('message', function onBanner(event) {
  // No origin check, straight into innerHTML.
  const data = event.data || {};
  if (data.type === 'banner') {
    document.getElementById('widget-output').innerHTML = data.html;
  }
});

window.onmessage = function onLegacy(event) {
  if (event.data && event.data.type === 'navigate') {
    location.href = event.data.url;
  }
};

window.addEventListener('message', function onTracking(event) {
  const data = event.data || {};
  if (data.type === 'track') {
    // Two more sinks, so the Findings tab is not one sink repeated.
    document.cookie = 'last_campaign=' + data.campaign;
    localStorage.setItem('campaign', data.campaign);
  }
});

let tick = 0;
setInterval(function () {
  tick += 1;
  window.postMessage({ type: 'banner', html: '<em>' + tick + ' items</em> reserved for 10 minutes' }, '*');
  window.postMessage({ type: 'resize', height: 140 + tick }, '*');
  window.postMessage({ type: 'track', campaign: 'summer-' + tick }, '*');
}, 4000);
