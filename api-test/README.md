# Domo App Studio API Test

This folder contains a standalone Node.js script to test the feasibility of creating and updating Domo App Studio apps via API.

## Setup

1. **Install dependencies:**
   ```bash
   cd api-test
   npm install
   ```

2. **Create a `.env` file** in this folder with your credentials:
   ```
   DOMO_BASE_URL=https://your-instance.domo.com
   DOMO_DEVELOPER_TOKEN=your_token_here
   ```

   To get your Developer Token:
   - Go to Domo > Admin > Security > Access Tokens
   - Create a new token with appropriate permissions

## Run the Test

```bash
npm test
```

## What the Test Does

1. **Step 1: Create App**
   - POST to `/api/content/v1/dataapps`
   - Uses `appcreatepayload.json` from `app-endpoint-examples/`
   - Returns the new `dataAppId`

2. **Step 2: Update App**
   - PUT to `/api/content/v1/dataapps/{dataAppId}?includeHiddenViews=true`
   - Uses `appupdatepayload.json` from `app-endpoint-examples/`
   - Updates the app with the full definition

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║       DOMO APP STUDIO API FEASIBILITY TEST                 ║
╚════════════════════════════════════════════════════════════╝

STEP 1: CREATE NEW APP
POST https://your-instance.domo.com/api/content/v1/dataapps
✅ App created successfully!
   dataAppId: 12345678

STEP 2: UPDATE APP WITH FULL DEFINITION  
PUT https://your-instance.domo.com/api/content/v1/dataapps/12345678?includeHiddenViews=true
✅ App updated successfully!

TEST COMPLETE - SUCCESS!
```

## Files

- `test-api.js` - Main test script
- `package.json` - Node.js dependencies
- `.env` - Your credentials (create this file)
- `README.md` - This file

## Payloads

The test uses the example payloads from `../app-endpoint-examples/`:
- `appcreatepayload.json` - Payload for creating a new app
- `appupdatepayload.json` - Payload for updating an app
- `appcreateresponse.json` - Example response from create
- `appupdateresponse.json` - Example response from update


