import { getVerifiedSession,onAuthStateChange } from './auth.js?v=20260921-4';
import { ensureProfile } from './profile.js?v=20260921-4';
import { acknowledgePrivacyNotice } from './privacy.js?v=20260921-4';
import { hasCurrentPrivacyAcknowledgement,bindPrivacyCheckbox,requirePrivacyCheckbox } from './privacy-notice.js?v=20260921-4';
import { afterLogin,authLink } from './return-to.js?v=20260921-4';
import { prepareAccount } from './prepare-account.js?v=20260921-4';
import { bindForm,message,errorText } from './ui.js?v=20260921-4';

const form=document.querySelector('#privacy-form');
bindPrivacyCheckbox(form);
let revision=0;
try{
  const session=await getVerifiedSession();
  if(!session?.user.email_confirmed_at){location.replace(authLink('login.html'));}
  else{
    const user=session.user;
    onAuthStateChange((_event,active)=>{
      if(!active||active.user.id!==user.id){revision++;form.hidden=true;location.replace(authLink('login.html'));}
    });
    const current=revision;
    const profile=await ensureProfile(user);
    if(current===revision){
      if(!profile)location.replace(authLink('completar-registro.html'));
      else{
        async function finish(){
          const prepared=await prepareAccount(user);
          if(current!==revision||prepared.privacyRequired)return;
          message('Aviso de Privacidad registrado.');
          location.replace(afterLogin());
        }
        if(hasCurrentPrivacyAcknowledgement(profile))await finish();
        else{
          form.hidden=false;message('');
          bindForm(form,async()=>{
            if(current!==revision)return;
            requirePrivacyCheckbox(form);
            await acknowledgePrivacyNotice(user.id);
            if(current!==revision)return;
            await finish();
          });
        }
      }
    }
  }
}catch(error){message(errorText(error),true);}
