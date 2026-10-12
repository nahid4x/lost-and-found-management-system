const csp="default-src 'self'; script-src 'self' 'unsafe-inline'"+(process.env.NODE_ENV==="production"?"":" 'unsafe-eval'")+"; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
module.exports={poweredByHeader:false,reactStrictMode:true,async headers(){return[{source:"/(.*)",headers:[
{key:"Content-Security-Policy",value:csp},{key:"X-Frame-Options",value:"DENY"},{key:"X-Content-Type-Options",value:"nosniff"},
{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Strict-Transport-Security",value:"max-age=63072000; includeSubDomains"},
{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"}]}]}};
