#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const port = process.env.PORT || 3000;
const listen = `tcp://0.0.0.0:${port}`;
const distDir = path.resolve(__dirname, '..', 'dist');
execSync(`npx serve "${distDir}" -s -l ${listen}`, { stdio: 'inherit' });
