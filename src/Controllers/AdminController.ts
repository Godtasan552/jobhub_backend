import { Response } from 'express';
import { AuthRequest, IUser, AdminDashboardStats } from '@/types/index';
import User from '../Models/User';
import Job from '../Models/Job';
import Transaction from '../Models/Transaction';
import Notification from '../Models/Nontification';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandler';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '@/utils/constants';
import { JWTService } from '@/config/jwt';
import bcrypt from 'bcrypt';

export class AdminController {
  /**
   * ดึงข้อมูล Dashboard สำหรับ Admin
   */
  getDashboard = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;

    // ตรวจสอบสิทธิ์ admin
    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    // สถิติผู้ใช้
    const userStats = await User.aggregate([
      {
        $facet: {
          totalUsers: [{ $count: "count" }],
          activeUsers: [{ $match: { isActive: true } }, { $count: "count" }],
          roleStats: [
            { $unwind: '$role' },
            {
              $group: {
                _id: '$role',
                count: { $sum: 1 }
              }
            }
          ],
          workerStats: [
            { $match: { role: 'worker' } },
            {
              $group: {
                _id: null,
                pending: {
                  $sum: { $cond: [{ $eq: ['$isWorkerApproved', false] }, 1, 0] }
                },
                approved: {
                  $sum: { $cond: [{ $eq: ['$isWorkerApproved', true] }, 1, 0] }
                }
              }
            }
          ]
        }
      }
    ]);

    // สถิติงาน
    const jobStats = await Job.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // สถิติธุรกรรม
    const transactionStats = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // กิจกรรมล่าสุด
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role createdAt');

    const recentJobs = await Job.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('employerId', 'name email')
      .select('title type category budget status createdAt');

    const pendingWorkers = await User.find({
      role: 'worker',
      isWorkerApproved: false,
      isActive: true
    }).countDocuments();

