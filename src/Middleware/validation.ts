import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { responseHelper } from '@/utils/responseHelper';

/**
 * Generic validation middleware
 * Middleware สำหรับตรวจสอบ req.body ตาม schema ที่ส่งเข้ามา
 */
export const validate = (schema: Joi.ObjectSchema) => {
    // ฟังก์ชันรับ schema ของ Joi
    return (req: Request, res: Response, next: NextFunction): void => {
        // middleware จริงที่ถูกเรียกเมื่อ route ถูกเข้าถึง
        const { error } = schema.validate(req.body, {
            abortEarly: false, // ตรวจสอบทั้งหมดไม่หยุดแค่ error แรก
            stripUnknown: true // ลบ field ที่ไม่อยู่ใน schema ออก
        });

        if (error) { // ถ้ามี error
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'), // ชื่อ field ที่ผิด
                message: detail.message,       // ข้อความ error
                value: detail.context?.value   // ค่าที่ส่งมาผิด
            }));

            responseHelper.error(res, 'Validation failed', 400, { errors });
            // ตอบ response error พร้อมรายละเอียด
            return;
        }

        next(); // ถ้าไม่มี error ให้ไป middleware ถัดไป
    };
};

/**
 * Validate query parameters
 * ตรวจสอบ req.query ตาม schema
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            responseHelper.error(res, 'Query validation failed', 400, { errors });
            return;
        }

        req.query = value; // กำหนดค่า query ที่ถูกต้อง
        next();
    };
};

/**
 * Validate URL parameters
 * ตรวจสอบ req.params ตาม schema
 */
export const validateParams = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const { error } = schema.validate(req.params, {
            abortEarly: false
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            responseHelper.error(res, 'Parameter validation failed', 400, { errors });
            return;
        }

        next();
    };
};

// Common validation schemas
export const commonSchemas = {
    // ตรวจสอบ MongoDB ObjectId
    objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ID format'),

    // ตรวจสอบ pagination
    pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10),
        sort: Joi.string().default('-createdAt')
    }),

    // ตรวจสอบ search และ filter
    searchFilter: Joi.object({
        search: Joi.string().trim().min(1).max(100),
        filter: Joi.object(),
        category: Joi.string().trim().max(100),
        type: Joi.string().trim().max(50),
        status: Joi.string().trim().max(50)
    })
};

// Auth validation schemas
export const authSchemas = {
    register: Joi.object({
        name: Joi.string()
            .trim()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.min': 'Name must be at least 2 characters',
                'string.max': 'Name cannot exceed 100 characters',
                'any.required': 'Name is required'
            }),

        email: Joi.string()
            .email()
            .lowercase()
            .required()
            .messages({
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required'
            }),

        password: Joi.string()
            .min(6)
            .max(128)
            .required()
            .messages({
                'string.min': 'Password must be at least 6 characters',
                'string.max': 'Password cannot exceed 128 characters',
                'any.required': 'Password is required'
            }),

        role: Joi.string()
            .valid('employer', 'worker')
            .required()
            .messages({
                'any.only': 'Role must be either employer or worker',
                'any.required': 'Role is required'
            }),

        skills: Joi.array().items(Joi.string().trim().max(50)).max(20).default([]),
        categories: Joi.array().items(Joi.string().trim().max(50)).max(10).default([]),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).messages({
            'string.pattern.base': 'Please provide a valid phone number'
        }),
        location: Joi.string().trim().max(200)
    }),

    login: Joi.object({
        email: Joi.string()
            .email()
            .lowercase()
            .required()
            .messages({
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required'
            }),

        password: Joi.string()
            .required()
            .messages({
                'any.required': 'Password is required'
            })
    }),

    refreshToken: Joi.object({
        refreshToken: Joi.string()
            .required()
            .messages({
                'any.required': 'Refresh token is required'
            })
    }),

    changePassword: Joi.object({
        currentPassword: Joi.string()
            .required()
            .messages({
                'any.required': 'Current password is required'
            }),

        newPassword: Joi.string()
            .min(6)
            .max(128)
            .required()
            .messages({
                'string.min': 'New password must be at least 6 characters',
                'string.max': 'New password cannot exceed 128 characters',
                'any.required': 'New password is required'
            })
    })
};

