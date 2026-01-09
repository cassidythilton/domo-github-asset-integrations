/**
 * Code Engine Functions for App Studio GitHub Sync
 * Server-side functions to access Domo internal APIs
 * 
 * These functions run on Domo's servers and bypass CORS restrictions
 * that block client-side API calls.
 */

const codeengine = require('codeengine');

// ============================================================================
// Helpers Class
// ============================================================================

class Helpers {
  /**
   * Helper function to handle API requests and errors
   * @param {string} method - The HTTP method (get, post, put, delete)
   * @param {string} url - The endpoint URL
   * @param {Object} [body=null] - The request body
   * @param {Object} [headers={}] - Additional headers
   * @returns {Object} The response data
   * @throws {Error} If the request fails
   */
  static async handleRequest(method, url, body = null, headers = {}) {
    try {
      return await codeengine.sendRequest(method, url, body, headers);
    } catch (error) {
      console.error(`Error with ${method} request to ${url}:`, error);
      throw error;
    }
  }
}

// ============================================================================
// Code Engine Functions
// ============================================================================

/**
 * List all App Studio apps
 * @returns {Array} List of apps
 */
async function listApps() {
  try {
    // Request more apps with limit and offset parameters
    // Also try to get all apps regardless of recent access
    const response = await Helpers.handleRequest(
      'get',
      '/api/content/v1/dataapps?type=app&limit=500&offset=0'
    );
    // API returns { apps: [...] }, extract the array
    const apps = response.apps || [];
    console.log(`listApps returned ${apps.length} apps`);
    return apps;
  } catch (error) {
    console.error('Error listing apps:', error);
    throw error;
  }
}

/**
 * Get app definition by ID
 * Uses PUT request to get the full app definition including all content
 * @param {string} appId - The app ID
 * @returns {Object} The app definition
 */
async function getAppDefinition(appId) {
  try {
    const response = await Helpers.handleRequest(
      'put',
      `/api/content/v1/dataapps/${appId}?includeHiddenViews=true`,
      {},
      { 'Content-Type': 'application/json' }
    );
    return response;
  } catch (error) {
    console.error(`Error getting app definition for ${appId}:`, error);
    throw error;
  }
}

/**
 * Update app definition
 * @param {string} appId - The app ID
 * @param {Object} definition - The new app definition
 * @returns {Object} The updated app
 */
async function updateAppDefinition(appId, definition) {
  try {
    const response = await Helpers.handleRequest(
      'put',
      `/api/content/v1/dataapps/${appId}?includeHiddenViews=true`,
      definition,
      { 'Content-Type': 'application/json' }
    );
    return response;
  } catch (error) {
    console.error(`Error updating app ${appId}:`, error);
    throw error;
  }
}

/**
 * Duplicate an existing app
 * Creates a full copy of the app including all content/layout
 * @param {string} appId - The source app ID to duplicate
 * @param {string} title - The title for the new duplicated app
 * @param {boolean} duplicateCards - Whether to duplicate cards (default false)
 * @returns {Object} Result of the duplicate operation
 */
async function duplicateApp(appId, title, duplicateCards = false) {
  try {
    // Generate a random beacon ID (required by the API)
    const beacon = Math.floor(Math.random() * 9000000000) + 1000000000;
    
    const payload = {
      title: title || `Duplicated App - ${new Date().toISOString()}`,
      duplicateCards: duplicateCards,
      beacon: beacon,
      cardPrefix: ''
    };
    
    console.log('Duplicating app:', appId, 'with payload:', JSON.stringify(payload));
    
    const response = await Helpers.handleRequest(
      'put',
      `/api/content/v1/dataapps/${appId}/duplicate`,
      payload,
      { 'Content-Type': 'application/json' }
    );
    
    console.log('Duplicate response:', JSON.stringify(response));
    
    // The duplicate endpoint returns empty body on success (200 OK)
    // Return success indicator with the source app ID
    return { 
      success: true, 
      sourceAppId: appId, 
      title: payload.title,
      message: 'App duplicated successfully. Check your apps list for the new app.'
    };
  } catch (error) {
    console.error(`Error duplicating app ${appId}:`, error);
    throw error;
  }
}

