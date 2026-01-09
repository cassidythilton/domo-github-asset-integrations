/**
 * Asset Versioning - Domo App
 * Manage App Studio, DataFlow, and Workflow assets with GitHub sync
 */

// ============================================================================
// State
// ============================================================================

const state = {
  currentPage: 'overview',
  apps: [],
  assets: [],
  runs: [],
  settings: {
    githubRepo: 'cassidythilton/super-duper-parrot',
    githubToken: '',
    githubBranch: 'main',
    githubPath: 'asset-definitions/'
  },
  stats: {
    totalAssets: 0,
    synced: 0,
    deployments: 0,
    failures: 0
  }
};

// Mock data for demo purposes
const mockRuns = [
  { id: 'run-001', timestamp: 'Jan 8, 03:30', asset: 'Sales Dashboard', assetId: 'app-001', type: 'appstudio', action: 'Export', status: 'success', duration: '5.0s', triggeredBy: 'john.doe@company.com' },
  { id: 'run-002', timestamp: 'Jan 8, 03:35', asset: 'Sales Dashboard', assetId: 'app-001', type: 'appstudio', action: 'Commit', status: 'success', duration: '8.0s', triggeredBy: 'john.doe@company.com' },
  { id: 'run-003', timestamp: 'Jan 8, 01:00', asset: 'ETL Pipeline - Orders', assetId: 'df-001', type: 'dataflow', action: 'Export', status: 'success', duration: '12.0s', triggeredBy: 'jane.smith@company.com' },
  { id: 'run-004', timestamp: 'Jan 5, 04:10', asset: 'Inventory Tracker', assetId: 'app-003', type: 'appstudio', action: 'Commit', status: 'failed', duration: '15.0s', triggeredBy: 'john.doe@company.com' },
  { id: 'run-005', timestamp: 'Jan 7, 07:00', asset: 'Sales Dashboard', assetId: 'app-001', type: 'appstudio', action: 'Deploy', status: 'success', duration: '20.0s', triggeredBy: 'admin@company.com' }
];

const mockAssets = [
  { id: 'app-001', name: 'Sales Dashboard', type: 'appstudio', lastExported: 'Jan 8, 03:30', lastCommit: 'a1b2c3d', commitDate: 'Jan 8', status: 'synced' },
  { id: 'app-002', name: 'Customer Analytics', type: 'appstudio', lastExported: 'Jan 7, 02:00', lastCommit: 'e4f5g6h', commitDate: 'Jan 7', status: 'synced' },
  { id: 'app-003', name: 'Inventory Tracker', type: 'appstudio', lastExported: 'Jan 5, 04:00', lastCommit: 'q3r4s5t', commitDate: 'Jan 5', status: 'error' },
  { id: 'df-001', name: 'ETL Pipeline - Orders', type: 'dataflow', lastExported: 'Jan 8, 01:00', lastCommit: null, commitDate: null, status: 'not-synced' },
  { id: 'df-002', name: 'Customer Data Merge', type: 'dataflow', lastExported: 'Jan 6, 09:00', lastCommit: 'i7j8k9l', commitDate: 'Jan 6', status: 'synced' },
  { id: 'df-003', name: 'Product Sync', type: 'dataflow', lastExported: null, lastCommit: null, commitDate: null, status: 'not-synced' },
  { id: 'wf-001', name: 'Weekly Report Generator', type: 'workflow', lastExported: null, lastCommit: null, commitDate: null, status: 'not-synced' },
  { id: 'wf-002', name: 'Alert Notification Flow', type: 'workflow', lastExported: 'Jan 8, 00:00', lastCommit: 'm0n1o2p', commitDate: 'Jan 8', status: 'synced' }
];

// Cache for GitHub files (loaded from real repo)
let githubFilesCache = [];

// Track deployed apps during session
const deployedApps = [];

// ============================================================================
// DOM Elements
// ============================================================================

let elements = {};

