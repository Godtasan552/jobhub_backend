import { Response, NextFunction } from 'express';
import { AuthRequest, IUser } from '@/types/index';
import { responseHelper } from '@/utils/responseHelper';
import { ERROR_MESSAGES } from '@/utils/constants';

/**
 * Role-Based Access Control Middleware
 * ใช้สำหรับตรวจสอบสิทธิ์การเข้าถึงตาม role ของผู้ใช้
 */

// ==================== BASIC ROLE CHECKS ====================

/**
 * ตรวจสอบว่าผู้ใช้มี role ที่กำหนด
 */
export const requireRole = (roles: ('employer' | 'worker' | 'admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      return;
    }

    // ตรวจสอบว่ามี role ใดใน roles array หรือไม่
    const user = req.user as IUser;
    const hasRequiredRole = roles.some(role => user.role.includes(role));
    
    if (!hasRequiredRole) {
      responseHelper.forbidden(res, `Access denied. Required roles: ${roles.join(', ')}`);
      return;
    }

    next();
  };
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Employer
 */
export const requireEmployer = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  if (!user.role.includes('employer')) {
    responseHelper.forbidden(res, 'Access denied. Employer role required.');
    return;
  }

  next();
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Worker
 */
export const requireWorker = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  if (!user.role.includes('worker')) {
    responseHelper.forbidden(res, 'Access denied. Worker role required.');
    return;
  }

  next();
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Worker ที่ได้รับการอนุมัติแล้ว
 */
export const requireApprovedWorker = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  
  if (!user.role.includes('worker')) {
    responseHelper.forbidden(res, 'Access denied. Worker role required.');
    return;
  }

  if (!user.isWorkerApproved) {
    responseHelper.forbidden(res, 'Access denied. Worker approval required. Please wait for admin approval.');
    return;
  }

  next();
};

// ==================== ADMIN ROLE CHECKS ====================

/**
 * ตรวจสอบว่าผู้ใช้เป็น Admin (ทุกระดับ)
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  if (!user.role.includes('admin')) {
    responseHelper.forbidden(res, 'Access denied. Admin role required.');
    return;
  }

  next();
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Super Admin
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  if (!user.role.includes('admin') || user.adminLevel !== 'super') {
    responseHelper.forbidden(res, 'Access denied. Super Admin role required.');
    return;
  }

  next();
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Moderator หรือ Super Admin
 */
export const requireModerator = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  
  if (!user.role.includes('admin')) {
    responseHelper.forbidden(res, 'Access denied. Admin role required.');
    return;
  }

  // Moderator หรือ Super Admin ก็ผ่านได้
  if (!['moderator', 'super'].includes(user.adminLevel || '')) {
    responseHelper.forbidden(res, 'Access denied. Moderator or Super Admin role required.');
    return;
  }

  next();
};

// ==================== COMBINED ROLE CHECKS ====================

/**
 * ตรวจสอบว่าผู้ใช้เป็น Employer หรือ Admin
 */
export const requireEmployerOrAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  const isEmployer = user.role.includes('employer');
  const isAdmin = user.role.includes('admin');

  if (!isEmployer && !isAdmin) {
    responseHelper.forbidden(res, 'Access denied. Employer or Admin role required.');
    return;
  }

  next();
};

/**
 * ตรวจสอบว่าผู้ใช้เป็น Worker ที่อนุมัติแล้ว หรือ Admin
 */
export const requireWorkerOrAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  const isApprovedWorker = user.role.includes('worker') && user.isWorkerApproved;
  const isAdmin = user.role.includes('admin');

  if (!isApprovedWorker && !isAdmin) {
    responseHelper.forbidden(res, 'Access denied. Approved Worker or Admin role required.');
    return;
  }

  next();
};

// ==================== RESOURCE OWNERSHIP CHECKS ====================

/**
 * ตรวจสอบว่าผู้ใช้เป็นเจ้าของ resource หรือเป็น Admin
 */
export const requireOwnershipOrAdmin = (resourceUserIdField: string = 'userId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      return;
    }

    const user = req.user as IUser;
    
    // ถ้าเป็น Admin ผ่านไปเลย
    if (user.role.includes('admin')) {
      next();
      return;
    }

    // ดึง userId ที่ต้องการเปรียบเทียบ
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField] || req.query[resourceUserIdField];
    
    if (!resourceUserId) {
      responseHelper.badRequest(res, `${resourceUserIdField} is required`);
      return;
    }

    // ตรวจสอบว่าเป็น owner หรือไม่
    if (user._id.toString() !== resourceUserId.toString()) {
      responseHelper.forbidden(res, 'Access denied. You can only access your own resources.');
      return;
    }

    next();
  };
};

/**
 * ตรวจสอบว่าผู้ใช้เป็นเจ้าของงาน (employer) หรือเป็น Admin
 */
export const requireJobOwnership = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    return;
  }

  const user = req.user as IUser;
  
  // ถ้าเป็น Admin ผ่านไปเลย
  if (user.role.includes('admin')) {
    next();
    return;
  }

  // ตรวจสอบว่าเป็น employer ของงานนี้หรือไม่
  // (ต้องใช้ร่วมกับ middleware อื่นที่ load job data)
  const jobEmployerId = (req as any).job?.employerId || req.body.employerId;
  
  if (!jobEmployerId) {
    responseHelper.badRequest(res, 'Job not found or invalid');
    return;
  }

  if (user._id.toString() !== jobEmployerId.toString()) {
    responseHelper.forbidden(res, 'Access denied. You can only manage your own jobs.');
    return;
  }

  next();
};

