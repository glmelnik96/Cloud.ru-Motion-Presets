// S7 stage "template-import" (Premiere, ES3, after pr-helpers.jsx): CR_Templates_test.prproj imported with
// importFiles; what lands in the project is recorded: the adjustment layer with its master clip effects, the
// caption track style, the sequences. If Premiere shows its Import Project dialog instead, the call blocks
// (Task 18 says what to do); a second run finds the items and does not import again.
var P = PARAMS;
var data = { added: [], importedEarlier: false };

// '/Bin/Item' -> '/Bin': the bin the template project came in.
function topBin(path) {
  var parts = String(path).split('/');
  return parts.length > 2 ? '/' + parts[1] : '';
}

var ready = projectCheck();
ready = ready && check('template project exists: ' + P.templates, function () {
  return { pass: new File(P.templates).exists, detail: P.templates };
});

if (ready) {
  check('importFiles(.prproj) brought the template items into the project', function () {
    var before = projectTree();
    var known = {};
    var i, rv, deadline, last, stable, now, bin;
    for (i = 0; i < before.length; i++) {
      known[before[i].nodeId] = true;
      if (endsWith(before[i].path, '/' + P.adjName)) {
        bin = topBin(before[i].path);
        data.importedEarlier = true;
      }
    }
    if (data.importedEarlier) {
      for (i = 0; i < before.length; i++) {
        if (bin !== '' && before[i].path.substr(0, bin.length) === bin) {
          data.added.push(before[i]);
        }
      }
      return { pass: data.added.length > 0, detail: { importedEarlier: true, bin: bin, items: data.added } };
    }
    // https://ppro-scripting.docsforadobe.dev/general/project/ (importFiles; suppressUI = true)
    rv = app.project.importFiles([new File(P.templates).fsName], true, app.project.rootItem, false);
    // The import lands asynchronously: wait until something arrived and the tree stopped growing for 2 s.
    deadline = new Date().getTime() + P.waitMs;
    last = -1;
    stable = 0;
    now = before;
    while (new Date().getTime() < deadline && !(now.length > before.length && stable >= 10)) {
      $.sleep(200);
      now = projectTree();
      if (now.length === last) {
        stable += 1;
      } else {
        stable = 0;
        last = now.length;
      }
    }
    for (i = 0; i < now.length; i++) {
      if (!known[now[i].nodeId]) {
        data.added.push(now[i]);
      }
    }
    data.returned = describeValue(rv);
    return { pass: data.added.length > 0, detail: { returned: data.returned, added: data.added } };
  });

  check('adjustment layer ' + P.adjName + ' arrived', function () {
    var i;
    for (i = 0; i < data.added.length; i++) {
      if (endsWith(data.added[i].path, '/' + P.adjName)) {
        data.adj = data.added[i];
      }
    }
    return { pass: !!data.adj, detail: data.adj || null };
  });

  if (data.adj) {
    check('master clip effects of ' + P.adjName + ' (ProjectItem.videoComponents)', function () {
      // https://ppro-scripting.docsforadobe.dev/item/projectitem/ (videoComponents)
      var comps = findItemByNodeId(data.adj.nodeId).videoComponents();
      var list = [];
      var i;
      for (i = 0; i < comps.numItems; i++) {
        list.push(String(comps[i].matchName));
      }
      data.adjComponents = list;
      return { pass: strHas(list.join('|'), 'Gaussian'), detail: list };
    }, false);
  }

  check('caption style ' + P.styleName + ' arrived', function () {
    var i;
    for (i = 0; i < data.added.length; i++) {
      if (endsWith(data.added[i].path, '/' + P.styleName)) {
        data.style = data.added[i];
      }
    }
    return { pass: !!data.style, detail: data.style || null };
  });

  check('sequences in the project after the import recorded', function () {
    var list = [];
    var seqs = app.project.sequences;
    var i;
    for (i = 0; i < seqs.numSequences; i++) {
      list.push(String(seqs[i].name));
    }
    data.sequences = list;
    return { pass: true, detail: list };
  }, false);
}

finish(data);
