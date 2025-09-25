import { Router } from 'express'; // นำเข้า Router จาก express สำหรับสร้างเส้นทาง API
import { ChatController } from '../Controllers/chatController'; // นำเข้า controller ที่จัดการแชท
import { authenticate } from '../Middleware/authMiddleware'; // นำเข้า middleware สำหรับตรวจสอบ token
import { validate, validateQuery, validateParams, messageSchemas, commonSchemas } from '../Middleware/validation'; // นำเข้า middleware สำหรับตรวจสอบข้อมูลและ schema
import Joi from 'joi'; // นำเข้า Joi สำหรับ validate schema

const router = Router(); // สร้าง instance ของ Router
const chatController = new ChatController(); // สร้าง instance ของ ChatController

/**
 * @route   GET /api/v1/chat/conversations
 * @desc    Get all conversations for the current user
 * @access  Private
 */
router.get(
  '/conversations', // เส้นทางดึงรายชื่อห้องสนทนาทั้งหมด
  authenticate, // ตรวจสอบ token
  chatController.getConversations // เรียกเมธอดดึงห้องสนทนา
);

/**
 * @route   GET /api/v1/chat/conversations/:otherUserId
 * @desc    Get messages in a specific conversation
 * @access  Private
 */
router.get(
  '/conversations/:otherUserId', // เส้นทางดึงข้อความในห้องสนทนาเฉพาะ
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    otherUserId: commonSchemas.objectId.required() // ตรวจสอบ otherUserId ว่าเป็น ObjectId
  })),
  validateQuery(Joi.object({
    page: Joi.number().integer().min(1).default(1), // ตรวจสอบ page
    limit: Joi.number().integer().min(1).max(100).default(50), // ตรวจสอบ limit
    jobId: commonSchemas.objectId // ตรวจสอบ jobId (optional)
  })),
  chatController.getConversation // เรียกเมธอดดึงข้อความในห้องสนทนา
);

/**
 * @route   POST /api/v1/chat/send
 * @desc    Send a message
 * @access  Private
 */
router.post(
  '/send', // เส้นทางส่งข้อความ
  authenticate, // ตรวจสอบ token
  validate(messageSchemas.sendMessage), // ตรวจสอบ body ด้วย schema
  chatController.sendMessage // เรียกเมธอดส่งข้อความ
);

/**
 * @route   POST /api/v1/chat/mark-read
 * @desc    Mark messages as read
 * @access  Private
 */
router.post(
  '/mark-read', // เส้นทาง mark ข้อความว่าอ่านแล้ว
  authenticate, // ตรวจสอบ token
  validate(messageSchemas.markAsRead), // ตรวจสอบ body ด้วย schema
  chatController.markMessagesAsRead // เรียกเมธอด mark ข้อความว่าอ่านแล้ว
);

/**
 * @route   GET /api/v1/chat/search
 * @desc    Search messages
 * @access  Private
 */
router.get(
  '/search', // เส้นทางค้นหาข้อความ
  authenticate, // ตรวจสอบ token
  validateQuery(Joi.object({
    q: Joi.string().min(1).max(100).required(), // คำค้นหา
    page: Joi.number().integer().min(1).default(1), // หน้า
    limit: Joi.number().integer().min(1).max(50).default(20), // จำนวนต่อหน้า
    jobId: commonSchemas.objectId, // งาน (optional)
    withUserId: commonSchemas.objectId // ผู้สนทนา (optional)
  })),
  chatController.searchMessages // เรียกเมธอดค้นหาข้อความ
);

/**
 * @route   GET /api/v1/chat/unread-count
 * @desc    Get unread message count
 * @access  Private
 */
router.get(
  '/unread-count', // เส้นทางดึงจำนวนข้อความที่ยังไม่ได้อ่าน
  authenticate, // ตรวจสอบ token
  chatController.getUnreadCount // เรียกเมธอดดึงจำนวนข้อความที่ยังไม่ได้อ่าน
);

/**
 * @route   DELETE /api/v1/chat/messages/:id
 * @desc    Delete a message (sender only, within time limit)
 * @access  Private
 */
router.delete(
  '/messages/:id', // เส้นทางลบข้อความ
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    id: commonSchemas.objectId.required() // ตรวจสอบ id ว่าเป็น ObjectId
  })),
  chatController.deleteMessage // เรียกเมธอดลบข้อความ
);

/**
 * @route   POST /api/v1/chat/block/:otherUserId
 * @desc    Block/Unblock user (prevent messaging)
 * @access  Private
 */
router.post(
  '/block/:otherUserId', // เส้นทางบล็อก/ปลดบล็อกผู้ใช้
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ 
    otherUserId: commonSchemas.objectId.required() // ตรวจสอบ otherUserId ว่าเป็น ObjectId
  })),
  validate(Joi.object({
    block: Joi.boolean().required() // รับค่า block (true/false)
  })),
  chatController.toggleBlockUser // เรียกเมธอดบล็อก/ปลดบล็อก
);

/**
 * @route   GET /api/v1/chat/stats
 * @desc    Get message statistics
 * @access  Private
 */
router.get(
  '/stats', // เส้นทางดึงสถิติข้อความ
  authenticate, // ตรวจสอบ token
  chatController.getMessageStats // เรียกเมธอดดึงสถิติ
);

/**
 * @route   POST /api/v1/chat/start-conversation
 * @desc    Start a new conversation (initiate chat with job context)
 * @access  Private
 */
router.post(
  '/start-conversation', // เส้นทางเริ่มต้นห้องสนทนาใหม่
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    toUserId: commonSchemas.objectId.required(), // id ผู้รับ
    jobId: commonSchemas.objectId, // id งาน (optional)
    initialMessage: Joi.string().min(1).max(500) // ข้อความแรก (optional)
  })),
  chatController.startConversation // เรียกเมธอดเริ่มต้นห้องสนทนา
);

export default router; // ส่งออก router สำหรับใช้งานใน app หลัก