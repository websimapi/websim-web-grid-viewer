document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginStatus = document.getElementById('login-status');
    const gridSelect = document.getElementById('grid-select');
    const customGridUrlContainer = document.getElementById('custom-grid-url-container');
    
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    // Show/hide custom grid URL input based on selection
    gridSelect.addEventListener('change', () => {
        if (gridSelect.value === 'custom') {
            customGridUrlContainer.classList.remove('hidden');
        } else {
            customGridUrlContainer.classList.add('hidden');
        }
    });

    // Handle login form submission
    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const firstName = document.getElementById('first-name').value;
        const lastName = document.getElementById('last-name').value;
        const password = document.getElementById('password').value;

        // Basic validation
        if (!firstName || !lastName || !password) {
            loginStatus.textContent = 'All fields are required.';
            loginStatus.classList.add('error');
            return;
        }

        loginStatus.textContent = 'Logging in...';
        loginStatus.classList.remove('error');
        loginButton.disabled = true;

        // Simulate network request
        setTimeout(() => {
            // On successful "login"
            loginView.classList.remove('active');
            appView.classList.add('active');
            
            welcomeMessage.textContent = `Welcome, ${firstName} ${lastName}`;

            // Reset login form for next time
            loginForm.reset();
            loginButton.disabled = false;
            loginStatus.textContent = '';
            customGridUrlContainer.classList.add('hidden');

        }, 2000);
    });
    
    // Handle logout
    logoutButton.addEventListener('click', () => {
        appView.classList.remove('active');
        loginView.classList.add('active');
    });
});

