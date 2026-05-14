const API = {
  async get(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async put(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async upload(url, formData) {
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  async getMe() {
    try {
      const data = await this.get('/api/auth/me');
      return data.user;
    } catch { return null; }
  },
  async login(email, password) {
    const data = await this.post('/api/auth/login', { email, password });
    return data.user;
  },
  async signup(firstName, surname, email, password, gender, dob) {
    const data = await this.post('/api/auth/signup', { firstName, surname, email, password, gender, dob });
    return data.user;
  },
  async logout() {
    await this.post('/api/auth/logout', {});
  }
};
