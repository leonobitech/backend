// Get query parameters from URL
const urlParams = new URLSearchParams(window.location.search);

// Fetch consent data from backend
async function loadConsentData() {
  try {
    const response = await fetch(`/oauth/consent${window.location.search}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to load consent data');
    }

    const data = await response.json();

    // Populate user info
    document.getElementById('user-name').textContent = data.user.name || 'User';
    document.getElementById('user-email').textContent = data.user.email || '';

    // Populate client name
    document.getElementById('client-name').textContent = data.clientName;

    // Populate scopes list
    const scopesList = document.getElementById('scopes-list');
    scopesList.innerHTML = '';

    data.scopes.forEach(scope => {
      const li = document.createElement('li');
      const description = data.scopeDescriptions[scope] || scope;
      li.textContent = description;
      scopesList.appendChild(li);
    });

    // Populate hidden form fields
    document.getElementById('client-id').value = urlParams.get('client_id');
    document.getElementById('redirect-uri').value = urlParams.get('redirect_uri');
    document.getElementById('scope').value = urlParams.get('scope');
    document.getElementById('state').value = urlParams.get('state') || '';
    document.getElementById('code-challenge').value = urlParams.get('code_challenge');
    document.getElementById('code-challenge-method').value = urlParams.get('code_challenge_method');
    document.getElementById('nonce').value = urlParams.get('nonce') || '';

  } catch (error) {
    console.error('Error loading consent data:', error);
    alert('Failed to load authorization request. Please try again.');
  }
}

// Handle form submission - Use native form submit to allow cross-origin redirect
document.getElementById('consent-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const form = e.target;
  const action = e.submitter.value; // 'allow' or 'deny'

  // Disable form to prevent double submission
  const buttons = form.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });

  // Show loading message
  const container = document.querySelector('.container');
  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; text-align: center; color: #1976d2;';
  loadingDiv.innerHTML = action === 'allow'
    ? '<strong>✓ Authorization granted!</strong><br/>Redirecting to Claude Desktop...<br/><small style="color: #666; margin-top: 8px; display: block;">You can close this window.</small>'
    : '<strong>Authorization denied</strong><br/>Redirecting...<br/><small style="color: #666; margin-top: 8px; display: block;">You can close this window.</small>';
  container.appendChild(loadingDiv);

  // Create a new form that will be submitted
  const submitForm = document.createElement('form');
  submitForm.method = 'POST';
  submitForm.action = '/oauth/consent';

  // Copy all hidden fields
  const fields = ['client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'nonce'];
  fields.forEach(fieldName => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = fieldName;
    input.value = form.elements[fieldName].value;
    submitForm.appendChild(input);
  });

  // Add action field
  const actionInput = document.createElement('input');
  actionInput.type = 'hidden';
  actionInput.name = 'action';
  actionInput.value = action;
  submitForm.appendChild(actionInput);

  // Append to body and submit
  document.body.appendChild(submitForm);
  submitForm.submit();

  // Try to close the window after a delay (may not work in all browsers)
  setTimeout(() => {
    window.close();
  }, 2000);
});

// Load consent data when page loads
loadConsentData();
