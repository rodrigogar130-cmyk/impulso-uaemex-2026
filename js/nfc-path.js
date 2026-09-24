const routePattern=/^(cultura|deporte|tecnologia|diseno|investigacion|gobernanza|bienestar)\/([a-z0-9-]{1,180})$/;
export function parseNfcRoute(value){
 const match=typeof value==='string'&&routePattern.exec(value);
 return match?{scenario:match[1],slug:match[2]}:null;
}
export function validPointToken(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function nfcDestination(value,token){
 return parseNfcRoute(value)?'actividad.html?checkin='+encodeURIComponent(value)+(validPointToken(token)?'&t='+token:''):null;
}