/**
 * Push app definition to GitHub
 * Creates or updates a file in the specified GitHub repository
 * @param {string} githubToken - GitHub personal access token
 * @param {string} repo - Repository in format "owner/repo"
 * @param {string} branch - Branch name (e.g., "main")
 * @param {string} filePath - File path within the repo (e.g., "asset-definitions/my-app.json")
 * @param {Object} content - The content to save (will be JSON stringified)
 * @param {string} commitMessage - Commit message
 * @returns {Object} Result of the GitHub API call
 */
async function pushToGithub(githubToken, repo, branch, filePath, content, commitMessage) {
  const https = require('https');
  
  const githubApiHost = 'api.github.com';
  const contentPath = `/repos/${repo}/contents/${filePath}`;
  
  // Helper to make GitHub API requests
  const githubRequest = (method, path, body = null) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: githubApiHost,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Domo-AppStudio-GitHub-Sync',
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject({ status: res.statusCode, message: parsed.message || 'GitHub API error' });
            }
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });
      
      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };
  
  try {
    // Check if file exists to get SHA for update
    let sha = null;
    try {
      const existing = await githubRequest('GET', `${contentPath}?ref=${branch}`);
      sha = existing.sha;
    } catch (e) {
      // File doesn't exist, that's okay for new files
      if (e.status !== 404) {
        console.log('Note: Could not check existing file:', e.message);
      }
    }
    
    // Base64 encode the content
    const jsonContent = JSON.stringify(content, null, 2);
    const base64Content = Buffer.from(jsonContent).toString('base64');
    
    // Create or update file
    const payload = {
      message: commitMessage || `Update ${filePath}`,
      content: base64Content,
      branch: branch
    };
    
    if (sha) {
      payload.sha = sha;
    }
    
    const result = await githubRequest('PUT', contentPath, payload);
    
    return {
      success: true,
      message: sha ? 'File updated successfully' : 'File created successfully',
      path: filePath,
      sha: result.content?.sha,
      url: result.content?.html_url
    };
  } catch (error) {
    console.error('Error pushing to GitHub:', error);
    throw error;
  }
}

/**
 * List files in a GitHub repository directory
 * @param {string} githubToken - GitHub personal access token
 * @param {string} repo - Repository in format "owner/repo"
 * @param {string} branch - Branch name (e.g., "main")
 * @param {string} path - Directory path within the repo
 * @returns {Array} List of files in the directory
 */
function listGithubFiles(githubToken, repo, branch, path) {
  const https = require('https');
  
  const cleanPath = (path || '').replace(/^\/|\/$/g, '');
  const apiPath = `/repos/${repo}/contents/${cleanPath}?ref=${branch}`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method: 'GET',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domo-AppStudio-GitHub-Sync'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            resolve([]);
            return;
          }
          
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API returned ${res.statusCode}`));
            return;
          }
          
          const parsed = JSON.parse(data);
          const files = Array.isArray(parsed) ? parsed.filter(f => 
            f.type === 'file' && f.name.endsWith('.json')
          ) : [];
          
          const result = files.map(f => ({
            name: f.name,
            path: f.path,
            sha: f.sha,
            size: f.size,
            downloadUrl: f.download_url
          }));
          
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse GitHub response: ' + e.message));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error('GitHub request failed: ' + e.message));
    });
    
    req.end();
  });
}

/**
 * Get content of a file from GitHub
 * @param {string} githubToken - GitHub personal access token
 * @param {string} repo - Repository in format "owner/repo"
 * @param {string} branch - Branch name (e.g., "main")
 * @param {string} filePath - File path within the repo
 * @returns {Object} File content (decoded from base64)
 */
function getGithubFileContent(githubToken, repo, branch, filePath) {
  const https = require('https');
  
  const apiPath = `/repos/${repo}/contents/${filePath}?ref=${branch}`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method: 'GET',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domo-AppStudio-GitHub-Sync'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API returned ${res.statusCode}`));
            return;
          }
          
          const parsed = JSON.parse(data);
          // Decode base64 content
          const content = Buffer.from(parsed.content, 'base64').toString('utf8');
          resolve({
            name: parsed.name,
            path: parsed.path,
            sha: parsed.sha,
            content: JSON.parse(content)
          });
        } catch (e) {
          reject(new Error('Failed to parse GitHub response: ' + e.message));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error('GitHub request failed: ' + e.message));
    });
    
    req.end();
  });
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  listApps,
  getAppDefinition,
  updateAppDefinition,
  duplicateApp,
  pushToGithub,
  listGithubFiles,
  getGithubFileContent
};
