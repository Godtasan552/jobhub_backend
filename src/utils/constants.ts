// API Constants
// กำหนดค่าคงที่สำหรับการตั้งค่า API เช่น path, ขนาดไฟล์, ประเภทไฟล์ที่รองรับ ฯลฯ
export const API_CONFIG = {
  VERSION: 'v1', // เวอร์ชัน API
  BASE_PATH: '/api/v1', // path หลักของ API
  DEFAULT_PAGE_SIZE: 10, // จำนวนข้อมูลต่อหน้าเริ่มต้น
  MAX_PAGE_SIZE: 100, // จำนวนข้อมูลต่อหน้าสูงสุด
  MAX_UPLOAD_SIZE: 5 * 1024 * 1024, // ขนาดไฟล์อัพโหลดสูงสุด (5MB)
  SUPPORTED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ] // ประเภทไฟล์ที่อนุญาตให้อัพโหลด
};

// Job Constants
// กำหนดค่าคงที่เกี่ยวกับงาน เช่น ประเภทงาน, สถานะ, หมวดหมู่ยอดนิยม ฯลฯ
export const JOB_CONSTANTS = {
  TYPES: ['freelance', 'part-time', 'contract', 'full-time'] as const, // ประเภทงาน
  STATUSES: ['active', 'closed', 'in_progress', 'completed', 'cancelled'] as const, // สถานะงาน
  DEFAULT_DURATION: '1-2 weeks', // ระยะเวลางานเริ่มต้น
  MIN_BUDGET: 1, // งบขั้นต่ำ
  MAX_APPLICANTS: 50, // จำนวนผู้สมัครสูงสุด
  POPULAR_CATEGORIES: [
    'Web Development',
    'Mobile Development',
    'UI/UX Design',
    'Content Writing',
    'Digital Marketing',
    'Data Analysis',
    'Virtual Assistant',
    'Translation',
    'Video Editing',
    'Graphic Design'
  ] // หมวดหมู่งานยอดนิยม
};

// User Constants
// กำหนดค่าคงที่เกี่ยวกับผู้ใช้ เช่น role, ความยาวรหัสผ่าน, จำนวน skill ฯลฯ
export const USER_CONSTANTS = {
  ROLES: ['employer', 'worker'] as const, // ประเภทผู้ใช้
  MIN_PASSWORD_LENGTH: 6, // ความยาวรหัสผ่านขั้นต่ำ
  MAX_SKILLS: 20, // จำนวน skill สูงสุด
  MAX_CATEGORIES: 10, // จำนวนหมวดหมู่สูงสุด
  PROFILE_COMPLETION_FIELDS: [
    'name', 'email', 'about', 'phone', 'location', 'profilePic', 'skills', 'categories'
  ], // ฟิลด์ที่ใช้วัดความสมบูรณ์โปรไฟล์
  DEFAULT_WALLET_BALANCE: 0 // ยอดเงินเริ่มต้น
};

// Milestone Constants
// กำหนดค่าคงที่เกี่ยวกับ milestone เช่น สถานะ, จำนวนสูงสุด ฯลฯ
export const MILESTONE_CONSTANTS = {
  STATUSES: ['unpaid', 'in_progress', 'completed', 'paid'] as const, // สถานะ milestone
  MAX_PER_JOB: 10, // จำนวน milestone ต่อ job สูงสุด
  MIN_AMOUNT: 0.01 // จำนวนเงินขั้นต่ำ
};

// Transaction Constants
// กำหนดค่าคงที่เกี่ยวกับธุรกรรม เช่น ประเภท, สถานะ, ค่าธรรมเนียม ฯลฯ
export const TRANSACTION_CONSTANTS = {
  TYPES: ['job_payment', 'milestone_payment', 'payroll', 'refund', 'bonus'] as const, // ประเภทธุรกรรม
  STATUSES: ['pending', 'completed', 'failed', 'cancelled'] as const, // สถานะธุรกรรม
  MIN_AMOUNT: 0.01, // จำนวนเงินขั้นต่ำ
  PROCESSING_FEE: 0.029, // ค่าธรรมเนียม (2.9%)
  MOCK_SUCCESS_RATE: 0.95 // อัตราสำเร็จสำหรับ mock payment
};

