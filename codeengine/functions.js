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
    const response = await Helpers.handleRequest(
      'get',
      '/api/content/v1/dataapps?type=app'
    );
    // API returns { apps: [...] }, extract the array
    return response.apps || [];
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
 * @param {string} filePath - File path within the repo (e.g., "app-definitions/my-app.json")
 * @param {Object} content - The content to save (will be JSON stringified)
 * @param {string} commitMessage - Commit message
 * @returns {Object} Result of the GitHub API call
 */
async function pushToGithub(githubToken, repo, branch, filePath, content, commitMessage) {
  const https = require('https');
  
  const githubApiHost = 'api.github.com';
  
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
  
  // ---- Multi-action handler ----
  // If content has a special __action field, route to list/getContent instead of push
  if (content && content.__action === 'list') {
    // LIST FILES in the directory specified by filePath
    console.log('pushToGithub: routing to LIST action for path:', filePath);
    try {
      const cleanPath = (filePath || '').replace(/^\/|\/$/g, '');
      const listPath = `/repos/${repo}/contents/${cleanPath}?ref=${branch}`;
      const response = await githubRequest('GET', listPath);
      
      if (!Array.isArray(response)) {
        return { files: [] };
      }
      
      const files = response.filter(f => f.type === 'file' && f.name.endsWith('.json'));
      return {
        files: files.map(f => ({
          name: f.name,
          path: f.path,
          sha: f.sha,
          size: f.size,
          type: f.type,
          download_url: f.download_url
        }))
      };
    } catch (error) {
      if (error.status === 404) {
        console.log('Directory not found, returning empty list');
        return { files: [] };
      }
      throw error;
    }
  }
  
  if (content && content.__action === 'getContent') {
    // GET FILE CONTENT at the path specified by filePath
    console.log('pushToGithub: routing to GET_CONTENT action for path:', filePath);
    try {
      const getPath = `/repos/${repo}/contents/${filePath}?ref=${branch}`;
      const response = await githubRequest('GET', getPath);
      return {
        file: {
          name: response.name,
          path: response.path,
          sha: response.sha,
          content: response.content
        }
      };
    } catch (error) {
      throw error;
    }
  }
  
  // ---- Normal PUSH behavior ----
  const contentPath = `/repos/${repo}/contents/${filePath}`;
  
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
 * @returns {Array} List of files
 */
async function listGithubFiles(githubToken, repo, branch, path) {
  const https = require('https');
  
  const cleanPath = (path || '').replace(/^\/|\/$/g, '');
  const reqPath = `/repos/${repo}/contents/${cleanPath}?ref=${branch}`;
  
  console.log('listGithubFiles called:', { repo, branch, path: cleanPath, reqPath, hasToken: !!githubToken });
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: reqPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domo-AppStudio-GitHub-Sync'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('listGithubFiles GitHub status:', res.statusCode, 'data length:', data.length);
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const files = Array.isArray(parsed) ? parsed : [parsed];
            const jsonFiles = files.filter(f => f.type === 'file' && f.name && f.name.endsWith('.json'));
            console.log('listGithubFiles found', jsonFiles.length, 'JSON files out of', files.length, 'total');
            resolve(jsonFiles.map(f => ({
              name: f.name,
              path: f.path,
              sha: f.sha,
              size: f.size,
              type: f.type,
              download_url: f.download_url
            })));
          } else if (res.statusCode === 404) {
            console.log('listGithubFiles: directory not found (404)');
            resolve([]);
          } else {
            console.log('listGithubFiles error:', parsed.message);
            reject({ status: res.statusCode, message: parsed.message || 'GitHub API error' });
          }
        } catch (e) {
          console.log('listGithubFiles parse error:', e.message);
          resolve([]);
        }
      });
    });
    
    req.on('error', (err) => {
      console.log('listGithubFiles request error:', err.message);
      reject(err);
    });
    req.end();
  });
}

/**
 * Get content of a specific file from GitHub
 * @param {string} githubToken - GitHub personal access token
 * @param {string} repo - Repository in format "owner/repo"
 * @param {string} branch - Branch name (e.g., "main")
 * @param {string} filePath - File path within the repo
 * @returns {Object} File content (base64 encoded) and metadata
 */
async function getGithubFileContent(githubToken, repo, branch, filePath) {
  const https = require('https');
  
  const reqPath = `/repos/${repo}/contents/${filePath}?ref=${branch}`;
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: reqPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Domo-AppStudio-GitHub-Sync'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, message: parsed.message || 'GitHub API error' });
          }
        } catch (e) {
          reject(new Error('Failed to parse GitHub response'));
        }
      });
    });
    
    req.on('error', reject);
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
