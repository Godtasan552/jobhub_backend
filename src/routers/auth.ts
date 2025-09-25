import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { AuthController } from '../Controllers/authControllers';
import { authenticate, authRateLimit } from '../Middleware/authMiddleware';
import { validate, authSchemas, userSchemas, customValidators } from '../Middleware/validation';
import { UPLOAD_PATHS, API_CONFIG } from '@/utils/constants';

// สร้าง router สำหรับจัดการเส้นทาง auth
const router = Router();
// สร้าง instance ของ AuthController เพื่อเรียกใช้เมธอดต่าง ๆ
const authController = new AuthController();

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

/**
 * @route   POST /api/v1/auth/register
 * @desc    ลงทะเบียนผู้ใช้ใหม่
 * @access  Public
 */
router.post(
  '/register', // เส้นทางสำหรับลงทะเบียน
  authRateLimit(), // จำกัดจำนวน request
  validate(authSchemas.register), // ตรวจสอบข้อมูลที่ส่งมา
  customValidators.validateUniqueEmail, // ตรวจสอบ email ซ้ำ
  authController.register // เรียกใช้เมธอด register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    เข้าสู่ระบบ
 * @access  Public
 */
router.post(
  '/login', // เส้นทางสำหรับเข้าสู่ระบบ
  authRateLimit(), // จำกัดจำนวน request
  validate(authSchemas.login), // ตรวจสอบข้อมูลที่ส่งมา
  authController.login // เรียกใช้เมธอด login
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    รีเฟรช access token
 * @access  Public
 */
router.post(
  '/refresh-token', // เส้นทางสำหรับรีเฟรช token
  validate(authSchemas.refreshToken), // ตรวจสอบข้อมูล token
  authController.refreshToken // เรียกใช้เมธอด refreshToken
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    ออกจากระบบ
 * @access  Private
 */
router.post(
  '/logout', // เส้นทางสำหรับ logout
  authenticate, // ตรวจสอบ token ก่อน
  authController.logout // เรียกใช้เมธอด logout
);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน
 * @access  Private
 */
router.get(
  '/profile', // เส้นทางสำหรับดึงโปรไฟล์
  authenticate, // ตรวจสอบ token ก่อน
  authController.getProfile // เรียกใช้เมธอด getProfile
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    อัพเดทข้อมูลโปรไฟล์ผู้ใช้
 * @access  Private
 */
router.put(
  '/profile', // เส้นทางสำหรับอัพเดทโปรไฟล์
  authenticate, // ตรวจสอบ token ก่อน
  validate(userSchemas.updateProfile), // ตรวจสอบข้อมูลที่ส่งมา
  authController.updateProfile // เรียกใช้เมธอด updateProfile
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    เปลี่ยนรหัสผ่าน
 * @access  Private
 */
router.post(
  '/change-password', // เส้นทางสำหรับเปลี่ยนรหัสผ่าน
  authenticate, // ตรวจสอบ token ก่อน
  validate(authSchemas.changePassword), // ตรวจสอบข้อมูลที่ส่งมา
  authController.changePassword // เรียกใช้เมธอด changePassword
);

/**
 * @route   POST /api/v1/auth/upload-profile-picture
 * @desc    อัพโหลดรูปโปรไฟล์
 * @access  Private
 */
router.post(
  '/upload-profile-picture', // เส้นทางสำหรับอัพโหลดรูปโปรไฟล์
  authenticate, // ตรวจสอบ token ก่อน
  profilePictureUpload.single('profilePicture'), // ใช้ multer รับไฟล์
  authController.uploadProfilePicture // เรียกใช้เมธอด uploadProfilePicture
);

/**
 * @route   POST /api/v1/auth/deactivate-account
 * @desc    ปิดการใช้งานบัญชีผู้ใช้
 * @access  Private
 */
router.post(
  '/deactivate-account', // เส้นทางสำหรับปิดบัญชี
  authenticate, // ตรวจสอบ token ก่อน
  authController.deactivateAccount // เรียกใช้เมธอด deactivateAccount
);

/**
 * @route   GET /api/v1/auth/stats
 * @desc    ดึงสถิติของผู้ใช้
 * @access  Private
 */
router.get(
  '/stats', // เส้นทางสำหรับดึงสถิติ
  authenticate, // ตรวจสอบ token ก่อน
  authController.getUserStats // เรียกใช้เมธอด getUserStats
);

/**
 * @route   GET /api/v1/auth/verify-token
 * @desc    ตรวจสอบ JWT token (health check)
 * @access  Private
 */
router.get(
  '/verify-token', // เส้นทางสำหรับตรวจสอบ token
  authenticate, // ตรวจสอบ token ก่อน
  authController.verifyToken // เรียกใช้เมธอด verifyToken
);

// ส่งออก router เพื่อให้ไฟล์อื่นนำไปใช้งาน
export default router;