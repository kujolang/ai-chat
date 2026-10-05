const { resolve } = require('./config.cjs');
process.stdout.write(JSON.stringify(resolve(JSON.parse(process.argv[2] || '{}'))) + '\n');
