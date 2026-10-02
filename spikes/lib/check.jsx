// Check helper for spike probes (ES3). Each check is a no-arg function returning true/false or
// { pass: bool, detail: any }. Exceptions are recorded as a failed check, never thrown to the host.
var __CHECKS = [];
function check(name, fn, required) {
  var c = { name: name, pass: false, required: required !== false, detail: '' };
  try {
    var r = fn();
    if (r === true || r === false) {
      c.pass = r;
    } else if (r && typeof r === 'object') {
      c.pass = r.pass === true;
      c.detail = (r.detail === undefined) ? '' : r.detail;
    } else {
      c.detail = 'unexpected return: ' + String(r);
    }
  } catch (e) {
    c.detail = 'EXC: ' + String(e) + ((e && e.line) ? ' (line ' + e.line + ')' : '');
  }
  __CHECKS.push(c);
  return c.pass;
}
function hostVersion() {
  return String(app.version);
}
function finish(data) {
  data = data || {};
  data.hostVersion = hostVersion();
  return JSON.stringify({ checks: __CHECKS, data: data });
}
