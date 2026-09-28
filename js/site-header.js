const mount = document.querySelector('#site-navigation');

if (mount) {
  mount.innerHTML = `
    <header class="site-header" id="siteHeader">
      <div class="container nav">
        <a href="index.html#inicio" class="brand" aria-label="Ir al inicio">
          <img class="brand-logo" src="assets/logo-impulso-uaemex.svg" width="425" height="122" alt="Impulso UAEMéx" />
        </a>

        <nav class="nav-links" aria-label="Navegación principal">
          <a href="index.html#evento">El evento</a>
          <a href="index.html#pasaporte" data-auth-passport data-public-href="index.html#pasaporte">Pasaporte digital</a>
          <a href="index.html#escenarios">Escenarios</a>
          <a href="index.html#ponentes">Ponentes</a>
          <a href="index.html#agenda">Agenda</a>
          <a href="index.html#mapa">Ubicación</a>
        </nav>

        <div class="nav-actions">
          <a href="login.html" class="nav-login" data-auth-guest>Iniciar sesión</a>
          <a href="mi-cuenta.html" class="btn btn-primary" data-auth-user hidden>MI CUENTA</a>
          <a class="btn btn-primary magnetic" href="registro.html" data-auth-guest>REGÍSTRATE <span class="arrow">↗</span></a>
          <button class="menu-toggle" id="menuToggle" aria-controls="mobileMenu" aria-label="Abrir menú" aria-expanded="false">☰</button>
        </div>
      </div>
    </header>

    <div class="mobile-menu" id="mobileMenu" aria-hidden="true" inert>
      <nav class="mobile-links">
        <a href="index.html#evento">El evento</a>
        <a href="index.html#pasaporte" data-auth-passport data-public-href="index.html#pasaporte">Pasaporte digital</a>
        <a href="index.html#escenarios">Escenarios</a>
        <a href="index.html#ponentes">Ponentes</a>
        <a href="index.html#agenda">Agenda</a>
        <a href="index.html#mapa">Ubicación</a>
        <a href="login.html" data-auth-guest>Iniciar sesión</a>
        <a href="registro.html" data-auth-guest>Regístrate</a>
        <a href="mi-cuenta.html" data-auth-user hidden>Mi cuenta</a>
      </nav>
      <div class="mobile-meta">
        <span>15 — 16 OCT 2026</span>
        <span>Ciudad Universitaria</span>
      </div>
    </div>`;

  for (const target of mount.querySelectorAll('.nav-actions,.mobile-links')) {
    const link = document.createElement('a');
    link.href = 'admin.html';
    link.textContent = 'Administración';
    link.dataset.adminLink = '';
    link.hidden = true;
    target.append(link);
  }

  const header = document.getElementById('siteHeader');
  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();

  function closeMenu(restoreFocus = false) {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    menu.setAttribute('inert', '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    toggle.textContent = '☰';
    document.body.classList.remove('menu-open');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (menu.classList.contains('open')) { closeMenu(); return; }
    menu.removeAttribute('inert');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Cerrar menú');
    toggle.textContent = '×';
    document.body.classList.add('menu-open');
  });

  document.addEventListener('keydown', event => {
    if (!menu.classList.contains('open')) return;
    if (event.key === 'Escape') { closeMenu(true); return; }
    if (event.key === 'Tab') {
      const links = [toggle, ...menu.querySelectorAll('a')].filter(el => !el.hidden);
      const first = links[0];
      const last = links.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  const desktop = window.matchMedia('(min-width:1101px)');
  const onDesktopChange = event => { if (event.matches) closeMenu(); };
  if (desktop.addEventListener) desktop.addEventListener('change', onDesktopChange);
  else desktop.addListener(onDesktopChange);
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));

  const file = location.pathname?.split('/').pop();
  header.querySelectorAll('a[href]').forEach(link => {
    if (link.getAttribute('href') === file) link.setAttribute('aria-current', 'page');
  });
  menu.querySelectorAll('a[href]').forEach(link => {
    if (link.getAttribute('href') === file) link.setAttribute('aria-current', 'page');
  });
}
