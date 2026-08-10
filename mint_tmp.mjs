import fs from 'fs';
import { SignJWT } from 'jose';
const env = fs.readFileSync('.env.local','utf8');
const get = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^["']|["']$/g,'');
const SECRET = new TextEncoder().encode(get('JWT_SECRET') || 'ba-portal-jwt-secret-change-in-production');
const t = await new SignJWT({ email:get('ADMIN_EMAIL')||'info@gohconsulting.com', role:'admin', v:1 }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(SECRET);
console.log(t);
