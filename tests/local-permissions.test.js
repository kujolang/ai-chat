const test=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {createLocalPermissions,destructiveCommand}=require('../lib/local-permissions');
test('permissions default off, require separate acknowledgements and survive store reopen',()=>{
 const db=new Database(':memory:');
 try {
  const p=createLocalPermissions(db);
  assert.deepEqual(p.read(),{skip_allowlist:false,allow_destructive:false});
  assert.throws(()=>p.update({skip_allowlist:true,allow_destructive:false}),/ALLOW UNRESTRICTED/);
  assert.throws(()=>p.update({skip_allowlist:false,allow_destructive:true}),/requires/);
  p.update({skip_allowlist:true,allow_destructive:false,skip_allowlist_confirmation:'ALLOW UNRESTRICTED COMMANDS'});
  assert.throws(()=>p.update({skip_allowlist:true,allow_destructive:true}),/ALLOW DESTRUCTIVE/);
  p.update({skip_allowlist:true,allow_destructive:true,allow_destructive_confirmation:'ALLOW DESTRUCTIVE COMMANDS'});
  assert.deepEqual(createLocalPermissions(db).read(),{skip_allowlist:true,allow_destructive:true});
  p.update({skip_allowlist:false,allow_destructive:false});
  assert.throws(()=>p.update({skip_allowlist:true,allow_destructive:true,skip_allowlist_confirmation:'ALLOW UNRESTRICTED COMMANDS'}),/ALLOW DESTRUCTIVE/);
  assert.deepEqual(p.read(),{skip_allowlist:false,allow_destructive:false});
  assert.throws(()=>p.update({skip_allowlist:'true',allow_destructive:false}),/booleans/);
 }finally{db.close();}
});
test('known destructive commands and wrappers are guarded without pretending to sandbox runtimes',()=>{
 for(const [cmd,args] of [['/bin/rm',['-rf','/']],['git',['reset','--hard']],['git',['reset','--hard=HEAD']],['find',['.','-delete']],['git',['clean','-fd']],['diskutil',['eraseDisk']],['/sbin/mkfs.ext4',[]],['chmod',['-R','777','.']],['bash',['-c','anything']],['env',['rm','file']]]) assert.equal(destructiveCommand(cmd,args),true,cmd);
 for(const [cmd,args] of [['go',['run','main.go']],['kujo',['run','main.kujo']],['git',['status']],['/tmp/custom-benchmark',[]]]) assert.equal(destructiveCommand(cmd,args),false,cmd);
});
