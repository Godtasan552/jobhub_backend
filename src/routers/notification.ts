import { Router } from 'express'; // นำเข้า Router จาก express สำหรับสร้างเส้นทาง API
import { NotificationController } from '../Controllers/notificationController'; // นำเข้า controller ที่จัดการ notification
import { authenticate } from '../Middleware/authMiddleware'; // นำเข้า middleware สำหรับตรวจสอบ token
import { validate, validateQuery, validateParams, notificationSchemas, commonSchemas } from '../Middleware/validation'; // นำเข้า middleware สำหรับ validate ข้อมูลและ schema
import Joi from 'joi'; // นำเข้า Joi สำหรับ validate schema

const router = Router(); // สร้าง instance ของ Router
const notificationController = new NotificationController(); // สร้าง instance ของ NotificationController

/**
 * @route   GET /api/v1/notifications
 * @desc    Get all notifications for the current user
 * @access  Private
 */
router.get(
  '/', // เส้นทางดึง notification ทั้งหมด
  authenticate, // ตรวจสอบ token
  validateQuery(notificationSchemas.notificationQuery), // ตรวจสอบ query string ด้วย schema
  notificationController.getNotifications // เรียกเมธอดดึง notification
);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get(
  '/unread-count', // เส้นทางดึงจำนวน notification ที่ยังไม่ได้อ่าน
  authenticate, // ตรวจสอบ token
  notificationController.getUnreadCount // เรียกเมธอดดึงจำนวนที่ยังไม่ได้อ่าน
);

/**
 * @route   POST /api/v1/notifications/mark-read
 * @desc    Mark notification(s) as read
 * @access  Private
 */
router.post(
  '/mark-read', // เส้นทาง mark notification ว่าอ่านแล้ว
  authenticate, // ตรวจสอบ token
  validate(notificationSchemas.markAsRead), // ตรวจสอบ body ด้วย schema
  notificationController.markAsRead // เรียกเมธอด mark ว่าอ่านแล้ว
);

/**
 * @route   POST /api/v1/notifications/:id/mark-unread
 * @desc    Mark notification as unread
 * @access  Private
 */
router.post(
  '/:id/mark-unread', // เส้นทาง mark notification ว่ายังไม่ได้อ่าน
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    id: commonSchemas.objectId.required() // ตรวจสอบ id ว่าเป็น ObjectId
  })),
  notificationController.markAsUnread // เรียกเมธอด mark ว่ายังไม่ได้อ่าน
);

/**
 * @route   DELETE /api/v1/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:id', // เส้นทางลบ notification ตาม id
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    id: commonSchemas.objectId.required() // ตรวจสอบ id ว่าเป็น ObjectId
  })),
  notificationController.deleteNotification // เรียกเมธอดลบ notification
);

/**
 * @route   DELETE /api/v1/notifications
 * @desc    Delete multiple notifications
 * @access  Private
 */
router.delete(
  '/', // เส้นทางลบ notification หลายรายการ
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    notificationIds: Joi.array().items(commonSchemas.objectId).min(1).required() // ตรวจสอบ array id
  })),
  notificationController.deleteMultipleNotifications // เรียกเมธอดลบหลายรายการ
);

/**
 * @route   DELETE /api/v1/notifications/clear-read
 * @desc    Clear all read notifications
 * @access  Private
 */
router.delete(
  '/clear-read', // เส้นทางลบ notification ที่อ่านแล้วทั้งหมด
  authenticate, // ตรวจสอบ token
  notificationController.clearReadNotifications // เรียกเมธอดลบที่อ่านแล้ว
);

/**
 * @route   GET /api/v1/notifications/stats
 * @desc    Get notification statistics
 * @access  Private
 */
router.get(
  '/stats', // เส้นทางดึงสถิติ notification
  authenticate, // ตรวจสอบ token
  notificationController.getNotificationStats // เรียกเมธอดดึงสถิติ
);

