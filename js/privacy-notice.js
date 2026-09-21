export const PRIVACY_NOTICE_VERSION = '2026-09';
export const PRIVACY_REQUIRED_MESSAGE = 'Para continuar, consulta y reconoce el Aviso de Privacidad.';
export function hasCurrentPrivacyAcknowledgement(profile) {
  return Boolean(profile?.privacy_acknowledged_at && profile.privacy_notice_version === PRIVACY_NOTICE_VERSION);
}
export function bindPrivacyCheckbox(form) {
  const checkbox=form.querySelector('[name="privacy_acknowledged"]');
  const validate=()=>checkbox.setCustomValidity?.(checkbox.checked?'':PRIVACY_REQUIRED_MESSAGE);
  checkbox.addEventListener('change',validate);
  validate();
}
export function requirePrivacyCheckbox(form) {
  if(!form.querySelector('[name="privacy_acknowledged"]').checked)throw new Error(PRIVACY_REQUIRED_MESSAGE);
}