// Message Constants
// กำหนดค่าคงที่เกี่ยวกับข้อความ เช่น ประเภท, ความยาวสูงสุด ฯลฯ
export const MESSAGE_CONSTANTS = {
  TYPES: ['text', 'file', 'image'] as const, // ประเภทข้อความ
  MAX_LENGTH: 2000, // ความยาวข้อความสูงสุด
  MAX_ATTACHMENTS_PER_MESSAGE: 3, // จำนวนไฟล์แนบต่อข้อความสูงสุด
  CLEANUP_AFTER_DAYS: 365 // ลบข้อความเก่าหลัง 1 ปี
};

// Notification Constants
// กำหนดค่าคงที่เกี่ยวกับแจ้งเตือน เช่น ประเภท, จำนวนสูงสุด ฯลฯ
export const NOTIFICATION_CONSTANTS = {
  TYPES: ['job', 'milestone', 'payment', 'chat', 'system'] as const, // ประเภทแจ้งเตือน
  MAX_PER_USER: 100, // จำนวนแจ้งเตือนต่อผู้ใช้สูงสุด
  CLEANUP_AFTER_DAYS: 90, // ลบแจ้งเตือนที่อ่านแล้วหลัง 90 วัน
  PRIORITY_LEVELS: {
    HIGH: ['payment', 'milestone'],
    MEDIUM: ['job'],
    LOW: ['chat', 'system']
  } // ระดับความสำคัญของแจ้งเตือน
};

// Socket Events
// กำหนดชื่อ event สำหรับ socket.io ที่ใช้ในระบบ
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect', // เชื่อมต่อ
  DISCONNECT: 'disconnect', // ตัดการเชื่อมต่อ
  
  // Chat
  JOIN_CHAT: 'join_chat', // เข้าห้องแชท
  LEAVE_CHAT: 'leave_chat', // ออกจากห้องแชท
  SEND_MESSAGE: 'send_message', // ส่งข้อความ
  RECEIVE_MESSAGE: 'receive_message', // รับข้อความ
  TYPING_START: 'typing_start', // เริ่มพิมพ์
  TYPING_STOP: 'typing_stop', // หยุดพิมพ์
  USER_TYPING: 'user_typing', // ผู้ใช้กำลังพิมพ์
  MESSAGE_READ: 'message_read', // อ่านข้อความ
  MESSAGES_READ: 'messages_read', // อ่านข้อความหลายอัน
  MARK_MESSAGES_READ: 'mark_messages_read', // mark ข้อความว่าอ่านแล้ว
  
  // Status
  UPDATE_STATUS: 'update_status', // อัพเดทสถานะ
  USER_STATUS_CHANGED: 'user_status_changed', // สถานะผู้ใช้เปลี่ยน
  
  // Notifications
  NOTIFICATION: 'notification', // แจ้งเตือน
  JOB_UPDATE: 'job_update', // อัพเดทงาน
  MILESTONE_UPDATE: 'milestone_update', // อัพเดท milestone
  PAYMENT_UPDATE: 'payment_update' // อัพเดทธุรกรรม
};

