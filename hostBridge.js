/**
 * Host Bridge — wraps CSInterface.evalScript calls to ExtendScript.
 * Provides promise-based execution of host functions.
 */
(function () {
  'use strict'

  var hostScriptPath = null
  var hostScriptLoaded = false
  var hostScriptLoadPromise = null

  function ensureHostScriptLoaded () {
    if (hostScriptLoaded) return Promise.resolve()
    if (hostScriptLoadPromise) return hostScriptLoadPromise

    hostScriptLoadPromise = new Promise(function (resolve, reject) {
      try {
        var cs = new CSInterface()
        var ext = cs.getSystemPath(SystemPath.EXTENSION)
        hostScriptPath = ext + '/host/index.jsx'
        var escapedPath = hostScriptPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        cs.evalScript('$.evalFile("' + escapedPath + '"); "ok"', function (resultStr) {
          if (resultStr === 'ok') {
            hostScriptLoaded = true
            resolve()
          } else {
            // Fallback: read & inline.
            try {
              var fs = require('fs')
              var content = fs.readFileSync(hostScriptPath, 'utf8')
              cs.evalScript(content + '\n"ok"', function () {
                hostScriptLoaded = true
                resolve()
              })
            } catch (eFallback) {
              reject(new Error('Failed to load host script: ' + (resultStr || eFallback.message)))
            }
          }
        })
      } catch (e) {
        reject(new Error('ensureHostScriptLoaded error: ' + e.message))
      }
    })

    return hostScriptLoadPromise
  }

  function evalHostFunction (functionCall) {
    return ensureHostScriptLoaded().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var cs = new CSInterface()
          cs.evalScript(functionCall, function (resultStr) {
            if (!resultStr || resultStr === 'undefined' || resultStr === 'null') {
              reject(new Error('Host returned empty result for: ' + functionCall))
              return
            }
            try {
              if (resultStr.indexOf('EvalScript error') === 0) {
                reject(new Error(resultStr))
                return
              }
              var parsed = JSON.parse(resultStr)
              resolve(parsed)
            } catch (parseErr) {
              resolve({ ok: true, message: resultStr, raw: resultStr })
            }
          })
        } catch (e) {
          reject(new Error('evalHostFunction error: ' + e.message))
        }
      })
    })
  }

  /**
   * Serialize a JS value as an ExtendScript literal.
   */
  function toESLiteral (val) {
    if (val === null || val === undefined) return 'null'
    if (typeof val === 'string') return JSON.stringify(val)
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    if (Array.isArray(val)) {
      var items = []
      for (var i = 0; i < val.length; i++) items.push(toESLiteral(val[i]))
      return '[' + items.join(',') + ']'
    }
    if (typeof val === 'object') {
      var parts = []
      for (var k in val) {
        if (val.hasOwnProperty(k)) {
          parts.push(JSON.stringify(k) + ':' + toESLiteral(val[k]))
        }
      }
      return '{' + parts.join(',') + '}'
    }
    return String(val)
  }

  /**
   * Execute a preset tool call.
   * Supported tools: get_host_context, apply_fade_preset, apply_pop_preset,
   * apply_slide_preset, apply_brand_logo_reveal, apply_brand_lower_third,
   * apply_brand_text_card.
   */
  function executeToolCall (toolName, args) {
    if (!args) args = {}
    var call = null

    switch (toolName) {
      case 'get_host_context':
        call = 'motionPresets_getHostContext()'
        break
      case 'apply_fade_preset':
        call = 'motionPresets_applyFadePreset(' +
          toESLiteral(args.layer_index) + ',' +
          toESLiteral(args.layer_id || null) + ',' +
          toESLiteral({ duration: args.duration, delay: args.delay, direction: args.direction }) + ')'
        break
      case 'apply_pop_preset':
        call = 'motionPresets_applyPopPreset(' +
          toESLiteral(args.layer_index) + ',' +
          toESLiteral(args.layer_id || null) + ',' +
          toESLiteral({ duration: args.duration, delay: args.delay, direction: args.direction, intensity: args.intensity }) + ')'
        break
      case 'apply_slide_preset':
        call = 'motionPresets_applySlidePreset(' +
          toESLiteral(args.layer_index) + ',' +
          toESLiteral(args.layer_id || null) + ',' +
          toESLiteral({ duration: args.duration, delay: args.delay, direction: args.direction, amplitude: args.amplitude }) + ')'
        break
      case 'apply_brand_logo_reveal':
        call = 'motionPresets_applyBrandLogoReveal(' +
          toESLiteral({
            duration: args.duration,
            with_subline: args.with_subline,
            subline_text: args.subline_text,
            with_background: args.with_background
          }) + ')'
        break
      case 'apply_brand_lower_third':
        call = 'motionPresets_applyBrandLowerThird(' +
          toESLiteral({
            name_text: args.name_text,
            title_text: args.title_text,
            display_duration: args.display_duration
          }) + ')'
        break
      case 'apply_brand_text_card':
        call = 'motionPresets_applyBrandTextCard(' +
          toESLiteral({
            line1: args.line1,
            line2: args.line2,
            line3: args.line3,
            line4: args.line4,
            display_duration: args.display_duration
          }) + ')'
        break
      default:
        return Promise.reject(new Error('Unknown tool: ' + toolName))
    }

    return evalHostFunction(call)
  }

  if (typeof window !== 'undefined') {
    window.HOST_BRIDGE = {
      evalHostFunction: evalHostFunction,
      executeToolCall: executeToolCall,
      ensureHostScriptLoaded: ensureHostScriptLoaded,
      toESLiteral: toESLiteral
    }
  }
})()
