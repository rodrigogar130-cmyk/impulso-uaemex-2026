import { getVerifiedSession, onAuthStateChange } from './auth.js?v=20260921-4';
import { getProfile, saveProfile } from './profile.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { afterLogin, preserveAuthLinks } from './return-to.js?v=20260921-4';
import { bindForm, studentFields, profileData, message } from './ui.js?v=20260921-4';
import { hasOAuthError, googleAuthError } from './google-auth.js?v=20260921-4';
import { bindPrivacyCheckbox,requirePrivacyCheckbox } from './privacy-notice.js?v=20260921-4';
import { acknowledgePrivacyNotice } from './privacy.js?v=20260921-4';

preserveAuthLinks();
const content = document.querySelector('#completion-content');
const form = document.querySelector('#completion-form');
bindPrivacyCheckbox(form);
const completionError = 'No pudimos completar tu inscripción en este momento. Inténtalo nuevamente.';
let revision = 0;
function completeProfile(profile) {
  if (!profile) return false;
  try { profileData({ get: key => profile[key] }); return true; } catch { return false; }
}
function hideAccount() {
  revision++;
  content.hidden = true;
  message(googleAuthError, true);
}
async function finish(user, current) {
  const prepared = await prepareAccount(user);
  if (current !== revision) return;
  if(prepared.privacyRequired)return;
  if (!prepared.profile) throw new Error(completionError);
  // Do not override existing registrations (including cancelled ones) or admin permissions.
  location.replace(afterLogin());
}
function text(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

if (hasOAuthError()) {
  message(googleAuthError, true);
} else {
  let verified = false;
  try {
    const session = await getVerifiedSession();
    if (!session?.user.email_confirmed_at) {
      message(googleAuthError, true);
    } else {
      verified = true;
      const user = session.user;
      onAuthStateChange((event, active) => {
        if (event === 'SIGNED_OUT' || !active || active.user.id !== user.id) hideAccount();
      });
      const current = revision;
      const profile = await getProfile(user.id);
      if (current === revision) {
        if (completeProfile(profile)) {
          await finish(user, current);
        } else {
          const metadata = user.user_metadata || {};
          form.elements.nombre.value = text(profile?.nombre || metadata.given_name || metadata.full_name || metadata.name, 100);
          // A full name is only a hint; never infer or invent a surname.
          form.elements.apellidos.value = text(profile?.apellidos || metadata.family_name, 150);
          for (const key of ['tipo_usuario', 'numero_cuenta', 'espacio_academico', 'telefono']) {
            form.elements[key].value = text(profile?.[key], key === 'tipo_usuario' ? 40 : key === 'telefono' ? 30 : key === 'numero_cuenta' ? 40 : 200);
          }
          document.querySelector('#completion-email').textContent = user.email || '';
          studentFields(form);
          content.hidden = false;
          message('');
          bindForm(form, async data => {
            if (current !== revision) return;
            requirePrivacyCheckbox(form);
            const values = profileData(data);
            try {
              const verified = await getVerifiedSession();
              if (current !== revision) return;
              if (!verified?.user.email_confirmed_at || verified.user.id !== user.id) { hideAccount(); return; }
              const latest = await getProfile(verified.user.id);
              if (current !== revision) return;
              try {
                await saveProfile(verified.user.id, values, Boolean(latest));
              } catch (error) {
                // Another tab may have completed the same profile after our read.
                if (error?.code !== '23505' || !completeProfile(await getProfile(verified.user.id))) throw error;
              }
              if (current !== revision) return;
              await acknowledgePrivacyNotice(verified.user.id);
              if (current !== revision) return;
              await finish(verified.user, current);
            } catch {
              if (current === revision) throw new Error(completionError);
            }
          });
        }
      }
    }
  } catch {
    content.hidden = true;
    message(verified ? completionError : googleAuthError, true);
  }
}