// User validation schemas
export const userSchemas = {
    updateProfile: Joi.object({
        name: Joi.string().trim().min(2).max(100),
        about: Joi.string().trim().max(1000),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
        location: Joi.string().trim().max(200),
        skills: Joi.array().items(Joi.string().trim().max(50)).max(20),
        categories: Joi.array().items(Joi.string().trim().max(50)).max(10)
    })
};

// Job validation schemas
export const jobSchemas = {
    createJob: Joi.object({
        title: Joi.string()
            .trim()
            .min(5)
            .max(200)
            .required()
            .messages({
                'string.min': 'Job title must be at least 5 characters',
                'string.max': 'Job title cannot exceed 200 characters',
                'any.required': 'Job title is required'
            }),

        description: Joi.string()
            .trim()
            .min(20)
            .max(5000)
            .required()
            .messages({
                'string.min': 'Job description must be at least 20 characters',
                'string.max': 'Job description cannot exceed 5000 characters',
                'any.required': 'Job description is required'
            }),

        type: Joi.string()
            .valid('freelance', 'part-time', 'contract', 'full-time')
            .required()
            .messages({
                'any.only': 'Job type must be freelance, part-time, contract, or full-time',
                'any.required': 'Job type is required'
            }),

        category: Joi.string()
            .trim()
            .max(100)
            .required()
            .messages({
                'string.max': 'Category cannot exceed 100 characters',
                'any.required': 'Category is required'
            }),

        budget: Joi.number()
            .positive()
            .required()
            .messages({
                'number.positive': 'Budget must be greater than 0',
                'any.required': 'Budget is required'
            }),

        duration: Joi.string()
            .trim()
            .max(100)
            .required()
            .messages({
                'string.max': 'Duration cannot exceed 100 characters',
                'any.required': 'Duration is required'
            }),

        deadline: Joi.date().greater('now').messages({
            'date.greater': 'Deadline must be in the future'
        }),

        requirements: Joi.array().items(
            Joi.string().trim().max(500)
        ).max(10),

        attachments: Joi.array().items(Joi.string().trim()).max(5)
    }),
    updateJob: Joi.object({
        title: Joi.string().trim().min(5).max(200), // ตรวจสอบความยาว title
        description: Joi.string().trim().min(20).max(5000), // ตรวจสอบความยาว description
        category: Joi.string().trim().max(100), // ตรวจสอบความยาว category
        budget: Joi.number().positive(), // budget ต้องเป็นจำนวนบวก
        duration: Joi.string().trim().max(100), // ตรวจสอบความยาว duration
        deadline: Joi.date().greater('now'), // ตรวจสอบว่า deadline ต้องเป็นอนาคต
        requirements: Joi.array().items(Joi.string().trim().max(500)).max(10), // ตรวจสอบ requirements
        attachments: Joi.array().items(Joi.string().trim()).max(5), // ตรวจสอบ attachments
        status: Joi.string().valid('active', 'closed', 'cancelled') // ตรวจสอบ status ต้องเป็นค่าที่กำหนด
    }),

    jobQuery: Joi.object({
        ...commonSchemas.pagination.describe().keys, // นำ schema pagination มาผสม
        ...commonSchemas.searchFilter.describe().keys, // นำ searchFilter มาผสม
        minBudget: Joi.number().positive(), // ตรวจสอบ minBudget
        maxBudget: Joi.number().positive(), // ตรวจสอบ maxBudget
        employerId: commonSchemas.objectId, // ตรวจสอบ employerId เป็น ObjectId
        workerId: commonSchemas.objectId // ตรวจสอบ workerId เป็น ObjectId
    }),

    applyJob: Joi.object({
        coverLetter: Joi.string()
            .trim()
            .min(10)
            .max(1000)
            .required()
            .messages({
                'string.min': 'Cover letter must be at least 10 characters',
                'string.max': 'Cover letter cannot exceed 1000 characters',
                'any.required': 'Cover letter is required'
            }),

        proposedBudget: Joi.number().positive(), // ตรวจสอบ proposedBudget เป็นบวก
        estimatedDuration: Joi.string().trim().max(100), // ตรวจสอบ estimatedDuration
        attachments: Joi.array().items(Joi.string().trim()).max(3) // ตรวจสอบ attachments
    })
};

