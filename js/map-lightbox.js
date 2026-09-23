(() => {
  const dialog = document.getElementById('map-dialog');
  if (!dialog) return;
  const viewport = dialog.querySelector('.map-dialog-viewport');
  const zoom = dialog.querySelector('[data-map-zoom]');
  const close = dialog.querySelector('[data-map-close]');
  let trigger;
  let scrollY = 0;
  let savedStyles;
  const properties = ['position', 'top', 'left', 'right', 'overflow'];

  document.querySelectorAll('[data-map-open]').forEach(button => {
    button.addEventListener('click', () => {
      if (dialog.open) return;
      trigger = button;
      scrollY = window.scrollY;
      savedStyles = properties.map(key => document.body.style[key]);
      dialog.showModal();
      Object.assign(document.body.style, {position:'fixed', top:`-${scrollY}px`, left:'0', right:'0', overflow:'hidden'});
      close.focus();
    });
  });
  close.addEventListener('click', () => dialog.close());
  let backdropPress = false;
  dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
  dialog.addEventListener('click', event => {
    if (backdropPress && event.target === dialog) dialog.close();
    backdropPress = false;
  });
  zoom.addEventListener('click', () => {
    const enlarged = viewport.classList.toggle('is-zoomed');
    zoom.setAttribute('aria-pressed', String(enlarged));
    zoom.textContent = enlarged ? 'Ajustar mapa' : 'Ampliar detalles';
  });
  dialog.addEventListener('close', () => {
    viewport.classList.remove('is-zoomed');
    viewport.scrollTop = viewport.scrollLeft = 0;
    zoom.setAttribute('aria-pressed', 'false');
    zoom.textContent = 'Ampliar detalles';
    if (savedStyles) properties.forEach((key, index) => { document.body.style[key] = savedStyles[index]; });
    window.scrollTo({top:scrollY, behavior:'instant'});
    trigger?.focus({preventScroll:true});
  });
})();
