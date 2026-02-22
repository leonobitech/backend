const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const alert = document.getElementById('alert');
const passwordInput = document.getElementById('password');

// Password validation
const requirements = {
  length: /^.{8,}$/,
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /\d/,
  special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
};

passwordInput.addEventListener('input', () => {
  const password = passwordInput.value;

  document.getElementById('req-length').classList.toggle('valid', requirements.length.test(password));
  document.getElementById('req-lowercase').classList.toggle('valid', requirements.lowercase.test(password));
  document.getElementById('req-uppercase').classList.toggle('valid', requirements.uppercase.test(password));
  document.getElementById('req-number').classList.toggle('valid', requirements.number.test(password));
  document.getElementById('req-special').classList.toggle('valid', requirements.special.test(password));
});

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  clearErrors();

  // Validate password
  const password = passwordInput.value;
  const allValid = Object.values(requirements).every(regex => regex.test(password));

  if (!allValid) {
    showError('password', 'Password does not meet all requirements');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Creating account...';

  const formData = {
    email: form.email.value,
    password: form.password.value,
    name: form.name.value,
    odoo: {
      url: form.odooUrl.value.trim(),
      db: form.odooDb.value.trim(),
      username: form.odooUsername.value.trim(),
      apiKey: form.odooApiKey.value.trim()
    }
  };

  try {
    const response = await fetch('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.details) {
        // Handle validation errors
        if (data.details.fieldErrors) {
          for (const [field, errors] of Object.entries(data.details.fieldErrors)) {
            showError(field, errors[0]);
          }
        }
      }
      throw new Error(data.message || 'Registration failed');
    }

    showAlert('Account created successfully! Redirecting to login...', 'success');

    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);

  } catch (error) {
    console.error('Registration error:', error);
    showAlert(error.message || 'Registration failed. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
});