function initElements() {
  elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item[data-page]'),
    typeItems: document.querySelectorAll('.nav-item[data-filter]'),
    pages: document.querySelectorAll('.page'),
    
    // Header
    globalSearch: document.getElementById('globalSearch'),
    syncAllBtn: document.getElementById('syncAllBtn'),
    
    // Overview
    statTotalAssets: document.getElementById('statTotalAssets'),
    statSynced: document.getElementById('statSynced'),
    statDeployments: document.getElementById('statDeployments'),
    statFailures: document.getElementById('statFailures'),
    recentActivityList: document.getElementById('recentActivityList'),
    refreshOverview: document.getElementById('refreshOverview'),
    
    // Assets
    assetsTableBody: document.getElementById('assetsTableBody'),
    assetSearch: document.getElementById('assetSearch'),
    typeFilter: document.getElementById('typeFilter'),
    statusFilter: document.getElementById('statusFilter'),
    refreshAssets: document.getElementById('refreshAssets'),
    
    // Runs
    runsTableBody: document.getElementById('runsTableBody'),
    
    // Settings
    githubRepo: document.getElementById('githubRepo'),
    githubToken: document.getElementById('githubToken'),
    githubBranch: document.getElementById('githubBranch'),
    githubPath: document.getElementById('githubPath'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    
    // Right Sidebar - GitHub Panel
    refreshGithubBtn: document.getElementById('refreshGithubBtn'),
    githubRepoDisplay: document.getElementById('githubRepoDisplay'),
    githubBranchDisplay: document.getElementById('githubBranchDisplay'),
    githubFileCount: document.getElementById('githubFileCount'),
    githubFilesList: document.getElementById('githubFilesList'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
  };
}

// ============================================================================
// Code Engine API Functions
// ============================================================================

async function callCodeEngine(functionPath, body = {}) {
  console.log('Calling Code Engine:', functionPath, body);
  try {
    const response = await domo.post(functionPath, body);
    console.log('Code Engine response:', response);
    return response;
  } catch (error) {
    console.error('Code Engine error:', error);
    throw error;
  }
}

async function fetchApps(sortBy = 'newest') {
  try {
    const response = await callCodeEngine('/domo/codeengine/v2/packages/listApps', {});
    let apps = [];
    if (Array.isArray(response)) {
      apps = response;
    } else if (response && typeof response === 'object') {
      apps = response.apps || response.data || response.items || [];
    }
    
    // Log API response info
    console.log(`API returned ${apps.length} apps`);
    if (apps.length > 0) {
      console.log('Sample app object:', JSON.stringify(apps[0], null, 2));
      // Show ID range to understand what apps we're getting
      const ids = apps.map(a => parseInt(a.dataAppId || a.id) || 0).filter(id => id > 0);
      console.log(`App ID range: ${Math.min(...ids)} to ${Math.max(...ids)}`);
    }
    
    // Map apps to our format
    let mappedApps = apps.map(app => {
      const appId = app.dataAppId || app.id;
      
      return {
        ...app,
        id: appId,
        type: 'appstudio',
        lastExported: app.lastUpdated ? formatDate(app.lastUpdated) : null,
        lastCommit: null,
        status: 'not-synced'
      };
    });
    
    // Sort apps by ID (higher ID = older app in this instance)
    if (sortBy === 'oldest') {
      // Sort by app ID descending (oldest/highest ID first)
      mappedApps.sort((a, b) => {
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idB - idA;
      });
    } else {
      // Sort by app ID ascending (newest/lowest ID first) - default
      mappedApps.sort((a, b) => {
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idA - idB;
      });
    }
    
    console.log(`Sorted apps (${sortBy}):`, mappedApps.slice(0, 5).map(a => `${a.title} (ID: ${a.id})`));
    
    return mappedApps;
  } catch (error) {
    console.error('Error fetching apps:', error);
    return [];
  }
}

async function getAppDefinition(appId) {
  try {
    const response = await callCodeEngine('/domo/codeengine/v2/packages/getAppDefinition', { 
      appId: String(appId) 
    });
    return response;
  } catch (error) {
    console.error('Error getting app definition:', error);
    throw error;
  }
}

async function duplicateApp(appId, title) {
  console.log('Calling duplicateApp with:', appId, title);
  try {
    const response = await callCodeEngine('/domo/codeengine/v2/packages/duplicateApp', { 
      appId: String(appId),
      title,
      duplicateCards: false
    });
    console.log('duplicateApp response:', response);
    return response;
  } catch (error) {
    console.error('Error duplicating app:', error);
    throw error;
  }
}

async function pushToGithub(filePath, content, commitMessage) {
  const { githubToken, githubRepo, githubBranch, githubPath } = state.settings;
  try {
    const fullPath = `${githubPath}${filePath}`.replace(/\/\//g, '/');
    const response = await callCodeEngine('/domo/codeengine/v2/packages/pushToGithub', { 
      githubToken,
      repo: githubRepo,
      branch: githubBranch,
      filePath: fullPath,
      content,
      commitMessage
    });
    return response;
  } catch (error) {
    console.error('Error pushing to GitHub:', error);
    throw error;
  }
}

// ============================================================================
// GitHub API Functions (via Domo proxy)
// ============================================================================

async function fetchGithubFiles() {
  const { githubRepo, githubBranch, githubPath, githubToken } = state.settings;
  
  if (!githubRepo) {
    return [];
  }
  
  if (!githubToken) {
    console.log('No GitHub token configured - cannot fetch files');
    return [];
  }
  
  try {
    // Clean path - remove leading/trailing slashes
    const cleanPath = (githubPath || 'asset-definitions').replace(/^\/|\/$/g, '');
    
    console.log('Calling listGithubFiles with:', {
      repo: githubRepo,
      branch: githubBranch,
      path: cleanPath
    });
    
    const response = await callCodeEngine('/domo/codeengine/v2/packages/listGithubFiles', {
      githubToken: githubToken,
      repo: githubRepo,
      branch: githubBranch,
      path: cleanPath
    });
    
    console.log('listGithubFiles raw response:', response);
    
    // Handle both wrapped {files: [...]} and direct array responses
    const files = response?.files || response || [];
    return Array.isArray(files) ? files : [];
  } catch (error) {
    console.error('Error fetching GitHub files:', error);
    return [];
  }
}

async function fetchGithubFileContent(filePath) {
  const { githubRepo, githubBranch, githubToken } = state.settings;
  
  if (!githubToken) {
    throw new Error('No GitHub token configured');
  }
  
  try {
    const response = await callCodeEngine('/domo/codeengine/v2/packages/getGithubFileContent', {
      githubToken: githubToken,
      repo: githubRepo,
      branch: githubBranch,
      filePath: filePath
    });
    
    return response?.content || response?.file?.content || response;
  } catch (error) {
    console.error('Error fetching GitHub file content:', error);
    throw error;
  }
}

// ============================================================================
// Navigation
// ============================================================================

function navigateTo(page) {
  state.currentPage = page;
  
  // Update nav items
  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  
  // Update pages
  elements.pages.forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });
  
  // Load page data
  if (page === 'overview') {
    loadOverviewData();
  } else if (page === 'assets') {
    loadAssetsData();
  } else if (page === 'runs') {
    loadRunsData();
  } else if (page === 'settings') {
    loadSettingsData();
  }
}

// ============================================================================
// Overview Page
// ============================================================================

function loadOverviewData() {
  updateOverviewStats();
  
  // Render recent activity
  renderRecentActivity(mockRuns.slice(0, 5));
}

function updateOverviewStats() {
  // Use mock data + real apps
  const allAssets = [...mockAssets];
  
  // Calculate stats
  const synced = allAssets.filter(a => a.status === 'synced').length;
  const failures = mockRuns.filter(r => r.status === 'failed').length;
  const deployments = mockRuns.filter(r => r.action === 'Deploy').length;
  
  state.stats = {
    totalAssets: allAssets.length,
    synced,
    deployments,
    failures
  };
  
  // Update UI if elements exist
  if (elements.statTotalAssets) {
    elements.statTotalAssets.textContent = state.stats.totalAssets;
  }
  if (elements.statSynced) {
    elements.statSynced.textContent = state.stats.synced;
  }
  if (elements.statDeployments) {
    elements.statDeployments.textContent = state.stats.deployments;
  }
  if (elements.statFailures) {
    elements.statFailures.textContent = state.stats.failures;
  }
  
  // Update recent activity if on overview page
  if (state.currentPage === 'overview' && elements.recentActivityList) {
    renderRecentActivity(mockRuns.slice(0, 5));
  }
}

function renderRecentActivity(runs) {
  elements.recentActivityList.innerHTML = runs.map(run => `
    <div class="activity-row">
      <span class="activity-col col-time">${run.timestamp}</span>
      <span class="activity-col col-asset">
        <span class="activity-icon ${run.type}">${getTypeIcon(run.type)}</span>
        <span class="activity-name">${run.asset}</span>
      </span>
      <span class="activity-col col-action"><span class="activity-badge">${run.action}</span></span>
      <span class="activity-col col-status"><span class="status-${run.status}">${capitalize(run.status)}</span></span>
      <span class="activity-col col-duration">${run.duration}</span>
    </div>
  `).join('');
}

// ============================================================================
// Assets Page
// ============================================================================

async function loadAssetsData() {
  // Start with DataFlow and Workflow mock data (keep these)
  let assets = mockAssets.filter(a => a.type !== 'appstudio');
  
  // Try to load real App Studio apps - get the 5 OLDEST apps
  try {
    const realApps = await fetchApps('oldest');
    if (realApps.length > 0) {
      // Take the 5 oldest apps and add them at the top
      const oldestApps = realApps.slice(0, 5);
      console.log('Loaded 5 oldest apps:', oldestApps.map(a => a.title || a.name).join(', '));
      assets = [...oldestApps, ...assets];
    }
  } catch (e) {
    console.log('Using mock data for demo');
    // Fall back to mock appstudio data
    assets = [...mockAssets];
  }
  
  state.assets = assets;
  renderAssetsTable(assets);
}

