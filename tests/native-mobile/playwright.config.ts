import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: '*.spec.ts', outputDir:'../../apps/mobile/build/native-tests', timeout:420000, workers:1, reporter:[['list']], projects:[{name:'android'},{name:'ios'}] });
