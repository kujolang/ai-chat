const path=require('node:path'),{randomUUID}=require('node:crypto');
async function save(file,value,io=require('node:fs/promises')){
 const encoded=JSON.stringify(value);if(encoded===undefined)throw new TypeError('not JSON');
 const bytes=Buffer.from(encoded);const temp=path.join(path.dirname(file),'.save-'+randomUUID());let handle,owned=false,error;
 try{handle=await io.open(temp,'wx');owned=true;let offset=0;while(offset<bytes.length){const {bytesWritten}=await handle.write(bytes,offset,bytes.length-offset,null);if(!Number.isInteger(bytesWritten)||bytesWritten<=0)throw Error('no progress');offset+=bytesWritten;}await handle.close();handle=null;await io.rename(temp,file);owned=false;}
 catch(e){error=e;throw e;}
 finally{if(handle)try{await handle.close();}catch(e){if(!error)throw e;}if(owned)try{await io.unlink(temp);}catch(e){if(e.code!=='ENOENT'&&!error)throw e;}}
}
module.exports={save};
