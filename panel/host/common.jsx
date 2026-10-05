// Shared head of the BrandKit host adapters (ES3, ASCII only). The panel sends prelude-json.jsx + this file +
// ae.jsx or pr.jsx as one source through evalScript (plan 2026-10-05 P4). Every entry point goes through
// CRBK.call(fn, json) and returns a JSON string {ok:true,data} or {ok:false,error:{code,message,line}}.
// Russian text never lives here: the panel maps codes to messages.
(function (g) {
  var CRBK = g.CRBK && g.CRBK.build === '__CRBK_BUILD__' ? g.CRBK : { fns: {} };
  CRBK.build = '__CRBK_BUILD__';
  CRBK.fns = CRBK.fns || {};

  CRBK.ok = function (data) {
    return { ok: true, data: data === undefined ? null : data };
  };
  CRBK.fail = function (code, message) {
    return { ok: false, error: { code: String(code), message: message === undefined ? '' : String(message) } };
  };

  CRBK.call = function (fn, json) {
    var reply;
    try {
      var f = CRBK.fns[fn];
      if (typeof f !== 'function') {
        reply = CRBK.fail('UNKNOWN_FN', fn);
      } else {
        reply = f(json ? JSON.parse(json) : {});
      }
    } catch (e) {
      reply = { ok: false, error: { code: 'HOST_EXCEPTION', message: String(e && e.message ? e.message : e), line: e && e.line ? e.line : 0 } };
    }
    return JSON.stringify(reply);
  };

  CRBK.fns.ping = function () {
    return CRBK.ok({ build: CRBK.build, app: String(app.version) });
  };

  g.CRBK = CRBK;
})($.global);