// Error Messages
// กำหนดข้อความ error ที่ใช้ในระบบ
export const ERROR_MESSAGES = {
  // Auth
  INVALID_CREDENTIALS: 'Invalid email or password', // ข้อมูลเข้าสู่ระบบไม่ถูกต้อง
  EMAIL_ALREADY_EXISTS: 'Email already exists', // อีเมลนี้มีอยู่แล้ว
  USER_NOT_FOUND: 'User not found', // ไม่พบผู้ใช้
  ACCOUNT_DEACTIVATED: 'Account is deactivated', // บัญชีถูกปิดใช้งาน
  TOKEN_REQUIRED: 'Access token is required', // ต้องใช้ token
  TOKEN_INVALID: 'Invalid token', // token ไม่ถูกต้อง
  TOKEN_EXPIRED: 'Token expired', // token หมดอายุ
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions', // สิทธิ์ไม่เพียงพอ
  
  // Jobs
  JOB_NOT_FOUND: 'Job not found', // ไม่พบงาน
  CANNOT_APPLY_OWN_JOB: 'Cannot apply to your own job', // สมัครงานตัวเองไม่ได้
  ALREADY_APPLIED: 'Already applied to this job', // สมัครงานนี้ไปแล้ว
  JOB_NOT_ACTIVE: 'Job is not active', // งานไม่เปิดรับ
  JOB_NOT_EDITABLE: 'Job cannot be edited in current status', // งานแก้ไขไม่ได้ในสถานะนี้
  
  // Milestones
  MILESTONE_NOT_FOUND: 'Milestone not found', // ไม่พบ milestone
  INVALID_MILESTONE_STATUS: 'Invalid milestone status transition', // สถานะ milestone ไม่ถูกต้อง
  MILESTONE_ALREADY_PAID: 'Milestone is already paid', // milestone จ่ายเงินแล้ว
  
  // Transactions
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance', // เงินใน wallet ไม่พอ
  TRANSACTION_NOT_FOUND: 'Transaction not found', // ไม่พบธุรกรรม
  PAYMENT_FAILED: 'Payment processing failed', // จ่ายเงินไม่สำเร็จ
  INVALID_TRANSACTION_STATUS: 'Invalid transaction status', // สถานะธุรกรรมไม่ถูกต้อง
  
  // Messages
  MESSAGE_NOT_FOUND: 'Message not found', // ไม่พบข้อความ
  CANNOT_MESSAGE_SELF: 'Cannot send message to yourself', // ส่งข้อความหาตัวเองไม่ได้
  
  // Files
  FILE_TOO_LARGE: 'File size exceeds maximum limit', // ไฟล์ใหญ่เกินไป
  INVALID_FILE_TYPE: 'File type not supported', // ประเภทไฟล์ไม่รองรับ
  UPLOAD_FAILED: 'File upload failed', // อัพโหลดไฟล์ไม่สำเร็จ
  
  // Generic
  VALIDATION_FAILED: 'Validation failed', // validation ไม่ผ่าน
  RESOURCE_NOT_FOUND: 'Resource not found', // ไม่พบ resource
  ACCESS_DENIED: 'Access denied', // ไม่มีสิทธิ์เข้าถึง
  SERVER_ERROR: 'Internal server error', // เซิร์ฟเวอร์ error
  RATE_LIMIT_EXCEEDED: 'Too many requests', // ส่ง request เกิน limit
  MAINTENANCE_MODE: 'Service temporarily unavailable', // ระบบปิดปรับปรุง
  AUTHENTICATION_REQUIRED: 'Authentication is required',
};

// Success Messages
// กำหนดข้อความ success ที่ใช้ในระบบ
export const SUCCESS_MESSAGES = {
  // Auth
  LOGIN_SUCCESS: 'Login successful', // เข้าสู่ระบบสำเร็จ
  REGISTER_SUCCESS: 'Registration successful', // สมัครสมาชิกสำเร็จ
  LOGOUT_SUCCESS: 'Logout successful', // ออกจากระบบสำเร็จ
  TOKEN_REFRESHED: 'Token refreshed successfully', // refresh token สำเร็จ
  PASSWORD_CHANGED: 'Password changed successfully', // เปลี่ยนรหัสผ่านสำเร็จ
  
  // Profile
  PROFILE_UPDATED: 'Profile updated successfully', // อัพเดทโปรไฟล์สำเร็จ
  PROFILE_PICTURE_UPDATED: 'Profile picture updated successfully', // อัพเดทรูปโปรไฟล์สำเร็จ
  
  // Jobs
  JOB_CREATED: 'Job created successfully', // สร้างงานสำเร็จ
  JOB_UPDATED: 'Job updated successfully', // อัพเดทงานสำเร็จ
  JOB_DELETED: 'Job deleted successfully', // ลบงานสำเร็จ
  JOB_APPLICATION_SUBMITTED: 'Job application submitted successfully', // สมัครงานสำเร็จ
  JOB_ASSIGNED: 'Job assigned successfully', // มอบหมายงานสำเร็จ
  JOB_COMPLETED: 'Job completed successfully', // งานเสร็จสิ้น
  
  // Milestones
  MILESTONE_CREATED: 'Milestone created successfully', // สร้าง milestone สำเร็จ
  MILESTONE_UPDATED: 'Milestone updated successfully', // อัพเดท milestone สำเร็จ
  MILESTONE_COMPLETED: 'Milestone marked as completed', // milestone เสร็จสิ้น
  MILESTONE_PAID: 'Milestone payment processed successfully', // จ่าย milestone สำเร็จ
  
  // Transactions
  PAYMENT_SUCCESS: 'Payment processed successfully', // จ่ายเงินสำเร็จ
  PAYMENT_SENT: 'Payment sent successfully', // ส่งเงินสำเร็จ
  WALLET_UPDATED: 'Wallet balance updated successfully', // อัพเดท wallet สำเร็จ
  
  // Messages
  MESSAGE_SENT: 'Message sent successfully', // ส่งข้อความสำเร็จ
  MESSAGES_MARKED_READ: 'Messages marked as read', // mark ข้อความว่าอ่านแล้ว
  
  // Notifications
  NOTIFICATIONS_MARKED_READ: 'Notifications marked as read', // mark แจ้งเตือนว่าอ่านแล้ว
  NOTIFICATIONS_CLEARED: 'Notifications cleared successfully', // ลบแจ้งเตือนสำเร็จ
  
  // Files
  FILE_UPLOADED: 'File uploaded successfully', // อัพโหลดไฟล์สำเร็จ
  FILE_DELETED: 'File deleted successfully', // ลบไฟล์สำเร็จ
  
  // Generic
  OPERATION_SUCCESS: 'Operation completed successfully', // ดำเนินการสำเร็จ
  DATA_RETRIEVED: 'Data retrieved successfully', // ดึงข้อมูลสำเร็จ
  DATA_UPDATED: 'Data updated successfully', // อัพเดทข้อมูลสำเร็จ
  DATA_DELETED: 'Data deleted successfully' // ลบข้อมูลสำเร็จ
};

