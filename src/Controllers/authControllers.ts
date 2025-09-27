import { Request, Response } from 'express';
import { AuthRequest, IUser } from '@/types/index';
import User from '../Models/User';
import { JWTService } from '@/config/jwt';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandler';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../utils/constants';

// สร้างคลาส AuthController สำหรับจัดการฟังก์ชันเกี่ยวกับการยืนยันตัวตน - Updated for Multi-Role
export class AuthController {
  /**
   * ลงทะเบียนผู้ใช้ใหม่ - Updated: Default role = ['employer']
   */
  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, phone, location, about } = req.body;

    // ตรวจสอบว่ามีผู้ใช้ที่ email นี้อยู่แล้วหรือไม่
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      responseHelper.conflict(res, ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
      return;
    }

    // สร้าง user ใหม่ด้วย default role = ['employer']
    const user = new User({
      name,
      email,
      passwordHash: password, // จะถูก hash โดย middleware
      role: ['employer'], // Default role สำหรับ user ใหม่
      skills: [],
      categories: [],
      phone,
      location,
      about,
      wallet: 0,
      isActive: true
    });

    await user.save();

    // สร้าง JWT payload ด้วย role array
    const payload = JWTService.createPayload(user._id, user.email, user.role);
    const tokens = JWTService.generateTokens(payload);

    const userResponse = user.toJSON();

    responseHelper.created(res, SUCCESS_MESSAGES.REGISTER_SUCCESS, {
      user: userResponse,
      tokens
    });
  });

  /**
   * เข้าสู่ระบบ - Updated: รองรับ role array
   */
  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    if (!user.isActive) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
      return;
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    await user.updateLastLogin();

    // สร้าง payload ด้วย role array
    const payload = JWTService.createPayload(user._id, user.email, user.role);
    const tokens = JWTService.generateTokens(payload);

    const userResponse = user.toJSON();

    responseHelper.success(res, SUCCESS_MESSAGES.LOGIN_SUCCESS, {
      user: userResponse,
      tokens
    });
  });

  /**
   * รีเฟรช access token ด้วย refresh token - Updated: รองรับ role array
   */
  refreshToken = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;

    try {
      const decoded = JWTService.verifyRefreshToken(refreshToken);
      
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        responseHelper.unauthorized(res, ERROR_MESSAGES.USER_NOT_FOUND);
        return;
      }

      // สร้าง token ใหม่ด้วย role ปัจจุบันของ user (อาจมีการเปลี่ยนแปลง)
      const payload = JWTService.createPayload(user._id, user.email, user.role);
      const tokens = JWTService.generateTokens(payload);

      responseHelper.success(res, SUCCESS_MESSAGES.TOKEN_REFRESHED, {
        tokens
      });
    } catch (error: any) {
      responseHelper.unauthorized(res, error.message);
    }
  });

  /**
   * ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน - Updated: รวม role status
   */
  getProfile = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    
    const userProfile = await User.findById(user._id)
      .populate('workerApprovedBy', 'name email')
      .populate('createdBy', 'name email');

    // เพิ่มข้อมูล role status
    const profileWithStatus = {
      ...userProfile?.toJSON(),
      roleStatus: {
        isEmployer: user.role.includes('employer'),
        isWorker: user.role.includes('worker'),
        isAdmin: user.role.includes('admin'),
        isWorkerApproved: user.isWorkerApproved || false,
        canAcceptJobs: user.role.includes('worker') && user.isWorkerApproved && user.isActive,
        canCreateAdmin: user.role.includes('admin') && user.adminLevel === 'super',
        workerStatus: user.role.includes('worker') ? (
          user.isWorkerApproved ? 'approved' : 
          user.workerRejectionReason ? 'rejected' : 'pending'
        ) : 'not_applied'
      }
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, profileWithStatus);
  });

  /**
   * อัพเดทข้อมูลโปรไฟล์ผู้ใช้ - Updated: handle skills/categories for workers
   */
  updateProfile = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { name, about, phone, location, skills, categories } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // อัพเดทข้อมูลพื้นฐาน
    if (name !== undefined) user.name = name;
    if (about !== undefined) user.about = about;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;

    // อัพเดท skills และ categories เฉพาะ worker
    if (user.role.includes('worker')) {
      if (skills !== undefined) user.skills = skills;
      if (categories !== undefined) user.categories = categories;
    }

    await user.save();

    responseHelper.success(res, SUCCESS_MESSAGES.PROFILE_UPDATED, user.toJSON());
  });

  /**
   * สมัครเป็น Worker - NEW METHOD
   */
  applyWorker = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { skills, categories, experience, portfolio, hourlyRate, availability } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่าสมัครเป็น worker แล้วหรือยัง
    if (user.role.includes('worker')) {
      responseHelper.badRequest(res, 'You have already applied to be a worker');
      return;
    }

    // เพิ่ม worker role
    if (!user.role.includes('worker')) {
      user.role.push('worker');
    }
    user.skills = skills || [];
    user.categories = categories || [];
    user.isWorkerApproved = false;
    user.workerApplicationDate = new Date();
    delete user.workerRejectionReason; // clear previous rejection

    // เพิ่มข้อมูลเพิ่มเติมใน about
    if (experience || portfolio || hourlyRate || availability) {
      const workerInfo = {
        experience: experience || '',
        portfolio: portfolio || '',
        hourlyRate: hourlyRate || 0,
        availability: availability || 'flexible'
      };
      
      user.about = user.about ? 
        `${user.about}\n\nWorker Info: ${JSON.stringify(workerInfo)}` :
        `Worker Info: ${JSON.stringify(workerInfo)}`;
    }

    await user.save();

    // TODO: ส่งการแจ้งเตือนให้ Admin
    // await NotificationService.notifyAdminNewWorkerApplication(user._id);

    responseHelper.success(res, 'Worker application submitted successfully. Please wait for admin approval.', {
      userId: user._id,
      appliedAt: user.workerApplicationDate,
      status: 'pending'
    });
  });

  /**
   * ตรวจสอบสถานะ Worker - NEW METHOD
   */
  getWorkerStatus = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;

    if (!user.role.includes('worker')) {
      responseHelper.success(res, 'Worker status retrieved', {
        status: 'not_applied',
        canApply: true
      });
      return;
    }

    const status = user.isWorkerApproved ? 'approved' : 
                  user.workerRejectionReason ? 'rejected' : 'pending';

    responseHelper.success(res, 'Worker status retrieved', {
      status,
      appliedAt: user.workerApplicationDate,
      approvedAt: user.workerApprovedAt,
      rejectionReason: user.workerRejectionReason,
      canAcceptJobs: user.role.includes('worker') && user.isWorkerApproved && user.isActive,
      skills: user.skills,
      categories: user.categories
    });
  });

  /**
   * เปลี่ยนรหัสผ่าน - No changes needed
   */
  changePassword = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!._id;

    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    user.passwordHash = newPassword;
    await user.save();

    responseHelper.success(res, SUCCESS_MESSAGES.PASSWORD_CHANGED);
  });

  /**
   * อัพโหลดรูปโปรไฟล์ - No changes needed
   */
  uploadProfilePicture = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const file = req.file;

    if (!file) {
      responseHelper.error(res, 'No file uploaded', 400);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    user.profilePic = `/uploads/profile-pictures/${file.filename}`;
    await user.save();

    responseHelper.success(res, SUCCESS_MESSAGES.PROFILE_PICTURE_UPDATED, {
      profilePic: user.profilePic
    });
  });

  /**
   * ดึงสถิติของผู้ใช้ - Updated: รองรับหลาย role
   */
  getUserStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const user = req.user! as IUser;

    let stats: any = {
      roles: user.role,
      isEmployer: user.role.includes('employer'),
      isWorker: user.role.includes('worker'),
      isAdmin: user.role.includes('admin')
    };

    // สถิติ Employer
    if (user.role.includes('employer')) {
      const Job = (await import('../Models/Job')).default;
      const Transaction = (await import('../Models/Transaction')).default;

      const jobStats = await Job.aggregate([
        { $match: { employerId: userId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalBudget: { $sum: '$budget' }
          }
        }
      ]);

      const totalSpent = await Transaction.aggregate([
        { $match: { from: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      stats.employer = {
        totalJobs: await Job.countDocuments({ employerId: userId }),
        activeJobs: await Job.countDocuments({ employerId: userId, status: 'active' }),
        completedJobs: await Job.countDocuments({ employerId: userId, status: 'completed' }),
        totalSpent: totalSpent[0]?.total || 0,
        jobsByStatus: jobStats
      };
    }

    // สถิติ Worker
    if (user.role.includes('worker')) {
      const Job = (await import('../Models/Job')).default;
      const Transaction = (await import('../Models/Transaction')).default;

      const totalEarned = await Transaction.aggregate([
        { $match: { to: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      stats.worker = {
        status: user.isWorkerApproved ? 'approved' : 'pending',
        totalJobs: await Job.countDocuments({ workerId: userId }),
        activeJobs: await Job.countDocuments({ workerId: userId, status: 'in_progress' }),
        completedJobs: await Job.countDocuments({ workerId: userId, status: 'completed' }),
        totalEarned: totalEarned[0]?.total || 0,
        appliedJobs: await Job.countDocuments({ applicants: userId }),
        canAcceptJobs: user.role.includes('worker') && user.isWorkerApproved && user.isActive
      };
    }

    // สถิติ Admin
    if (user.role.includes('admin')) {
      stats.admin = {
        level: user.adminLevel,
        canCreateAdmin: user.role.includes('admin') && user.adminLevel === 'super',
        canApproveWorkers: user.role.includes('admin'),
        lastAdminAction: user.lastAdminAction
      };
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, stats);
  });

  /**
   * ปิดการใช้งานบัญชีผู้ใช้ - No changes needed
   */
  deactivateAccount = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    user.isActive = false;
    await user.save();

    responseHelper.success(res, 'Account deactivated successfully');
  });

  /**
   * ออกจากระบบ - No changes needed
   */
  logout = catchAsync(async (_req: AuthRequest, res: Response): Promise<void> => {
    responseHelper.success(res, SUCCESS_MESSAGES.LOGOUT_SUCCESS);
  });

  /**
   * ตรวจสอบ token - Updated: แสดงข้อมูล role array
   */
  verifyToken = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    
    responseHelper.success(res, 'Token is valid', {
      userId: user._id,
      email: user.email,
      roles: user.role, // แสดง role array
      isActive: user.isActive,
      roleStatus: {
        isEmployer: user.role.includes('employer'),
        isWorker: user.role.includes('worker'),
        isAdmin: user.role.includes('admin'),
        isWorkerApproved: user.isWorkerApproved || false,
        canAcceptJobs: user.role.includes('worker') && user.isWorkerApproved && user.isActive
      }
    });
  });

  /**
   * สลับ role หรือเพิ่ม role - NEW METHOD (สำหรับ testing หรือ admin)
   */
  switchRole = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { targetRole, action } = req.body; // action: 'add' | 'remove'
    const userId = req.user!._id;
    const currentUser = req.user! as IUser;

    // เฉพาะ admin หรือ super admin เท่านั้นที่สามารถเปลี่ยน role ให้คนอื่นได้
    const targetUserId = req.body.userId || userId;
    
    if (targetUserId !== userId && !currentUser.role.includes('admin')) {
      responseHelper.forbidden(res, 'Only admins can change other users roles');
      return;
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    if (action === 'add') {
      if (!user.role.includes(targetRole)) {
        user.role.push(targetRole);
      }
    } else if (action === 'remove') {
      user.role = user.role.filter(r => r !== targetRole);
      
      // ถ้าลบ worker role ให้ clear worker data
      if (targetRole === 'worker') {
        user.isWorkerApproved = false;
        delete user.workerApprovedAt;
        delete user.workerApplicationDate;
        delete user.workerRejectionReason;
      }
    }

    await user.save();

    // สร้าง token ใหม่ถ้าเป็นการเปลี่ยน role ของตัวเอง
    let newTokens = null;
    if (targetUserId === userId) {
      const payload = JWTService.createPayload(user._id, user.email, user.role);
      newTokens = JWTService.generateTokens(payload);
    }

    responseHelper.success(res, `Role ${action} successful`, {
      userId: user._id,
      newRoles: user.role,
      tokens: newTokens
    });
  });
}