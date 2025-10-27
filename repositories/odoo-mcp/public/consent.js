// Get query parameters from URL
const urlParams = new URLSearchParams(window.location.search);

// Fetch consent data from backend
async function loadConsentData() {
  try {
    const response = await fetch(`/oauth/consent${window.location.search}`, {
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

// Handle form submission
document.getElementById('consent-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const action = e.submitter.value; // 'allow' or 'deny'

  // Convert FormData to JSON
  const data = {
    client_id: formData.get('client_id'),
    redirect_uri: formData.get('redirect_uri'),
    scope: formData.get('scope'),
    state: formData.get('state'),
    code_challenge: formData.get('code_challenge'),
    code_challenge_method: formData.get('code_challenge_method'),
    nonce: formData.get('nonce'),
    action: action
  };

  try {
    const response = await fetch('/oauth/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    // Backend will redirect, so we follow it
    if (response.redirected) {
      window.location.href = response.url;
    } else if (response.ok) {
      const result = await response.json();
      if (result.redirect) {
        window.location.href = result.redirect;
      }
    } else {
      const error = await response.json();
      alert(`Error: ${error.message || 'Failed to process consent'}`);
    }
  } catch (error) {
    console.error('Error submitting consent:', error);
    alert('Failed to submit authorization. Please try again.');
  }
});

// Load consent data when page loads
loadConsentData();