function renderAssetsTable(assets) {
  // Group by type
  const grouped = {
    appstudio: assets.filter(a => a.type === 'appstudio'),
    dataflow: assets.filter(a => a.type === 'dataflow'),
    workflow: assets.filter(a => a.type === 'workflow')
  };
  
  let html = '';
  
  // App Studio group
  if (grouped.appstudio.length > 0) {
    html += renderAssetGroup('App Studio', 'appstudio', grouped.appstudio);
  }
  
  // DataFlow group
  if (grouped.dataflow.length > 0) {
    html += renderAssetGroup('DataFlow', 'dataflow', grouped.dataflow);
  }
  
  // Workflow group
  if (grouped.workflow.length > 0) {
    html += renderAssetGroup('Workflow', 'workflow', grouped.workflow);
  }
  
  elements.assetsTableBody.innerHTML = html;
  
  // Add event listeners for group toggles
  document.querySelectorAll('.asset-group-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      const type = header.dataset.type;
      document.querySelectorAll(`.asset-row[data-type="${type}"]`).forEach(row => {
        row.style.display = header.classList.contains('collapsed') ? 'none' : '';
      });
    });
  });
  
  // Add event listeners for dropdown menu buttons
  document.querySelectorAll('.action-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const container = btn.closest('.dropdown-container');
      const menu = container.querySelector('.dropdown-menu');
      
      // Close all other open menus
      document.querySelectorAll('.dropdown-menu.open').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      
      // Toggle this menu
      menu.classList.toggle('open');
    });
  });
  
  // Add event listeners for dropdown menu items
  document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const id = item.dataset.id;
      const name = item.dataset.name;
      
      // Close the menu
      item.closest('.dropdown-menu').classList.remove('open');
      
      handleAssetAction(action, id, name);
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', closeAllDropdowns);
}

