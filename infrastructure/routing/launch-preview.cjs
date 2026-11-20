const fs = require('node:fs');
const Module = require('node:module');
const entry = '/root/barbacue/apps/web/server-routing-preview.js';
const wrapper = new Module(entry, module);
wrapper.filename = entry;
wrapper.paths = Module._nodeModulePaths('/root/barbacue/apps/web');
wrapper._compile(fs.readFileSync(__dirname + '/server.candidate.js', 'utf8'), entry);
