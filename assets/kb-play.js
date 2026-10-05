// Kafka knowledge base: activity engine.
// Each module supplies window.KB_EXTRAS = { module: '01', sections: { summary: [activity, ...], ... } }.
// This file renders the activities into the matching sections and remembers which ones are done.

(function () {
  const X = window.KB_EXTRAS;
  if (!X) return;
  const MOD = X.module;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LABEL = {
    quiz: 'Predict', quizset: 'Boss round', tf: 'Myth or fact', order: 'Put in order', match: 'Match',
    scenario: 'On call', tune: 'Tune it', flow: 'Watch it move', example: 'Worked example',
    design: 'Design drill', calc: 'Calculate', lab: 'Lab challenge',
  };

  // ---------- storage (works without it; progress then lasts for this page only) ----------
  let state = {};
  try { state = JSON.parse(localStorage.getItem('kb-play') || '{}') || {}; } catch (e) { state = {}; }
  if (!state[MOD]) state[MOD] = {};
  const save = () => { try { localStorage.setItem('kb-play', JSON.stringify(state)); } catch (e) { /* blocked */ } };

  // ---------- small helpers ----------
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (text, cls) => { const b = el('button', 'btn' + (cls ? ' ' + cls : '')); b.type = 'button'; b.innerHTML = text; return b; };
  const fb = (node, ok, html) => { node.className = 'fb ' + (ok ? 'ok' : 'no'); node.innerHTML = '<strong>' + (ok ? 'Correct.' : 'Not quite.') + '</strong> ' + (html || ''); };
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const all = [];
  Object.keys(X.sections).forEach((k) => X.sections[k].forEach((a) => all.push(a)));

  // ---------- progress strip in the hero ----------
  let barCells = null, barLabel = null;
  function buildBar() {
    const hero = document.querySelector('.hero');
    const lede = hero && hero.querySelector('.lede');
    if (!lede) return;
    const bar = el('div', 'play-bar');
    barLabel = el('div', 'play-bar-label');
    barCells = el('div', 'play-bar-cells');
    all.forEach((a, i) => {
      const c = el('a', 'play-cell');
      c.href = '#act-' + a.id;
      c.textContent = i + 1;
      c.title = LABEL[a.type] + ': ' + a.title;
      c.setAttribute('aria-label', 'Activity ' + (i + 1) + ', ' + LABEL[a.type] + ': ' + a.title);
      barCells.appendChild(c);
    });
    bar.append(barLabel, barCells);
    lede.after(bar);
    updateBar();
  }
  function updateBar() {
    if (!barCells) return;
    let n = 0;
    all.forEach((a, i) => { const d = !!state[MOD][a.id]; if (d) n++; barCells.children[i].classList.toggle('done', d); });
    barLabel.innerHTML = 'Your log for this module: <b>' + n + ' of ' + all.length + '</b> activities committed' + (n === all.length ? '. Lag 0.' : '. Lag ' + (all.length - n) + '.');
    state[MOD]._total = all.length;
    save();
  }
  function markDone(a, card) {
    card.classList.add('done');
    if (!state[MOD][a.id]) { state[MOD][a.id] = 1; updateBar(); }
  }

  // ====================================================================
  // activity types
  // ====================================================================
  const R = {};

  // One question, retry until right.
  R.quiz = function (body, a, done) {
    body.appendChild(el('p', 'act-q', a.q));
    const opts = el('div', 'opts'), out = el('div', 'fb');
    a.options.forEach((o, i) => {
      const b = btn(o, 'opt');
      b.addEventListener('click', () => {
        if (i === a.answer) {
          b.classList.add('ok'); [...opts.children].forEach((x) => { x.disabled = true; });
          fb(out, true, a.why); done();
        } else { b.classList.add('no'); b.disabled = true; fb(out, false, (a.hints && a.hints[i]) || 'Think again and pick another.'); }
      });
      opts.appendChild(b);
    });
    body.append(opts, out);
  };

  // Several questions, one attempt each, pass at 80%.
  R.quizset = function (body, a, done) {
    const need = Math.ceil(a.questions.length * 0.8);
    function build() {
      body.innerHTML = '';
      body.appendChild(el('p', 'act-q', 'One attempt for each question. Pass mark: ' + need + ' of ' + a.questions.length + '.'));
      let answered = 0, right = 0;
      const score = el('div', 'fb');
      a.questions.forEach((q, qi) => {
        const block = el('div', 'qblock');
        block.appendChild(el('p', 'act-q', '<b>' + (qi + 1) + '.</b> ' + q.q));
        const opts = el('div', 'opts'), out = el('div', 'fb');
        q.options.forEach((o, i) => {
          const b = btn(o, 'opt');
          b.addEventListener('click', () => {
            [...opts.children].forEach((x) => { x.disabled = true; });
            opts.children[q.answer].classList.add('ok');
            if (i === q.answer) right++; else b.classList.add('no');
            fb(out, i === q.answer, q.why);
            answered++;
            if (answered === a.questions.length) {
              const pass = right >= need;
              score.className = 'fb ' + (pass ? 'ok' : 'no');
              score.innerHTML = '<strong>Score: ' + right + ' of ' + a.questions.length + '.</strong> ' + (pass ? 'Passed.' : 'Below the pass mark. Read the explanations, then try again.');
              if (pass) done(); else { const again = btn('Try again'); again.addEventListener('click', build); score.appendChild(document.createTextNode(' ')); score.appendChild(again); }
            }
          });
          opts.appendChild(b);
        });
        block.append(opts, out); body.appendChild(block);
      });
      body.appendChild(score);
    }
    build();
  };

  // Statements to judge as myth or fact.
  R.tf = function (body, a, done) {
    let answered = 0, right = 0;
    const score = el('div', 'fb');
    a.items.forEach((it) => {
      const row = el('div', 'tf-row');
      row.appendChild(el('p', 'act-q', it.s));
      const opts = el('div', 'opts two'), out = el('div', 'fb');
      [['Myth', false], ['Fact', true]].forEach(([text, val]) => {
        const b = btn(text, 'opt');
        b.addEventListener('click', () => {
          [...opts.children].forEach((x) => { x.disabled = true; });
          const ok = val === it.fact;
          b.classList.add(ok ? 'ok' : 'no');
          out.className = 'fb ' + (ok ? 'ok' : 'no');
          out.innerHTML = '<strong>' + (it.fact ? 'Fact.' : 'Myth.') + '</strong> ' + it.why;
          answered++; if (ok) right++;
          if (answered === a.items.length) { score.className = 'fb ok'; score.innerHTML = '<strong>' + right + ' of ' + a.items.length + ' right.</strong>'; done(); }
        });
        opts.appendChild(b);
      });
      row.append(opts, out); body.appendChild(row);
    });
    body.appendChild(score);
  };

  // Click the items in the right order.
  R.order = function (body, a, done) {
    body.appendChild(el('p', 'act-q', a.q));
    const pool = el('div', 'opts'), picked = el('ol', 'picked'), out = el('div', 'fb');
    const check = btn('Check the order', 'primary'), reset = btn('Start again');
    let chosen = [];
    function build() {
      pool.innerHTML = ''; picked.innerHTML = ''; chosen = []; out.className = 'fb'; out.innerHTML = ''; check.disabled = true;
      shuffle(a.items.map((t, i) => i)).forEach((i) => {
        const b = btn(a.items[i], 'opt');
        b.addEventListener('click', () => { b.disabled = true; chosen.push(i); picked.appendChild(el('li', null, a.items[i])); check.disabled = chosen.length !== a.items.length; });
        pool.appendChild(b);
      });
    }
    check.addEventListener('click', () => {
      let good = 0;
      [...picked.children].forEach((li, pos) => { const ok = chosen[pos] === pos; if (ok) good++; li.className = ok ? 'ok' : 'no'; });
      if (good === a.items.length) { fb(out, true, a.why); check.disabled = true; done(); }
      else fb(out, false, good + ' of ' + a.items.length + ' are in the right place. Press "Start again".');
    });
    reset.addEventListener('click', build);
    const ctl = el('div', 'controls'); ctl.append(check, reset);
    body.append(pool, el('p', 'act-hint', 'Your order:'), picked, ctl, out);
    build();
  };

  // Pair each left item with its right item.
  R.match = function (body, a, done) {
    body.appendChild(el('p', 'act-q', a.q || 'Pick an item on the left, then its partner on the right.'));
    const grid = el('div', 'match'), left = el('div', 'match-col'), right = el('div', 'match-col'), out = el('div', 'fb');
    let sel = null, matched = 0;
    const lb = a.pairs.map((p, i) => {
      const b = btn(p[0], 'opt'); b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { lb.forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); sel = i; });
      left.appendChild(b); return b;
    });
    shuffle(a.pairs.map((p, i) => i)).forEach((i) => {
      const b = btn(a.pairs[i][1], 'opt');
      b.addEventListener('click', () => {
        if (sel === null) { out.className = 'fb no'; out.innerHTML = 'Pick an item on the left first.'; return; }
        if (sel === i) {
          matched++;
          [lb[i], b].forEach((x) => { x.classList.add('ok'); x.disabled = true; x.setAttribute('aria-pressed', 'false'); x.insertAdjacentHTML('afterbegin', '<span class="pair-n">' + matched + '</span> '); });
          sel = null;
          if (matched === a.pairs.length) { fb(out, true, a.why || 'All pairs matched.'); done(); }
          else { out.className = 'fb ok'; out.innerHTML = 'Matched ' + matched + ' of ' + a.pairs.length + '.'; }
        } else { out.className = 'fb no'; out.innerHTML = '<strong>Not a pair.</strong> Try another.'; }
      });
      right.appendChild(b);
    });
    grid.append(left, right); body.append(grid, out);
  };

  // An incident: a series of decisions, each with a consequence.
  R.scenario = function (body, a, done) {
    let i = 0, good = 0;
    const stage = el('div');
    function show() {
      stage.innerHTML = '';
      if (i === a.steps.length) {
        const end = el('div', 'fb ok');
        end.innerHTML = '<strong>Incident closed. ' + good + ' of ' + a.steps.length + ' good calls.</strong> ' + (a.debrief || '');
        const again = btn('Run it again'); again.addEventListener('click', () => { i = 0; good = 0; show(); });
        stage.append(end, again); done(); return;
      }
      const s = a.steps[i];
      stage.appendChild(el('p', 'act-step', 'Decision ' + (i + 1) + ' of ' + a.steps.length));
      stage.appendChild(el('p', 'act-q', s.situation));
      const opts = el('div', 'opts'), out = el('div', 'fb');
      s.choices.forEach((c) => {
        const b = btn(c.label, 'opt');
        b.addEventListener('click', () => {
          [...opts.children].forEach((x) => { x.disabled = true; });
          b.classList.add(c.good ? 'ok' : 'no'); if (c.good) good++;
          out.className = 'fb ' + (c.good ? 'ok' : 'no');
          out.innerHTML = '<strong>' + (c.good ? 'Good call.' : 'That makes it worse.') + '</strong> ' + c.result;
          const next = btn(i === a.steps.length - 1 ? 'Finish' : 'Next decision', 'primary');
          next.addEventListener('click', () => { i++; show(); });
          out.appendChild(el('div', 'controls')).appendChild(next);
        });
        opts.appendChild(b);
      });
      stage.append(opts, out);
    }
    body.appendChild(el('p', 'act-intro', a.intro));
    body.appendChild(stage);
    show();
  };

  // Choose settings, run, and see if the goal is met.
  R.tune = function (body, a, done) {
    body.appendChild(el('p', 'act-q', a.goal));
    const ctl = el('div', 'controls'), out = el('div', 'readout');
    const sels = {};
    a.knobs.forEach((k) => {
      const id = 'k-' + a.id + '-' + k.id;
      const lab = el('label', null, k.label); lab.htmlFor = id;
      const s = el('select'); s.id = id;
      k.options.forEach((o, i) => { const op = el('option', null, o[0]); op.value = i; s.appendChild(op); });
      s.selectedIndex = k.start || 0;
      sels[k.id] = { s, k };
      ctl.append(lab, s);
    });
    const run = btn(a.runLabel || 'Run', 'primary');
    run.addEventListener('click', () => {
      const v = {};
      Object.keys(sels).forEach((id) => { v[id] = sels[id].k.options[sels[id].s.selectedIndex][1]; });
      const r = a.run(v);
      out.innerHTML = (r.ok ? '<b>Goal met.</b> ' : '<span class="warn">Goal not met.</span> ') + r.html;
      if (r.ok) done();
    });
    ctl.appendChild(run);
    out.textContent = 'Choose settings and press "' + (a.runLabel || 'Run') + '".';
    body.append(ctl, out);
  };

  // Messages moving between nodes, step by step.
  R.flow = function (body, a, done) {
    const stage = el('div', 'flow-stage'), nodes = el('div', 'flow-nodes'), packet = el('div', 'flow-packet');
    nodes.style.gridTemplateColumns = 'repeat(' + a.nodes.length + ', minmax(0, 1fr))';
    const nodeEls = a.nodes.map((n) => { const d = el('div', 'flow-node', '<div class="flow-name">' + n + '</div><div class="flow-chips"></div>'); nodes.appendChild(d); return d; });
    stage.append(nodes, packet);
    const say = el('div', 'readout'), ctl = el('div', 'controls');
    const play = btn('Play', 'primary'), next = btn('Next step'), reset = btn('Start again');
    let i = -1, timer = null;

    function centre(n) { const s = stage.getBoundingClientRect(), r = nodeEls[n].getBoundingClientRect(); return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2]; }
    function place(n, animate) {
      const [x, y] = centre(n);
      packet.style.transition = animate && !reduced ? 'transform .7s cubic-bezier(.4, 0, .2, 1)' : 'none';
      packet.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)';
    }
    function apply(s) {
      nodeEls.forEach((n) => n.classList.remove('on', 'bad'));
      if (s.to != null) nodeEls[s.to].classList.add('on'); else if (s.at != null) nodeEls[s.at].classList.add('on');
      (s.clear || []).forEach((n) => { nodeEls[n].querySelector('.flow-chips').innerHTML = ''; });
      (s.store || []).forEach((n) => nodeEls[n].querySelector('.flow-chips').appendChild(el('span', 'flow-chip', s.chip || s.label || '•')));
      (s.down || []).forEach((n) => nodeEls[n].classList.add('dead'));
      (s.up || []).forEach((n) => nodeEls[n].classList.remove('dead'));
      (s.rename || []).forEach(([n, text]) => { nodeEls[n].querySelector('.flow-name').innerHTML = text; });
    }
    function step() {
      if (i >= a.steps.length - 1) return false;
      i++;
      const s = a.steps[i];
      if (s.from != null && s.to != null) {
        packet.textContent = s.label || '';
        packet.classList.toggle('bad', !!s.fail);
        packet.style.opacity = '1';
        place(s.from, false);
        packet.getBoundingClientRect();
        place(s.to, true);
        setTimeout(() => { apply(s); if (s.fail) nodeEls[s.to].classList.add('bad'); packet.style.opacity = '0'; }, reduced ? 0 : 720);
      } else { packet.style.opacity = '0'; apply(s); }
      say.innerHTML = '<b>Step ' + (i + 1) + ' of ' + a.steps.length + '.</b> ' + s.say;
      if (i === a.steps.length - 1) { stop(); next.disabled = true; play.disabled = true; done(); }
      return true;
    }
    function stop() { clearInterval(timer); timer = null; play.innerHTML = 'Play'; }
    function restart() {
      stop(); i = -1; next.disabled = false; play.disabled = false; packet.style.opacity = '0';
      nodeEls.forEach((n, k) => { n.classList.remove('on', 'bad', 'dead'); n.querySelector('.flow-chips').innerHTML = ''; n.querySelector('.flow-name').innerHTML = a.nodes[k]; });
      say.textContent = a.intro || 'Press "Play" or "Next step".';
    }
    play.addEventListener('click', () => { if (timer) { stop(); return; } play.innerHTML = 'Pause'; step(); timer = setInterval(() => { if (!step()) stop(); }, 2400); });
    next.addEventListener('click', () => { stop(); step(); });
    reset.addEventListener('click', restart);
    ctl.append(play, next, reset);
    body.append(stage, ctl, say);
    restart();
  };

  // A real case, revealed one step at a time.
  R.example = function (body, a, done) {
    body.appendChild(el('div', 'act-intro', a.story));
    const list = el('ol', 'worked'), more = btn('', 'primary'), take = el('div', 'fb');
    let i = 0;
    const label = () => { more.innerHTML = i === 0 ? 'Show the first step' : 'Show step ' + (i + 1) + ' of ' + a.steps.length; };
    more.addEventListener('click', () => {
      list.appendChild(el('li', null, a.steps[i])); i++;
      if (i === a.steps.length) { more.remove(); take.className = 'fb ok'; take.innerHTML = '<strong>Takeaway.</strong> ' + a.takeaway; done(); } else label();
    });
    label();
    body.append(list, more, take);
  };

  // An open question with a model answer and a rubric to score yourself.
  R.design = function (body, a, done) {
    body.appendChild(el('div', 'act-intro', a.prompt));
    if (a.hints && a.hints.length) {
      const d = el('details', 'hint'); d.appendChild(el('summary', null, 'Hints, if you are stuck'));
      const ul = el('ul'); a.hints.forEach((h) => ul.appendChild(el('li', null, h))); d.appendChild(ul); body.appendChild(d);
    }
    const ta = el('textarea', 'answer'); ta.rows = 5; ta.setAttribute('aria-label', 'Your answer. It is not saved.'); ta.placeholder = 'Write your answer here first. It is not saved or sent anywhere.';
    const show = btn('Compare with a model answer', 'primary'), model = el('div');
    show.addEventListener('click', () => {
      show.remove();
      model.appendChild(el('div', 'fb ok', '<strong>Model answer.</strong> ' + a.model));
      model.appendChild(el('p', 'act-hint', 'Score yourself. Tick each point your answer covered:'));
      const count = el('p', 'act-hint');
      const boxes = a.rubric.map((r) => { const l = el('label', 'rubric'); const c = el('input'); c.type = 'checkbox'; l.append(c, document.createTextNode(' ' + r)); model.appendChild(l); return c; });
      const upd = () => { const n = boxes.filter((b) => b.checked).length; count.innerHTML = '<b>' + n + ' of ' + boxes.length + '</b> points covered.' + (n === boxes.length ? ' That is a staff-level answer.' : ''); };
      boxes.forEach((b) => b.addEventListener('change', upd)); upd();
      model.appendChild(count); done();
    });
    body.append(ta, show, model);
  };

  // A number to work out.
  R.calc = function (body, a, done) {
    body.appendChild(el('p', 'act-q', a.q));
    const ctl = el('div', 'controls'), inp = el('input'), out = el('div', 'fb');
    const id = 'c-' + a.id; inp.type = 'number'; inp.id = id; inp.step = 'any'; inp.inputMode = 'decimal';
    const lab = el('label', null, 'Your answer' + (a.unit ? ', in ' + a.unit : '')); lab.htmlFor = id;
    const check = btn('Check', 'primary'), reveal = btn('Show the working');
    let tries = 0;
    const tol = a.tol == null ? 0.05 : a.tol;
    function finish(ok) { out.className = 'fb ' + (ok ? 'ok' : 'no'); out.innerHTML = '<strong>' + (ok ? 'Correct.' : 'The answer is ' + a.answer + (a.unit ? ' ' + a.unit : '') + '.') + '</strong> ' + a.working; check.disabled = true; reveal.remove(); done(); }
    check.addEventListener('click', () => {
      const v = Number(inp.value);
      if (inp.value === '' || Number.isNaN(v)) { out.className = 'fb no'; out.innerHTML = 'Type a number first.'; return; }
      if (Math.abs(v - a.answer) <= Math.abs(a.answer) * tol) finish(true);
      else { tries++; out.className = 'fb no'; out.innerHTML = '<strong>Not quite.</strong> ' + (v > a.answer ? 'Too high.' : 'Too low.') + (a.hint ? ' ' + a.hint : ''); if (tries >= 2 && !reveal.isConnected) ctl.appendChild(reveal); }
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check.click(); });
    reveal.addEventListener('click', () => finish(false));
    ctl.append(lab, inp, check);
    body.append(ctl, out);
  };

  // Extra tasks for the real cluster.
  R.lab = function (body, a, done) {
    body.appendChild(el('div', 'act-intro', a.intro));
    body.appendChild(el('p', 'act-hint', 'These extra tasks were not run in my session. Each hint says what to expect, not what I measured.'));
    const boxes = a.tasks.map((t) => {
      const wrap = el('div', 'lab-task'), l = el('label', 'rubric'), c = el('input'); c.type = 'checkbox';
      l.append(c, el('span', null, t.task)); wrap.appendChild(l);
      const d = el('details', 'hint'); d.appendChild(el('summary', null, 'Hint and what you should see'));
      d.appendChild(el('div', null, t.hint)); wrap.appendChild(d);
      body.appendChild(wrap); return c;
    });
    const out = el('div', 'fb');
    boxes.forEach((b) => b.addEventListener('change', () => {
      const n = boxes.filter((x) => x.checked).length;
      out.className = 'fb ' + (n === boxes.length ? 'ok' : '');
      out.innerHTML = n + ' of ' + boxes.length + ' tasks done.';
      if (n === boxes.length) done();
    }));
    body.appendChild(out);
  };

  // ====================================================================
  // mount
  // ====================================================================
  Object.keys(X.sections).forEach((key) => {
    const section = document.getElementById(key);
    const acts = X.sections[key];
    if (!section || !acts.length) return;
    const wrap = el('div', 'play' + (section.classList.contains('col') ? '' : ' wide'));
    wrap.appendChild(el('h3', 'play-h', 'Play: ' + acts.length + (acts.length === 1 ? ' activity' : ' activities')));
    acts.forEach((a) => {
      const card = el('article', 'act act-' + a.type);
      card.id = 'act-' + a.id;
      card.appendChild(el('div', 'act-head', '<span class="act-type">' + LABEL[a.type] + '</span><h4>' + a.title + '</h4><span class="act-done">Done</span>'));
      const body = el('div', 'act-body');
      card.appendChild(body);
      if (state[MOD][a.id]) card.classList.add('done');
      R[a.type](body, a, () => markDone(a, card));
      wrap.appendChild(card);
    });
    const pager = section.querySelector('.pager');
    if (pager) pager.before(wrap); else section.appendChild(wrap);
  });

  buildBar();
})();
