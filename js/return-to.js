const landing = 'index.html';
// Solo este destino interno y slugs conocidos por su formato. Nunca una URL libre.
export function routeDestination(slug) {
  return /^[a-z0-9-]{1,180}$/.test(slug || '') ? `${landing}?activity=${encodeURIComponent(slug)}#arma-tu-ruta` : null;
}
export function requestedActivity() {
  let slug = new URLSearchParams(location.search).get('activity');
  if(!slug){try{slug=JSON.parse(sessionStorage.getItem('impulso-route-intent')||'null')?.slug;}catch{}}

  return routeDestination(slug) ? slug : null;
}
export function authLink(page, slug = requestedActivity()) {
  const parameters = new URLSearchParams();
  if (routeDestination(slug)) parameters.set('activity', slug);
  if (new URLSearchParams(location.search).get('next') === 'admin') parameters.set('next', 'admin');
  const query = parameters.toString();
  return page + (query ? '?' + query : '');
}
export function googleReturnPath() {
  const slug = requestedActivity();
  if (slug) rememberActivity(slug);
  return authLink('completar-registro.html', slug);
}
export function afterLogin() { return new URLSearchParams(location.search).get('next')==='admin' ? 'admin.html' : routeDestination(requestedActivity()) || 'mi-cuenta.html'; }
export function confirmationPath() {
  const slug = requestedActivity();
  return 'login.html?confirmed=1' + (slug ? '&activity=' + encodeURIComponent(slug) : '');
}
export function preserveAuthLinks() {
  const slug = requestedActivity();
  if (!slug && new URLSearchParams(location.search).get('next') !== 'admin') return;
  document.querySelectorAll('a[href="login.html"],a[href="registro.html"]').forEach(link => {
    link.href = authLink(link.getAttribute('href'), slug);
  });
}

export function rememberActivity(slug){
  if(!routeDestination(slug))return;
  try{sessionStorage.setItem('impulso-route-intent',JSON.stringify({slug,section:'arma-tu-ruta'}));}catch{}
}
