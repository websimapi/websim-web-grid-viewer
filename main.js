import { xmlrpc, XMLRPC_makeRequest } from './xmlrpc.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');
    const gridSelect = document.getElementById('grid-select');
    const customGridUrlContainer = document.getElementById('custom-grid-url-container');
    const customGridUrlInput = document.getElementById('custom-grid-url');
    
    // Password visibility elements
    const passwordInput = document.getElementById('password');
    const togglePasswordButton = document.getElementById('toggle-password');
    
    // New: Grid Status elements
    const gridStatusContainer = document.getElementById('grid-status-container');
    const currentGridStatusSpan = document.getElementById('current-grid-status');
    
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');
    const sessionDetails = document.getElementById('session-details');
    const sessionData = document.getElementById('session-data');

    // --- Grid Info ---
    const GRIDS = {
        agni: 'https://login.agni.lindenlab.com/cgi-bin/login.cgi',
        aditi: 'https://login.aditi.lindenlab.com/cgi-bin/login.cgi',
    };
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    // --- App State ---
    let sessionInfo = {};
    let gridStatusCheckTimeout; // To debounce status checks

    // --- UI Event Listeners ---

    // Toggle password visibility
    togglePasswordButton.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Change the icon/text based on state
        togglePasswordButton.textContent = type === 'password' ? '👁️' : '🙈';
        togglePasswordButton.setAttribute('aria-label', type === 'password' ? 'Show password' : 'Hide password');
    });

    // Show/hide custom grid URL input based on selection
    gridSelect.addEventListener('change', () => {
        if (gridSelect.value === 'custom') {
            customGridUrlContainer.classList.remove('hidden');
        } else {
            customGridUrlContainer.classList.add('hidden');
        }
        updateGridStatus();
    });

    // Custom URL input change
    customGridUrlInput.addEventListener('input', () => {
        // Debounce status check for custom URL input
        clearTimeout(gridStatusCheckTimeout);
        gridStatusCheckTimeout = setTimeout(updateGridStatus, 1000);
    });
    
    // Initial status check
    updateGridStatus();


    // Handle login form submission
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const password = document.getElementById('password').value;
        const grid = gridSelect.value;

        // Basic validation: only require firstName (or username) and password
        if (!firstName || !password) {
            showError('Username/First Name and Password are required.');
            return;
        }

        let loginUrl = GRIDS[grid];
        if (grid === 'custom') {
            loginUrl = customGridUrlInput.value.trim();
            if (!loginUrl) {
                showError('Custom grid URL is required.');
                return;
            }
        }

        loginStatus.textContent = `Connecting to ${gridSelect.options[gridSelect.selectedIndex].text}...`;
        loginStatus.classList.remove('error');
        loginButton.disabled = true;

        try {
            const result = await performLogin(firstName, lastName, password, loginUrl);
            sessionInfo = {
                firstName,
                lastName,
                ...result
            };
            
            // On successful login
            loginView.classList.remove('active');
            appView.classList.add('active');
            welcomeMessage.textContent = `Welcome, ${sessionInfo.firstName} ${sessionInfo.lastName}`;
            
            // Display session info to "prove" connection
            sessionData.textContent = JSON.stringify({
                agent_id: sessionInfo.agentId,
                session_id: sessionInfo.sessionId,
                secure_session_id: sessionInfo.secureSessionId,
                sim_ip: sessionInfo.simIp,
                sim_port: sessionInfo.simPort,
                region_x: sessionInfo.regionX,
                region_y: sessionInfo.regionY,
            }, null, 2);
            sessionDetails.classList.remove('hidden');

            // Reset login form
            loginForm.reset();
            customGridUrlContainer.classList.add('hidden');

        } catch (error) {
            showError(error.message);
        } finally {
            loginButton.disabled = false;
            // The status message should persist on failure until the next attempt.
        }
    });

    // Handle logout
    logoutButton.addEventListener('click', () => {
        sessionInfo = {};
        appView.classList.remove('active');
        loginView.classList.add('active');
        sessionDetails.classList.add('hidden');
        sessionData.textContent = '';
    });

    // --- Utility Functions ---

    function escapeXml(unsafe) {
        if (!unsafe) return '';
        // Escape characters commonly causing XML parsing issues in HTTP payloads
        return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    
    function showError(message) {
        loginStatus.textContent = message;
        loginStatus.classList.add('error');
    }

    // New: Grid status check functions

    function getCurrentGridUrl() {
        const grid = gridSelect.value;
        if (grid === 'custom') {
            return customGridUrlInput.value.trim();
        }
        return GRIDS[grid];
    }

    function updateGridStatus() {
        const url = getCurrentGridUrl();
        if (!url) {
            currentGridStatusSpan.innerHTML = '<span class="grid-status-indicator status-unknown"></span> Grid URL missing';
            return;
        }

        currentGridStatusSpan.innerHTML = '<span class="grid-status-indicator status-checking"></span> Checking status...';
        
        checkGridStatus(url)
            .then(status => {
                if (status === 'Online') {
                    currentGridStatusSpan.innerHTML = '<span class="grid-status-indicator status-online"></span> Grid Online';
                } else {
                    currentGridStatusSpan.innerHTML = `<span class="grid-status-indicator status-offline"></span> Grid Offline/Unreachable`;
                }
            })
            .catch(() => {
                currentGridStatusSpan.innerHTML = '<span class="grid-status-indicator status-offline"></span> Grid Check Failed (Network Error)';
            });
    }

    async function checkGridStatus(loginUrl) {
        // Send a minimal XML-RPC request that is guaranteed to fail authentication 
        // but verify network and endpoint responsiveness.
        const minimalXmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>login_to_simulator</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member><name>firstname</name><value><string>status_check</string></value></member>
          <member><name>lastname</name><value><string>Resident</string></value></member>
          <member><name>passwd</name><value><string>invalid</string></value></member>
          <member><name>start</name><value><string>last</string></value></member>
          <member><name>version</name><value><string>Status Checker</string></value></member>
          <member><name>platform</name><value><string>web</string></value></member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

        const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(loginUrl)}`;
        
        // Use AbortController for a short timeout (e.g., 5 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); 

        try {
            const response = await fetch(proxiedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: minimalXmlBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // If the server responds with a 2xx or 4xx status, it means the endpoint is reachable
            // and processed the request (even if it rejected the payload).
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return 'Online';
            } else {
                return 'Offline';
            }

        } catch (error) {
            clearTimeout(timeoutId);
            return 'Offline';
        }
    }


    /**
     * Performs the XML-RPC login to a grid.
     */
    async function performLogin(firstName, lastName, password, loginUrl) {
        // Standard Second Life/OpenSim login hashing: MD5 hash prefixed with $1$
        const passwordHash = '$1$' + CryptoJS.MD5(password).toString();
        
        // Use 'Resident' as the last name if the user left it blank for compatibility.
        const effectiveLastName = lastName || 'Resident';
        
        const agentName = lastName ? `${firstName} ${lastName}` : firstName;
        console.log(`Attempting login for ${agentName} to ${loginUrl} using effective last name: ${effectiveLastName}`);

        // Construct the parameters as a JavaScript object for the XML-RPC library
        const loginParams = {
            firstname: firstName,
            lastname: effectiveLastName,
            passwd: passwordHash,
            start: 'last',
            version: 'Web Grid Viewer 1.0',
            channel: 'Web Grid Viewer',
            platform: 'web',
            mac: '00:00:00:00:00:00',
            id0: `web-client-${Date.now()}`,
            agree_to_tos: true,
            read_critical: true,
            options: [], // Empty array for options
        };

        const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(loginUrl)}`;
        
        try {
            // Use the xmlrpc helper to perform the call
            const responseData = await xmlrpc(proxiedUrl, 'login_to_simulator', [loginParams]);

            // The library returns parsed JS objects. Check the login status.
            if (responseData.login !== 'true') {
                 const message = responseData.message?.trim();
                 const reason = responseData.reason?.trim();

                 console.error('Login Failed (Protocol Error):', responseData);

                 let userMessage = 'Login failed.';

                 if (message) {
                     userMessage = message;
                 } else if (reason) {
                     const displayReason = reason.replace(/_/g, ' ');
                     userMessage = `Login failed: ${displayReason}`;
                 } else {
                     userMessage = 'Login failed. Please verify your username, password, and grid selection. If credentials are correct, the grid server may be experiencing issues.';
                 }
                 throw new Error(userMessage);
            }
            
            // Success! Return the relevant session information.
            return {
                agentId: responseData.agent_id,
                sessionId: responseData.session_id,
                secureSessionId: responseData.secure_session_id,
                simIp: responseData.sim_ip,
                simPort: responseData.sim_port,
                regionX: responseData.region_x,
                regionY: responseData.region_y,
                // Spread other useful data from the response
                ...responseData
            };

        } catch (error) {
            // Re-throw library errors or our custom protocol errors with more context.
            console.error('An error occurred during login:', error);
            // The error from xmlrpc library or our check above will be more informative.
            throw new Error(error.message || 'An unknown login error occurred.');
        }
    }
});