#!/usr/bin/env node
const { execSync } = require('child_process');
const port = process.env.PORT || 3000;
const listen = `0.0.0.0:${port}`;
execSync(`npx serve dist -s -l ${listen}`, { stdio: 'inherit' });
