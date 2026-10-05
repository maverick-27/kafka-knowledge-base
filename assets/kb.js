// Kafka knowledge base: shared behaviour (theme, reading position, copy buttons, tape).

const KB = {
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

// ---------- theme ----------
(function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const label = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = dark ? 'Light theme' : 'Dark theme';
  };
  label();
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kb-theme', next); } catch (e) { /* storage blocked: theme lasts for this page only */ }
    label();
  });
})();

// ---------- reading position, shown as a consumer offset ----------
(function initProgress() {
  const holder = document.querySelector('[data-progress]');
  const parts = [...document.querySelectorAll('section.part')];
  if (!holder || !parts.length) return;

  const cells = document.createElement('div');
  cells.className = 'progress-cells';
  const label = document.createElement('div');
  label.className = 'progress-label';
  label.setAttribute('aria-live', 'off');

  const links = parts.map((part, i) => {
    const a = document.createElement('a');
    a.href = '#' + part.id;
    a.textContent = i;
    a.title = part.dataset.title || part.id;
    a.setAttribute('aria-label', 'Section ' + i + ': ' + a.title);
    cells.appendChild(a);
    return a;
  });
  holder.append(cells, label);

  const update = () => {
    const mark = window.scrollY + window.innerHeight * 0.35;
    let current = 0;
    parts.forEach((part, i) => { if (part.offsetTop <= mark) current = i; });
    links.forEach((a, i) => {
      a.classList.toggle('read', i < current);
      a.classList.toggle('current', i === current);
    });
    const lag = parts.length - 1 - current;
    label.textContent = 'your offset ' + current + ' · lag ' + lag;
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

// ---------- copy buttons on commands ----------
document.querySelectorAll('.code').forEach((box) => {
  const pre = box.querySelector('pre');
  if (!pre || !navigator.clipboard) return;
  const btn = document.createElement('button');
  btn.className = 'btn copy';
  btn.type = 'button';
  btn.textContent = 'Copy';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(pre.innerText.trim()).then(() => {
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });
  box.appendChild(btn);
});

// ---------- reveal on scroll ----------
(function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (KB.reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => io.observe(el));
})();

// ---------- the tape: an append-only log that keeps growing ----------
KB.initTape = function (root) {
  const track = root.querySelector('.tape-track');
  const toggle = root.querySelector('[data-tape-toggle]');
  const count = root.querySelector('[data-tape-count]');
  let next = 0;
  let timer = null;

  const append = (animate) => {
    const prev = track.lastElementChild;
    if (prev) prev.classList.remove('new');
    const cell = document.createElement('div');
    cell.className = 'cell new';
    cell.textContent = next++;
    track.appendChild(cell);
    if (track.children.length > 40) track.firstElementChild.remove();
    if (count) count.textContent = next;
    if (animate && !KB.reducedMotion) {
      // Slide the whole tape left by one cell so the append reads as movement.
      const step = cell.getBoundingClientRect().width + 6;
      track.style.transition = 'none';
      track.style.transform = 'translateX(' + step + 'px)';
      track.getBoundingClientRect();
      track.style.transition = 'transform .45s cubic-bezier(.2, .8, .2, 1)';
      track.style.transform = 'translateX(0)';
    }
  };

  for (let i = 0; i < 14; i++) append(false);

  const start = () => { timer = setInterval(() => append(true), 1300); if (toggle) toggle.textContent = 'Pause'; };
  const stop = () => { clearInterval(timer); timer = null; if (toggle) toggle.textContent = 'Resume'; };

  if (KB.reducedMotion) {
    // No auto-play: the reader appends records by hand.
    if (toggle) { toggle.textContent = 'Append one'; toggle.addEventListener('click', () => append(false)); }
    return;
  }
  if (toggle) toggle.addEventListener('click', () => (timer ? stop() : start()));
  start();
};

document.querySelectorAll('[data-tape]').forEach(KB.initTape);
