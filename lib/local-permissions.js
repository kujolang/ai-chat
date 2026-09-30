const path = require('node:path');
const acknowledgements = {
 skip_allowlist: 'ALLOW UNRESTRICTED COMMANDS',
 allow_destructive: 'ALLOW DESTRUCTIVE COMMANDS'
};
function createLocalPermissions(db) {
 db.exec('CREATE TABLE IF NOT EXISTS local_command_permissions (id INTEGER PRIMARY KEY CHECK(id=1), skip_allowlist INTEGER NOT NULL DEFAULT 0, allow_destructive INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO local_command_permissions(id) VALUES(1)');
 const read = () => {
  const row=db.prepare('SELECT skip_allowlist, allow_destructive FROM local_command_permissions WHERE id=1').get();
  return {skip_allowlist:row.skip_allowlist===1,allow_destructive:row.skip_allowlist===1 && row.allow_destructive===1};
 };
 const update = db.transaction((input) => {
  if (!input || typeof input.skip_allowlist!=='boolean' || typeof input.allow_destructive!=='boolean') throw invalid('Both permission switches must be booleans.');
  if(input.allow_destructive && !input.skip_allowlist) throw invalid('Destructive mode requires unrestricted commands.');
  const previous=read();
  for(const key of Object.keys(acknowledgements)) {
   if(input[key] && !previous[key] && input[`${key}_confirmation`]!==acknowledgements[key]) throw invalid(`Type ${acknowledgements[key]} to enable this permission.`);
  }
  db.prepare('UPDATE local_command_permissions SET skip_allowlist=?, allow_destructive=? WHERE id=1').run(+input.skip_allowlist,+input.allow_destructive);
  return read();
 });
 return {read,update};
}
function invalid(message) {return Object.assign(new Error(message),{code:'invalid_local_permissions',status:400});}

// Accident-prevention guard only: interpreters, scripts and otherwise innocent
// programs can have destructive effects. This is not an execution sandbox.
function destructiveCommand(command, args) {
 const name=path.basename(command).toLowerCase().replace(/\.exe$/,'');
 if (['rm','rmdir','unlink','shred','dd','mkfs','fdisk','sfdisk','parted','wipefs','format','diskpart','shutdown','reboot','poweroff','halt','killall','pkill','sudo','su','doas'].includes(name) || name.startsWith('mkfs.')) return true;
 if (name==='diskutil' && args.some(a=>/^(erase|partition|zero|secureerase)/i.test(a))) return true;
 if (['chmod','chown','chgrp'].includes(name) && args.some(a=>a==='--recursive'||/^-[^-]*R/.test(a))) return true;
 if (name==='git' && (args.some(a=>/^--(?:hard|force)(?:=|$)/.test(a)) || args.includes('clean') || args.includes('-f') || args.includes('-D'))) return true;
 if (name==='find' && args.some(a=>['-delete','-exec','-execdir','-ok','-okdir'].includes(a))) return true;
 if (name==='systemctl' && args.some(a=>['reboot','poweroff','halt','rescue','emergency'].includes(a))) return true;
 // Shell/wrapper commands can hide the command being checked. Require the
 // second acknowledgement rather than pretending to parse arbitrary programs.
 if (['sh','bash','zsh','fish','dash','ksh','cmd','powershell','pwsh','env','xargs','busybox','command','exec'].includes(name)) return true;
 return false;
}
module.exports={createLocalPermissions,destructiveCommand};