function renderAssetGroup(title, type, assets) {
  let html = `
    <tr class="asset-group-header" data-type="${type}">
      <td><input type="checkbox"></td>
      <td colspan="6">
        <div class="asset-group-toggle">
          <svg class="toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <div class="asset-group-title">
            <div class="asset-type-icon ${type}">
              ${getTypeIcon(type)}
            </div>
            <span>${title}</span>
            <span class="asset-count">(${assets.length} assets)</span>
          </div>
        </div>
      </td>
    </tr>
  `;
  
  assets.forEach(asset => {
    const assetName = escapeHtml(asset.name || asset.title || 'Untitled');
    html += `
      <tr class="asset-row" data-type="${type}" data-id="${asset.id}">
        <td><input type="checkbox"></td>
        <td>
          <div class="asset-info">
            <span class="asset-title">${assetName}</span>
          </div>
        </td>
        <td><code>${asset.id}</code></td>
        <td>${asset.lastExported || '-'}</td>
        <td>${asset.lastCommit ? `<code>${asset.lastCommit}</code> ${asset.commitDate}` : '-'}</td>
        <td><span class="status-badge status-${asset.status}">${formatStatus(asset.status)}</span></td>
        <td>
          <div class="table-actions">
            <div class="dropdown-container">
              <button class="action-menu-btn" data-id="${asset.id}" data-name="${assetName}" data-type="${type}">⋯</button>
              <div class="dropdown-menu" data-id="${asset.id}">
                <button class="dropdown-item" data-action="export" data-id="${asset.id}" data-name="${assetName}">Export JSON</button>
                <button class="dropdown-item" data-action="commit" data-id="${asset.id}" data-name="${assetName}">Commit to GitHub</button>
                <button class="dropdown-item" data-action="details" data-id="${asset.id}" data-name="${assetName}">View Details</button>
                <button class="dropdown-item" data-action="runs" data-id="${asset.id}" data-name="${assetName}">View Runs</button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  });
  
  return html;
}

// Close all dropdown menus
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu.open').forEach(menu => {
    menu.classList.remove('open');
  });
}

// Handle asset action from dropdown menu
async function handleAssetAction(action, assetId, assetName) {
  switch (action) {
    case 'export':
      await handleExportJSON(assetId, assetName);
      break;
    case 'commit':
      await handleCommitToGitHub(assetId, assetName);
      break;
    case 'details':
      handleViewDetails(assetId, assetName);
      break;
    case 'runs':
      handleViewRuns(assetId, assetName);
      break;
    default:
      console.warn('Unknown action:', action);
  }
}

// Export JSON - download the definition locally
async function handleExportJSON(assetId, assetName) {
  showToast(`Exporting ${assetName}...`, 'info');
  
  try {
    const definition = await getAppDefinition(assetId);
    
    if (!definition) {
      showToast('Failed to get app definition', 'error');
      return;
    }
    
    // Create a downloadable JSON file
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(assetName)}-${assetId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`✅ ${assetName} exported!`, 'success');
    
    // Add to runs and update stats
    addRunEntry(assetName, assetId, 'Export', 'success');
    updateOverviewStats();
    
  } catch (error) {
    showToast(`Failed to export: ${error.message || 'Unknown error'}`, 'error');
    addRunEntry(assetName, assetId, 'Export', 'failed');
    updateOverviewStats();
  }
}

// Commit to GitHub - push the definition to GitHub
async function handleCommitToGitHub(assetId, assetName) {
  if (!state.settings.githubToken) {
    showToast('Please configure GitHub token in Settings', 'error');
    navigateTo('settings');
    return;
  }
  
  showToast(`Committing ${assetName} to GitHub...`, 'info');
  
  try {
    const definition = await getAppDefinition(assetId);
    
    if (!definition) {
      showToast('Failed to get app definition', 'error');
      return;
    }
    
    const filename = `${sanitizeFilename(assetName)}-${assetId}.json`;
    const message = `Commit ${assetName} (${assetId}) - ${new Date().toISOString()}`;
    
    await pushToGithub(filename, definition, message);
    
    // Build GitHub URL for the committed file
    const { githubRepo, githubBranch, githubPath } = state.settings;
    const fullPath = `${githubPath}${filename}`.replace(/\/\//g, '/');
    const githubUrl = `https://github.com/${githubRepo}/blob/${githubBranch}/${fullPath}`;
    
    // Show success modal with GitHub link
    showCommitSuccessModal(assetName, githubUrl, filename);
    
    // Add to runs and update stats
    addRunEntry(assetName, assetId, 'Commit', 'success');
    updateAssetStatus(assetId, 'synced', githubUrl);
    updateOverviewStats();
    
    // Refresh GitHub panel to show the new file
    loadGithubPanel();
    
  } catch (error) {
    showToast(`Failed to commit: ${error.message || 'Unknown error'}`, 'error');
    addRunEntry(assetName, assetId, 'Commit', 'failed');
    updateOverviewStats();
  }
}

// Show commit success modal with GitHub link
function showCommitSuccessModal(assetName, githubUrl, filename) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>✅ Committed to GitHub</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 16px;"><strong>${escapeHtml(assetName)}</strong> has been successfully committed to GitHub.</p>
        <div class="detail-row">
          <span class="detail-label">File</span>
          <span class="detail-value"><code>${escapeHtml(filename)}</code></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Repository</span>
          <span class="detail-value">${escapeHtml(state.settings.githubRepo)}</span>
        </div>
        <div class="github-link-box">
          <a href="${escapeHtml(githubUrl)}" target="_blank" class="github-file-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View on GitHub →
          </a>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary modal-close-btn">Done</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// View Details - show asset details in a modal
async function handleViewDetails(assetId, assetName) {
  // Find the asset in state
  const asset = state.assets.find(a => String(a.id) === String(assetId));
  
  // Try to get live data for App Studio apps
  let liveData = null;
  if (asset && asset.type === 'appstudio') {
    try {
      showToast(`Loading details for ${assetName}...`, 'info');
      liveData = await getAppDefinition(assetId);
    } catch (e) {
      console.log('Could not fetch live data:', e);
    }
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${escapeHtml(assetName)}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-row">
          <span class="detail-label">Asset ID</span>
          <span class="detail-value"><code>${assetId}</code></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Type</span>
          <span class="detail-value">${asset?.type || 'App Studio'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value"><span class="status-badge status-${asset?.status || 'not-synced'}">${formatStatus(asset?.status || 'not-synced')}</span></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Exported</span>
          <span class="detail-value">${asset?.lastExported || 'Never'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Commit</span>
          <span class="detail-value">${asset?.lastCommit ? `<code>${asset.lastCommit}</code> (${asset.commitDate})` : 'Never'}</span>
        </div>
        ${liveData ? `
          <hr class="detail-divider">
          <h4>Live Data from Domo</h4>
          <div class="detail-row">
            <span class="detail-label">Title</span>
            <span class="detail-value">${escapeHtml(liveData.title || 'N/A')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Description</span>
            <span class="detail-value">${escapeHtml(liveData.description || 'No description')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Views</span>
            <span class="detail-value">${liveData.views?.length || 0} views</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Theme</span>
            <span class="detail-value">${escapeHtml(liveData.theme?.name || 'Default')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Enabled</span>
            <span class="detail-value">${liveData.enabled ? 'Yes' : 'No'}</span>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close-btn">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.querySelector('.modal-close-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// View Runs - navigate to runs page filtered by this asset
function handleViewRuns(assetId, assetName) {
  // Filter runs by this asset
  const filteredRuns = mockRuns.filter(r => String(r.assetId) === String(assetId));
  
  navigateTo('runs');
  
  // After navigating, render only filtered runs
  setTimeout(() => {
    if (filteredRuns.length > 0) {
      renderRunsTable(filteredRuns);
      showToast(`Showing ${filteredRuns.length} run(s) for ${assetName}`, 'info');
    } else {
      showToast(`No runs found for ${assetName}`, 'info');
    }
  }, 100);
}

// Helper: Add run entry to mock runs
function addRunEntry(assetName, assetId, action, status) {
  mockRuns.unshift({
    id: `run-${Date.now()}`,
    timestamp: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    asset: assetName,
    assetId: assetId,
    type: 'appstudio',
    action: action,
    status: status,
    duration: `${(Math.random() * 10 + 2).toFixed(1)}s`,
    triggeredBy: 'current.user@company.com'
  });
}

// Helper: Update asset status in the table
function updateAssetStatus(assetId, newStatus, githubUrl = null) {
  const commitHash = generateCommitHash();
  const commitDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  const row = document.querySelector(`.asset-row[data-id="${assetId}"]`);
  if (row) {
    // Update status badge
    const badge = row.querySelector('.status-badge');
    if (badge) {
      badge.className = `status-badge status-${newStatus}`;
      if (githubUrl && newStatus === 'synced') {
        badge.innerHTML = `<a href="${escapeHtml(githubUrl)}" target="_blank" class="status-link">Synced ↗</a>`;
      } else {
        badge.textContent = formatStatus(newStatus);
      }
    }
    
    // Update last commit column (5th td)
    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      if (githubUrl) {
        cells[4].innerHTML = `<a href="${escapeHtml(githubUrl)}" target="_blank" class="commit-link"><code>${commitHash}</code></a> ${commitDate}`;
      } else {
        cells[4].innerHTML = `<code>${commitHash}</code> ${commitDate}`;
      }
    }
  }
  
  // Update state
  const asset = state.assets.find(a => String(a.id) === String(assetId));
  if (asset) {
    asset.status = newStatus;
    asset.lastCommit = commitHash;
    asset.commitDate = commitDate;
    asset.githubUrl = githubUrl;
  }
  
  // Also update mockAssets for persistence during session
  const mockAsset = mockAssets.find(a => String(a.id) === String(assetId));
  if (mockAsset) {
    mockAsset.status = newStatus;
    mockAsset.lastCommit = commitHash;
    mockAsset.commitDate = commitDate;
    mockAsset.githubUrl = githubUrl;
  }
}

// Helper: Generate a mock commit hash
function generateCommitHash() {
  return Math.random().toString(36).substring(2, 9);
}

// Legacy export function (kept for compatibility)
async function handleExport(assetId, assetName) {
  await handleCommitToGitHub(assetId, assetName);
}

// ============================================================================
// Runs Page
// ============================================================================

function loadRunsData() {
  renderRunsTable(mockRuns);
}

function renderRunsTable(runs) {
  elements.runsTableBody.innerHTML = runs.map(run => `
    <tr>
      <td><code>${run.id}</code></td>
      <td>${run.timestamp}</td>
      <td>
        <div class="asset-name-cell">
          <div class="asset-type-icon ${run.type}">
            ${getTypeIcon(run.type)}
          </div>
          <div class="asset-info">
            <span class="asset-title">${run.asset}</span>
            <span class="asset-subtitle">${run.assetId}</span>
          </div>
        </div>
      </td>
      <td><span class="action-badge">${run.action}</span></td>
      <td><span class="status-${run.status}">${capitalize(run.status)}</span></td>
      <td>${run.duration}</td>
      <td>${run.triggeredBy}</td>
      <td><a href="#" class="view-logs-link">View logs</a></td>
    </tr>
  `).join('');
}

// ============================================================================
// Settings Page
// ============================================================================

function loadSettingsData() {
  elements.githubRepo.value = state.settings.githubRepo;
  elements.githubToken.value = state.settings.githubToken;
  elements.githubBranch.value = state.settings.githubBranch;
  elements.githubPath.value = state.settings.githubPath;
}

// ============================================================================
// GitHub Panel (Right Sidebar)
// ============================================================================

async function loadGithubPanel() {
  // Update display
  elements.githubRepoDisplay.textContent = state.settings.githubRepo || 'Not configured';
  elements.githubBranchDisplay.textContent = state.settings.githubBranch || 'main';
  
  // Fetch real files from GitHub
  const files = await fetchGithubFiles();
  console.log('Loaded', files.length, 'files from GitHub:', files);
  
  // Process files to extract app IDs from filenames
  const processedFiles = (files || []).map(file => {
    // Extract app ID from filename (e.g., "modo-retail-eval-1787632545.json" -> 1787632545)
    const match = file.name.match(/-(\d+)\.json$/);
    const appId = match ? parseInt(match[1]) : null;
    
    // Create a friendly title from the filename
    const title = file.name
      .replace(/\.json$/, '')
      .replace(/-\d+$/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return {
      ...file,
      appId: appId,
      title: title,
      lastModified: formatFileDate(file.sha) // Will show size instead since we don't have date
    };
  });
  
  // Cache the files for later use
  githubFilesCache = processedFiles;
  
  console.log(`Loaded ${processedFiles.length} files from GitHub:`, processedFiles.map(f => `${f.name} (appId: ${f.appId})`));
  
  renderGithubFiles(processedFiles);
}

// Format file date or fallback to size
function formatFileDate(sha) {
  // GitHub API doesn't give us dates in directory listing, so we'll show a placeholder
  return 'From GitHub';
}

function renderGithubFiles(files) {
  elements.githubFileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
  
  let html = '';
  
  // Show deployed apps section if any
  if (deployedApps.length > 0) {
    const instanceUrl = getInstanceUrl();
    html += `
      <div class="deployed-section">
        <div class="deployed-header">Recently Deployed</div>
        ${deployedApps.map(app => {
          const appUrl = app.url || (app.id ? `https://${instanceUrl}/app-studio/${app.id}` : null);
          const appsListUrl = `https://${instanceUrl}/apps`;
          return `
          <div class="deployed-app-item">
            <div class="deployed-app-info">
              <span class="deployed-app-title">${escapeHtml(app.title)}</span>
              <span class="deployed-app-meta">${app.deployedAt}${app.id ? ` • ID: ${app.id}` : ''}</span>
            </div>
            <div class="deployed-app-actions">
              ${appUrl 
                ? `<a href="${appUrl}" target="_blank" class="btn-goto" title="Open app in new tab">Open →</a>`
                : `<a href="${appsListUrl}" target="_blank" class="btn-goto" title="View all apps to find your new app">View Apps →</a>`
              }
            </div>
          </div>
        `}).join('')}
      </div>
    `;
  }
  
  // Show available files header if we have deployed apps
  if (deployedApps.length > 0 && files.length > 0) {
    html += `<div class="available-header">Available Definitions</div>`;
  }
  
  if (files.length === 0 && deployedApps.length === 0) {
    html = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p>No definitions found</p>
        <span class="hint">Commit assets to GitHub to see them here</span>
      </div>
    `;
  } else {
    html += files.map(file => `
      <div class="github-file-item" 
           data-path="${escapeHtml(file.path)}" 
           data-name="${escapeHtml(file.name)}"
           data-app-id="${file.appId || ''}"
           data-title="${escapeHtml(file.title || '')}">
        <div class="github-file-info">
          <span class="github-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.title || file.name)}</span>
          <span class="github-file-meta">
            ${file.appId ? `App ID: ${file.appId}` : ''} 
            ${file.size ? `• ${formatFileSize(file.size)}` : ''}
          </span>
        </div>
        <div class="github-file-actions">
          <button class="btn-preview" data-path="${escapeHtml(file.path)}" data-name="${escapeHtml(file.name)}" title="Preview file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="btn-deploy" data-path="${escapeHtml(file.path)}" data-name="${escapeHtml(file.name)}" data-app-id="${file.appId || ''}" data-title="${escapeHtml(file.title || '')}">
            Deploy
          </button>
        </div>
      </div>
    `).join('');
  }
  
  elements.githubFilesList.innerHTML = html;
  
  // Add event listeners for deploy buttons
  document.querySelectorAll('.btn-deploy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const appId = btn.dataset.appId;
      const title = btn.dataset.title;
      const fileName = btn.dataset.name;
      const filePath = btn.dataset.path;
      
      if (appId) {
        // Use the app ID extracted from filename
        handleDeployWithAppId(filePath, fileName, parseInt(appId), title);
      } else {
        showToast('Could not extract app ID from filename', 'error');
      }
    });
  });
  
  // Add event listeners for preview buttons
  document.querySelectorAll('.btn-preview').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFilePreview(btn.dataset.path, btn.dataset.name);
    });
  });
  
  // Add hover tooltip for file items
  document.querySelectorAll('.github-file-item').forEach(item => {
    item.addEventListener('mouseenter', (e) => {
      showFileTooltip(e.currentTarget);
    });
    item.addEventListener('mouseleave', () => {
      hideFileTooltip();
    });
  });
}

