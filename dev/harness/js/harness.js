// Dev harness: shows the host and proves evalScript works. The Node runner (tools/host-run.mjs)
// connects over CDP and calls CSInterface.evalScript in this page.
(function () {
  var cs = new CSInterface();
  var env = cs.getHostEnvironment();
  document.getElementById('host').textContent = env.appName + ' ' + env.appVersion;
  cs.evalScript('String(app.version)', function (r) {
    document.getElementById('status').textContent = 'evalScript OK: ' + r;
  });
})();