/**
 * @route   PUT /api/v1/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put(
  '/preferences', // เส้นทางอัพเดท preferences
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    preferences: Joi.object({
      job: Joi.boolean().default(true), // เปิด/ปิดแจ้งเตือนงาน
      milestone: Joi.boolean().default(true), // เปิด/ปิดแจ้งเตือน milestone
      payment: Joi.boolean().default(true), // เปิด/ปิดแจ้งเตือนการเงิน
      chat: Joi.boolean().default(true), // เปิด/ปิดแจ้งเตือนแชท
      system: Joi.boolean().default(true), // เปิด/ปิดแจ้งเตือนระบบ
      email: Joi.boolean().default(false), // เปิด/ปิดแจ้งเตือนทางอีเมล
      push: Joi.boolean().default(true) // เปิด/ปิดแจ้งเตือน push
    }).required() // ต้องมี preferences
  })),
  notificationController.updatePreferences // เรียกเมธอดอัพเดท preferences
);

/**
 * @route   GET /api/v1/notifications/:id
 * @desc    Get notification by ID
 * @access  Private
 */
router.get(
  '/:id', // เส้นทางดึง notification ตาม id
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    id: commonSchemas.objectId.required() // ตรวจสอบ id ว่าเป็น ObjectId
  })),
  notificationController.getNotificationById // เรียกเมธอดดึง notification ตาม id
);

/**
 * @route   POST /api/v1/notifications/test
 * @desc    Send test notification (for development/admin)
 * @access  Private
 */
router.post(
  '/test', // เส้นทางส่ง notification ทดสอบ
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    title: Joi.string().max(200), // ชื่อเรื่อง
    message: Joi.string().max(500), // ข้อความ
    type: Joi.string().valid('job', 'milestone', 'payment', 'chat', 'system').default('system') // ประเภท
  })),
  notificationController.sendTestNotification // เรียกเมธอดส่ง notification ทดสอบ
);

/**
 * @route   POST /api/v1/notifications/:id/snooze
 * @desc    Snooze notification (mark as read temporarily)
 * @access  Private
 */
router.post(
  '/:id/snooze', // เส้นทาง snooze notification
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    id: commonSchemas.objectId.required() // ตรวจสอบ id ว่าเป็น ObjectId
  })),
  validate(Joi.object({
    minutes: Joi.number().integer().min(15).max(1440).default(60) // จำนวนเวลาที่ snooze (15 นาที - 24 ชม.)
  })),
  notificationController.snoozeNotification // เรียกเมธอด snooze
);

/**
 * @route   GET /api/v1/notifications/type/:type
 * @desc    Get notifications by type
 * @access  Private
 */
router.get(
  '/type/:type', // เส้นทางดึง notification ตามประเภท
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    type: Joi.string().valid('job', 'milestone', 'payment', 'chat', 'system').required() // ตรวจสอบ type
  })),
  validateQuery(Joi.object({
    page: Joi.number().integer().min(1).default(1), // หน้า
    limit: Joi.number().integer().min(1).max(100).default(20), // จำนวนต่อหน้า
    read: Joi.boolean() // สถานะอ่าน/ยังไม่อ่าน
  })),
  notificationController.getNotificationsByType // เรียกเมธอดดึงตามประเภท
);

/**
 * @route   POST /api/v1/notifications/bulk
 * @desc    Bulk operations on notifications
 * @access  Private
 */
router.post(
  '/bulk', // เส้นทาง bulk operation
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    operation: Joi.string().valid('mark_read', 'mark_unread', 'delete').required(), // ประเภท operation
    notificationIds: Joi.array().items(commonSchemas.objectId), // รายการ id (optional)
    filters: Joi.object({
      type: Joi.string().valid('job', 'milestone', 'payment', 'chat', 'system'), // ประเภท (optional)
      read: Joi.boolean(), // สถานะอ่าน (optional)
      olderThan: Joi.date() // เงื่อนไขวันที่ (optional)
    })
  })),
  notificationController.bulkOperations // เรียกเมธอด bulk operation
);

export default router; // ส่งออก router สำหรับใช้งานใน app หลัก