// Show file preview modal
async function showFilePreview(filePath, fileName) {
  showToast('Loading preview...', 'info');
  
  try {
    const content = await fetchGithubFileContent(filePath);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3>📄 ${escapeHtml(fileName)}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-preview-info">
            <div class="detail-row">
              <span class="detail-label">File</span>
              <span class="detail-value">${escapeHtml(fileName)}</span>
            </div>
            ${content.id ? `
            <div class="detail-row">
              <span class="detail-label">ID</span>
              <span class="detail-value"><code>${content.id}</code></span>
            </div>
            ` : ''}
            ${content.createdOn ? `
            <div class="detail-row">
              <span class="detail-label">Created</span>
              <span class="detail-value">${formatDate(content.createdOn)}</span>
            </div>
            ` : ''}
            ${content.content?.name ? `
            <div class="detail-row">
              <span class="detail-label">Solution Name</span>
              <span class="detail-value">${escapeHtml(content.content.name)}</span>
            </div>
            ` : ''}
          </div>
          <div class="file-preview-content">
            <pre><code>${escapeHtml(JSON.stringify(content, null, 2).substring(0, 2000))}${JSON.stringify(content, null, 2).length > 2000 ? '\n\n... (truncated)' : ''}</code></pre>
          </div>
        </div>
        <div class="modal-footer">
          <a href="https://github.com/${state.settings.githubRepo}/blob/${state.settings.githubBranch}/${filePath}" target="_blank" class="btn btn-secondary">View on GitHub</a>
          <button class="btn btn-primary modal-close-btn">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
  } catch (error) {
    showToast(`Failed to load preview: ${error.message}`, 'error');
  }
}