    // จัดรูปแบบข้อมูล
    const users = userStats[0];
    const dashboardData: AdminDashboardStats = {
      users: {
        total: users.totalUsers[0]?.count || 0,
        employers: users.roleStats.find((r: any) => r._id === 'employer')?.count || 0,
        workers: users.roleStats.find((r: any) => r._id === 'worker')?.count || 0,
        pendingWorkers: users.workerStats[0]?.pending || 0,
        approvedWorkers: users.workerStats[0]?.approved || 0,
        admins: users.roleStats.find((r: any) => r._id === 'admin')?.count || 0
      },
      jobs: {
        total: jobStats.reduce((sum, stat) => sum + stat.count, 0),
        active: jobStats.find(s => s._id === 'active')?.count || 0,
        completed: jobStats.find(s => s._id === 'completed')?.count || 0,
        inProgress: jobStats.find(s => s._id === 'in_progress')?.count || 0
      },
      transactions: {
        total: transactionStats.reduce((sum, stat) => sum + stat.count, 0),
        totalAmount: transactionStats.reduce((sum, stat) => sum + stat.totalAmount, 0),
        pending: transactionStats.find(s => s._id === 'pending')?.count || 0,
        completed: transactionStats.find(s => s._id === 'completed')?.count || 0
      },
      recentActivity: {
        newUsers: recentUsers.length,
        newJobs: recentJobs.length,
        completedJobs: jobStats.find(s => s._id === 'completed')?.count || 0,
        pendingApprovals: pendingWorkers
      }
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      dashboard: dashboardData,
      recentUsers,
      recentJobs
    });
  });

  /**
   * ดึงรายการ Worker ที่รออนุมัติ
   */
  getPendingWorkers = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { page = 1, limit = 10, search } = req.query;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    let query: any = {
      role: 'worker',
      isWorkerApproved: false,
      isActive: true
    };

    // เพิ่มการค้นหาถ้ามี
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const pendingWorkers = await User.find(query)
      .select('-passwordHash')
      .sort({ workerApplicationDate: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await User.countDocuments(query);

    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      pendingWorkers,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * อนุมัติ Worker
   */
  approveWorker = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { userId } = req.params;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    if (!user.role.includes('worker')) {
      responseHelper.badRequest(res, 'User is not a worker');
      return;
    }

    if (user.isWorkerApproved) {
      responseHelper.badRequest(res, 'Worker is already approved');
      return;
    }

    // อนุมัติ worker
    user.isWorkerApproved = true;
    user.workerApprovedAt = new Date();
    user.workerApprovedBy = admin._id;
    delete user.workerRejectionReason;
    
    // อัปเดต admin activity
    admin.lastAdminAction = new Date();

    await Promise.all([user.save(), admin.save()]);

    // ส่งการแจ้งเตือนให้ worker
    await (Notification as any).createWorkerApprovalNotification(
      user._id,
      'Worker Application Approved',
      'Congratulations! Your worker application has been approved. You can now apply for jobs.',
      '/dashboard'
    );

    responseHelper.success(res, 'Worker approved successfully', {
      userId: user._id,
      approvedAt: user.workerApprovedAt,
      approvedBy: admin._id
    });
  });

  /**
   * ปฏิเสธ Worker
   */
  rejectWorker = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { userId } = req.params;
    const { reason } = req.body;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    if (!user.role.includes('worker')) {
      responseHelper.badRequest(res, 'User is not a worker');
      return;
    }

    // ลบ worker role และบันทึกเหตุผล
    user.role = user.role.filter(r => r !== 'worker');
    user.workerRejectionReason = reason || 'Application rejected by admin';
    user.isWorkerApproved = false;
    delete user.workerApprovedAt;
    delete user.workerApplicationDate;

    // อัปเดต admin activity
    admin.lastAdminAction = new Date();

    await Promise.all([user.save(), admin.save()]);

    // ส่งการแจ้งเตือนให้ user
    await (Notification as any).createWorkerApprovalNotification(
      user._id,
      'Worker Application Rejected',
      `Your worker application has been rejected. Reason: ${reason || 'No specific reason provided'}`,
      '/profile'
    );

    responseHelper.success(res, 'Worker application rejected', {
      userId: user._id,
      reason: user.workerRejectionReason
    });
  });

  /**
   * ดึงรายการผู้ใช้ทั้งหมด
   */
  getAllUsers = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { page = 1, limit = 20, search, role, status } = req.query;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    let query: any = {};

    // กรองตาม role
    if (role && role !== 'all') {
      query.role = role;
    }

    // กรองตาม status
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    // ค้นหา
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await User.countDocuments(query);

    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      users,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * สร้าง Moderator (เฉพาะ Super Admin)
   */
  createModerator = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { name, email, password } = req.body;

    // ตรวจสอบว่าเป็น Super Admin
    if (!admin.role.includes('admin') || admin.adminLevel !== 'super') {
      responseHelper.forbidden(res, 'Super Admin access required');
      return;
    }

    // ตรวจสอบว่า email ซ้ำหรือไม่
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      responseHelper.conflict(res, 'Email already exists');
      return;
    }

    // สร้าง moderator
    const hashedPassword = await bcrypt.hash(password, 12);
    const moderator = new User({
      name,
      email,
      passwordHash: hashedPassword,
      role: ['admin'],
      adminLevel: 'moderator',
      createdBy: admin._id,
      wallet: 0,
      skills: [],
      categories: [],
      isActive: true
    });

    await moderator.save();

    responseHelper.created(res, 'Moderator created successfully', {
      moderatorId: moderator._id,
      email: moderator.email,
      adminLevel: moderator.adminLevel
    });
  });

  /**
   * อัปเดตสถานะผู้ใช้ (เปิด/ปิดการใช้งาน)
   */
  updateUserStatus = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { userId } = req.params;
    const { isActive } = req.body;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // Super Admin ไม่สามารถถูกปิดการใช้งานได้
    if (user.role.includes('admin') && user.adminLevel === 'super') {
      responseHelper.forbidden(res, 'Cannot deactivate Super Admin');
      return;
    }

    user.isActive = isActive;
    admin.lastAdminAction = new Date();

    await Promise.all([user.save(), admin.save()]);

    const statusText = isActive ? 'activated' : 'deactivated';
    responseHelper.success(res, `User ${statusText} successfully`, {
      userId: user._id,
      isActive: user.isActive
    });
  });

  /**
   * ดึงรายงานสถิติระบบ
   */
  getSystemStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    // สถิติการใช้งานรายเดือน
    const monthlyStats = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          newUsers: { $sum: 1 },
          employers: {
            $sum: { $cond: [{ $in: ['employer', '$role'] }, 1, 0] }
          },
          workers: {
            $sum: { $cond: [{ $in: ['worker', '$role'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // สถิติงานรายเดือน
    const jobStats = await Job.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalJobs: { $sum: 1 },
          averageBudget: { $avg: '$budget' },
          completedJobs: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Top categories
    const topCategories = await Job.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      monthlyUserStats: monthlyStats,
      monthlyJobStats: jobStats,
      topCategories
    });
  });

  /**
   * ดึงข้อมูลผู้ใช้รายคน (สำหรับ admin)
   */
  getUserDetail = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { userId } = req.params;

    if (!admin.role.includes('admin')) {
      responseHelper.forbidden(res, 'Admin access required');
      return;
    }

    const user = await User.findById(userId)
      .populate('workerApprovedBy', 'name email')
      .populate('createdBy', 'name email')
      .select('-passwordHash');

    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // ดึงสถิติเพิ่มเติม
    let userStats: any = {};

    if (user.role.includes('employer')) {
      userStats.employer = {
        totalJobs: await Job.countDocuments({ employerId: userId }),
        activeJobs: await Job.countDocuments({ employerId: userId, status: 'active' }),
        completedJobs: await Job.countDocuments({ employerId: userId, status: 'completed' })
      };
    }

    if (user.role.includes('worker')) {
      userStats.worker = {
        appliedJobs: await Job.countDocuments({ applicants: userId }),
        assignedJobs: await Job.countDocuments({ workerId: userId }),
        completedJobs: await Job.countDocuments({ workerId: userId, status: 'completed' })
      };
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      user,
      stats: userStats
    });
  });

  /**
   * ลบผู้ใช้ (เฉพาะ Super Admin)
   */
  deleteUser = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const admin = req.user! as IUser;
    const { userId } = req.params;

    // เฉพาะ Super Admin เท่านั้น
    if (!admin.role.includes('admin') || admin.adminLevel !== 'super') {
      responseHelper.forbidden(res, 'Super Admin access required');
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // ไม่สามารถลบ Super Admin ได้
    if (user.role.includes('admin') && user.adminLevel === 'super') {
      responseHelper.forbidden(res, 'Cannot delete Super Admin');
      return;
    }

    // ตรวจสอบงานที่ยังไม่เสร็จ
    const activeJobs = await Job.countDocuments({
      $or: [
        { employerId: userId, status: { $in: ['active', 'in_progress'] } },
        { workerId: userId, status: 'in_progress' }
      ]
    });

    if (activeJobs > 0) {
      responseHelper.badRequest(res, 'Cannot delete user with active jobs');
      return;
    }

    await User.findByIdAndDelete(userId);

    responseHelper.success(res, 'User deleted successfully');
  });
}