// Test-only TypeScript loader. Uses the declared TypeScript dev dependency; never used by the app.
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
export async function resolve(specifier,context,nextResolve){
 try{return await nextResolve(specifier,context);}
 catch(error){
  if((specifier.startsWith('./')||specifier.startsWith('../'))&&!/\.[cm]?[jt]sx?$/.test(specifier)){
   try{return await nextResolve(specifier+'.ts',context);}catch{}
  }
  throw error;
 }
}
export async function load(url,context,nextLoad){
 if(url.startsWith('file:')&&url.endsWith('.ts')){
  const source=await readFile(new URL(url),'utf8');
  return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText};
 }
 return nextLoad(url,context);
}