// Show hover tooltip for file
let tooltipElement = null;
function showFileTooltip(fileItem) {
  const appId = fileItem.dataset.appId;
  const title = fileItem.dataset.title;
  const name = fileItem.dataset.name;
  
  // Remove existing tooltip
  hideFileTooltip();
  
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'file-tooltip';
  tooltipElement.innerHTML = `
    <div class="tooltip-title">${escapeHtml(title || name)}</div>
    <div class="tooltip-meta">
      ${appId ? `<div>App ID: <strong>${appId}</strong></div>` : ''}
      <div>Click Deploy to create a copy</div>
      <div>Click 👁 to preview content</div>
    </div>
  `;
  
  document.body.appendChild(tooltipElement);
  
  // Position tooltip
  const rect = fileItem.getBoundingClientRect();
  tooltipElement.style.left = `${rect.left}px`;
  tooltipElement.style.top = `${rect.bottom + 8}px`;
}

function hideFileTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

// Deploy using app ID extracted from filename
function handleDeployWithAppId(filePath, fileName, appId, title) {
  const newTitle = `Deployed - ${title} - ${new Date().toLocaleDateString()}`;
  showDeployConfirmModal(filePath, fileName, appId, title, newTitle);
}

// Legacy function - now handled by handleDeployWithAppId
async function handleDeployFromGitHubFile(filePath, fileName) {
  // Extract app ID from filename
  const match = fileName.match(/-(\d+)\.json$/);
  if (match) {
    const appId = parseInt(match[1]);
    const title = fileName.replace(/\.json$/, '').replace(/-\d+$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    handleDeployWithAppId(filePath, fileName, appId, title);
  } else {
    showToast('Could not extract app ID from filename', 'error');
  }
}

function showDeployConfirmModal(filePath, fileName, sourceAppId, originalTitle, newTitle) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Deploy from GitHub</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 16px;">Deploy "<strong>${escapeHtml(fileName)}</strong>" as a new app?</p>
        <div class="detail-row">
          <span class="detail-label">Source App</span>
          <span class="detail-value">${escapeHtml(originalTitle)}</span>
        </div>
        <div class="form-group" style="margin-top: 16px; margin-bottom: 0;">
          <label for="deployAppName">New App Name</label>
          <input type="text" id="deployAppName" class="deploy-name-input" value="${escapeHtml(newTitle)}" placeholder="Enter app name...">
          <span class="form-hint">You can customize the name before deploying</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">Cancel</button>
        <button class="btn btn-primary modal-confirm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Deploy
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const nameInput = modal.querySelector('#deployAppName');
  
  // Focus on name input
  setTimeout(() => nameInput.focus(), 100);
  
  // Close handlers
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Enter key to deploy
  nameInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const customName = nameInput.value.trim() || newTitle;
      closeModal();
      await executeDeploy(filePath, fileName, sourceAppId, originalTitle, customName);
    }
  });
  
  // Confirm handler
  modal.querySelector('.modal-confirm').addEventListener('click', async () => {
    const customName = nameInput.value.trim() || newTitle;
    closeModal();
    await executeDeploy(filePath, fileName, sourceAppId, originalTitle, customName);
  });
}

async function executeDeploy(filePath, fileName, sourceAppId, originalTitle, newTitle) {
  // Find the deploy button and disable it
  const btn = document.querySelector(`.btn-deploy[data-path="${filePath}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deploying...';
  }
  
  try {
    showToast(`Deploying ${originalTitle}...`, 'info');
    
    // Use duplicateApp to create a copy
    const duplicateResult = await duplicateApp(sourceAppId, newTitle);
    console.log('Duplicate result:', duplicateResult);
    
    // The Domo duplicate API doesn't return the new app ID
    // We need to search for it in the apps list
    showToast(`App created! Finding new app...`, 'info');
    
    // Wait a bit for the app to be fully created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Search for the newly created app by title
    let newAppId = null;
    try {
      // Use 'newest' to find the recently created app
      const apps = await fetchApps('newest');
      console.log(`Searching ${apps.length} apps for title: "${newTitle}"`);
      
      // Try exact match first
      let newApp = apps.find(app => app.title === newTitle);
      
      // If not found, try partial match (in case title was truncated)
      if (!newApp) {
        newApp = apps.find(app => app.title && app.title.startsWith('Deployed -'));
      }
      
      if (newApp) {
        newAppId = newApp.id || newApp.dataAppId;
        console.log('Found new app with ID:', newAppId);
      } else {
        console.log('Could not find app by title, listing recent apps:');
        // Log last 5 apps for debugging
        apps.slice(0, 5).forEach(app => console.log(`  - ${app.title} (ID: ${app.id || app.dataAppId})`));
      }
    } catch (e) {
      console.warn('Could not fetch apps list to find new app ID:', e);
    }
    
    // Get the instance URL from the connection status
    const instanceUrl = getInstanceUrl();
    
    // Store the deployed app
    const deployedApp = {
      id: newAppId,
      title: newTitle,
      sourceFile: fileName,
      sourceAppId: sourceAppId,
      deployedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      url: newAppId ? `https://${instanceUrl}/app-studio/${newAppId}` : null,
      instanceUrl: instanceUrl
    };
    deployedApps.unshift(deployedApp);
    
    // Show success modal with link
    showDeploymentSuccessModal(deployedApp);
    
    // Add to runs and update stats
    addRunEntry(originalTitle, String(sourceAppId), 'Deploy', 'success');
    updateOverviewStats();
    
    // Refresh GitHub panel to show deployed apps
    renderGithubFiles(githubFilesCache);
    
  } catch (error) {
    console.error('Deploy error:', error);
    showToast(`Failed to deploy: ${error.message || 'Unknown error'}`, 'error');
    addRunEntry(fileName, 'unknown', 'Deploy', 'failed');
    updateOverviewStats();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Deploy';
    }
  }
}

// Get the connected Domo instance URL
function getInstanceUrl() {
  const instanceElement = document.getElementById('instanceUrl');
  if (instanceElement && instanceElement.textContent) {
    return instanceElement.textContent.trim();
  }
  // Fallback - try to get from domo.env or use default
  if (typeof domo !== 'undefined' && domo.env && domo.env.instanceUrl) {
    return domo.env.instanceUrl;
  }
  return 'databricks-demo.domo.com';
}

