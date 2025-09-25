import { Request, Response, NextFunction } from 'express';
import { JWTService } from '@/config/jwt';
import { AuthRequest } from '@/types/index';
import User from '../Models/User';
import { responseHelper } from '@/utils/responseHelper';

/**
 * Middleware ตรวจสอบ JWT token ว่าถูกต้องหรือไม่
 * - ดึง token จาก header
 * - ตรวจสอบ token ด้วย JWTService
 * - หา user จากฐานข้อมูล
 * - เช็คสถานะ user ว่ายัง active
 * - ถ้าทุกอย่างถูกต้อง จะเพิ่ม user เข้า req.user
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      responseHelper.error(res, 'Access token is required', 401);
      return;
    }

    // ตรวจสอบ token
    const decoded = JWTService.verifyAccessToken(token);
    
    // หา user จาก userId ที่อยู่ใน token
    const user = await User.findById(decoded.userId);
    if (!user) {
      responseHelper.error(res, 'User not found', 401);
      return;
    }

    // เช็คสถานะ user
    if (!user.isActive) {
      responseHelper.error(res, 'Account is deactivated', 401);
      return;
    }

    // เพิ่ม user เข้า req เพื่อใช้ใน controller ถัดไป
    req.user = user;
    next();
  } catch (error: any) {
    // กรณี token ผิดหรือหมดอายุ
    if (error.message === 'Invalid token' || error.message === 'Token expired') {
      responseHelper.error(res, error.message, 401);
    } else {
      responseHelper.error(res, 'Authentication failed', 401);
    }
  }
};

/**
 * Middleware ตรวจสอบ role ของ user
 * - รับ role ที่อนุญาตเป็น argument
 * - ถ้า user ไม่มี หรือ role ไม่ตรง จะตอบ error 401/403
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.error(res, 'Authentication required', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      responseHelper.error(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
};

/**
 * Middleware สำหรับ route ที่ไม่บังคับ login
 * - ถ้ามี token และถูกต้อง จะเพิ่ม user เข้า req.user
 * - ถ้าไม่มี token หรือ token ผิด จะข้ามไปเลย
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (token) {
      const decoded = JWTService.verifyAccessToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // ไม่ต้องตอบ error ให้ข้ามไปเลย
    next();
  }
};

/**
 * Middleware ตรวจสอบว่า user เป็นเจ้าของ resource หรือไม่
 * - รับชื่อ field ที่เก็บ userId ใน resource เป็น argument
 * - เช็คว่า user._id ตรงกับ userId ใน resource
 */
export const checkOwnership = (resourceUserField: string = 'userId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.error(res, 'Authentication required', 401);
      return;
    }

    // ดึง userId จาก params, body หรือ query
    const resourceUserId = req.params[resourceUserField] || 
                          req.body[resourceUserField] || 
                          req.query[resourceUserField];

    if (!resourceUserId) {
      responseHelper.error(res, 'Resource user ID is required', 400);
      return;
    }

    // เช็คว่า user เป็นเจ้าของจริงหรือไม่
    if (req.user._id.toString() !== resourceUserId) {
      responseHelper.error(res, 'Access denied: You can only access your own resources', 403);
      return;
    }

    next();
  };
};

/**
 * Middleware ตรวจสอบว่า user เป็น employer หรือไม่
 * - ใช้กับ route ที่เฉพาะ employer เท่านั้น
 */
export const requireEmployer = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.error(res, 'Authentication required', 401);
    return;
  }

  if (req.user.role !== 'employer') {
    responseHelper.error(res, 'Employer role required', 403);
    return;
  }

  next();
};

/**
 * Middleware ตรวจสอบว่า user เป็น worker หรือไม่
 * - ใช้กับ route ที่เฉพาะ worker เท่านั้น
 */
export const requireWorker = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.error(res, 'Authentication required', 401);
    return;
  }

  if (req.user.role !== 'worker') {
    responseHelper.error(res, 'Worker role required', 403);
    return;
  }

  next();
};