// ==================== CONDITIONAL CHECKS ====================

/**
 * ตรวจสอบสิทธิ์แบบมีเงื่อนไข
 */
export const requireConditionalAccess = (conditions: {
  roles?: ('employer' | 'worker' | 'admin')[];
  requireApproval?: boolean;
  requireActive?: boolean;
  customCheck?: (user: IUser) => boolean;
}) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      return;
    }

    const user = req.user as IUser;

    // ตรวจสอบ roles
    if (conditions.roles && conditions.roles.length > 0) {
      const hasRequiredRole = conditions.roles.some(role => user.role.includes(role));
      if (!hasRequiredRole) {
        responseHelper.forbidden(res, `Access denied. Required roles: ${conditions.roles.join(', ')}`);
        return;
      }
    }

    // ตรวจสอบ worker approval
    if (conditions.requireApproval && user.role.includes('worker') && !user.isWorkerApproved) {
      responseHelper.forbidden(res, 'Access denied. Worker approval required.');
      return;
    }

    // ตรวจสอบ active status
    if (conditions.requireActive && !user.isActive) {
      responseHelper.forbidden(res, 'Access denied. Account is not active.');
      return;
    }

    // ตรวจสอบเงื่อนไขเพิ่มเติม
    if (conditions.customCheck && !conditions.customCheck(user)) {
      responseHelper.forbidden(res, 'Access denied. Custom condition not met.');
      return;
    }

    next();
  };
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * ตรวจสอบหลายเงื่อนไข (OR condition)
 */
export const requireAnyRole = (roles: ('employer' | 'worker' | 'admin')[]) => {
  return requireRole(roles);
};

/**
 * ตรวจสอบทุกเงื่อนไข (AND condition)
 */
export const requireAllRoles = (roles: ('employer' | 'worker' | 'admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      return;
    }

    const user = req.user as IUser;
    
    // ตรวจสอบว่ามีทุก role หรือไม่
    const hasAllRoles = roles.every(role => user.role.includes(role));
    
    if (!hasAllRoles) {
      responseHelper.forbidden(res, `Access denied. All required roles needed: ${roles.join(', ')}`);
      return;
    }

    next();
  };
};

/**
 * ตรวจสอบว่าผู้ใช้ไม่มี role ที่กำหนด
 */
export const requireNotRole = (roles: ('employer' | 'worker' | 'admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      responseHelper.unauthorized(res, ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
      return;
    }

    const user = req.user as IUser;
    
    // ตรวจสอบว่าไม่มี role ใดใน roles array
    const hasAnyForbiddenRole = roles.some(role => user.role.includes(role));
    
    if (hasAnyForbiddenRole) {
      responseHelper.forbidden(res, `Access denied. Forbidden roles: ${roles.join(', ')}`);
      return;
    }

    next();
  };
};

// ==================== HELPER FUNCTIONS ====================

/**
 * ตรวจสอบว่าผู้ใช้สามารถรับงานได้หรือไม่
 */
export const canAcceptJobs = (user: IUser): boolean => {
  return user.role.includes('worker') && user.isWorkerApproved === true && user.isActive;
};

/**
 * ตรวจสอบว่าผู้ใช้สามารถโพสต์งานได้หรือไม่
 */
export const canPostJobs = (user: IUser): boolean => {
  return user.role.includes('employer') && user.isActive;
};

/**
 * ตรวจสอบว่าผู้ใช้สามารถเข้าถึง admin panel ได้หรือไม่
 */
export const canAccessAdminPanel = (user: IUser): boolean => {
  return user.role.includes('admin') && user.isActive;
};

// ==================== ERROR HANDLING ====================

/**
 * Handle role-based errors
 */
export const handleRoleError = (error: any, _req: AuthRequest, res: Response, next: NextFunction): void => {
  if (error.name === 'RoleError') {
    responseHelper.forbidden(res, error.message);
    return;
  }
  
  next(error);
};

// ==================== EXAMPLES OF USAGE ====================

/*
// Basic usage:
app.get('/api/jobs', authMiddleware, requireEmployer, getJobs);
app.post('/api/jobs/:id/apply', authMiddleware, requireApprovedWorker, applyToJob);
app.get('/api/admin/dashboard', authMiddleware, requireAdmin, getDashboard);

// Combined roles:
app.get('/api/jobs/:id', authMiddleware, requireEmployerOrAdmin, getJobDetails);

// Conditional access:
app.put('/api/profile', authMiddleware, requireConditionalAccess({
  roles: ['employer', 'worker'],
  requireActive: true
}), updateProfile);

// Ownership check:
app.delete('/api/jobs/:id', 
  authMiddleware, 
  requireEmployer, 
  loadJobMiddleware, // middleware ที่ load job data
  requireJobOwnership, 
  deleteJob
);

// Multiple roles required:
app.post('/api/admin/create-moderator', 
  authMiddleware, 
  requireSuperAdmin, 
  createModerator
);
*/