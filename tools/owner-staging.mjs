import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));

export function stagingConfig(env) {
  if (env.OWNER_STAGING_MODE !== 'synthetic-v1') throw Error('STAGING_CONFIG_REQUIRED');
  const url = new URL(env.OWNER_STAGING_ORIGIN || 'invalid:');
  if (url.protocol !== 'https:' || !(url.hostname.endsWith('.up.railway.app') || url.hostname.endsWith('.onrender.com')) || url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('INVALID_STAGING_ORIGIN');
  if (env.RAILWAY_SERVICE_NAME && env.RAILWAY_SERVICE_NAME !== 'mym-owner-staging-synthetic') throw Error('WRONG_STAGING_SERVICE');
  if (Object.entries(env).some(([key,value]) => value && /SUPABASE|DATABASE_URL|HEYGEN|ELEVENLABS|OPENAI|STRIPE|PAYPAL|PROVIDER|VOICE_|ADMIN_|ACCESS_TOKEN|REFRESH_TOKEN|JWT_SECRET|NODE_OPTIONS|SENTRY|ANALYTICS/i.test(key))) throw Error('BACKEND_AUTHORITY_FORBIDDEN');
  return { origin: url.origin, revision: env.RAILWAY_GIT_COMMIT_SHA || env.OWNER_STAGING_REVISION || 'unknown' };
}
export function silentWave(seconds = 60) {
  const b = Buffer.alloc(44 + seconds * 8000 * 2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;
}
export async function stagingServer({env=process.env,checkout=root}={}) {
  const config=stagingConfig(env),files=new Map();
  for(const name of await readdir(path.join(checkout,'public'))) {
    if(/^[a-z0-9-]+\.(js|css|svg)$/.test(name)&&!['data.js','config.js'].includes(name))files.set('/'+name,path.join(checkout,'public',name));
  }
  files.set('/assets/forest-cinematic.webp',path.join(checkout,'public/assets/forest-cinematic.webp'));
  files.set('/data.js',path.join(checkout,'tools/owner-staging-data.mjs'));
  files.set('/__owner/init.js',path.join(checkout,'tools/owner-staging-init.mjs'));
  const html=(await readFile(path.join(checkout,'public/index.html'),'utf8')).replace('<head>','<head><meta name="mym-owner-staging" content="synthetic-v1"><script type="module" src="/__owner/init.js"></script>');
  const wave=silentWave();
  return createServer(async(req,res)=>{
    const reply=(status,body='',type='text/plain')=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?'':body);};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; media-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'");
    if(!['GET','HEAD'].includes(req.method))return reply(405);
    try {
      const pathname=new URL(req.url,config.origin).pathname;
      if(pathname==='/health')return reply(200,JSON.stringify({mode:'owner-staging-synthetic',revision:config.revision}), 'application/json');
      if(req.headers.host!==new URL(config.origin).host || (req.headers.origin&&req.headers.origin!==config.origin) || req.headers['sec-fetch-site']==='cross-site')return reply(403);
      if(pathname==='/'||pathname==='/index.html')return reply(200,html,'text/html; charset=utf-8');
      if(pathname==='/config.js')return reply(200,'export const config=Object.freeze({url:"",key:""});','text/javascript');
      if(pathname==='/api/app-info')return reply(200,JSON.stringify({version:'0.9.0',build:null,feedback_available:false}), 'application/json');
      if(pathname==='/__owner/silence.wav') {
        const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if(req.headers.range&&!match)return reply(416);
        const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),wave.length-1):wave.length-1;
        if(start>end||start>=wave.length)return reply(416);
        res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);
        if(match)res.setHeader('Content-Range',`bytes ${start}-${end}/${wave.length}`);
        return reply(match?206:200,wave.subarray(start,end+1),'audio/wav');
      }
      const file=files.get(pathname);if(!file)return reply(404);
      return reply(200,await readFile(file),/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'image/svg+xml');
    }catch{return reply(503,'Owner staging unavailable.');}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const port=Number(process.env.PORT||8080);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_PORT');
    const server=await stagingServer();server.on('error',()=>{console.error('OWNER_STAGING_LISTENER_FAILED');process.exitCode=1;});
    server.listen(port,'0.0.0.0',()=>console.log('OWNER STAGING · SYNTHETIC ready'));
    const stop=()=>{server.close();server.closeAllConnections();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch{console.error('OWNER_STAGING_STARTUP_DENIED');process.exitCode=1;}
}
