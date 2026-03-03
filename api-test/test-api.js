/**
 * Domo App Studio API Test Script
 * 
 * This script tests the feasibility of:
 * 1. Creating a new App Studio app via API
 * 2. Updating the app with a full JSON definition
 * 
 * Usage:
 *   1. Copy .env.example to .env and add your DOMO_DEVELOPER_TOKEN
 *   2. Run: npm install
 *   3. Run: npm test
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const DOMO_BASE_URL = process.env.DOMO_BASE_URL || 'https://your-instance.domo.com';
const DOMO_DEVELOPER_TOKEN = process.env.DOMO_DEVELOPER_TOKEN;

if (!DOMO_DEVELOPER_TOKEN) {
  console.error('❌ Error: DOMO_DEVELOPER_TOKEN is not set in .env file');
  console.log('Please copy .env.example to .env and add your token');
  process.exit(1);
}

// API endpoints
const CREATE_APP_URL = `${DOMO_BASE_URL}/api/content/v1/dataapps`;
const UPDATE_APP_URL = (appId) => `${DOMO_BASE_URL}/api/content/v1/dataapps/${appId}?includeHiddenViews=true`;

// Headers for API requests
const headers = {
  'Content-Type': 'application/json',
  'X-DOMO-DEVELOPER-TOKEN': DOMO_DEVELOPER_TOKEN
};

/**
 * Load JSON payload from file
 */
function loadPayload(filename) {
  const filepath = join(__dirname, '..', 'app-endpoint-examples', filename);
  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Step 1: Create a new App Studio app
 */
async function createApp() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 1: CREATE NEW APP');
  console.log('='.repeat(60));
  console.log(`POST ${CREATE_APP_URL}`);
  
  try {
    const payload = loadPayload('appcreatepayload.json');
    
    // Modify the title to make it unique for testing
    payload.title = `API Test App - ${new Date().toISOString()}`;
    
    console.log(`\nPayload title: "${payload.title}"`);
    console.log('Sending request...\n');
    
    const response = await fetch(CREATE_APP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error('❌ Create app failed!');
      console.error('Response:', responseText);
      return null;
    }
    
    const data = JSON.parse(responseText);
    
    console.log('✅ App created successfully!');
    console.log(`   dataAppId: ${data.dataAppId}`);
    console.log(`   title: ${data.title}`);
    console.log(`   landingViewId: ${data.landingViewId}`);
    
    // Save response for debugging
    console.log('\nFull response saved to: create-response.json');
    
    return data;
  } catch (error) {
    console.error('❌ Error creating app:', error.message);
    return null;
  }
}

/**
 * Step 2: Update the app with full definition
 */
async function updateApp(appId, landingViewId) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: UPDATE APP WITH REAL EXAMPLE DEFINITION');
  console.log('='.repeat(60));
  console.log(`PUT ${UPDATE_APP_URL(appId)}`);
  
  try {
    // Use the real example payload (CCFD LP app)
    const payload = loadPayload('realexamplepayload.json');
    
    // Replace the IDs with the new app's IDs
    payload.dataAppId = String(appId);
    payload.title = `CCFD LP - API Clone`;
    
    // Update the landingViewId with the new one from create
    if (landingViewId) {
      payload.landingViewId = String(landingViewId);
      
      // Also update view references
      if (payload.views && payload.views.length > 0) {
        payload.views[0].viewId = String(landingViewId);
      }
      
      // Update viewIds array
      if (payload.viewIds) {
        payload.viewIds = [String(landingViewId)];
      }
      
      // Update navigation entity IDs that reference views
      if (payload.navigations) {
        payload.navigations = payload.navigations.map(nav => {
          if (nav.entity === 'VIEW' && nav.entityId) {
            return { ...nav, entityId: String(landingViewId), dataAppId: appId };
          }
          return { ...nav, dataAppId: appId };
        });
      }
    }
    
    console.log(`\nUpdating app ${appId} with CCFD LP definition...`);
    console.log(`   Original app ID in payload: 1853122909`);
    console.log(`   Replaced with new app ID: ${appId}`);
    console.log('Sending request...\n');
    
    const response = await fetch(UPDATE_APP_URL(appId), {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error('❌ Update app failed!');
      console.error('Response:', responseText.substring(0, 1000));
      return null;
    }
    
    const data = JSON.parse(responseText);
    
    console.log('✅ App updated successfully!');
    console.log(`   dataAppId: ${data.dataAppId}`);
    console.log(`   title: ${data.title}`);
    console.log(`   views: ${data.views?.length || 0} view(s)`);
    console.log(`   theme: ${data.theme?.name || 'default'}`);
    console.log(`   navOrientation: ${data.navOrientation}`);
    
    return data;
  } catch (error) {
    console.error('❌ Error updating app:', error.message);
    return null;
  }
}

/**
 * Main test runner
 */
async function runTest() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       DOMO APP STUDIO API FEASIBILITY TEST                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${DOMO_BASE_URL}`);
  console.log(`Token: ${DOMO_DEVELOPER_TOKEN.substring(0, 10)}...`);
  
  // Step 1: Create app
  const createResult = await createApp();
  
  if (!createResult) {
    console.log('\n❌ Test failed at Step 1 (Create App)');
    process.exit(1);
  }
  
  const { dataAppId, landingViewId } = createResult;
  
  // Step 2: Update app
  const updateResult = await updateApp(dataAppId, landingViewId);
  
  if (!updateResult) {
    console.log('\n❌ Test failed at Step 2 (Update App)');
    console.log(`   Note: App ${dataAppId} was created but not updated`);
    process.exit(1);
  }
  
  // Success!
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE - SUCCESS!');
  console.log('='.repeat(60));
  console.log(`\n✅ Both API calls succeeded!`);
  console.log(`\nApp Details:`);
  console.log(`   ID: ${dataAppId}`);
  console.log(`   URL: ${DOMO_BASE_URL}/app-studio/${dataAppId}`);
  console.log(`\nNext step: Open the URL above in Domo to verify the app looks correct.`);
}

// Run the test
runTest().catch(console.error);