// Rate Limiting
// กำหนดค่าควบคุมการส่ง request เช่น จำกัดจำนวนครั้งต่อช่วงเวลา
export const RATE_LIMITS = {
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 นาที
    MAX_REQUESTS: 5 // 5 ครั้งต่อช่วงเวลา
  },
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15 นาที
    MAX_REQUESTS: 100 // 100 ครั้งต่อช่วงเวลา
  },
  UPLOAD: {
    WINDOW_MS: 60 * 60 * 1000, // 1 ชั่วโมง
    MAX_REQUESTS: 20 // 20 ครั้งต่อชั่วโมง
  },
  MESSAGE: {
    WINDOW_MS: 60 * 1000, // 1 นาที
    MAX_REQUESTS: 30 // 30 ข้อความต่อนาที
  }
};

// Database Collections
// กำหนดชื่อ collection ในฐานข้อมูล
export const COLLECTIONS = {
  USERS: 'users',
  JOBS: 'jobs',
  MILESTONES: 'milestones',
  PAYROLLS: 'payrolls',
  TRANSACTIONS: 'transactions',
  MESSAGES: 'messages',
  NOTIFICATIONS: 'notifications',
  JOB_APPLICATIONS: 'jobapplications'
};

// Cache Keys
// กำหนด key สำหรับ cache ข้อมูลต่าง ๆ
export const CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  JOB_DETAILS: (jobId: string) => `job:details:${jobId}`,
  USER_JOBS: (userId: string, type: string) => `user:jobs:${userId}:${type}`,
  POPULAR_CATEGORIES: 'jobs:popular_categories',
  USER_STATS: (userId: string) => `user:stats:${userId}`,
  JOB_STATS: 'jobs:stats',
  ACTIVE_USERS: 'users:active'
};

// Cache TTL (Time To Live) in seconds
// กำหนดเวลาหมดอายุของ cache
export const CACHE_TTL = {
  SHORT: 5 * 60, // 5 นาที
  MEDIUM: 30 * 60, // 30 นาที
  LONG: 2 * 60 * 60, // 2 ชั่วโมง
  VERY_LONG: 24 * 60 * 60 // 24 ชั่วโมง
};

// Pagination
// กำหนดค่าคงที่สำหรับการแบ่งหน้า
export const PAGINATION = {
  DEFAULT_PAGE: 1, // หน้าเริ่มต้น
  DEFAULT_LIMIT: 10, // จำนวนข้อมูลต่อหน้าเริ่มต้น
  MAX_LIMIT: 100, // จำนวนข้อมูลต่อหน้าสูงสุด
  DEFAULT_SORT: '-createdAt' // การเรียงข้อมูลเริ่มต้น
};

// Email Templates
// กำหนดชื่อ template สำหรับส่งอีเมล
export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  JOB_APPLICATION: 'job_application',
  JOB_ASSIGNED: 'job_assigned',
  MILESTONE_COMPLETED: 'milestone_completed',
  PAYMENT_RECEIVED: 'payment_received',
  PASSWORD_RESET: 'password_reset'
};

// File Upload Paths
// กำหนด path สำหรับอัพโหลดไฟล์แต่ละประเภท
export const UPLOAD_PATHS = {
  PROFILE_PICTURES: 'uploads/profile-pictures/',
  JOB_ATTACHMENTS: 'uploads/job-attachments/',
  MESSAGE_ATTACHMENTS: 'uploads/message-attachments/',
  TEMP: 'uploads/temp/'
};

