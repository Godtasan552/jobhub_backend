import express from 'express';
import { AuthRequest } from '@/types/index';
import { AdminController } from '../Controllers/AdminController';
import { authenticate, requireAdmin, requireSuperAdmin } from '../Middleware/authMiddleware';
import { 
  requireRole, 
  requireModerator 
} from '../Middleware/RoleMiddleware';
import { validateQuery } from '../Middleware/validation';
import Joi from 'joi';

const router = express.Router();
const adminController = new AdminController();

// ==================== VALIDATION SCHEMAS ====================

// Schema สำหรับการสร้าง moderator
const createModeratorSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});

// Schema สำหรับการปฏิเสธ worker
const rejectWorkerSchema = Joi.object({
  reason: Joi.string().min(10).max(500).required()
});

// Schema สำหรับการอัปเดตสถานะผู้ใช้
const updateUserStatusSchema = Joi.object({
  isActive: Joi.boolean().required()
});

// ==================== MIDDLEWARE CHAINS ====================

// Middleware สำหรับ admin ทั่วไป
const adminAuth = [authenticate, requireAdmin];

// Middleware สำหรับ super admin
const superAdminAuth = [authenticate, requireSuperAdmin];

// Middleware สำหรับ moderator ขึ้นไป
const moderatorAuth = [authenticate, requireModerator];

// ==================== DASHBOARD ROUTES ====================

/**
 * GET /api/v1/admin/dashboard
 * ดึงข้อมูล dashboard สำหรับ admin
 * Access: Admin, Moderator, Super Admin
 */
router.get('/dashboard', adminAuth, adminController.getDashboard);

/**
 * GET /api/v1/admin/stats
 * ดึงสถิติระบบโดยละเอียด
 * Access: Admin, Moderator, Super Admin
 */
router.get('/stats', adminAuth, adminController.getSystemStats);

// ==================== WORKER MANAGEMENT ROUTES ====================

/**
 * GET /api/v1/admin/pending-workers
 * ดึงรายการ worker ที่รออนุมัติ
 * Access: Admin, Moderator, Super Admin
 */
router.get('/pending-workers', adminAuth, adminController.getPendingWorkers);

/**
 * POST /api/v1/admin/approve-worker/:userId
 * อนุมัติ worker
 * Access: Admin, Moderator, Super Admin
 */
router.post('/approve-worker/:userId', adminAuth, adminController.approveWorker);

/**
 * POST /api/v1/admin/reject-worker/:userId
 * ปฏิเสธ worker application
 * Access: Admin, Moderator, Super Admin
 */
router.post(
  '/reject-worker/:userId', 
  [...adminAuth, validateQuery(rejectWorkerSchema)], 
  adminController.rejectWorker
);

// ==================== USER MANAGEMENT ROUTES ====================

/**
 * GET /api/v1/admin/users
 * ดึงรายการผู้ใช้ทั้งหมด
 * Query params: page, limit, search, role, status
 * Access: Admin, Moderator, Super Admin
 */
router.get('/users', adminAuth, adminController.getAllUsers);

/**
 * GET /api/v1/admin/users/:userId
 * ดึงข้อมูลผู้ใช้รายคน
 * Access: Admin, Moderator, Super Admin
 */
router.get('/users/:userId', adminAuth, adminController.getUserDetail);

/**
 * PUT /api/v1/admin/users/:userId/status
 * อัปเดตสถานะผู้ใช้ (เปิด/ปิดการใช้งาน)
 * Access: Admin, Moderator, Super Admin
 */
router.put(
  '/users/:userId/status', 
  [...adminAuth, validateQuery(updateUserStatusSchema)], 
  adminController.updateUserStatus
);

/**
 * DELETE /api/v1/admin/users/:userId
 * ลบผู้ใช้ (เฉพาะ Super Admin)
 * Access: Super Admin only
 */
router.delete('/users/:userId', superAdminAuth, adminController.deleteUser);

// ==================== ADMIN MANAGEMENT ROUTES ====================

/**
 * POST /api/v1/admin/create-moderator
 * สร้าง moderator ใหม่ (เฉพาะ Super Admin)
 * Access: Super Admin only
 */
router.post(
  '/create-moderator', 
  [...superAdminAuth, validateQuery(createModeratorSchema)], 
  adminController.createModerator
);

// ==================== QUICK ACTIONS ====================

/**
 * GET /api/v1/admin/quick-stats
 * ดึงสถิติสำคัญสำหรับ notifications
 * Access: Admin, Moderator, Super Admin
 */
