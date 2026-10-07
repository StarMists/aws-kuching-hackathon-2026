#!/usr/bin/env node
// Read-only packaging inspection. Does not change Git, files, credentials, or remote state.
import {readdir,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const excludeNames=new Set(['.git','node_modules','dist','.wrangler','.vinext','.next','.sites-runtime','.agents','.codex','outputs','work','coverage','.DS_Store']);
const excluded=[];const files=[];const findings=[];
const credentialPatterns=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
 ['google-api-key',/\bAIza[0-9A-Za-z_-]{30,}\b/],
 ['groq-api-key',/\bgsk_[A-Za-z0-9]{30,}\b/],
 ['openai-api-key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{25,}\b/],
 ['github-token',/\b(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}\b/],
 ['npm-auth',/(?:_authToken|_password)\s*=\s*[^\s$][^\s]{8,}/]
];
async function walk(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const abs=path.join(dir,entry.name),rel=path.relative(root,abs).split(path.sep).join('/');
  if(excludeNames.has(entry.name)||entry.name.startsWith('.env')||entry.name.endsWith('.tsbuildinfo')||/^(?:npm|yarn|pnpm)-debug/.test(entry.name)){excluded.push(rel);continue;}
  const st=await lstat(abs);
  if(st.isSymbolicLink()){findings.push({kind:'symlink-review',path:rel});continue;}
  if(st.isDirectory()){await walk(abs);continue;}
  const bytes=await readFile(abs);
  files.push({path:rel,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  if(bytes.length>8*1024*1024)findings.push({kind:'large-input-review',path:rel,size:bytes.length});
  if(/\.(?:[cm]?[jt]sx?|json|md|txt|sql|sh|ya?ml|toml|css)$/.test(entry.name)||entry.name==='.npmrc'){
   const content=bytes.toString('utf8');
   for(const [kind,regex] of credentialPatterns)if(regex.test(content))findings.push({kind,path:rel});
  }
  if(/(?:Docker-Deployment|aitlau_supabase|gsvv|gsv_langchain|\.pem$|id_rsa$)/i.test(rel))findings.push({kind:'unexpected-private-or-upstream-input',path:rel});
 }
}
await walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
const required=['package.json','package-lock.json','README.md','RECOVERY.md','docs/ACCEPTANCE.md','docs/PROVENANCE.md','vendor/shadcn-tailwind-4.13.0.LICENSE.md','build/sites-vite-plugin.LICENSE'];
for(const requiredPath of required)if(!files.some(f=>f.path===requiredPath))findings.push({kind:'required-file-missing',path:requiredPath});
console.log(JSON.stringify({root,files:files.length,bytes:files.reduce((a,f)=>a+f.size,0),excluded,findings,inventory:files},null,2));
process.exitCode=findings.some(f=>f.kind!=='large-input-review')?1:0;
