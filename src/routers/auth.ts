import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { AuthController } from '../Controllers/authControllers';
import { authenticate, authRateLimit } from '../Middleware/authMiddleware';
import { validate, authSchemas, userSchemas, customValidators } from '../Middleware/validation';
import { requireRole } from '../Middleware/RoleMiddleware';
import { UPLOAD_PATHS, API_CONFIG } from '@/utils/constants';
import Joi from 'joi';

// สร้าง router สำหรับจัดการเส้นทาง auth
const router = Router();
// สร้าง instance ของ AuthController เพื่อเรียกใช้เมธอดต่าง ๆ
const authController = new AuthController();

// ==================== VALIDATION SCHEMAS ====================

// Schema สำหรับการสมัครเป็น worker
const applyWorkerSchema = Joi.object({
  skills: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(20).required(),
  categories: Joi.array().items(Joi.string().min(1).max(50)).min(1).max(10).required(),
  experience: Joi.string().min(50).max(1000).optional(),
  portfolio: Joi.string().uri().optional(),
  hourlyRate: Joi.number().min(0).max(10000).optional(),
  availability: Joi.string().valid('full-time', 'part-time', 'flexible').default('flexible')
});

// กำหนดการตั้งค่า multer สำหรับอัพโหลดรูปโปรไฟล์
const profilePictureUpload = multer({
  storage: multer.diskStorage({
    // กำหนดโฟลเดอร์ปลายทางสำหรับเก็บไฟล์
    destination: (_req, _file, cb) => {
      cb(null, UPLOAD_PATHS.PROFILE_PICTURES);
    },
    // กำหนดชื่อไฟล์ให้ไม่ซ้ำกันโดยใช้ timestamp และ random
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  // กำหนดขนาดไฟล์สูงสุดและจำนวนไฟล์ที่อัพโหลดได้
  limits: {
    fileSize: API_CONFIG.MAX_UPLOAD_SIZE,
    files: 1
  },
  // กำหนดประเภทไฟล์ที่อนุญาตให้อัพโหลด
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  }
});

// ==================== PUBLIC ROUTES ====================

/**
 * @route   POST /api/v1/auth/register
 * @desc    ลงทะเบียนผู้ใช้ใหม่ (default role: employer)
 * @access  Public
 */
router.post(
  '/register',
  authRateLimit(),
  validate(authSchemas.register),
  customValidators.validateUniqueEmail,
  authController.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    เข้าสู่ระบบ
 * @access  Public
 */
router.post(
  '/login',
  authRateLimit(),
  validate(authSchemas.login),
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    รีเฟรช access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  validate(authSchemas.refreshToken),
  authController.refreshToken
);

// ==================== PRIVATE ROUTES ====================

/**
 * @route   POST /api/v1/auth/logout
 * @desc    ออกจากระบบ
 * @access  Private
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน
 * @access  Private
 */
router.get(
  '/profile',
  authenticate,
  authController.getProfile
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    อัพเดทข้อมูลโปรไฟล์ผู้ใช้
 * @access  Private
 */
router.put(
  '/profile',
  authenticate,
  validate(userSchemas.updateProfile),
  authController.updateProfile
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    เปลี่ยนรหัสผ่าน
 * @access  Private
 */
router.post(
  '/change-password',
  authenticate,
  validate(authSchemas.changePassword),
  authController.changePassword
);

/**
 * @route   POST /api/v1/auth/upload-profile-picture
 * @desc    อัพโหลดรูปโปรไฟล์
 * @access  Private
 */
router.post(
  '/upload-profile-picture',
  authenticate,
  profilePictureUpload.single('profilePicture'),
  authController.uploadProfilePicture
);

// ==================== WORKER APPLICATION ROUTES ====================

/**
 * @route   POST /api/v1/auth/apply-worker
 * @desc    สมัครเป็น Worker (ต้องเป็น user ที่ล็อกอินแล้ว)
 * @access  Private
 */
router.post(
  '/apply-worker',
  authenticate,
  validate(applyWorkerSchema),
  authController.applyWorker
);

/**
 * @route   GET /api/v1/auth/worker-status
 * @desc    ตรวจสอบสถานะการสมัครเป็น Worker
 * @access  Private
 */
router.get(
  '/worker-status',
  authenticate,
  authController.getWorkerStatus
);

// ==================== ADMIN/TESTING ROUTES ====================

/**
 * @route   POST /api/v1/auth/switch-role
 * @desc    เปลี่ยน role (สำหรับ admin หรือ testing)
 * @access  Private - Admin only for other users
 */
router.post(
  '/switch-role',
  authenticate,
  validate(Joi.object({
    targetRole: Joi.string().valid('employer', 'worker', 'admin').required(),
    action: Joi.string().valid('add', 'remove').required(),
    userId: Joi.string().optional() // ถ้าไม่ส่งจะเป็นการเปลี่ยน role ตัวเอง
  })),
  authController.switchRole
);

// ==================== ACCOUNT MANAGEMENT ====================

/**
 * @route   POST /api/v1/auth/deactivate-account
 * @desc    ปิดการใช้งานบัญชีผู้ใช้
 * @access  Private
 */
router.post(
  '/deactivate-account',
  authenticate,
  authController.deactivateAccount
);

/**
 * @route   GET /api/v1/auth/stats
 * @desc    ดึงสถิติของผู้ใช้
 * @access  Private
 */
router.get(
  '/stats',
  authenticate,
  authController.getUserStats
);

/**
 * @route   GET /api/v1/auth/verify-token
 * @desc    ตรวจสอบ JWT token (health check)
 * @access  Private
 */
router.get(
  '/verify-token',
  authenticate,
  authController.verifyToken
);

// ส่งออก router เพื่อให้ไฟล์อื่นนำไปใช้งาน
export default router;