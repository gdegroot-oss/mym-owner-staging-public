import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('./',import.meta.url));
try {
 const manifest=JSON.parse(await readFile(path.join(root,'MANIFEST.json'),'utf8'));
 const walk=async(dir)=>{const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='.git'&&path.resolve(dir)===path.resolve(root))continue;if(entry.isSymbolicLink())throw Error('SYMLINK');const p=path.join(dir,entry.name);result.push(...(entry.isDirectory()?await walk(p):[path.relative(root,p).split(path.sep).join('/')]));}return result;};
 const files=await walk(root);
 if(files.length!==Object.keys(manifest.files).length+1 || files.some(p=>p!=='MANIFEST.json'&&!manifest.files[p]))throw Error('UNEXPECTED_FILES');
 for(const [p,hash] of Object.entries(manifest.files))if(createHash('sha256').update(await readFile(path.join(root,p))).digest('hex')!==hash)throw Error('INTEGRITY');
 if(process.env.OWNER_STAGING_REVISION&&process.env.OWNER_STAGING_REVISION!==manifest.sourceHead)throw Error('REVISION');
 if(process.env.RAILWAY_GIT_COMMIT_SHA&&process.env.RAILWAY_GIT_COMMIT_SHA!==manifest.sourceHead)throw Error('REVISION');
 process.env.OWNER_STAGING_REVISION=manifest.sourceHead;
 const {stagingServer}=await import('./tools/owner-staging.mjs');
 const port=Number(process.env.PORT||8080);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT');
 const server=await stagingServer();server.on('error',()=>{console.error('OWNER_STAGING_LISTENER_FAILED');process.exitCode=1;});
 server.listen(port,'0.0.0.0',()=>console.log('OWNER STAGING · SYNTHETIC ready'));
 const stop=()=>{server.close();server.closeAllConnections();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch{console.error('OWNER_STAGING_STARTUP_DENIED');process.exitCode=1;}