function showDeploymentSuccessModal(deployedApp) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  const instanceUrl = deployedApp.instanceUrl || getInstanceUrl();
  const appUrl = deployedApp.url || (deployedApp.id ? `https://${instanceUrl}/app-studio/${deployedApp.id}` : null);
  const appsListUrl = `https://${instanceUrl}/apps`;
  
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>✅ Deployed Successfully!</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 16px;">Your app has been created from the GitHub definition.</p>
        <div class="detail-row">
          <span class="detail-label">App Name</span>
          <span class="detail-value"><strong>${escapeHtml(deployedApp.title)}</strong></span>
        </div>
        ${deployedApp.id ? `
        <div class="detail-row">
          <span class="detail-label">App ID</span>
          <span class="detail-value"><code>${deployedApp.id}</code></span>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Instance</span>
          <span class="detail-value">${escapeHtml(instanceUrl)}</span>
        </div>
        
        <div class="deploy-success-actions">
          ${appUrl ? `
          <a href="${escapeHtml(appUrl)}" target="_blank" class="btn btn-primary deploy-open-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Open App
          </a>
          ` : ''}
          <a href="${escapeHtml(appsListUrl)}" target="_blank" class="btn btn-secondary">
            View All Apps
          </a>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close-btn">Done</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeModal = () => modal.remove();
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveSettings() {
  state.settings.githubRepo = elements.githubRepo.value.trim();
  state.settings.githubToken = elements.githubToken.value.trim();
  state.settings.githubBranch = elements.githubBranch.value.trim() || 'main';
  state.settings.githubPath = elements.githubPath.value.trim() || 'asset-definitions/';
  
  if (!state.settings.githubPath.endsWith('/')) {
    state.settings.githubPath += '/';
  }
  
  localStorage.setItem('asset-versioning-settings', JSON.stringify(state.settings));
  showToast('Settings saved!', 'success');
}

function loadSavedSettings() {
  const saved = localStorage.getItem('asset-versioning-settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
      
      // Migration: fix old path name
      if (state.settings.githubPath === 'app-definitions/' || state.settings.githubPath === 'app-definitions') {
        state.settings.githubPath = 'asset-definitions/';
        localStorage.setItem('asset-versioning-settings', JSON.stringify(state.settings));
        console.log('Migrated githubPath from app-definitions to asset-definitions');
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatStatus(status) {
  const labels = {
    'synced': 'Synced',
    'not-synced': 'Not synced',
    'error': 'Error'
  };
  return labels[status] || status;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sanitizeFilename(name) {
  if (!name) return 'untitled';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function getTypeIcon(type) {
  // Domo-style icons with proper white fill for use on colored backgrounds
  const icons = {
    appstudio: `<svg viewBox="0 0 24 28" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.6593 0.451353C11.013 0.159656 11.4573 0 11.9159 0C12.3762 0 12.822 0.160774 13.1763 0.454414C14.4179 1.46561 17.1059 3.97249 18.593 7.83792C19.0969 9.14758 19.4581 10.6015 19.5837 12.1908L23.3681 16.7321C23.5682 16.9676 23.7096 17.2474 23.7804 17.5483C23.8505 17.8463 23.8495 18.1566 23.7774 18.454L22.2425 25.4048L22.2418 25.4079C22.1676 25.7389 22.0104 26.0456 21.7851 26.2991C21.5597 26.5527 21.2736 26.7447 20.9536 26.8572C20.6336 26.9697 20.2902 26.999 19.9557 26.9422C19.6213 26.8855 19.3068 26.7447 19.0418 26.5329L19.0413 26.5325L15.5652 23.7517H8.26709L4.7909 26.5326L4.79042 26.533C4.52541 26.7447 4.2109 26.8856 3.87647 26.9423C3.54203 26.9991 3.19866 26.9698 2.87866 26.8573C2.55865 26.7448 2.27251 26.5528 2.04715 26.2992C1.82179 26.0457 1.66462 25.739 1.59042 25.408L1.58973 25.4049L0.0548065 18.4541C-0.0172318 18.1567 -0.0182873 17.8464 0.0518364 17.5484C0.12269 17.2472 0.264162 16.9673 0.464524 16.7317L4.17394 12.2899C4.29038 10.6593 4.65894 9.16945 5.17911 7.83023C6.68076 3.96409 9.40275 1.45781 10.6593 0.451353Z"/></svg>`,
    dataflow: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 1C13 0.447715 12.5523 0 12 0C11.4477 0 11 0.447715 11 1V11.0993L2 20.5279L2 18C2 17.4477 1.55228 17 1 17C0.447715 17 0 17.4477 0 18V23C0 23.5523 0.447715 24 1 24H6C6.55228 24 7 23.5523 7 23C7 22.4477 6.55228 22 6 22H3.35972L12.7234 12.1905C12.9009 12.0045 13 11.7572 13 11.5V1Z"/><path d="M15.7071 14.2929C15.3166 13.9024 14.6834 13.9024 14.2929 14.2929C13.9024 14.6834 13.9024 15.3166 14.2929 15.7071L20.5858 22H18C17.4477 22 17 22.4477 17 23C17 23.5523 17.4477 24 18 24H23C23.5523 24 24 23.5523 24 23V18C24 17.4477 23.5523 17 23 17C22.4477 17 22 17.4477 22 18V20.5858L15.7071 14.2929Z"/></svg>`,
    workflow: `<svg viewBox="0 0 27 24" fill="currentColor"><path d="M25 24H19C17.9 24 17 23.1 17 22V20H16C15.5 20 15 19.9 14.5 19.7C14 19.5 13.6 19.2 13.2 18.8C12.8 18.4 12.5 18 12.3 17.5C12.1 17 12 16.5 12 16L12 13H9V14.5C9 15.6 8.1 16.5 7 16.5H2C0.9 16.5 0 15.6 0 14.5L0 9.5C0 8.4 0.9 7.5 2 7.5H7C8.1 7.5 9 8.4 9 9.5V11H12V8C12 7.5 12.1 7 12.3 6.5C12.5 6 12.8 5.6 13.2 5.2C13.6 4.8 14 4.5 14.5 4.3C15 4.1 15.5 4 16 4H17V2C17 0.9 17.9 0 19 0L25 0C26.1 0 27 0.9 27 2V8C27 9.1 26.1 10 25 10H19C17.9 10 17 9.1 17 8V6H16C15.7 6 15.5 6 15.2 6.1C15 6.2 14.7 6.3 14.6 6.5C14.5 6.7 14.3 6.9 14.2 7.1C14 7.5 14 7.7 14 8V12L14 16C14 16.3 14 16.5 14.1 16.8C14.2 17 14.3 17.3 14.5 17.4C14.7 17.6 14.9 17.7 15.1 17.8C15.5 18 15.8 18 16 18H17V16C17 14.9 17.9 14 19 14H25C26.1 14 27 14.9 27 16V22C27 23.1 26.1 24 25 24Z"/></svg>`
  };
  return icons[type] || '';
}

