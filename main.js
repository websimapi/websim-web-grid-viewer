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

    // --- Helper Functions ---

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
        
        const agentName = lastName ? `${firstName} ${lastName}` : firstName;
        console.log(`Attempting login for ${agentName} to ${loginUrl}`);

        // Note: Login logic verified to use standard XML-RPC login_to_simulator
        // endpoint structure, including mandatory parameters and handling optional last name.
        const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>login_to_simulator</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member><name>firstname</name><value><string>${firstName}</string></value></member>
          <member><name>lastname</name><value><string>${lastName}</string></value></member>
          <member><name>passwd</name><value><string>${passwordHash}</string></value></member>
          <member><name>start</name><value><string>last</string></value></member>
          <member><name>version</name><value><string>Web Grid Viewer 1.0</string></value></member>
          <member><name>platform</name><value><string>web</string></value></member>
          <member><name>mac</name><value><string>00:00:00:00:00:00</string></value></member>
          <member><name>id0</name><value><string>00:00:00:00:00:00</string></value></member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

        const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(loginUrl)}`;

        const response = await fetch(proxiedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xmlBody,
        });

        if (!response.ok) {
            // Handles network/CORS proxy failure resulting in an bad HTTP status code (e.g., 5xx from proxy or 4xx)
            throw new Error(`Connection error: Failed to reach the grid server (${response.status} ${response.statusText || 'Unknown Error'}). Please check the grid status indicator and URL.`);
        }

        const responseText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, "application/xml");
        
        // Check for XML-RPC fault structure (A common immediate failure response)
        if (xmlDoc.getElementsByTagName('fault').length > 0) {
            let faultString = xmlDoc.getElementsByTagName('faultString')[0]?.textContent;
            
            console.error('XML-RPC Fault received:', { faultString });
            throw new Error(`Login failed (XML-RPC Fault): ${faultString || 'Unknown server fault.'}`);
        }


        // Simple XML parsing helper
        const getVal = (name) => {
            const members = xmlDoc.getElementsByTagName('member');
            for (const member of members) {
                if (member.getElementsByTagName('name')[0]?.textContent === name) {
                    return member.getElementsByTagName('value')[0]?.firstElementChild?.textContent;
                }
            }
            return null;
        };

        if (getVal('login') !== 'true') {
            const rawReason = getVal('reason');
            const rawMessage = getVal('message');

            const message = rawMessage?.trim();
            const reason = rawReason?.trim();

            console.error('Login Failed (Protocol Error):', { reason, message, rawResponse: responseText });

            let userMessage = 'Login failed.';

            if (message) {
                // Prioritize the human-readable message provided by the grid
                userMessage = message;
            } else if (reason) {
                // If no message, use the reason code, cleaned up.
                const displayReason = reason.replace(/_/g, ' ');
                userMessage = `Login failed: ${displayReason}`;
            } else {
                // Fallback for unexpected failures where login is not true but no reason/message is provided
                 userMessage = 'Login failed: The server rejected the request with no specific reason provided by the grid.';
            }
            
            throw new Error(userMessage);
        }

        return {
            agentId: getVal('agent_id'),
            sessionId: getVal('session_id'),
            secureSessionId: getVal('secure_session_id'),
            simIp: getVal('sim_ip'),
            simPort: getVal('sim_port'),
            regionX: getVal('region_x'),
            regionY: getVal('region_y'),
            // ... extract other useful data as needed
        };
    }
});