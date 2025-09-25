import { Router } from 'express'; // นำเข้า Router จาก express สำหรับสร้างเส้นทาง API
import { WalletController } from '../Controllers/walletController'; // นำเข้า controller ที่จัดการกระเป๋าเงิน
import { authenticate, requireEmployer } from '../Middleware/authMiddleware'; // นำเข้า middleware สำหรับตรวจสอบสิทธิ์
import { validate, validateQuery, validateParams, transactionSchemas, commonSchemas } from '../Middleware/validation'; // นำเข้า middleware สำหรับตรวจสอบข้อมูลและ schema
import Joi from 'joi'; // นำเข้า Joi สำหรับ validate schema

const router = Router(); // สร้าง instance ของ Router
const walletController = new WalletController(); // สร้าง instance ของ WalletController

/**
 * @route   GET /api/v1/wallet
 * @desc    Get wallet balance and summary
 * @access  Private
 */
router.get(
  '/', // เส้นทาง root ของ wallet
  authenticate, // ตรวจสอบ token
  walletController.getWalletBalance // เรียกเมธอดดึงยอดเงินและสรุป
);

/**
 * @route   GET /api/v1/wallet/transactions
 * @desc    Get transaction history with filtering
 * @access  Private
 */
router.get(
  '/transactions', // เส้นทางดึงประวัติธุรกรรม
  authenticate, // ตรวจสอบ token
  validateQuery(transactionSchemas.transactionQuery), // ตรวจสอบ query string ด้วย schema
  walletController.getTransactionHistory // เรียกเมธอดดึงประวัติธุรกรรม
);

/**
 * @route   GET /api/v1/wallet/transactions/:id
 * @desc    Get transaction by ID
 * @access  Private
 */
router.get(
  '/transactions/:id', // เส้นทางดึงธุรกรรมตาม id
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id ว่าเป็น ObjectId
  walletController.getTransactionById // เรียกเมธอดดึงธุรกรรมตาม id
);

/**
 * @route   POST /api/v1/wallet/send-payment
 * @desc    Send payment to another user
 * @access  Private
 */
router.post(
  '/send-payment', // เส้นทางส่งเงินให้ผู้ใช้คนอื่น
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    toUserId: commonSchemas.objectId.required(), // id ผู้รับ
    amount: Joi.number().positive().required(), // จำนวนเงินต้องเป็นบวก
    description: Joi.string().max(500), // คำอธิบาย
    type: Joi.string().valid('bonus').default('bonus') // ประเภทธุรกรรม
  })),
  walletController.sendPayment // เรียกเมธอดส่งเงิน
);

/**
 * @route   POST /api/v1/wallet/job-payment
 * @desc    Process job payment
 * @access  Private (Employer only)
 */
router.post(
  '/job-payment', // เส้นทางจ่ายเงินให้กับงาน
  authenticate, // ตรวจสอบ token
  requireEmployer, // ตรวจสอบว่าต้องเป็น employer เท่านั้น
  validate(Joi.object({
    jobId: commonSchemas.objectId.required(), // id งาน
    amount: Joi.number().positive().required(), // จำนวนเงิน
    description: Joi.string().max(500) // คำอธิบาย
  })),
  walletController.processJobPayment // เรียกเมธอดจ่ายเงินงาน
);

/**
 * @route   POST /api/v1/wallet/milestone-payment
 * @desc    Process milestone payment
 * @access  Private (Employer only)
 */
router.post(
  '/milestone-payment', // เส้นทางจ่ายเงิน milestone
  authenticate, // ตรวจสอบ token
  requireEmployer, // ต้องเป็น employer
  validate(Joi.object({
    milestoneId: commonSchemas.objectId.required() // id milestone
  })),
  walletController.processMilestonePayment // เรียกเมธอดจ่าย milestone
);

/**
 * @route   POST /api/v1/wallet/add-funds
 * @desc    Add funds to wallet (mock top-up)
 * @access  Private
 */
router.post(
  '/add-funds', // เส้นทางเติมเงินเข้ากระเป๋า
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    amount: Joi.number().positive().max(10000).required(), // จำนวนเงินสูงสุด 10,000
    paymentMethod: Joi.string().valid('mock_card', 'bank_transfer').default('mock_card') // วิธีเติมเงิน
  })),
  walletController.addFunds // เรียกเมธอดเติมเงิน
);

/**
 * @route   POST /api/v1/wallet/withdraw
 * @desc    Withdraw funds from wallet
 * @access  Private
 */
router.post(
  '/withdraw', // เส้นทางถอนเงิน
  authenticate, // ตรวจสอบ token
  validate(Joi.object({
    amount: Joi.number().positive().required(), // จำนวนเงิน
    withdrawalMethod: Joi.string().valid('bank_transfer', 'paypal').default('bank_transfer') // วิธีถอนเงิน
  })),
  walletController.withdrawFunds // เรียกเมธอดถอนเงิน
);

/**
 * @route   GET /api/v1/wallet/stats
 * @desc    Get wallet statistics
 * @access  Private
 */
router.get(
  '/stats', // เส้นทางดึงสถิติกระเป๋า
  authenticate, // ตรวจสอบ token
  validateQuery(Joi.object({
    period: Joi.number().integer().min(1).max(365).default(30) // จำนวนวันย้อนหลัง
  })),
  walletController.getWalletStats // เรียกเมธอดดึงสถิติ
);

/**
 * @route   POST /api/v1/wallet/transactions/:id/cancel
 * @desc    Cancel pending transaction
 * @access  Private
 */
router.post(
  '/transactions/:id/cancel', // เส้นทางยกเลิกธุรกรรมที่ pending
  authenticate, // ตรวจสอบ token
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  walletController.cancelTransaction // เรียกเมธอดยกเลิกธุรกรรม
);

/**
 * @route   GET /api/v1/wallet/pending-payments
 * @desc    Get pending payments (milestones to pay or payments to receive)
 * @access  Private
 */
router.get(
  '/pending-payments', // เส้นทางดึงรายการที่รอจ่ายหรือรอรับ
  authenticate, // ตรวจสอบ token
  walletController.getPendingPayments // เรียกเมธอดดึง pending payments
);

export default router; // ส่งออก router สำหรับใช้งานใน app หลัก