const form = document.getElementById('form');
const submitBtn = document.getElementById('submitBtn');
const alert = document.getElementById('alert');
const loginFormDiv = document.getElementById('loginForm');
const successCard = document.getElementById('successCard');
const configCode = document.getElementById('configCode');

function showAlert(message, type) {
  alert.textContent = message;
  alert.className = `alert ${type} show`;
}

function hideAlert() {
  alert.className = 'alert';
}

function showError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const error = document.getElementById(`${fieldId}-error`);
  input.classList.add('error');
  error.textContent = message;
  error.classList.add('show');
}

function clearErrors() {
  document.querySelectorAll('input').forEach(input => {
    input.classList.remove('error');
  });
  document.querySelectorAll('.error-message').forEach(error => {
    error.classList.remove('show');
  });
}

function copyConfig() {
  const text = configCode.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy Configuration';
    }, 2000);
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  clearErrors();

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Logging in...';

  const formData = {
    email: form.email.value,
    password: form.password.value
  };

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Show success card with Claude Desktop config
    const claudeConfig = {
      "mcpServers": {
        "odoo-mcp": {
          "command": "node",
          "args": ["-e", "require('@modelcontextprotocol/sdk').createHttpClient({ url: 'https://odoo-mcp.leonobitech.com/mcp', headers: { Authorization: 'Bearer YOUR_ACCESS_TOKEN' } })"],
          "env": {}
        }
      }
    };

    configCode.textContent = JSON.stringify(claudeConfig, null, 2);
    loginFormDiv.style.display = 'none';
    successCard.classList.add('show');

  } catch (error) {
    console.error('Login error:', error);
    showAlert(error.message || 'Login failed. Please check your credentials.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
});

function logout() {
  // Create a form and submit it (avoids CORS issues)
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/auth/logout';
  document.body.appendChild(form);
  form.submit();
}

// Expose functions to window for onclick handlers
window.copyConfig = copyConfig;
window.logout = logout;
