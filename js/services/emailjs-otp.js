/* ============================================================
   EMAILJS — real, free OTP delivery to Gmail (or any inbox)
   Sign up free at https://www.emailjs.com (no card required),
   add an Email Service + a template with vars {{to_email}} and
   {{otp_code}}, then paste the 3 IDs below. Until you do, the
   app runs in demo mode and just shows the code in a toast.
   ============================================================ */
/* EMAILJS_CONFIG → moved to js/config/app-config.js */
let emailjsReady = false;
(function initEmailJs(){
  if(typeof emailjs==='undefined') return;
  if(!EMAILJS_CONFIG.publicKey || EMAILJS_CONFIG.publicKey.indexOf('PASTE_')===0) return;
  try{ emailjs.init({publicKey: EMAILJS_CONFIG.publicKey}); emailjsReady = true; }catch(e){ console.warn('EmailJS init failed', e); }
})();
// Sends a 6-digit code to toEmail. Resolves true if a real email went out,
// false if we fell back to demo mode (still lets the flow continue).
async function sendOtpEmail(toEmail, code){
  if(!emailjsReady){
    showToast('Demo mode — no email service configured', 'Code for '+toEmail+' is '+code+'. Add EmailJS keys in the source to send real emails.', 'danger');
    return false;
  }
  try{
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {to_email: toEmail, otp_code: code});
    showToast('Code sent', 'A 6-digit verification code was emailed to '+toEmail+'.', 'success');
    return true;
  }catch(e){
    console.error('EmailJS send failed', e);
    showToast('Email send failed', 'Could not email a code (showing it here for now): '+code, 'danger');
    return false;
  }
}
function genOtp(){ return String(Math.floor(100000+Math.random()*900000)); }
async function hashPassword(pw){
  try{
    const enc = new TextEncoder().encode('arogya::'+pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){ return 'plain:'+pw; } // ancient-browser fallback
}
