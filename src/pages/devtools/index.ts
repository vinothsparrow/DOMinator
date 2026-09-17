try {
  chrome.devtools.panels.create('DOMinator', 'icon32.png', 'src/pages/panel/index.html');
} catch (e) {
  console.error(e);
}
