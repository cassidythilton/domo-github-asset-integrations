/**
 * Domo App Studio DUPLICATE API Test Script
 * 
 * Tests the duplicate endpoint to create a copy of an existing app
 * 
 * Usage:
 *   1. Ensure .env has DOMO_DEVELOPER_TOKEN
 *   2. Run: node test-duplicate.js
 */

import { config } from 'dotenv';

// Load environment variables
config();

// Configuration
const DOMO_BASE_URL = process.env.DOMO_BASE_URL || 'https://your-instance.domo.com';
const DOMO_DEVELOPER_TOKEN = process.env.DOMO_DEVELOPER_TOKEN;

if (!DOMO_DEVELOPER_TOKEN) {
  console.error('❌ Error: DOMO_DEVELOPER_TOKEN is not set in .env file');
  process.exit(1);
}

// Source app to duplicate — replace with a valid app ID from your instance
const SOURCE_APP_ID = process.env.DOMO_SOURCE_APP_ID || 0;

// API endpoint
const DUPLICATE_URL = `${DOMO_BASE_URL}/api/content/v1/dataapps/${SOURCE_APP_ID}/duplicate`;

// Headers for API requests
const headers = {
  'Content-Type': 'application/json',
  'X-DOMO-DEVELOPER-TOKEN': DOMO_DEVELOPER_TOKEN
};

/**
 * Duplicate an existing App Studio app
 */
async function duplicateApp() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       DOMO APP STUDIO DUPLICATE API TEST                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${DOMO_BASE_URL}`);
  console.log(`Source App ID: ${SOURCE_APP_ID}`);
  console.log(`Token: ${DOMO_DEVELOPER_TOKEN.substring(0, 10)}...`);
  
  console.log('\n' + '='.repeat(60));
  console.log('DUPLICATE APP');
  console.log('='.repeat(60));
  console.log(`PUT ${DUPLICATE_URL}`);
  
  const payload = {
    title: `DUPLICATED API - ${new Date().toISOString()}`,
    duplicateCards: false,
    beacon: Math.floor(Math.random() * 9000000000) + 1000000000,
    cardPrefix: ""
  };
  
  console.log(`\nPayload:`);
  console.log(JSON.stringify(payload, null, 2));
  console.log('\nSending request...\n');
  
  try {
    const response = await fetch(DUPLICATE_URL, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response length: ${responseText.length} chars`);
    
    if (!response.ok) {
      console.error('❌ Duplicate app failed!');
      console.error('Response:', responseText.substring(0, 2000));
      return null;
    }
    
    // Handle empty or non-JSON response
    if (!responseText || responseText.trim() === '') {
      console.log('✅ Request succeeded but response was empty.');
      console.log('   The duplicate may have been created - check Domo manually.');
      return { success: true, empty: true };
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('✅ Request succeeded but response was not JSON:');
      console.log(responseText.substring(0, 500));
      return { success: true, raw: responseText };
    }
    
    console.log('✅ App duplicated successfully!');
    console.log(`   dataAppId: ${data.dataAppId}`);
    console.log(`   title: ${data.title}`);
    console.log(`   views: ${data.views?.length || 0} view(s)`);
    console.log(`   theme: ${data.theme?.name || 'default'}`);
    console.log(`   navOrientation: ${data.navOrientation}`);
    
    // Show view details
    if (data.views && data.views.length > 0) {
      console.log(`\n   View details:`);
      data.views.forEach((v, i) => {
        console.log(`     [${i}] ${v.title} (viewId: ${v.viewId})`);
        console.log(`         layout: ${v.layout ? 'present' : 'null'}`);
        console.log(`         children: ${v.children?.length || 0}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE - SUCCESS!');
    console.log('='.repeat(60));
    console.log(`\nDuplicated App Details:`);
    console.log(`   ID: ${data.dataAppId}`);
    console.log(`   URL: ${DOMO_BASE_URL}/app-studio/${data.dataAppId}`);
    console.log(`\nNext step: Open the URL above in Domo to verify the app has content.`);
    
    return data;
  } catch (error) {
    console.error('❌ Error duplicating app:', error.message);
    return null;
  }
}

// Run the test
duplicateApp().catch(console.error);

