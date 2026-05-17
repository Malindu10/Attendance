import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

// Attach JWT to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('coach')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (email, pin) => api.post('/auth/login', { email, pin }),
}

export const setupAPI = {
  getSetup: () => api.get('/setup'),
}

export const studentsAPI = {
  list:        (age_group_id) => api.get('/students', { params: { age_group_id } }),
  create:      (data)         => api.post('/students', data),
  uploadPhoto: (studentId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/students/${studentId}/photo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    })
  },
}

export const sessionsAPI = {
  start:    (data)      => api.post('/sessions', data),
  close:    (id)        => api.post(`/sessions/${id}/close`),
  register: (id)        => api.get(`/sessions/${id}/register`),
}

export const attendanceAPI = {
  scan: (sessionId, imageBlob) => {
    const fd = new FormData()
    fd.append('file', imageBlob, 'scan.jpg')
    return api.post(`/sessions/${sessionId}/scan`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 20000,
    })
  },
  confirm: (sessionId, studentId, confidence) =>
    api.post(`/sessions/${sessionId}/confirm`, { student_id: studentId, confidence, method: 'face_scan' }),
  manual:  (sessionId, studentId) =>
    api.post(`/sessions/${sessionId}/manual`, { student_id: studentId, confidence: null, method: 'manual' }),
  markGuest: (sessionId) =>
    api.post(`/sessions/${sessionId}/guest`),
}

export const usageAPI = {
  get: () => api.get('/usage'),
}

export default api
