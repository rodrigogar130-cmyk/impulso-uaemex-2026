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
  const next=new URLSearchParams(location.search).get('next');
  if (['admin','account','passport'].includes(next)) parameters.set('next',next);
  const query = parameters.toString();
  return page + (query ? '?' + query : '');
}
export function googleReturnPath() {
  const slug = requestedActivity();
  if (slug) rememberActivity(slug);
  return authLink('completar-registro.html', slug);
}
export function afterLogin() {
  const next=new URLSearchParams(location.search).get('next');
  const destinations={admin:'admin.html',account:'mi-cuenta.html',passport:'pasaporte.html'};
  return (Object.hasOwn(destinations,next)?destinations[next]:null) || routeDestination(requestedActivity()) || 'mi-cuenta.html';
}
export function privateDestination(){
  const file=location.pathname?.split('/').pop();
  return ['mi-cuenta.html','pasaporte.html','admin.html'].includes(file)?file:afterLogin();
}
export function privacyLink(destination=privateDestination()){
  const params=new URLSearchParams();
  const destinations={'admin.html':'admin','mi-cuenta.html':'account','pasaporte.html':'passport'};
  const next=Object.hasOwn(destinations,destination)?destinations[destination]:null;
  const activity=/^index\.html\?activity=([a-z0-9-]{1,180})#arma-tu-ruta$/.exec(destination)?.[1];
  if(next)params.set('next',next);else if(activity)params.set('activity',activity);
  return 'aceptar-privacidad.html'+(params.toString()?'?'+params:'');
}
export function confirmationPath() {
  const slug = requestedActivity();
  return 'login.html?confirmed=1' + (slug ? '&activity=' + encodeURIComponent(slug) : '');
}
export function preserveAuthLinks() {
  const slug = requestedActivity();
  if (!slug && !['admin','account','passport'].includes(new URLSearchParams(location.search).get('next'))) return;
  document.querySelectorAll('a[href="login.html"],a[href="registro.html"]').forEach(link => {
    link.href = authLink(link.getAttribute('href'), slug);
  });
}

export function rememberActivity(slug){
  if(!routeDestination(slug))return;
  try{sessionStorage.setItem('impulso-route-intent',JSON.stringify({slug,section:'arma-tu-ruta'}));}catch{}
}