router.get('/quick-stats', adminAuth, async (_req: AuthRequest, res: express.Response) => {
  try {
    const User = (await import('../Models/User')).default;
    const Job = (await import('../Models/Job')).default;
    
    const pendingWorkers = await User.countDocuments({
      role: 'worker',
      isWorkerApproved: false,
      isActive: true
    });
    
    const activeJobs = await Job.countDocuments({ status: 'active' });
    const inProgressJobs = await Job.countDocuments({ status: 'in_progress' });
    
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.success(res, 'Quick stats retrieved', {
      pendingWorkers,
      activeJobs,
      inProgressJobs,
      totalActiveWork: activeJobs + inProgressJobs
    });
  } catch (error) {
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.error(res, 'Error retrieving quick stats', 500);
  }
});

// ==================== BULK OPERATIONS ====================

/**
 * POST /api/v1/admin/bulk-approve-workers
 * อนุมัติ workers หลายคนพร้อมกัน
 * Access: Admin, Moderator, Super Admin
 */
router.post('/bulk-approve-workers', adminAuth, async (req: AuthRequest, res: express.Response) => {
  try {
    const { userIds } = req.body;
    const admin = req.user!;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
      responseHelper.badRequest(res, 'User IDs array is required');
      return;
    }
    
    const User = (await import('../Models/User')).default;
    const Notification = (await import('../Models/Nontification')).default;
    
    // อัปเดตทุกคนพร้อมกัน
    const result = await User.updateMany(
      { 
        _id: { $in: userIds },
        role: 'worker',
        isWorkerApproved: false
      },
      {
        $set: {
          isWorkerApproved: true,
          workerApprovedAt: new Date(),
          workerApprovedBy: admin._id
        },
        $unset: {
          workerRejectionReason: 1
        }
      }
    );
    
    // ส่งการแจ้งเตือนให้ทุกคน
    for (const userId of userIds) {
      await (Notification as any).createWorkerApprovalNotification(
        userId,
        'Worker Application Approved',
        'Congratulations! Your worker application has been approved.',
        '/dashboard'
      );
    }
    
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.success(res, `${result.modifiedCount} workers approved successfully`, {
      approvedCount: result.modifiedCount
    });
  } catch (error) {
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.error(res, 'Error in bulk approval', 500);
  }
});

// ==================== EXPORT ROUTES ====================

/**
 * GET /api/v1/admin/export/users
 * Export ข้อมูลผู้ใช้ (CSV format)
 * Access: Super Admin only
 */
router.get('/export/users', superAdminAuth, async (_req: AuthRequest, res: express.Response) => {
  try {
    const User = (await import('../Models/User')).default;
    
    const users = await User.find({})
      .select('name email role isActive createdAt workerApprovedAt')
      .sort({ createdAt: -1 });
    
    // สร้าง CSV header
    const csvHeader = 'Name,Email,Roles,Status,Joined Date,Worker Approved Date\n';
    
    // สร้าง CSV data
    const csvData = users.map((user: any) => {
      const roles = Array.isArray(user.role) ? user.role.join(';') : user.role;
      const status = user.isActive ? 'Active' : 'Inactive';
      const joinDate = user.createdAt.toISOString().split('T')[0];
      const approvedDate = user.workerApprovedAt ? 
        user.workerApprovedAt.toISOString().split('T')[0] : 'N/A';
      
      return `"${user.name}","${user.email}","${roles}","${status}","${joinDate}","${approvedDate}"`;
    }).join('\n');
    
    const csv = csvHeader + csvData;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
    res.send(csv);
    
  } catch (error) {
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.error(res, 'Error exporting users', 500);
  }
});

// ==================== HEALTH CHECK ====================

/**
 * GET /api/v1/admin/health
 * ตรวจสอบสถานะระบบ admin
 * Access: Admin, Moderator, Super Admin
 */
router.get('/health', adminAuth, async (req: AuthRequest, res: express.Response) => {
  try {
    const admin = req.user!;
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    
    responseHelper.success(res, 'Admin system is healthy', {
      adminId: admin._id,
      adminLevel: admin.adminLevel,
      roles: admin.role,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const responseHelper = (await import('@/utils/responseHelper')).responseHelper;
    responseHelper.error(res, 'Admin system health check failed', 500);
  }
});

// ==================== ERROR HANDLING ====================

// Error handler สำหรับ admin routes
router.use((error: any, req: any, res: any, _next: any) => {
  console.error('Admin Route Error:', error);
  
  const responseHelper = require('@/utils/responseHelper').responseHelper;
  
  // Log admin errors สำหรับ audit
  if (req.user) {
    console.log(`Admin Error - User: ${req.user._id}, Route: ${req.path}, Error: ${error.message}`);
  }
  
  responseHelper.error(res, 'Admin operation failed', 500);
});

export default router;