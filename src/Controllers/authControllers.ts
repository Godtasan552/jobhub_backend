import { Request, Response } from 'express';
import { AuthRequest  } from '@/types';
import User from '../Models/User';
import { JWTService } from '@/config/jwt';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandler';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../utils/constants';

// สร้างคลาส AuthController สำหรับจัดการฟังก์ชันเกี่ยวกับการยืนยันตัวตน
export class AuthController {
  /**
   * ลงทะเบียนผู้ใช้ใหม่
   */
  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    // รับข้อมูลจาก body ที่ส่งมาจาก client
    const { name, email, password, role, skills, categories, phone, location } = req.body;

    // ตรวจสอบว่ามีผู้ใช้ที่ email นี้อยู่แล้วหรือไม่
    const existingUser = await User.findOne({email});
    if (existingUser) {
      // ถ้ามีอยู่แล้ว ตอบกลับว่า email นี้ถูกใช้แล้ว
      responseHelper.conflict(res, ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
      return;
    }

    // สร้าง user ใหม่ด้วยข้อมูลที่รับมา
    const user = new User({
      name,
      email,
      passwordHash: password, // รหัสผ่านจะถูก hash โดย middleware ก่อนบันทึก
      role,
      skills: skills || [],
      categories: categories || [],
      phone,
      location
    });

    // บันทึก user ลงฐานข้อมูล
    await user.save();

    // สร้าง payload สำหรับ JWT token
    const payload = JWTService.createPayload(user._id, user.email, user.role);
    // สร้าง access token และ refresh token
    const tokens = JWTService.generateTokens(payload);

    // แปลง user เป็น JSON และลบรหัสผ่านออก
    const userResponse = user.toJSON();

    // ตอบกลับว่าลงทะเบียนสำเร็จ พร้อมข้อมูล user และ token
    responseHelper.created(res, SUCCESS_MESSAGES.REGISTER_SUCCESS, {
      user: userResponse,
      tokens
    });
  });

  /**
   * เข้าสู่ระบบ
   */
  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    // รับ email และ password จาก body
    const { email, password } = req.body;

    // ค้นหาผู้ใช้จาก email และดึง passwordHash มาด้วย
    const user = await User.findOne({email}).select('+passwordHash');
    if (!user) {
      // ถ้าไม่พบ user ตอบกลับว่า credentials ไม่ถูกต้อง
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    // ตรวจสอบว่า user ยัง active อยู่หรือไม่
    if (!user.isActive) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.ACCOUNT_DEACTIVATED);
      return;
    }

    // ตรวจสอบรหัสผ่านว่าตรงกับที่บันทึกไว้หรือไม่
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    // อัพเดทเวลาล็อกอินล่าสุดของ user
    await user.updateLastLogin();

    // สร้าง payload และ token ใหม่
    const payload = JWTService.createPayload(user._id, user.email, user.role);
    const tokens = JWTService.generateTokens(payload);

    // แปลง user เป็น JSON และลบรหัสผ่านออก
    const userResponse = user.toJSON();

    // ตอบกลับว่าล็อกอินสำเร็จ พร้อมข้อมูล user และ token
    responseHelper.success(res, SUCCESS_MESSAGES.LOGIN_SUCCESS, {
      user: userResponse,
      tokens
    });
  });

  /**
   * รีเฟรช access token ด้วย refresh token
   */
  refreshToken = catchAsync(async (req: Request, res: Response): Promise<void> => {
    // รับ refreshToken จาก body
    const { refreshToken } = req.body;

    try {
      // ตรวจสอบ refresh token ว่า valid หรือไม่
      const decoded = JWTService.verifyRefreshToken(refreshToken);
      
      // ค้นหาผู้ใช้จาก userId ที่อยู่ใน token
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        responseHelper.unauthorized(res, ERROR_MESSAGES.USER_NOT_FOUND);
        return;
      }

      // สร้าง token ใหม่
      const payload = JWTService.createPayload(user._id, user.email, user.role);
      const tokens = JWTService.generateTokens(payload);

      // ตอบกลับ token ใหม่
      responseHelper.success(res, SUCCESS_MESSAGES.TOKEN_REFRESHED, {
        tokens
      });
    } catch (error: any) {
      // ถ้า token ไม่ถูกต้อง ตอบกลับ error
      responseHelper.unauthorized(res, error.message);
    }
  });

  /**
   * ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน
   */
  getProfile = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ดึงข้อมูล user จาก request ที่ middleware ใส่ไว้
    const user = req.user!;
    
    // ดึงข้อมูล user จากฐานข้อมูล พร้อม populate skills และ categories
    const userProfile = await User.findById(user._id)
      .populate('skills categories');

    // ตอบกลับข้อมูลโปรไฟล์
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, userProfile);
  });

  /**
   * อัพเดทข้อมูลโปรไฟล์ผู้ใช้
   */
  updateProfile = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ดึง userId จาก request
    const userId = req.user!._id;
    // รับข้อมูลที่ต้องการอัพเดทจาก body
    const { name, about, phone, location, skills, categories } = req.body;

    // ค้นหาผู้ใช้จาก userId
    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // อัพเดทข้อมูลที่ส่งมา (ถ้ามี)
    if (name !== undefined) user.name = name;
    if (about !== undefined) user.about = about;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (skills !== undefined) user.skills = skills;
    if (categories !== undefined) user.categories = categories;

    // บันทึกข้อมูลใหม่
    await user.save();

    // ตอบกลับว่าข้อมูลถูกอัพเดทแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.PROFILE_UPDATED, user.toJSON());
  });

  /**
   * เปลี่ยนรหัสผ่าน
   */
  changePassword = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // รับ currentPassword และ newPassword จาก body
    const { currentPassword, newPassword } = req.body;
    // ดึง userId จาก request
    const userId = req.user!._id;

    // ค้นหาผู้ใช้พร้อม passwordHash
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // ตรวจสอบรหัสผ่านเดิมว่าถูกต้องหรือไม่
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.INVALID_CREDENTIALS);
      return;
    }

    // เปลี่ยนรหัสผ่านใหม่ (จะถูก hash โดย middleware)
    user.passwordHash = newPassword;
    await user.save();

    // ตอบกลับว่ารหัสผ่านถูกเปลี่ยนแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.PASSWORD_CHANGED);
  });

  /**
   * อัพโหลดรูปโปรไฟล์
   */
  uploadProfilePicture = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ดึง userId จาก request
    const userId = req.user!._id;
    // ดึงไฟล์ที่อัพโหลดจาก request
    const file = req.file;

    // ถ้าไม่มีไฟล์ ตอบกลับ error
    if (!file) {
      responseHelper.error(res, 'No file uploaded', 400);
      return;
    }

    // ค้นหาผู้ใช้จาก userId
    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // อัพเดท URL รูปโปรไฟล์
    user.profilePic = `/uploads/profile-pictures/${file.filename}`;
    await user.save();

    // ตอบกลับว่ารูปโปรไฟล์ถูกอัพเดทแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.PROFILE_PICTURE_UPDATED, {
      profilePic: user.profilePic
    });
  });

  /**
   * ปิดการใช้งานบัญชีผู้ใช้
   */
  deactivateAccount = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ดึง userId จาก request
    const userId = req.user!._id;

    // ค้นหาผู้ใช้จาก userId
    const user = await User.findById(userId);
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // เปลี่ยนสถานะ isActive เป็น false
    user.isActive = false;
    await user.save();

    // ตอบกลับว่าปิดบัญชีสำเร็จ
    responseHelper.success(res, 'Account deactivated successfully');
  });

  /**
   * ดึงสถิติของผู้ใช้
   */
  getUserStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ดึง userId และ role จาก request
    const userId = req.user!._id;
    const userRole = req.user!.role;

    let stats = {};

    if (userRole === 'employer') {
      // ถ้าเป็น employer ดึงสถิติที่เกี่ยวกับงานที่สร้าง
      const Job = (await import('../Models/Job')).default;
      const Transaction = (await import('../Models/Transaction')).default;

      // รวมข้อมูลงานตามสถานะ
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

      // รวมยอดเงินที่ใช้จ่าย
      const totalSpent = await Transaction.aggregate([
        { $match: { from: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      // สร้าง object stats สำหรับ employer
      stats = {
        totalJobs: await Job.countDocuments({ employerId: userId }),
        activeJobs: await Job.countDocuments({ employerId: userId, status: 'active' }),
        completedJobs: await Job.countDocuments({ employerId: userId, status: 'completed' }),
        totalSpent: totalSpent[0]?.total || 0,
        jobsByStatus: jobStats
      };
    } else {
      // ถ้าเป็น worker ดึงสถิติที่เกี่ยวกับงานที่รับ
      const Job = (await import('../Models/Job')).default;
      const Transaction = (await import('../Models/Transaction')).default;

      // รวมยอดเงินที่ได้รับ
      const totalEarned = await Transaction.aggregate([
        { $match: { to: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      // สร้าง object stats สำหรับ worker
      stats = {
        totalJobs: await Job.countDocuments({ workerId: userId }),
        activeJobs: await Job.countDocuments({ workerId: userId, status: 'in_progress' }),
        completedJobs: await Job.countDocuments({ workerId: userId, status: 'completed' }),
        totalEarned: totalEarned[0]?.total || 0,
        appliedJobs: await Job.countDocuments({ applicants: userId })
      };
    }

    // ตอบกลับข้อมูลสถิติ
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, stats);
  });

  /**
   * ออกจากระบบ (ส่วนใหญ่ใช้สำหรับ client ลบ token ฝั่ง client)
   */
  logout = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ในระบบ JWT แบบ stateless การ logout จะทำที่ client เป็นหลัก
    // สามารถบันทึก event หรือ blacklist token ได้ถ้าต้องการ
    
    // ตอบกลับว่า logout สำเร็จ
    responseHelper.success(res, SUCCESS_MESSAGES.LOGOUT_SUCCESS);
  });

  /**
   * ตรวจสอบ token (health check สำหรับ authentication)
   */
  verifyToken = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ถ้ามาถึงตรงนี้แสดงว่า token ถูกตรวจสอบแล้วโดย middleware
    const user = req.user!;
    
    // ตอบกลับข้อมูล user ที่ตรวจสอบแล้ว
    responseHelper.success(res, 'Token is valid', {
      userId: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  });
}