// Milestone validation schemas
export const milestoneSchemas = {
    createMilestone: Joi.object({
        jobId: commonSchemas.objectId.required(), // ตรวจสอบ jobId ต้องมีค่า
        title: Joi.string()
            .trim()
            .min(3)
            .max(200)
            .required()
            .messages({
                'string.min': 'Milestone title must be at least 3 characters',
                'string.max': 'Milestone title cannot exceed 200 characters',
                'any.required': 'Milestone title is required'
            }),

        description: Joi.string().trim().max(1000), // ตรวจสอบ description
        amount: Joi.number()
            .positive()
            .required()
            .messages({
                'number.positive': 'Amount must be greater than 0',
                'any.required': 'Amount is required'
            }),

        dueDate: Joi.date().greater('now').messages({
            'date.greater': 'Due date must be in the future'
        })
    }),

    updateMilestone: Joi.object({
        title: Joi.string().trim().min(3).max(200),
        description: Joi.string().trim().max(1000),
        amount: Joi.number().positive(),
        dueDate: Joi.date().greater('now'),
        status: Joi.string().valid('unpaid', 'in_progress', 'completed', 'paid') // ตรวจสอบ status
    })
};

// Transaction validation schemas
export const transactionSchemas = {
    createTransaction: Joi.object({
        type: Joi.string()
            .valid('job_payment', 'milestone_payment', 'payroll', 'refund', 'bonus')
            .required(), // ตรวจสอบ type ต้องเป็นค่าที่กำหนด

        to: commonSchemas.objectId.required(), // ตรวจสอบผู้รับ

        amount: Joi.number()
            .positive()
            .required()
            .messages({
                'number.positive': 'Amount must be greater than 0',
                'any.required': 'Amount is required'
            }),

        jobId: commonSchemas.objectId,
        milestoneId: commonSchemas.objectId,
        payrollId: commonSchemas.objectId,
        description: Joi.string().trim().max(500) // รายละเอียดเพิ่มเติม
    }),

    transactionQuery: Joi.object({
        ...commonSchemas.pagination.describe().keys,
        type: Joi.string().valid('job_payment', 'milestone_payment', 'payroll', 'refund', 'bonus'),
        status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled'),
        direction: Joi.string().valid('sent', 'received', 'all').default('all') // กำหนด default direction
    })
};

// Message validation schemas
export const messageSchemas = {
    sendMessage: Joi.object({
        toUserId: commonSchemas.objectId.required(), // ต้องระบุผู้รับ
        jobId: commonSchemas.objectId, // jobId เป็น optional

        message: Joi.string()
            .trim()
            .min(1)
            .max(2000)
            .required()
            .messages({
                'string.min': 'Message cannot be empty',
                'string.max': 'Message cannot exceed 2000 characters',
                'any.required': 'Message is required'
            }),

        messageType: Joi.string()
            .valid('text', 'file', 'image')
            .default('text'), // กำหนดค่า default เป็น text

        attachment: Joi.string().trim() // สำหรับไฟล์แนบ
    }),

    messageQuery: Joi.object({
        ...commonSchemas.pagination.describe().keys,
        withUserId: commonSchemas.objectId,
        jobId: commonSchemas.objectId,
        search: Joi.string().trim().min(1).max(100),
        read: Joi.boolean() // filter ตาม read status
    }),

    markAsRead: Joi.object({
        messageIds: Joi.array()
            .items(commonSchemas.objectId)
            .min(1)
            .required()
            .messages({
                'array.min': 'At least one message ID is required',
                'any.required': 'Message IDs are required'
            })
    })
};

// Notification validation schemas
export const notificationSchemas = {
    notificationQuery: Joi.object({
        ...commonSchemas.pagination.describe().keys,
        type: Joi.array().items(
            Joi.string().valid('job', 'milestone', 'payment', 'chat', 'system') // กรองตามประเภท
        ),
        read: Joi.boolean() // filter ตาม read status
    }),

    markAsRead: Joi.object({
        notificationIds: Joi.array()
            .items(commonSchemas.objectId)
            .min(1)
            .messages({
                'array.min': 'At least one notification ID is required'
            }),

        type: Joi.string().valid('job', 'milestone', 'payment', 'chat', 'system')
    })
};

// Wallet validation schemas
export const walletSchemas = {
    updateBalance: Joi.object({
        amount: Joi.number()
            .required()
            .messages({
                'any.required': 'Amount is required'
            }),

        operation: Joi.string()
            .valid('add', 'subtract')
            .default('add'), // กำหนด default เป็น add

        description: Joi.string().trim().max(500) // รายละเอียด
    })
};