// Validation Patterns
// กำหนด pattern สำหรับตรวจสอบข้อมูล เช่น email, phone, objectId ฯลฯ
export const VALIDATION_PATTERNS = {
  EMAIL: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
  PHONE: /^[\+]?[1-9][\d]{0,15}$/,
  MONGODB_OBJECT_ID: /^[0-9a-fA-F]{24}$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  USERNAME: /^[a-zA-Z0-9_]{3,20}$/
};

// HTTP Status Codes
// กำหนดรหัสสถานะ HTTP ที่ใช้ในระบบ
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Environment
// กำหนด environment ที่รองรับ
export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
};

// Job Categories (Popular ones)
// รายชื่อหมวดหมู่งานยอดนิยม
export const JOB_CATEGORIES = [
  'Web Development',
  'Mobile Development',
  'UI/UX Design',
  'Graphic Design',
  'Content Writing',
  'Digital Marketing',
  'SEO',
  'Social Media Management',
  'Data Analysis',
  'Virtual Assistant',
  'Translation',
  'Video Editing',
  'Photography',
  'Accounting',
  'Customer Service',
  'Project Management',
  'Consulting',
  'Teaching/Training',
  'Research',
  'Other'
];

// Skills (Common ones)
// รายชื่อทักษะยอดนิยม
export const COMMON_SKILLS = [
  // Programming
  'JavaScript',
  'Python',
  'Java',
  'PHP',
  'React',
  'Vue.js',
  'Angular',
  'Node.js',
  'Flutter',
  'React Native',
  
  // Design
  'Photoshop',
  'Illustrator',
  'Figma',
  'Sketch',
  'InDesign',
  'After Effects',
  'Premiere Pro',
  
  // Marketing
  'Google Ads',
  'Facebook Ads',
  'SEO',
  'Content Marketing',
  'Email Marketing',
  'Social Media',
  
  // Other
  'WordPress',
  'Excel',
  'Data Analysis',
  'Project Management',
  'Customer Service',
  'Translation',
  'Writing',
  'Research'
];

// Default User Categories by Role
// หมวดหมู่เริ่มต้นสำหรับแต่ละ role
export const DEFAULT_CATEGORIES = {
  employer: [
    'Technology',
    'Marketing',
    'Design',
    'Writing',
    'Business'
  ],
  worker: [
    'Web Development',
    'Mobile Development',
    'Design',
    'Writing',
    'Marketing'
  ]
};

// System Configuration
// กำหนดค่าคอนฟิกระบบ เช่น เปิด/ปิดฟีเจอร์ต่าง ๆ
export const SYSTEM_CONFIG = {
  MAINTENANCE_MODE: false, // ระบบปิดปรับปรุงหรือไม่
  REGISTRATION_ENABLED: true, // เปิดสมัครสมาชิกหรือไม่
  FILE_UPLOADS_ENABLED: true, // เปิดอัพโหลดไฟล์หรือไม่
  CHAT_ENABLED: true, // เปิดแชทหรือไม่
  NOTIFICATIONS_ENABLED: true, // เปิดแจ้งเตือนหรือไม่
  EMAIL_NOTIFICATIONS_ENABLED: true, // เปิดแจ้งเตือนอีเมลหรือไม่
  SMS_NOTIFICATIONS_ENABLED: false // เปิดแจ้งเตือน SMS หรือไม่
};

// Mock Payment Configuration
// กำหนดค่าคอนฟิกสำหรับ mock payment
export const MOCK_PAYMENT_CONFIG = {
  SUCCESS_RATE: 0.95, // อัตราสำเร็จ
  PROCESSING_TIME_MS: 2000, // เวลาดำเนินการ (ms)
  FAILURE_REASONS: [
    'Insufficient funds',
    'Payment method declined',
    'Network error',
    'Payment gateway timeout'
  ] // เหตุผลที่ล้มเหลว
};

// Notification Priorities
// กำหนดระดับความสำคัญของแจ้งเตือนแต่ละประเภท
export const NOTIFICATION_PRIORITIES = {
  HIGH: ['payment', 'milestone'],
  MEDIUM: ['job', 'system'],
  LOW: ['chat']
};

// WebSocket Room Types
// กำหนดประเภทห้องสำหรับ websocket
export const ROOM_TYPES = {
  USER: 'user',
  CHAT: 'chat',
  JOB: 'job',
  GLOBAL: 'global'
};

// API Documentation
// ข้อมูลสำหรับเอกสาร API
export const API_INFO = {
  TITLE: 'JobHub API',
  DESCRIPTION: 'Job Posting & Hiring Platform API',
  VERSION: '1.0.0',
  CONTACT: {
    name: 'JobHub Team',
    email: 'support@jobhub.com'
  }
};