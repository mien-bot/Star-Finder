#!/usr/bin/env node
/**
 * HYLO-SP API Test Script
 * 
 * Run this to verify your API keys are working:
 *   node scripts/test-apis.js
 * 
 * Or add execute permission and run directly:
 *   chmod +x scripts/test-apis.js
 *   ./scripts/test-apis.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local if exists
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

console.log('\n🧪 HYLO-SP API Test\n');
console.log('='.repeat(50));

// Test 1: Check if any API key is configured
const hasOpenAI = !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key');
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your-key');
const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY.includes('your-key');

console.log('\n📋 API Key Status:\n');

console.log(`  ${hasOpenAI ? '✅' : '⚪'} OpenAI (GPT-4V): ${hasOpenAI ? 'Configured' : 'Not configured'}`);
console.log(`  ${hasAnthropic ? '✅' : '⚪'} Anthropic (Claude): ${hasAnthropic ? 'Configured' : 'Not configured'}`);
console.log(`  ${hasGoogle ? '✅' : '⚪'} Google (Gemini): ${hasGoogle ? 'Configured' : 'Not configured'}`);

if (!hasOpenAI && !hasAnthropic && !hasGoogle) {
  console.log('\n⚠️  No API keys found. The app will run in DEMO mode.');
  console.log('\n📝 To add API keys:');
  console.log('   1. Copy .env.example to .env.local');
  console.log('   2. Add your API key(s)');
  console.log('   3. Restart the dev server');
  console.log('\n📖 See SETUP.md for instructions.\n');
  process.exit(0);
}

// Test 2: Try calling the APIs
console.log('\n🔌 Testing API Connections...\n');

async function testOpenAI() {
  if (!hasOpenAI) return null;
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });
    if (response.ok) {
      console.log('  ✅ OpenAI: Connected');
      return true;
    } else {
      console.log(`  ❌ OpenAI: Error ${response.status}`);
      return false;
    }
  } catch (e) {
    console.log('  ❌ OpenAI: Connection failed');
    return false;
  }
}

async function testAnthropic() {
  if (!hasAnthropic) return null;
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }]
      })
    });
    if (response.ok || response.status === 400) {
      console.log('  ✅ Anthropic: Connected');
      return true;
    } else {
      console.log(`  ❌ Anthropic: Error ${response.status}`);
      return false;
    }
  } catch (e) {
    console.log('  ❌ Anthropic: Connection failed');
    return false;
  }
}

async function testGoogle() {
  if (!hasGoogle) return null;
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`);
    if (response.ok) {
      console.log('  ✅ Google: Connected');
      return true;
    } else {
      console.log(`  ❌ Google: Error ${response.status}`);
      return false;
    }
  } catch (e) {
    console.log('  ❌ Google: Connection failed');
    return false;
  }
}

const results = await Promise.all([testOpenAI(), testAnthropic(), testGoogle()]);

const workingApis = results.filter(r => r === true).length;

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Result: ${workingApis} API(s) working\n`);

if (workingApis > 0) {
  console.log('🎉 Your Vision API is ready! Restart the app and');
  console.log('   upload a satellite image to test real building detection.\n');
} else {
  console.log('⚠️  API keys configured but connections failed.');
  console.log('   Check your keys and try again.\n');
}

process.exit(workingApis > 0 ? 0 : 1);
