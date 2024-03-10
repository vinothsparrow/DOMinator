try {
  chrome.devtools.panels.create('DOMinator', 'icon34.png', 'src/pages/panel/index.html');
} catch (e) {
  console.error(e);
}
