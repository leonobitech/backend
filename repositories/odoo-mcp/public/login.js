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
  const text = configCode.value;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => {
      btn.textContent = originalText;
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

    // Show success card with the manifest URL
    const manifestUrl = 'https://odoo-mcp.leonobitech.com/.well-known/anthropic/manifest.json';

    configCode.value = manifestUrl;
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

// Check for existing session on page load
async function checkSession() {
  try {
    const response = await fetch('/auth/status', {
      credentials: 'include'
    });

    const data = await response.json();

    if (data.authenticated && data.hasSession) {
      // User has active session, show success card
      const manifestUrl = 'https://odoo-mcp.leonobitech.com/.well-known/anthropic/manifest.json';

      configCode.value = manifestUrl;

      // Update success card with session info
      const successCardContent = successCard.innerHTML;
      const updatedContent = successCardContent.replace(
        '<h2>Login Successful!</h2>',
        `<h2>Session Active</h2><p style="font-size: 14px; color: #666;">Logged in as: ${data.email || 'Unknown'}</p>`
      );
      successCard.innerHTML = updatedContent;

      // Add connector status badge
      if (data.connectorActive) {
        const badge = document.createElement('div');
        badge.style.cssText = 'background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; margin: 16px 0; font-weight: 600; display: inline-block;';
        badge.textContent = '✓ Connector Active in Claude Desktop';
        successCard.insertBefore(badge, successCard.children[2]);
      }

      loginFormDiv.style.display = 'none';
      successCard.classList.add('show');
    }
  } catch (error) {
    console.error('Error checking session:', error);
    // Show login form on error
  }
}

// Run session check on page load
checkSession();

// Expose functions to window for onclick handlers
window.copyConfig = copyConfig;
window.logout = logout;
