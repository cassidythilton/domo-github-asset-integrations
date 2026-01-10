/**
 * Code Engine Function: App Studio API
 * Server-side function to access Domo internal APIs
 * 
 * This runs on Domo's servers and can access internal APIs
 * that are blocked by CORS from client-side code.
 */

const codeengine = require('codeengine');

// Handler for listing all App Studio apps
async function listApps(request, response) {
  try {
    const domoClient = codeengine.getDomoClient();
    
    // Use the Domo client to make authenticated API calls
    const apps = await domoClient.fetch(
      '/api/content/v1/dataapps?type=app',
      { method: 'GET' }
    );
    
    response.status(200).json(apps);
  } catch (error) {
    console.error('Error listing apps:', error);
    response.status(500).json({ 
      error: 'Failed to list apps', 
      message: error.message 
    });
  }
}

// Handler for getting a specific app definition
async function getAppDefinition(request, response) {
  try {
    const { appId } = request.body;
    
    if (!appId) {
      return response.status(400).json({ error: 'appId is required' });
    }
    
    const domoClient = codeengine.getDomoClient();
    
    const definition = await domoClient.fetch(
      `/api/content/v1/dataapps/${appId}?authoring=true&includeHiddenViews=true`,
      { method: 'GET' }
    );
    
    response.status(200).json(definition);
  } catch (error) {
    console.error('Error getting app definition:', error);
    response.status(500).json({ 
      error: 'Failed to get app definition', 
      message: error.message 
    });
  }
}

// Handler for updating an app definition
async function updateAppDefinition(request, response) {
  try {
    const { appId, definition } = request.body;
    
    if (!appId || !definition) {
      return response.status(400).json({ error: 'appId and definition are required' });
    }
    
    const domoClient = codeengine.getDomoClient();
    
    const result = await domoClient.fetch(
      `/api/content/v1/dataapps/${appId}?includeHiddenViews=true`,
      { 
        method: 'PUT',
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    response.status(200).json(result);
  } catch (error) {
    console.error('Error updating app:', error);
    response.status(500).json({ 
      error: 'Failed to update app', 
      message: error.message 
    });
  }
}

// Export the handlers
module.exports = {
  listApps,
  getAppDefinition,
  updateAppDefinition
};

