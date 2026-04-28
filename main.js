;(function () {
  'use strict'

  // ── Boot error handler ─────────────────────────────────────────────────
  function showBootError (err, context) {
    try {
      var msg = (err && err.stack) ? String(err.stack) : (err && err.message ? String(err.message) : String(err))
      var header = '[Cloud.ru Motion Presets] Panel error' + (context ? ' (' + context + ')' : '')
      if (typeof console !== 'undefined' && console.error) console.error(header, err)
      if (typeof document === 'undefined' || !document.body) return
      document.body.innerHTML = ''
      document.body.style.cssText = 'margin:0;padding:8px;background:#1f1f1f;color:#ffd2d2;font:11px Menlo,monospace'
      var pre = document.createElement('pre')
      pre.textContent = header + '\n\n' + msg
      document.body.appendChild(pre)
    } catch (_) {}
  }

  try {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', function (e) { showBootError(e.error || new Error(e.message), 'window.error') })
      window.addEventListener('unhandledrejection', function (e) { showBootError(e.reason || new Error('Unhandled rejection'), 'unhandledrejection') })
    }
  } catch (_) {}

  // ── State ──────────────────────────────────────────────────────────────
  var state = {
    isPresetInFlight: false,
    selectedPresetKey: 'fade_in',
    selectedBrandPresetKey: 'logo_reveal',
    lastMutatingToolCount: 0,
    toolLog: []
  }

  // ── DOM refs ───────────────────────────────────────────────────────────
  var els = {}

  function cacheDomRefs () {
    els.clearSessionBtn = document.getElementById('clear-session-btn')
    els.undoBtn = document.getElementById('undo-btn')
    els.presetDropdownBtn = document.getElementById('preset-dropdown-btn')
    els.presetDropdownMenu = document.getElementById('preset-dropdown-menu')
    els.presetDuration = document.getElementById('preset-duration')
    els.presetDelay = document.getElementById('preset-delay')
    els.presetStrength = document.getElementById('preset-strength')
    els.presetStrengthLabel = document.getElementById('preset-strength-label')
    els.applyPresetBtn = document.getElementById('apply-preset-btn')
    els.toolLog = document.getElementById('tool-log')
    els.brandDropdownBtn = document.getElementById('brand-dropdown-btn')
    els.brandDropdownMenu = document.getElementById('brand-dropdown-menu')
    els.brandField1 = document.getElementById('brand-field1')
    els.brandField1Label = document.getElementById('brand-field1-label')
    els.brandField1Wrap = document.getElementById('brand-field1-wrap')
    els.brandField2 = document.getElementById('brand-field2')
    els.brandField2Label = document.getElementById('brand-field2-label')
    els.brandField2Wrap = document.getElementById('brand-field2-wrap')
    els.brandDuration = document.getElementById('brand-duration')
    els.applyBrandBtn = document.getElementById('apply-brand-btn')
  }

  var PRESET_LABELS = {
    fade_in: 'Fade In',
    fade_out: 'Fade Out',
    pop_in: 'Pop In',
    pop_out: 'Pop Out',
    slide_left: 'Slide Left',
    slide_right: 'Slide Right',
    slide_up: 'Slide Up',
    slide_down: 'Slide Down'
  }

  var BRAND_PRESET_LABELS = (window.BRAND_PRESETS_CONFIG && window.BRAND_PRESETS_CONFIG.labels) || {
    logo_reveal: 'Logo Reveal',
    lower_third: 'Lower Third',
    text_card: 'Text Card'
  }

  // ── Status (no-op stub kept for log entries' message field) ────────────
  function setStatus (text) {
    // Status bar removed — surface info only via Tool Log.
    if (text) addToolLogEntry('status', 'info', String(text))
  }

  // ── Motion preset UI ───────────────────────────────────────────────────
  function closePresetDropdown () { if (els.presetDropdownMenu) els.presetDropdownMenu.style.display = 'none' }
  function openPresetDropdown () { if (els.presetDropdownMenu) els.presetDropdownMenu.style.display = '' }
  function togglePresetDropdown () {
    if (!els.presetDropdownMenu) return
    if (els.presetDropdownMenu.style.display === 'none') openPresetDropdown()
    else closePresetDropdown()
  }

  function updatePresetDropdownUi () {
    if (els.presetDropdownBtn) {
      els.presetDropdownBtn.textContent = PRESET_LABELS[state.selectedPresetKey] || 'Preset'
    }
    if (els.presetDropdownMenu) {
      var options = els.presetDropdownMenu.querySelectorAll('.preset-option-btn')
      for (var i = 0; i < options.length; i++) {
        var key = options[i].getAttribute('data-preset') || ''
        if (key === state.selectedPresetKey) options[i].classList.add('active')
        else options[i].classList.remove('active')
      }
    }
  }

  function updatePresetStrengthUi () {
    if (!els.presetStrength) return
    var key = String(state.selectedPresetKey || '')
    var isFade = key.indexOf('fade_') === 0
    var isPop = key.indexOf('pop_') === 0
    var isSlide = key.indexOf('slide_') === 0
    if (isFade) {
      els.presetStrength.disabled = true
      els.presetStrength.value = ''
      els.presetStrength.title = 'Not used for fade preset'
      if (els.presetStrengthLabel) els.presetStrengthLabel.textContent = 'Strength'
      return
    }
    els.presetStrength.disabled = false
    if (isPop) {
      if (!els.presetStrength.value) els.presetStrength.value = '1'
      els.presetStrength.title = 'Intensity (0.2..1.5) for pop preset'
      if (els.presetStrengthLabel) els.presetStrengthLabel.textContent = 'Intensity'
      return
    }
    if (isSlide) {
      if (!els.presetStrength.value) els.presetStrength.value = '120'
      els.presetStrength.title = 'Amplitude in px (8..2000) for slide preset'
      if (els.presetStrengthLabel) els.presetStrengthLabel.textContent = 'Amplitude (px)'
    }
  }

  function setPresetUiBusy (busy) {
    state.isPresetInFlight = !!busy
    if (busy) closePresetDropdown()
    if (els.applyPresetBtn) els.applyPresetBtn.disabled = !!busy
    if (els.presetDropdownBtn) els.presetDropdownBtn.disabled = !!busy
    if (els.presetDuration) els.presetDuration.disabled = !!busy
    if (els.presetDelay) els.presetDelay.disabled = !!busy
    if (els.presetStrength && !els.presetStrength.disabled) els.presetStrength.disabled = !!busy
    if (!busy) updatePresetStrengthUi()
  }

  // ── Brand preset UI ────────────────────────────────────────────────────
  function closeBrandDropdown () { if (els.brandDropdownMenu) els.brandDropdownMenu.style.display = 'none' }
  function toggleBrandDropdown () {
    if (!els.brandDropdownMenu) return
    if (els.brandDropdownMenu.style.display === 'none') els.brandDropdownMenu.style.display = ''
    else closeBrandDropdown()
  }

  function updateBrandDropdownUi () {
    if (els.brandDropdownBtn) {
      els.brandDropdownBtn.textContent = BRAND_PRESET_LABELS[state.selectedBrandPresetKey] || 'Brand Preset'
    }
    if (els.brandDropdownMenu) {
      var opts = els.brandDropdownMenu.querySelectorAll('.preset-option-btn')
      for (var i = 0; i < opts.length; i++) {
        var key = opts[i].getAttribute('data-brand-preset') || ''
        if (key === state.selectedBrandPresetKey) opts[i].classList.add('active')
        else opts[i].classList.remove('active')
      }
    }
  }

  function updateBrandFieldsUi () {
    var key = state.selectedBrandPresetKey
    if (!els.brandField1) return

    if (key === 'logo_reveal') {
      els.brandField1Wrap.classList.add('hidden')
      els.brandField2Wrap.classList.remove('hidden')
      els.brandField2Label.textContent = 'Subline'
      els.brandField2.placeholder = 'optional subline'
      els.brandField2.value = ''
      els.brandDuration.value = '2.2'
    } else if (key === 'lower_third') {
      els.brandField1Wrap.classList.remove('hidden')
      els.brandField2Wrap.classList.remove('hidden')
      els.brandField1Label.textContent = 'Name'
      els.brandField1.placeholder = 'Speaker Name'
      els.brandField1.value = ''
      els.brandField2Label.textContent = 'Title'
      els.brandField2.placeholder = 'Job Title'
      els.brandField2.value = ''
      els.brandDuration.value = '5'
    } else if (key === 'text_card') {
      els.brandField1Wrap.classList.remove('hidden')
      els.brandField2Wrap.classList.remove('hidden')
      els.brandField1Label.textContent = 'Line 1'
      els.brandField1.placeholder = 'First line'
      els.brandField1.value = ''
      els.brandField2Label.textContent = 'Line 2'
      els.brandField2.placeholder = 'Second line'
      els.brandField2.value = ''
      els.brandDuration.value = '7'
    }
  }

  function buildBrandPresetCall () {
    var key = state.selectedBrandPresetKey
    var dur = parseFloat(els.brandDuration ? els.brandDuration.value : '5')
    if (!isFinite(dur)) dur = 5
    var f1 = (els.brandField1 && els.brandField1.value) ? els.brandField1.value.trim() : ''
    var f2 = (els.brandField2 && els.brandField2.value) ? els.brandField2.value.trim() : ''

    if (key === 'logo_reveal') {
      var args = { duration: dur }
      if (f2) { args.with_subline = true; args.subline_text = f2 }
      return { toolName: 'apply_brand_logo_reveal', args: args }
    }
    if (key === 'lower_third') {
      return {
        toolName: 'apply_brand_lower_third',
        args: { name_text: f1 || 'Speaker Name', title_text: f2 || 'Job Title', display_duration: dur }
      }
    }
    if (key === 'text_card') {
      return {
        toolName: 'apply_brand_text_card',
        args: { line1: f1 || 'Line 1', line2: f2 || 'Line 2', display_duration: dur }
      }
    }
    return null
  }

  function handleApplyBrandPreset () {
    if (state.isPresetInFlight) {
      addToolLogEntry('apply_brand', 'info', 'Busy: wait for current operation to finish')
      return
    }
    if (!window.HOST_BRIDGE || typeof window.HOST_BRIDGE.executeToolCall !== 'function') {
      addToolLogEntry('apply_brand', 'error', 'Host bridge not ready')
      return
    }
    var call = buildBrandPresetCall()
    if (!call) { addToolLogEntry('apply_brand', 'error', 'Invalid brand preset selection'); return }

    state.isPresetInFlight = true
    if (els.applyBrandBtn) els.applyBrandBtn.disabled = true

    window.HOST_BRIDGE.executeToolCall(call.toolName, call.args)
      .then(function (res) {
        if (res && res.ok) {
          addToolLogEntry(call.toolName, 'ok', res.message || ('layers: ' + ((res.layers && res.layers.length) || '?')))
          state.lastMutatingToolCount = (res.layers && res.layers.length) || 1
        } else {
          var errMsg = (res && res.message) ? res.message : 'Unknown error'
          addToolLogEntry(call.toolName, 'error', errMsg)
        }
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err)
        addToolLogEntry(call.toolName, 'error', msg)
      })
      .then(function () {
        state.isPresetInFlight = false
        if (els.applyBrandBtn) els.applyBrandBtn.disabled = false
      })
  }

  // ── Motion preset apply ────────────────────────────────────────────────
  function parsePresetNumberInput (el) {
    if (!el) return null
    var raw = String(el.value || '').trim()
    if (!raw.length) return null
    var n = parseFloat(raw)
    if (!isFinite(n)) return null
    return n
  }

  function buildPresetCallFromUi () {
    var key = String(state.selectedPresetKey || '')
    var duration = parsePresetNumberInput(els.presetDuration)
    var delay = parsePresetNumberInput(els.presetDelay)
    var strength = parsePresetNumberInput(els.presetStrength)
    var payload = {}
    if (duration !== null) payload.duration = duration
    if (delay !== null) payload.delay = delay

    if (key === 'fade_in') { payload.direction = 'in'; return { toolName: 'apply_fade_preset', args: payload } }
    if (key === 'fade_out') { payload.direction = 'out'; return { toolName: 'apply_fade_preset', args: payload } }
    if (key === 'pop_in') { payload.direction = 'in'; if (strength !== null) payload.intensity = strength; return { toolName: 'apply_pop_preset', args: payload } }
    if (key === 'pop_out') { payload.direction = 'out'; if (strength !== null) payload.intensity = strength; return { toolName: 'apply_pop_preset', args: payload } }
    if (key === 'slide_left') { payload.direction = 'left'; if (strength !== null) payload.amplitude = strength; return { toolName: 'apply_slide_preset', args: payload } }
    if (key === 'slide_right') { payload.direction = 'right'; if (strength !== null) payload.amplitude = strength; return { toolName: 'apply_slide_preset', args: payload } }
    if (key === 'slide_up') { payload.direction = 'up'; if (strength !== null) payload.amplitude = strength; return { toolName: 'apply_slide_preset', args: payload } }
    if (key === 'slide_down') { payload.direction = 'down'; if (strength !== null) payload.amplitude = strength; return { toolName: 'apply_slide_preset', args: payload } }
    return null
  }

  function handleApplyPresetFromUi () {
    if (state.isPresetInFlight) {
      addToolLogEntry('apply_preset', 'info', 'Busy: wait for current operation to finish')
      return
    }
    if (!window.HOST_BRIDGE || typeof window.HOST_BRIDGE.executeToolCall !== 'function') {
      addToolLogEntry('apply_preset', 'error', 'Host bridge not ready')
      return
    }

    var presetCall = buildPresetCallFromUi()
    if (!presetCall) {
      addToolLogEntry('apply_preset', 'error', 'Invalid preset selection')
      return
    }

    setPresetUiBusy(true)

    window.HOST_BRIDGE.executeToolCall('get_host_context', {})
      .then(function (ctx) {
        var selected = (ctx && ctx.selectedLayers && ctx.selectedLayers.length) ? ctx.selectedLayers : []
        if (selected.length === 0) {
          throw new Error('Select at least one layer in the active composition.')
        }

        var applyQueue = Promise.resolve()
        var okCount = 0
        var errCount = 0
        var firstErr = null
        for (var i = 0; i < selected.length; i++) {
          (function (layerInfo) {
            applyQueue = applyQueue.then(function () {
              var args = {}
              for (var k in presetCall.args) args[k] = presetCall.args[k]
              if (typeof layerInfo.id === 'number') args.layer_id = layerInfo.id
              else args.layer_index = layerInfo.index
              return window.HOST_BRIDGE.executeToolCall(presetCall.toolName, args)
                .then(function (res) {
                  if (res && res.ok) {
                    okCount++
                    addToolLogEntry(presetCall.toolName, 'ok', res.message || '')
                  } else {
                    errCount++
                    var errMsg = (res && res.message) ? res.message : 'Unknown host error'
                    if (!firstErr) firstErr = errMsg
                    addToolLogEntry(presetCall.toolName, 'error', errMsg)
                  }
                })
                .catch(function (err) {
                  errCount++
                  var errMsg = err.message || String(err)
                  if (!firstErr) firstErr = errMsg
                  addToolLogEntry(presetCall.toolName, 'error', errMsg)
                })
            })
          })(selected[i])
        }

        return applyQueue.then(function () {
          state.lastMutatingToolCount = okCount
          addToolLogEntry(
            presetCall.toolName,
            errCount === 0 ? 'ok' : 'warn',
            'Applied: ' + okCount + ' ok, ' + errCount + ' failed' + (firstErr ? ' (' + firstErr + ')' : '')
          )
        })
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : String(err)
        addToolLogEntry(presetCall.toolName, 'error', msg)
      })
      .then(function () {
        setPresetUiBusy(false)
      })
  }

  // ── Tool Call Log ──────────────────────────────────────────────────────
  function pad2 (n) { return (n < 10 ? '0' : '') + n }

  function addToolLogEntry (name, status, msg) {
    var now = new Date()
    var timeStr = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds())
    state.toolLog.push({ time: timeStr, name: name, status: status, msg: msg || '' })
    if (state.toolLog.length > 200) state.toolLog = state.toolLog.slice(-200)
    renderToolLog()
  }

  function renderToolLog () {
    if (!els.toolLog) return
    var entries = state.toolLog.slice(-100)
    var html = ''
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i]
      html += '<div class="tool-log-entry">' +
        '<span class="tool-log-time">' + e.time + '</span>' +
        '<span class="tool-log-name">' + e.name + '</span>' +
        '<span class="tool-log-status ' + e.status + '">' + e.status + '</span>' +
        '<span class="tool-log-msg">' + (e.msg || '').replace(/</g, '&lt;').substring(0, 80) + '</span>' +
        '</div>'
    }
    els.toolLog.innerHTML = html
    els.toolLog.scrollTop = els.toolLog.scrollHeight
  }

  // ── Footer actions ─────────────────────────────────────────────────────
  function handleUndo () {
    if (!window.HOST_BRIDGE) return
    var count = state.lastMutatingToolCount || 1
    if (count < 1) count = 1
    var script = '(function(){ for (var i = 0; i < ' + count + '; i++) { app.executeCommand(16); } return "' + count + '"; })()'
    window.HOST_BRIDGE.evalHostFunction(script)
      .then(function () { addToolLogEntry('undo', 'ok', count + ' action(s) reverted') })
      .catch(function (e) { addToolLogEntry('undo', 'error', e.message || String(e)) })
    state.lastMutatingToolCount = 0
  }

  function handleClearLog () {
    state.toolLog = []
    renderToolLog()
  }

  // ── Event binding ──────────────────────────────────────────────────────
  function bindEvents () {
    if (els.undoBtn) els.undoBtn.addEventListener('click', handleUndo)
    if (els.clearSessionBtn) els.clearSessionBtn.addEventListener('click', handleClearLog)

    // Motion preset dropdown
    if (els.presetDropdownBtn) {
      els.presetDropdownBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation()
        if (!state.isPresetInFlight) togglePresetDropdown()
      })
    }
    if (els.presetDropdownMenu) {
      var optionButtons = els.presetDropdownMenu.querySelectorAll('.preset-option-btn')
      for (var pi = 0; pi < optionButtons.length; pi++) {
        optionButtons[pi].addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation()
          var key = this.getAttribute('data-preset') || ''
          if (!key) return
          state.selectedPresetKey = key
          updatePresetDropdownUi()
          updatePresetStrengthUi()
          closePresetDropdown()
        })
      }
    }
    document.addEventListener('click', function (e) {
      if (!els.presetDropdownMenu || !els.presetDropdownBtn) return
      if (!els.presetDropdownMenu.contains(e.target) && !els.presetDropdownBtn.contains(e.target)) closePresetDropdown()
    })
    if (els.applyPresetBtn) els.applyPresetBtn.addEventListener('click', handleApplyPresetFromUi)

    // Brand preset dropdown
    if (els.brandDropdownBtn) {
      els.brandDropdownBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation()
        if (!state.isPresetInFlight) toggleBrandDropdown()
      })
    }
    if (els.brandDropdownMenu) {
      var brandOpts = els.brandDropdownMenu.querySelectorAll('.preset-option-btn')
      for (var bi = 0; bi < brandOpts.length; bi++) {
        brandOpts[bi].addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation()
          var key = this.getAttribute('data-brand-preset') || ''
          if (!key) return
          state.selectedBrandPresetKey = key
          updateBrandDropdownUi()
          updateBrandFieldsUi()
          closeBrandDropdown()
        })
      }
    }
    document.addEventListener('click', function (e) {
      if (!els.brandDropdownMenu || !els.brandDropdownBtn) return
      if (!els.brandDropdownMenu.contains(e.target) && !els.brandDropdownBtn.contains(e.target)) closeBrandDropdown()
    })
    if (els.applyBrandBtn) els.applyBrandBtn.addEventListener('click', handleApplyBrandPreset)
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init () {
    cacheDomRefs()
    bindEvents()
    updatePresetDropdownUi()
    updatePresetStrengthUi()
    updateBrandDropdownUi()
    updateBrandFieldsUi()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