// File upload validation
export const fileSchemas = {
    upload: Joi.object({
        fieldname: Joi.string().required(), // ชื่อ field ของไฟล์
        originalname: Joi.string().required(), // ชื่อไฟล์เดิม
        mimetype: Joi.string().required(), // ประเภทไฟล์
        size: Joi.number().max(5 * 1024 * 1024) // จำกัดขนาดสูงสุด 5MB
    })
};

// Custom validation functions
export const customValidators = {
    /**
     * Validate if user can perform action on resource
     * ตรวจสอบสิทธิ์การเข้าถึง resource เช่น job, milestone, transaction
     */
    validateResourceAccess: (resourceType: 'job' | 'milestone' | 'transaction') => {
        return async (req: any, res: Response, next: NextFunction): Promise<void> => {
            try {
                const resourceId = req.params.id; // ดึง id ของ resource จาก params
                const userId = req.user?._id?.toString(); // ดึง userId ของผู้ทำ action

                if (!resourceId || !userId) { // ถ้าไม่มี id หรือ userId
                    responseHelper.error(res, 'Invalid request', 400);
                    return;
                }

                let hasAccess = false; // กำหนดค่าเริ่มต้นไม่มีสิทธิ์

                switch (resourceType) { // ตรวจสอบแต่ละ resource type
                    case 'job':
                        const Job = (await import('../Models/Job')).default;
                        const job = await Job.findById(resourceId); // หางานตาม id
                        hasAccess = !!(job && (
                            job.employerId.toString() === userId || // ถ้าเป็นเจ้าของงาน
                            job.workerId?.toString() === userId || // ถ้าเป็นคนทำงาน
                            job.applicants.includes(userId) // หรือเคยสมัครงาน
                        ));
                        break;

                    case 'milestone':
                        const Milestone = (await import('../Models/Message')).default;
                        const Job2 = (await import('../Models/Job')).default;
                        const milestone = await Milestone.findById(resourceId).populate('jobId'); // populate jobId
                        hasAccess = !!(milestone && (
                            (milestone.jobId as any).employerId.toString() === userId ||
                            (milestone.jobId as any).workerId?.toString() === userId
                        ));
                        break;

                    case 'transaction':
                        const Transaction = (await import('../Models/Transaction')).default;
                        const transaction = await Transaction.findById(resourceId);
                        hasAccess = !!(transaction && (
                            transaction.from.toString() === userId || // ตรวจสอบผู้ส่ง
                            transaction.to.toString() === userId    // ตรวจสอบผู้รับ
                        ));
                        break;
                }

                if (!hasAccess) { // ถ้าไม่มีสิทธิ์เข้าถึง
                    responseHelper.error(res, 'Access denied', 403);
                    return;
                }

                next(); // ถ้ามีสิทธิ์ ให้ไป middleware ต่อไป
            } catch (error) {
                responseHelper.error(res, 'Validation error', 500); // catch error
            }
        };
    },

    /**
     * Validate unique email during registration
     * ตรวจสอบว่า email ไม่ซ้ำ
     */
    validateUniqueEmail: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email } = req.body; // ดึง email จาก body
            const User = (await import('../Models/User')).default; // import model User

            const existingUser = await User.findOne({email}); // ตรวจสอบ email ซ้ำ
            if (existingUser) {
                responseHelper.error(res, 'Email already exists', 409); // ถ้าเจอ email ซ้ำ ตอบ error
                return;
            }

            next(); // ถ้าไม่ซ้ำ ไป middleware ต่อ
        } catch (error) {
            responseHelper.error(res, 'Validation error', 500);
        }
    },

    /**
     * Validate if job can be applied to
     * ตรวจสอบว่างานสามารถสมัครได้หรือไม่
     */
    validateJobApplication: async (req: any, res: Response, next: NextFunction): Promise<void> => {
        try {
            const jobId = req.params.jobId || req.params.id; // ดึง jobId
            const userId = req.user?._id?.toString(); // ดึง userId

            const Job = (await import('../Models/Job')).default;
            const job = await Job.findById(jobId); // หางานตาม id

            if (!job) { // ถ้าไม่เจองาน
                responseHelper.error(res, 'Job not found', 404);
                return;
            }

            if (!job.canUserApply(userId)) { // ตรวจสอบว่าผู้ใช้สามารถสมัครได้ไหม
                responseHelper.error(res, 'Cannot apply to this job', 400);
                return;
            }

            next(); // ถ้าผ่าน ให้ไป middleware ต่อ
        } catch (error) {
            responseHelper.error(res, 'Validation error', 500);
        }
    }
};

