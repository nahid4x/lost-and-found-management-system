export async function sendMail(to,subject,text){
  if(!process.env.RESEND_API_KEY){if(process.env.NODE_ENV!=="production")console.log("[mail not configured]",to,subject,text);return false}
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.MAIL_FROM,to,subject,text})});
  return r.ok;
}
