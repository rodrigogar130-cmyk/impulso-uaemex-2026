const timezone = 'America/Mexico_City';
const description = 'Actividad seleccionada dentro de tu ruta de IMPULSO UAEMÉX 2026.\n\nConsulta tu Pasaporte Digital en la plataforma.';
function stamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}(:\d{2})?$/.test(time || '')) throw new Error('El horario de esta actividad todavía no está completo.');
  return date.replaceAll('-', '') + 'T' + time.replaceAll(':', '').padEnd(6, '0');
}
export function calendarReady(activity) {
  return Boolean(activity?.id && activity.activity_date && activity.start_time && activity.end_time && activity.end_time > activity.start_time && activity.timezone === timezone);
}
export function googleCalendarUrl(activity) {
  if (!calendarReady(activity)) throw new Error('El horario de esta actividad todavía no está completo.');
  const url = new URL('https://calendar.google.com/calendar/r/eventedit');
  url.search = new URLSearchParams({action:'TEMPLATE',text:`IMPULSO UAEMÉX 2026 · ${activity.title}`,
    dates:`${stamp(activity.activity_date,activity.start_time)}/${stamp(activity.activity_date,activity.end_time)}`,
    stz:timezone,etz:timezone,details:description,location:activity.location || ''}).toString();
  return url.href;
}
export function escapeCalendar(value) {
  return String(value || '').replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
}
export function foldCalendarLine(line) {
  let result='',current='',bytes=0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const length=encoder.encode(char).length;
    if(bytes+length>75){result+=current+'\r\n';current=' ';bytes=1;}
    current+=char;bytes+=length;
  }
  return result+current;
}
export function routeICS(activities, now = new Date()) {
  const unique=[...new Map(activities.map(a=>[a.id,a])).values()];
  if(!unique.length || unique.some(a=>!calendarReady(a))) throw new Error('No hay actividades con horario completo para exportar.');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IMPULSO UAEMEX//Mi Ruta 2026//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'BEGIN:VTIMEZONE','TZID:'+timezone,'X-LIC-LOCATION:'+timezone,'BEGIN:STANDARD','DTSTART:20230101T000000','TZOFFSETFROM:-0600','TZOFFSETTO:-0600','TZNAME:CST','END:STANDARD','END:VTIMEZONE'];
  const timestamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  for(const a of unique) lines.push('BEGIN:VEVENT',`UID:${a.id}@impulso-uaemex-2026`, 'DTSTAMP:'+timestamp,
    `DTSTART;TZID=${timezone}:${stamp(a.activity_date,a.start_time)}`,`DTEND;TZID=${timezone}:${stamp(a.activity_date,a.end_time)}`,
    'SUMMARY:'+escapeCalendar('IMPULSO UAEMÉX 2026 · '+a.title),'DESCRIPTION:'+escapeCalendar(description),'LOCATION:'+escapeCalendar(a.location),
    'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:'+escapeCalendar('Mañana tienes una actividad de IMPULSO UAEMÉX 2026'),'END:VALARM',
    'BEGIN:VALARM','TRIGGER:-PT1H','ACTION:DISPLAY','DESCRIPTION:Tu actividad comienza en una hora','END:VALARM','END:VEVENT');
  lines.push('END:VCALENDAR');return lines.map(foldCalendarLine).join('\r\n')+'\r\n';
}
export function downloadRoute(activities, filename='mi-ruta-impulso-2026.ics') {
  const url=URL.createObjectURL(new Blob([routeICS(activities)],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