// Get larger Domo-style type icon for group headers
function getTypeIconLarge(type) {
  const icons = {
    appstudio: `<svg viewBox="0 0 24 28" fill="currentColor" width="16" height="18"><path fill-rule="evenodd" clip-rule="evenodd" d="M10.6593 0.451353C11.013 0.159656 11.4573 0 11.9159 0C12.3762 0 12.822 0.160774 13.1763 0.454414C14.4179 1.46561 17.1059 3.97249 18.593 7.83792C19.0969 9.14758 19.4581 10.6015 19.5837 12.1908L23.3681 16.7321C23.5682 16.9676 23.7096 17.2474 23.7804 17.5483C23.8505 17.8463 23.8495 18.1566 23.7774 18.454L22.2425 25.4048L22.2418 25.4079C22.1676 25.7389 22.0104 26.0456 21.7851 26.2991C21.5597 26.5527 21.2736 26.7447 20.9536 26.8572C20.6336 26.9697 20.2902 26.999 19.9557 26.9422C19.6213 26.8855 19.3068 26.7447 19.0418 26.5329L19.0413 26.5325L15.5652 23.7517H8.26709L4.7909 26.5326L4.79042 26.533C4.52541 26.7447 4.2109 26.8856 3.87647 26.9423C3.54203 26.9991 3.19866 26.9698 2.87866 26.8573C2.55865 26.7448 2.27251 26.5528 2.04715 26.2992C1.82179 26.0457 1.66462 25.739 1.59042 25.408L1.58973 25.4049L0.0548065 18.4541C-0.0172318 18.1567 -0.0182873 17.8464 0.0518364 17.5484C0.12269 17.2472 0.264162 16.9673 0.464524 16.7317L4.17394 12.2899C4.29038 10.6593 4.65894 9.16945 5.17911 7.83023C6.68076 3.96409 9.40275 1.45781 10.6593 0.451353Z"/></svg>`,
    dataflow: `<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M13 1C13 0.447715 12.5523 0 12 0C11.4477 0 11 0.447715 11 1V11.0993L2 20.5279L2 18C2 17.4477 1.55228 17 1 17C0.447715 17 0 17.4477 0 18V23C0 23.5523 0.447715 24 1 24H6C6.55228 24 7 23.5523 7 23C7 22.4477 6.55228 22 6 22H3.35972L12.7234 12.1905C12.9009 12.0045 13 11.7572 13 11.5V1Z"/><path d="M15.7071 14.2929C15.3166 13.9024 14.6834 13.9024 14.2929 14.2929C13.9024 14.6834 13.9024 15.3166 14.2929 15.7071L20.5858 22H18C17.4477 22 17 22.4477 17 23C17 23.5523 17.4477 24 18 24H23C23.5523 24 24 23.5523 24 23V18C24 17.4477 23.5523 17 23 17C22.4477 17 22 17.4477 22 18V20.5858L15.7071 14.2929Z"/></svg>`,
    workflow: `<svg viewBox="0 0 27 24" fill="currentColor" width="16" height="14"><path d="M25 24H19C17.9 24 17 23.1 17 22V20H16C15.5 20 15 19.9 14.5 19.7C14 19.5 13.6 19.2 13.2 18.8C12.8 18.4 12.5 18 12.3 17.5C12.1 17 12 16.5 12 16L12 13H9V14.5C9 15.6 8.1 16.5 7 16.5H2C0.9 16.5 0 15.6 0 14.5L0 9.5C0 8.4 0.9 7.5 2 7.5H7C8.1 7.5 9 8.4 9 9.5V11H12V8C12 7.5 12.1 7 12.3 6.5C12.5 6 12.8 5.6 13.2 5.2C13.6 4.8 14 4.5 14.5 4.3C15 4.1 15.5 4 16 4H17V2C17 0.9 17.9 0 19 0L25 0C26.1 0 27 0.9 27 2V8C27 9.1 26.1 10 25 10H19C17.9 10 17 9.1 17 8V6H16C15.7 6 15.5 6 15.2 6.1C15 6.2 14.7 6.3 14.6 6.5C14.5 6.7 14.3 6.9 14.2 7.1C14 7.5 14 7.7 14 8V12L14 16C14 16.3 14 16.5 14.1 16.8C14.2 17 14.3 17.3 14.5 17.4C14.7 17.6 14.9 17.7 15.1 17.8C15.5 18 15.8 18 16 18H17V16C17 14.9 17.9 14 19 14H25C26.1 14 27 14.9 27 16V22C27 23.1 26.1 24 25 24Z"/></svg>`
  };
  return icons[type] || '';
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Navigation
  elements.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });
  
  // View all runs link
  document.querySelectorAll('.view-all-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });
  
  // Refresh buttons
  if (elements.refreshOverview) {
    elements.refreshOverview.addEventListener('click', () => {
      showToast('Refreshing...', 'info');
      loadOverviewData();
    });
  }
  
  if (elements.refreshAssets) {
    elements.refreshAssets.addEventListener('click', () => {
      showToast('Refreshing assets...', 'info');
      loadAssetsData();
    });
  }
  
  // Sync All button
  if (elements.syncAllBtn) {
    elements.syncAllBtn.addEventListener('click', () => {
      showToast('Syncing all assets...', 'info');
      setTimeout(() => {
        showToast('✅ All assets synced!', 'success');
      }, 2000);
    });
  }
  
  // Settings
  if (elements.saveSettingsBtn) {
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
  }
  
  // GitHub Panel
  if (elements.refreshGithubBtn) {
    elements.refreshGithubBtn.addEventListener('click', () => {
      showToast('Refreshing GitHub files...', 'info');
      loadGithubPanel();
    });
  }
  
  // Asset filters
  if (elements.typeFilter) {
    elements.typeFilter.addEventListener('change', filterAssets);
  }
  if (elements.statusFilter) {
    elements.statusFilter.addEventListener('change', filterAssets);
  }
  if (elements.assetSearch) {
    elements.assetSearch.addEventListener('input', filterAssets);
  }
}

function filterAssets() {
  const typeFilter = elements.typeFilter?.value || '';
  const statusFilter = elements.statusFilter?.value || '';
  const search = elements.assetSearch?.value?.toLowerCase() || '';
  
  let filtered = state.assets;
  
  if (typeFilter) {
    filtered = filtered.filter(a => a.type === typeFilter);
  }
  if (statusFilter) {
    filtered = filtered.filter(a => a.status === statusFilter);
  }
  if (search) {
    filtered = filtered.filter(a => 
      (a.name || a.title || '').toLowerCase().includes(search) ||
      a.id.toLowerCase().includes(search)
    );
  }
  
  renderAssetsTable(filtered);
}

// ============================================================================
// Initialize
// ============================================================================

async function init() {
  console.log('Asset Versioning initializing...');
  
  initElements();
  
  if (typeof domo === 'undefined') {
    console.warn('domo.js not available - running in demo mode');
  }
  
  loadSavedSettings();
  setupEventListeners();
  
  // Load initial page
  navigateTo('overview');
  
  // Load GitHub panel
  loadGithubPanel();
  
  console.log('Asset Versioning ready!');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