/**
 * Middleware ตรวจสอบสิทธิ์การเข้าถึงงาน (job)
 * - user ต้องเป็น employer, worker หรือ applicant ของงานนั้น
 * - ถ้าเข้าได้ จะเพิ่ม job เข้า req.job
 */
export const canAccessJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      responseHelper.error(res, 'Authentication required', 401);
      return;
    }

    // ดึง jobId จาก params
    const jobId = req.params.jobId || req.params.id;
    if (!jobId) {
      responseHelper.error(res, 'Job ID is required', 400);
      return;
    }

    // หา job จากฐานข้อมูล
    const Job = (await import('../Models/Job')).default;
    const job = await Job.findById(jobId);

    if (!job) {
      responseHelper.error(res, 'Job not found', 404);
      return;
    }

    // เช็คสิทธิ์การเข้าถึง
    const userId = req.user._id.toString();
    const canAccess = 
      job.employerId.toString() === userId || 
      job.workerId?.toString() === userId ||
      job.applicants.includes(userId);

    if (!canAccess) {
      responseHelper.error(res, 'Access denied: You are not authorized to access this job', 403);
      return;
    }

    // เพิ่ม job เข้า req เพื่อใช้ใน controller ถัดไป
    (req as any).job = job;
    next();
  } catch (error) {
    responseHelper.error(res, 'Error checking job access', 500);
  }
};

/**
 * Middleware จำกัดจำนวนครั้งการพยายาม login ต่อ IP
 * - ถ้าเกินจำนวนที่กำหนด จะตอบ error 429
 * - รีเซ็ตจำนวนครั้งใหม่หลังครบเวลา
 */
export const authRateLimit = () => {
  const attempts = new Map<string, { count: number; resetTime: number }>();
  const MAX_ATTEMPTS = 5;
  const RESET_TIME = 15 * 60 * 1000; // 15 นาที

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    const attempt = attempts.get(key);
    
    if (attempt) {
      if (now > attempt.resetTime) {
        // รีเซ็ตจำนวนครั้งใหม่
        attempts.set(key, { count: 1, resetTime: now + RESET_TIME });
      } else if (attempt.count >= MAX_ATTEMPTS) {
        responseHelper.error(
          res, 
          'Too many authentication attempts. Please try again later.', 
          429
        );
        return;
      } else {
        attempt.count += 1;
      }
    } else {
      attempts.set(key, { count: 1, resetTime: now + RESET_TIME });
    }

    next();
  };
};

/**
 * Middleware ตรวจสอบความสมบูรณ์โปรไฟล์ของ user
 * - ถ้า profileCompletion ต่ำกว่าที่กำหนด จะตอบ error
 */
export const requireCompleteProfile = (minimumCompletion: number = 70) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.error(res, 'Authentication required', 401);
      return;
    }

    const completion = (req.user as any).profileCompletion;
    
    if (completion < minimumCompletion) {
      responseHelper.error(
        res, 
        `Please complete your profile (${completion}% completed, ${minimumCompletion}% required)`, 
        400,
        { currentCompletion: completion, requiredCompletion: minimumCompletion }
      );
      return;
    }

    next();
  };
};

/**
 * Middleware ดึงข้อมูล user ล่าสุดจากฐานข้อมูล
 * - ใช้กรณีต้องการ refresh ข้อมูล user ใน req.user
 */
export const refreshUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next();
      return;
    }

    // ดึง user ล่าสุดจากฐานข้อมูล
    const freshUser = await User.findById(req.user._id);
    if (freshUser) {
      req.user = freshUser;
    }
    
    next();
  } catch (error) {
    next();
  }
};

/**
 * Middleware log กิจกรรมของ user
 * - ใช้สำหรับบันทึก action ต่าง ๆ ของ user
 */
export const logActivity = (action: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user) {
      console.log(`User ${req.user._id} performed action: ${action} at ${new Date().toISOString()}`);
    }
    next();
  };
};