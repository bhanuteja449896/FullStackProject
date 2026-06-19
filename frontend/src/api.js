const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  // Set up headers
  const headers = {
    ...options.headers,
  };

  // If we have a body and it is not FormData, set Content-Type to JSON
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (typeof options.body === 'object') {
      options.body = JSON.stringify(options.body);
    }
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include', // Important: Include cookies (JWT)
  };

  try {
    let response = await fetch(url, fetchOptions);

    // If access token is expired or unauthorized, try to refresh
    if (response.status === 401 && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
      console.log('Access token expired, attempting transparent refresh...');
      
      const refreshResult = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });

      if (refreshResult.ok) {
        console.log('Token refreshed successfully. Retrying original request...');
        // Retry the original request
        response = await fetch(url, fetchOptions);
      } else {
        console.error('Token refresh failed. Redirecting to login...');
        // Dispatch global auth-expired event so React app knows to clean state
        window.dispatchEvent(new CustomEvent('auth-expired'));
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    // Return JSON if there is content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return { success: true };
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error);
    throw error;
  }
}
