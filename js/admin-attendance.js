import { element } from './route-ui.js?v=20260921-4';
import { adminCall,adminError } from './admin-api.js?v=20260921-4';
import { nfcDestination } from './nfc-path.js?v=20260921-4';
export function attendancePanel(activity,current){
 const section=element('section',undefined,'panel');section.append(element('h3','CONTROL DE ASISTENCIA'));
 const state=element('p','Consultando estado…'),content=element('div'),message=element('p');message.setAttribute('role','status');
 section.append(state,content,message);let busy=false;
 function render(control){
  state.textContent=control.attendance_enabled?'ASISTENCIA ACTIVA':'ASISTENCIA CERRADA';content.replaceChildren();
  const url=new URL(nfcDestination(`${activity.scenario}/${activity.slug}`,control.point_token),location.href);
  const label=element('label','URL PARA NFC / QR'),input=element('input');input.value=url.href;input.readOnly=true;label.append(input);
  const link=element('a','ABRIR URL NFC / QR ↗','text-link');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
  content.append(label,link,element('p','La agenda es informativa. Abrir o cerrar asistencia no cambia horarios ni elimina registros.'));
  const toggle=element('button',control.attendance_enabled?'CERRAR ASISTENCIA':'HABILITAR ASISTENCIA','btn');toggle.type='button';content.append(toggle);
  const confirmation=element('div');confirmation.hidden=true;confirmation.setAttribute('role','group');
  const text=element('p',control.attendance_enabled?'¿Cerrar el registro de asistencia? Ya no se aceptarán nuevas asistencias hasta que vuelvas a habilitarlo.':'¿Habilitar el registro de asistencia para esta actividad? Las personas que accedan mediante el NFC o QR de esta actividad podrán confirmar su presencia.');
  const cancel=element('button','CANCELAR','btn btn-outline'),confirm=element('button',control.attendance_enabled?'CERRAR ASISTENCIA':'HABILITAR','btn');cancel.type=confirm.type='button';
  confirmation.append(text,cancel,confirm);content.append(confirmation);
  toggle.onclick=()=>{if(busy)return;confirmation.hidden=false;toggle.hidden=true;cancel.focus();};
  cancel.onclick=()=>{if(busy)return;confirmation.hidden=true;toggle.hidden=false;toggle.focus();};
  confirm.onclick=async()=>{
   if(busy||!current())return;busy=true;cancel.disabled=confirm.disabled=true;message.textContent='Actualizando asistencia…';
   try{const next=await adminCall('admin_set_attendance_enabled',{p_activity_id:activity.id,p_enabled:!control.attendance_enabled});
    if(current()){render(next);message.textContent='Estado guardado.';}}
   catch(error){if(current())message.textContent=adminError(error);}
   finally{busy=false;cancel.disabled=confirm.disabled=false;}
  };
  content.append(element('h4','HISTORIAL DE APERTURAS Y CIERRES'));
  if(!control.audit?.length)content.append(element('p','Sin cambios de estado registrados.'));
  for(const row of control.audit||[]){const name=[row.nombre,row.apellidos].filter(Boolean).join(' ');content.append(element('p',`${row.enabled?'ABRIÓ':'CERRÓ'} · ${name||'Administrador'} (${row.changed_by||'cuenta eliminada'}) · ${new Date(row.changed_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})} · Ciudad de México`));}
 }
 void adminCall('admin_get_attendance_control',{p_activity_id:activity.id}).then(control=>{if(current())render(control);}).catch(error=>{if(current()){state.textContent='No se pudo consultar el control de asistencia.';message.textContent=adminError(error);}});
 return section;
}
